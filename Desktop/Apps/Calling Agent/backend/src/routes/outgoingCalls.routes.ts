import { Router } from 'express';
import Joi from 'joi';
import { outgoingCallService } from '../services/outgoingCall.service';
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

const initiateCallSchema = Joi.object({
  phoneNumber: phoneNumberSchema,
  phoneId: Joi.string().required(),  // Required: Phone record containing Exotel credentials and appId
  agentId: Joi.string().required(),
  userId: Joi.string().required(),
  metadata: Joi.object().optional(),
  priority: Joi.string().valid('low', 'medium', 'high').optional()
});

const bulkCallSchema = Joi.object({
  calls: Joi.array().items(initiateCallSchema).min(1).max(1000).required()
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
 * POST /api/v1/calls/outbound
 * Initiate an immediate outbound call
 */
router.post(
  '/outbound',
  validateRequest(initiateCallSchema),
  asyncHandler(async (req: any, res: any) => {
    const { phoneNumber, phoneId, agentId, userId, metadata, priority } = req.validatedBody;

    logger.info('API: Initiating outbound call', {
      phoneNumber,
      phoneId,
      agentId,
      userId
    });

    try {
      const callLogId = await outgoingCallService.initiateCall({
        phoneNumber,
        phoneId,
        agentId,
        userId,
        metadata,
        priority
      });

      res.status(201).json({
        success: true,
        data: {
          callLogId,
          status: 'initiated',
          message: 'Outbound call initiated successfully'
        }
      });
    } catch (error: any) {
      logger.error('API: Failed to initiate outbound call', {
        phoneNumber,
        agentId,
        error: error.message
      });

      // Handle specific errors
      if (error.message.includes('Invalid phone number')) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_PHONE_NUMBER',
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

      if (error.message.includes('Maximum concurrent calls')) {
        return res.status(429).json({
          success: false,
          error: {
            code: 'CONCURRENT_LIMIT_REACHED',
            message: error.message
          }
        });
      }

      if (error.message.includes('Circuit breaker is OPEN')) {
        return res.status(503).json({
          success: false,
          error: {
            code: 'API_UNAVAILABLE',
            message: 'Exotel API is temporarily unavailable. Please try again later.'
          }
        });
      }

      // Generic error
      return res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to initiate call. Please try again.'
        }
      });
    }
  })
);

/**
 * POST /api/v1/calls/outbound/bulk
 * Initiate multiple outbound calls in bulk
 */
router.post(
  '/outbound/bulk',
  validateRequest(bulkCallSchema),
  asyncHandler(async (req: any, res: any) => {
    const { calls } = req.validatedBody;

    logger.info('API: Initiating bulk outbound calls', {
      count: calls.length
    });

    try {
      const callLogIds = await outgoingCallService.bulkInitiateCalls(calls);

      res.status(201).json({
        success: true,
        data: {
          total: calls.length,
          successful: callLogIds.length,
          failed: calls.length - callLogIds.length,
          callLogIds
        }
      });
    } catch (error: any) {
      logger.error('API: Failed to initiate bulk calls', {
        error: error.message
      });

      if (error.message.includes('Maximum 1000 calls')) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'BATCH_SIZE_EXCEEDED',
            message: error.message
          }
        });
      }

      return res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to initiate bulk calls'
        }
      });
    }
  })
);

/**
 * GET /api/v1/calls/:callLogId
 * Get call status and details
 */
router.get(
  '/:callLogId',
  asyncHandler(async (req: any, res: any) => {
    const { callLogId } = req.params;

    logger.info('API: Getting call status', { callLogId });

    try {
      const callStatus = await outgoingCallService.getCallStatus(callLogId);

      res.status(200).json({
        success: true,
        data: callStatus
      });
    } catch (error: any) {
      logger.error('API: Failed to get call status', {
        callLogId,
        error: error.message
      });

      if (error.message.includes('Call not found')) {
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
          message: 'Failed to get call status'
        }
      });
    }
  })
);

/**
 * POST /api/v1/calls/:callLogId/cancel
 * Cancel a call (scheduled or in-progress)
 */
router.post(
  '/:callLogId/cancel',
  asyncHandler(async (req: any, res: any) => {
    const { callLogId } = req.params;

    logger.info('API: Cancelling call', { callLogId });

    try {
      await outgoingCallService.cancelCall(callLogId);

      res.status(200).json({
        success: true,
        data: {
          callLogId,
          status: 'canceled',
          message: 'Call cancelled successfully'
        }
      });
    } catch (error: any) {
      logger.error('API: Failed to cancel call', {
        callLogId,
        error: error.message
      });

      if (error.message.includes('Call not found')) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'CALL_NOT_FOUND',
            message: error.message
          }
        });
      }

      if (error.message.includes('Cannot cancel call')) {
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
          message: 'Failed to cancel call'
        }
      });
    }
  })
);

