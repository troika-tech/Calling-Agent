import { redis as redisClient } from '../config/redis';
import { campaignCallsQueue } from '../queues/campaignCalls.queue';
import logger from '../utils/logger';
import { redisConcurrencyTracker } from '../utils/redisConcurrency.util';
import { circuitBreaker } from '../utils/circuitBreaker';
import { metrics } from '../utils/metrics';
import type { RedisClientType } from 'redis';

/**
 * Waitlist Service
 * Manages promotion of jobs from waitlist to BullMQ waiting state
 * Uses pub/sub for instant promotion + poller for fallback
 */
class WaitlistService {
  private subscriber: any = null;
  private pollerIntervalId: NodeJS.Timeout | null = null;
  private running = false;
  private activeCampaigns = new Set<string>();

  async start() {
    if (this.running) return;
    this.running = true;

    // Start pub/sub subscriber for instant promotion
    await this.startSubscriber();

    // Start fallback poller (2-5s jitter per campaign)
    this.startPoller();

    logger.info('✅ Waitlist service started (pub/sub + poller)');
  }

  async stop() {
    if (this.subscriber) {
      await this.subscriber.pUnsubscribe('campaign:*:slot-available');
      await this.subscriber.quit();
      this.subscriber = null;
    }

    if (this.pollerIntervalId) {
      clearInterval(this.pollerIntervalId);
      this.pollerIntervalId = null;
    }

    this.running = false;
    logger.info('Waitlist service stopped');
  }

  private async startSubscriber() {
    this.subscriber = redisClient.duplicate();
    await this.subscriber.connect();

    // Subscribe to slot-available pattern
    await this.subscriber.pSubscribe('campaign:*:slot-available', (message: string, channel: string) => {
      // Extract campaignId from channel
      const match = channel.match(/campaign:(.+?):slot-available/);
      if (!match) return;

      const campaignId = match[1];

      logger.info('🔔 Received slot-available notification', { campaignId, channel });

      // Trigger immediate promotion (non-blocking)
      this.promoteNextBatch(campaignId).catch(err => {
        logger.error('Promotion failed on notification', {
          campaignId,
          error: err.message
        });
      });
    });

    logger.info('✅ Subscribed to campaign:*:slot-available');
  }

  private startPoller() {
    // Fallback poller runs every 2-5s per campaign
    this.pollerIntervalId = setInterval(async () => {
      try {
        const campaigns = await this.getActiveCampaigns();

        if (campaigns.length > 0) {
          logger.info('⏰ Poller tick', { activeCampaigns: campaigns.length });
        }

        for (const campaignId of campaigns) {
          // Add jitter to avoid synchronized polling
          const jitter = Math.floor(Math.random() * 3000);
          setTimeout(() => {
            this.promoteNextBatch(campaignId).catch(err => {
              logger.error('Poller promotion failed', {
                campaignId,
                error: err.message
              });
            });
          }, jitter);
        }
      } catch (error: any) {
        logger.error('Poller failed', { error: error.message });
      }
    }, 5000);  // Base interval 5s

    logger.info('✅ Fallback poller started (5s + jitter)');
  }

  async promoteNextBatch(campaignId: string) {
    const mutexKey = `campaign:{${campaignId}}:promote-mutex`;

    // Try to acquire mutex
    const got = await redisClient.set(mutexKey, '1', {
      EX: 5,
      NX: true
    });

    if (!got) {
      metrics.inc('promoter_conflicts', { campaign: campaignId });
      return;
    }

    // Renew mutex every 2s while promoting
    const renewInterval = setInterval(async () => {
      await redisClient.expire(mutexKey, 5);
    }, 2000);

    try {
      // Check if campaign paused
      const pausedKey = `campaign:{${campaignId}}:paused`;
      const paused = await redisClient.exists(pausedKey);
      if (paused) {
        return;
      }

      // Check circuit breaker
      const isOpen = await circuitBreaker.isOpen(campaignId);
      if (isOpen) {
        logger.warn('⏸️ Circuit breaker open, skipping promotion', { campaignId });
        return;
      }

      // Get adjusted batch size
      const batchSize = await circuitBreaker.getBatchSize(campaignId, 50);

      // Call atomic pop_reserve_promote Lua
      const result = await redisConcurrencyTracker.reservePromotionSlotsWithLedger(
        campaignId,
        batchSize
      );

      const { count, seq, promoteIds } = result;

      if (count === 0) {
        return;
      }

      logger.info('🎯 Reserved slots for promotion', {
        campaignId,
        count,
        seq
      });

      // Promote jobs with gate seq
      const promoteStart = Date.now();

      for (const jobId of promoteIds) {
        try {
          const job = await campaignCallsQueue.getJob(jobId);

          if (!job) {
            // Job doesn't exist - claim reservation and decrement counter
            await redisConcurrencyTracker.claimReservation(campaignId, jobId);
            await redisConcurrencyTracker.decrementReserved(campaignId, 1);
            logger.warn('Job not found during promotion', { jobId, campaignId });
            metrics.inc('promotion_job_not_found', { campaign: campaignId });
            continue;
          }

          // Update job data with gate info BEFORE promoting
          job.data.promoteSeq = seq;
          job.data.promotedAt = Date.now();
          await job.updateData(job.data);

          // Now promote
          await job.promote();

        } catch (error: any) {
          logger.error('Failed to promote job', {
            jobId,
            campaignId,
            error: error.message
          });

          // Claim reservation and decrement counter to avoid leak
          await redisConcurrencyTracker.claimReservation(campaignId, jobId);
          await redisConcurrencyTracker.decrementReserved(campaignId, 1);
        }
      }

      const promotionLatency = Date.now() - promoteStart;
      metrics.observe('promotion_latency_ms', promotionLatency, {
        campaign: campaignId
      });

      logger.info('✅ Promoted jobs', {
        campaignId,
        promoted: promoteIds.length,
        seq,
        latencyMs: promotionLatency
      });

      // Record success for circuit breaker
      await circuitBreaker.recordSuccess(campaignId);

    } catch (error: any) {
      logger.error('Promotion batch failed', {
        campaignId,
        error: error.message
      });

      // Record failure for circuit breaker
      await circuitBreaker.recordFailure(campaignId);
    } finally {
      clearInterval(renewInterval);
      await redisClient.del(mutexKey);
    }
  }

  private async getActiveCampaigns(): Promise<string[]> {
    try {
      const Campaign = require('../models/Campaign').Campaign;
      const campaigns = await Campaign.find({ status: 'active' }).select('_id');
      return campaigns.map((c: any) => c._id.toString());
    } catch (error) {
      logger.error('Failed to get active campaigns', { error });
      return [];
    }
  }
}

export const waitlistService = new WaitlistService();
