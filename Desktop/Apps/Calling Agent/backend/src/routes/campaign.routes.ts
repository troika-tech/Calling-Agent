/**
 * Campaign Routes
 * API endpoints for campaign management
 */

import { Router, Request, Response, NextFunction } from 'express';
import Joi from 'joi';
import { campaignService } from '../services/campaign.service';
import { campaignQueueService } from '../services/campaignQueue.service';
import { authenticate as auth } from '../middlewares/auth.middleware';
import { logger } from '../utils/logger';

const router = Router();

// Apply authentication to all routes
router.use(auth);

/**
 * Middleware: Request Validation
 */
const validateRequest = (schema: Joi.ObjectSchema) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const { error, value } = schema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true
    });

    if (error) {
      const errors = error.details.map((detail) => detail.message);
      res.status(400).json({
        success: false,
        error: 'Validation error',
        details: errors
      });
      return;
    }

    req.body = value;
    next();
  };
};

/**
 * Middleware: Query Validation
 */
const validateQuery = (schema: Joi.ObjectSchema) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const { error, value } = schema.validate(req.query, {
      abortEarly: false,
      stripUnknown: true
    });

    if (error) {
      const errors = error.details.map((detail) => detail.message);
      res.status(400).json({
        success: false,
        error: 'Validation error',
        details: errors
      });
      return;
    }

    req.query = value as any;
    next();
  };
};

/**
 * Middleware: Params Validation
 */
const validateParams = (schema: Joi.ObjectSchema) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const { error, value } = schema.validate(req.params, {
      abortEarly: false,
      stripUnknown: true
    });

    if (error) {
      const errors = error.details.map((detail) => detail.message);
      res.status(400).json({
        success: false,
        error: 'Validation error',
        details: errors
      });
      return;
    }

    req.params = value;
    next();
  };
};

// Validation Schemas
const createCampaignSchema = Joi.object({
  name: Joi.string().trim().min(1).max(200).required().messages({
    'string.empty': 'Name is required',
    'string.min': 'Name must be at least 1 character',
    'string.max': 'Name must be at most 200 characters'
  }),
  agentId: Joi.string().regex(/^[0-9a-fA-F]{24}$/).required().messages({
    'string.pattern.base': 'Invalid agent ID'
  }),
  phoneId: Joi.string().regex(/^[0-9a-fA-F]{24}$/).optional().messages({
    'string.pattern.base': 'Invalid phone ID'
  }),
  description: Joi.string().trim().max(1000).optional().allow(''),
  scheduledFor: Joi.date().iso().optional(),
  settings: Joi.object({
    retryFailedCalls: Joi.boolean().optional(),
    maxRetryAttempts: Joi.number().integer().min(0).max(10).optional(),
    retryDelayMinutes: Joi.number().integer().min(1).optional(),
    excludeVoicemail: Joi.boolean().optional(),
    priorityMode: Joi.string().valid('fifo', 'lifo', 'priority').optional(),
    concurrentCallsLimit: Joi.number().integer().min(1).max(50).optional().messages({
      'number.min': 'Concurrent calls limit must be at least 1',
      'number.max': 'Concurrent calls limit must be at most 50'
    })
  }).optional()
});

const updateCampaignSchema = Joi.object({
  name: Joi.string().trim().min(1).max(200).optional(),
  description: Joi.string().trim().max(1000).optional().allow(''),
  scheduledFor: Joi.date().iso().optional(),
  settings: Joi.object({
    retryFailedCalls: Joi.boolean().optional(),
    maxRetryAttempts: Joi.number().integer().min(0).max(10).optional(),
    retryDelayMinutes: Joi.number().integer().min(1).optional(),
    excludeVoicemail: Joi.boolean().optional(),
    priorityMode: Joi.string().valid('fifo', 'lifo', 'priority').optional(),
    concurrentCallsLimit: Joi.number().integer().min(1).max(50).optional()
  }).optional()
});

