/**
 * Scheduled Calls Queue Processor
 * Processes scheduled call jobs when their time arrives
 * Also handles retry jobs (isRetry flag in metadata)
 */

import { Job } from 'bull';
import { scheduledCallsQueue, ScheduledCallJobData } from '../scheduledCalls.queue';
import { outgoingCallService } from '../../services/outgoingCall.service';
import { ScheduledCall } from '../../models/ScheduledCall';
import { logger } from '../../utils/logger';
import { isRetryJob, extractRetryJobData, processRetryAttempt } from './retryProcessor';

/**
 * Process a scheduled call job
 */
async function processScheduledCall(job: Job<ScheduledCallJobData>): Promise<string> {
  const { scheduledCallId, phoneNumber, phoneId, agentId, userId, metadata, priority, isRecurring } = job.data;

  logger.info('Processing scheduled call', {
    jobId: job.id,
    scheduledCallId,
    phoneNumber,
    isRecurring
  });

  try {
    // Get scheduled call record
    const scheduledCall = await ScheduledCall.findById(scheduledCallId);

    if (!scheduledCall) {
      throw new Error(`Scheduled call not found: ${scheduledCallId}`);
    }

    // Check if already processed or cancelled
    if (scheduledCall.status !== 'pending') {
      logger.warn('Scheduled call not in pending status', {
        scheduledCallId,
        status: scheduledCall.status
      });
      return `Skipped: status is ${scheduledCall.status}`;
    }

    // Update status to processing
    scheduledCall.status = 'processing';
    scheduledCall.processedAt = new Date();
    await scheduledCall.save();

    // Initiate the outbound call
    const callLogId = await outgoingCallService.initiateCall({
      phoneNumber,
      phoneId,
      agentId,
      userId,
      metadata: {
        ...metadata,
        scheduledCallId,
        isScheduled: true,
        isRecurring: isRecurring || false
      },
      priority
    });

    // Update scheduled call with callLogId
    scheduledCall.callLogId = callLogId as any;
    scheduledCall.status = 'completed';
    await scheduledCall.save();

    logger.info('Scheduled call initiated successfully', {
      scheduledCallId,
      callLogId,
      phoneNumber
    });

    // If this is a recurring call, schedule the next occurrence
    if (isRecurring && scheduledCall.recurring) {
      await scheduleNextRecurrence(scheduledCall);
    }

    return callLogId;
  } catch (error: any) {
    logger.error('Failed to process scheduled call', {
      scheduledCallId,
      error: error.message,
      stack: error.stack
    });

    // Update scheduled call status to failed
    try {
      await ScheduledCall.findByIdAndUpdate(scheduledCallId, {
        status: 'failed',
        processedAt: new Date(),
        $set: {
          'metadata.error': {
            message: error.message,
            timestamp: new Date()
          }
        }
      });
    } catch (updateError) {
      logger.error('Failed to update scheduled call status', { updateError });
    }

    throw error;
  }
}

/**
 * Schedule the next recurrence of a recurring call
 */
async function scheduleNextRecurrence(scheduledCall: any): Promise<void> {
  if (!scheduledCall.recurring) {
    return;
  }

  const { frequency, interval, endDate, maxOccurrences, currentOccurrence } = scheduledCall.recurring;

  // Check if we've reached the max occurrences
  if (maxOccurrences && currentOccurrence >= maxOccurrences) {
    logger.info('Recurring call reached max occurrences', {
      scheduledCallId: scheduledCall._id,
      maxOccurrences
    });
    return;
  }

  // Calculate next scheduled time
  const nextScheduledTime = calculateNextScheduledTime(
    scheduledCall.scheduledFor,
    frequency,
    interval
  );

  // Check if next occurrence is after end date
  if (endDate && nextScheduledTime > endDate) {
    logger.info('Recurring call reached end date', {
      scheduledCallId: scheduledCall._id,
      endDate
    });
    return;
  }

  // Create new scheduled call for next occurrence
  const nextScheduledCall = await ScheduledCall.create({
    phoneNumber: scheduledCall.phoneNumber,
    agentId: scheduledCall.agentId,
    userId: scheduledCall.userId,
    scheduledFor: nextScheduledTime,
    timezone: scheduledCall.timezone,
    status: 'pending',
    respectBusinessHours: scheduledCall.respectBusinessHours,
    businessHours: scheduledCall.businessHours,
    recurring: {
      frequency,
      interval,
      endDate,
      maxOccurrences,
      currentOccurrence: currentOccurrence + 1
    },
    metadata: {
      ...scheduledCall.metadata,
      parentScheduledCallId: scheduledCall._id,
      occurrenceNumber: currentOccurrence + 1
    }
  });

  logger.info('Next recurrence scheduled', {
    originalScheduledCallId: scheduledCall._id,
    nextScheduledCallId: nextScheduledCall._id,
    nextScheduledTime,
    occurrenceNumber: currentOccurrence + 1
  });

  // Add to queue (this will be handled by CallScheduler service)
  // For now, we'll let the CallScheduler pick it up
}

/**
 * Calculate next scheduled time based on frequency and interval
 */
function calculateNextScheduledTime(
  currentTime: Date,
  frequency: 'daily' | 'weekly' | 'monthly',
  interval: number
): Date {
  const nextTime = new Date(currentTime);

  switch (frequency) {
    case 'daily':
      nextTime.setDate(nextTime.getDate() + interval);
      break;

    case 'weekly':
      nextTime.setDate(nextTime.getDate() + (interval * 7));
      break;

    case 'monthly':
      nextTime.setMonth(nextTime.getMonth() + interval);
      break;
  }

  return nextTime;
}

// Register the processor with retry job handling
scheduledCallsQueue.process(async (job) => {
  // Check if this is a retry job
  if (isRetryJob(job.data)) {
    logger.info('Detected retry job, routing to retry processor', {
      jobId: job.id,
      scheduledCallId: job.data.scheduledCallId
    });

    const retryJobData = extractRetryJobData(job.data);
    if (retryJobData) {
      return await processRetryAttempt({ ...job, data: retryJobData } as any);
    }
  }

  // Otherwise process as regular scheduled call
  return await processScheduledCall(job);
});

logger.info('Scheduled calls processor registered (with retry support)');

export { processScheduledCall };
