/**
 * Campaign Calls Queue Processor
 * Processes campaign call jobs with two-phase dial flow:
 * 1. Pre-dial slot acquisition (15-20s TTL)
 * 2. Upgrade to active lease on carrier answer (180-240s TTL)
 */

import { Job, Worker } from 'bullmq';
import { campaignCallsQueue, CampaignCallJobData } from '../campaignCalls.queue';
import { outgoingCallService } from '../../services/outgoingCall.service';
import { Campaign } from '../../models/Campaign';
import { CampaignContact } from '../../models/CampaignContact';
import { CallLog } from '../../models/CallLog';
import { logger } from '../../utils/logger';
import { redisConcurrencyTracker } from '../../utils/redisConcurrency.util';
import { coldStartGuard, isColdStartBlocking, onSuccessfulUpgrade } from '../../utils/coldStartGuard';
import { redis as redisClient } from '../../config/redis';
import { getFirstAttemptDelay, getAdaptiveDelay } from '../../config/ttls';
import { metrics } from '../../utils/metrics';
import { campaignLogger } from '../../utils/campaignLogger';
import IORedis from 'ioredis';

// Create Redis connection for worker
const connection = new IORedis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
  db: parseInt(process.env.REDIS_DB || '0'),
  maxRetriesPerRequest: null,
  enableReadyCheck: false
});

/**
 * Process a campaign call job with two-phase dial
 */
