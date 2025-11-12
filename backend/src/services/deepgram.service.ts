import { createClient, LiveTranscriptionEvents, LiveClient } from '@deepgram/sdk';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import { ExternalServiceError } from '../utils/errors';

export interface DeepgramTranscriptionResult {
  text: string;
  confidence: number;
  isFinal: boolean;
  detectedLanguage?: string;  // Detected language code (e.g., 'en', 'hi', 'es')
}

export class DeepgramService {
  private client: any;
  private isInitialized: boolean = false;

  constructor() {
    if (!env.DEEPGRAM_API_KEY) {
      logger.warn('Deepgram API key not configured - falling back to Whisper');
      return;
    }

    try {
      this.client = createClient(env.DEEPGRAM_API_KEY);
      this.isInitialized = true;
      logger.info('Deepgram service initialized');
    } catch (error: any) {
      logger.error('Failed to initialize Deepgram', {
        error: error.message
      });
    }
  }

  /**
   * Check if Deepgram is available
   */
  isAvailable(): boolean {
    return this.isInitialized && !!this.client;
  }

  /**
   * Transcribe audio buffer (non-streaming, faster than Whisper)
   * Returns both transcript and detected language
   */
  async transcribeAudio(audioBuffer: Buffer, language?: string): Promise<{ text: string; detectedLanguage?: string }> {
    if (!this.isAvailable()) {
      throw new ExternalServiceError('Deepgram service not available');
    }

    try {
      const startTime = Date.now();

      // Determine if we should use language detection or specific language
      const useLanguageDetection = !language || language === 'multi';

      logger.info('Starting Deepgram transcription', {
        audioSize: audioBuffer.length,
        language: language || 'auto-detect',
        useLanguageDetection
      });

      // Build transcription options
      const transcribeOptions: any = {
        model: 'nova-3',  // Use nova-3 for multilingual support
        smart_format: true,
        punctuate: true,
        diarize: false
      };

      if (useLanguageDetection) {
        // Enable automatic language detection for multilingual mode
        transcribeOptions.detect_language = true;
      } else {
        // Use specific language
        transcribeOptions.language = language;
      }

      // Use Deepgram's prerecorded API (much faster than Whisper)
      const { result, error } = await this.client.listen.prerecorded.transcribeFile(
        audioBuffer,
        transcribeOptions
      );

      if (error) {
        throw new Error(error.message);
      }

      const transcript = result.results?.channels?.[0]?.alternatives?.[0]?.transcript || '';
      const confidence = result.results?.channels?.[0]?.alternatives?.[0]?.confidence || 0;
      const detectedLanguage = result.results?.channels?.[0]?.detected_language;
      const duration = Date.now() - startTime;

      logger.info('Deepgram transcription completed', {
        transcript: transcript || '(empty)',
        transcriptLength: transcript.length,
        confidence,
        detectedLanguage: detectedLanguage || 'not detected',
        duration: `${duration}ms`,
        hasChannels: !!result.results?.channels,
        channelCount: result.results?.channels?.length || 0
      });

      return {
        text: transcript,
        detectedLanguage: detectedLanguage
      };
    } catch (error: any) {
      logger.error('Failed to transcribe audio with Deepgram', {
        error: error.message
      });

      throw new ExternalServiceError('Failed to transcribe audio with Deepgram');
    }
  }

