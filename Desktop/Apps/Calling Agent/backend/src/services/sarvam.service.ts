import axios from 'axios';
import WebSocket from 'ws';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import { ExternalServiceError } from '../utils/errors';

export interface SarvamTranscriptionResult {
  text: string;
  language?: string;
  confidence?: number;
  isFinal: boolean;
}

export interface SarvamSTTOptions {
  language?: string;  // 'hi-IN', 'ta-IN', etc.
  model?: string;     // 'saarika:v2', 'saarika:v2.5'
  sampleRate?: number;  // 8000, 16000, etc.
  encoding?: string;  // 'pcm', 'wav'
  vadEnabled?: boolean;
  endpointing?: number;  // milliseconds of silence
  onTranscript?: (result: SarvamTranscriptionResult) => void;
  onSpeechStarted?: () => void;
  onSpeechEnded?: () => void;
}

/**
 * Sarvam.ai Service
 * Provides Speech-to-Text for 10 Indian languages
 *
 * Supported languages:
 * - Hindi (hi-IN)
 * - Bengali (bn-IN)
 * - Tamil (ta-IN)
 * - Telugu (te-IN)
 * - Kannada (kn-IN)
 * - Malayalam (ml-IN)
 * - Marathi (mr-IN)
 * - Gujarati (gu-IN)
 * - Punjabi (pa-IN)
 * - Odia (or-IN)
 */
export class SarvamService {
  private apiKey: string | undefined;
  private isInitialized: boolean = false;
  private readonly baseURL = 'https://api.sarvam.ai';

  constructor() {
    if (!env.SARVAM_API_KEY) {
      logger.warn('Sarvam API key not configured - Indian language STT unavailable');
      return;
    }

    this.apiKey = env.SARVAM_API_KEY;
    this.isInitialized = true;
    logger.info('Sarvam service initialized');
  }

  /**
   * Check if Sarvam is available
   */
  isAvailable(): boolean {
    return this.isInitialized && !!this.apiKey;
  }

  /**
   * Map standard language code to Sarvam format
   * e.g., 'hi' -> 'hi-IN', 'ta' -> 'ta-IN'
   */
  private mapLanguageCode(language: string): string {
    // If already in correct format (xx-IN), return as-is
    if (language.includes('-IN')) {
      return language;
    }

    // Map ISO 639-1 codes to Sarvam format
    const languageMap: Record<string, string> = {
      'hi': 'hi-IN',  // Hindi
      'bn': 'bn-IN',  // Bengali
      'ta': 'ta-IN',  // Tamil
      'te': 'te-IN',  // Telugu
      'kn': 'kn-IN',  // Kannada
      'ml': 'ml-IN',  // Malayalam
      'mr': 'mr-IN',  // Marathi
      'gu': 'gu-IN',  // Gujarati
      'pa': 'pa-IN',  // Punjabi
      'or': 'or-IN',  // Odia
      'en': 'en-IN'   // English (Indian)
    };

    return languageMap[language] || 'hi-IN';  // Default to Hindi if unknown
  }

  /**
   * Transcribe audio buffer (batch processing)
   * Similar to Deepgram's prerecorded API
   * Returns both transcript and detected language
   */
  async transcribeAudio(audioBuffer: Buffer, language?: string): Promise<{ text: string; detectedLanguage?: string }> {
    if (!this.isAvailable()) {
      throw new ExternalServiceError('Sarvam service not available');
    }

    try {
      const startTime = Date.now();
      const sarvamLanguage = this.mapLanguageCode(language || 'hi');

      logger.info('Starting Sarvam transcription', {
        audioSize: audioBuffer.length,
        language: sarvamLanguage
      });

      const response = await axios.post(
        `${this.baseURL}/speech-to-text`,
        {
          audio: audioBuffer.toString('base64'),
          language: sarvamLanguage,
          model: 'saarika:v2'
        },
        {
          headers: {
            'API-Subscription-Key': this.apiKey!,
            'Content-Type': 'application/json'
          },
          timeout: 30000  // 30 second timeout
        }
      );

      const duration = Date.now() - startTime;
      const transcript = response.data.transcript || '';

      logger.info('Sarvam transcription completed', {
        transcript: transcript || '(empty)',
        transcriptLength: transcript.length,
        language: sarvamLanguage,
        duration: `${duration}ms`
      });

      return {
        text: transcript,
        detectedLanguage: sarvamLanguage  // Sarvam uses the requested language
      };
    } catch (error: any) {
      logger.error('Failed to transcribe audio with Sarvam', {
        error: error.message,
        status: error.response?.status,
        data: error.response?.data
      });

      throw new ExternalServiceError('Failed to transcribe audio with Sarvam');
    }
  }

