import { redis as redisClient } from '../config/redis';
import logger from '../utils/logger';
import { TTL_CONFIG } from '../config/ttls';
import { metrics } from '../utils/metrics';
import IORedis from 'ioredis';

/**
 * Lease Janitor Service
 * Cleans stale SET members when lease keys expire
 * Runs every 30s, scans campaign leases SETs with budget limits
 * Also reaps orphaned reservations and re-pushes to waitlist
 */
class LeaseJanitorService {
  private intervalId: NodeJS.Timeout | null = null;
  private running = false;

  async start() {
    if (this.running) return;
    this.running = true;

    this.intervalId = setInterval(() => {
      this.sweep().catch(err => {
        logger.error('Janitor sweep failed', { error: err.message });
      });
    }, TTL_CONFIG.janitorInterval);

    logger.info('✅ Lease janitor started', {
      interval: `${TTL_CONFIG.janitorInterval}ms`
    });
  }

  async stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.running = false;
    logger.info('Lease janitor stopped');
  }

  private async sweep() {
    try {
      const startTime = Date.now();
      const maxSweepMs = 5000;  // Budget: 5s per sweep
      const maxSetsPerSweep = 100;  // Budget: max 100 campaigns per sweep

      // SCAN for campaign:{*}:leases keys (cluster-aware)
      const leaseSetKeys = await this.scanLeaseKeys(maxSetsPerSweep);

      let processed = 0;
      for (const setKey of leaseSetKeys) {
        if (Date.now() - startTime > maxSweepMs) {
          logger.warn('Janitor sweep budget exceeded', {
            setsProcessed: processed,
            totalFound: leaseSetKeys.length
          });
          break;
        }

        await this.cleanStaleMembers(setKey);
        processed++;
      }

      // Also clean orphaned reservations
      await this.cleanOrphanedReservations();

    } catch (error: any) {
      logger.error('Janitor sweep error', { error: error.message });
    }
  }

  private async scanLeaseKeys(limit: number): Promise<string[]> {
    const pattern = 'campaign:{*}:leases';
    const isCluster = redisClient instanceof IORedis.Cluster;

    if (isCluster) {
      // Redis Cluster: SCAN each master node
      const keys: string[] = [];
      const masters = (redisClient as any).nodes('master');

      for (const node of masters) {
        const nodeKeys = await this.scanNode(node, pattern, limit - keys.length);
        keys.push(...nodeKeys);
        if (keys.length >= limit) break;
      }

      return keys.slice(0, limit);
    } else {
      // Single node
      return await this.scanNode(redisClient, pattern, limit);
    }
  }

  private async scanNode(node: any, pattern: string, limit: number): Promise<string[]> {
    const keys: string[] = [];
    let cursor = 0;

    do {
      const result = await node.scan(cursor, {
        MATCH: pattern,
        COUNT: 100
      });
      cursor = result.cursor;
      keys.push(...result.keys);

      if (keys.length >= limit) break;
    } while (cursor !== 0);

    return keys.slice(0, limit);
  }

  private async cleanStaleMembers(setKey: string) {
    // Extract campaignId: campaign:{123}:leases → 123
    const match = setKey.match(/campaign:\{(.+?)\}:leases/);
    if (!match) return;

    const campaignId = match[1];

    // Skip if cold-start active (prevents race with guard)
    const guardKey = `campaign:{${campaignId}}:cold-start`;
    const guardState = await redisClient.get(guardKey);
    if (guardState && guardState !== 'done') {
      logger.debug('Janitor skipping cold-start campaign', {
        campaignId,
        guardState
      });
      return;
    }

    const members = await redisClient.sMembers(setKey);

    let cleaned = 0;
    for (const member of members) {
      const isPreDial = member.startsWith('pre-');
      const leaseKey = `campaign:{${campaignId}}:lease:${member}`;

      const exists = await redisClient.exists(leaseKey);
      if (!exists) {
        // Stale member - remove from SET
        await redisClient.sRem(setKey, member);
        cleaned++;
        logger.warn('🧹 Cleaned stale SET member', {
          campaignId,
          member,
          isPreDial
        });
      }
    }

    if (cleaned > 0) {
      logger.info('Janitor cleaned stale members', {
        campaignId,
        cleaned,
        total: members.length
      });
      metrics.inc('stale_members_cleaned', { campaign: campaignId }, cleaned);
    }
  }

  private async cleanOrphanedReservations() {
    const campaigns = await this.getActiveCampaigns();
    const now = Date.now();
    const maxAge = TTL_CONFIG.reservationOrphanAge * 1000;

    for (const campaignId of campaigns) {
      const ledgerKey = `campaign:{${campaignId}}:reserved:ledger`;
      const reservedKey = `campaign:{${campaignId}}:reserved`;

      // Get old entries WITH origin prefix (H:jobId or N:jobId)
      const old = await redisClient.zRangeByScore(
        ledgerKey,
        '-inf',
        (now - maxAge).toString()
      );

      if (old.length > 0) {
        // Parse origin + push back to correct waitlist
        for (const entry of old) {
          const [origin, jobId] = entry.split(':');
          if (!jobId) continue; // Invalid format

          const waitlistKey = origin === 'H'
            ? `campaign:{${campaignId}}:waitlist:high`
            : `campaign:{${campaignId}}:waitlist:normal`;

          await redisClient.lPush(waitlistKey, jobId);
        }

        // Remove from ledger + decrement counter
        const multi = redisClient.multi();
        multi.zRemRangeByScore(ledgerKey, '-inf', (now - maxAge));

        // Clamp decrement (handled by decr_reserved.lua logic)
        const current = parseInt(await redisClient.get(reservedKey) || '0');
        const newVal = Math.max(0, current - old.length);
        multi.set(reservedKey, newVal.toString());

        await multi.exec();

        logger.warn('🧹 Re-pushed orphaned reservations to waitlist', {
          campaignId,
          count: old.length,
          entries: old.slice(0, 5) // Log first 5
        });

        metrics.inc('orphaned_reservations_recovered', {
          campaign: campaignId
        }, old.length);
      }
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

export const leaseJanitor = new LeaseJanitorService();
