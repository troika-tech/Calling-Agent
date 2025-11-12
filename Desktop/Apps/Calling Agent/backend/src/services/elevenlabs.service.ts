import axios, { AxiosInstance } from 'axios';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import { ExternalServiceError } from '../utils/errors';
import { Readable } from 'stream';

export interface Voice {
  voice_id: string;
  name: string;
  category?: string;
  labels?: Record<string, string>;
}

export interface TTSOptions {
  voiceId: string;
  text: string;
  modelId?: string;
  stability?: number;
  similarityBoost?: number;
  style?: number;
  useSpeakerBoost?: boolean;
}

export interface StreamTTSOptions extends TTSOptions {
  optimizeStreamingLatency?: number;
}

export class ElevenLabsService {
  private client: AxiosInstance;
  private apiKey: string;
  private baseUrl: string;

  constructor() {
    this.apiKey = env.ELEVENLABS_API_KEY;
    this.baseUrl = 'https://api.elevenlabs.io/v1';

    this.client = axios.create({
      baseURL: this.baseUrl,
      headers: {
        'xi-api-key': this.apiKey,
        'Content-Type': 'application/json'
      }
    });

    logger.info('ElevenLabs service initialized');
  }

  /**
   * Get list of available voices
   */
  async getVoices(): Promise<Voice[]> {
    try {
      logger.info('Fetching available voices');

      const response = await this.client.get('/voices');

      logger.info('Voices fetched successfully', {
        count: response.data.voices?.length || 0
      });

      return response.data.voices || [];
    } catch (error: any) {
      logger.error('Failed to fetch voices', {
        error: error.message
      });

      throw new ExternalServiceError('Failed to fetch ElevenLabs voices');
    }
  }

  /**
   * Get voice details
   */
  async getVoice(voiceId: string): Promise<Voice> {
    try {
      logger.info('Fetching voice details', { voiceId });

      const response = await this.client.get(`/voices/${voiceId}`);

      return response.data;
    } catch (error: any) {
      logger.error('Failed to fetch voice details', {
        voiceId,
        error: error.message
      });

      throw new ExternalServiceError('Failed to fetch voice details');
    }
  }

  /**
   * Convert text to speech (returns audio buffer)
   */
  async textToSpeech(options: TTSOptions): Promise<Buffer> {
    try {
      const startTime = Date.now();

      logger.info('Starting text-to-speech conversion', {
        voiceId: options.voiceId,
        textLength: options.text.length,
        modelId: options.modelId || 'eleven_monolingual_v1'
      });

      const response = await this.client.post(
        `/text-to-speech/${options.voiceId}`,
        {
          text: options.text,
          model_id: options.modelId || 'eleven_monolingual_v1',
          voice_settings: {
            stability: options.stability ?? 0.5,
            similarity_boost: options.similarityBoost ?? 0.75,
            style: options.style ?? 0,
            use_speaker_boost: options.useSpeakerBoost ?? true
          }
        },
        {
          responseType: 'arraybuffer'
        }
      );

      const duration = Date.now() - startTime;

      const audioBuffer = Buffer.from(response.data);

      logger.info('Text-to-speech conversion completed', {
        audioSize: audioBuffer.length,
        duration: `${duration}ms`
      });

      return audioBuffer;
    } catch (error: any) {
      logger.error('Failed to convert text to speech', {
        error: error.message,
        response: error.response?.data
      });

      throw new ExternalServiceError('Failed to generate speech with ElevenLabs');
    }
  }

  /**
   * Convert text to speech with streaming
   */
  async textToSpeechStream(options: StreamTTSOptions): Promise<Readable> {
    try {
      logger.info('Starting streaming text-to-speech conversion', {
        voiceId: options.voiceId,
        textLength: options.text.length
      });

      const response = await this.client.post(
        `/text-to-speech/${options.voiceId}/stream`,
        {
          text: options.text,
          model_id: options.modelId || 'eleven_monolingual_v1',
          voice_settings: {
            stability: options.stability ?? 0.5,
            similarity_boost: options.similarityBoost ?? 0.75,
            style: options.style ?? 0,
            use_speaker_boost: options.useSpeakerBoost ?? true
          },
          optimize_streaming_latency: options.optimizeStreamingLatency ?? 0
        },
        {
          responseType: 'stream'
        }
      );

      logger.info('Streaming text-to-speech started');

      return response.data as Readable;
    } catch (error: any) {
      logger.error('Failed to stream text to speech', {
        error: error.message
      });

      throw new ExternalServiceError('Failed to stream speech with ElevenLabs');
    }
  }

  /**
   * Get user subscription info
   */
  async getUserInfo(): Promise<any> {
    try {
      logger.info('Fetching user subscription info');

      const response = await this.client.get('/user');

      logger.info('User info fetched successfully', {
        characterCount: response.data.subscription?.character_count,
        characterLimit: response.data.subscription?.character_limit
      });

      return response.data;
    } catch (error: any) {
      logger.error('Failed to fetch user info', {
        error: error.message
      });

      throw new ExternalServiceError('Failed to fetch ElevenLabs user info');
    }
  }

  /**
   * Get usage statistics
   */
  async getUsageStats(): Promise<any> {
    try {
      logger.info('Fetching usage statistics');

      const response = await this.client.get('/user/subscription');

      return {
        characterCount: response.data.character_count,
        characterLimit: response.data.character_limit,
        canExtendCharacterLimit: response.data.can_extend_character_limit,
        allowedToExtendCharacterLimit:
          response.data.allowed_to_extend_character_limit,
        nextCharacterCountResetUnix: response.data.next_character_count_reset_unix
      };
    } catch (error: any) {
      logger.error('Failed to fetch usage stats', {
        error: error.message
      });

      throw new ExternalServiceError('Failed to fetch usage statistics');
    }
  }

  /**
   * Helper: Convert text to speech and save to file path
   */
  async textToSpeechFile(
    options: TTSOptions,
    outputPath: string
  ): Promise<void> {
    try {
      const audioBuffer = await this.textToSpeech(options);

      const fs = require('fs').promises;
      await fs.writeFile(outputPath, audioBuffer);

      logger.info('Audio saved to file', {
        path: outputPath,
        size: audioBuffer.length
      });
    } catch (error: any) {
      logger.error('Failed to save audio to file', {
        error: error.message
      });

      throw new ExternalServiceError('Failed to save audio file');
    }
  }
}

export const elevenlabsService = new ElevenLabsService();
