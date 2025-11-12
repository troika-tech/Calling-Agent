/**
 * Voicemail Message Service
 * Automatically leaves pre-recorded or TTS messages when voicemail is detected
 */

import { logger } from '../utils/logger';
import { CallLog } from '../models/CallLog';
import { voicemailDetectionService, VoicemailDetectionResult } from './voicemailDetection.service';
import { elevenlabsTTSService } from './elevenlabsTTS.service';
import { deepgramTTSService } from './deepgramTTS.service';
import mongoose from 'mongoose';

export interface VoicemailMessageConfig {
  /**
   * Enable automatic voicemail message
   */
  enabled: boolean;

  /**
   * Message template
   */
  messageTemplate: string;

  /**
   * TTS provider
   */
  ttsProvider: 'elevenlabs' | 'deepgram';

  /**
   * Voice ID for TTS
   */
  voiceId?: string;

  /**
   * Wait time after beep detection (ms)
   */
  beepWaitTime: number;

  /**
   * Maximum message duration (seconds)
   */
  maxDuration: number;

  /**
   * Retry voicemail message if failed
   */
  retryOnFailure: boolean;
}

export interface VoicemailMessageResult {
  success: boolean;
  messageLeft: boolean;
  messageDuration?: number;
  error?: string;
  detectionResult: VoicemailDetectionResult;
  timestamp: Date;
}

export class VoicemailMessageService {
  private config: VoicemailMessageConfig;

  private readonly DEFAULT_MESSAGE_TEMPLATE =
    "Hello, this is an automated message from {agentName}. " +
    "We tried to reach you but couldn't connect. " +
    "Please call us back at your convenience. Thank you.";

  constructor(config?: Partial<VoicemailMessageConfig>) {
    this.config = {
      enabled: config?.enabled ?? true,
      messageTemplate: config?.messageTemplate ?? this.DEFAULT_MESSAGE_TEMPLATE,
      ttsProvider: config?.ttsProvider ?? 'elevenlabs',
      voiceId: config?.voiceId,
      beepWaitTime: config?.beepWaitTime ?? 1000, // 1 second after beep
      maxDuration: config?.maxDuration ?? 30,
      retryOnFailure: config?.retryOnFailure ?? false
    };

    logger.info('VoicemailMessageService initialized', {
      config: this.config
    });
  }

  /**
   * Handle voicemail detection and leave message
   */
  async handleVoicemail(
    callLogId: string | mongoose.Types.ObjectId,
    websocketClient?: any
  ): Promise<VoicemailMessageResult> {
    try {
      // Detect voicemail
      const detectionResult = await voicemailDetectionService.detectFromCallLog(callLogId);

      if (!detectionResult.isVoicemail) {
        logger.info('Not a voicemail, skipping message', {
          callLogId,
          confidence: detectionResult.confidence
        });

        return {
          success: true,
          messageLeft: false,
          detectionResult,
          timestamp: new Date()
        };
      }

      if (!this.config.enabled) {
        logger.info('Voicemail message disabled, skipping', { callLogId });

        return {
          success: true,
          messageLeft: false,
          detectionResult,
          timestamp: new Date()
        };
      }

      // Get call log for context
      const callLog = await CallLog.findById(callLogId).populate('agentId');

      if (!callLog) {
        throw new Error(`CallLog not found: ${callLogId}`);
      }

      // Generate message
      const message = this.generateMessage(callLog);

      logger.info('Leaving voicemail message', {
        callLogId,
        message,
        confidence: detectionResult.confidence
      });

      // Wait after beep (if beep was detected)
      if (detectionResult.signals.beepDetected) {
        await this.delay(this.config.beepWaitTime);
      }

      // Convert message to audio and send
      const result = await this.leaveMessage(message, websocketClient);

      // Update call log
      await CallLog.findByIdAndUpdate(callLogId, {
        $set: {
          'metadata.voicemailDetected': true,
          'metadata.voicemailMessageLeft': result.success,
          'metadata.voicemailDetectionResult': detectionResult
        }
      });

      logger.info('Voicemail message completed', {
        callLogId,
        success: result.success,
        messageDuration: result.messageDuration
      });

      return {
        success: result.success,
        messageLeft: result.success,
        messageDuration: result.messageDuration,
        detectionResult,
        timestamp: new Date()
      };
    } catch (error: any) {
      logger.error('Failed to handle voicemail', {
        callLogId,
        error: error.message,
        stack: error.stack
      });

      const detectionResult: VoicemailDetectionResult = {
        isVoicemail: false,
        confidence: 0,
        signals: {},
        detectionMethod: 'keyword',
        timestamp: new Date()
      };

      return {
        success: false,
        messageLeft: false,
        error: error.message,
        detectionResult,
        timestamp: new Date()
      };
    }
  }

