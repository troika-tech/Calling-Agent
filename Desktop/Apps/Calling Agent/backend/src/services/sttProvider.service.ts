import { deepgramService } from './deepgram.service';
import { sarvamService } from './sarvam.service';
import { openaiService } from './openai.service';
import { logger } from '../utils/logger';

export type STTProvider = 'deepgram' | 'deepgram-multi' | 'sarvam' | 'whisper';

export interface STTProviderSelection {
  provider: STTProvider;
  reason: string;
  language: string;
}

/**
 * STT Provider Selection Service
 * Intelligently selects the best Speech-to-Text provider based on:
 * - Language
 * - Auto-detection settings
 * - Provider availability
 * - Cost optimization
 */
export class STTProviderService {
  /**
   * Indian languages supported by Sarvam.ai
   */
  private readonly sarvamLanguages = ['hi', 'bn', 'ta', 'te', 'kn', 'ml', 'mr', 'gu', 'pa', 'or', 'multilingual-indian'];

  /**
   * Select the best STT provider for a given language and configuration
   *
   * Selection logic:
   * 1. Always use user-specified provider from agent config
   * 2. For multilingual modes, use appropriate multi-language settings
   */
  selectProvider(
    language: string,
    enableAutoLanguageDetection: boolean,
    preferredProvider: 'deepgram' | 'sarvam' | 'whisper' = 'deepgram'
  ): STTProviderSelection {
    // Normalize language code (handle both 'hi' and 'hi-IN' formats)
    const langCode = language.split('-')[0].toLowerCase();

    // Handle multilingual options
    const isMultilingualIndian = language === 'multilingual-indian';
    const isMultilingualIntl = language === 'multilingual-intl';

    // ALWAYS use the provider specified in agent config
    if (preferredProvider === 'deepgram' && deepgramService.isAvailable()) {
      // Determine language mode for Deepgram
      let deepgramLanguage = language;
      if (enableAutoLanguageDetection || isMultilingualIntl || isMultilingualIndian) {
        deepgramLanguage = 'multi';  // Use Deepgram's multilingual mode
      }

      return {
        provider: deepgramLanguage === 'multi' ? 'deepgram-multi' : 'deepgram',
        reason: `Using Deepgram as specified in agent config`,
        language: deepgramLanguage
      };
    }

    if (preferredProvider === 'sarvam' && sarvamService.isAvailable()) {
      // Sarvam only supports Indian languages
      if (isMultilingualIndian) {
        return {
          provider: 'sarvam',
          reason: `Using Sarvam for multilingual Indian languages`,
          language: 'hi'  // Default to Hindi for multilingual mode
        };
      }

      if (this.sarvamLanguages.includes(langCode)) {
        return {
          provider: 'sarvam',
          reason: `Using Sarvam for Indian language ${language}`,
          language: language
        };
      }

      // Sarvam doesn't support this language - warn and fallback to Deepgram
      logger.error('Sarvam does not support non-Indian languages. Please select Deepgram in agent config.', {
        language,
        requestedProvider: 'sarvam'
      });
    }

    if (preferredProvider === 'whisper') {
      return {
        provider: 'whisper',
        reason: `Using Whisper as specified in agent config`,
        language: enableAutoLanguageDetection || isMultilingualIndian || isMultilingualIntl ? 'auto' : language
      };
    }

    // Fallback: If requested provider is not available, default to Deepgram
    logger.error('Requested STT provider not available - falling back to Deepgram', {
      requestedProvider: preferredProvider,
      language
    });

    if (deepgramService.isAvailable()) {
      return {
        provider: enableAutoLanguageDetection || isMultilingualIndian || isMultilingualIntl ? 'deepgram-multi' : 'deepgram',
        reason: `Fallback to Deepgram (requested provider ${preferredProvider} unavailable)`,
        language: enableAutoLanguageDetection || isMultilingualIndian || isMultilingualIntl ? 'multi' : language
      };
    }

    // Final fallback to Whisper
    return {
      provider: 'whisper',
      reason: `All preferred providers unavailable - falling back to Whisper`,
      language: enableAutoLanguageDetection || isMultilingualIndian || isMultilingualIntl ? 'auto' : language
    };
  }

  /**
   * Get the appropriate language parameter for Deepgram based on mode
   */
  getDeepgramLanguage(language: string, enableAutoDetection: boolean): string {
    if (enableAutoDetection) {
      return 'multi';  // Deepgram multilingual mode
    }
    return language || 'en';
  }

  /**
   * Check if a given language is an Indian language supported by Sarvam
   */
  isIndianLanguage(language: string): boolean {
    const langCode = language.split('-')[0].toLowerCase();
    return this.sarvamLanguages.includes(langCode);
  }

  /**
   * Get all supported providers and their availability status
   */
  getProviderStatus() {
    return {
      deepgram: {
        available: deepgramService.isAvailable(),
        languages: 'multilingual (nova-3)',
        cost: '$0.46/hour',
        latency: 'sub-300ms'
      },
      sarvam: {
        available: sarvamService.isAvailable(),
        languages: '10 Indian languages',
        cost: '$0.36/hour (₹30/hour)',
        latency: 'ultra-low (unspecified)'
      },
      whisper: {
        available: true,  // Always available as fallback
        languages: '90+ languages',
        cost: '$0.006/minute',
        latency: '2-8 seconds'
      }
    };
  }
}

// Export singleton instance
export const sttProviderService = new STTProviderService();