const addContactsSchema = Joi.object({
  contacts: Joi.array().min(1).items(
    Joi.object({
      phoneNumber: Joi.string().pattern(/^\+[1-9]\d{1,14}$/).required().messages({
        'string.pattern.base': 'Invalid phone number format (E.164 required)'
      }),
      name: Joi.string().trim().max(200).optional().allow(''),
      email: Joi.string().email().optional().allow(''),
      priority: Joi.number().integer().optional(),
      metadata: Joi.object().optional()
    })
  ).required().messages({
    'array.min': 'Contacts must be a non-empty array'
  })
});

const getCampaignsQuerySchema = Joi.object({
  status: Joi.string().optional(),
  agentId: Joi.string().regex(/^[0-9a-fA-F]{24}$/).optional(),
  search: Joi.string().optional(),
  page: Joi.number().integer().min(1).optional(),
  limit: Joi.number().integer().min(1).max(100).optional()
});

const getContactsQuerySchema = Joi.object({
  status: Joi.string().optional(),
  page: Joi.number().integer().min(1).optional(),
  limit: Joi.number().integer().min(1).max(100).optional()
});

const paginationQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).optional(),
  limit: Joi.number().integer().min(1).max(100).optional()
});

const idParamSchema = Joi.object({
  id: Joi.string().regex(/^[0-9a-fA-F]{24}$/).required().messages({
    'string.pattern.base': 'Invalid campaign ID'
  })
});

/**
 * Create a new campaign
 * POST /api/v1/campaigns
 */
