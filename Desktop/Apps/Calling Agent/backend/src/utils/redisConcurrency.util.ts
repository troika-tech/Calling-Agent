import { redis as redisClient } from '../config/redis';
import logger from './logger';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { TTL_CONFIG, getPreDialTTL, getActiveTTL } from '../config/ttls';

// Load Lua scripts
const luaScriptsPath = path.join(__dirname, 'lua-scripts');
const luaScripts = {
  acquirePre: fs.readFileSync(path.join(luaScriptsPath, 'acquire_pre.lua'), 'utf8'),
  upgrade: fs.readFileSync(path.join(luaScriptsPath, 'upgrade.lua'), 'utf8'),
  release: fs.readFileSync(path.join(luaScriptsPath, 'release.lua'), 'utf8'),
  releaseForce: fs.readFileSync(path.join(luaScriptsPath, 'release_force.lua'), 'utf8'),
  renew: fs.readFileSync(path.join(luaScriptsPath, 'renew.lua'), 'utf8'),
  popReservePromote: fs.readFileSync(path.join(luaScriptsPath, 'pop_reserve_promote.lua'), 'utf8'),
  claimReservation: fs.readFileSync(path.join(luaScriptsPath, 'claim_reservation.lua'), 'utf8'),
  decrReserved: fs.readFileSync(path.join(luaScriptsPath, 'decr_reserved.lua'), 'utf8')
};

/**
 * Redis Concurrency Tracker
 * Production-grade implementation with SET-based tracking + Lua scripts
 */
export class RedisConcurrencyTracker {
  private scriptSHAs = new Map<string, string>();
  private initialized = false;

  /**
   * Initialize - preload all Lua scripts
   */
  async initialize() {
    if (this.initialized) return;

    for (const [name, script] of Object.entries(luaScripts)) {
      try {
        const sha = await redisClient.scriptLoad(script);
        this.scriptSHAs.set(name, sha);
        logger.info('Loaded Lua script', {
          name,
          sha: sha.substring(0, 8) + '...'
        });
      } catch (error: any) {
        logger.error('Failed to load Lua script', { name, error: error.message });
        throw error;
      }
    }

    this.initialized = true;
    logger.info('✅ Redis concurrency tracker initialized with EVALSHA');
  }

  /**
   * Execute Lua script with automatic NOSCRIPT fallback
   */
  private async evalScript(name: string, numKeys: number, ...args: any[]): Promise<any> {
    if (!this.initialized) {
      await this.initialize();
    }

    const sha = this.scriptSHAs.get(name);
    if (!sha) throw new Error(`Script not loaded: ${name}`);

    try {
      return await redisClient.evalSha(sha, {
        keys: args.slice(0, numKeys),
        arguments: args.slice(numKeys)
      });
    } catch (error: any) {
      // NOSCRIPT error - reload and retry
      if (error.message?.includes('NOSCRIPT')) {
        logger.warn('NOSCRIPT error, reloading script', { name });
        const newSha = await redisClient.scriptLoad(luaScripts[name]);
        this.scriptSHAs.set(name, newSha);
        return await redisClient.evalSha(newSha, {
          keys: args.slice(0, numKeys),
          arguments: args.slice(numKeys)
        });
      }
      throw error;
    }
  }

  /**
   * Acquire pre-dial slot
   * @returns token if successful, null if no slot available
   */
  async acquirePreDialSlot(
    campaignId: string,
    callId: string,
    limit: number
  ): Promise<string | null> {
    const token = randomUUID();
    const ttl = getPreDialTTL();
    const setKey = `campaign:{${campaignId}}:leases`;
    const leaseKey = `campaign:{${campaignId}}:lease:pre-${callId}`;
    const limitKey = `campaign:{${campaignId}}:limit`;
    const preMember = `pre-${callId}`;

    // Ensure limit is set in Redis
    await redisClient.setNX(limitKey, limit.toString());

    const result = await this.evalScript(
      'acquirePre',
      3,
      setKey,
      leaseKey,
      limitKey,
      callId,
      preMember,
      token,
      ttl.toString()
    );

    return result || null;
  }

