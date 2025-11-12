import { WebSocketClient } from '../websocket.server';
import { CallLog } from '../../models/CallLog';
import { logger } from '../../utils/logger';
import { voicePipelineService, VoicePipelineConfig } from '../../services/voicePipeline.service';
import { openaiService, ChatMessage } from '../../services/openai.service';
import { anthropicService } from '../../services/anthropic.service';
import { deepgramService } from '../../services/deepgram.service';
import { deepgramConnectionPool } from '../../services/deepgramConnectionPool.service';
import { sarvamService } from '../../services/sarvam.service';
import { sttProviderService } from '../../services/sttProvider.service';
import { deepgramTTSService } from '../../services/deepgramTTS.service';
import { elevenlabsTTSService } from '../../services/elevenlabsTTS.service';
import { audioConverter } from '../../utils/audioConverter';
import { ragService } from '../../services/rag.service';
import { buildLLMPrompt } from '../../config/systemPrompt';
import { transcriptGenerationService } from '../../services/transcriptGeneration.service';
import { voicemailDetectionService } from '../../services/voicemailDetection.service';
import { redisConcurrencyTracker } from '../../utils/redisConcurrency.util';

/**
 * Exotel Voice WebSocket Handler
 * Handles real-time audio streaming from Exotel Voicebot applet
 *
 * ACTUAL message format from Exotel Voicebot (verified from production logs):
 * {
 *   "event": "media" | "stop",  // Note: NO "start" event in Voicebot
 *   "stream_sid": "string",     // Note: snake_case, not camelCase
 *   "sequence_number": "string",
 *   "media": {
 *     // NO "track" field in Voicebot! All media is from caller (inbound)
 *     "chunk": "string",        // audio chunk number
 *     "timestamp": "string",
 *     "payload": "string"       // base64 encoded PCM audio (16-bit, 8kHz, little-endian)
 *   },
 *   "stop": {                   // Only present when event === "stop"
 *     "call_sid": "string",
 *     "account_sid": "string",
 *     "reason": "string"
 *   }
 * }
 */

interface ExotelWebSocketMessage {
  event: 'start' | 'media' | 'stop' | 'mark';
  stream_sid?: string;        // Exotel uses snake_case
  sequence_number?: string;
  streamSid?: string;         // Keep for backward compatibility
  callSid?: string;
  mark?: {
    name: string;
  };
  media?: {
    track?: 'inbound' | 'outbound';  // Optional - not present in Voicebot
    chunk: string;
    timestamp: string;
    payload: string;           // base64 encoded PCM audio
  };
  stop?: {
    call_sid: string;
    account_sid: string;
    reason: string;
  };
}

interface VoiceSession {
  callLogId: string;
  agent: any;
  config: VoicePipelineConfig;
  audioBuffer: Buffer[];
  isProcessing: boolean;
  lastSpeechTime: number;
  firstSpeechTime?: number;  // When first audio chunk arrived (for max duration detection)
  silenceTimeout?: NodeJS.Timeout;
  streamSid?: string;  // Exotel's stream_sid for sending audio back
  sequenceNumber: number;  // Global sequence number for all audio chunks
  deepgramBuffer?: Buffer;  // Buffer for re-chunking Deepgram audio to Exotel's format
  deepgramConnection?: any;  // Deepgram live streaming connection for ultra-low latency STT (also used for Sarvam)
  sttProvider?: 'deepgram' | 'sarvam' | 'whisper' | 'auto';  // STT provider being used for this session
  userTranscript?: string;  // Accumulated transcript from Deepgram streaming
  partialTranscript?: string;  // Partial transcript (interim results)
  llmStarted?: boolean;  // Flag to track if LLM has started (for parallel processing)
  llmTriggeredOnPartial?: boolean;  // Track if LLM was triggered on partial (advanced optimization)
  earlyLLMResponse?: string;  // Buffer for LLM response started on partial transcript
  detectedLanguage?: string;  // Detected language code from Whisper transcription
  transcriptProcessTimeout?: NodeJS.Timeout;  // Timeout for processing transcript (workaround for UtteranceEnd not firing)
  audioChunkCounter?: number;  // Counter for audio chunks sent to STT (for debugging)
  // Performance timing
  timings?: {
    speechStart?: number;
    speechEnd?: number;
    sttStart?: number;
    sttEnd?: number;
    ragStart?: number;
    ragEnd?: number;
    llmStart?: number;
    llmFirstToken?: number;
    llmEnd?: number;
    ttsStart?: number;
    ttsFirstChunk?: number;
    ttsEnd?: number;
    audioSendStart?: number;
    audioSendEnd?: number;
  };
}

class ExotelVoiceHandler {
  private sessions: Map<string, VoiceSession> = new Map();
  private readonly SILENCE_THRESHOLD = 150; // 150ms - ULTRA aggressive with VAD (was 200ms)
  private readonly VAD_CHECK_INTERVAL = 100; // Check VAD every 100ms for faster detection
  private readonly MAX_SPEECH_DURATION = 8000; // 8 seconds - auto-process if speaking continuously

  /**
   * Log performance metrics for a conversation turn
   */
  private logPerformanceMetrics(session: VoiceSession, stage: string): void {
    if (!session.timings) return;

    const t = session.timings;
    const metrics: { [key: string]: number } = {};

    if (t.speechStart && t.speechEnd) {
      metrics.speechDuration = t.speechEnd - t.speechStart;
    }
    if (t.sttStart && t.sttEnd) {
      metrics.sttLatency = t.sttEnd - t.sttStart;
    }
    if (t.ragStart && t.ragEnd) {
      metrics.ragLatency = t.ragEnd - t.ragStart;
    }
    if (t.llmStart && t.llmEnd) {
      metrics.llmLatency = t.llmEnd - t.llmStart;
    }
    if (t.llmStart && t.llmFirstToken) {
      metrics.llmTTFT = t.llmFirstToken - t.llmStart; // Time To First Token
    }
    if (t.ttsStart && t.ttsEnd) {
      metrics.ttsLatency = t.ttsEnd - t.ttsStart;
    }
    if (t.ttsStart && t.ttsFirstChunk) {
      metrics.ttsTTFC = t.ttsFirstChunk - t.ttsStart; // Time To First Chunk
    }
    if (t.audioSendStart && t.audioSendEnd) {
      metrics.audioSendLatency = t.audioSendEnd - t.audioSendStart;
    }
    if (t.speechEnd && t.audioSendEnd) {
      metrics.totalLatency = t.audioSendEnd - t.speechEnd; // User stops speaking → Audio sent
    }

    logger.info(`⏱️ PERFORMANCE [${stage}]`, metrics);
  }