router.post(
  '/',
  validateRequest(createCampaignSchema),
  async (req: any, res: Response) => {
    try {
      const campaign = await campaignService.createCampaign({
        userId: req.user!._id.toString(),
        ...req.body
      });

      res.status(201).json({
        success: true,
        data: campaign
      });
    } catch (error: any) {
      logger.error('Error creating campaign', { error: error.message, userId: req.user!._id.toString() });
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  }
);

/**
 * Get all campaigns
 * GET /api/v1/campaigns
 */
router.get(
  '/',
  validateQuery(getCampaignsQuerySchema),
  async (req: any, res: Response) => {
    try {
      const { status, agentId, search, page, limit } = req.query;

      const filters: any = {};
      if (status) {
        filters.status = (status as string).split(',');
      }
      if (agentId) {
        filters.agentId = agentId;
      }
      if (search) {
        filters.search = search;
      }

      const pagination = {
        page: page ? parseInt(page as string) : 1,
        limit: limit ? parseInt(limit as string) : 20
      };

      const result = await campaignService.getCampaigns(
        req.user!._id.toString(),
        filters,
        pagination
      );

      res.json({
        success: true,
        data: result
      });
    } catch (error: any) {
      logger.error('Error getting campaigns', { error: error.message, userId: req.user!._id.toString() });
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  }
);

/**
 * Get campaign by ID
 * GET /api/v1/campaigns/:id
 */
router.get(
  '/:id',
  validateParams(idParamSchema),
  async (req: any, res: Response): Promise<void> => {
    try {
      const campaign = await campaignService.getCampaign(req.params.id, req.user!._id.toString());

      if (!campaign) {
        res.status(404).json({
          success: false,
          error: 'Campaign not found'
        });
        return;
      }

      res.json({
        success: true,
        data: campaign
      });
    } catch (error: any) {
      logger.error('Error getting campaign', { error: error.message, campaignId: req.params.id });
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  }
);

/**
 * Update campaign
 * PATCH /api/v1/campaigns/:id
 */
router.patch(
  '/:id',
  validateParams(idParamSchema),
  validateRequest(updateCampaignSchema),
  async (req: any, res: Response) => {
    try {
      const campaign = await campaignService.updateCampaign(
        req.params.id,
        req.user!._id.toString(),
        req.body
      );

      res.json({
        success: true,
        data: campaign
      });
    } catch (error: any) {
      logger.error('Error updating campaign', { error: error.message, campaignId: req.params.id });
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  }
);

/**
 * Delete campaign
 * DELETE /api/v1/campaigns/:id
 */
router.delete(
  '/:id',
  validateParams(idParamSchema),
  async (req: any, res: Response) => {
    try {
      await campaignService.deleteCampaign(req.params.id, req.user!._id.toString());

      res.json({
        success: true,
        message: 'Campaign deleted successfully'
      });
    } catch (error: any) {
      logger.error('Error deleting campaign', { error: error.message, campaignId: req.params.id });
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  }
);

/**
 * Add contacts to campaign
 * POST /api/v1/campaigns/:id/contacts
 */
router.post(
  '/:id/contacts',
  validateParams(idParamSchema),
  validateRequest(addContactsSchema),
  async (req: any, res: Response) => {
    try {
      const result = await campaignService.addContacts({
        campaignId: req.params.id,
        userId: req.user!._id.toString(),
        contacts: req.body.contacts
      });

      res.status(201).json({
        success: true,
        data: result
      });
    } catch (error: any) {
      logger.error('Error adding contacts', { error: error.message, campaignId: req.params.id });
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  }
);

/**
 * Get campaign contacts
 * GET /api/v1/campaigns/:id/contacts
 */
router.get(
  '/:id/contacts',
  validateParams(idParamSchema),
  validateQuery(getContactsQuerySchema),
  async (req: any, res: Response) => {
    try {
      const { status, page, limit } = req.query;

      const filters: any = {};
      if (status) {
        filters.status = (status as string).split(',');
      }

      const pagination = {
        page: page ? parseInt(page as string) : 1,
        limit: limit ? parseInt(limit as string) : 50
      };

      const result = await campaignService.getCampaignContacts(
        req.params.id,
        req.user!._id.toString(),
        filters,
        pagination
      );

      res.json({
        success: true,
        data: result
      });
    } catch (error: any) {
      logger.error('Error getting campaign contacts', { error: error.message, campaignId: req.params.id });
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  }
);

/**
 * Get campaign call logs
 * GET /api/v1/campaigns/:id/calls
 */
router.get(
  '/:id/calls',
  validateParams(idParamSchema),
  validateQuery(paginationQuerySchema),
  async (req: any, res: Response) => {
    try {
      const { page, limit } = req.query;

      const pagination = {
        page: page ? parseInt(page as string) : 1,
        limit: limit ? parseInt(limit as string) : 50
      };

      const result = await campaignService.getCampaignCallLogs(
        req.params.id,
        req.user!._id.toString(),
        pagination
      );

      res.json({
        success: true,
        data: result
      });
    } catch (error: any) {
      logger.error('Error getting campaign call logs', { error: error.message, campaignId: req.params.id });
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  }
);

/**
 * Get campaign statistics
 * GET /api/v1/campaigns/:id/stats
 */
router.get(
  '/:id/stats',
  validateParams(idParamSchema),
  async (req: any, res: Response) => {
    try {
      const stats = await campaignService.getCampaignStats(req.params.id, req.user!._id.toString());

      res.json({
        success: true,
        data: stats
      });
    } catch (error: any) {
      logger.error('Error getting campaign stats', { error: error.message, campaignId: req.params.id });
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  }
);

/**
 * Get campaign progress
 * GET /api/v1/campaigns/:id/progress
 */
router.get(
  '/:id/progress',
  validateParams(idParamSchema),
  async (req: any, res: Response) => {
    try {
      const progress = await campaignQueueService.getCampaignProgress(req.params.id, req.user!._id.toString());

      res.json({
        success: true,
        data: progress
      });
    } catch (error: any) {
      logger.error('Error getting campaign progress', { error: error.message, campaignId: req.params.id });
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  }
);

/**
 * Start campaign
 * POST /api/v1/campaigns/:id/start
 */
router.post(
  '/:id/start',
  validateParams(idParamSchema),
  async (req: any, res: Response) => {
    try {
      await campaignQueueService.startCampaign(req.params.id, req.user!._id.toString());

      res.json({
        success: true,
        message: 'Campaign started successfully'
      });
    } catch (error: any) {
      logger.error('Error starting campaign', { error: error.message, campaignId: req.params.id });
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  }
);

/**
 * Pause campaign
 * POST /api/v1/campaigns/:id/pause
 */
router.post(
  '/:id/pause',
  validateParams(idParamSchema),
  async (req: any, res: Response) => {
    try {
      await campaignQueueService.pauseCampaign(req.params.id, req.user!._id.toString());

      res.json({
        success: true,
        message: 'Campaign paused successfully'
      });
    } catch (error: any) {
      logger.error('Error pausing campaign', { error: error.message, campaignId: req.params.id });
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  }
);

/**
 * Resume campaign
 * POST /api/v1/campaigns/:id/resume
 */
router.post(
  '/:id/resume',
  validateParams(idParamSchema),
  async (req: any, res: Response) => {
    try {
      await campaignQueueService.resumeCampaign(req.params.id, req.user!._id.toString());

      res.json({
        success: true,
        message: 'Campaign resumed successfully'
      });
    } catch (error: any) {
      logger.error('Error resuming campaign', { error: error.message, campaignId: req.params.id });
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  }
);

/**
 * Cancel campaign
 * POST /api/v1/campaigns/:id/cancel
 */
router.post(
  '/:id/cancel',
  validateParams(idParamSchema),
  async (req: any, res: Response) => {
    try {
      await campaignQueueService.cancelCampaign(req.params.id, req.user!._id.toString());

      res.json({
        success: true,
        message: 'Campaign cancelled successfully'
      });
    } catch (error: any) {
      logger.error('Error cancelling campaign', { error: error.message, campaignId: req.params.id });
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  }
);

/**
 * Retry failed contacts
 * POST /api/v1/campaigns/:id/retry
 */
router.post(
  '/:id/retry',
  validateParams(idParamSchema),
  async (req: any, res: Response) => {
    try {
      const retriedCount = await campaignQueueService.retryFailedContacts(req.params.id, req.user!._id.toString());

      res.json({
        success: true,
        message: `${retriedCount} contacts queued for retry`,
        data: { retriedCount }
      });
    } catch (error: any) {
      logger.error('Error retrying failed contacts', { error: error.message, campaignId: req.params.id });
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  }
);

/**
 * Update concurrent call limit dynamically
 * PATCH /api/v1/campaigns/:id/concurrent-limit
 */
router.patch(
  '/:id/concurrent-limit',
  validateParams(idParamSchema),
  validateRequest(
    Joi.object({
      concurrentCallsLimit: Joi.number().integer().min(1).max(100).required().messages({
        'number.base': 'Concurrent calls limit must be a number',
        'number.min': 'Limit must be at least 1',
        'number.max': 'Limit must be at most 100',
        'any.required': 'Concurrent calls limit is required'
      })
    })
  ),
  async (req: any, res: Response) => {
    try {
      const { id } = req.params;
      const { concurrentCallsLimit } = req.body;

      // Import at runtime to avoid circular dependencies
      const { redis: redisClient } = require('../config/redis');
      const { redisConcurrencyTracker } = require('../utils/redisConcurrency.util');
      const { Campaign } = require('../models/Campaign');

      // Check saturation before reducing limit
      const activeCalls = await redisConcurrencyTracker.getActiveCalls(id);
      if (activeCalls > concurrentCallsLimit * 0.9) {
        res.status(429).json({
          success: false,
          error: 'Campaign near saturation, cannot reduce limit',
          data: { activeCalls, requestedLimit: concurrentCallsLimit }
        });
        return;
      }

      // Update database
      await Campaign.findByIdAndUpdate(id, {
        'settings.concurrentCallsLimit': concurrentCallsLimit
      });

      // Update Redis limit key
      await redisClient.set(
        `campaign:{${id}}:limit`,
        concurrentCallsLimit.toString()
      );

      // Publish update to trigger promotion if limit increased
      await redisClient.publish(
        `campaign:${id}:slot-available`,
        '1'
      );

      logger.info('Campaign concurrent limit updated', {
        campaignId: id,
        newLimit: concurrentCallsLimit
      });

      res.json({
        success: true,
        message: 'Concurrent limit updated',
        data: { concurrentCallsLimit }
      });
    } catch (error: any) {
      logger.error('Error updating concurrent limit', {
        error: error.message,
        campaignId: req.params.id
      });
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  }
);

/**
 * Purge campaign (delete all Redis keys and cleanup)
 * DELETE /api/v1/campaigns/:id/purge
 */
router.delete(
  '/:id/purge',
  validateParams(idParamSchema),
  async (req: any, res: Response) => {
    try {
      const { id } = req.params;

      // Import at runtime
      const { redis: redisClient } = require('../config/redis');
      const { redisConcurrencyTracker } = require('../utils/redisConcurrency.util');
      const { Campaign } = require('../models/Campaign');
      const { cancelCampaignJobs } = require('../queues/campaignCalls.queue');
      const IORedis = require('ioredis');

      // Step 1: Set paused flag
      const pausedKey = `campaign:{${id}}:paused`;
      await redisClient.setEx(pausedKey, 300, '1');

      // Step 2: Pause campaign
      await Campaign.findByIdAndUpdate(id, { status: 'paused' });

      // Wait for in-flight operations
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Step 3: Cancel jobs + force release leases
      await cancelCampaignJobs(id);

      const setKey = `campaign:{${id}}:leases`;
      const members = await redisClient.sMembers(setKey);

      for (const member of members) {
        const callId = member.replace('pre-', '');
        await redisConcurrencyTracker.forceReleaseSlot(id, callId);
      }

      // Step 4: SCAN and delete all keys (cluster-safe)
      const keysToDelete = [
        `campaign:{${id}}:leases`,
        `campaign:{${id}}:limit`,
        `campaign:{${id}}:reserved`,
        `campaign:{${id}}:reserved:ledger`,
        `campaign:{${id}}:waitlist:high`,
        `campaign:{${id}}:waitlist:normal`,
        `campaign:{${id}}:waitlist:seen`,
        `campaign:{${id}}:promote-gate`,
        `campaign:{${id}}:promote-gate:seq`,
        `campaign:{${id}}:promote-mutex`,
        `campaign:{${id}}:fairness`,
        `campaign:{${id}}:cold-start`,
        `campaign:{${id}}:circuit`,
        `campaign:{${id}}:cb:fail`,
        pausedKey
      ];

      // Scan for dynamic keys
      const scanPattern = async (pattern: string): Promise<string[]> => {
        const keys: string[] = [];
        const isCluster = redisClient instanceof IORedis.Cluster;

        if (isCluster) {
          const masters = (redisClient as any).nodes('master');
          for (const node of masters) {
            let cursor = '0';
            do {
              const [newCursor, batch] = await node.scan(
                cursor,
                'MATCH',
                pattern,
                'COUNT',
                1000
              );
              cursor = newCursor;
              keys.push(...batch);
            } while (cursor !== '0');
          }
        } else {
          let cursor = '0';
          do {
            const [newCursor, batch] = await redisClient.scan(
              cursor,
              'MATCH',
              pattern,
              'COUNT',
              1000
            );
            cursor = newCursor;
            keys.push(...batch);
          } while (cursor !== '0');
        }

        return keys;
      };

      const leaseKeys = await scanPattern(`campaign:{${id}}:lease:*`);
      const markerKeys = await scanPattern(`campaign:{${id}}:waitlist:marker:*`);

      keysToDelete.push(...leaseKeys, ...markerKeys);

      // Use UNLINK for non-blocking deletion
      if (keysToDelete.length > 0) {
        await redisClient.unlink(...keysToDelete);
      }

      logger.info('Campaign purged', {
        campaignId: id,
        keysDeleted: keysToDelete.length
      });

      res.json({
        success: true,
        message: 'Campaign purged successfully',
        data: { keysDeleted: keysToDelete.length }
      });
    } catch (error: any) {
      logger.error('Campaign purge failed', {
        campaignId: req.params.id,
        error: error.message
      });
      res.status(500).json({
        success: false,
        error: 'Purge failed: ' + error.message
      });
    }
  }
);

export default router;
