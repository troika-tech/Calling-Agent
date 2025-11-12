import { redis as redisClient } from '../config/redis';
import logger from '../utils/logger';
import { TTL_CONFIG } from '../config/ttls';

/**
 * Reconciliation Service
 * Reconciles reserved counter with ledger ZSET size
 * Runs every 15min to catch and fix drift
 */
class ReconciliationService {
  private intervalId: NodeJS.Timeout | null = null;
  private running = false;

  async start() {
    if (this.intervalId) return;

    this.intervalId = setInterval(() => {
      this.reconcileAll().catch(err => {
        logger.error('Reconciliation failed', { error: err.message });
      });
    }, TTL_CONFIG.reconciliationInterval);

    logger.info('✅ Reconciliation service started', {
      interval: `${TTL_CONFIG.reconciliationInterval}ms`
    });
  }

  async stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.running = false;
    logger.info('Reconciliation service stopped');
  }

  private async reconcileAll() {
    try {
      const campaigns = await this.getActiveCampaigns();

      for (const campaignId of campaigns) {
        await this.reconcileCampaign(campaignId);
      }
    } catch (error: any) {
      logger.error('Reconciliation error', { error: error.message });
    }
  }

  private async reconcileCampaign(campaignId: string) {
    const reservedKey = `campaign:{${campaignId}}:reserved`;
    const ledgerKey = `campaign:{${campaignId}}:reserved:ledger`;

    try {
      const [counterValue, ledgerSize] = await Promise.all([
        redisClient.get(reservedKey).then(v => parseInt(v || '0')),
        redisClient.zCard(ledgerKey)
      ]);

      if (counterValue !== ledgerSize) {
        const drift = counterValue - ledgerSize;

        logger.warn('🔧 Reconciling reserved counter', {
          campaignId,
          before: counterValue,
          after: ledgerSize,
          drift
        });

        // Set counter to match ledger (source of truth)
        await redisClient.set(reservedKey, ledgerSize.toString());

        // Alert if large drift
        if (Math.abs(drift) > 5) {
          logger.error('🚨 Large reserved drift detected', {
            campaignId,
            drift,
            counterValue,
            ledgerSize
          });
        }
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

export const reconciliationService = new ReconciliationService();
