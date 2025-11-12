import { redis as redisClient } from '../config/redis';
import { campaignCallsQueue } from '../queues/campaignCalls.queue';
import logger from '../utils/logger';
import { TTL_CONFIG } from '../config/ttls';

/**
 * Waitlist Compactor Service
 * Removes stale/completed/failed job IDs from waitlists
 * Runs every 2min, samples first 1000 entries per waitlist
 */
class WaitlistCompactorService {
  private intervalId: NodeJS.Timeout | null = null;
  private running = false;

  async start() {
    if (this.intervalId) return;

    this.intervalId = setInterval(() => {
      this.compactAll().catch(err => {
        logger.error('Waitlist compaction failed', { error: err.message });
      });
    }, TTL_CONFIG.compactorInterval);

    logger.info('✅ Waitlist compactor started', {
      interval: `${TTL_CONFIG.compactorInterval}ms`
    });
  }

  async stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.running = false;
    logger.info('Waitlist compactor stopped');
  }

  private async compactAll() {
    try {
      const campaigns = await this.getActiveCampaigns();

      for (const campaignId of campaigns) {
        await this.compactCampaign(campaignId);
      }
    } catch (error: any) {
      logger.error('Waitlist compaction error', { error: error.message });
    }
  }

  private async compactCampaign(campaignId: string) {
    const highKey = `campaign:{${campaignId}}:waitlist:high`;
    const normalKey = `campaign:{${campaignId}}:waitlist:normal`;

    for (const key of [highKey, normalKey]) {
      await this.compactWaitlist(key, campaignId);
    }
  }

  private async compactWaitlist(key: string, campaignId: string) {
    const len = await redisClient.lLen(key);
    if (len === 0) return;

    // Sample first 1000 entries
    const sample = Math.min(len, 1000);
    const ids = await redisClient.lRange(key, 0, sample - 1);

    const toRemove: string[] = [];

    for (const id of ids) {
      try {
        const job = await campaignCallsQueue.getJob(id);

        if (!job) {
          // Job doesn't exist
          toRemove.push(id);
        } else {
          const state = await job.getState();
          if (state === 'completed' || state === 'failed') {
            toRemove.push(id);
          }
        }
      } catch (error) {
        // Job retrieval error - mark for removal
        toRemove.push(id);
      }
    }

    if (toRemove.length > 0) {
      // Remove each stale ID from list
      for (const id of toRemove) {
        await redisClient.lRem(key, 1, id);
      }

      logger.info('Compacted waitlist', {
        campaignId,
        waitlist: key.includes('high') ? 'high' : 'normal',
        removed: toRemove.length,
        sampled: sample,
        totalLen: len
      });
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

export const waitlistCompactor = new WaitlistCompactorService();