  /**
   * Initialize Exotel voice session
   */
  async handleConnection(client: WebSocketClient, callLogId: string): Promise<void> {
    try {

      // Get call log and agent configuration
      const callLog = await CallLog.findById(callLogId).populate('agentId');
      if (!callLog || !callLog.agentId) {
        logger.error('Call log or agent not found', { callLogId });
        client.close(1008, 'Call log not found');
        return;
      }

      const agent = callLog.agentId as any;

      // Update call status
      callLog.status = 'in-progress';
      await callLog.save();

      const callLogObjectId = callLog._id.toString();

      const config: VoicePipelineConfig = {
        agentId: agent._id.toString(),
        callLogId: callLogObjectId,
        systemPrompt: agent.config.prompt,
        voiceProvider: agent.config.voice.provider || 'openai',
        voiceId: agent.config.voice.voiceId,
        language: agent.config.language || 'en',
        enableAutoLanguageDetection: agent.config.enableAutoLanguageDetection || false,
        voiceSettings: {
          stability: agent.config.voice.settings?.stability ?? 0.5,
          similarityBoost: agent.config.voice.settings?.similarityBoost ?? 0.75,
          modelId: agent.config.voice.settings?.modelId
        },
        llmConfig: {
          model: agent.config.llm?.model,
          temperature: agent.config.llm?.temperature,
          maxTokens: agent.config.llm?.maxTokens
        }
      };

      await voicePipelineService.initializeSession(config, {
        existingTranscript: (callLog as any)?.transcript
      });

      // Initialize session
      const session: VoiceSession = {
        callLogId: callLogObjectId,
        agent,
        config,
        audioBuffer: [],
        isProcessing: false,
        lastSpeechTime: Date.now(),
        sequenceNumber: 0,
        userTranscript: '',
        partialTranscript: '',
        llmStarted: false,
        llmTriggeredOnPartial: false,
        earlyLLMResponse: '',
        timings: {}
      };

      this.sessions.set(client.id, session);
      client.callLogId = callLogObjectId;
      client.agentId = agent._id.toString();

      logger.info('📞 CALL STARTED', {
        callLogId: callLogObjectId,
        agent: agent.name,
        mode: deepgramService.isAvailable() ? 'Streaming STT (v6)' : 'Batch STT'
      });

      // Select STT provider based on agent config
      const sttSelection = sttProviderService.selectProvider(
        agent.config.language || 'en',
        agent.config.enableAutoLanguageDetection || false,
        agent.config.sttProvider || 'deepgram'
      );

      logger.info('🌍 STT Provider selected', {
        provider: sttSelection.provider,
        reason: sttSelection.reason,
        language: sttSelection.language,
        autoDetect: agent.config.enableAutoLanguageDetection,
        configuredProvider: agent.config.sttProvider || 'deepgram'
      });

      // Create STT connection based on selected provider
      if (sttSelection.provider === 'sarvam' && sarvamService.isAvailable()) {
        try {
          logger.info('📡 Creating Sarvam live connection for Indian language');

          // Create Sarvam WebSocket connection
          const sarvamConnection = await sarvamService.createLiveConnection({
            language: sttSelection.language,
            model: 'saarika:v2.5',
            sampleRate: 8000,  // Match Exotel's 8kHz
            encoding: 'pcm',
            vadEnabled: true,
            endpointing: 100,
            onTranscript: async (result) => {
                const currentSession = this.sessions.get(client.id);
                if (!currentSession) return;

                if (result.isFinal && result.text.trim().length > 0) {
                  currentSession.userTranscript = (currentSession.userTranscript || '') + ' ' + result.text;
                  logger.info('📝 FINAL TRANSCRIPT CAPTURED', {
                    clientId: client.id,
                    text: result.text,
                    accumulated: currentSession.userTranscript
                  });
                } else if (result.text.trim().length > 0) {
                  currentSession.partialTranscript = result.text;
                  logger.info('📝 PARTIAL TRANSCRIPT', {
                    clientId: client.id,
                    text: result.text
                  });

                  // Start LLM as soon as we have 3+ words (parallel processing)
                  const wordCount = result.text.trim().split(/\s+/).length;
                  if (!currentSession.llmStarted && !currentSession.isProcessing && wordCount >= 3) {
                    currentSession.llmStarted = true;
                    currentSession.llmTriggeredOnPartial = true;
                    if (!currentSession.timings!.llmStart) {
                      currentSession.timings!.llmStart = Date.now();
                    }

                    this.startEarlyLLMProcessing(client, currentSession, result.text).catch((error: any) => {
                      logger.error('Early LLM failed', { error: error.message });
                      currentSession.llmStarted = false;
                      currentSession.llmTriggeredOnPartial = false;
                    });
                  }
                }
              },
              onSpeechEnded: async () => {
                const currentSession = this.sessions.get(client.id);
                if (!currentSession || currentSession.isProcessing) return;

                currentSession.timings!.speechEnd = Date.now();

                logger.info('🎤 SPEECH ENDED - Processing transcript', {
                  clientId: client.id,
                  userTranscript: currentSession.userTranscript,
                  partialTranscript: currentSession.partialTranscript,
                  llmTriggeredOnPartial: currentSession.llmTriggeredOnPartial
                });

                if (currentSession.userTranscript && currentSession.userTranscript.trim().length > 0) {
                  currentSession.isProcessing = true;
                  await this.processUserSpeechFromTranscript(client, currentSession);
                } else {
                  logger.warn('⚠️ NO USER TRANSCRIPT TO PROCESS', {
                    clientId: client.id,
                    userTranscript: currentSession.userTranscript,
                    partialTranscript: currentSession.partialTranscript
                  });
                }
              }
            }
          );

          session.deepgramConnection = sarvamConnection;  // Store Sarvam connection (field name kept for compatibility)
          session.sttProvider = 'sarvam';  // Track that we're using Sarvam for this session

          logger.info('✅ Sarvam connection established', {
            clientId: client.id,
            language: sttSelection.language,
            model: 'saarika:v2.5'
          });
        } catch (error: any) {
          logger.error('Failed to create Sarvam connection', {
            clientId: client.id,
            error: error.message
          });
          // Will fall back to batch STT processing
        }
      } else if ((sttSelection.provider === 'deepgram' || sttSelection.provider === 'deepgram-multi') && deepgramService.isAvailable()) {
        try {
          const deepgramLanguage = sttSelection.language;

          logger.info('📡 Creating Deepgram live connection');

          // Acquire connection from pool (queues if at capacity)
          const deepgramConnection = await deepgramConnectionPool.acquireConnection(
            client.id,
            {
              endpointing: 1000,  // 1000ms (1 second) silence to trigger UtteranceEnd
              vadEvents: true,
              language: deepgramLanguage,
              onTranscript: async (result) => {
                const currentSession = this.sessions.get(client.id);
                if (!currentSession) return;

                // Capture detected language from streaming transcription
                // Allow updates per utterance (not just first detection) for mid-call language switches
                if (result.detectedLanguage) {
                  const previousLanguage = currentSession.detectedLanguage;
                  const languageChanged = previousLanguage && previousLanguage !== result.detectedLanguage;

                  currentSession.detectedLanguage = result.detectedLanguage;

                  if (languageChanged) {
                    logger.info('🔄 LANGUAGE SWITCH DETECTED (streaming)', {
                      clientId: client.id,
                      previousLanguage,
                      newLanguage: result.detectedLanguage,
                      configuredLanguage: currentSession.agent.config?.language
                    });

                    // Propagate language change to voice pipeline for TTS switching
                    if (currentSession.callLogId) {
                      await voicePipelineService.updateDetectedLanguage(
                        currentSession.callLogId,
                        result.detectedLanguage,
                        result.confidence || 0.9
                      );
                    }
                  } else if (!previousLanguage) {
                    logger.info('🌐 LANGUAGE DETECTED (streaming)', {
                      clientId: client.id,
                      detectedLanguage: result.detectedLanguage,
                      configuredLanguage: currentSession.agent.config?.language
                    });

                    // Initialize language in voice pipeline
                    if (currentSession.callLogId) {
                      await voicePipelineService.updateDetectedLanguage(
                        currentSession.callLogId,
                        result.detectedLanguage,
                        result.confidence || 0.9
                      );
                    }
                  }
                }

                if (result.isFinal && result.text.trim().length > 0) {
                  currentSession.userTranscript = (currentSession.userTranscript || '') + ' ' + result.text;
                  logger.info('📝 FINAL TRANSCRIPT CAPTURED', {
                    clientId: client.id,
                    text: result.text,
                    accumulated: currentSession.userTranscript,
                    detectedLanguage: result.detectedLanguage
                  });

                  // WORKAROUND: UtteranceEnd event is not firing reliably in Deepgram SDK
                  // Process transcript after 1000ms delay (to accumulate multiple finals)
                  if (currentSession.transcriptProcessTimeout) {
                    clearTimeout(currentSession.transcriptProcessTimeout);
                  }
                  currentSession.transcriptProcessTimeout = setTimeout(async () => {
                    const session = this.sessions.get(client.id);
                    if (session && !session.isProcessing && session.userTranscript && session.userTranscript.trim().length > 0) {
                      logger.info('🎤 PROCESSING TRANSCRIPT (timeout-based, UtteranceEnd not firing)', {
                        clientId: client.id,
                        userTranscript: session.userTranscript
                      });
                      session.isProcessing = true;
                      await this.processUserSpeechFromTranscript(client, session);
                    }
                  }, 1000);
                } else if (result.text.trim().length > 0) {
                  currentSession.partialTranscript = result.text;
                  logger.info('📝 PARTIAL TRANSCRIPT', {
                    clientId: client.id,
                    text: result.text
                  });

                  // Start LLM as soon as we have 3+ words (parallel processing)
                  const wordCount = result.text.trim().split(/\s+/).length;
                  if (!currentSession.llmStarted && !currentSession.isProcessing && wordCount >= 3) {
                    currentSession.llmStarted = true;
                    currentSession.llmTriggeredOnPartial = true;
                    if (!currentSession.timings!.llmStart) {
                      currentSession.timings!.llmStart = Date.now();
                    }

                    this.startEarlyLLMProcessing(client, currentSession, result.text).catch((error: any) => {
                      logger.error('Early LLM failed', { error: error.message });
                      currentSession.llmStarted = false;
                      currentSession.llmTriggeredOnPartial = false;
                    });
                  }
                }
              },
              onSpeechEnded: async () => {
                const currentSession = this.sessions.get(client.id);
                if (!currentSession || currentSession.isProcessing) return;

                currentSession.timings!.speechEnd = Date.now();

                logger.info('🎤 SPEECH ENDED - Processing transcript', {
                  clientId: client.id,
                  userTranscript: currentSession.userTranscript,
                  partialTranscript: currentSession.partialTranscript,
                  llmTriggeredOnPartial: currentSession.llmTriggeredOnPartial
                });

                if (currentSession.userTranscript && currentSession.userTranscript.trim().length > 0) {
                  currentSession.isProcessing = true;
                  await this.processUserSpeechFromTranscript(client, currentSession);
                } else {
                  logger.warn('⚠️ NO USER TRANSCRIPT TO PROCESS', {
                    clientId: client.id,
                    userTranscript: currentSession.userTranscript,
                    partialTranscript: currentSession.partialTranscript
                  });
                }
              }
            }
          );

          session.deepgramConnection = deepgramConnection;
          session.sttProvider = 'deepgram';  // Track that we're using Deepgram for this session

          logger.info('✅ Deepgram connection acquired from pool', {
            clientId: client.id,
            poolStats: deepgramConnectionPool.getStats()
          });
        } catch (error: any) {
          logger.error('Failed to acquire Deepgram connection from pool', {
            clientId: client.id,
            error: error.message,
            poolStats: deepgramConnectionPool.getStats()
          });
          // Fall back to batch STT processing if pool is exhausted
        }
      }

      // Send welcome message and first greeting
      await this.sendGreeting(client, session);

    } catch (error: any) {
      logger.error('Init failed', {
        clientId: client.id,
        callLogId,
        error: error.message
      });
      client.close(1011, 'Failed to initialize session');
    }
  }