async function processCampaignCall(job: Job<CampaignCallJobData>): Promise<string> {
  const {
    campaignId,
    campaignContactId,
    agentId,
    phoneNumber,
    phoneId,
    userId,
    name,
    email,
    customData,
    retryCount,
    isRetry,
    priority,
    metadata = {},
    promoteSeq,
    promotedAt
  } = job.data;

  logger.info('Processing campaign call', {
    jobId: job.id,
    campaignId,
    campaignContactId,
    phoneNumber,
    promoteSeq
  });

  try {
    // ===== GUARD: Check if campaign paused =====
    const pausedKey = `campaign:{${campaignId}}:paused`;
    const paused = await redisClient.exists(pausedKey);
    if (paused) {
      logger.info('Campaign paused, re-delaying job', { campaignId, jobId: job.id });
      // Throw error to trigger BullMQ retry
      throw new Error('Campaign is paused');
    }

    // ===== GUARD: Reject jobs without promotion gate =====
    if (!promoteSeq) {
      const repairCount = metadata.gateRepairs || 0;

      if (repairCount >= 5) {
        // Hard-sync: force into waitlist
        logger.error('🚨 Gate repair limit reached, hard-syncing to waitlist', {
          jobId: job.id,
          campaignId,
          repairCount
        });

        const priority = (job.opts?.priority || 0) > 0 ? 'high' : 'normal';
        const waitlistKey = `campaign:{${campaignId}}:waitlist:${priority}`;
        await redisClient.lPush(waitlistKey, job.id!);

        // Set sentinel promoteSeq
        job.data.promoteSeq = -1;
        job.data.promotedAt = Date.now();
        await job.updateData(job.data);

        metrics.inc('gate_hard_sync', { campaign: campaignId });
        return 'hard-synced-to-waitlist';
      }

      // Increment repair counter
      metadata.gateRepairs = repairCount + 1;
      job.data.metadata = metadata;
      await job.updateData(job.data);

      logger.warn('⚠️ Gate-less job, repairing', {
        jobId: job.id,
        campaignId,
        repairAttempt: metadata.gateRepairs
      });

      metrics.inc('gate_repair', { campaign: campaignId });

      // Throw error to trigger BullMQ retry with backoff (don't try to move job manually)
      throw new Error(`Gate-less job needs retry (attempt ${metadata.gateRepairs})`);
    }

    // ===== Verify promotion gate =====
    const currentSeq = await redisClient.get(`campaign:{${campaignId}}:promote-gate`);

    if (currentSeq && promoteSeq !== -1) {  // -1 is sentinel from hard-sync
      const current = parseInt(currentSeq);
      if (promoteSeq < current) {
        logger.warn('⚠️ Job from old promotion gate, re-delaying', {
          campaignId,
          jobSeq: promoteSeq,
          currentSeq: current
        });
        // Throw error to trigger BullMQ retry
        throw new Error(`Stale promotion gate: job seq ${promoteSeq} < current ${current}`);
      }
    }

    // Check if promotion too old (15s grace)
    if (promotedAt && Date.now() - promotedAt > 15000) {
      logger.warn('⚠️ Job promotion expired, re-delaying', {
        campaignId,
        age: Date.now() - promotedAt
      });
      // Throw error to trigger BullMQ retry
      throw new Error(`Promotion expired: ${Date.now() - promotedAt}ms old`);
    }

    // ===== Get campaign =====
    const campaign = await Campaign.findById(campaignId);
    if (!campaign) {
      throw new Error(`Campaign not found: ${campaignId}`);
    }

    if (campaign.status !== 'active') {
      logger.warn('Campaign not active, skipping', {
        campaignId,
        status: campaign.status
      });
      return `Skipped: campaign status is ${campaign.status}`;
    }

    // ===== Get campaign contact =====
    const contact = await CampaignContact.findById(campaignContactId);
    if (!contact) {
      throw new Error(`Campaign contact not found: ${campaignContactId}`);
    }

    if (contact.status === 'completed' || contact.status === 'skipped') {
      logger.warn('Contact already processed', {
        campaignContactId,
        status: contact.status
      });
      return `Skipped: contact status is ${contact.status}`;
    }

    // ===== Check cold-start guard =====
    await coldStartGuard(campaignId);

    if (await isColdStartBlocking(campaignId)) {
      logger.warn('⏸️ Campaign in cold-start grace period, delaying job', {
        campaignId
      });
      // Throw error to trigger BullMQ retry with backoff (don't try to move job manually)
      throw new Error('Campaign in cold-start grace period');
    }

    // ===== PHASE 1: Acquire pre-dial slot =====
    const concurrentLimit = campaign.settings.concurrentCallsLimit;
    const callId = `call-${Date.now()}-${campaignContactId}`;

    const preToken = await redisConcurrencyTracker.acquirePreDialSlot(
      campaignId,
      callId,
      concurrentLimit
    );

    if (!preToken) {
      // Failed to acquire - release reservation
      await redisConcurrencyTracker.claimReservation(campaignId, job.id!);

      const activeCalls = await redisConcurrencyTracker.getActiveCalls(campaignId);

      // Log concurrency status when at capacity
      campaignLogger.logConcurrencySnapshot({
        campaignId,
        activeSlots: activeCalls,
        limit: concurrentLimit
      });

      metrics.inc('no_slot_delays', { campaign: campaignId });

      // Throw error to trigger BullMQ retry
      throw new Error(`No slot available: ${activeCalls}/${concurrentLimit} slots in use`);
    }

    // Log slot acquisition
    campaignLogger.logSlotEvent({
      campaignId,
      callId,
      action: 'acquired',
      slotType: 'pre-dial'
    });

    // Update contact status
    contact.status = 'calling';
    contact.lastAttemptAt = new Date();
    await contact.save();

    await Campaign.findByIdAndUpdate(campaignId, {
      $inc: { activeCalls: 1, queuedCalls: -1 }
    });

    await job.updateProgress(25);

    // ===== Initiate call =====
    let callLogId: string | undefined;
    let renewPreDialInterval: NodeJS.Timeout | undefined;
    let finalStatus = 'unknown';

    try {
      logger.info('🚀 Initiating campaign call', {
        campaignId,
        campaignContactId,
        phoneNumber,
        callId
      });

      // Start pre-dial renewal heartbeat (every 10s, up to 45s cap)
      renewPreDialInterval = setInterval(async () => {
        const renewed = await redisConcurrencyTracker.renewPreDialLease(
          campaignId,
          callId,
          preToken
        );
        if (!renewed) {
          clearInterval(renewPreDialInterval);
        }
      }, 10000);

      callLogId = await outgoingCallService.initiateCall({
        phoneNumber,
        phoneId,
        agentId,
        userId,
        campaignId,
        skipSlotAcquisition: true,  // CRITICAL: Slot already acquired above via pre-dial lease
        metadata: {
          ...metadata,
          campaignId,
          campaignContactId,
          contactName: name,
          contactEmail: email,
          customData,
          isCampaignCall: true,
          retryCount,
          callId,
          preToken  // For upgrade later
        },
        priority: priority > 0 ? 'high' : 'medium'
      });

      await job.updateProgress(50);

      // Stop pre-dial renewal
      if (renewPreDialInterval) {
        clearInterval(renewPreDialInterval);
      }

      // Brief delay to allow call initiation status update
      await new Promise(resolve => setTimeout(resolve, 1000));

      // ===== PHASE 2: Upgrade to active lease =====
      const callLog = await CallLog.findById(callLogId);

      if (callLog?.status === 'in-progress' || callLog?.status === 'ringing') {
        const upgradeStart = Date.now();

        const activeToken = await redisConcurrencyTracker.upgradeToActive(
          campaignId,
          callId,
          preToken
        );

        if (!activeToken) {
          logger.error('❌ Failed to upgrade to active lease', {
            campaignId,
            callId
          });

          // Release pre-dial + claim reservation
          await redisConcurrencyTracker.forceReleaseSlot(campaignId, callId);
          await redisConcurrencyTracker.claimReservation(campaignId, job.id!);

          throw new Error('Lease upgrade failed');
        }

        const upgradeLatency = Date.now() - upgradeStart;
        metrics.observe('pre_to_active_upgrade_latency_ms', upgradeLatency, {
          campaign: campaignId
        });

        logger.info('✅ Upgraded to active lease', {
          campaignId,
          callId,
          tokenPrefix: activeToken.substring(0, 8) + '...',
          latencyMs: upgradeLatency
        });

        // Store token in call log for webhook release
        callLog.metadata = callLog.metadata || {};
        callLog.metadata.leaseToken = activeToken;
        callLog.metadata.callId = callId;
        await callLog.save();

        // Progressive cold-start unblock
        await onSuccessfulUpgrade(campaignId);

        // Success - claim reservation
        await redisConcurrencyTracker.claimReservation(campaignId, job.id!);

      } else {
        // Call failed before answer, release pre-dial
        logger.warn('⚠️ Call failed before answer, releasing pre-dial', {
          campaignId,
          callId,
          status: callLog?.status
        });

        await redisConcurrencyTracker.releaseSlot(
          campaignId,
          callId,
          preToken,
          true,  // isPreDial
          true   // publish
        );

        // Claim reservation
        await redisConcurrencyTracker.claimReservation(campaignId, job.id!);
      }

      await job.updateProgress(75);

      // NOTE: Contact status updates will be handled by webhook when call completes
      // Processor only handles initial call initiation and lease upgrade

      logger.info('Campaign call initiated and lease upgraded', {
        campaignId,
        campaignContactId,
        callLogId,
        callId
      });

      // Mark job complete - webhook will handle final status and slot release
      await job.updateProgress(100);
      return callLogId || 'completed';

    } catch (error: any) {
      // Cleanup on error
      if (renewPreDialInterval) {
        clearInterval(renewPreDialInterval);
      }

      // Try to release pre-dial slot
      try {
        await redisConcurrencyTracker.releaseSlot(
          campaignId,
          callId,
          preToken,
          true,  // isPreDial
          true   // publish - MUST notify waitlist!
        );
      } catch (releaseError) {
        logger.error('Failed to release pre-dial on error', { releaseError });
      }

      // Claim reservation
      await redisConcurrencyTracker.claimReservation(campaignId, job.id!);

      throw error;
    }
  } catch (error: any) {
    // Outer catch - log but don't process contact status
    // (webhook will handle it)
    logger.error('Failed to process campaign call', {
      campaignId,
      campaignContactId,
      error: error.message
    });

    throw error;
  }
}

