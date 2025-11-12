import { Router } from 'express';
import { exotelController } from '../controllers/exotel.controller';
import { authenticate, requireAdmin } from '../middlewares/auth.middleware';
import { validate } from '../middlewares/validation.middleware';
import { z } from 'zod';

const router = Router();

// Validation schemas
const makeCallSchema = {
  body: z.object({
    phoneId: z.string().min(1, 'Phone ID is required'),
    to: z.string().min(10, 'Valid phone number is required').max(15)
  })
};

const callIdSchema = {
  params: z.object({
    callId: z.string().min(1, 'Call ID is required')
  })
};

const getCallHistorySchema = {
  query: z.object({
    page: z.string().optional(),
    limit: z.string().optional(),
    status: z.enum([
      'initiated',
      'ringing',
      'in-progress',
      'completed',
      'failed',
      'no-answer',
      'busy',
      'canceled',
      'user-ended',
      'agent-ended'
    ]).optional(),
    direction: z.enum(['inbound', 'outbound']).optional(),
    phoneId: z.string().optional(),
    agentId: z.string().optional()
  })
};

const getCallStatsSchema = {
  query: z.object({
    phoneId: z.string().optional(),
    agentId: z.string().optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional()
  })
};

// Protected routes (require authentication and admin access)
router.post(
  '/calls',
  authenticate,
  requireAdmin,
  validate(makeCallSchema),
  exotelController.makeCall.bind(exotelController)
);

router.get(
  '/calls',
  authenticate,
  requireAdmin,
  validate(getCallHistorySchema),
  exotelController.getCallHistory.bind(exotelController)
);

router.get(
  '/calls/stats',
  authenticate,
  requireAdmin,
  validate(getCallStatsSchema),
  exotelController.getCallStats.bind(exotelController)
);

router.get(
  '/calls/:callId',
  authenticate,
  requireAdmin,
  validate(callIdSchema),
  exotelController.getCall.bind(exotelController)
);

router.post(
  '/calls/:callId/hangup',
  authenticate,
  requireAdmin,
  validate(callIdSchema),
  exotelController.hangupCall.bind(exotelController)
);

// Transcript routes
router.get(
  '/calls/:callId/transcript',
  authenticate,
  requireAdmin,
  validate(callIdSchema),
  exotelController.getFormattedTranscript.bind(exotelController)
);

router.post(
  '/calls/:callId/transcript/regenerate',
  authenticate,
  requireAdmin,
  validate(callIdSchema),
  exotelController.regenerateTranscript.bind(exotelController)
);

// Webhook routes (no authentication - Exotel will call these)
router.post(
  '/webhook/status',
  exotelController.handleStatusWebhook.bind(exotelController)
);

router.post(
  '/webhook/incoming',
  exotelController.handleIncomingCallWebhook.bind(exotelController)
);

export default router;