  /**
   * Handle incoming messages from Exotel
   */
  async handleMessage(client: WebSocketClient, data: Buffer): Promise<void> {
    const session = this.sessions.get(client.id);
    if (!session) {
      // Session deleted - silently ignore (happens after disconnect)
      return;
    }

    try {
      // Parse Exotel message
      const message: ExotelWebSocketMessage = JSON.parse(data.toString());

      // Debug: Log all incoming Exotel events
      logger.debug('Exotel WebSocket event received', {
        event: message.event,
        hasMedia: !!message.media,
        mediaSize: message.media?.payload?.length || 0,
        streamSid: message.stream_sid || message.streamSid
      });

      switch (message.event) {
        case 'start':
          await this.handleStart(client, session, message);
          break;

        case 'media':
          await this.handleMedia(client, session, message);
          break;

        case 'stop':
          await this.handleStop(client, session, message);
          break;

        case 'mark':
          await this.handleMark(client, session, message);
          break;
      }
    } catch (error: any) {
      logger.error('Error handling Exotel message', {
        clientId: client.id,
        error: error.message
      });
    }
  }

  /**
   * Handle stream start event
   */
  private async handleStart(
    client: WebSocketClient,
    session: VoiceSession,
    message: ExotelWebSocketMessage
  ): Promise<void> {
    const streamSid = message.stream_sid || message.streamSid;
    const callSid = message.callSid;

    

    // Store streamSid in session for sending audio back
    session.streamSid = streamSid;

    // Update call log with stream info
    await CallLog.findByIdAndUpdate(session.callLogId, {
      $set: {
        'metadata.streamSid': streamSid,
        'metadata.exotelCallSid': callSid
      }
    });
  }

  /**
   * Handle incoming audio media from caller
   */
  private async handleMedia(
    client: WebSocketClient,
    session: VoiceSession,
    message: ExotelWebSocketMessage
  ): Promise<void> {
    if (!message.media) {
      
      return;
    }

    // Store streamSid from first media event (Voicebot doesn't send "start" event)
    if (!session.streamSid && (message.stream_sid || message.streamSid)) {
      session.streamSid = message.stream_sid || message.streamSid;
      
    }

    // Exotel's actual format doesn't include "track" field for Voicebot applet
    // All media events in Voicebot are bidirectional (from caller)
    // If track field exists and is "outbound", skip it (for future compatibility)
    if (message.media.track && message.media.track === 'outbound') {
      
      return;
    }

    // Decode base64 audio payload (16-bit PCM, 8kHz, mono, little-endian)
    const audioChunk = Buffer.from(message.media.payload, 'base64');

    // Send audio to STT streaming connection for real-time transcription
    if (session.deepgramConnection) {
      try {
        // Check if this is a Sarvam connection (indicated by STT provider)
        if (session.sttProvider === 'sarvam') {
          // Sarvam expects AudioContent object with data, encoding, and sample_rate
          // encoding must be "audio/wav" per validation error
          const audioMessage = {
            audio: {
              data: audioChunk.toString('base64'),
              encoding: "audio/wav",  // Sarvam requires "audio/wav" format
              sample_rate: 8000  // Exotel sends 8kHz audio
            }
          };
          const jsonMessage = JSON.stringify(audioMessage);
          session.deepgramConnection.send(jsonMessage);

          // Log audio chunks for debugging (only log every 50th chunk to reduce noise)
          if (!session.audioChunkCounter) session.audioChunkCounter = 0;
          session.audioChunkCounter++;

          if (session.audioChunkCounter === 1 || session.audioChunkCounter % 50 === 0) {
            logger.debug('Sending audio to Sarvam', {
              chunkNumber: session.audioChunkCounter,
              audioSize: audioChunk.length,
              base64Length: audioMessage.audio.data.length,
              messageLength: jsonMessage.length,
              encoding: audioMessage.audio.encoding,
              sampleRate: audioMessage.audio.sample_rate
            });
          }
        } else {
          // Deepgram accepts raw audio bytes
          session.deepgramConnection.send(audioChunk);
        }
      } catch (error: any) {
        logger.error('Failed to send audio to STT stream', {
          error: error.message,
          provider: session.sttProvider
        });
        // Fall back to buffer accumulation
        session.audioBuffer.push(audioChunk);
      }
    } else {
      // No streaming connection - accumulate in buffer for batch processing
      session.audioBuffer.push(audioChunk);
    }

    const now = Date.now();
    session.lastSpeechTime = now;

    // Track when speech started (for max duration detection)
    if (!session.firstSpeechTime) {
      session.firstSpeechTime = now;
      session.timings!.speechStart = now;
    }

    // Check if we've been receiving audio for too long (user speaking continuously or background noise)
    const speechDuration = now - session.firstSpeechTime;
    if (speechDuration > this.MAX_SPEECH_DURATION && !session.isProcessing) {
      logger.info('⏱️ MAX DURATION REACHED (v3) - auto-processing', {
        duration: `${speechDuration}ms`,
        bufferSize: session.audioBuffer.length
      });

      // Clear silence timeout
      if (session.silenceTimeout) {
        clearTimeout(session.silenceTimeout);
        session.silenceTimeout = undefined;
      }

      // Reset first speech time for next turn
      session.firstSpeechTime = undefined;

      // Mark as processing immediately
      session.isProcessing = true;

      // Process in background (no holding message)
      this.processUserSpeech(client, session).catch((error) => {
        logger.error('Error processing speech after max duration', {
          clientId: client.id,
          error: error.message
        });
      });

      return; // Don't set silence timeout
    }

    // Clear existing silence timeout
    if (session.silenceTimeout) {
      clearTimeout(session.silenceTimeout);
    }

    // Set new silence timeout (only if not already processing)
    // Note: For Deepgram VAD, use live streaming connection instead
    if (!session.isProcessing) {
      session.silenceTimeout = setTimeout(async () => {
        const silenceDetectedAt = Date.now();
        const timeSinceLastSpeech = silenceDetectedAt - session.lastSpeechTime;

        

        // Reset first speech time for next turn
        session.firstSpeechTime = undefined;

        // Mark as processing
        session.isProcessing = true;

        // Process user speech directly (no holding message)
        await this.processUserSpeech(client, session);
      }, this.SILENCE_THRESHOLD);
    }
  }

  /**
   * Handle stream stop event
   */
  private async handleStop(
    client: WebSocketClient,
    session: VoiceSession,
    message: ExotelWebSocketMessage
  ): Promise<void> {
    

    // Process any remaining audio
    if (session.audioBuffer.length > 0 && !session.isProcessing) {
      // CRITICAL: Set isProcessing IMMEDIATELY to prevent session deletion
      session.isProcessing = true;

      

      // Process in background (no holding message)
      this.processUserSpeech(client, session).catch((error) => {
        logger.error('Error processing final speech on stop', {
          clientId: client.id,
          error: error.message
        });
      });
    } else {
      
    }

    // DON'T mark call as completed here - stop just means "user stopped speaking"
    // The call is only completed when WebSocket disconnects (handled in handleDisconnect)
    
  }

  /**
   * Handle mark event from Exotel
   * This signals that Exotel has finished processing/playing the audio we sent
   */
  private async handleMark(
    client: WebSocketClient,
    session: VoiceSession,
    message: ExotelWebSocketMessage
  ): Promise<void> {
    const markName = message.mark?.name;
    
    // Mark received means Exotel finished playing our audio
    // Session is now ready for user input automatically
  }

  /**
   * Send AI greeting to caller
   */
  private async sendGreeting(client: WebSocketClient, session: VoiceSession): Promise<void> {
    try {
      const { agent, config, callLogId } = session;
      // Use new greetingMessage field, fallback to firstMessage, then default
      const greeting = agent.config?.greetingMessage || agent.config?.firstMessage || 'Hello! How can I help you today?';

      

      let audioDurationMs = 0;

      // Use streaming for Deepgram, non-streaming for others
      if (config.voiceProvider === 'deepgram') {
        // Stream with Deepgram for ultra-low latency
        audioDurationMs = await this.streamTTSToExotel(client, greeting, session);
      } else {
        // Generate audio using TTS for other providers
        const audioBuffer = await voicePipelineService.generateFirstMessage(
          greeting,
          config
        );

        

        // OpenAI/ElevenLabs return MP3 - need conversion
        await this.sendAudioToExotel(client, audioBuffer, session.streamSid);
        audioDurationMs = (audioBuffer.length / 16000) * 1000;
      }

      

      // Save to transcript
      await this.saveTranscript(callLogId, 'assistant', greeting);

      // Send MARK event to get notified when Exotel finishes playing
      // This is the correct way per Exotel docs - NOT "clear"!
      try {
        const markMessage = {
          event: 'mark',
          stream_sid: session.streamSid || client.id,
          mark: {
            name: `greeting_${Date.now()}`
          }
        };
        client.send(JSON.stringify(markMessage));
        
      } catch (error: any) {
        
      }

    } catch (error: any) {
      logger.error('❌ GREETING FAILED (v13)', {
        clientId: client.id,
        error: error.message,
        stack: error.stack
      });
    }
  }

