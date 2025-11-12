/**
 * Scheduled Calls Queue
 * Uses Bull for job scheduling and processing with Redis
 */

import Queue from 'bull';
import { logger } from '../utils/logger';

// Queue job data interface
export interface ScheduledCallJobData {
  scheduledCallId: string;
  phoneNumber: string;
  phoneId: string;      // User's phone record (contains Exotel credentials & appId)
  agentId: string;
  userId: string;
  metadata?: Record<string, any>;
  priority?: 'low' | 'medium' | 'high';
  isRecurring?: boolean;
  originalScheduledCallId?: string; // For recurring calls
}

// Queue options
const queueOptions: Queue.QueueOptions = {
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD,
    db: parseInt(process.env.REDIS_DB || '0')
  },
  defaultJobOptions: {
    attempts: parseInt(process.env.QUEUE_RETRY_ATTEMPTS || '3'),
    backoff: {
      type: 'exponential',
      delay: parseInt(process.env.QUEUE_RETRY_BACKOFF_DELAY || '2000')
    },
    removeOnComplete: {
      age: 86400, // Keep completed jobs for 24 hours
      count: 1000  // Keep max 1000 completed jobs
    },
    removeOnFail: {
      age: 604800 // Keep failed jobs for 7 days
    }
  }
};

// Create queue instance
export const scheduledCallsQueue = new Queue<ScheduledCallJobData>(
  'scheduled-calls',
  queueOptions
);

// Queue event handlers
scheduledCallsQueue.on('error', (error) => {
  logger.error('Scheduled calls queue error', {
    error: error.message,
    stack: error.stack
  });
});

scheduledCallsQueue.on('waiting', (jobId) => {
  logger.debug('Job waiting', { jobId, queue: 'scheduled-calls' });
});

scheduledCallsQueue.on('active', (job) => {
  logger.info('Job started', {
    jobId: job.id,
    scheduledCallId: job.data.scheduledCallId,
    phoneNumber: job.data.phoneNumber,
    queue: 'scheduled-calls'
  });
});

scheduledCallsQueue.on('completed', (job, result) => {
  logger.info('Job completed', {
    jobId: job.id,
    scheduledCallId: job.data.scheduledCallId,
    result,
    queue: 'scheduled-calls'
  });
});

scheduledCallsQueue.on('failed', (job, error) => {
  logger.error('Job failed', {
    jobId: job.id,
    scheduledCallId: job.data.scheduledCallId,
    error: error.message,
    attempts: job.attemptsMade,
    queue: 'scheduled-calls'
  });
});

scheduledCallsQueue.on('stalled', (job) => {
  logger.warn('Job stalled', {
    jobId: job.id,
    scheduledCallId: job.data.scheduledCallId,
    queue: 'scheduled-calls'
  });
});

/**
 * Add a scheduled call job to the queue
 */
export async function addScheduledCallJob(
  data: ScheduledCallJobData,
  scheduledTime: Date,
  options?: {
    priority?: number;
    jobId?: string;
  }
): Promise<Queue.Job<ScheduledCallJobData>> {
  const delay = scheduledTime.getTime() - Date.now();

  const jobOptions: Queue.JobOptions = {
    jobId: options?.jobId,
    priority: options?.priority,
    delay: delay > 0 ? delay : 0
  };

  logger.info('Adding scheduled call job', {
    scheduledCallId: data.scheduledCallId,
    phoneNumber: data.phoneNumber,
    scheduledTime,
    delay
  });

  const job = await scheduledCallsQueue.add(data, jobOptions);

  return job;
}

/**
 * Cancel a scheduled call job
 */
export async function cancelScheduledCallJob(jobId: string): Promise<void> {
  const job = await scheduledCallsQueue.getJob(jobId);

  if (!job) {
    logger.warn('Job not found for cancellation', { jobId });
    return;
  }

  await job.remove();

  logger.info('Job cancelled', {
    jobId,
    scheduledCallId: job.data.scheduledCallId
  });
}

/**
 * Get scheduled call job status
 */
export async function getScheduledCallJobStatus(jobId: string): Promise<{
  state: string;
  progress: number;
  attemptsMade: number;
  failedReason?: string;
  processedOn?: number;
  finishedOn?: number;
} | null> {
  const job = await scheduledCallsQueue.getJob(jobId);

  if (!job) {
    return null;
  }

  const state = await job.getState();

  return {
    state,
    progress: job.progress(),
    attemptsMade: job.attemptsMade,
    failedReason: job.failedReason,
    processedOn: job.processedOn,
    finishedOn: job.finishedOn
  };
}

/**
 * Get queue statistics
 */
export async function getQueueStats() {
  const [
    waiting,
    active,
    completed,
    failed,
    delayed,
    paused
  ] = await Promise.all([
    scheduledCallsQueue.getWaitingCount(),
    scheduledCallsQueue.getActiveCount(),
    scheduledCallsQueue.getCompletedCount(),
    scheduledCallsQueue.getFailedCount(),
    scheduledCallsQueue.getDelayedCount(),
    scheduledCallsQueue.getPausedCount()
  ]);

  return {
    waiting,
    active,
    completed,
    failed,
    delayed,
    paused,
    total: waiting + active + completed + failed + delayed + paused
  };
}

/**
 * Clean old jobs from the queue
 */
export async function cleanQueue(grace: number = 86400000): Promise<void> {
  await scheduledCallsQueue.clean(grace, 'completed');
  await scheduledCallsQueue.clean(grace * 7, 'failed'); // Keep failed jobs longer

  logger.info('Queue cleaned', {
    grace,
    queue: 'scheduled-calls'
  });
}

/**
 * Pause the queue
 */
export async function pauseQueue(): Promise<void> {
  await scheduledCallsQueue.pause();
  logger.info('Queue paused', { queue: 'scheduled-calls' });
}

/**
 * Resume the queue
 */
export async function resumeQueue(): Promise<void> {
  await scheduledCallsQueue.resume();
  logger.info('Queue resumed', { queue: 'scheduled-calls' });
}

/**
 * Gracefully close the queue
 */
export async function closeQueue(): Promise<void> {
  await scheduledCallsQueue.close();
  logger.info('Queue closed', { queue: 'scheduled-calls' });
}

logger.info('Scheduled calls queue initialized', {
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || '6379',
    db: process.env.REDIS_DB || '0'
  }
});
