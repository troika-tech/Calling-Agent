import { Router } from 'express';
import Joi from 'joi';
import { callSchedulerService } from '../services/callScheduler.service';
import { getQueueStats } from '../queues/scheduledCalls.queue';
import logger from '../utils/logger';

const router = Router();

/**
 * Validation Schemas
 */

// E.164 phone number validation
const phoneNumberSchema = Joi.string()
  .pattern(/^\+[1-9]\d{1,14}$/)
  .required()
  .messages({
    'string.pattern.base': 'Phone number must be in E.164 format (e.g., +919876543210)'
  });

const scheduleCallSchema = Joi.object({
  phoneNumber: phoneNumberSchema,
  agentId: Joi.string().required(),
  userId: Joi.string().required(),
  scheduledFor: Joi.date().iso().greater('now').required(),
  timezone: Joi.string().optional(),
  respectBusinessHours: Joi.boolean().optional(),
  businessHours: Joi.object({
    start: Joi.string().pattern(/^([01]\d|2[0-3]):([0-5]\d)$/).required(),
    end: Joi.string().pattern(/^([01]\d|2[0-3]):([0-5]\d)$/).required(),
    timezone: Joi.string().optional(),
    daysOfWeek: Joi.array().items(Joi.number().min(0).max(6)).optional()
  }).optional(),
  recurring: Joi.object({
    frequency: Joi.string().valid('daily', 'weekly', 'monthly').required(),
    interval: Joi.number().min(1).required(),
    endDate: Joi.date().iso().optional(),
    maxOccurrences: Joi.number().min(1).optional()
  }).optional(),
  metadata: Joi.object().optional(),
  priority: Joi.string().valid('low', 'medium', 'high').optional()
});

const rescheduleCallSchema = Joi.object({
  scheduledFor: Joi.date().iso().greater('now').required()
});

/**
 * Middleware: Request Validation
 */
const validateRequest = (schema: Joi.ObjectSchema) => {
  return (req: any, res: any, next: any) => {
    const { error, value } = schema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true
    });

    if (error) {
      const errors = error.details.map((detail) => ({
        field: detail.path.join('.'),
        message: detail.message
      }));

      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request data',
          details: errors
        }
      });
    }

    req.validatedBody = value;
    next();
  };
};

/**
 * Middleware: Error Handler
 */
const asyncHandler = (fn: Function) => {
  return (req: any, res: any, next: any) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

/**
 * POST /api/v1/scheduling/schedule
 * Schedule a call for future execution
 */
router.post(
  '/schedule',
  validateRequest(scheduleCallSchema),
  asyncHandler(async (req: any, res: any) => {
    const params = req.validatedBody;

    logger.info('API: Scheduling call', {
      phoneNumber: params.phoneNumber,
      scheduledFor: params.scheduledFor,
      recurring: params.recurring
    });

    try {
      const scheduledCallId = await callSchedulerService.scheduleCall(params);

      res.status(201).json({
        success: true,
        data: {
          scheduledCallId,
          scheduledFor: params.scheduledFor,
          message: 'Call scheduled successfully'
        }
      });
    } catch (error: any) {
      logger.error('API: Failed to schedule call', {
        error: error.message
      });

      if (error.message.includes('Invalid timezone')) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_TIMEZONE',
            message: error.message
          }
        });
      }

      if (error.message.includes('must be in the future')) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_SCHEDULED_TIME',
            message: error.message
          }
        });
      }

      if (error.message.includes('Agent not found')) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'AGENT_NOT_FOUND',
            message: error.message
          }
        });
      }

      return res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to schedule call'
        }
      });
    }
  })
);

/**
 * GET /api/v1/scheduling/scheduled-calls
 * Get all scheduled calls for a user
 */
router.get(
  '/scheduled-calls',
  asyncHandler(async (req: any, res: any) => {
    const { userId, status, startDate, endDate, agentId } = req.query;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_USER_ID',
          message: 'userId query parameter is required'
        }
      });
    }

    logger.info('API: Getting scheduled calls', { userId, status });

    try {
      const scheduledCalls = await callSchedulerService.getScheduledCalls(userId, {
        status,
        startDate: startDate ? new Date(startDate as string) : undefined,
        endDate: endDate ? new Date(endDate as string) : undefined,
        agentId
      });

      res.status(200).json({
        success: true,
        data: {
          scheduledCalls,
          total: scheduledCalls.length
        }
      });
    } catch (error: any) {
      logger.error('API: Failed to get scheduled calls', {
        error: error.message
      });

      return res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to get scheduled calls'
        }
      });
    }
  })
);

/**
 * POST /api/v1/scheduling/:scheduledCallId/cancel
 * Cancel a scheduled call
 */
router.post(
  '/:scheduledCallId/cancel',
  asyncHandler(async (req: any, res: any) => {
    const { scheduledCallId } = req.params;
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_USER_ID',
          message: 'userId is required in request body'
        }
      });
    }

    logger.info('API: Cancelling scheduled call', {
      scheduledCallId,
      userId
    });

    try {
      await callSchedulerService.cancelScheduledCall(scheduledCallId, userId);

      res.status(200).json({
        success: true,
        data: {
          scheduledCallId,
          status: 'cancelled',
          message: 'Scheduled call cancelled successfully'
        }
      });
    } catch (error: any) {
      logger.error('API: Failed to cancel scheduled call', {
        scheduledCallId,
        error: error.message
      });

      if (error.message.includes('not found')) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'SCHEDULED_CALL_NOT_FOUND',
            message: error.message
          }
        });
      }

      if (error.message.includes('Cannot cancel')) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_OPERATION',
            message: error.message
          }
        });
      }

      return res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to cancel scheduled call'
        }
      });
    }
  })
);

/**
 * POST /api/v1/scheduling/:scheduledCallId/reschedule
 * Reschedule a call to a new time
 */
router.post(
  '/:scheduledCallId/reschedule',
  validateRequest(rescheduleCallSchema),
  asyncHandler(async (req: any, res: any) => {
    const { scheduledCallId } = req.params;
    const { scheduledFor } = req.validatedBody;
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_USER_ID',
          message: 'userId is required in request body'
        }
      });
    }

    logger.info('API: Rescheduling call', {
      scheduledCallId,
      newTime: scheduledFor
    });

    try {
      await callSchedulerService.rescheduleCall(scheduledCallId, userId, scheduledFor);

      res.status(200).json({
        success: true,
        data: {
          scheduledCallId,
          scheduledFor,
          message: 'Call rescheduled successfully'
        }
      });
    } catch (error: any) {
      logger.error('API: Failed to reschedule call', {
        scheduledCallId,
        error: error.message
      });

      if (error.message.includes('not found')) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'SCHEDULED_CALL_NOT_FOUND',
            message: error.message
          }
        });
      }

      if (error.message.includes('Cannot reschedule')) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_OPERATION',
            message: error.message
          }
        });
      }

      return res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to reschedule call'
        }
      });
    }
  })
);

/**
 * GET /api/v1/scheduling/stats
 * Get scheduling statistics
 */
router.get(
  '/stats',
  asyncHandler(async (req: any, res: any) => {
    logger.info('API: Getting scheduling stats');

    try {
      const [schedulerStats, queueStats] = await Promise.all([
        callSchedulerService.getStats(),
        getQueueStats()
      ]);

      res.status(200).json({
        success: true,
        data: {
          scheduler: schedulerStats,
          queue: queueStats
        }
      });
    } catch (error: any) {
      logger.error('API: Failed to get stats', {
        error: error.message
      });

      return res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to get statistics'
        }
      });
    }
  })
);

export default router;
