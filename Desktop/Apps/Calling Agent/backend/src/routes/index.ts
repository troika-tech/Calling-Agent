import { Router } from 'express';
import authRoutes from './auth.routes';
import agentRoutes from './agent.routes';
import phoneRoutes from './phone.routes';
import exotelRoutes from './exotel.routes';
import exotelVoiceRoutes from './exotelVoice.routes';
import knowledgeBaseRoutes from './knowledgeBase.routes';
import statsRoutes from './stats.routes';
import outgoingCallsRoutes from './outgoingCalls.routes';
import schedulingRoutes from './scheduling.routes';
import retryRoutes from './retry.routes';
import bulkRoutes from './bulk.routes';
import analyticsRoutes from './analytics.routes';
import settingsRoutes from './settings.routes';
import campaignRoutes from './campaign.routes';
import maintenanceRoutes from './maintenance.routes';

const router = Router();

// Health check (already in app.ts but can be here too)
router.get('/health', (_req, res) => {
  res.json({
    success: true,
    message: 'API is running',
    timestamp: new Date().toISOString()
  });
});

// Mount routes
router.use('/auth', authRoutes);
router.use('/agents', agentRoutes);
router.use('/phones', phoneRoutes);
router.use('/exotel', exotelRoutes);
router.use('/exotel/voice', exotelVoiceRoutes);
router.use('/knowledge-base', knowledgeBaseRoutes);
router.use('/stats', statsRoutes);
router.use('/calls', outgoingCallsRoutes);
router.use('/scheduling', schedulingRoutes);
router.use('/retry', retryRoutes);
router.use('/bulk', bulkRoutes);
router.use('/analytics', analyticsRoutes);
router.use('/settings', settingsRoutes);
router.use('/campaigns', campaignRoutes);
router.use('/maintenance', maintenanceRoutes);

// API info endpoint
router.get('/', (_req, res) => {
  res.json({
    success: true,
    message: 'AI Calling Platform API',
    version: '1.0.0',
    endpoints: {
      auth: '/api/v1/auth',
      agents: '/api/v1/agents',
      phones: '/api/v1/phones',
      incomingCalls: '/api/v1/exotel/calls',
      outgoingCalls: '/api/v1/calls/outbound',
      scheduling: '/api/v1/scheduling',
      retry: '/api/v1/retry',
      bulk: '/api/v1/bulk',
      analytics: '/api/v1/analytics',
      webhooks: '/api/v1/exotel/webhook',
      knowledgeBase: '/api/v1/knowledge-base',
      stats: '/api/v1/stats',
      settings: '/api/v1/settings',
      campaigns: '/api/v1/campaigns',
      maintenance: '/api/v1/maintenance'
    }
  });
});

export default router;
