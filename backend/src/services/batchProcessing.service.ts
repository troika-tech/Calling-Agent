/**
 * Batch Processing Service
 * Handles batch operations for calls with progress tracking
 * Integrates with Bull queue for distributed processing
 */

import Queue from 'bull';
import { logger } from '../utils/logger';
import { CSVCallRecord } from './csvImport.service';
import { callSchedulerService } from './callScheduler.service';
import { outgoingCallService } from './outgoingCall.service';
import mongoose from 'mongoose';

export interface BatchJob {
  batchId: string;
  userId: string;
  type: 'schedule' | 'immediate';
  records: CSVCallRecord[];
  options?: {
    respectBusinessHours?: boolean;
    staggerDelay?: number; // Delay between calls in ms
    priority?: 'low' | 'medium' | 'high';
  };
  createdAt: Date;
}

export interface BatchJobProgress {
  batchId: string;
  total: number;
  processed: number;
  successful: number;
  failed: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  startedAt?: Date;
  completedAt?: Date;
  errors: Array<{
    index: number;
    phoneNumber: string;
    error: string;
  }>;
}

// In-memory storage for batch progress (should be Redis in production)
const batchProgressMap = new Map<string, BatchJobProgress>();

export class BatchProcessingService {
  private batchQueue: Queue.Queue<BatchJob>;
  private readonly STAGGER_DELAY = 2000; // 2 seconds between calls
  private readonly MAX_CONCURRENT_BATCH_JOBS = 3;

  constructor() {
    // Create batch processing queue
    this.batchQueue = new Queue<BatchJob>('batch-calls', {
      redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        password: process.env.REDIS_PASSWORD,
        db: parseInt(process.env.REDIS_DB || '0')
      },
      defaultJobOptions: {
        attempts: 1, // Don't retry entire batch
        removeOnComplete: {
          age: 86400 * 7 // Keep for 7 days
        },
        removeOnFail: {
          age: 86400 * 30 // Keep failed batches for 30 days
        }
      }
    });

    this.registerProcessors();
    this.registerEventHandlers();

