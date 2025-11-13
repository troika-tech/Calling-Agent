import { CallLog } from '../models/CallLog';
import { logger } from '../utils/logger';
import { exotelService } from './exotel.service';

/**
 * Stuck Call Monitor Service
 * Monitors calls stuck in "ringing" status and updates them based on timeout
 * Runs every 2 minutes to check for calls stuck for more than 3 minutes
 */
class StuckCallMonitorService {
  private intervalId: NodeJS.Timeout | null = null;
  private running = false;
  private readonly CHECK_INTERVAL = 2 * 60 * 1000; // 2 minutes
  private readonly STUCK_THRESHOLD = 3 * 60 * 1000; // 3 minutes

  async start() {
    if (this.intervalId) return;

    this.intervalId = setInterval(() => {
      this.checkStuckCalls().catch(err => {
        logger.error('Stuck call monitor failed', { error: err.message });
      });
    }, this.CHECK_INTERVAL);

    logger.info('✅ Stuck call monitor service started', {
      interval: `${this.CHECK_INTERVAL}ms`,
      threshold: `${this.STUCK_THRESHOLD}ms`
    });
  }

  async stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.running = false;
    logger.info('Stuck call monitor service stopped');
  }

  private async checkStuckCalls() {
    if (this.running) {
      logger.debug('Stuck call monitor already running, skipping');
      return;
    }

    this.running = true;

    try {
      const thresholdTime = new Date(Date.now() - this.STUCK_THRESHOLD);

      // Find calls stuck in "ringing" status for more than threshold
      const stuckCalls = await CallLog.find({
        status: 'ringing',
        createdAt: { $lte: thresholdTime },
        endedAt: { $exists: false }
      }).limit(50); // Limit to 50 calls per check to avoid overload

      if (stuckCalls.length === 0) {
        logger.debug('No stuck calls found');
        return;
      }

      logger.info('🔍 Found stuck calls', {
        count: stuckCalls.length,
        thresholdMinutes: this.STUCK_THRESHOLD / 60000
      });

      // Process each stuck call
      for (const callLog of stuckCalls) {
        await this.processStuckCall(callLog);
      }
    } catch (error: any) {
      logger.error('Error checking stuck calls', {
        error: error.message,
        errorStack: error.stack
      });
    } finally {
      this.running = false;
    }
  }

  private async processStuckCall(callLog: any) {
    try {
      const callAge = Date.now() - callLog.createdAt.getTime();
      const ageMinutes = Math.round(callAge / 60000);

      logger.warn('⚠️ Processing stuck call', {
        callLogId: callLog._id.toString(),
        status: callLog.status,
        ageMinutes,
        exotelCallSid: callLog.exotelCallSid,
        direction: callLog.direction
      });

      // If we have exotelCallSid, try to query Exotel API for actual status
      if (callLog.exotelCallSid) {
        try {
          // Note: This would require an Exotel API method to get call details
          // For now, we'll mark as no-answer based on timeout
          logger.info('Call has exotelCallSid but no status update received', {
            callLogId: callLog._id.toString(),
            exotelCallSid: callLog.exotelCallSid
          });
        } catch (error: any) {
          logger.error('Failed to query Exotel for call status', {
            callLogId: callLog._id.toString(),
            exotelCallSid: callLog.exotelCallSid,
            error: error.message
          });
        }
      }

      // Mark as no-answer if stuck for more than threshold
      // This is a fallback when webhook is not received
      callLog.status = 'no-answer';
      callLog.outboundStatus = callLog.direction === 'outbound' ? 'no_answer' : undefined;
      callLog.endedAt = new Date();
      callLog.durationSec = 0;

      // Update metadata
      callLog.metadata = {
        ...callLog.metadata,
        stuckCallResolved: true,
        stuckCallResolvedAt: new Date().toISOString(),
        stuckCallAgeMinutes: ageMinutes,
        resolvedBy: 'stuckCallMonitor'
      };

      await callLog.save();

      logger.info('✅ Stuck call resolved', {
        callLogId: callLog._id.toString(),
        previousStatus: 'ringing',
        newStatus: 'no-answer',
        ageMinutes
      });

      // If outbound call, mark as ended in OutgoingCallService
      if (callLog.direction === 'outbound') {
        try {
          const { outgoingCallService } = await import('./outgoingCall.service');
          await outgoingCallService.markCallEnded(callLog._id.toString());
        } catch (error: any) {
          logger.error('Failed to mark outbound call as ended', {
            callLogId: callLog._id.toString(),
            error: error.message
          });
        }
      }
    } catch (error: any) {
      logger.error('Failed to process stuck call', {
        callLogId: callLog._id.toString(),
        error: error.message,
        errorStack: error.stack
      });
    }
  }
}

export const stuckCallMonitorService = new StuckCallMonitorService();

