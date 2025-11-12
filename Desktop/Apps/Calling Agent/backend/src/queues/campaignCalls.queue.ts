/**
 * Campaign Calls Queue
 * Uses BullMQ for advanced features like concurrency control and grouping
 */

import { Queue, QueueEvents, QueueOptions, JobsOptions } from 'bullmq';
import { logger } from '../utils/logger';
import { redis as redisClient } from '../config/redis';
import { TTL_CONFIG } from '../config/ttls';
import { metrics } from '../utils/metrics';
import IORedis from 'ioredis';

// Queue job data interface
export interface CampaignCallJobData {
  campaignId: string;
  campaignContactId: string;
  agentId: string;
  phoneNumber: string;
  phoneId?: string;  // User's phone record (contains Exotel credentials)
  userId: string;

  // Contact details
  name?: string;
  email?: string;
  customData?: Record<string, any>;

  // Retry tracking
  retryCount: number;
  isRetry: boolean;

  // Priority
  priority: number;

  // Promotion gate (added by promoter)
  promoteSeq?: number;
  promotedAt?: number;

  metadata?: Record<string, any>;
}

// Create Redis connection for BullMQ
const connection = new IORedis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
  db: parseInt(process.env.REDIS_DB || '0'),
  maxRetriesPerRequest: null,  // Required for BullMQ
  enableReadyCheck: false
});

// Queue options
const queueOptions: QueueOptions = {
  connection,
  defaultJobOptions: {
    attempts: 3,  // Retry attempts for actual failures (not for slot waits)
    backoff: {
      type: 'exponential',
      delay: 5000
    },
    removeOnComplete: {
      age: 86400,  // Keep completed jobs for 24 hours
      count: 1000
    },
    removeOnFail: {
      age: 604800  // Keep failed jobs for 7 days
    }
  }
};

// Create queue instance
export const campaignCallsQueue = new Queue<CampaignCallJobData>(
  'campaign-calls',
  queueOptions
);
// Create queue events listener for job lifecycle events
export const campaignQueueEvents = new QueueEvents(
  'campaign-calls',
  { connection }
);

// Queue event handlers
campaignCallsQueue.on('error', (error) => {
  logger.error('Campaign calls queue error', {
    error: error.message,
    stack: error.stack
  });
});

(campaignCallsQueue as any).on('waiting', (job: any) => {
});

(campaignCallsQueue as any).on('active', (job: any) => {
  // Removed verbose log
});

(campaignCallsQueue as any).on('completed', (job: any) => {
  logger.info('Job completed', {
    jobId: job?.id,
    queue: 'campaign-calls'
  });
});

(campaignCallsQueue as any).on('failed', (job: any, error: Error) => {
  logger.error('Job failed', {
    jobId: job?.id,
    failedReason: error?.message,
    queue: 'campaign-calls'
  });
});

/**
 * Add a campaign call job to the queue
 * Jobs are added to delayed state (24h default) and synced to waitlist via events
 * Promoter moves jobs from delayed → waiting when slots are available
 */
export async function addCampaignCallJob(
  data: CampaignCallJobData,
  options?: {
    priority?: number;
    delay?: number;
    jobId?: string;
  }
): Promise<string> {
  const jobOptions: JobsOptions = {
    jobId: options?.jobId,
    priority: options?.priority || data.priority,
    // Force delay to ensure promoter controls job flow
    delay: options?.delay || 86400000  // 24h default, promoter moves to waiting
  };

  const job = await campaignCallsQueue.add(
    `call-${data.campaignContactId}`,
    data,
    jobOptions
  );

  // Dedup check - track by contact ID
  const dedupeKey = `campaign:{${data.campaignId}}:waitlist:seen`;
  const contactKey = data.campaignContactId;
  const isNew = await redisClient.sAdd(dedupeKey, contactKey);
  await redisClient.expire(dedupeKey, TTL_CONFIG.dedupTTL);

  if (!isNew) {
    logger.warn('Duplicate contact enqueue detected', {
      campaignId: data.campaignId,
      contactId: contactKey
    });
    metrics.inc('duplicate_enqueue', { campaign: data.campaignId });
  }

  // Job will automatically trigger 'delayed' event → sync to waitlist

  return job.id!;
}

/**
 * Add multiple campaign call jobs in bulk
 */
export async function addBulkCampaignCallJobs(
  jobs: Array<{
    data: CampaignCallJobData;
    options?: {
      priority?: number;
      delay?: number;
      jobId?: string;
    };
  }>
): Promise<string[]> {
  const bulkJobs = jobs.map(({ data, options }) => ({
    name: `call-${data.campaignContactId}`,
    data,
    opts: {
      jobId: options?.jobId,
      priority: options?.priority || data.priority,
      // Force delay to ensure promoter controls job flow (same as addCampaignCallJob)
      delay: options?.delay !== undefined ? options.delay : 86400000  // 24h default
    }
  }));

  logger.info('Adding bulk campaign call jobs', {
    count: bulkJobs.length
  });

  const addedJobs = await campaignCallsQueue.addBulk(bulkJobs);
  return addedJobs.map(job => job.id!);
}

