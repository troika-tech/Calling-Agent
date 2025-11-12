import { exec } from 'child_process';
import { promisify } from 'util';
import { writeFile, unlink } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { logger } from './logger';

const execPromise = promisify(exec);

/**
 * Audio Converter Utility
 * Handles conversion between different audio formats for telephony
 */
export class AudioConverter {
  /**
   * Convert audio to Linear PCM format (16-bit, 8kHz, mono, little-endian) for Exotel
   * Input: MP3/WAV from ElevenLabs or other TTS
   * Output: Raw PCM audio buffer
   */
  async convertToPCM(inputBuffer: Buffer): Promise<Buffer> {
    const tempInputFile = join(tmpdir(), `tts_${Date.now()}.mp3`);
    const tempOutputFile = join(tmpdir(), `pcm_${Date.now()}.raw`);

    try {
      // Write input buffer to temporary file
      await writeFile(tempInputFile, inputBuffer);

      logger.info('Converting audio to PCM for Exotel', {
        inputSize: inputBuffer.length,
        tempFile: tempInputFile
      });

      // Use ffmpeg to convert to Linear PCM (16-bit, 8kHz, mono, little-endian)
      // -acodec pcm_s16le: 16-bit signed little-endian PCM
      // -ar 8000: Sample rate 8000 Hz
      // -ac 1: Mono audio
      // -f s16le: Output format raw PCM
      const ffmpegCommand = `ffmpeg -i "${tempInputFile}" -acodec pcm_s16le -ar 8000 -ac 1 -f s16le "${tempOutputFile}" -y 2>&1`;

      const { stdout, stderr } = await execPromise(ffmpegCommand);

      logger.info('ffmpeg conversion completed', {
        success: true
      });

      // Read the output file
      const fs = require('fs').promises;
      const pcmBuffer = await fs.readFile(tempOutputFile);

      logger.info('Audio converted to PCM successfully', {
        inputSize: inputBuffer.length,
        outputSize: pcmBuffer.length,
        format: '16-bit 8kHz mono PCM'
      });

      return pcmBuffer;

    } catch (error: any) {
      logger.error('Failed to convert audio to μ-law', {
        error: error.message
      });
      throw new Error(`Audio conversion failed: ${error.message}`);

    } finally {
      // Clean up temporary files
      try {
        await unlink(tempInputFile);
        await unlink(tempOutputFile);
      } catch (cleanupError) {
        logger.warn('Failed to clean up temp files', { error: cleanupError });
      }
    }
  }

  /**
   * Convert Exotel PCM audio to WAV for STT (Whisper)
   * Input: Raw PCM audio from Exotel (16-bit, 8kHz, mono, little-endian)
   * Output: WAV file buffer (16kHz, mono, 16-bit) for Whisper
   */
  async convertExotelPCMToWAV(pcmBuffer: Buffer): Promise<Buffer> {
    const tempInputFile = join(tmpdir(), `exotel_pcm_${Date.now()}.raw`);
    const tempOutputFile = join(tmpdir(), `whisper_${Date.now()}.wav`);

    try {
      // Write raw PCM buffer to temporary file
      await writeFile(tempInputFile, pcmBuffer);

      logger.info('Converting Exotel PCM to WAV for Whisper', {
        inputSize: pcmBuffer.length,
        inputFormat: '16-bit 8kHz mono PCM'
      });

      // Convert raw PCM (8kHz) to WAV (16kHz) for Whisper
      // -f s16le: Input is signed 16-bit little-endian PCM
      // -ar 8000: Input sample rate is 8kHz
      // -ac 1: Mono audio
      // -ar 16000: Output sample rate 16kHz (required by Whisper)
      const ffmpegCommand = `ffmpeg -f s16le -ar 8000 -ac 1 -i "${tempInputFile}" -acodec pcm_s16le -ar 16000 -ac 1 "${tempOutputFile}" -y 2>&1`;

      const { stdout, stderr } = await execPromise(ffmpegCommand);

      // Read the output file
      const fs = require('fs').promises;
      const wavBuffer = await fs.readFile(tempOutputFile);

      logger.info('Exotel PCM converted to WAV successfully', {
        inputSize: pcmBuffer.length,
        outputSize: wavBuffer.length,
        outputFormat: '16-bit 16kHz mono WAV'
      });

      return wavBuffer;

    } catch (error: any) {
      logger.error('Failed to convert Exotel PCM to WAV', {
        error: error.message
      });
      throw new Error(`Audio conversion failed: ${error.message}`);

    } finally {
      // Clean up temporary files
      try {
        await unlink(tempInputFile);
        await unlink(tempOutputFile);
      } catch (cleanupError) {
        logger.warn('Failed to clean up temp files', { error: cleanupError });
      }
    }
  }

  /**
   * @deprecated Use convertExotelPCMToWAV instead
   * Convert μ-law audio to PCM for STT (Whisper)
   * Input: μ-law encoded audio from Exotel
   * Output: PCM audio buffer (16kHz, mono, 16-bit) for Whisper
   */
  async convertMuLawToPCM(mulawBuffer: Buffer): Promise<Buffer> {
    const tempInputFile = join(tmpdir(), `mulaw_${Date.now()}.ulaw`);
    const tempOutputFile = join(tmpdir(), `pcm_${Date.now()}.wav`);

    try {
      // Write μ-law buffer to temporary file
      await writeFile(tempInputFile, mulawBuffer);

      logger.debug('Converting μ-law to PCM', {
        inputSize: mulawBuffer.length
      });

      // Convert μ-law to PCM WAV (16kHz, mono, 16-bit for Whisper)
      const ffmpegCommand = `ffmpeg -f mulaw -ar 8000 -ac 1 -i "${tempInputFile}" -acodec pcm_s16le -ar 16000 -ac 1 "${tempOutputFile}" -y`;

      await execPromise(ffmpegCommand);

      // Read the output file
      const fs = require('fs').promises;
      const pcmBuffer = await fs.readFile(tempOutputFile);

      logger.debug('μ-law converted to PCM', {
        outputSize: pcmBuffer.length
      });

      return pcmBuffer;

    } catch (error: any) {
      logger.error('Failed to convert μ-law to PCM', {
        error: error.message
      });
      throw new Error(`Audio conversion failed: ${error.message}`);

    } finally {
      // Clean up temporary files
      try {
        await unlink(tempInputFile);
        await unlink(tempOutputFile);
      } catch (cleanupError) {
        logger.warn('Failed to clean up temp files', { error: cleanupError });
      }
    }
  }

  /**
   * Check if ffmpeg is available
   */
  async checkFFmpeg(): Promise<boolean> {
    try {
      await execPromise('ffmpeg -version');
      return true;
    } catch (error) {
      logger.error('ffmpeg is not installed or not in PATH');
      return false;
    }
  }
}

export const audioConverter = new AudioConverter();
