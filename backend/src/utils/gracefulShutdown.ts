import logger from './logger';
import { redis as redisClient } from '../config/redis';
import { campaignCallsQueue } from '../queues/campaignCalls.queue';
import { redisConcurrencyTracker } from './redisConcurrency.util';
import { waitlistService } from '../services/waitlist.service';
import { leaseJanitor } from '../services/leaseJanitor.service';
import { waitlistCompactor } from '../services/waitlistCompactor.service';
import { bullmqReconciler } from '../services/bullmqReconciler.service';
import { reconciliationService } from '../services/reconciliation.service';
import { invariantMonitor } from '../services/invariantMonitor.service';

/**
 * Graceful Shutdown Handler
 * Cleanly shuts down all services and preserves active call leases
 */
export async function gracefulShutdown(signal: string = 'SIGTERM') {
  logger.info('🛑 Graceful shutdown initiated', { signal });

  try {
    // 1. Stop accepting new jobs
    await campaignCallsQueue.pause();
    logger.info('Queue paused, no new jobs accepted');

    // 2. Stop all background services
    await Promise.all([
      waitlistService.stop(),
      leaseJanitor.stop(),
      waitlistCompactor.stop(),
      bullmqReconciler.stop(),
      reconciliationService.stop(),
      invariantMonitor.stop()
    ]);
    logger.info('All background services stopped');

    // 3. Release all pre-dial leases (but keep active leases)
    const campaigns = await getActiveCampaigns();

    for (const campaign of campaigns) {
      const campaignId = campaign._id.toString();
      const setKey = `campaign:{${campaignId}}:leases`;
      const members = await redisClient.sMembers(setKey);
      const preDialLeases = members.filter(m => m.startsWith('pre-'));

      for (const preDialMember of preDialLeases) {
        const callId = preDialMember.replace('pre-', '');
        await redisConcurrencyTracker.forceReleaseSlot(campaignId, callId);
        logger.info('Released pre-dial lease', { campaignId, callId });
      }
    }

    // 4. Drain reserved ledger back to waitlist
    await new Promise(resolve => setTimeout(resolve, 3000));  // 3s grace

    for (const campaign of campaigns) {
      const campaignId = campaign._id.toString();
      const ledgerKey = `campaign:{${campaignId}}:reserved:ledger`;
      const reservedKey = `campaign:{${campaignId}}:reserved`;

      // Get all reserved jobIds with origin prefix
      const reserved = await redisClient.zRange(ledgerKey, 0, -1);

      if (reserved.length > 0) {
        logger.warn('Draining reserved jobs back to waitlist', {
          campaignId,
          count: reserved.length
        });

        // Push back to waitlist (parse origin prefix)
        for (const entry of reserved) {
          const [origin, jobId] = entry.split(':');
          if (!jobId) continue;

          const waitlistKey = origin === 'H'
            ? `campaign:{${campaignId}}:waitlist:high`
            : `campaign:{${campaignId}}:waitlist:normal`;

          await redisClient.lPush(waitlistKey, jobId);
        }

        // Clear reservation
        await redisClient.del(reservedKey);
        await redisClient.del(ledgerKey);
      }
    }

    // 5. Wait for active calls to complete (with timeout)
    logger.info('Waiting for active calls to complete (30s timeout)...');
    await waitForActiveCalls(30000);

    // 6. Close queue
    await campaignCallsQueue.close();
    logger.info('Queue closed');

    logger.info('✅ Graceful shutdown complete');
    process.exit(0);
  } catch (error: any) {
    logger.error('Graceful shutdown error', { error: error.message });
    process.exit(1);
  }
}

async function waitForActiveCalls(timeoutMs: number) {
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    const activeCount = await campaignCallsQueue.getActiveCount();
    if (activeCount === 0) {
      logger.info('All active calls completed');
      return;
    }

    logger.info('Waiting for active calls', { activeCount });
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  logger.warn('⚠️ Shutdown timeout, some calls still active');
}

async function getActiveCampaigns(): Promise<any[]> {
  try {
    const Campaign = require('../models/Campaign').Campaign;
    return await Campaign.find({ status: 'active' });
  } catch (error) {
    logger.error('Failed to get active campaigns', { error });
    return [];
  }
}

// Register signal handlers
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

logger.info('✅ Graceful shutdown handlers registered');
