import { createClient } from 'redis';
import { env } from './env';
import { logger } from '../utils/logger';

// Create Redis client
export const redis = createClient({
  url: env.REDIS_URL
});

// Alias for backward compatibility
export const redisClient = redis;

// Event handlers
redis.on('error', (err) => {
  logger.error('Redis error', { error: err });
});

redis.on('connect', () => {
  logger.info('Redis connecting...');
});

redis.on('ready', () => {
  logger.info('Redis connected successfully');
});

redis.on('reconnecting', () => {
  logger.warn('Redis reconnecting...');
});

redis.on('end', () => {
  logger.info('Redis connection closed');
});

// Connect to Redis
export const connectRedis = async (): Promise<void> => {
  try {
    await redis.connect();
  } catch (error) {
    logger.error('Redis connection failed', { error });
    throw error;
  }
};

// Disconnect from Redis
export const disconnectRedis = async (): Promise<void> => {
  try {
    await redis.quit();
  } catch (error) {
    logger.error('Error closing Redis connection', { error });
  }
};

// Cache helper class
export class CacheService {
  /**
   * Get value from cache
   */
  async get<T>(key: string): Promise<T | null> {
    try {
      const data = await redis.get(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      logger.error('Cache get error', { error, key });
      return null;
    }
  }

  /**
   * Set value in cache
   */
  async set(key: string, value: any, ttl?: number): Promise<void> {
    try {
      const data = JSON.stringify(value);
      if (ttl) {
        await redis.setEx(key, ttl, data);
      } else {
        await redis.set(key, data);
      }
    } catch (error) {
      logger.error('Cache set error', { error, key });
    }
  }

  /**
   * Delete value from cache
   */
  async del(key: string): Promise<void> {
    try {
      await redis.del(key);
    } catch (error) {
      logger.error('Cache delete error', { error, key });
    }
  }

  /**
   * Check if key exists
   */
  async exists(key: string): Promise<boolean> {
    try {
      return (await redis.exists(key)) === 1;
    } catch (error) {
      logger.error('Cache exists error', { error, key });
      return false;
    }
  }

  /**
   * Clear all keys matching pattern
   */
  async clearPattern(pattern: string): Promise<void> {
    try {
      const keys = await redis.keys(pattern);
      if (keys.length > 0) {
        await redis.del(keys);
      }
    } catch (error) {
      logger.error('Cache clear pattern error', { error, pattern });
    }
  }
}

export const cacheService = new CacheService();
