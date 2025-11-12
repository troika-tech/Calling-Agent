import { Router } from 'express';
import Joi from 'joi';
import { retryManagerService } from '../services/retryManager.service';
import { autoRetryService } from '../services/autoRetry.service';
import logger from '../utils/logger';

const router = Router();

/**
 * Validation Schemas
 */

const scheduleRetrySchema = Joi.object({
  callLogId: Joi.string().required(),
  forceRetry: Joi.boolean().optional(),
  scheduledFor: Joi.date().iso().greater('now').optional(),
  respectOffPeakHours: Joi.boolean().optional(),
  overrideFailureReason: Joi.string().optional(),
  metadata: Joi.object().optional()
});

const batchRetrySchema = Joi.object({
  callLogIds: Joi.array().items(Joi.string()).min(1).max(100).required(),
  forceRetry: Joi.boolean().optional(),
  respectOffPeakHours: Joi.boolean().optional()
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
 * POST /api/v1/retry/schedule
 * Schedule a manual retry for a failed call
 */
router.post(
  '/schedule',
  validateRequest(scheduleRetrySchema),
  asyncHandler(async (req: any, res: any) => {
    const {
      callLogId,
      forceRetry,
      scheduledFor,
      respectOffPeakHours,
      overrideFailureReason,
      metadata
    } = req.validatedBody;

    logger.info('API: Scheduling manual retry', { callLogId });

    try {
      const retryAttemptId = await retryManagerService.scheduleRetry(callLogId, {
        forceRetry,
        scheduledFor,
        respectOffPeakHours,
        overrideFailureReason,
        metadata: {
          ...metadata,
          manualRetry: true,
          manualRetryTriggeredAt: new Date()
        }
      });

      if (!retryAttemptId) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'RETRY_NOT_SCHEDULED',
            message: 'Retry could not be scheduled. Check if call is retryable or max attempts reached.'
          }
        });
      }

      res.status(201).json({
        success: true,
        data: {
          retryAttemptId,
          callLogId,
          message: 'Retry scheduled successfully'
        }
      });
    } catch (error: any) {
      logger.error('API: Failed to schedule retry', {
        callLogId,
        error: error.message
      });

      if (error.message.includes('not found')) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'CALL_NOT_FOUND',
            message: error.message
          }
        });
      }

      return res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to schedule retry'
        }
      });
    }
  })
);

/**
 * POST /api/v1/retry/batch
 * Schedule retries for multiple failed calls
 */
router.post(
  '/batch',
  validateRequest(batchRetrySchema),
  asyncHandler(async (req: any, res: any) => {
    const { callLogIds, forceRetry, respectOffPeakHours } = req.validatedBody;

    logger.info('API: Scheduling batch retries', {
      count: callLogIds.length
    });

    const results = {
      total: callLogIds.length,
      scheduled: 0,
      failed: 0,
      details: [] as Array<{
        callLogId: string;
        success: boolean;
        retryAttemptId?: string;
        error?: string;
      }>
    };

    for (const callLogId of callLogIds) {
      try {
        const retryAttemptId = await retryManagerService.scheduleRetry(callLogId, {
          forceRetry,
          respectOffPeakHours,
          metadata: {
            batchRetry: true,
            batchRetryTriggeredAt: new Date()
          }
        });

        if (retryAttemptId) {
          results.scheduled++;
          results.details.push({
            callLogId,
            success: true,
            retryAttemptId
          });
        } else {
          results.failed++;
          results.details.push({
            callLogId,
            success: false,
            error: 'Retry conditions not met'
          });
        }
      } catch (error: any) {
        results.failed++;
        results.details.push({
          callLogId,
          success: false,
          error: error.message
        });
      }
    }

    logger.info('API: Batch retry complete', {
      total: results.total,
      scheduled: results.scheduled,
      failed: results.failed
    });

    res.status(200).json({
      success: true,
      data: results
    });
  })
);

/**
 * POST /api/v1/retry/:retryAttemptId/cancel
 * Cancel a scheduled retry
 */
router.post(
  '/:retryAttemptId/cancel',
  asyncHandler(async (req: any, res: any) => {
    const { retryAttemptId } = req.params;

    logger.info('API: Cancelling retry', { retryAttemptId });

    try {
      await retryManagerService.cancelRetry(retryAttemptId);

      res.status(200).json({
        success: true,
        data: {
          retryAttemptId,
          status: 'cancelled',
          message: 'Retry cancelled successfully'
        }
      });
    } catch (error: any) {
      logger.error('API: Failed to cancel retry', {
        retryAttemptId,
        error: error.message
      });

      if (error.message.includes('not found')) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'RETRY_NOT_FOUND',
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
          message: 'Failed to cancel retry'
        }
      });
    }
  })
);

/**
 * GET /api/v1/retry/history/:callLogId
 * Get retry history for a specific call
 */
router.get(
  '/history/:callLogId',
  asyncHandler(async (req: any, res: any) => {
    const { callLogId } = req.params;

    logger.info('API: Getting retry history', { callLogId });

    try {
      const retryHistory = await retryManagerService.getRetryHistory(callLogId);

      res.status(200).json({
        success: true,
        data: {
          callLogId,
          retries: retryHistory,
          totalRetries: retryHistory.length
        }
      });
    } catch (error: any) {
      logger.error('API: Failed to get retry history', {
        callLogId,
        error: error.message
      });

      return res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to get retry history'
        }
      });
    }
  })
);

/**
 * GET /api/v1/retry/stats
 * Get retry statistics
 */
router.get(
  '/stats',
  asyncHandler(async (req: any, res: any) => {
    const { userId } = req.query;

    logger.info('API: Getting retry stats', { userId });

    try {
      const stats = await retryManagerService.getRetryStats(userId as string);

      res.status(200).json({
        success: true,
        data: stats
      });
    } catch (error: any) {
      logger.error('API: Failed to get retry stats', {
        error: error.message
      });

      return res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to get retry statistics'
        }
      });
    }
  })
);

/**
 * POST /api/v1/retry/process-pending
 * Process pending failures for auto-retry
 * (Admin/maintenance endpoint)
 */
router.post(
  '/process-pending',
  asyncHandler(async (req: any, res: any) => {
    const { lookbackMinutes = 60 } = req.body;

    logger.info('API: Processing pending failures', { lookbackMinutes });

    try {
      const result = await autoRetryService.processPendingFailures(lookbackMinutes);

      res.status(200).json({
        success: true,
        data: {
          ...result,
          message: 'Pending failures processed'
        }
      });
    } catch (error: any) {
      logger.error('API: Failed to process pending failures', {
        error: error.message
      });

      return res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to process pending failures'
        }
      });
    }
  })
);

/**
 * GET /api/v1/retry/config
 * Get auto-retry configuration
 */
router.get(
  '/config',
  asyncHandler(async (req: any, res: any) => {
    const config = autoRetryService.getConfig();

    res.status(200).json({
      success: true,
      data: config
    });
  })
);

export default router;