  /**
   * Upgrade pre-dial to active lease
   */
  async upgradeToActive(
    campaignId: string,
    callId: string,
    preToken: string
  ): Promise<string | null> {
    const activeToken = randomUUID();
    const ttl = getActiveTTL();
    const setKey = `campaign:{${campaignId}}:leases`;
    const preLeaseKey = `campaign:{${campaignId}}:lease:pre-${callId}`;
    const activeLeaseKey = `campaign:{${campaignId}}:lease:${callId}`;
    const preMember = `pre-${callId}`;

    const result = await this.evalScript(
      'upgrade',
      3,
      setKey,
      preLeaseKey,
      activeLeaseKey,
      callId,
      preMember,
      preToken,
      activeToken,
      ttl.toString()
    );

    return result || null;
  }

  /**
   * Release slot (normal path with token verification)
   */
  async releaseSlot(
    campaignId: string,
    callId: string,
    token: string,
    isPreDial: boolean = false,
    publish: boolean = true
  ): Promise<boolean> {
    const member = isPreDial ? `pre-${callId}` : callId;
    const setKey = `campaign:{${campaignId}}:leases`;
    const leaseKey = `campaign:{${campaignId}}:lease:${member}`;

    const result = await this.evalScript(
      'release',
      2,
      setKey,
      leaseKey,
      member,
      token,
      campaignId,
      publish ? '1' : '0'
    );

    return result === 1;
  }

  /**
   * Force release (webhook reconciliation, no token check)
   */
  async forceReleaseSlot(
    campaignId: string,
    callId: string,
    publish: boolean = false
  ): Promise<number> {
    const setKey = `campaign:{${campaignId}}:leases`;
    const activeLeaseKey = `campaign:{${campaignId}}:lease:${callId}`;
    const preLeaseKey = `campaign:{${campaignId}}:lease:pre-${callId}`;

    const result = await this.evalScript(
      'releaseForce',
      3,
      setKey,
      activeLeaseKey,
      preLeaseKey,
      callId,
      `pre-${callId}`,
      campaignId,
      publish ? '1' : '0'
    );

    logger.info('Force released slot', {
      campaignId,
      callId,
      type: result === 1 ? 'active' : result === 2 ? 'pre-dial' : 'none',
      published: publish
    });

    return result;
  }

  /**
   * Renew lease TTL (heartbeat)
   */
  async renewLease(
    campaignId: string,
    callId: string,
    token: string,
    ttl?: number,
    isPreDial: boolean = false
  ): Promise<boolean> {
    const member = isPreDial ? `pre-${callId}` : callId;
    const leaseKey = `campaign:{${campaignId}}:lease:${member}`;
    const coldStartKey = `campaign:{${campaignId}}:cold-start`;
    const finalTTL = ttl || (isPreDial ? getPreDialTTL() : getActiveTTL());

    const result = await this.evalScript(
      'renew',
      2,
      leaseKey,
      coldStartKey,
      token,
      finalTTL.toString()
    );

    return result === 1;
  }

  /**
   * Renew pre-dial lease with cap
   */
  async renewPreDialLease(
    campaignId: string,
    callId: string,
    token: string
  ): Promise<boolean> {
    const leaseKey = `campaign:{${campaignId}}:lease:pre-${callId}`;
    const reservedKey = `campaign:{${campaignId}}:reserved`;

    const currentTTL = await redisClient.ttl(leaseKey);
    if (currentTTL < 0) return false;

    if (currentTTL + 15 > TTL_CONFIG.preDialMax) {
      return false;
    }

    // Renew both pre-dial lease AND reservation counter TTL
    const coldStartKey = `campaign:{${campaignId}}:cold-start`;
    const result = await this.evalScript(
      'renew',
      2,
      leaseKey,
      coldStartKey,
      token,
      (currentTTL + 15).toString()
    );

    // Extend reservation TTL to match
    if (result === 1) {
      await redisClient.expire(reservedKey, TTL_CONFIG.reservationTTL);
    }

    return result === 1;
  }