// NOTE: Contact status updates and slot release are now handled by webhook
// This avoids blocking the worker and creates a single source of truth

/**
 * Check if campaign is complete and update status
 */
async function checkCampaignCompletion(campaignId: string): Promise<void> {
  try {
    const campaign = await Campaign.findById(campaignId);
    if (!campaign || campaign.status !== 'active') {
      return;
    }

    const totalProcessed = campaign.completedCalls + campaign.failedCalls + campaign.voicemailCalls;

    if (totalProcessed >= campaign.totalContacts && campaign.activeCalls === 0 && campaign.queuedCalls === 0) {
      campaign.status = 'completed';
      campaign.completedAt = new Date();
      await campaign.save();

      logger.info('Campaign completed', {
        campaignId,
        totalContacts: campaign.totalContacts,
        completedCalls: campaign.completedCalls,
        failedCalls: campaign.failedCalls,
        voicemailCalls: campaign.voicemailCalls
      });
    }
  } catch (error) {
    logger.error('Error checking campaign completion', { campaignId, error });
  }
}

// CRITICAL: Only create worker on PRIMARY PM2 instance
const isPrimary = process.env.NODE_APP_INSTANCE === '0' || !process.env.NODE_APP_INSTANCE;

let worker: Worker<CampaignCallJobData> | null = null;

if (isPrimary) {
  worker = new Worker<CampaignCallJobData>(
    'campaign-calls',
    async (job) => {
      const result = await processCampaignCall(job);
      await checkCampaignCompletion(job.data.campaignId);
      return result;
    },
    {
      connection,
      concurrency: 1,  // Sequential processing
      limiter: {
        max: 10,
        duration: 1000
      }
    }
  );

  worker.on('completed', (job) => {
    logger.info('Campaign call job completed', {
      jobId: job.id,
      campaignId: job.data.campaignId
    });
  });

  worker.on('failed', (job, error) => {
    logger.error('Campaign call job failed', {
      jobId: job?.id,
      campaignId: job?.data?.campaignId,
      error: error.message,
      attemptsMade: job?.attemptsMade
    });
  });

  worker.on('error', (error) => {
    logger.error('Campaign worker error', {
      error: error.message,
      stack: error.stack
    });
  });

  logger.info('✅ Campaign calls processor registered on PRIMARY instance', {
    concurrency: 1,
    instanceId: process.env.NODE_APP_INSTANCE || '0'
  });
} else {
  logger.info('⏭️ Skipping campaign worker registration on secondary instance', {
    instanceId: process.env.NODE_APP_INSTANCE
  });
}

export { processCampaignCall, worker as campaignWorker };