/**
 * GET /api/v1/calls/outbound/stats
 * Get outbound calling service statistics
 */
router.get(
  '/outbound/stats',
  asyncHandler(async (req: any, res: any) => {
    logger.info('API: Getting outbound call stats');

    try {
      const stats = await outgoingCallService.getStats();

      res.status(200).json({
        success: true,
        data: stats
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

/**
 * GET /api/v1/calls/voicemail-stats
 * Get voicemail detection statistics
 */
router.get(
  '/voicemail-stats',
  asyncHandler(async (req: any, res: any) => {
    const { userId, startDate, endDate } = req.query;

    logger.info('API: Getting voicemail stats', { userId, startDate, endDate });

    try {
      const { analyticsService } = await import('../services/analytics.service');

      const timeRange = startDate && endDate ? {
        start: new Date(startDate as string),
        end: new Date(endDate as string)
      } : undefined;

      const stats = await analyticsService.getVoicemailAnalytics(userId as string, timeRange);

      res.status(200).json({
        success: true,
        data: stats
      });
    } catch (error: any) {
      logger.error('API: Failed to get voicemail stats', {
        error: error.message
      });

      return res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to get voicemail statistics'
        }
      });
    }
  })
);

/**
 * GET /api/v1/calls/:callLogId/voicemail-analysis
 * Get detailed voicemail detection data for a specific call
 */
router.get(
  '/:callLogId/voicemail-analysis',
  asyncHandler(async (req: any, res: any) => {
    const { callLogId } = req.params;

    logger.info('API: Getting voicemail analysis', { callLogId });

    try {
      const { CallLog } = await import('../models/CallLog');
      const callLog = await CallLog.findById(callLogId);

      if (!callLog) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Call not found'
          }
        });
      }

      const voicemailData = {
        isVoicemail: callLog.metadata?.voicemailDetected || false,
        confidence: callLog.metadata?.voicemailConfidence || 0,
        matchedKeywords: callLog.metadata?.voicemailKeywords || [],
        detectionTimestamp: callLog.metadata?.detectionTimestamp,
        detectionTimeSeconds: callLog.metadata?.detectionTimeSeconds,
        callDurationAtDetection: callLog.metadata?.callDurationAtDetection,
        markedAsFalsePositive: callLog.metadata?.markedAsFalsePositive || false
      };

      res.status(200).json({
        success: true,
        data: voicemailData
      });
    } catch (error: any) {
      logger.error('API: Failed to get voicemail analysis', {
        callLogId,
        error: error.message
      });

      return res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to get voicemail analysis'
        }
      });
    }
  })
);

/**
 * POST /api/v1/calls/:callLogId/mark-false-positive
 * Mark a voicemail detection as a false positive
 */
router.post(
  '/:callLogId/mark-false-positive',
  asyncHandler(async (req: any, res: any) => {
    const { callLogId } = req.params;
    const { isFalsePositive } = req.body;

    logger.info('API: Marking voicemail false positive', { callLogId, isFalsePositive });

    try {
      const { CallLog } = await import('../models/CallLog');

      const callLog = await CallLog.findByIdAndUpdate(
        callLogId,
        {
          $set: {
            'metadata.markedAsFalsePositive': isFalsePositive === true,
            'metadata.falsePositiveMarkedAt': new Date()
          }
        },
        { new: true }
      );

      if (!callLog) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Call not found'
          }
        });
      }

      res.status(200).json({
        success: true,
        data: {
          callLogId,
          markedAsFalsePositive: isFalsePositive
        }
      });
    } catch (error: any) {
      logger.error('API: Failed to mark false positive', {
        callLogId,
        error: error.message
      });

      return res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to update call'
        }
      });
    }
  })
);

/**
 * GET /api/v1/calls/retriable
 * Get failed calls that can be retried (excludes voicemail)
 */
router.get(
  '/retriable',
  asyncHandler(async (req: any, res: any) => {
    const { userId, agentId, phoneId, limit } = req.query;

    logger.info('API: Getting retriable calls', { userId, agentId, phoneId, limit });

    try {
      if (!userId) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_PARAMETER',
            message: 'userId is required'
          }
        });
      }

      const calls = await outgoingCallService.getRetriableCalls(userId as string, {
        agentId: agentId as string,
        phoneId: phoneId as string,
        limit: limit ? parseInt(limit as string) : undefined
      });

      res.status(200).json({
        success: true,
        data: calls
      });
    } catch (error: any) {
      logger.error('API: Failed to get retriable calls', {
        error: error.message
      });

      return res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to get retriable calls'
        }
      });
    }
  })
);

export default router;
