/**
 * Retry Manager Service
 * Handles intelligent retry logic for failed outbound calls
 * Features:
 * - Exponential backoff strategy
 * - Failure type categorization
 * - Off-peak scheduling
 * - Idempotency & error recovery
 */

import moment from 'moment-timezone';
import { CallLog } from '../models/CallLog';
import { RetryAttempt } from '../models/RetryAttempt';
import { logger } from '../utils/logger';
import { addScheduledCallJob } from '../queues/scheduledCalls.queue';
import mongoose from 'mongoose';

/**
 * Failure types and their retry configurations
 */
export const RETRY_CONFIG = {
  no_answer: {
    maxAttempts: 3,
    baseDelay: 300000, // 5 minutes
    backoffMultiplier: 2,
    retryable: true
  },
  busy: {
    maxAttempts: 3,
    baseDelay: 600000, // 10 minutes
    backoffMultiplier: 2,
    retryable: true
  },
  voicemail: {
    maxAttempts: 2,
    baseDelay: 1800000, // 30 minutes
    backoffMultiplier: 2,
    retryable: true
  },
  network_error: {
    maxAttempts: 5,
    baseDelay: 120000, // 2 minutes
    backoffMultiplier: 2,
    retryable: true
  },
  call_rejected: {
    maxAttempts: 1,
    baseDelay: 3600000, // 1 hour
    backoffMultiplier: 1,
    retryable: true
  },
  invalid_number: {
    maxAttempts: 0,
    baseDelay: 0,
    backoffMultiplier: 1,
    retryable: false
  },
  blocked: {
    maxAttempts: 0,
    baseDelay: 0,
    backoffMultiplier: 1,
    retryable: false
  },
  compliance_block: {
    maxAttempts: 0,
    baseDelay: 0,
    backoffMultiplier: 1,
    retryable: false
  }
} as const;

/**
 * Off-peak hours configuration
 * Retries are preferentially scheduled during these times
 */
export const OFF_PEAK_HOURS = {
  start: '10:00', // 10 AM
  end: '16:00',   // 4 PM
  timezone: 'Asia/Kolkata',
  daysOfWeek: [1, 2, 3, 4, 5] // Monday-Friday
};

export interface RetryOptions {
  /**
   * Force retry even if max attempts reached (for manual retries)
   */
  forceRetry?: boolean;

  /**
   * Specific time to schedule the retry
   */
  scheduledFor?: Date;

  /**
   * Respect off-peak hours
   */
  respectOffPeakHours?: boolean;

  /**
   * Override failure reason (for manual retries)
   */
  overrideFailureReason?: string;

  /**
   * Additional metadata
   */
  metadata?: Record<string, any>;
}

export class RetryManagerService {
  /**
   * Categorize a failure and determine if it's retryable
   */
  categorizeFailure(callLog: any): {
    failureType: keyof typeof RETRY_CONFIG;
    isRetryable: boolean;
    config: typeof RETRY_CONFIG[keyof typeof RETRY_CONFIG];
  } {
    let failureType: keyof typeof RETRY_CONFIG = 'network_error'; // Default

    // Extract failure reason from callLog
    const failureReason = callLog.failureReason?.toLowerCase() || '';
    const status = callLog.status?.toLowerCase() || '';

    // Categorize based on failure reason and status
    if (failureReason.includes('no answer') || failureReason.includes('no_answer') || status === 'no_answer') {
      failureType = 'no_answer';
    } else if (failureReason.includes('busy') || status === 'busy') {
      failureType = 'busy';
    } else if (failureReason.includes('voicemail') || status === 'voicemail') {
      failureType = 'voicemail';
    } else if (failureReason.includes('invalid') || failureReason.includes('not found')) {
      failureType = 'invalid_number';
    } else if (failureReason.includes('blocked') || failureReason.includes('blacklist')) {
      failureType = 'blocked';
    } else if (failureReason.includes('compliance') || failureReason.includes('dnd')) {
      failureType = 'compliance_block';
    } else if (failureReason.includes('rejected') || failureReason.includes('declined')) {
      failureType = 'call_rejected';
    } else if (failureReason.includes('network') || failureReason.includes('timeout') || failureReason.includes('connection')) {
      failureType = 'network_error';
    }

    const config = RETRY_CONFIG[failureType];

    logger.info('Failure categorized', {
      callLogId: callLog._id,
      failureReason,
      status,
      categorizedAs: failureType,
      isRetryable: config.retryable
    });

    return {
      failureType,
      isRetryable: config.retryable,
      config
    };
  }

