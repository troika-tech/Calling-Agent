import { Router } from 'express';
import { redis as redisClient } from '../config/redis';
import { logger } from '../utils/logger';
import { authenticate } from '../middlewares/auth.middleware';

const router = Router();

/**
 * POST /api/maintenance/cleanup-slots/:campaignId
 * Clean up stuck Redis slots for a campaign
 */
router.post('/cleanup-slots/:campaignId', authenticate, async (req, res) => {
  try {
    const { campaignId } = req.params;

    logger.info('🧹 Starting manual slot cleanup', { campaignId, userId: req.user._id });

    const setKey = `campaign:{${campaignId}}:leases`;
    const reservedKey = `campaign:{${campaignId}}:reserved`;
    const ledgerKey = `campaign:{${campaignId}}:reserved:ledger`;

    // Get current state
    const [inflight, reserved, ledgerSize] = await Promise.all([
      redisClient.sCard(setKey),
      redisClient.get(reservedKey).then(v => parseInt(v || '0')),
      redisClient.zCard(ledgerKey)
    ]);

    logger.info('Current state before cleanup', {
      campaignId,
      inflight,
      reserved,
      ledgerSize
    });

    // Get all lease members
    const members = await redisClient.sMembers(setKey);

    // Clean up each lease
    let cleaned = 0;
    const cleanedLeases = [];
    for (const member of members) {
      const leaseKey = `campaign:{${campaignId}}:lease:${member}`;
      const token = await redisClient.get(leaseKey);

      // Delete lease key and remove from SET
      await redisClient.del(leaseKey);
      await redisClient.sRem(setKey, member);
      cleaned++;
      cleanedLeases.push({ member, token });

      logger.info('Cleaned stuck lease', { campaignId, member, token });
    }

    // Verify final state
    const [finalInflight, finalReserved] = await Promise.all([
      redisClient.sCard(setKey),
      redisClient.get(reservedKey).then(v => parseInt(v || '0'))
    ]);

    logger.info('✅ Manual slot cleanup complete', {
      campaignId,
      cleaned,
      finalState: { inflight: finalInflight, reserved: finalReserved }
    });

    res.json({
      success: true,
      message: `Cleaned ${cleaned} stuck lease(s)`,
      beforeCleanup: { inflight, reserved, ledgerSize },
      afterCleanup: { inflight: finalInflight, reserved: finalReserved },
      cleanedLeases
    });
  } catch (error: any) {
    logger.error('Manual slot cleanup failed', {
      error: error.message,
      campaignId: req.params.campaignId
    });

    res.status(500).json({
      success: false,
      message: 'Failed to clean up stuck slots',
      error: error.message
    });
  }
});

/**
 * GET /api/maintenance/redis-state/:campaignId
 * Get Redis state for a campaign
 */
router.get('/redis-state/:campaignId', authenticate, async (req, res) => {
  try {
    const { campaignId } = req.params;

    const setKey = `campaign:{${campaignId}}:leases`;
    const limitKey = `campaign:{${campaignId}}:limit`;
    const reservedKey = `campaign:{${campaignId}}:reserved`;
    const ledgerKey = `campaign:{${campaignId}}:reserved:ledger`;
    const highKey = `campaign:{${campaignId}}:waitlist:high`;
    const normalKey = `campaign:{${campaignId}}:waitlist:normal`;

    const [inflight, limit, reserved, ledgerSize, highQueue, normalQueue, members] = await Promise.all([
      redisClient.sCard(setKey),
      redisClient.get(limitKey).then(v => parseInt(v || '3')),
      redisClient.get(reservedKey).then(v => parseInt(v || '0')),
      redisClient.zCard(ledgerKey),
      redisClient.lLen(highKey),
      redisClient.lLen(normalKey),
      redisClient.sMembers(setKey)
    ]);

    // Get lease details
    const leaseDetails = await Promise.all(
      members.map(async (member) => {
        const leaseKey = `campaign:{${campaignId}}:lease:${member}`;
        const token = await redisClient.get(leaseKey);
        const ttl = await redisClient.ttl(leaseKey);
        return { member, token, ttl };
      })
    );

    res.json({
      success: true,
      campaignId,
      state: {
        inflight,
        limit,
        reserved,
        ledgerSize,
        highQueue,
        normalQueue,
        total: inflight + reserved,
        capacity: limit,
        saturation: limit > 0 ? ((inflight + reserved) / limit).toFixed(2) : 0
      },
      leases: leaseDetails
    });
  } catch (error: any) {
    logger.error('Failed to get Redis state', {
      error: error.message,
      campaignId: req.params.campaignId
    });

    res.status(500).json({
      success: false,
      message: 'Failed to get Redis state',
      error: error.message
    });
  }
});

export default router;
