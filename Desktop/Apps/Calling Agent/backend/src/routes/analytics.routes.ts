import { Router } from 'express';
import { analyticsService } from '../services/analytics.service';
import { voicemailMessageService } from '../services/voicemailMessage.service';
import { connectionPrewarmingService } from '../services/connectionPrewarming.service';
import logger from '../utils/logger';

const router = Router();

/**
 * Middleware: Error Handler
 */
const asyncHandler = (fn: Function) => {
  return (req: any, res: any, next: any) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

/**
 * Helper: Parse time range from query params
 */
function parseTimeRange(req: any): { start: Date; end: Date } | undefined {
  const { startDate, endDate } = req.query;

  if (!startDate || !endDate) {
    return undefined;
  }

  return {
    start: new Date(startDate as string),
    end: new Date(endDate as string)
  };
}

/**
 * GET /api/v1/analytics/dashboard
 * Get comprehensive dashboard analytics
 */
router.get(
  '/dashboard',
  asyncHandler(async (req: any, res: any) => {
    const { userId } = req.query;
    const timeRange = parseTimeRange(req);

    logger.info('Getting dashboard analytics', { userId, timeRange });

    try {
      const analytics = await analyticsService.getDashboardAnalytics(
        userId as string,
        timeRange
      );

      res.status(200).json({
        success: true,
        data: analytics
      });
    } catch (error: any) {
      logger.error('Failed to get dashboard analytics', {
        error: error.message
      });

      return res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to get analytics'
        }
      });
    }
  })
);

/**
 * GET /api/v1/analytics/calls
 * Get call analytics
 */
router.get(
  '/calls',
  asyncHandler(async (req: any, res: any) => {
    const { userId } = req.query;
    const timeRange = parseTimeRange(req);

    logger.info('Getting call analytics', { userId, timeRange });

    try {
      const analytics = await analyticsService.getCallAnalytics(
        userId as string,
        timeRange
      );

      res.status(200).json({
        success: true,
        data: analytics
      });
    } catch (error: any) {
      logger.error('Failed to get call analytics', {
        error: error.message
      });

      return res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to get call analytics'
        }
      });
    }
  })
);

/**
 * GET /api/v1/analytics/retry
 * Get retry analytics
 */
router.get(
  '/retry',
  asyncHandler(async (req: any, res: any) => {
    const { userId } = req.query;
    const timeRange = parseTimeRange(req);

    logger.info('Getting retry analytics', { userId, timeRange });

    try {
      const analytics = await analyticsService.getRetryAnalytics(
        userId as string,
        timeRange
      );

      res.status(200).json({
        success: true,
        data: analytics
      });
    } catch (error: any) {
      logger.error('Failed to get retry analytics', {
        error: error.message
      });

      return res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to get retry analytics'
        }
      });
    }
  })
);

/**
 * GET /api/v1/analytics/scheduling
 * Get scheduling analytics
 */
router.get(
  '/scheduling',
  asyncHandler(async (req: any, res: any) => {
    const { userId } = req.query;
    const timeRange = parseTimeRange(req);

    logger.info('Getting scheduling analytics', { userId, timeRange });

    try {
      const analytics = await analyticsService.getSchedulingAnalytics(
        userId as string,
        timeRange
      );

      res.status(200).json({
        success: true,
        data: analytics
      });
    } catch (error: any) {
      logger.error('Failed to get scheduling analytics', {
        error: error.message
      });

      return res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to get scheduling analytics'
        }
      });
    }
  })
);

/**
 * GET /api/v1/analytics/voicemail
 * Get voicemail analytics
 */
router.get(
  '/voicemail',
  asyncHandler(async (req: any, res: any) => {
    const { userId } = req.query;
    const timeRange = parseTimeRange(req);

    logger.info('Getting voicemail analytics', { userId, timeRange });

    try {
      const analytics = await analyticsService.getVoicemailAnalytics(
        userId as string,
        timeRange
      );

      res.status(200).json({
        success: true,
        data: analytics
      });
    } catch (error: any) {
      logger.error('Failed to get voicemail analytics', {
        error: error.message
      });

      return res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to get voicemail analytics'
        }
      });
    }
  })
);