  /**
   * Calculate next retry time with exponential backoff
   */
  calculateRetryTime(
    attemptNumber: number,
    failureType: keyof typeof RETRY_CONFIG,
    options: RetryOptions = {}
  ): Date {
    // If specific time provided, use it
    if (options.scheduledFor) {
      return options.scheduledFor;
    }

    const config = RETRY_CONFIG[failureType];

    // Calculate delay with exponential backoff
    // Formula: baseDelay * (backoffMultiplier ^ (attemptNumber - 1))
    const delay = config.baseDelay * Math.pow(config.backoffMultiplier, attemptNumber - 1);

    // Add jitter (±10%) to prevent thundering herd
    const jitter = delay * 0.1 * (Math.random() * 2 - 1);
    const totalDelay = delay + jitter;

    let retryTime = moment().add(totalDelay, 'milliseconds');

    // Adjust to off-peak hours if requested
    if (options.respectOffPeakHours !== false) {
      retryTime = this.adjustToOffPeakHours(retryTime);
    }

    logger.info('Retry time calculated', {
      attemptNumber,
      failureType,
      baseDelay: config.baseDelay,
      calculatedDelay: delay,
      jitter,
      totalDelay,
      retryTime: retryTime.toISOString(),
      adjustedToOffPeak: options.respectOffPeakHours !== false
    });

    return retryTime.toDate();
  }

  /**
   * Adjust retry time to off-peak hours
   */
  private adjustToOffPeakHours(retryTime: moment.Moment): moment.Moment {
    const { start, end, timezone, daysOfWeek } = OFF_PEAK_HOURS;

    let adjustedTime = moment.tz(retryTime, timezone);

    // Parse off-peak hours
    const [startHour, startMinute] = start.split(':').map(Number);
    const [endHour, endMinute] = end.split(':').map(Number);

    // Check if it's a business day
    while (!daysOfWeek.includes(adjustedTime.day())) {
      // Move to next day at off-peak start
      adjustedTime.add(1, 'day').hour(startHour).minute(startMinute).second(0).millisecond(0);
    }

    // Create off-peak window for current day
    const dayStart = adjustedTime.clone().hour(startHour).minute(startMinute).second(0);
    const dayEnd = adjustedTime.clone().hour(endHour).minute(endMinute).second(0);

    // If before off-peak hours, move to start of off-peak
    if (adjustedTime.isBefore(dayStart)) {
      adjustedTime = dayStart;
    }

    // If after off-peak hours, move to next business day's off-peak start
    if (adjustedTime.isAfter(dayEnd)) {
      adjustedTime.add(1, 'day').hour(startHour).minute(startMinute).second(0).millisecond(0);

      // Check again if it's a business day
      while (!daysOfWeek.includes(adjustedTime.day())) {
        adjustedTime.add(1, 'day');
      }
    }

    logger.debug('Adjusted to off-peak hours', {
      original: retryTime.toISOString(),
      adjusted: adjustedTime.toISOString(),
      offPeakWindow: `${start}-${end}`,
      timezone
    });

    return adjustedTime;
  }

  /**
   * Schedule a retry for a failed call
   */
  async scheduleRetry(
    callLogId: string | mongoose.Types.ObjectId,
    options: RetryOptions = {}
  ): Promise<string | null> {
    const callLog = await CallLog.findById(callLogId)
      .populate('agentId')
      .populate('userId');

    if (!callLog) {
      throw new Error(`CallLog not found: ${callLogId}`);
    }

    // Check if call actually failed
    if (callLog.status !== 'failed' && !options.forceRetry) {
      logger.warn('Cannot retry non-failed call', {
        callLogId,
        status: callLog.status
      });
      return null;
    }

    // Categorize the failure
    const { failureType, isRetryable, config } = this.categorizeFailure(callLog);

    if (!isRetryable && !options.forceRetry) {
      logger.info('Call failure is not retryable', {
        callLogId,
        failureType
      });
      return null;
    }

    // Count existing retry attempts
    const existingAttempts = await RetryAttempt.countDocuments({
      originalCallLogId: callLogId
    });

    const nextAttemptNumber = existingAttempts + 1;

    // Check if max attempts reached
    if (nextAttemptNumber > config.maxAttempts && !options.forceRetry) {
      logger.info('Max retry attempts reached', {
        callLogId,
        failureType,
        attemptNumber: nextAttemptNumber,
        maxAttempts: config.maxAttempts
      });
      return null;
    }

    // Calculate retry time
    const retryTime = this.calculateRetryTime(nextAttemptNumber, failureType, options);

    // Create RetryAttempt record
    const retryAttempt = await RetryAttempt.create({
      originalCallLogId: callLogId,
      attemptNumber: nextAttemptNumber,
      scheduledFor: retryTime,
      status: 'pending',
      failureReason: options.overrideFailureReason || failureType,
      metadata: {
        ...options.metadata,
        originalFailureReason: callLog.failureReason,
        originalStatus: callLog.status,
        retryConfig: config,
        offPeakAdjusted: options.respectOffPeakHours !== false
      }
    });

    // Schedule the retry using the scheduling queue
    const job = await addScheduledCallJob(
      {
        scheduledCallId: retryAttempt._id.toString(),
        phoneNumber: callLog.toPhone,
        phoneId: callLog.phoneId?.toString() || '',
        agentId: callLog.agentId._id.toString(),
        userId: callLog.userId._id.toString(),
        metadata: {
          isRetry: true,
          originalCallLogId: callLogId.toString(),
          attemptNumber: nextAttemptNumber,
          failureType
        },
        priority: 'high' // Retries get higher priority
      },
      retryTime,
      {
        jobId: `retry-${retryAttempt._id}`,
        priority: 1 // High priority
      }
    );

    logger.info('Retry scheduled', {
      callLogId,
      retryAttemptId: retryAttempt._id,
      attemptNumber: nextAttemptNumber,
      failureType,
      scheduledFor: retryTime,
      jobId: job.id
    });

    return retryAttempt._id.toString();
  }

