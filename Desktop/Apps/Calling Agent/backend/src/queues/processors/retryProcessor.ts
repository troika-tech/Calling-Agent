/**
 * Retry Processor
 * Processes retry attempts for failed calls
 *
 * This processor is integrated with the scheduledCallsProcessor.
 * When a job contains metadata.isRetry = true, it's treated as a retry.
 */

import { Job } from 'bull';
import { RetryAttempt } from '../../models/RetryAttempt';
import { outgoingCallService } from '../../services/outgoingCall.service';
import { retryManagerService } from '../../services/retryManager.service';
import { logger } from '../../utils/logger';
import mongoose from 'mongoose';

export interface RetryJobData {
  retryAttemptId: string;
  originalCallLogId: string;
  phoneNumber: string;
  phoneId: string;      // User's phone record (contains Exotel credentials & appId)
  agentId: string;
  userId: string;
  attemptNumber: number;
  failureType: string;
  metadata?: Record<string, any>;
}

/**
 * Process a retry attempt
 */
export async function processRetryAttempt(job: Job<RetryJobData>): Promise<string> {
  const {
    retryAttemptId,
    originalCallLogId,
    phoneNumber,
    phoneId,
    agentId,
    userId,
    attemptNumber,
    failureType,
    metadata = {}
  } = job.data;

  logger.info('Processing retry attempt', {
    jobId: job.id,
    retryAttemptId,
    originalCallLogId,
    attemptNumber,
    failureType,
    phoneNumber
  });

  // Fetch RetryAttempt record
  const retryAttempt = await RetryAttempt.findById(retryAttemptId);

  if (!retryAttempt) {
    const error = `RetryAttempt not found: ${retryAttemptId}`;
    logger.error(error, { retryAttemptId });
    throw new Error(error);
  }

  // Check if already processed (idempotency)
  if (retryAttempt.status !== 'pending') {
    logger.warn('RetryAttempt already processed', {
      retryAttemptId,
      status: retryAttempt.status
    });
    return `Already processed with status: ${retryAttempt.status}`;
  }

  // Update status to processing
  retryAttempt.status = 'processing';
  retryAttempt.processedAt = new Date();
  await retryAttempt.save();

  try {
    // Initiate the retry call
    logger.info('Initiating retry call', {
      retryAttemptId,
      attemptNumber,
      phoneNumber,
      agentId
    });

    const callLogId = await outgoingCallService.initiateCall({
      phoneNumber,
      phoneId,
      agentId,
      userId,
      metadata: {
        ...metadata,
        isRetry: true,
        originalCallLogId,
        retryAttemptId,
        attemptNumber,
        failureType
      }
    });

    // Update retry attempt with new call log
    retryAttempt.retryCallLogId = new mongoose.Types.ObjectId(callLogId);
    retryAttempt.status = 'completed';
    await retryAttempt.save();

    logger.info('Retry attempt completed', {
      retryAttemptId,
      newCallLogId: callLogId,
      attemptNumber
    });

    return callLogId;

  } catch (error: any) {
    logger.error('Retry attempt failed', {
      retryAttemptId,
      attemptNumber,
      error: error.message,
      stack: error.stack
    });

    // Update retry attempt status
    retryAttempt.status = 'failed';
    retryAttempt.failedAt = new Date();
    retryAttempt.metadata = {
      ...retryAttempt.metadata,
      error: error.message,
      errorStack: error.stack
    };
    await retryAttempt.save();

    // Schedule next retry if applicable
    try {
      await retryManagerService.scheduleRetry(originalCallLogId, {
        respectOffPeakHours: true,
        metadata: {
          previousRetryAttemptId: retryAttemptId,
          previousError: error.message
        }
      });
    } catch (scheduleError: any) {
      logger.error('Failed to schedule next retry', {
        originalCallLogId,
        error: scheduleError.message
      });
    }

    throw error;
  }
}

/**
 * Check if a job is a retry job
 */
export function isRetryJob(jobData: any): boolean {
  return jobData.metadata?.isRetry === true;
}

/**
 * Extract retry job data from scheduled call job data
 */
export function extractRetryJobData(jobData: any): RetryJobData | null {
  if (!isRetryJob(jobData)) {
    return null;
  }

  const metadata = jobData.metadata || {};

  return {
    retryAttemptId: jobData.scheduledCallId, // For retries, scheduledCallId is the retryAttemptId
    originalCallLogId: metadata.originalCallLogId,
    phoneNumber: jobData.phoneNumber,
    phoneId: jobData.phoneId,
    agentId: jobData.agentId,
    userId: jobData.userId,
    attemptNumber: metadata.attemptNumber || 1,
    failureType: metadata.failureType || 'unknown',
    metadata: metadata
  };
}

logger.info('Retry processor initialized');
