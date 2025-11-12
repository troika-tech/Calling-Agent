import { redisClient } from '../config/redis';
import { logger } from './logger';
import { TTL_CONFIG } from '../config/ttls';

/**
 * Circuit Breaker Service
 * Stores state in Redis for cross-worker consistency
 * Uses sliding window of failures to determine circuit state
 */
class CircuitBreaker {
  /**
   * Record a failure for the campaign
   * Opens circuit if failures > threshold within window
   */
  async recordFailure(campaignId: string, threshold: number = 5) {
    const failKey = `campaign:{${campaignId}}:cb:fail`;
    const circuitKey = `campaign:{${campaignId}}:circuit`;

    const failures = await redisClient.incr(failKey);
    await redisClient.expire(failKey, TTL_CONFIG.circuitBreakerWindow);

    if (failures > threshold) {
      await redisClient.setEx(
        circuitKey,
        TTL_CONFIG.circuitBreakerTTL,
        'open'
      );
      logger.error('🚨 Circuit breaker OPEN', { campaignId, failures });
    }
  }

  /**
   * Check if circuit is open
   */
  async isOpen(campaignId: string): Promise<boolean> {
    const circuitKey = `campaign:{${campaignId}}:circuit`;
    const state = await redisClient.get(circuitKey);
    return state === 'open';
  }

  /**
   * Record a success - decrements failure counter
   */
  async recordSuccess(campaignId: string) {
    const failKey = `campaign:{${campaignId}}:cb:fail`;
    const circuitKey = `campaign:{${campaignId}}:circuit`;

    const failures = await redisClient.decr(failKey);

    if (failures <= 0) {
      await redisClient.del(failKey);
      await redisClient.del(circuitKey);
    }
  }

  /**
   * Get adjusted batch size based on circuit state
   * Reduces batch when circuit is open to prevent overload
   */
  async getBatchSize(campaignId: string, defaultSize: number = 50): Promise<number> {
    const circuitKey = `campaign:{${campaignId}}:circuit`;
    const state = await redisClient.get(circuitKey);

    if (state === 'open') {
      return Math.max(1, Math.floor(defaultSize / 4));  // 25% capacity
    }

    return defaultSize;
  }
}

export const circuitBreaker = new CircuitBreaker();