/**
 * Remove a job from the queue
 */
export async function removeCampaignCallJob(jobId: string): Promise<void> {
  const job = await campaignCallsQueue.getJob(jobId);

  if (!job) {
    logger.warn('Job not found for removal', { jobId });
    return;
  }

  await job.remove();

  logger.info('Job removed', {
    jobId,
    campaignContactId: job.data.campaignContactId
  });
}

/**
 * Get job status
 */
export async function getCampaignCallJobStatus(jobId: string): Promise<{
  state: string;
  progress: number | object;
  attemptsMade: number;
  failedReason?: string;
  processedOn?: number;
  finishedOn?: number;
  data?: CampaignCallJobData;
} | null> {
  const job = await campaignCallsQueue.getJob(jobId);

  if (!job) {
    return null;
  }

  const state = await job.getState();

  return {
    state,
    progress: job.progress as number | object,
    attemptsMade: job.attemptsMade,
    failedReason: job.failedReason,
    processedOn: job.processedOn,
    finishedOn: job.finishedOn,
    data: job.data
  };
}

/**
 * Get all jobs for a campaign
 */
export async function getCampaignJobs(campaignId: string): Promise<Array<{
  id: string;
  state: string;
  data: CampaignCallJobData;
}>> {
  const [waiting, active, completed, failed, delayed] = await Promise.all([
    campaignCallsQueue.getWaiting(),
    campaignCallsQueue.getActive(),
    campaignCallsQueue.getCompleted(),
    campaignCallsQueue.getFailed(),
    campaignCallsQueue.getDelayed()
  ]);

  const allJobs = [...waiting, ...active, ...completed, ...failed, ...delayed];
  const campaignJobs = allJobs.filter(job => job.data.campaignId === campaignId);

  return Promise.all(
    campaignJobs.map(async (job) => ({
      id: job.id!,
      state: await job.getState(),
      data: job.data
    }))
  );
}

/**
 * Get queue statistics
 */
export async function getCampaignQueueStats() {
  const [
    waiting,
    active,
    completed,
    failed,
    delayed,
    paused
  ] = await Promise.all([
    campaignCallsQueue.getWaitingCount(),
    campaignCallsQueue.getActiveCount(),
    campaignCallsQueue.getCompletedCount(),
    campaignCallsQueue.getFailedCount(),
    campaignCallsQueue.getDelayedCount(),
    campaignCallsQueue.isPaused()
  ]);

  return {
    waiting,
    active,
    completed,
    failed,
    delayed,
    paused: paused ? 1 : 0,
    total: waiting + active + completed + failed + delayed
  };
}

/**
 * Get statistics for a specific campaign
 */
export async function getCampaignStats(campaignId: string) {
  const jobs = await getCampaignJobs(campaignId);

  const stats = {
    total: jobs.length,
    waiting: 0,
    active: 0,
    completed: 0,
    failed: 0,
    delayed: 0
  };

  jobs.forEach(job => {
    switch (job.state) {
      case 'waiting':
        stats.waiting++;
        break;
      case 'active':
        stats.active++;
        break;
      case 'completed':
        stats.completed++;
        break;
      case 'failed':
        stats.failed++;
        break;
      case 'delayed':
        stats.delayed++;
        break;
    }
  });

  return stats;
}

/**
 * Pause the queue
 */
export async function pauseCampaignQueue(): Promise<void> {
  await campaignCallsQueue.pause();
  logger.info('Campaign queue paused');
}

/**
 * Resume the queue
 */
export async function resumeCampaignQueue(): Promise<void> {
  await campaignCallsQueue.resume();
  logger.info('Campaign queue resumed');
}

/**
 * Pause jobs for a specific campaign
 */
export async function pauseCampaign(campaignId: string): Promise<void> {
  const jobs = await getCampaignJobs(campaignId);
  const waitingJobs = jobs.filter(j => j.state === 'waiting' || j.state === 'delayed');

  for (const jobInfo of waitingJobs) {
    const job = await campaignCallsQueue.getJob(jobInfo.id);
    if (job) {
      // Move to delayed state with very long delay to effectively pause
      await job.moveToDelayed(Date.now() + 365 * 24 * 60 * 60 * 1000, job.token);
    }
  }

  logger.info('Campaign jobs paused', { campaignId, count: waitingJobs.length });
}

/**
 * Resume jobs for a specific campaign
 */
export async function resumeCampaign(campaignId: string): Promise<void> {
  const jobs = await getCampaignJobs(campaignId);
  const delayedJobs = jobs.filter(j => j.state === 'delayed');

  for (const jobInfo of delayedJobs) {
    const job = await campaignCallsQueue.getJob(jobInfo.id);
    if (job) {
      // Promote delayed job to waiting
      await job.promote();
    }
  }

  logger.info('Campaign jobs resumed', { campaignId, count: delayedJobs.length });
}