  /**
   * Reserve promotion slots (atomic pop + reserve + ledger)
   */
  async reservePromotionSlotsWithLedger(
    campaignId: string,
    maxBatch: number
  ): Promise<{ count: number; seq: number; promoteIds: string[]; pushBackIds: string[] }> {
    const highKey = `campaign:{${campaignId}}:waitlist:high`;
    const normalKey = `campaign:{${campaignId}}:waitlist:normal`;
    const setKey = `campaign:{${campaignId}}:leases`;
    const limitKey = `campaign:{${campaignId}}:limit`;
    const reservedKey = `campaign:{${campaignId}}:reserved`;
    const ledgerKey = `campaign:{${campaignId}}:reserved:ledger`;
    const gateKey = `campaign:{${campaignId}}:promote-gate`;
    const seqKey = `campaign:{${campaignId}}:promote-gate:seq`;
    const fairnessKey = `campaign:{${campaignId}}:fairness`;

    const now = Date.now();

    const result = await this.evalScript(
      'popReservePromote',
      9,  // NUMKEYS = 9
      highKey,
      normalKey,
      setKey,
      limitKey,
      reservedKey,
      ledgerKey,
      gateKey,
      seqKey,
      fairnessKey,
      maxBatch.toString(),
      TTL_CONFIG.reservationTTL.toString(),
      TTL_CONFIG.gateTTL.toString(),
      now.toString()
    );

    return {
      count: result[0] || 0,
      seq: result[1] || 0,
      promoteIds: result[2] || [],
      pushBackIds: result[3] || []
    };
  }

  /**
   * Claim reservation (worker acquired slot)
   */
  async claimReservation(campaignId: string, jobId: string): Promise<boolean> {
    const reservedKey = `campaign:{${campaignId}}:reserved`;
    const ledgerKey = `campaign:{${campaignId}}:reserved:ledger`;

    const result = await this.evalScript(
      'claimReservation',
      2,
      reservedKey,
      ledgerKey,
      jobId
    );

    return result > 0;
  }

  /**
   * Decrement reserved counter
   */
  async decrementReserved(campaignId: string, count: number = 1): Promise<void> {
    const reservedKey = `campaign:{${campaignId}}:reserved`;

    await this.evalScript(
      'decrReserved',
      1,
      reservedKey,
      count.toString()
    );
  }

  /**
   * Get active calls count (from SET)
   */
  async getActiveCalls(campaignId: string): Promise<number> {
    const setKey = `campaign:{${campaignId}}:leases`;
    return await redisClient.sCard(setKey);
  }

  /**
   * Get reserved slots count
   */
  async getReservedSlots(campaignId: string): Promise<number> {
    const reservedKey = `campaign:{${campaignId}}:reserved`;
    const value = await redisClient.get(reservedKey);
    return value ? parseInt(value) : 0;
  }

  // ====== LEGACY METHODS FOR BACKWARD COMPATIBILITY ======

  /**
   * Legacy agent-based method (kept for backward compatibility)
   */
  async acquireSlot(entityId: string, limit: number): Promise<boolean> {
    // Check if this is a campaign ID (new flow) or agent ID (legacy)
    // For now, delegate to legacy implementation for agents
    return await this.legacyAcquireSlot(entityId, limit);
  }

  private async legacyAcquireSlot(agentId: string, limit: number): Promise<boolean> {
    const key = `agent:concurrent:${agentId}`;
    const ttl = 3600;

    const luaScript = `
      local key = KEYS[1]
      local limit = tonumber(ARGV[1])
      local ttl = tonumber(ARGV[2])

      local current = tonumber(redis.call('GET', key) or 0)

      if current < limit then
        local newCount = redis.call('INCR', key)
        if newCount == 1 then
          redis.call('EXPIRE', key, ttl)
        end
        return 1
      else
        return 0
      end
    `;

    const result = await redisClient.eval(luaScript, {
      keys: [key],
      arguments: [limit.toString(), ttl.toString()]
    });

    return result === 1;
  }
}

// Export singleton instance
export const redisConcurrencyTracker = new RedisConcurrencyTracker();