  /**
   * Process automatic retries for recent failures
   */
  async processAutomaticRetries(lookbackMinutes: number = 60): Promise<{
    processed: number;
    scheduled: number;
    skipped: number;
  }> {
    const cutoffTime = moment().subtract(lookbackMinutes, 'minutes').toDate();

    // Find failed calls in the lookback window
    const failedCalls = await CallLog.find({
      status: 'failed',
      endTime: { $gte: cutoffTime },
      // Don't retry calls that already have pending retries
      _id: {
        $nin: await RetryAttempt.distinct('originalCallLogId', {
          status: { $in: ['pending', 'processing'] }
        })
      }
    });

    let processed = 0;
    let scheduled = 0;
    let skipped = 0;

    for (const callLog of failedCalls) {
      processed++;

      try {
        const retryAttemptId = await this.scheduleRetry(callLog._id.toString(), {
          respectOffPeakHours: true
        });

        if (retryAttemptId) {
          scheduled++;
        } else {
          skipped++;
        }
      } catch (error: any) {
        logger.error('Failed to schedule automatic retry', {
          callLogId: callLog._id,
          error: error.message
        });
        skipped++;
      }
    }

    logger.info('Automatic retry processing complete', {
      lookbackMinutes,
      processed,
      scheduled,
      skipped
    });

    return { processed, scheduled, skipped };
  }

  /**
   * Cancel a scheduled retry
   */
  async cancelRetry(retryAttemptId: string | mongoose.Types.ObjectId): Promise<void> {
    const retryAttempt = await RetryAttempt.findById(retryAttemptId);

    if (!retryAttempt) {
      throw new Error(`RetryAttempt not found: ${retryAttemptId}`);
    }

    if (retryAttempt.status !== 'pending') {
      throw new Error(`Cannot cancel retry with status: ${retryAttempt.status}`);
    }

    // Cancel the queue job
    const { cancelScheduledCallJob } = await import('../queues/scheduledCalls.queue');
    await cancelScheduledCallJob(`retry-${retryAttemptId}`);

    // Update retry attempt status
    retryAttempt.status = 'cancelled';
    await retryAttempt.save();

    logger.info('Retry cancelled', {
      retryAttemptId,
      originalCallLogId: retryAttempt.originalCallLogId
    });
  }

  /**
   * Get retry statistics
   */
  async getRetryStats(userId?: string): Promise<{
    totalRetries: number;
    pendingRetries: number;
    successfulRetries: number;
    failedRetries: number;
    byFailureType: Record<string, number>;
  }> {
    const filter: any = {};

    if (userId) {
      // Get user's call logs
      const userCallLogs = await CallLog.distinct('_id', { userId });
      filter.originalCallLogId = { $in: userCallLogs };
    }

    const [
      totalRetries,
      pendingRetries,
      successfulRetries,
      failedRetries,
      byFailureType
    ] = await Promise.all([
      RetryAttempt.countDocuments(filter),
      RetryAttempt.countDocuments({ ...filter, status: 'pending' }),
      RetryAttempt.countDocuments({ ...filter, status: 'completed' }),
      RetryAttempt.countDocuments({ ...filter, status: 'failed' }),
      RetryAttempt.aggregate([
        { $match: filter },
        { $group: { _id: '$failureReason', count: { $sum: 1 } } }
      ])
    ]);

    const byFailureTypeMap: Record<string, number> = {};
    byFailureType.forEach((item: any) => {
      byFailureTypeMap[item._id] = item.count;
    });

    return {
      totalRetries,
      pendingRetries,
      successfulRetries,
      failedRetries,
      byFailureType: byFailureTypeMap
    };
  }

  /**
   * Get retry history for a call
   */
  async getRetryHistory(callLogId: string | mongoose.Types.ObjectId): Promise<any[]> {
    const retryAttempts = await RetryAttempt.find({
      originalCallLogId: callLogId
    })
      .populate('retryCallLogId')
      .sort({ attemptNumber: 1 })
      .lean();

    return retryAttempts;
  }
}

// Export singleton instance
export const retryManagerService = new RetryManagerService();
