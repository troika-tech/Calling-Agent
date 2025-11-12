import { LiveClient } from '@deepgram/sdk';
import { deepgramService, DeepgramTranscriptionResult } from './deepgram.service';
import { logger } from '../utils/logger';
import { RateLimitError } from '../utils/errors';

/**
 * Queued connection request
 */
interface QueuedRequest {
  clientId: string;
  options: any;
  resolve: (connection: LiveClient) => void;
  reject: (error: Error) => void;
  timestamp: number;
  timeoutId?: NodeJS.Timeout;
}

/**
 * Connection pool statistics
 */
export interface PoolStats {
  active: number;
  queued: number;
  capacity: number;
  utilization: number;
  totalAcquired: number;
  totalReleased: number;
  totalQueued: number;
  totalTimeout: number;
  totalFailed: number;
}

/**
 * Deepgram Connection Pool Manager
 *
 * Manages Deepgram live streaming connections with rate limiting and queuing.
 *
 * Features:
 * - Enforces Deepgram's 20 concurrent connection limit
 * - Queues overflow requests instead of failing
 * - Automatic timeout for queued requests
 * - Connection tracking and lifecycle management
 * - Comprehensive metrics and logging
 *
 * Usage:
 * ```typescript
 * // Acquire connection
 * const connection = await deepgramConnectionPool.acquireConnection(clientId, {
 *   language: 'en',
 *   onTranscript: (result) => {...},
 *   onSpeechEnded: () => {...}
 * });
 *
 * // Release when done
 * deepgramConnectionPool.releaseConnection(clientId);
 * ```
 */
export class DeepgramConnectionPool {
  private readonly maxConnections: number;
  private activeConnections: number = 0;
  private connectionMap: Map<string, LiveClient> = new Map();
  private queue: QueuedRequest[] = [];
  private readonly queueTimeout: number;
  private readonly maxQueueSize: number;

  // Metrics
  private totalAcquired: number = 0;
  private totalReleased: number = 0;
  private totalQueued: number = 0;
  private totalTimeout: number = 0;
  private totalFailed: number = 0;

  constructor(config?: {
    maxConnections?: number;
    queueTimeout?: number;
    maxQueueSize?: number;
  }) {
    this.maxConnections = config?.maxConnections || 20; // Deepgram's limit
    this.queueTimeout = config?.queueTimeout || 30000; // 30 seconds
    this.maxQueueSize = config?.maxQueueSize || 50; // Max 50 queued requests

    logger.info('Deepgram connection pool initialized', {
      maxConnections: this.maxConnections,
      queueTimeout: this.queueTimeout,
      maxQueueSize: this.maxQueueSize
    });
  }

  /**
   * Acquire a Deepgram live connection from pool
   *
   * If pool is at capacity, request is queued and will be processed
   * when a connection becomes available.
   *
   * @param clientId - Unique client identifier (WebSocket client ID)
   * @param options - Deepgram connection options
   * @returns Promise<LiveClient> - Deepgram live streaming connection
   * @throws RateLimitError if queue is full
   * @throws Error if connection creation fails or timeout
   */
  async acquireConnection(
    clientId: string,
    options?: {
      endpointing?: number;
      vadEvents?: boolean;
      language?: string;
      onTranscript?: (result: DeepgramTranscriptionResult) => void;
      onSpeechStarted?: () => void;
      onSpeechEnded?: () => void;
    }
  ): Promise<LiveClient> {
    // Check if client already has a connection
    if (this.connectionMap.has(clientId)) {
      logger.warn('Client already has active connection', {
        clientId,
        action: 'reusing_existing'
      });
      return this.connectionMap.get(clientId)!;
    }

    logger.info('Connection acquisition requested', {
      clientId,
      active: this.activeConnections,
      queued: this.queue.length,
      capacity: this.maxConnections
    });

    // If pool has capacity, create connection immediately
    if (this.activeConnections < this.maxConnections) {
      return await this.createConnection(clientId, options);
    }

    // Pool is full - queue the request
    return this.enqueueRequest(clientId, options);
  }

  /**
   * Release connection back to pool
   *
   * Closes the connection, removes it from tracking, and processes
   * next queued request if any.
   *
   * @param clientId - Client identifier
   */
  releaseConnection(clientId: string): void {
    const connection = this.connectionMap.get(clientId);

    if (!connection) {
      logger.debug('Release called for non-existent connection', { clientId });
      return;
    }

    try {
      // Remove all event listeners to prevent memory leaks
      connection.removeAllListeners();

      // Close the connection
      connection.finish();

      // Remove from tracking
      this.connectionMap.delete(clientId);
      this.activeConnections--;
      this.totalReleased++;

      logger.info('Connection released', {
        clientId,
        active: this.activeConnections,
        queued: this.queue.length
      });

      // Process next queued request if any
      this.processQueue();
    } catch (error: any) {
      logger.error('Error releasing connection', {
        clientId,
        error: error.message
      });

      // Still decrement counter to prevent pool lock
      this.activeConnections = Math.max(0, this.activeConnections - 1);
    }
  }