  /**
   * Create a live streaming transcription connection with VAD
   * Similar to Deepgram's live WebSocket API
   */
  async createLiveConnection(options: SarvamSTTOptions = {}): Promise<WebSocket> {
    if (!this.isAvailable()) {
      throw new ExternalServiceError('Sarvam service not available');
    }

    try {
      const sarvamLanguage = this.mapLanguageCode(options.language || 'hi');

      logger.info('Creating Sarvam live connection', {
        language: sarvamLanguage,
        model: options.model || 'saarika:v2.5',
        sampleRate: options.sampleRate || 16000,
        vadEnabled: options.vadEnabled ?? true
      });

      // Build query parameters
      // IMPORTANT: We send Exotel's native 8kHz PCM audio to Sarvam
      // Sarvam documentation states they support 8kHz for telephony use cases
      const sampleRate = 8000;  // Match Exotel's 8kHz telephony audio
      const model = options.model || 'saarika:v2.5';
      const inputAudioCodec = 'pcm_s16le';  // Linear PCM 16-bit little-endian
      const highVadSensitivity = options.vadEnabled ?? true;
      const vadSignals = true;  // Enable VAD event signals

      const queryParams = new URLSearchParams({
        'language-code': sarvamLanguage,
        'model': model,
        'input_audio_codec': inputAudioCodec,
        'sample_rate': sampleRate.toString(),
        'high_vad_sensitivity': highVadSensitivity.toString(),
        'vad_signals': vadSignals.toString()
      });

      const wsUrl = `wss://api.sarvam.ai/speech-to-text/ws?${queryParams.toString()}`;

      // Create WebSocket connection with correct header
      const ws = new WebSocket(wsUrl, {
        headers: {
          'Api-Subscription-Key': this.apiKey!  // Correct header name (capital A, lowercase p)
        }
      });

      // Set up event listeners
      ws.on('open', () => {
        logger.info('✅ Sarvam live connection opened successfully');
        // No config message needed - all configuration is in query parameters
      });

      ws.on('message', (data: Buffer) => {
        try {
          const message = JSON.parse(data.toString());

          // Log ALL messages for debugging
          logger.debug('Sarvam WebSocket message received', {
            type: message.type,
            fullMessage: JSON.stringify(message)
          });

          // Handle different message types based on actual Sarvam API responses
          // Actual message types: 'events' (VAD signals), 'data' (transcripts), 'error'
          if (message.type === 'events') {
            // VAD event: Speech started or ended
            const signalType = message.data?.signal_type;
            if (signalType === 'START_SPEECH') {
              logger.info('🎤 SPEECH STARTED (Sarvam VAD)');
              options.onSpeechStarted?.();
            } else if (signalType === 'END_SPEECH') {
              logger.info('🔇 SPEECH ENDED (Sarvam VAD)');
              options.onSpeechEnded?.();
            }
          } else if (message.type === 'data') {
            // Transcription data
            const transcript = message.data?.transcript || '';
            const isFinal = true;  // Sarvam sends final transcripts
            const confidence = 1.0;  // Sarvam doesn't provide confidence scores

            if (transcript && transcript.trim().length > 0) {
              logger.info('📝 Sarvam transcript received', {
                text: transcript,
                language: message.data?.language_code,
                audioDuration: message.data?.metrics?.audio_duration,
                processingLatency: message.data?.metrics?.processing_latency
              });

              options.onTranscript?.({
                text: transcript,
                confidence,
                isFinal,
                language: message.data?.language_code || sarvamLanguage
              });
            }
          } else if (message.type === 'error') {
            logger.error('❌ Sarvam STT Error', {
              errorMessage: message.message || message.error || 'Unknown error',
              errorCode: message.code,
              fullErrorObject: JSON.stringify(message)
            });
          }
        } catch (error: any) {
          logger.error('Failed to parse Sarvam message', {
            error: error.message,
            data: data.toString()
          });
        }
      });

      ws.on('error', (error: Error) => {
        logger.error('Sarvam live connection error', {
          error: error.message
        });
      });

      ws.on('close', (code: number, reason: Buffer) => {
        logger.info('Sarvam live connection closed', {
          code,
          reason: reason.toString()
        });
      });

      logger.info('Sarvam live connection created successfully');
      return ws;
    } catch (error: any) {
      logger.error('Failed to create Sarvam live connection', {
        error: error.message
      });

      throw new ExternalServiceError('Failed to create Sarvam live connection');
    }
  }

  /**
   * Check if a language is supported by Sarvam
   */
  isLanguageSupported(language: string): boolean {
    const supportedLanguages = ['hi', 'bn', 'ta', 'te', 'kn', 'ml', 'mr', 'gu', 'pa', 'or', 'en'];

    // Check both 'hi' and 'hi-IN' formats
    const langCode = language.split('-')[0].toLowerCase();
    return supportedLanguages.includes(langCode);
  }
}

// Export singleton instance
export const sarvamService = new SarvamService();