  /**
   * Start early LLM processing based on partial transcript (PARALLEL PROCESSING)
   * This is called as soon as we have 3+ words, while user is still speaking!
   * Ultra-low latency optimization - LLM starts before user finishes speaking
   */
  private async startEarlyLLMProcessing(
    client: WebSocketClient,
    session: VoiceSession,
    partialTranscript: string
  ): Promise<void> {
    try {
      

      // Get conversation history
      const conversationHistory = await this.getConversationHistoryMessages(session.callLogId);

      // Get agent persona
      const agentPersona = session.agent.config.persona || session.agent.config.prompt;

      // For early LLM, we skip RAG to reduce latency (RAG will be done on final transcript if needed)
      // This is a trade-off: faster response vs less context
      // You can enable RAG here if needed, but it adds ~200-500ms

      // Build system prompt (without RAG for speed)
      const activeLanguage = session.detectedLanguage || session.agent.config?.language || 'en';
      const systemPrompt = buildLLMPrompt({
        agentPersona,
        ragContext: undefined,  // Skip RAG for early LLM to maximize speed
        language: activeLanguage,
        enableAutoLanguageDetection: session.agent.config?.enableAutoLanguageDetection
      });

      // Prepare messages with PARTIAL transcript
      const messages: ChatMessage[] = [
        { role: 'system', content: systemPrompt },
        ...conversationHistory,
        { role: 'user', content: partialTranscript }  // Using partial transcript!
      ];

      // Determine which LLM service to use
      const model = session.agent.config?.llm?.model || 'gpt-4o-mini';
      const isClaude = model.startsWith('claude-');

      // Get streaming generator
      const streamGenerator = isClaude && anthropicService.isAvailable()
        ? anthropicService.getChatCompletionStream(
            messages as any,
            {
              model,
              temperature: session.agent.config?.llm?.temperature || 0.7,
              maxTokens: session.agent.config?.llm?.maxTokens,
              systemPrompt
            }
          )
        : openaiService.getChatCompletionStream(messages, {
            model,
            temperature: session.agent.config?.llm?.temperature || 0.7,
            maxTokens: session.agent.config?.llm?.maxTokens
          });

      let earlyResponse = '';
      let sentenceBuffer = '';
      const sentenceEnders = ['.', '!', '?', '\n'];
      let firstToken = false;

      if (!session.timings!.ttsStart) {
        session.timings!.ttsStart = Date.now();
      }

      // Stream the LLM response
      for await (const chunk of streamGenerator) {
        if (!firstToken) {
          session.timings!.llmFirstToken = Date.now();
          firstToken = true;
        }

        earlyResponse += chunk;
        sentenceBuffer += chunk;

        // Store early response in session
        session.earlyLLMResponse = earlyResponse;

        // Check if we have a complete sentence
        const lastChar = sentenceBuffer.trim().slice(-1);
        if (sentenceEnders.includes(lastChar) && sentenceBuffer.trim().length > 10) {
          const sentence = sentenceBuffer.trim();

          if (!session.timings!.ttsFirstChunk) {
            session.timings!.ttsFirstChunk = Date.now();
          }



          // Synthesize and stream sentence immediately
          if (session.config.voiceProvider === 'deepgram') {
            await this.streamTTSToExotel(client, sentence, session);
          } else {
            const audioResponse = await voicePipelineService.synthesizeText(
              sentence,
              session.config
            );
            await this.sendAudioToExotel(client, audioResponse, session.streamSid);
          }

          // Clear sentence buffer
          sentenceBuffer = '';
        }
      }

      // Send any remaining text in buffer
      if (sentenceBuffer.trim().length > 0) {
        if (session.config.voiceProvider === 'deepgram') {
          await this.streamTTSToExotel(client, sentenceBuffer.trim(), session);
        } else {
          const audioResponse = await voicePipelineService.synthesizeText(
            sentenceBuffer.trim(),
            session.config
          );
          await this.sendAudioToExotel(client, audioResponse, session.streamSid);
        }
      }

      session.timings!.llmEnd = Date.now();
      session.timings!.ttsEnd = Date.now();
      session.timings!.audioSendEnd = Date.now();

      // Log performance metrics for early LLM
      this.logPerformanceMetrics(session, 'Early LLM (Parallel)');

      // Save to transcript (this is the AI's response to the partial transcript)
      await this.saveTranscript(session.callLogId, 'assistant', earlyResponse);

      // Send MARK event
      try {
        const markMessage = {
          event: 'mark',
          stream_sid: session.streamSid || client.id,
          mark: {
            name: `early_response_${Date.now()}`
          }
        };
        client.send(JSON.stringify(markMessage));
      } catch (error: any) {
        // Ignore mark errors
      }

    } catch (error: any) {
      logger.error('Error in early LLM processing', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    } finally {
      // Reset flags when early processing completes
      session.llmStarted = false;
      session.isProcessing = false;
    }
  }

  /**
   * Process user speech from streaming transcript (Deepgram VAD)
   * This is the ULTRA-LOW LATENCY path - no STT needed!
   */
  private async processUserSpeechFromTranscript(
    client: WebSocketClient,
    session: VoiceSession
  ): Promise<void> {
    logger.info('🔄 PROCESSING USER SPEECH FROM TRANSCRIPT', {
      callLogId: session.callLogId,
      userTranscript: session.userTranscript,
      llmTriggeredOnPartial: session.llmTriggeredOnPartial,
      earlyLLMResponse: session.earlyLLMResponse ? 'exists' : 'none'
    });

    try {
      const transcript = (session.userTranscript || '').trim();

      if (!transcript || transcript.length === 0) {
        logger.warn('⚠️ EMPTY TRANSCRIPT - Skipping save', {
          callLogId: session.callLogId,
          userTranscript: session.userTranscript
        });
        session.isProcessing = false;
        return;
      }

      // Check if early LLM was already triggered on partial transcript
      if (session.llmTriggeredOnPartial && session.earlyLLMResponse) {
        

        // Early LLM already handled this - just update transcript and reset flags
        await this.saveTranscript(session.callLogId, 'user', transcript);

        // Reset flags for next turn
        session.userTranscript = '';
        session.partialTranscript = '';
        session.llmTriggeredOnPartial = false;
        session.earlyLLMResponse = '';
        session.isProcessing = false;

        
        return;
      }

      // Clear transcript for next turn
      session.userTranscript = '';
      session.partialTranscript = '';



      // Save user transcript
      await this.saveTranscript(session.callLogId, 'user', transcript);

      // VOICEMAIL DETECTION: Check if this is a voicemail greeting
      // Calculate call duration from first speech time
      const callDurationSeconds = session.firstSpeechTime
        ? (Date.now() - session.firstSpeechTime) / 1000
        : 0;

      try {
        const voicemailConfig = session.agent.config?.voicemailDetection || {};
        const enableVoicemailDetection = voicemailConfig.enabled !== false; // Default: true
        const minDetectionTime = voicemailConfig.minDetectionTime || 3; // Default: 3 seconds
        const confidenceThreshold = voicemailConfig.confidenceThreshold || 0.7; // Default: 0.7

        if (enableVoicemailDetection) {
          // Configure detection service with agent settings
          if (voicemailConfig.keywords) {
            voicemailDetectionService.updateConfig({
              voicemailKeywords: voicemailConfig.keywords,
              confidenceThreshold
            });
          }

          const detectionResult = await voicemailDetectionService.detectRealtime(
            transcript,
            callDurationSeconds,
            minDetectionTime
          );

          logger.info('🎯 Voicemail detection result', {
            callLogId: session.callLogId,
            isVoicemail: detectionResult.isVoicemail,
            confidence: detectionResult.confidence,
            matchedKeywords: detectionResult.matchedKeywords,
            callDurationSeconds,
            detectionTimeSeconds: detectionResult.detectionTimeSeconds
          });

          if (detectionResult.isVoicemail) {
            logger.warn('📞 VOICEMAIL DETECTED - Terminating call immediately', {
              callLogId: session.callLogId,
              confidence: detectionResult.confidence,
              matchedKeywords: detectionResult.matchedKeywords,
              callDurationSeconds
            });

            // Update CallLog with voicemail detection metadata
            const vmCallLog = await CallLog.findByIdAndUpdate(session.callLogId, {
              status: 'completed',
              failureReason: 'voicemail',
              outboundStatus: 'voicemail',
              endedAt: new Date(),
              metadata: {
                voicemailDetected: true,
                voicemailConfidence: detectionResult.confidence,
                voicemailKeywords: detectionResult.matchedKeywords,
                detectionTimestamp: detectionResult.timestamp,
                detectionTimeSeconds: detectionResult.detectionTimeSeconds,
                callDurationAtDetection: callDurationSeconds
              }
            }, { new: true });

            // Release concurrent slot if call was part of a campaign
            if (vmCallLog && vmCallLog.metadata?.isCampaignCall && vmCallLog.metadata?.callId) {
              const campaignId = vmCallLog.metadata.campaignId;
              const callId = vmCallLog.metadata.callId;

              try {
                // Use force release (no token check) to avoid metadata race conditions
                const result = await redisConcurrencyTracker.forceReleaseSlot(
                  campaignId,
                  callId,
                  true  // publish = true
                );

                if (result > 0) {
                  logger.info('✅ WebSocket force-released Redis slot (voicemail)', {
                    campaignId,
                    callId,
                    callLogId: session.callLogId,
                    type: result === 1 ? 'active' : 'pre-dial'
                  });
                } else {
                  logger.warn('⚠️ WebSocket found no slot to release (voicemail)', {
                    campaignId,
                    callId,
                    callLogId: session.callLogId
                  });
                }
              } catch (error: any) {
                logger.error('Failed to release Redis slot from WebSocket (voicemail)', {
                  error: error.message,
                  callLogId: session.callLogId
                });
              }
            }

            // Immediately close the call to save costs
            session.isProcessing = false;
            client.close(1000, 'Voicemail detected');
            return;
          }
        }
      } catch (error: any) {
        logger.error('❌ Voicemail detection failed', {
          callLogId: session.callLogId,
          error: error.message
        });
        // Continue with normal flow if detection fails
      }

      // Check for end call phrases
      if (this.shouldEndCall(transcript, session.agent.config.endCallPhrases)) {


        // Send polite goodbye and end call
        const goodbyeMessage = 'Thank you for calling! Have a great day. Goodbye!';
        await this.sendFinalResponse(client, goodbyeMessage, session);
        await this.saveTranscript(session.callLogId, 'assistant', goodbyeMessage);

        // Close the call
        session.isProcessing = false;
        client.close(1000, 'Call ended by user');
        return;
      }

      // Get conversation history and prepare for LLM
      const conversationHistory = await this.getConversationHistoryMessages(session.callLogId);

      // Get agent persona (prefer new 'persona' field, fallback to 'prompt' for backward compatibility)
      const agentPersona = session.agent.config.persona || session.agent.config.prompt;

      

      // RAG: Query knowledge base if query is relevant
      let ragContextFormatted: string | undefined;

      if (ragService.isQueryRelevantForKB(transcript)) {
        try {
          

          const ragContext = await ragService.queryKnowledgeBase(
            transcript,
            session.agent._id.toString(),
            {
              topK: 3,  // Limit to 3 chunks for phone conversations (keep context short)
              minScore: 0.7,
              maxContextLength: 2000  // ~500 tokens max for phone context
            }
          );

          if (ragContext.chunks.length > 0) {
            

            // Format RAG context for LLM
            ragContextFormatted = ragService.formatContextForLLM(ragContext);
          } else {
            
          }
        } catch (error: any) {
          logger.error('❌ RAG: Failed to query knowledge base', {
            error: error.message
          });
          // Continue without RAG context - don't fail the entire call
        }
      } else {
        
      }

      // Determine active language from session (detected or configured)
      const activeLanguage = session.detectedLanguage || session.agent.config?.language || 'en';

      // Build complete system prompt: Global Rules + Agent Persona + RAG Context + Language
      const systemPrompt = buildLLMPrompt({
        agentPersona,
        ragContext: ragContextFormatted,
        language: activeLanguage,
        enableAutoLanguageDetection: session.agent.config?.enableAutoLanguageDetection
      });

      

      // ALWAYS include system prompt at the start (it's not in conversationHistory)
      // Format: System Prompt + Chat History + Current User Message
      const messages: ChatMessage[] = [
        { role: 'system', content: systemPrompt },
        ...conversationHistory,
        { role: 'user', content: transcript }
      ];

      // Generate AI response using LLM with streaming

      let fullResponse = '';
      let sentenceBuffer = '';
      const sentenceEnders = ['.', '!', '?', '\n'];

      // Determine which LLM service to use based on model
      const model = session.agent.config?.llm?.model || 'gpt-4o-mini';
      const isClaude = model.startsWith('claude-');

      // Get streaming generator based on model type
      const streamGenerator = isClaude && anthropicService.isAvailable()
        ? anthropicService.getChatCompletionStream(
            messages as any,
            {
              model,
              temperature: session.agent.config?.llm?.temperature || 0.7,
              maxTokens: session.agent.config?.llm?.maxTokens,
              systemPrompt  // Use the built system prompt for Claude
            }
          )
        : openaiService.getChatCompletionStream(messages, {
            model,
            temperature: session.agent.config?.llm?.temperature || 0.7,
            maxTokens: session.agent.config?.llm?.maxTokens
          });

      // Track total audio duration to wait before sending "clear"
      let totalAudioDurationMs = 0;

      // Stream the LLM response and process sentence-by-sentence
      for await (const chunk of streamGenerator) {
        fullResponse += chunk;
        sentenceBuffer += chunk;

        // Check if we have a complete sentence
        const lastChar = sentenceBuffer.trim().slice(-1);
        if (sentenceEnders.includes(lastChar) && sentenceBuffer.trim().length > 10) {
          const sentence = sentenceBuffer.trim();

          // Synthesize and stream sentence with ULTRA-LOW LATENCY
          // Deepgram streaming TTS: Send audio chunks as they're generated (sub-200ms TTFB!)
          if (session.config.voiceProvider === 'deepgram') {
            const audioDurationMs = await this.streamTTSToExotel(client, sentence, session);
            totalAudioDurationMs += audioDurationMs;
          } else {
            // Non-streaming fallback for OpenAI/ElevenLabs
            const audioResponse = await voicePipelineService.synthesizeText(
              sentence,
              session.config
            );
            await this.sendAudioToExotel(client, audioResponse, session.streamSid);
            totalAudioDurationMs += (audioResponse.length / 16000) * 1000;
          }

          // Clear sentence buffer
          sentenceBuffer = '';
        }
      }

      // Send any remaining text in buffer
      if (sentenceBuffer.trim().length > 0) {
        // Use streaming TTS for remaining buffer too
        if (session.config.voiceProvider === 'deepgram') {
          const audioDurationMs = await this.streamTTSToExotel(client, sentenceBuffer.trim(), session);
          totalAudioDurationMs += audioDurationMs;
        } else {
          const audioResponse = await voicePipelineService.synthesizeText(
            sentenceBuffer.trim(),
            session.config
          );
          await this.sendAudioToExotel(client, audioResponse, session.streamSid);
          totalAudioDurationMs += (audioResponse.length / 16000) * 1000;
        }
      }

      

      // Save complete AI response to transcript
      await this.saveTranscript(session.callLogId, 'assistant', fullResponse);

      // Send MARK event to get notified when Exotel finishes playing
      try {
        const markMessage = {
          event: 'mark',
          stream_sid: session.streamSid || client.id,
          mark: {
            name: `response_${Date.now()}`
          }
        };
        client.send(JSON.stringify(markMessage));
      } catch (error: any) {
        // Ignore mark errors
      }

      // Log final performance metrics
      session.timings!.audioSendEnd = Date.now();
      this.logPerformanceMetrics(session, 'Normal Flow (Streaming STT)');

      // Reset timings for next turn
      session.timings = {};

    } catch (error: any) {
      logger.error('Error processing user speech from transcript', {
        clientId: client.id,
        error: error.message
      });
    } finally {
      session.isProcessing = false;
    }
  }

  /**
   * Process accumulated user speech (FALLBACK for batch STT)
   */
  private async processUserSpeech(
    client: WebSocketClient,
    session: VoiceSession
  ): Promise<void> {
    

    // Don't check isProcessing here - caller already checked and set it
    if (session.audioBuffer.length === 0) {
      
      session.isProcessing = false;
      return;
    }

    try {
      // Combine audio chunks
      const audioData = Buffer.concat(session.audioBuffer);
      session.audioBuffer = [];

      

      // Convert incoming audio to PCM for transcription
      const pcmAudio = await this.convertIncomingAudioToPCM(audioData);

      // Transcribe with Deepgram (much faster than Whisper: <1s vs 8s)
      // Falls back to Whisper if Deepgram not available or returns empty
      let transcript: string;
      let detectedLanguage: string | undefined;
      let languageConfidence: number | undefined;

      // Determine language parameter for transcription
      const configuredLanguage = session.agent.config?.language || 'en';
      const enableAutoDetect = session.agent.config?.enableAutoLanguageDetection || false;
      const preferredSTTProvider = session.agent.config?.sttProvider || 'deepgram';

      // Normalize language for STT providers
      // Map 'multilingual-*' to appropriate values for each provider
      const normalizeLanguageForSTT = (lang: string, provider: string): string | undefined => {
        if (enableAutoDetect) return undefined;  // Auto-detect mode

        // Multilingual modes need to be normalized
        if (lang === 'multilingual-intl' || lang === 'multilingual-indian') {
          if (provider === 'deepgram') return 'multi';  // Deepgram uses 'multi'
          if (provider === 'sarvam') return 'hi';  // Sarvam defaults to Hindi for multilingual
          return undefined;  // Whisper will auto-detect
        }

        return lang;  // Use language as-is for specific languages
      };

      // Use the STT provider specified in agent config
      if (preferredSTTProvider === 'deepgram' && deepgramService.isAvailable()) {
        const result = await deepgramService.transcribeAudio(
          pcmAudio,
          normalizeLanguageForSTT(configuredLanguage, 'deepgram')
        );
        transcript = result.text;
        detectedLanguage = result.detectedLanguage;

        // If Deepgram returns empty, try Whisper as fallback with language detection
        if (!transcript || transcript.trim().length === 0) {
          const transcription = await openaiService.transcribeAudio(
            pcmAudio,
            normalizeLanguageForSTT(configuredLanguage, 'whisper')
          );
          transcript = transcription.text;
          detectedLanguage = transcription.detectedLanguage;
          languageConfidence = transcription.confidence;
        }
      } else if (preferredSTTProvider === 'sarvam' && sarvamService.isAvailable()) {
        // Use Sarvam for Indian languages
        const result = await sarvamService.transcribeAudio(
          pcmAudio,
          normalizeLanguageForSTT(configuredLanguage, 'sarvam')
        );
        transcript = result.text;
        detectedLanguage = result.detectedLanguage;

        // If Sarvam returns empty, try Whisper as fallback
        if (!transcript || transcript.trim().length === 0) {
          const transcription = await openaiService.transcribeAudio(
            pcmAudio,
            normalizeLanguageForSTT(configuredLanguage, 'whisper')
          );
          transcript = transcription.text;
          detectedLanguage = transcription.detectedLanguage;
          languageConfidence = transcription.confidence;
        }
      } else {
        // Fallback to Whisper (always available)
        const transcription = await openaiService.transcribeAudio(
          pcmAudio,
          normalizeLanguageForSTT(configuredLanguage, 'whisper')
        );
        transcript = transcription.text;
        detectedLanguage = transcription.detectedLanguage;
        languageConfidence = transcription.confidence;
      }

      // Log and store language detection if enabled
      if (enableAutoDetect && detectedLanguage) {
        logger.info('🌍 Language detected in user speech (batch)', {
          callLogId: session.callLogId,
          detectedLanguage,
          confidence: languageConfidence,
          configuredLanguage,
          transcript: transcript.substring(0, 100)
        });

        // Store detected language in session for use in system prompts
        const previousLanguage = session.detectedLanguage;
        session.detectedLanguage = detectedLanguage;

        // Propagate language to voice pipeline for TTS switching (batch path)
        if (session.callLogId) {
          if (previousLanguage && previousLanguage !== detectedLanguage) {
            logger.info('🔄 LANGUAGE SWITCH DETECTED (batch)', {
              callLogId: session.callLogId,
              previousLanguage,
              newLanguage: detectedLanguage
            });
          }

          await voicePipelineService.updateDetectedLanguage(
            session.callLogId,
            detectedLanguage,
            languageConfidence ?? 0.9
          );
        }
      }

      if (!transcript || transcript.trim().length === 0) {
        
        session.isProcessing = false;
        return;
      }

      

      // Save user transcript
      await this.saveTranscript(session.callLogId, 'user', transcript);

      // Check for end call phrases
      if (this.shouldEndCall(transcript, session.agent.config.endCallPhrases)) {
        

        // Send polite goodbye and end call
        const goodbyeMessage = 'Thank you for calling! Have a great day. Goodbye!';
        await this.sendFinalResponse(client, goodbyeMessage, session);
        await this.saveTranscript(session.callLogId, 'assistant', goodbyeMessage);

        // Close the call
        session.isProcessing = false;
        client.close(1000, 'Call ended by user');
        return;
      }

      // Get conversation history and prepare for LLM
      const conversationHistory = await this.getConversationHistoryMessages(session.callLogId);

      // Get agent persona (prefer new 'persona' field, fallback to 'prompt' for backward compatibility)
      const agentPersona = session.agent.config.persona || session.agent.config.prompt;

      

      // RAG: Query knowledge base if query is relevant
      let ragContextFormatted: string | undefined;

      if (ragService.isQueryRelevantForKB(transcript)) {
        try {
          

          const ragContext = await ragService.queryKnowledgeBase(
            transcript,
            session.agent._id.toString(),
            {
              topK: 3,  // Limit to 3 chunks for phone conversations (keep context short)
              minScore: 0.7,
              maxContextLength: 2000  // ~500 tokens max for phone context
            }
          );

          if (ragContext.chunks.length > 0) {
            

            // Format RAG context for LLM
            ragContextFormatted = ragService.formatContextForLLM(ragContext);
          } else {
            
          }
        } catch (error: any) {
          logger.error('❌ RAG: Failed to query knowledge base', {
            error: error.message
          });
          // Continue without RAG context - don't fail the entire call
        }
      } else {
        
      }

      // Determine active language from session (detected or configured)
      const activeLanguage = session.detectedLanguage || session.agent.config?.language || 'en';

      // Build complete system prompt: Global Rules + Agent Persona + RAG Context + Language
      const systemPrompt = buildLLMPrompt({
        agentPersona,
        ragContext: ragContextFormatted,
        language: activeLanguage,
        enableAutoLanguageDetection: session.agent.config?.enableAutoLanguageDetection
      });

      

      // ALWAYS include system prompt at the start (it's not in conversationHistory)
      // Format: System Prompt + Chat History + Current User Message
      const messages: ChatMessage[] = [
        { role: 'system', content: systemPrompt },
        ...conversationHistory,
        { role: 'user', content: transcript }
      ];

      // Generate AI response using LLM with streaming

      let fullResponse = '';
      let sentenceBuffer = '';
      const sentenceEnders = ['.', '!', '?', '\n'];

      // Determine which LLM service to use based on model
      const model = session.agent.config?.llm?.model || 'gpt-4o-mini';
      const isClaude = model.startsWith('claude-');

      // Get streaming generator based on model type
      const streamGenerator = isClaude && anthropicService.isAvailable()
        ? anthropicService.getChatCompletionStream(
            messages as any,
            {
              model,
              temperature: session.agent.config?.llm?.temperature || 0.7,
              maxTokens: session.agent.config?.llm?.maxTokens,
              systemPrompt  // Use the built system prompt for Claude
            }
          )
        : openaiService.getChatCompletionStream(messages, {
            model,
            temperature: session.agent.config?.llm?.temperature || 0.7,
            maxTokens: session.agent.config?.llm?.maxTokens
          });

      // Track total audio duration to wait before sending "clear"
      let totalAudioDurationMs = 0;

      // Stream the LLM response and process sentence-by-sentence
      for await (const chunk of streamGenerator) {
        fullResponse += chunk;
        sentenceBuffer += chunk;

        // Check if we have a complete sentence
        const lastChar = sentenceBuffer.trim().slice(-1);
        if (sentenceEnders.includes(lastChar) && sentenceBuffer.trim().length > 10) {
          const sentence = sentenceBuffer.trim();

          // Synthesize and stream sentence with ULTRA-LOW LATENCY
          // Deepgram streaming TTS: Send audio chunks as they're generated (sub-200ms TTFB!)
          if (session.config.voiceProvider === 'deepgram') {
            const audioDurationMs = await this.streamTTSToExotel(client, sentence, session);
            totalAudioDurationMs += audioDurationMs;
          } else {
            // Non-streaming fallback for OpenAI/ElevenLabs
            const audioResponse = await voicePipelineService.synthesizeText(
              sentence,
              session.config
            );
            await this.sendAudioToExotel(client, audioResponse, session.streamSid);
            totalAudioDurationMs += (audioResponse.length / 16000) * 1000;
          }

          // Clear sentence buffer
          sentenceBuffer = '';
        }
      }

      // Send any remaining text in buffer
      if (sentenceBuffer.trim().length > 0) {
        // Use streaming TTS for remaining buffer too
        if (session.config.voiceProvider === 'deepgram') {
          const audioDurationMs = await this.streamTTSToExotel(client, sentenceBuffer.trim(), session);
          totalAudioDurationMs += audioDurationMs;
        } else {
          const audioResponse = await voicePipelineService.synthesizeText(
            sentenceBuffer.trim(),
            session.config
          );
          await this.sendAudioToExotel(client, audioResponse, session.streamSid);
          totalAudioDurationMs += (audioResponse.length / 16000) * 1000;
        }
      }

      

      // Save complete AI response to transcript
      await this.saveTranscript(session.callLogId, 'assistant', fullResponse);

      // Send MARK event to get notified when Exotel finishes playing
      // This is the correct way per Exotel docs - NOT "clear"!
      try {
        const markMessage = {
          event: 'mark',
          stream_sid: session.streamSid || client.id,
          mark: {
            name: `response_${Date.now()}`
          }
        };
        client.send(JSON.stringify(markMessage));
        
      } catch (error: any) {
        
      }

    } catch (error: any) {
      logger.error('Error processing user speech', {
        clientId: client.id,
        error: error.message
      });
    } finally {
      session.isProcessing = false;
    }
  }

  /**
   * Send already-converted PCM audio to Exotel (no conversion needed)
   * Used for pre-cached holding messages
   */
  private async sendPCMAudioToExotel(
    client: WebSocketClient,
    pcmAudio: Buffer,
    streamSid?: string
  ): Promise<void> {
    try {
      // Get session to access global sequence number
      const session = this.sessions.get(client.id);
      if (!session) {
        logger.error('No session found when sending PCM audio', {
          clientId: client.id
        });
        return;
      }

      // Exotel requires chunks in multiples of 320 bytes
      // Minimum: 3.2k (100ms), Maximum: 100k
      // We'll use 3200 bytes (100ms of audio at 8kHz 16-bit mono)
      const chunkSize = 3200; // 100ms chunks

      // Check if WebSocket is still connected
      if (client.readyState !== 1) { // 1 = OPEN
        logger.error('WebSocket not open when trying to send audio', {
          clientId: client.id,
          readyState: client.readyState,
          states: { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 }
        });
        return;
      }

      const startSequence = session.sequenceNumber;
      const totalChunks = Math.ceil(pcmAudio.length / chunkSize);

      logger.info('🎵 Starting audio transmission to Exotel', {
        clientId: client.id,
        streamSid: streamSid || client.id,
        totalBytes: pcmAudio.length,
        chunkSize,
        totalChunks,
        startSequence,
        wsState: client.readyState
      });

      let chunksSent = 0;
      let bytesSent = 0;

      for (let i = 0; i < pcmAudio.length; i += chunkSize) {
        // Check WebSocket state before EACH chunk
        if (client.readyState !== 1) {
          logger.warn('WebSocket closed during audio transmission', {
            clientId: client.id,
            chunksSent,
            totalChunks,
            readyState: client.readyState
          });
          break;
        }

        const chunk = pcmAudio.slice(i, i + chunkSize);
        const payload = chunk.toString('base64');

        const message = {
          event: 'media',
          stream_sid: streamSid || client.id,
          sequence_number: session.sequenceNumber.toString(),
          media: {
            track: 'outbound',  // Explicitly mark as outbound to caller
            chunk: session.sequenceNumber.toString(),
            timestamp: Date.now().toString(),
            payload
          }
        };

        try {
          client.send(JSON.stringify(message));
          chunksSent++;
          bytesSent += chunk.length;

          // Log every 5th chunk to avoid spam
          if (chunksSent % 5 === 0 || chunksSent === 1) {
            logger.debug('Audio chunk sent', {
              clientId: client.id,
              chunkNum: chunksSent,
              totalChunks,
              chunkBytes: chunk.length,
              sequence: session.sequenceNumber
            });
          }
        } catch (sendError: any) {
          logger.error('Failed to send audio chunk', {
            clientId: client.id,
            chunkNum: chunksSent + 1,
            error: sendError.message,
            wsState: client.readyState
          });
          break;
        }

        session.sequenceNumber++;  // Increment global sequence number

        // ⚡ v6 OPTIMIZATION: Removed 20ms delay for ultra-low latency
        // Modern WebSockets and Exotel can handle bursts without artificial throttling
        // Saves ~20ms × chunks = ~1000ms for typical 5-second audio!
        // Network backpressure is handled automatically by WebSocket protocol
      }

      logger.info('✅ Audio transmission completed', {
        clientId: client.id,
        chunksSent,
        totalChunks,
        bytesSent,
        totalBytes: pcmAudio.length,
        endSequence: session.sequenceNumber,
        success: chunksSent === totalChunks
      });

    } catch (error: any) {
      logger.error('Error sending PCM audio to Exotel', {
        clientId: client.id,
        error: error.message
      });
    }
  }

  /**
   * Send audio to Exotel (convert MP3/WAV to PCM first, then stream)
   * Used for AI-generated responses that come as MP3
   */
  private async sendAudioToExotel(
    client: WebSocketClient,
    audioBuffer: Buffer,
    streamSid?: string
  ): Promise<void> {
    try {
      // Convert MP3/WAV to Linear PCM format (16-bit, 8kHz, mono, little-endian)
      const pcmAudio = await this.convertToPCM(audioBuffer);

      // Use the PCM sender
      await this.sendPCMAudioToExotel(client, pcmAudio, streamSid);
    } catch (error: any) {
      logger.error('Error converting and sending audio to Exotel', {
        clientId: client.id,
        error: error.message
      });
    }
  }

  /**
   * Stream TTS directly to Exotel with ULTRA-LOW latency
   * Supports: Deepgram (PCM streaming) and ElevenLabs (MP3 streaming)
   * Sends audio chunks as they're generated for lowest latency
   */
  private async streamTTSToExotel(
    client: WebSocketClient,
    text: string,
    session: VoiceSession
  ): Promise<number> {
    try {
      const provider = session.config.voiceProvider;

      // Route to appropriate streaming service
      if (provider === 'deepgram') {
        return await this.streamDeepgramTTSToExotel(client, text, session);
      } else if (provider === 'elevenlabs') {
        return await this.streamElevenLabsTTSToExotel(client, text, session);
      } else {
        // Fallback to non-streaming for other providers
        const audioBuffer = await voicePipelineService.synthesizeText(text, session.config);
        await this.sendAudioToExotel(client, audioBuffer, session.streamSid);
        return (audioBuffer.length / 16000) * 1000;
      }
    } catch (error: any) {
      logger.error('Failed to stream TTS to Exotel', {
        clientId: client.id,
        provider: session.config.voiceProvider,
        error: error.message
      });
      // Fallback to non-streaming
      const audioBuffer = await voicePipelineService.synthesizeText(text, session.config);
      await this.sendAudioToExotel(client, audioBuffer, session.streamSid);
      return (audioBuffer.length / 16000) * 1000;
    }
  }

  /**
   * Stream Deepgram TTS to Exotel (PCM, sub-200ms TTFB)
   */
  private async streamDeepgramTTSToExotel(
    client: WebSocketClient,
    text: string,
    session: VoiceSession
  ): Promise<number> {
    // CRITICAL: Clear buffer at start to prevent corruption from previous sentence
    session.deepgramBuffer = Buffer.alloc(0);

    let totalAudioBytes = 0;
    let chunkCount = 0;

    // Use Deepgram's streaming TTS with callback - PROCESS IMMEDIATELY for low latency
    await deepgramTTSService.synthesizeStreaming(
      text,
      async (audioChunk: Buffer) => {
        // Process chunk immediately as it arrives (true streaming!)
        await this.sendDeepgramChunkToExotel(client, audioChunk, session);
        totalAudioBytes += audioChunk.length;
        chunkCount++;
      },
      session.config.voiceId || 'aura-asteria-en'
    );

    // CRITICAL: Flush any remaining audio in buffer after all chunks processed
    const flushedBytes = await this.flushDeepgramBuffer(client, session);
    totalAudioBytes += flushedBytes;

    // Calculate audio duration: bytes / (sample_rate * bytes_per_sample * channels)
    // 8000 Hz * 2 bytes (16-bit) * 1 channel = 16000 bytes/second
    const audioDurationMs = (totalAudioBytes / 16000) * 1000;

    return audioDurationMs;
  }

  /**
   * Stream ElevenLabs TTS to Exotel (MP3 → PCM conversion, sub-400ms TTFB)
   */
  private async streamElevenLabsTTSToExotel(
    client: WebSocketClient,
    text: string,
    session: VoiceSession
  ): Promise<number> {
    let totalAudioBytes = 0;
    let chunkCount = 0;

    // Use ElevenLabs streaming TTS with callback
    await elevenlabsTTSService.synthesizeStreaming(
      text,
      async (audioChunk: Buffer) => {
        // ElevenLabs returns MP3 chunks - need to convert to PCM
        try {
          const pcmAudio = await audioConverter.convertToPCM(audioChunk);
          await this.sendPCMAudioToExotel(client, pcmAudio, session.streamSid);
          totalAudioBytes += pcmAudio.length;
          chunkCount++;
        } catch (error: any) {
          logger.error('Failed to convert ElevenLabs chunk to PCM', {
            error: error.message
          });
        }
      },
      session.config.voiceId || 'EXAVITQu4vr4xnSDxMaL', // Rachel
      'eleven_turbo_v2_5' // Fastest model
    );

    // Calculate audio duration
    const audioDurationMs = (totalAudioBytes / 16000) * 1000;

    return audioDurationMs;
  }

  /**
   * Send Deepgram audio chunk to Exotel with proper chunking
   * CRITICAL: Exotel expects 3200-byte chunks (100ms frames)
   * Deepgram sends variable-sized chunks, so we buffer and re-chunk
   */
  private async sendDeepgramChunkToExotel(
    client: WebSocketClient,
    audioChunk: Buffer,
    session: VoiceSession
  ): Promise<void> {
    // Check WebSocket is still connected
    if (client.readyState !== 1) {
      
      return;
    }

    // Initialize buffer if not exists
    if (!session.deepgramBuffer) {
      session.deepgramBuffer = Buffer.alloc(0);
    }

    // Append new chunk to buffer
    session.deepgramBuffer = Buffer.concat([session.deepgramBuffer, audioChunk]);

    // Send in 3200-byte chunks (100ms frames @ 8kHz 16-bit mono)
    const CHUNK_SIZE = 3200;
    while (session.deepgramBuffer.length >= CHUNK_SIZE) {
      const chunk = session.deepgramBuffer.slice(0, CHUNK_SIZE);
      session.deepgramBuffer = session.deepgramBuffer.slice(CHUNK_SIZE);

      const payload = chunk.toString('base64');

      const message = {
        event: 'media',
        stream_sid: session.streamSid || client.id,
        sequence_number: session.sequenceNumber.toString(),
        media: {
          track: 'outbound',
          chunk: session.sequenceNumber.toString(),
          timestamp: Date.now().toString(),
          payload
        }
      };

      client.send(JSON.stringify(message));
      session.sequenceNumber++;

      // ⚡ v6 OPTIMIZATION: Removed 20ms delay for ultra-low latency streaming
      // WebSocket handles flow control automatically with TCP backpressure
      // Saves ~1000ms for typical streaming TTS responses!
    }
  }

  /**
   * Flush any remaining audio in Deepgram buffer (partial chunk < 3200 bytes)
   * CRITICAL: Call this after each TTS stream completes to send final audio
   * Returns the number of bytes flushed (excluding padding)
   */
  private async flushDeepgramBuffer(
    client: WebSocketClient,
    session: VoiceSession
  ): Promise<number> {
    if (!session.deepgramBuffer || session.deepgramBuffer.length === 0) {
      return 0;
    }

    // Check WebSocket is still connected
    if (client.readyState !== 1) {
      
      return 0;
    }

    // Send remaining audio (pad to 320-byte multiple if needed)
    const remainingAudio = session.deepgramBuffer;
    const paddingNeeded = (320 - (remainingAudio.length % 320)) % 320;
    const paddedAudio = paddingNeeded > 0
      ? Buffer.concat([remainingAudio, Buffer.alloc(paddingNeeded)])
      : remainingAudio;

    const payload = paddedAudio.toString('base64');

    const message = {
      event: 'media',
      stream_sid: session.streamSid || client.id,
      sequence_number: session.sequenceNumber.toString(),
      media: {
        track: 'outbound',
        chunk: session.sequenceNumber.toString(),
        timestamp: Date.now().toString(),
        payload
      }
    };

    client.send(JSON.stringify(message));
    session.sequenceNumber++;

    // Clear buffer
    session.deepgramBuffer = Buffer.alloc(0);

    

    return remainingAudio.length;
  }

  /**
   * Convert Exotel PCM audio to WAV for Whisper
   */
  private async convertIncomingAudioToPCM(audioData: Buffer): Promise<Buffer> {
    try {
      // Exotel Voicebot sends raw 16-bit 8kHz mono PCM (little-endian)
      // Whisper needs 16kHz WAV format
      return await audioConverter.convertExotelPCMToWAV(audioData);
    } catch (error: any) {
      logger.error('Failed to convert incoming audio to WAV', {
        error: error.message
      });
      // Return original buffer if conversion fails
      return audioData;
    }
  }

  /**
   * Convert TTS output to PCM for Exotel
   */
  private async convertToPCM(audioData: Buffer): Promise<Buffer> {
    try {
      // Convert MP3/WAV from TTS to 16-bit 8kHz PCM for Exotel
      return await audioConverter.convertToPCM(audioData);
    } catch (error: any) {
      logger.error('Failed to convert TTS audio to PCM', {
        error: error.message
      });
      // Return original buffer if conversion fails
      return audioData;
    }
  }

  /**
   * Save message to call transcript
   */
  private async saveTranscript(
    callLogId: string,
    speaker: 'user' | 'assistant',
    text: string
  ): Promise<void> {
    try {
      logger.info(`💾 Saving transcript: [${speaker.toUpperCase()}] ${text.substring(0, 100)}...`, {
        callLogId,
        speaker,
        textLength: text.length
      });
      
      await CallLog.findByIdAndUpdate(callLogId, {
        $push: {
          transcript: {
            speaker,
            text,
            timestamp: new Date()
          }
        }
      });
      
      logger.info(`✅ Transcript saved successfully`, { callLogId, speaker });
    } catch (error: any) {
      logger.error('Error saving transcript', {
        callLogId,
        error: error.message
      });
    }
  }

  /**
   * Get conversation history for context
   */
  private async getConversationHistory(callLogId: string): Promise<string> {
    try {
      const callLog = await CallLog.findById(callLogId);
      if (!callLog || !callLog.transcript) {
        return '';
      }

      return callLog.transcript
        .map((t: any) => `${t.speaker}: ${t.text}`)
        .join('\n');
    } catch (error: any) {
      logger.error('Error getting conversation history', {
        callLogId,
        error: error.message
      });
      return '';
    }
  }

  /**
   * Get conversation history as ChatMessage array for LLM
   */
  private async getConversationHistoryMessages(callLogId: string): Promise<ChatMessage[]> {
    try {
      const callLog = await CallLog.findById(callLogId);
      if (!callLog || !callLog.transcript) {
        return [];
      }

      return callLog.transcript
        .map((t: any) => ({
          role: (
            t.speaker === 'assistant' || t.speaker === 'agent' ? 'assistant' : 'user'
          ) as 'user' | 'assistant' | 'system',
          content: t.text
        }));
    } catch (error: any) {
      logger.error('Error getting conversation history messages', {
        callLogId,
        error: error.message
      });
      return [];
    }
  }

  /**
   * Check if transcript contains end call phrases
   */
  private shouldEndCall(transcript: string, endCallPhrases: string[] = []): boolean {
    if (!endCallPhrases || endCallPhrases.length === 0) {
      return false;
    }

    const lowerTranscript = transcript.toLowerCase().trim();

    // Check for exact matches or partial matches
    for (const phrase of endCallPhrases) {
      const lowerPhrase = phrase.toLowerCase().trim();

      // Exact match
      if (lowerTranscript === lowerPhrase) {
        return true;
      }

      // Phrase at end of transcript (common for goodbyes)
      if (lowerTranscript.endsWith(lowerPhrase)) {
        return true;
      }

      // Phrase as standalone word/phrase (surrounded by spaces or punctuation)
      const regex = new RegExp(`(^|\\s|[.,!?])${lowerPhrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|\\s|[.,!?])`, 'i');
      if (regex.test(lowerTranscript)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Send final response before ending call
   */
  private async sendFinalResponse(
    client: WebSocketClient,
    message: string,
    session: VoiceSession
  ): Promise<void> {
    try {
      

      let audioDurationMs = 0;

      // Use streaming TTS if available (Deepgram)
      if (session.config.voiceProvider === 'deepgram') {
        audioDurationMs = await this.streamTTSToExotel(client, message, session);
      } else {
        // Fallback to non-streaming for OpenAI/ElevenLabs/Cartesia
        const audioBuffer = await voicePipelineService.synthesizeText(
          message,
          session.config
        );
        await this.sendAudioToExotel(client, audioBuffer, session.streamSid);
        audioDurationMs = (audioBuffer.length / 16000) * 1000;
      }

      // Wait for final message to play before ending call (no "clear" needed)
      const waitTimeMs = Math.max(2000, audioDurationMs * 0.8); // Wait 80% of audio duration or 2s minimum

      
      await new Promise(resolve => setTimeout(resolve, waitTimeMs));

      
    } catch (error: any) {
      logger.error('Failed to send final response', {
        error: error.message
      });
    }
  }

  /**
   * Clean up session on disconnect
   */
  async handleDisconnect(client: WebSocketClient): Promise<void> {
    const session = this.sessions.get(client.id);
    if (!session) {
      return;
    }



    // Clear silence timeout
    if (session.silenceTimeout) {
      clearTimeout(session.silenceTimeout);
    }

    // Release Deepgram connection back to pool
    if (session.deepgramConnection) {
      try {
        logger.info('Releasing Deepgram connection to pool', {
          clientId: client.id
        });

        // Release connection via pool (handles cleanup and queue processing)
        deepgramConnectionPool.releaseConnection(client.id);
        session.deepgramConnection = undefined;

        logger.info('Deepgram connection released successfully', {
          clientId: client.id,
          poolStats: deepgramConnectionPool.getStats()
        });
      } catch (error: any) {
        logger.error('Failed to release Deepgram connection', {
          clientId: client.id,
          error: error.message
        });
      }
    }

    // Update call log
    const callLog = await CallLog.findByIdAndUpdate(session.callLogId, {
      $set: {
        status: 'completed',
        endedAt: new Date()
      }
    }, { new: true });

    // Release concurrent slot if call was part of a campaign
    if (callLog && callLog.metadata?.isCampaignCall && callLog.metadata?.callId) {
      const campaignId = callLog.metadata.campaignId;
      const callId = callLog.metadata.callId;

      try {
        // Use force release (no token check) to avoid metadata race conditions
        const result = await redisConcurrencyTracker.forceReleaseSlot(
          campaignId,
          callId,
          true  // publish = true
        );

        if (result > 0) {
          logger.info('✅ WebSocket force-released Redis slot (disconnect)', {
            campaignId,
            callId,
            callLogId: session.callLogId,
            type: result === 1 ? 'active' : 'pre-dial'
          });
        } else {
          logger.warn('⚠️ WebSocket found no slot to release (disconnect)', {
            campaignId,
            callId,
            callLogId: session.callLogId
          });
        }
      } catch (error: any) {
        logger.error('Failed to release Redis slot from WebSocket (disconnect)', {
          error: error.message,
          callLogId: session.callLogId
        });
      }
    }

    // Update campaign counters for campaign calls
    if (callLog && callLog.metadata?.isCampaignCall && callLog.campaignId) {
      try {
        const Campaign = require('../../models/Campaign').Campaign;
        await Campaign.findByIdAndUpdate(callLog.campaignId, {
          $inc: { activeCalls: -1, completedCalls: 1 }
        });

        logger.info('Updated campaign counters on call completion', {
          campaignId: callLog.campaignId,
          callLogId: session.callLogId
        });
      } catch (error: any) {
        logger.error('Failed to update campaign counters', {
          error: error.message,
          campaignId: callLog.campaignId,
          callLogId: session.callLogId
        });
      }
    }

    // Generate formatted transcript and summary asynchronously (don't block disconnect)
    this.generateTranscriptAsync(session.callLogId).catch(error => {
      logger.error('Failed to generate transcript after call', {
        callLogId: session.callLogId,
        error: error.message
      });
    });

    // Delay cleanup if still processing
    if (session.isProcessing) {

      setTimeout(() => {
        this.sessions.delete(client.id);
      }, 30000);
    } else {

      this.sessions.delete(client.id);
    }
  }

  /**
   * Generate transcript and summary asynchronously after call ends
   */
  private async generateTranscriptAsync(callLogId: string): Promise<void> {
    try {
      logger.info('Starting transcript generation', { callLogId });

      await transcriptGenerationService.generateAndStoreTranscript(callLogId, {
        includeSummary: true,
        includeKeyPoints: true,
        includeSentiment: true,
        includeActionItems: true,
        maxSummaryLength: 300
      });

      logger.info('Transcript generated and stored successfully', { callLogId });
    } catch (error: any) {
      logger.error('Error in transcript generation', {
        callLogId,
        error: error.message,
        stack: error.stack
      });
    }
  }
}

export const exotelVoiceHandler = new ExotelVoiceHandler();
