import { createClient, LiveTTSEvents } from '@deepgram/sdk';
import { logger } from '../utils/logger';
import { env } from '../config/env';

/**
 * Deepgram TTS Service
 * Provides streaming text-to-speech using Deepgram Aura-2
 * - Sub-200ms TTFB (2-4x faster than competitors)
 * - $0.030 per 1,000 characters (10x cheaper than ElevenLabs)
 * - 40+ natural voices
 */
class DeepgramTTSService {
  private client: any;
  private isInitialized: boolean = false;

  constructor() {
    if (env.DEEPGRAM_API_KEY) {
      try {
        this.client = createClient(env.DEEPGRAM_API_KEY);
        this.isInitialized = true;
        logger.info('Deepgram TTS service initialized');
      } catch (error: any) {
        logger.error('Failed to initialize Deepgram TTS', {
          error: error.message
        });
      }
    } else {
      logger.warn('Deepgram API key not found - TTS will not be available');
    }
  }

  /**
   * Check if Deepgram TTS is available
   */
  isAvailable(): boolean {
    return this.isInitialized && !!this.client;
  }

  /**
   * Synthesize text to speech using streaming WebSocket
   * Returns audio data as it's generated (sub-200ms TTFB)
   *
   * @param text - Text to synthesize
   * @param voiceId - Deepgram voice model (default: aura-asteria-en)
   * @returns Promise<Buffer> - Complete audio buffer (Linear PCM format)
   */
  async synthesizeText(
    text: string,
    voiceId: string = 'aura-asteria-en'
  ): Promise<Buffer> {
    if (!this.isAvailable()) {
      throw new Error('Deepgram TTS service not available');
    }

    const startTime = Date.now();

    logger.info('🎙️ Deepgram TTS streaming (v2)', {
      textLength: text.length,
      voice: voiceId
    });

    return new Promise((resolve, reject) => {
      const audioChunks: Buffer[] = [];
      let firstByteReceived = false;

      try {
        // Create live TTS connection
        const connection = this.client.speak.live({
          model: voiceId,
          encoding: 'linear16',
          sample_rate: 8000, // 8kHz for Exotel
          container: 'none' // Raw PCM, no container
        });

        // Handle connection open
        connection.on(LiveTTSEvents.Open, () => {
          logger.info('✅ Deepgram TTS connected (v2)');

          // Send text for synthesis
          connection.sendText(text);

          // Flush to ensure all audio is generated
          connection.flush();
        });

        // Handle audio data (streaming!)
        connection.on(LiveTTSEvents.Audio, (audioChunk: Buffer) => {
          if (!firstByteReceived) {
            const ttfb = Date.now() - startTime;
            logger.info('⚡ First audio byte (v2)', { ttfb: `${ttfb}ms` });
            firstByteReceived = true;
          }

          audioChunks.push(audioChunk);
        });

        // Handle metadata (optional)
        connection.on(LiveTTSEvents.Metadata, (metadata: any) => {
          logger.debug('TTS metadata', { metadata });
        });

        // Handle flush (synthesis complete)
        connection.on(LiveTTSEvents.Flushed, () => {
          logger.info('🎵 TTS flushed - synthesis complete (v2)');

          // After flush, we have all the audio - resolve immediately
          const duration = Date.now() - startTime;
          const totalSize = audioChunks.reduce((sum, chunk) => sum + chunk.length, 0);

          logger.info('✅ Deepgram TTS complete (v2)', {
            duration: `${duration}ms`,
            audioSize: totalSize,
            chunks: audioChunks.length
          });

          if (audioChunks.length === 0) {
            reject(new Error('No audio data received from Deepgram TTS'));
          } else {
            // Combine all audio chunks into single buffer
            const completeAudio = Buffer.concat(audioChunks);
            resolve(completeAudio);
          }

          // Close connection after resolving
          try {
            connection.finish();
          } catch (e) {
            // Ignore errors on close
          }
        });

        // Handle connection close (may happen after resolve)
        connection.on(LiveTTSEvents.Close, () => {
          logger.debug('Deepgram TTS connection closed');
        });

        // Handle errors - ignore JSON parse errors (they happen after flush)
        connection.on(LiveTTSEvents.Error, (error: any) => {
          const errorMsg = error.message || error;

          // Ignore JSON parse errors that happen after flush
          if (errorMsg.includes('parse') && errorMsg.includes('JSON')) {
            logger.debug('Ignoring post-flush JSON parse error');
            return;
          }

          logger.error('Deepgram TTS error', { error: errorMsg });
          reject(new Error(`Deepgram TTS error: ${errorMsg}`));
        });

        // Handle warnings
        connection.on(LiveTTSEvents.Warning, (warning: any) => {
          logger.warn('Deepgram TTS warning', { warning });
        });

      } catch (error: any) {
        logger.error('Failed to create Deepgram TTS connection', {
          error: error.message
        });
        reject(error);
      }
    });
  }