/**
 * Cancel all jobs for a campaign
 */
export async function cancelCampaignJobs(campaignId: string): Promise<number> {
  const jobs = await getCampaignJobs(campaignId);
  const removableJobs = jobs.filter(j =>
    j.state === 'waiting' || j.state === 'delayed' || j.state === 'failed'
  );

  let removed = 0;
  for (const jobInfo of removableJobs) {
    try {
      await removeCampaignCallJob(jobInfo.id);
      removed++;
    } catch (error) {
      logger.error('Error removing job', { jobId: jobInfo.id, error });
    }
  }

  logger.info('Campaign jobs cancelled', { campaignId, removed, total: removableJobs.length });
  return removed;
}

/**
 * Clean old jobs from the queue
 */
export async function cleanCampaignQueue(grace: number = 86400000): Promise<void> {
  await campaignCallsQueue.clean(grace, 100, 'completed');
  await campaignCallsQueue.clean(grace * 7, 100, 'failed');

  logger.info('Campaign queue cleaned', { grace });
}

/**
 * Gracefully close the queue
 */
export async function closeCampaignQueue(): Promise<void> {
  await campaignCallsQueue.close();
  logger.info('Campaign queue closed');
}

// ====== Event Listeners for Waitlist Sync ======

/**
 * Helper to cleanup marker by jobId
 */
async function cleanupMarkerById(jobId: string, campaignId: string) {
  const markerKey = `campaign:{${campaignId}}:waitlist:marker:${jobId}`;
  await redisClient.del(markerKey);
}

// Event: job moved to delayed → sync to waitlist
campaignQueueEvents.on('delayed', async ({ jobId }: { jobId: string }) => {
  try {
    const job = await campaignCallsQueue.getJob(jobId);
    if (!job?.data?.campaignId) return;

    const campaignId = job.data.campaignId;
    const priority = (job.opts?.priority || 0) > 0 ? 'high' : 'normal';
    const waitlistKey = `campaign:{${campaignId}}:waitlist:${priority}`;
    const markerKey = `campaign:{${campaignId}}:waitlist:marker:${jobId}`;

    // Idempotent push with marker
    const ok = await redisClient.set(markerKey, '1', {
      EX: TTL_CONFIG.markerTTL,
      NX: true
    });

    if (ok) {
      await redisClient.rPush(waitlistKey, jobId);
    }
  } catch (error: any) {
    logger.error('Failed to sync job to waitlist', {
      jobId,
      error: error.message
    });
  }
});

// Event: job completed → remove marker
campaignQueueEvents.on('completed', async ({ jobId }: { jobId: string }) => {
  try {
    const job = await campaignCallsQueue.getJob(jobId);
    if (job?.data?.campaignId) {
      await cleanupMarkerById(jobId, job.data.campaignId);
    }
  } catch (error: any) {
    logger.error('Failed to cleanup marker on completed', { jobId, error: error.message });
  }
});

// Event: job failed → remove marker
campaignQueueEvents.on('failed', async ({ jobId }: { jobId: string }) => {
  try {
    const job = await campaignCallsQueue.getJob(jobId);
    if (job?.data?.campaignId) {
      await cleanupMarkerById(jobId, job.data.campaignId);
    }
  } catch (error: any) {
    logger.error('Failed to cleanup marker on failed', { jobId, error: error.message });
  }
});

// Event: job moved to waiting → remove marker
campaignQueueEvents.on('waiting', async ({ jobId }: { jobId: string }) => {
  try {
    const job = await campaignCallsQueue.getJob(jobId);
    if (job?.data?.campaignId) {
      await cleanupMarkerById(jobId, job.data.campaignId);
    }
  } catch (error: any) {
    logger.error('Failed to cleanup marker on waiting', { jobId, error: error.message });
  }
});

// Event: job became active → remove marker
campaignQueueEvents.on('active', async ({ jobId }: { jobId: string }) => {
  try {
    const job = await campaignCallsQueue.getJob(jobId);
    if (job?.data?.campaignId) {
      await cleanupMarkerById(jobId, job.data.campaignId);
    }
  } catch (error: any) {
    logger.error('Failed to cleanup marker on active', { jobId, error: error.message });
  }
});

// Event: job stalled → remove marker
campaignQueueEvents.on('stalled', async ({ jobId }: { jobId: string }) => {
  try {
    const job = await campaignCallsQueue.getJob(jobId);
    if (job?.data?.campaignId) {
      await cleanupMarkerById(jobId, job.data.campaignId);
      logger.warn('Job stalled, cleared marker', {
        jobId,
        campaignId: job.data.campaignId
      });
    }
  } catch (error: any) {
    logger.error('Failed to cleanup marker on stalled', { jobId, error: error.message });
  }
});

logger.info('Campaign calls queue initialized', {
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || '6379',
    db: process.env.REDIS_DB || '0'
  }
});
