import axios from 'axios';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import { ExternalServiceError } from '../utils/errors';

export interface SarvamTTSVoice {
  id: string;
  name: string;
  gender: 'male' | 'female';
  description: string;
  languages: string[];  // Language codes this voice supports
}

export interface SarvamTTSOptions {
  text: string;
  speaker?: string;  // Speaker voice ID (e.g., 'anushka', 'abhilash')
  targetLanguageCode?: string;  // Language code (e.g., 'hi-IN', 'en-IN')
  pitch?: number;  // -0.75 to 0.75, default 0.0
  pace?: number;  // 0.3 to 3.0, default 1.0
  loudness?: number;  // 0.1 to 3.0, default 1.2
  model?: string;  // Model name, default 'bulbul:v2'
  enableFillerWords?: boolean;  // Enable filler words, default false
}

/**
 * Sarvam.ai TTS Service
 * Provides high-quality Text-to-Speech for 11 Indian languages
 *
 * Supported Languages:
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
 * - English (en-IN)
 */
export class SarvamTTSService {
  private apiKey: string | undefined;
  private isInitialized: boolean = false;
  private readonly baseURL = 'https://api.sarvam.ai';

  // Available voices from Bulbul v2 model
  private readonly voices: SarvamTTSVoice[] = [
    // Female voices
    {
      id: 'anushka',
      name: 'Anushka',
      gender: 'female',
      description: 'Clear and Professional',
      languages: ['hi-IN', 'bn-IN', 'ta-IN', 'te-IN', 'kn-IN', 'ml-IN', 'mr-IN', 'gu-IN', 'pa-IN', 'or-IN', 'en-IN']
    },
    {
      id: 'vidya',
      name: 'Vidya',
      gender: 'female',
      description: 'Articulate and Precise',
      languages: ['hi-IN', 'bn-IN', 'ta-IN', 'te-IN', 'kn-IN', 'ml-IN', 'mr-IN', 'gu-IN', 'pa-IN', 'or-IN', 'en-IN']
    },
    {
      id: 'manisha',
      name: 'Manisha',
      gender: 'female',
      description: 'Warm and Friendly',
      languages: ['hi-IN', 'bn-IN', 'ta-IN', 'te-IN', 'kn-IN', 'ml-IN', 'mr-IN', 'gu-IN', 'pa-IN', 'or-IN', 'en-IN']
    },
    {
      id: 'arya',
      name: 'Arya',
      gender: 'female',
      description: 'Young and Energetic',
      languages: ['hi-IN', 'bn-IN', 'ta-IN', 'te-IN', 'kn-IN', 'ml-IN', 'mr-IN', 'gu-IN', 'pa-IN', 'or-IN', 'en-IN']
    },
    // Male voices
    {
      id: 'abhilash',
      name: 'Abhilash',
      gender: 'male',
      description: 'Deep and Authoritative',
      languages: ['hi-IN', 'bn-IN', 'ta-IN', 'te-IN', 'kn-IN', 'ml-IN', 'mr-IN', 'gu-IN', 'pa-IN', 'or-IN', 'en-IN']
    },
    {
      id: 'karun',
      name: 'Karun',
      gender: 'male',
      description: 'Natural and Conversational',
      languages: ['hi-IN', 'bn-IN', 'ta-IN', 'te-IN', 'kn-IN', 'ml-IN', 'mr-IN', 'gu-IN', 'pa-IN', 'or-IN', 'en-IN']
    },
    {
      id: 'hitesh',
      name: 'Hitesh',
      gender: 'male',
      description: 'Professional and Engaging',
      languages: ['hi-IN', 'bn-IN', 'ta-IN', 'te-IN', 'kn-IN', 'ml-IN', 'mr-IN', 'gu-IN', 'pa-IN', 'or-IN', 'en-IN']
    }
  ];

  constructor() {
    if (!env.SARVAM_API_KEY) {
      logger.warn('Sarvam API key not configured - TTS unavailable');
      return;
    }

    this.apiKey = env.SARVAM_API_KEY;
    this.isInitialized = true;
    logger.info('Sarvam TTS service initialized');
  }

  /**
   * Check if Sarvam TTS is available
   */
  isAvailable(): boolean {
    return this.isInitialized && !!this.apiKey;
  }

  /**
   * Get list of available voices
   */
  getVoices(): SarvamTTSVoice[] {
    return this.voices;
  }

  /**
   * Get a specific voice by ID
   */
  getVoiceById(voiceId: string): SarvamTTSVoice | undefined {
    return this.voices.find(v => v.id === voiceId);
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
   * Synthesize speech from text
   * Returns audio buffer in linear16 PCM format (8kHz, 16-bit, mono)
   */
  async synthesize(options: SarvamTTSOptions): Promise<Buffer> {
    if (!this.isAvailable()) {
      throw new ExternalServiceError('Sarvam TTS service not available');
    }

    if (!options.text || options.text.trim().length === 0) {
      throw new ExternalServiceError('Text is required for synthesis');
    }

    if (options.text.length > 1500) {
      throw new ExternalServiceError('Text exceeds maximum length of 1500 characters');
    }

    try {
      const startTime = Date.now();

      // Always map the language code to ensure correct format (e.g., 'hi' -> 'hi-IN')
      const targetLanguageCode = this.mapLanguageCode(options.targetLanguageCode || 'hi');

      logger.info('Starting Sarvam TTS synthesis', {
        textLength: options.text.length,
        speaker: options.speaker || 'anushka',
        language: targetLanguageCode,
        pitch: options.pitch ?? 0.0,
        pace: options.pace ?? 1.0
      });

      const requestBody = {
        inputs: [options.text],
        target_language_code: targetLanguageCode,
        speaker: options.speaker || 'anushka',
        pitch: options.pitch ?? 0.0,
        pace: options.pace ?? 1.0,
        loudness: options.loudness ?? 1.2,
        speech_sample_rate: 8000,  // 8kHz for telephony
        enable_preprocessing: true,
        model: options.model || 'bulbul:v2',
        enable_filler_words: options.enableFillerWords ?? false
      };

      const response = await axios.post(
        `${this.baseURL}/text-to-speech`,
        requestBody,
        {
          headers: {
            'API-Subscription-Key': this.apiKey!,
            'Content-Type': 'application/json'
          },
          timeout: 30000,  // 30 second timeout
          responseType: 'json'
        }
      );

      const duration = Date.now() - startTime;

      // Sarvam returns base64-encoded audio in response
      const audioBase64 = response.data.audios?.[0];

      if (!audioBase64) {
        throw new Error('No audio data returned from Sarvam API');
      }

      const audioBuffer = Buffer.from(audioBase64, 'base64');

      logger.info('Sarvam TTS synthesis completed', {
        duration: `${duration}ms`,
        audioSize: audioBuffer.length,
        speaker: options.speaker || 'anushka',
        language: targetLanguageCode
      });

      return audioBuffer;
    } catch (error: any) {
      logger.error('Failed to synthesize speech with Sarvam TTS', {
        error: error.message,
        status: error.response?.status,
        data: error.response?.data
      });

      throw new ExternalServiceError('Failed to synthesize speech with Sarvam TTS');
    }
  }
}

// Export singleton instance
export const sarvamTTSService = new SarvamTTSService();