  /**
   * Synthesize text with streaming callback
   * Allows sending audio chunks to Exotel as they arrive (lowest latency!)
   *
   * @param text - Text to synthesize
   * @param onAudioChunk - Callback for each audio chunk (can be async)
   * @param voiceId - Deepgram voice model
   */
  async synthesizeStreaming(
    text: string,
    onAudioChunk: (chunk: Buffer) => void | Promise<void>,
    voiceId: string = 'aura-asteria-en'
  ): Promise<void> {
    if (!this.isAvailable()) {
      throw new Error('Deepgram TTS service not available');
    }

    const startTime = Date.now();

    logger.info('🎙️ Deepgram TTS streaming with callbacks (v2)', {
      textLength: text.length,
      voice: voiceId
    });

    return new Promise((resolve, reject) => {
      let firstByteReceived = false;
      let chunkCount = 0;
      let flushed = false;

      // Safety timeout - resolve after 10 seconds even if Close event doesn't fire
      const timeoutId = setTimeout(() => {
        if (!flushed) {
          logger.warn('⚠️ Deepgram TTS timeout - resolving anyway', {
            duration: '10000ms',
            chunks: chunkCount
          });
          resolve();
        }
      }, 10000);

      try {
        const connection = this.client.speak.live({
          model: voiceId,
          encoding: 'linear16',
          sample_rate: 8000,
          container: 'none'
        });

        connection.on(LiveTTSEvents.Open, () => {
          connection.sendText(text);
          connection.flush();
        });

        // Stream audio chunks as they arrive!
        connection.on(LiveTTSEvents.Audio, async (audioChunk: Buffer) => {
          if (!firstByteReceived) {
            const ttfb = Date.now() - startTime;
            logger.info('⚡ First audio byte (v2)', { ttfb: `${ttfb}ms` });
            firstByteReceived = true;
          }

          chunkCount++;

          // Send chunk immediately to caller (Exotel) - await if async
          await onAudioChunk(audioChunk);
        });

        // CRITICAL FIX: Use Flushed event instead of Close event
        // Flushed means all audio has been generated and sent
        connection.on(LiveTTSEvents.Flushed, () => {
          if (!flushed) {
            flushed = true;
            clearTimeout(timeoutId);
            const duration = Date.now() - startTime;
            logger.info('🎵 TTS flushed - synthesis complete (v2)', {
              duration: `${duration}ms`,
              chunks: chunkCount
            });

            // Resolve immediately - all audio has been sent
            resolve();

            // Close connection in background (don't wait for it)
            setImmediate(() => {
              try {
                connection.finish();
              } catch (error) {
                // Ignore errors during cleanup
                logger.debug('Ignoring connection.finish() error');
              }
            });
          }
        });

        connection.on(LiveTTSEvents.Close, () => {
          if (!flushed) {
            flushed = true;
            clearTimeout(timeoutId);
            const duration = Date.now() - startTime;
            logger.info('✅ Deepgram TTS complete (v2)', {
              duration: `${duration}ms`,
              chunks: chunkCount
            });
            resolve();
          }
        });

        connection.on(LiveTTSEvents.Error, (error: any) => {
          const errorMsg = error.message || error;

          // Ignore JSON parse errors that happen after flush (Deepgram bug)
          if (flushed && errorMsg.includes && errorMsg.includes('parse') && errorMsg.includes('JSON')) {
            logger.debug('Ignoring post-flush JSON parse error (expected after Flushed event)');
            return;
          }

          clearTimeout(timeoutId);
          logger.error('Deepgram TTS streaming error', { error: errorMsg });
          reject(new Error(`Deepgram TTS error: ${errorMsg}`));
        });

      } catch (error: any) {
        clearTimeout(timeoutId);
        logger.error('Failed to create Deepgram TTS streaming connection', {
          error: error.message
        });
        reject(error);
      }
    });
  }
}

export const deepgramTTSService = new DeepgramTTSService();
