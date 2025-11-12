import { redisClient } from '../config/redis';
import { logger } from './logger';
import { TTL_CONFIG } from '../config/ttls';

/**
 * Cold-start guard: On Redis restart (no AOF), reconstructs:
 * 1. leases SET from database active calls
 * 2. Minimal lease keys with "recovered" token
 * 3. Blocks promotions for grace window to avoid janitor race
 *
 * Progressive unblock: ends blocking immediately when first upgrade happens
 * or min(limit, 2) leases are reconstructed
 */
export async function coldStartGuard(campaignId: string) {
  const guardKey = `campaign:{${campaignId}}:cold-start`;
  const setKey = `campaign:{${campaignId}}:leases`;

  const guardValue = await redisClient.get(guardKey);
  if (guardValue === 'done') return;  // Already completed

  // Check if there are active leases FIRST
  const setSize = await redisClient.sCard(setKey);

  if (setSize > 0) {
    // SET has data, end blocking immediately (progressive unblock)
    await redisClient.setEx(guardKey, TTL_CONFIG.coldStartDone, 'done');
    logger.info('✅ Cold-start unblocked (progressive - SET exists)', {
      campaignId,
      setSize
    });
    return;
  }

  // Set blocking only if no guard value exists (prevents janitor race for campaigns with DB leases)
  if (!guardValue) {
    await redisClient.setEx(guardKey, TTL_CONFIG.coldStartBlocking, 'blocking');
    logger.warn('🔄 Cold-start blocking promotions', { campaignId });
  }

  // Reconstruct SET + lease keys from database
  const CallLog = require('../models/CallLog').CallLog;
  const activeCalls = await CallLog.find({
    campaignId,
    status: { $in: ['initiated', 'ringing', 'in-progress'] }
  }).select('_id');

  if (activeCalls.length === 0) {
    // No active calls in database - new campaign, skip blocking entirely
    await redisClient.setEx(guardKey, TTL_CONFIG.coldStartDone, 'done');
    logger.info('✅ Cold-start skipped (new campaign, no active calls)', {
      campaignId
    });
    return;
  }

  // Has active calls - reconstruct SET + lease keys
  const pipeline = redisClient.multi();

  for (const call of activeCalls) {
    const callId = call._id.toString();
    pipeline.sAdd(setKey, callId);
    pipeline.setEx(
      `campaign:{${campaignId}}:lease:${callId}`,
      TTL_CONFIG.coldStartBlocking,
      'recovered'
    );
  }

  await pipeline.exec();

  logger.info('✅ Cold-start reconstructed SET + lease keys', {
    campaignId,
    reconstructed: activeCalls.length
  });

  // Progressive unblock: if we have at least min(limit, 2) leases, unblock immediately
  const limitKey = `campaign:{${campaignId}}:limit`;
  const limit = parseInt(await redisClient.get(limitKey) || '3');
  const minToUnblock = Math.min(limit, 2);

  if (activeCalls.length >= minToUnblock) {
    await redisClient.setEx(guardKey, TTL_CONFIG.coldStartDone, 'done');
    logger.info('✅ Cold-start unblocked early (progressive - min leases met)', {
      campaignId,
      reconstructed: activeCalls.length,
      minToUnblock
    });
    return;
  }

  // Otherwise, wait for grace period then reconcile
  setTimeout(async () => {
    await reconcileRecoveredLeases(campaignId);
    await redisClient.setEx(guardKey, TTL_CONFIG.coldStartDone, 'done');
    logger.info('Cold-start complete (grace period ended)', { campaignId });
  }, TTL_CONFIG.coldStartGrace * 1000);
}

/**
 * Reconcile recovered leases after grace period
 * Removes any leases still marked as "recovered"
 */
async function reconcileRecoveredLeases(campaignId: string) {
  const setKey = `campaign:{${campaignId}}:leases`;
  const members = await redisClient.sMembers(setKey);

  let cleaned = 0;
  for (const member of members) {
    const leaseKey = `campaign:{${campaignId}}:lease:${member}`;
    const token = await redisClient.get(leaseKey);

    if (token === 'recovered') {
      // Still recovered after grace period - force release
      await redisClient.del(leaseKey);
      await redisClient.sRem(setKey, member);
      cleaned++;
      logger.warn('🧹 Removed stale recovered lease', { campaignId, member });
    }
  }

  if (cleaned > 0) {
    logger.info('Cold-start reconciliation complete', {
      campaignId,
      cleaned
    });
  }
}

/**
 * Check if campaign is in cold-start blocking period
 */
export async function isColdStartBlocking(campaignId: string): Promise<boolean> {
  const guardKey = `campaign:{${campaignId}}:cold-start`;
  const value = await redisClient.get(guardKey);
  return value === 'blocking';
}

/**
 * Progressive unblock: call on first successful upgrade
 * Ends cold-start blocking immediately when first active lease is created
 */
export async function onSuccessfulUpgrade(campaignId: string) {
  const guardKey = `campaign:{${campaignId}}:cold-start`;
  const guardValue = await redisClient.get(guardKey);

  if (guardValue === 'blocking') {
    await redisClient.setEx(guardKey, TTL_CONFIG.coldStartDone, 'done');
    logger.info('✅ Cold-start unblocked on first upgrade (progressive)', { campaignId });
  }
}
