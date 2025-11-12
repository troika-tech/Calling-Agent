import app from './app';
import { env } from './config/env';
import { connectDB } from './config/db';
import { connectRedis } from './config/redis';
import { logger } from './utils/logger';
import { createServer } from 'http';
import { initializeWebSocket } from './websocket/websocket.server';
// Import queue processors to register them
import './queues/processors/scheduledCallsProcessor';
import './queues/processors/campaignCallsProcessor';

// Import background services
import { redisConcurrencyTracker } from './utils/redisConcurrency.util';
import { leaseJanitor } from './services/leaseJanitor.service';
import { waitlistCompactor } from './services/waitlistCompactor.service';
import { bullmqReconciler } from './services/bullmqReconciler.service';
import { reconciliationService } from './services/reconciliation.service';
import { invariantMonitor } from './services/invariantMonitor.service';
import { waitlistService } from './services/waitlist.service';
import { gracefulShutdown as gracefulShutdownUtil } from './utils/gracefulShutdown';

// Create HTTP server
const server = createServer(app);

// Initialize WebSocket server
initializeWebSocket(server);

// Start server
const startServer = async () => {
  try {
    // Connect to MongoDB
    await connectDB();
    logger.info('Database connected');

    // Connect to Redis
    await connectRedis();
    logger.info('Redis connected');

    // Initialize Redis concurrency tracker (preload Lua scripts)
    await redisConcurrencyTracker.initialize();
    logger.info('Redis concurrency tracker initialized');

    // Start background services in order
    await Promise.all([
      leaseJanitor.start(),
      waitlistCompactor.start(),
      bullmqReconciler.start(),
      reconciliationService.start(),
      invariantMonitor.start(),
      waitlistService.start()
    ]);
    logger.info('All background services started');

    // Start listening
    server.listen(env.PORT, () => {
      logger.info(`Server started successfully`, {
        port: env.PORT,
        env: env.NODE_ENV,
        url: `http://localhost:${env.PORT}`,
        websocket: `ws://localhost:${env.PORT}/ws`
      });
    });

  } catch (error) {
    logger.error('Failed to start server', { error });
    process.exit(1);
  }
};

// Note: Graceful shutdown is handled by ./utils/gracefulShutdown.ts
// It registers SIGTERM and SIGINT handlers automatically on import

// Handle unhandled errors
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection', { reason, promise });
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception', { error });
  process.exit(1);
});

// Start the server
startServer();

export default server;