/**
 * GET /api/v1/analytics/performance
 * Get performance metrics
 */
router.get(
  '/performance',
  asyncHandler(async (req: any, res: any) => {
    const { userId } = req.query;
    const timeRange = parseTimeRange(req);

    logger.info('Getting performance metrics', { userId, timeRange });

    try {
      const metrics = await analyticsService.getPerformanceMetrics(
        userId as string,
        timeRange
      );

      res.status(200).json({
        success: true,
        data: metrics
      });
    } catch (error: any) {
      logger.error('Failed to get performance metrics', {
        error: error.message
      });

      return res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to get performance metrics'
        }
      });
    }
  })
);

/**
 * GET /api/v1/analytics/cost
 * Get cost analytics
 */
router.get(
  '/cost',
  asyncHandler(async (req: any, res: any) => {
    const { userId } = req.query;
    const timeRange = parseTimeRange(req);

    logger.info('Getting cost analytics', { userId, timeRange });

    try {
      const analytics = await analyticsService.getCostAnalytics(
        userId as string,
        timeRange
      );

      res.status(200).json({
        success: true,
        data: analytics
      });
    } catch (error: any) {
      logger.error('Failed to get cost analytics', {
        error: error.message
      });

      return res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to get cost analytics'
        }
      });
    }
  })
);

/**
 * GET /api/v1/analytics/trends
 * Get time-series trends
 */
router.get(
  '/trends',
  asyncHandler(async (req: any, res: any) => {
    const { userId } = req.query;
    const timeRange = parseTimeRange(req);

    logger.info('Getting analytics trends', { userId, timeRange });

    try {
      const trends = await analyticsService.getTrends(
        userId as string,
        timeRange
      );

      res.status(200).json({
        success: true,
        data: trends
      });
    } catch (error: any) {
      logger.error('Failed to get analytics trends', {
        error: error.message
      });

      return res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to get trends'
        }
      });
    }
  })
);

/**
 * GET /api/v1/analytics/prewarming
 * Get connection pre-warming stats
 */
router.get('/prewarming', (req, res) => {
  const stats = connectionPrewarmingService.getStats();

  res.status(200).json({
    success: true,
    data: {
      ...stats,
      isActive: connectionPrewarmingService.isActive()
    }
  });
});

/**
 * POST /api/v1/analytics/prewarming/measure
 * Measure latency savings from pre-warming
 */
router.post(
  '/prewarming/measure',
  asyncHandler(async (req: any, res: any) => {
    logger.info('Measuring pre-warming latency savings');

    try {
      const savings = await connectionPrewarmingService.measureLatencySavings();

      res.status(200).json({
        success: true,
        data: savings
      });
    } catch (error: any) {
      logger.error('Failed to measure latency savings', {
        error: error.message
      });

      return res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to measure latency savings'
        }
      });
    }
  })
);

/**
 * POST /api/v1/analytics/prewarming/start
 * Start connection pre-warming
 */
router.post(
  '/prewarming/start',
  asyncHandler(async (req: any, res: any) => {
    logger.info('Starting connection pre-warming');

    try {
      await connectionPrewarmingService.start();

      res.status(200).json({
        success: true,
        data: {
          message: 'Connection pre-warming started'
        }
      });
    } catch (error: any) {
      logger.error('Failed to start pre-warming', {
        error: error.message
      });

      return res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to start pre-warming'
        }
      });
    }
  })
);

/**
 * POST /api/v1/analytics/prewarming/stop
 * Stop connection pre-warming
 */
router.post(
  '/prewarming/stop',
  asyncHandler(async (req: any, res: any) => {
    logger.info('Stopping connection pre-warming');

    try {
      await connectionPrewarmingService.stop();

      res.status(200).json({
        success: true,
        data: {
          message: 'Connection pre-warming stopped'
        }
      });
    } catch (error: any) {
      logger.error('Failed to stop pre-warming', {
        error: error.message
      });

      return res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to stop pre-warming'
        }
      });
    }
  })
);

export default router;
