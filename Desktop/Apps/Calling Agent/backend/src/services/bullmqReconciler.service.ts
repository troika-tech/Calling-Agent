import { campaignCallsQueue } from '../queues/campaignCalls.queue';
import { redis as redisClient } from '../config/redis';
import logger from '../utils/logger';
import { TTL_CONFIG } from '../config/ttls';
import { metrics } from '../utils/metrics';

/**
 * BullMQ Reconciler Service
 * Rebuilds waitlist entries for jobs in BullMQ delayed state
 * that are missing from the waitlist (due to missed events, crashes, etc.)
 * Runs every 5min, scans first 500 delayed jobs per campaign
 */
class BullMQReconcilerService {
  private intervalId: NodeJS.Timeout | null = null;
  private running = false;

  async start() {
    if (this.intervalId) return;

    this.intervalId = setInterval(() => {
      this.reconcileAll().catch(err => {
        logger.error('BullMQ reconciliation failed', { error: err.message });
      });
    }, TTL_CONFIG.reconcilerInterval);

    logger.info('✅ BullMQ reconciler started', {
      interval: `${TTL_CONFIG.reconcilerInterval}ms`
    });
  }

  async stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.running = false;
    logger.info('BullMQ reconciler stopped');
  }

  private async reconcileAll() {
    try {
      const campaigns = await this.getActiveCampaigns();

      for (const campaignId of campaigns) {
        await this.reconcileCampaign(campaignId);
      }
    } catch (error: any) {
      logger.error('BullMQ reconciliation error', { error: error.message });
    }
  }

  private async reconcileCampaign(campaignId: string) {
    try {
      // Get all delayed jobs for this campaign (bounded to first 500)
      const delayedJobs = await campaignCallsQueue.getDelayed(0, 500);
      const campaignDelayed = delayedJobs.filter(
        job => job.data?.campaignId === campaignId
      );

      if (campaignDelayed.length === 0) return;

      // Check which are missing from waitlist
      const highKey = `campaign:{${campaignId}}:waitlist:high`;
      const normalKey = `campaign:{${campaignId}}:waitlist:normal`;
      const markerPrefix = `campaign:{${campaignId}}:waitlist:marker:`;

      let rebuilt = 0;

      for (const job of campaignDelayed) {
        const markerKey = `${markerPrefix}${job.id}`;
        const exists = await redisClient.exists(markerKey);

        if (!exists) {
          // Missing from waitlist - re-push
          const priority = (job.opts?.priority || 0) > 0 ? 'high' : 'normal';
          const waitlistKey = priority === 'high' ? highKey : normalKey;

          await redisClient.rPush(waitlistKey, job.id!);
          await redisClient.setEx(markerKey, TTL_CONFIG.markerTTL, '1');

          rebuilt++;
        }
      }

      if (rebuilt > 0) {
        logger.warn('🔧 BullMQ reconciler rebuilt waitlist entries', {
          campaignId,
          rebuilt,
          scanned: campaignDelayed.length
        });

        metrics.inc('bullmq_waitlist_rebuilt', {
          campaign: campaignId
        }, rebuilt);
      }
    } catch (error: any) {
      logger.error('Campaign reconciliation failed', {
        campaignId,
        error: error.message
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

export const bullmqReconciler = new BullMQReconcilerService();