    logger.info('BatchProcessingService initialized', {
      maxConcurrentJobs: this.MAX_CONCURRENT_BATCH_JOBS
    });
  }

  /**
   * Submit batch job
   */
  async submitBatch(batch: Omit<BatchJob, 'batchId' | 'createdAt'>): Promise<string> {
    const batchId = new mongoose.Types.ObjectId().toString();

    const batchJob: BatchJob = {
      ...batch,
      batchId,
      createdAt: new Date()
    };

    // Initialize progress tracking
    batchProgressMap.set(batchId, {
      batchId,
      total: batch.records.length,
      processed: 0,
      successful: 0,
      failed: 0,
      status: 'pending',
      errors: []
    });

    // Add to queue
    await this.batchQueue.add(batchJob, {
      jobId: batchId
    });

    logger.info('Batch job submitted', {
      batchId,
      userId: batch.userId,
      type: batch.type,
      totalRecords: batch.records.length
    });

    return batchId;
  }

  /**
   * Get batch progress
   */
  async getBatchProgress(batchId: string): Promise<BatchJobProgress | null> {
    return batchProgressMap.get(batchId) || null;
  }

  /**
   * Cancel batch job
   */
  async cancelBatch(batchId: string): Promise<void> {
    const job = await this.batchQueue.getJob(batchId);

    if (!job) {
      throw new Error(`Batch job not found: ${batchId}`);
    }

    const state = await job.getState();

    if (state === 'active' || state === 'waiting' || state === 'delayed') {
      await job.remove();

      const progress = batchProgressMap.get(batchId);
      if (progress) {
        progress.status = 'failed';
        progress.completedAt = new Date();
      }

      logger.info('Batch job cancelled', { batchId });
    } else {
      throw new Error(`Cannot cancel batch in state: ${state}`);
    }
  }

  /**
   * Register queue processors
   */
  private registerProcessors(): void {
    this.batchQueue.process(this.MAX_CONCURRENT_BATCH_JOBS, async (job) => {
      return await this.processBatch(job);
    });
  }

  /**
   * Process batch job
   */
  private async processBatch(job: Queue.Job<BatchJob>): Promise<string> {
    const { batchId, userId, type, records, options = {} } = job.data;

    logger.info('Processing batch job', {
      batchId,
      type,
      totalRecords: records.length
    });

    const progress = batchProgressMap.get(batchId);
    if (!progress) {
      throw new Error(`Batch progress not found: ${batchId}`);
    }

    progress.status = 'processing';
    progress.startedAt = new Date();

    const {
      respectBusinessHours = true,
      staggerDelay = this.STAGGER_DELAY,
      priority = 'medium'
    } = options;

    for (let i = 0; i < records.length; i++) {
      const record = records[i];

      try {
        if (type === 'schedule') {
          // Schedule call
          if (!record.phoneId) {
            throw new Error(`Record at index ${i} missing phoneId - required for scheduled calls`);
          }

          await callSchedulerService.scheduleCall({
            phoneNumber: record.phoneNumber,
            phoneId: record.phoneId,
            agentId: record.agentId,
            userId: record.userId || userId,
            scheduledFor: record.scheduledFor ? new Date(record.scheduledFor) : new Date(Date.now() + 60000),
            timezone: record.timezone || 'Asia/Kolkata',
            respectBusinessHours,
            priority: record.priority || priority,
            metadata: {
              ...record.metadata,
              batchId,
              batchIndex: i
            }
          });
        } else {
          // Immediate call
          // NOTE: record.phoneId must be provided in CSV import
          // It contains the Exotel credentials and appId for this call
          if (!record.phoneId) {
            throw new Error(`Record at index ${i} missing phoneId - required for outbound calls`);
          }

          await outgoingCallService.initiateCall({
            phoneNumber: record.phoneNumber,
            phoneId: record.phoneId,
            agentId: record.agentId,
            userId: record.userId || userId,
            priority: record.priority || priority,
            metadata: {
              ...record.metadata,
              batchId,
              batchIndex: i
            }
          });
        }

        progress.successful++;

        logger.debug('Batch record processed', {
          batchId,
          index: i,
          phoneNumber: record.phoneNumber
        });
      } catch (error: any) {
        progress.failed++;
        progress.errors.push({
          index: i,
          phoneNumber: record.phoneNumber,
          error: error.message
        });

        logger.error('Batch record failed', {
          batchId,
          index: i,
          phoneNumber: record.phoneNumber,
          error: error.message
        });

        // Check if it's a concurrency/rate limit error - apply exponential backoff
        if (error.message?.includes('concurrent') || error.message?.includes('limit reached') || error.message?.includes('rate limit')) {
          const backoffMs = Math.min(5000, staggerDelay * Math.pow(2, Math.min(progress.failed, 5)));
          logger.warn('Limit hit in batch, applying backoff', {
            batchId,
            index: i,
            backoffMs
          });
          await this.delay(backoffMs);
        }
      } finally {
        // CRITICAL: Always stagger between calls, even on error
        // This prevents hammering the carrier when limits are hit
        if (i < records.length - 1 && type === 'immediate') {
          await this.delay(staggerDelay);
        }
      }

      progress.processed++;

      // Update job progress
      await job.progress((progress.processed / progress.total) * 100);
    }

    progress.status = 'completed';
    progress.completedAt = new Date();

    logger.info('Batch job completed', {
      batchId,
      total: progress.total,
      successful: progress.successful,
      failed: progress.failed
    });

    return `Processed ${progress.successful}/${progress.total} records successfully`;
  }

  /**
   * Register event handlers
   */
  private registerEventHandlers(): void {
    this.batchQueue.on('error', (error) => {
      logger.error('Batch queue error', {
        error: error.message,
        stack: error.stack
      });
    });

    this.batchQueue.on('completed', (job, result) => {
      logger.info('Batch job completed', {
        batchId: job.id,
        result
      });
    });

    this.batchQueue.on('failed', (job, error) => {
      logger.error('Batch job failed', {
        batchId: job.id,
        error: error.message
      });

      const progress = batchProgressMap.get(job.id as string);
      if (progress) {
        progress.status = 'failed';
        progress.completedAt = new Date();
      }
    });

    this.batchQueue.on('progress', (job, progress) => {
      logger.debug('Batch job progress', {
        batchId: job.id,
        progress: `${progress}%`
      });
    });
  }

  /**
   * Get queue statistics
   */
  async getQueueStats() {
    const [
      waiting,
      active,
      completed,
      failed,
      delayed
    ] = await Promise.all([
      this.batchQueue.getWaitingCount(),
      this.batchQueue.getActiveCount(),
      this.batchQueue.getCompletedCount(),
      this.batchQueue.getFailedCount(),
      this.batchQueue.getDelayedCount()
    ]);

    return {
      waiting,
      active,
      completed,
      failed,
      delayed,
      total: waiting + active + completed + failed + delayed
    };
  }

  /**
   * Get all batch jobs for a user
   */
  async getUserBatches(userId: string): Promise<BatchJobProgress[]> {
    const batches: BatchJobProgress[] = [];

    for (const [batchId, progress] of batchProgressMap.entries()) {
      const job = await this.batchQueue.getJob(batchId);
      if (job && job.data.userId === userId) {
        batches.push(progress);
      }
    }

    return batches.sort((a, b) => {
      const aTime = a.startedAt?.getTime() || 0;
      const bTime = b.startedAt?.getTime() || 0;
      return bTime - aTime; // Newest first
    });
  }

  /**
   * Clean old batch data
   */
  async cleanOldBatches(olderThanDays: number = 7): Promise<number> {
    const cutoffTime = new Date(Date.now() - olderThanDays * 86400000);
    let cleaned = 0;

    for (const [batchId, progress] of batchProgressMap.entries()) {
      if (progress.completedAt && progress.completedAt < cutoffTime) {
        batchProgressMap.delete(batchId);
        cleaned++;
      }
    }

    logger.info('Cleaned old batch data', {
      cleaned,
      olderThanDays
    });

    return cleaned;
  }

  /**
   * Delay utility
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Gracefully close queue
   */
  async close(): Promise<void> {
    await this.batchQueue.close();
    logger.info('Batch processing queue closed');
  }
}

// Export singleton instance
export const batchProcessingService = new BatchProcessingService();