  /**
   * Create a live streaming transcription connection with VAD
   * Uses Deepgram's built-in Voice Activity Detection
   *
   * Features:
   * - Real-time transcription as audio streams in
   * - VAD events (speech_start, speech_end)
   * - Endpointing (automatic utterance detection)
   * - Much faster than batch processing
   */
  async createLiveConnectionWithVAD(options?: {
    endpointing?: number;  // ms of silence to detect end of speech (default: 200)
    vadEvents?: boolean;   // Enable VAD events (speech_start/end)
    language?: string;
    onTranscript?: (result: DeepgramTranscriptionResult) => void;
    onSpeechStarted?: () => void;
    onSpeechEnded?: () => void;
  }): Promise<LiveClient> {
    if (!this.isAvailable()) {
      throw new ExternalServiceError('Deepgram service not available');
    }

    try {
      logger.info('Creating Deepgram live connection with VAD', {
        endpointing: options?.endpointing ?? 200,
        vadEvents: options?.vadEvents ?? true
      });

      // Determine if we should use language detection or specific language
      const useLanguageDetection = !options?.language || options.language === 'multi';

      // Build live connection options
      const liveOptions: any = {
        model: 'nova-3',  // Use nova-3 for multilingual support
        smart_format: true,
        punctuate: true,
        interim_results: true,  // Get partial results for faster UX
        channels: 1,
        sample_rate: 8000,  // Match Exotel's 8kHz
        encoding: 'linear16'
      };

      if (useLanguageDetection) {
        // Enable automatic language detection for multilingual mode
        liveOptions.detect_language = true;
        // When using detect_language, endpointing must be disabled or set to a compatible value
        // VAD events are also not supported with detect_language
        logger.info('🌐 Deepgram multilingual mode enabled (detect_language: true)');
      } else {
        // Use specific language
        liveOptions.language = options.language;
        // Only set endpointing and vad_events when NOT using language detection
        liveOptions.endpointing = options?.endpointing ?? 200;  // 200ms silence = end of speech
        liveOptions.vad_events = options?.vadEvents ?? true;
      }

      logger.debug('Deepgram connection options', {
        ...liveOptions,
        // Don't log API key if present
        api_key: liveOptions.api_key ? '[REDACTED]' : undefined
      });

      const connection = this.client.listen.live(liveOptions);

      // Set up event listeners
      connection.on(LiveTranscriptionEvents.Open, () => {
        logger.info('✅ Deepgram live connection opened');
      });

      connection.on(LiveTranscriptionEvents.Transcript, (data: any) => {
        const transcript = data.channel?.alternatives?.[0]?.transcript;
        const isFinal = data.is_final;
        const confidence = data.channel?.alternatives?.[0]?.confidence || 0;
        const detectedLanguage = data.channel?.detected_language;

        if (transcript && transcript.trim().length > 0) {
          logger.debug('Deepgram transcript', {
            text: transcript,
            isFinal,
            confidence,
            detectedLanguage: detectedLanguage || 'not detected'
          });

          options?.onTranscript?.({
            text: transcript,
            confidence,
            isFinal,
            detectedLanguage
          });
        }
      });

      // VAD Events - These are GOLD for detecting speech boundaries!
      connection.on(LiveTranscriptionEvents.SpeechStarted, () => {
        logger.info('🎤 SPEECH STARTED (Deepgram VAD)');
        options?.onSpeechStarted?.();
      });

      connection.on(LiveTranscriptionEvents.UtteranceEnd, () => {
        logger.info('🔇 SPEECH ENDED (Deepgram VAD)');
        options?.onSpeechEnded?.();
      });

      connection.on(LiveTranscriptionEvents.Error, (error: any) => {
        logger.error('Deepgram live connection error', {
          error: error.message || error,
          errorType: error.type || 'unknown',
          errorCode: error.code || 'unknown',
          errorDetails: error.details || error,
          fullError: JSON.stringify(error, Object.getOwnPropertyNames(error)).substring(0, 500)
        });
      });

      connection.on(LiveTranscriptionEvents.Close, () => {
        logger.info('Deepgram live connection closed');
      });

      // DEBUG: Log ALL events to see what Deepgram is actually sending
      connection.on('*', (event: string, data: any) => {
        logger.debug(`[Deepgram Event] ${event}`, { data: JSON.stringify(data).substring(0, 200) });
      });

      logger.info('Deepgram live connection with VAD created successfully');
      return connection;
    } catch (error: any) {
      logger.error('Failed to create Deepgram live connection', {
        error: error.message
      });

      throw new ExternalServiceError('Failed to create Deepgram live connection');
    }
  }

  /**
   * Create a live streaming transcription connection (legacy)
   * For backward compatibility
   */
  async createLiveConnection(): Promise<LiveClient> {
    return this.createLiveConnectionWithVAD();
  }
}

// Export singleton instance
export const deepgramService = new DeepgramService();
