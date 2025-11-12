import { openaiService, ChatMessage } from './openai.service';
import { elevenlabsTTSService } from './elevenlabsTTS.service';
import { deepgramTTSService } from './deepgramTTS.service';
import { sarvamTTSService } from './sarvamTTS.service';
import { CallLog } from '../models/CallLog';
import { logger } from '../utils/logger';
import { LanguageSupportService } from '../config/languageSupport';
import { VoiceSelectionService } from '../config/voicesByLanguage';

export interface VoicePipelineConfig {
  agentId: string;
  callLogId: string;
  language?: string;  // Configured/fallback language
  enableAutoLanguageDetection?: boolean;  // Enable auto language detection
  systemPrompt: string;
  voiceProvider: 'openai' | 'elevenlabs' | 'cartesia' | 'deepgram' | 'sarvam';
  voiceId: string;
  voiceSettings?: {
    stability?: number;
    similarityBoost?: number;
    modelId?: string;
    // Sarvam-specific settings
    pitch?: number;       // -0.75 to 0.75
    pace?: number;        // 0.3 to 3.0
    loudness?: number;    // 0.1 to 3.0
  };
  llmConfig?: {
    model?: string;
    temperature?: number;
    maxTokens?: number;
  };
}

/**
 * Language state for a voice pipeline session
 */
interface LanguageState {
  configuredLanguage: string;      // Fallback language from config
  currentLanguage: string;         // Currently active language
  detectedLanguages: string[];     // All detected languages in session
  languageSwitches: Array<{
    timestamp: Date;
    fromLanguage: string;
    toLanguage: string;
    confidence: number;
  }>;
  isFirstUtterance: boolean;       // Track if this is the first user input
}

export interface ConversationTurn {
  userAudio?: Buffer;
  userText: string;
  assistantText: string;
  assistantAudio?: Buffer;
  timestamp: Date;
  sttDuration?: number;
  llmDuration?: number;
  ttsDuration?: number;
}

export class VoicePipelineService {
  private conversationHistory: Map<string, ChatMessage[]>;
  private languageStates: Map<string, LanguageState>;  // Track language state per session
  private pipelineConfigs: Map<string, VoicePipelineConfig>;  // Store configs per session

  constructor() {
    this.conversationHistory = new Map();
    this.languageStates = new Map();
    this.pipelineConfigs = new Map();
    logger.info('Voice Pipeline service initialized');
  }