  /**
   * Leave voicemail message via WebSocket
   */
  private async leaveMessage(
    message: string,
    websocketClient?: any
  ): Promise<{ success: boolean; messageDuration?: number }> {
    const startTime = Date.now();

    try {
      // Generate TTS audio
      const audioBuffer = await this.generateTTS(message);

      if (!websocketClient) {
        logger.warn('No WebSocket client provided, cannot send audio');
        return { success: false };
      }

      // Send audio via WebSocket
      await this.sendAudioViaWebSocket(audioBuffer, websocketClient);

      const messageDuration = (Date.now() - startTime) / 1000;

      return {
        success: true,
        messageDuration
      };
    } catch (error: any) {
      logger.error('Failed to leave message', {
        error: error.message
      });

      return { success: false };
    }
  }

  /**
   * Generate TTS audio for message
   * TODO: Implement TTS integration when elevenlabsTTSService and deepgramTTSService are ready
   */
  private async generateTTS(message: string): Promise<Buffer> {
    // Placeholder - return empty buffer
    // In production, this would generate actual TTS audio
    logger.warn('TTS generation not yet implemented for voicemail messages');
    return Buffer.from('');
  }

  /**
   * Send audio via WebSocket (Exotel format)
   */
  private async sendAudioViaWebSocket(
    audioBuffer: Buffer,
    websocketClient: any
  ): Promise<void> {
    // Convert to Exotel format (PCM 16-bit, 8kHz, base64)
    // Split into chunks (20ms each = 320 bytes at 8kHz 16-bit)
    const chunkSize = 320;
    let sequenceNumber = 0;

    for (let i = 0; i < audioBuffer.length; i += chunkSize) {
      const chunk = audioBuffer.slice(i, Math.min(i + chunkSize, audioBuffer.length));
      const base64Chunk = chunk.toString('base64');

      const message = {
        event: 'media',
        media: {
          payload: base64Chunk
        },
        sequenceNumber: sequenceNumber++
      };

      websocketClient.send(JSON.stringify(message));

      // Small delay to prevent overwhelming the connection
      await this.delay(20);
    }

    logger.debug('Audio sent via WebSocket', {
      totalChunks: sequenceNumber,
      totalBytes: audioBuffer.length
    });
  }

  /**
   * Generate message from template
   */
  private generateMessage(callLog: any): string {
    let message = this.config.messageTemplate;

    // Replace template variables
    const agentName = callLog.agentId?.name || 'our team';
    const phoneNumber = callLog.fromPhone || '';

    message = message
      .replace('{agentName}', agentName)
      .replace('{phoneNumber}', phoneNumber)
      .replace('{companyName}', process.env.COMPANY_NAME || 'our company');

    return message;
  }

  /**
   * Delay utility
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<VoicemailMessageConfig>): void {
    this.config = {
      ...this.config,
      ...config
    };

    logger.info('Voicemail message config updated', {
      config: this.config
    });
  }

  /**
   * Get current configuration
   */
  getConfig(): VoicemailMessageConfig {
    return { ...this.config };
  }

  /**
   * Get statistics
   */
  async getStats(userId?: string): Promise<{
    totalVoicemails: number;
    messagesLeft: number;
    messagesFailed: number;
    averageConfidence: number;
  }> {
    const filter: any = {
      'metadata.voicemailDetected': true
    };

    if (userId) {
      filter.userId = userId;
    }

    const voicemailCalls = await CallLog.find(filter);

    const totalVoicemails = voicemailCalls.length;
    const messagesLeft = voicemailCalls.filter(
      call => call.metadata?.voicemailMessageLeft === true
    ).length;
    const messagesFailed = totalVoicemails - messagesLeft;

    const averageConfidence = voicemailCalls.reduce(
      (sum, call) => sum + (call.metadata?.voicemailDetectionResult?.confidence || 0),
      0
    ) / (totalVoicemails || 1);

    return {
      totalVoicemails,
      messagesLeft,
      messagesFailed,
      averageConfidence
    };
  }
}

// Export singleton instance
export const voicemailMessageService = new VoicemailMessageService();