  /**
   * Force release all connections (for graceful shutdown)
   */
  releaseAll(): void {
    logger.info('Releasing all connections', {
      active: this.activeConnections,
      queued: this.queue.length
    });

    // Release all active connections
    const clientIds = Array.from(this.connectionMap.keys());
    clientIds.forEach(clientId => this.releaseConnection(clientId));

    // Clear queue and reject all pending requests
    while (this.queue.length > 0) {
      const request = this.queue.shift();
      if (request) {
        if (request.timeoutId) {
          clearTimeout(request.timeoutId);
        }
        request.reject(new Error('Pool shutdown - connection request cancelled'));
      }
    }

    logger.info('All connections released');
  }

  /**
   * Get pool statistics
   */
  getStats(): PoolStats {
    return {
      active: this.activeConnections,
      queued: this.queue.length,
      capacity: this.maxConnections,
      utilization: (this.activeConnections / this.maxConnections) * 100,
      totalAcquired: this.totalAcquired,
      totalReleased: this.totalReleased,
      totalQueued: this.totalQueued,
      totalTimeout: this.totalTimeout,
      totalFailed: this.totalFailed
    };
  }

  /**
   * Get connection for specific client (for debugging)
   */
  getConnection(clientId: string): LiveClient | undefined {
    return this.connectionMap.get(clientId);
  }

  /**
   * Check if client has active connection
   */
  hasConnection(clientId: string): boolean {
    return this.connectionMap.has(clientId);
  }

  /**
   * Create actual Deepgram connection
   * @private
   */
  private async createConnection(
    clientId: string,
    options?: any
  ): Promise<LiveClient> {
    try {
      this.activeConnections++;
      this.totalAcquired++;

      logger.info('Creating Deepgram connection', {
        clientId,
        active: this.activeConnections,
        capacity: this.maxConnections
      });

      const connection = await deepgramService.createLiveConnectionWithVAD(options);

      // Store in map for tracking
      this.connectionMap.set(clientId, connection);

      // Add close handler for automatic cleanup
      connection.on('close', () => {
        logger.info('Deepgram connection closed by server', { clientId });
        if (this.connectionMap.has(clientId)) {
          this.releaseConnection(clientId);
        }
      });

      logger.info('Deepgram connection created successfully', {
        clientId,
        active: this.activeConnections
      });

      return connection;
    } catch (error: any) {
      this.activeConnections--;
      this.totalFailed++;

      logger.error('Failed to create Deepgram connection', {
        clientId,
        error: error.message,
        stack: error.stack
      });

      throw error;
    }
  }

  /**
   * Enqueue connection request when pool is full
   * @private
   */
  private enqueueRequest(clientId: string, options?: any): Promise<LiveClient> {
    // Check queue size limit
    if (this.queue.length >= this.maxQueueSize) {
      this.totalFailed++;

      logger.error('Queue is full - rejecting request', {
        clientId,
        queueSize: this.queue.length,
        maxQueueSize: this.maxQueueSize
      });

      throw new RateLimitError(
        `Deepgram connection pool exhausted. Queue full (${this.maxQueueSize} requests waiting)`
      );
    }

    return new Promise<LiveClient>((resolve, reject) => {
      this.totalQueued++;

      // Set timeout for queued request
      const timeoutId = setTimeout(() => {
        this.totalTimeout++;

        // Remove from queue
        const index = this.queue.findIndex(req => req.clientId === clientId);
        if (index > -1) {
          this.queue.splice(index, 1);
        }

        logger.error('Queued connection request timed out', {
          clientId,
          waitTime: this.queueTimeout,
          queuePosition: index + 1
        });

        reject(new Error(
          `Connection request timeout after ${this.queueTimeout}ms. ` +
          `Queue position: ${index + 1}/${this.queue.length}`
        ));
      }, this.queueTimeout);

      const request: QueuedRequest = {
        clientId,
        options,
        resolve,
        reject,
        timestamp: Date.now(),
        timeoutId
      };

      this.queue.push(request);

      logger.warn('Connection request queued', {
        clientId,
        queuePosition: this.queue.length,
        active: this.activeConnections,
        capacity: this.maxConnections
      });
    });
  }

  /**
   * Process next request in queue
   * @private
   */
  private processQueue(): void {
    if (this.queue.length === 0) {
      return;
    }

    if (this.activeConnections >= this.maxConnections) {
      logger.debug('Pool still at capacity, cannot process queue');
      return;
    }

    const request = this.queue.shift();
    if (!request) {
      return;
    }

    // Clear timeout since we're processing now
    if (request.timeoutId) {
      clearTimeout(request.timeoutId);
    }

    const waitTime = Date.now() - request.timestamp;

    logger.info('Processing queued connection request', {
      clientId: request.clientId,
      waitTime: `${waitTime}ms`,
      remainingQueue: this.queue.length
    });

    // Create connection for queued request
    this.createConnection(request.clientId, request.options)
      .then(connection => request.resolve(connection))
      .catch(error => request.reject(error));
  }
}

// Export singleton instance
export const deepgramConnectionPool = new DeepgramConnectionPool();

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received - releasing all Deepgram connections');
  deepgramConnectionPool.releaseAll();
});

process.on('SIGINT', () => {
  logger.info('SIGINT received - releasing all Deepgram connections');
  deepgramConnectionPool.releaseAll();
});