  /**
   * Initialize a new conversation session
   */
  async initializeSession(
    config: VoicePipelineConfig,
    options?: {
      existingTranscript?: Array<{ speaker?: string; role?: string; text: string }>;
    }
  ): Promise<void> {
    try {
      if (this.conversationHistory.has(config.callLogId)) {
        logger.debug('Voice pipeline session already initialized', {
          callLogId: config.callLogId
        });
        return;
      }

      logger.info('Initializing voice pipeline session', {
        agentId: config.agentId,
        callLogId: config.callLogId,
        language: config.language || 'en',
        autoDetection: config.enableAutoLanguageDetection || false
      });

      // Initialize conversation with system prompt
      const history: ChatMessage[] = [
        {
          role: 'system',
          content: config.systemPrompt
        }
      ];

      if (options?.existingTranscript?.length) {
        for (const entry of options.existingTranscript) {
          if (!entry || !entry.text) {
            continue;
          }

          const speaker = (entry.speaker || entry.role || '').toString().toLowerCase();
          const role: ChatMessage['role'] =
            speaker === 'agent' || speaker === 'assistant' ? 'assistant' : 'user';

          history.push({
            role,
            content: entry.text
          });
        }
      }

      this.conversationHistory.set(config.callLogId, history);

      // Initialize language state
      const fallbackLanguage = config.language || 'en';
      this.languageStates.set(config.callLogId, {
        configuredLanguage: fallbackLanguage,
        currentLanguage: fallbackLanguage,
        detectedLanguages: [],
        languageSwitches: [],
        isFirstUtterance: true
      });

      // Store pipeline config for later reference
      this.pipelineConfigs.set(config.callLogId, config);

      logger.info('Voice pipeline session initialized with language support');
    } catch (error: any) {
      logger.error('Failed to initialize voice pipeline session', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Determine if we should switch languages based on detection
   * Strategy: First utterance -> always use detected language if confident
   *           Subsequent utterances -> only switch if high confidence (>0.85)
   */
  private shouldSwitchLanguage(
    callLogId: string,
    detectedLanguage: string,
    confidence: number
  ): boolean {
    const languageState = this.languageStates.get(callLogId);
    const config = this.pipelineConfigs.get(callLogId);

    if (!languageState || !config) {
      return false;
    }

    // Auto-detection disabled
    if (!config.enableAutoLanguageDetection) {
      return false;
    }

    // No language detected
    if (!detectedLanguage) {
      return false;
    }

    // Already using this language
    if (languageState.currentLanguage === detectedLanguage) {
      return false;
    }

    // First utterance: switch if confidence > 0.7
    if (languageState.isFirstUtterance) {
      return confidence > 0.7;
    }

    // Subsequent utterances: only switch if very confident (>0.85)
    return confidence > 0.85;
  }

  /**
   * Public method to update detected language and switch voice if needed
   * Called from WebSocket handler when language is detected in streaming STT
   */
  async updateDetectedLanguage(
    callLogId: string,
    detectedLanguage: string,
    confidence: number = 0.9
  ): Promise<void> {
    const languageState = this.languageStates.get(callLogId);

    if (!languageState) {
      logger.warn('Cannot update detected language - no language state found', {
        callLogId,
        detectedLanguage
      });
      return;
    }

    // Check if we should switch to this language
    if (this.shouldSwitchLanguage(callLogId, detectedLanguage, confidence)) {
      await this.switchLanguage(callLogId, detectedLanguage, confidence);
    }
  }

  /**
   * Switch to a new language and update voice if needed
   */
  private async switchLanguage(
    callLogId: string,
    newLanguage: string,
    confidence: number
  ): Promise<void> {
    const languageState = this.languageStates.get(callLogId);
    const config = this.pipelineConfigs.get(callLogId);

    if (!languageState || !config) {
      return;
    }

    const previousLanguage = languageState.currentLanguage;

    logger.info('🌍 Switching language', {
      callLogId,
      from: previousLanguage,
      to: newLanguage,
      confidence,
      isFirstUtterance: languageState.isFirstUtterance
    });

    // Update language state
    languageState.currentLanguage = newLanguage;
    languageState.isFirstUtterance = false;

    // Track detected language
    if (!languageState.detectedLanguages.includes(newLanguage)) {
      languageState.detectedLanguages.push(newLanguage);
    }

    // Record language switch
    languageState.languageSwitches.push({
      timestamp: new Date(),
      fromLanguage: previousLanguage,
      toLanguage: newLanguage,
      confidence
    });

    // Update voice to match new language
    const newVoice = VoiceSelectionService.findSimilarVoiceForLanguage(
      config.voiceId,
      config.voiceProvider,
      newLanguage
    );

    // Update config with new voice
    config.voiceId = newVoice.id;
    config.voiceProvider = newVoice.provider as any;

    // Update best TTS provider for the new language
    const bestProvider = LanguageSupportService.getBestTTSProvider(newLanguage);
    if (bestProvider !== config.voiceProvider) {
      const providerVoice = LanguageSupportService.getDefaultVoice(newLanguage);
      config.voiceProvider = providerVoice.provider as any;
      config.voiceId = providerVoice.voiceId;
    }

    logger.info('✅ Language switched successfully', {
      callLogId,
      language: newLanguage,
      newVoice: config.voiceId,
      newProvider: config.voiceProvider
    });
  }

  /**
   * Get enhanced system prompt with language instruction
   */
  private getSystemPromptWithLanguage(
    basePrompt: string,
    language: string
  ): string {
    if (language === 'en') {
      return basePrompt;  // No need to add language instruction for English
    }

    const languageName = LanguageSupportService.getLanguageName(language);

    return `${basePrompt}

IMPORTANT LANGUAGE INSTRUCTION:
The user is speaking in ${languageName}. Please respond naturally in ${languageName}.
Adapt your tone, cultural references, and communication style appropriately for ${languageName}-speaking users.
If you cannot respond fluently in ${languageName}, respond in your configured fallback language.`;
  }

  private async synthesizeSpeech(
    text: string,
    config: VoicePipelineConfig,
    language?: string
  ): Promise<Buffer> {
    const provider = config.voiceProvider;

    switch (provider) {
      case 'openai':
        return await openaiService.textToSpeech({
          text,
          voice: config.voiceId,
          model: config.voiceSettings?.modelId
        });

      case 'elevenlabs':
        return await elevenlabsTTSService.synthesizeText(
          text,
          config.voiceId || 'EXAVITQu4vr4xnSDxMaL', // Rachel (default)
          config.voiceSettings?.modelId || 'eleven_multilingual_v2',  // Use multilingual model
          language
        );

      case 'deepgram':
        return await deepgramTTSService.synthesizeText(
          text,
          config.voiceId || 'aura-asteria-en'
        );

      case 'sarvam':
        // Sarvam TTS - supports 11 Indian languages
        if (!sarvamTTSService.isAvailable()) {
          logger.error('Sarvam TTS not available - API key missing');
          throw new Error('Sarvam TTS service not available');
        }

        return await sarvamTTSService.synthesize({
          text,
          speaker: config.voiceId || 'anushka',
          targetLanguageCode: language,  // Sarvam requires language code
          pitch: config.voiceSettings?.pitch ?? 0.0,
          pace: config.voiceSettings?.pace ?? 1.0,
          loudness: config.voiceSettings?.loudness ?? 1.2
        });

      default:
        logger.error('Unsupported voice provider for synthesis', {
          provider
        });
        throw new Error(`Voice provider ${provider} is not supported`);
    }
  }

  async synthesizeText(
    text: string,
    config: VoicePipelineConfig
  ): Promise<Buffer> {
    const languageState = this.languageStates.get(config.callLogId);
    const currentLanguage = languageState?.currentLanguage || config.language || 'en';
    return this.synthesizeSpeech(text, config, currentLanguage);
  }

  /**
   * Process a complete conversation turn (STT -> LLM -> TTS)
   */
  async processConversationTurn(
    callLogId: string,
    userAudio: Buffer,
    config: VoicePipelineConfig
  ): Promise<ConversationTurn> {
    try {
      const turnStartTime = Date.now();

      logger.info('Processing conversation turn', {
        callLogId,
        audioSize: userAudio.length
      });

      await this.initializeSession(config);

      // Step 1: Speech-to-Text with Language Detection (Whisper)
      const sttStart = Date.now();
      const languageState = this.languageStates.get(callLogId);
      const currentLanguage = languageState?.currentLanguage || config.language || 'en';

      const transcription = await openaiService.transcribeAudio(
        userAudio,
        config.enableAutoLanguageDetection ? undefined : currentLanguage  // Let Whisper auto-detect if enabled
      );
      const sttDuration = Date.now() - sttStart;

      logger.info('User speech transcribed', {
        text: transcription.text,
        detectedLanguage: transcription.detectedLanguage,
        confidence: transcription.confidence,
        currentLanguage,
        duration: sttDuration
      });

      // Step 2: Language Detection & Switching Logic
      if (transcription.detectedLanguage && transcription.confidence) {
        if (this.shouldSwitchLanguage(callLogId, transcription.detectedLanguage, transcription.confidence)) {
          await this.switchLanguage(callLogId, transcription.detectedLanguage, transcription.confidence);
        } else if (languageState?.isFirstUtterance) {
          // Mark first utterance as complete even if not switching
          languageState.isFirstUtterance = false;
        }
      }

      // Get updated language state after potential switch
      const updatedLanguageState = this.languageStates.get(callLogId);
      const activeLanguage = updatedLanguageState?.currentLanguage || currentLanguage;

      // Get conversation history
      const history = this.conversationHistory.get(callLogId);
      if (!history) {
        throw new Error('Conversation history not initialized');
      }

      // Update system prompt with language instruction if language has changed
      if (history[0] && history[0].role === 'system') {
        history[0].content = this.getSystemPromptWithLanguage(config.systemPrompt, activeLanguage);
      }

      // Add user message to history
      history.push({
        role: 'user',
        content: transcription.text
      });

      // Step 3: Get LLM response (GPT)
      const llmStart = Date.now();
      const completion = await openaiService.getChatCompletion(history, {
        model: config.llmConfig?.model,
        temperature: config.llmConfig?.temperature,
        maxTokens: config.llmConfig?.maxTokens
      });
      const llmDuration = Date.now() - llmStart;

      logger.info('LLM response generated', {
        text: completion.text,
        duration: llmDuration,
        tokens: completion.usage?.totalTokens
      });

      // Add assistant response to history
      history.push({
        role: 'assistant',
        content: completion.text
      });

      // Update conversation history
      this.conversationHistory.set(callLogId, history);

      // Step 4: Text-to-Speech with language-aware voice
      const ttsStart = Date.now();
      const audioBuffer = await this.synthesizeSpeech(completion.text, config, activeLanguage);
      const ttsDuration = Date.now() - ttsStart;

      logger.info('Speech synthesis completed', {
        audioSize: audioBuffer.length,
        duration: ttsDuration
      });

      // Save turn to call log
      await this.saveConversationTurn(callLogId, {
        userText: transcription.text,
        assistantText: completion.text,
        sttDuration,
        llmDuration,
        ttsDuration
      });

      const totalDuration = Date.now() - turnStartTime;

      logger.info('Conversation turn completed', {
        totalDuration,
        sttDuration,
        llmDuration,
        ttsDuration
      });

      return {
        userAudio,
        userText: transcription.text,
        assistantText: completion.text,
        assistantAudio: audioBuffer,
        timestamp: new Date(),
        sttDuration,
        llmDuration,
        ttsDuration
      };
    } catch (error: any) {
      logger.error('Failed to process conversation turn', {
        callLogId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Process streaming conversation turn (for real-time responses)
   */
  async *processStreamingTurn(
    callLogId: string,
    userAudio: Buffer,
    config: VoicePipelineConfig
  ): AsyncGenerator<{ type: string; data: any }, void, unknown> {
    try {
      await this.initializeSession(config);

      logger.info('Processing streaming conversation turn', {
        callLogId
      });

      // Step 1: Speech-to-Text
      yield { type: 'stt_start', data: {} };

      const transcription = await openaiService.transcribeAudio(
        userAudio,
        config.language
      );

      yield {
        type: 'stt_complete',
        data: { text: transcription.text }
      };

      // Get conversation history
      const history = this.conversationHistory.get(callLogId);
      if (!history) {
        throw new Error('Conversation history not initialized');
      }

      history.push({
        role: 'user',
        content: transcription.text
      });

      // Step 2: Stream LLM response
      yield { type: 'llm_start', data: {} };

      let fullResponse = '';
      for await (const chunk of openaiService.getChatCompletionStream(
        history,
        config.llmConfig
      )) {
        fullResponse += chunk;
        yield {
          type: 'llm_chunk',
          data: { chunk, fullText: fullResponse }
        };
      }

      yield {
        type: 'llm_complete',
        data: { text: fullResponse }
      };

      // Add assistant response to history
      history.push({
        role: 'assistant',
        content: fullResponse
      });
      this.conversationHistory.set(callLogId, history);

      // Step 3: Text-to-Speech
      yield { type: 'tts_start', data: {} };

      // Get current language state for TTS
      const languageState = this.languageStates.get(callLogId);
      const currentLanguage = languageState?.currentLanguage || config.language || 'en';
      const audioBuffer = await this.synthesizeSpeech(fullResponse, config, currentLanguage);

      yield {
        type: 'tts_complete',
        data: { audio: audioBuffer }
      };

      // Save to call log
      await this.saveConversationTurn(callLogId, {
        userText: transcription.text,
        assistantText: fullResponse
      });

      logger.info('Streaming conversation turn completed');
    } catch (error: any) {
      logger.error('Failed to process streaming turn', {
        error: error.message
      });
      yield { type: 'error', data: { error: error.message } };
    }
  }

  /**
   * Save conversation turn to call log
   */
  private async saveConversationTurn(
    callLogId: string,
    turn: Partial<ConversationTurn>
  ): Promise<void> {
    try {
      const transcriptEntries: Array<{ speaker: string; text: string; timestamp: Date }> = [];

      if (turn.userText) {
        transcriptEntries.push({
          speaker: 'user',
          text: turn.userText,
          timestamp: new Date()
        });
      }

      if (turn.assistantText) {
        transcriptEntries.push({
          speaker: 'assistant',
          text: turn.assistantText,
          timestamp: new Date()
        });
      }

      if (transcriptEntries.length > 0) {
        await CallLog.findByIdAndUpdate(callLogId, {
          $push: {
            transcript: {
              $each: transcriptEntries
            }
          }
        });
      }

      logger.debug('Conversation turn saved to call log', {
        callLogId
      });
    } catch (error: any) {
      logger.error('Failed to save conversation turn', {
        callLogId,
        error: error.message
      });
    }
  }

  /**
   * Get conversation history
   */
  getConversationHistory(callLogId: string): ChatMessage[] {
    return this.conversationHistory.get(callLogId) || [];
  }

  /**
   * Get language state for a session
   */
  getLanguageState(callLogId: string): LanguageState | undefined {
    return this.languageStates.get(callLogId);
  }

  /**
   * Clear conversation history and language state
   */
  clearConversationHistory(callLogId: string): void {
    this.conversationHistory.delete(callLogId);
    this.languageStates.delete(callLogId);
    this.pipelineConfigs.delete(callLogId);
    logger.info('Conversation history and language state cleared', { callLogId });
  }

  /**
   * End voice pipeline session
   */
  async endSession(callLogId: string): Promise<void> {
    try {
      logger.info('Ending voice pipeline session', { callLogId });

      // Clear conversation history
      this.clearConversationHistory(callLogId);

      // Update call log status
      await CallLog.findByIdAndUpdate(callLogId, {
        status: 'completed',
        endedAt: new Date()
      });

      logger.info('Voice pipeline session ended');
    } catch (error: any) {
      logger.error('Failed to end voice pipeline session', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Generate first message audio (for outbound calls)
   */
  async generateFirstMessage(
    firstMessage: string,
    config: VoicePipelineConfig
  ): Promise<Buffer> {
    try {
      logger.info('Generating first message audio', {
        messageLength: firstMessage.length
      });

      // Use configured language for first message (before any detection)
      const language = config.language || 'en';
      const audioBuffer = await this.synthesizeSpeech(firstMessage, config, language);

      logger.info('First message audio generated', {
        audioSize: audioBuffer.length
      });

      return audioBuffer;
    } catch (error: any) {
      logger.error('Failed to generate first message audio', {
        error: error.message
      });
      throw error;
    }
  }
}

export const voicePipelineService = new VoicePipelineService();
