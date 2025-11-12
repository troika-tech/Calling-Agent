import { Router } from 'express';
import multer from 'multer';
import { csvImportService } from '../services/csvImport.service';
import { batchProcessingService } from '../services/batchProcessing.service';
import logger from '../utils/logger';

const router = Router();

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB max
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV files are allowed'));
    }
  }
});

/**
 * Middleware: Error Handler
 */
const asyncHandler = (fn: Function) => {
  return (req: any, res: any, next: any) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

/**
 * POST /api/v1/bulk/import/validate
 * Validate CSV file without importing
 */
router.post(
  '/import/validate',
  upload.single('file'),
  asyncHandler(async (req: any, res: any) => {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'NO_FILE',
          message: 'No file uploaded'
        }
      });
    }

    logger.info('Validating CSV file', {
      filename: req.file.originalname,
      size: req.file.size
    });

    try {
      const validation = await csvImportService.validateCSV(req.file.buffer, {
        skipHeader: req.body.skipHeader !== 'false',
        delimiter: req.body.delimiter || ',',
        maxRows: parseInt(req.body.maxRows || '10000')
      });

      res.status(200).json({
        success: true,
        data: validation
      });
    } catch (error: any) {
      logger.error('CSV validation failed', {
        error: error.message
      });

      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_FAILED',
          message: error.message
        }
      });
    }
  })
);

/**
 * POST /api/v1/bulk/import/parse
 * Parse CSV file and return preview
 */
router.post(
  '/import/parse',
  upload.single('file'),
  asyncHandler(async (req: any, res: any) => {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'NO_FILE',
          message: 'No file uploaded'
        }
      });
    }

    logger.info('Parsing CSV file', {
      filename: req.file.originalname,
      size: req.file.size
    });

    try {
      const result = await csvImportService.parseCSV(req.file.buffer, {
        skipHeader: req.body.skipHeader !== 'false',
        delimiter: req.body.delimiter || ',',
        validatePhoneNumbers: req.body.validatePhoneNumbers !== 'false',
        checkDuplicates: req.body.checkDuplicates !== 'false',
        maxRows: parseInt(req.body.maxRows || '10000'),
        defaults: req.body.defaults ? JSON.parse(req.body.defaults) : undefined
      });

      const stats = csvImportService.getImportStats(result);

      // Return preview (first 10 rows)
      const preview = result.imported.slice(0, 10);

      res.status(200).json({
        success: true,
        data: {
          totalRows: result.totalRows,
          validRows: result.validRows,
          invalidRows: result.invalidRows,
          duplicateRows: result.duplicateRows,
          stats,
          preview,
          errors: result.errors.slice(0, 10), // First 10 errors
          duplicates: result.duplicates.slice(0, 10) // First 10 duplicates
        }
      });
    } catch (error: any) {
      logger.error('CSV parsing failed', {
        error: error.message
      });

      return res.status(400).json({
        success: false,
        error: {
          code: 'PARSE_FAILED',
          message: error.message
        }
      });
    }
  })
);

/**
 * POST /api/v1/bulk/import/process
 * Process CSV file and create batch job
 */
router.post(
  '/import/process',
  upload.single('file'),
  asyncHandler(async (req: any, res: any) => {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'NO_FILE',
          message: 'No file uploaded'
        }
      });
    }

    const { userId, type = 'schedule' } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_USER_ID',
          message: 'userId is required'
        }
      });
    }

    logger.info('Processing CSV import', {
      filename: req.file.originalname,
      userId,
      type
    });

    try {
      // Parse CSV
      const parseResult = await csvImportService.parseCSV(req.file.buffer, {
        skipHeader: req.body.skipHeader !== 'false',
        delimiter: req.body.delimiter || ',',
        validatePhoneNumbers: req.body.validatePhoneNumbers !== 'false',
        checkDuplicates: req.body.checkDuplicates !== 'false',
        maxRows: parseInt(req.body.maxRows || '10000'),
        defaults: req.body.defaults ? JSON.parse(req.body.defaults) : undefined
      });

      if (parseResult.validRows === 0) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'NO_VALID_ROWS',
            message: 'No valid rows found in CSV',
            details: {
              errors: parseResult.errors,
              duplicates: parseResult.duplicates
            }
          }
        });
      }

      // Create batch job
      const batchId = await batchProcessingService.submitBatch({
        userId,
        type: type as 'schedule' | 'immediate',
        records: parseResult.imported,
        options: {
          respectBusinessHours: req.body.respectBusinessHours !== 'false',
          staggerDelay: parseInt(req.body.staggerDelay || '2000'),
          priority: req.body.priority || 'medium'
        }
      });

      logger.info('Batch job created', {
        batchId,
        validRows: parseResult.validRows
      });

      res.status(201).json({
        success: true,
        data: {
          batchId,
          totalRows: parseResult.totalRows,
          validRows: parseResult.validRows,
          invalidRows: parseResult.invalidRows,
          duplicateRows: parseResult.duplicateRows,
          message: 'Batch job created successfully'
        }
      });
    } catch (error: any) {
      logger.error('CSV import processing failed', {
        error: error.message
      });

      return res.status(500).json({
        success: false,
        error: {
          code: 'PROCESSING_FAILED',
          message: error.message
        }
      });
    }
  })
);

/**
 * GET /api/v1/bulk/batches/:batchId
 * Get batch job progress
 */
router.get(
  '/batches/:batchId',
  asyncHandler(async (req: any, res: any) => {
    const { batchId } = req.params;

    logger.info('Getting batch progress', { batchId });

    try {
      const progress = await batchProcessingService.getBatchProgress(batchId);

      if (!progress) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'BATCH_NOT_FOUND',
            message: 'Batch job not found'
          }
        });
      }

      res.status(200).json({
        success: true,
        data: progress
      });
    } catch (error: any) {
      logger.error('Failed to get batch progress', {
        batchId,
        error: error.message
      });

      return res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to get batch progress'
        }
      });
    }
  })
);

/**
 * GET /api/v1/bulk/batches
 * Get all batch jobs for user
 */
router.get(
  '/batches',
  asyncHandler(async (req: any, res: any) => {
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_USER_ID',
          message: 'userId query parameter is required'
        }
      });
    }

    logger.info('Getting user batches', { userId });

    try {
      const batches = await batchProcessingService.getUserBatches(userId as string);

      res.status(200).json({
        success: true,
        data: {
          batches,
          total: batches.length
        }
      });
    } catch (error: any) {
      logger.error('Failed to get user batches', {
        userId,
        error: error.message
      });

      return res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to get user batches'
        }
      });
    }
  })
);

/**
 * POST /api/v1/bulk/batches/:batchId/cancel
 * Cancel batch job
 */
router.post(
  '/batches/:batchId/cancel',
  asyncHandler(async (req: any, res: any) => {
    const { batchId } = req.params;

    logger.info('Cancelling batch', { batchId });

    try {
      await batchProcessingService.cancelBatch(batchId);

      res.status(200).json({
        success: true,
        data: {
          batchId,
          status: 'cancelled',
          message: 'Batch job cancelled successfully'
        }
      });
    } catch (error: any) {
      logger.error('Failed to cancel batch', {
        batchId,
        error: error.message
      });

      if (error.message.includes('not found')) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'BATCH_NOT_FOUND',
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
          message: 'Failed to cancel batch'
        }
      });
    }
  })
);

/**
 * GET /api/v1/bulk/template
 * Download CSV template
 */
router.get('/template', (req, res) => {
  const template = csvImportService.generateTemplate();

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=bulk_calls_template.csv');
  res.send(template);
});

/**
 * GET /api/v1/bulk/stats
 * Get bulk operation statistics
 */
router.get(
  '/stats',
  asyncHandler(async (req: any, res: any) => {
    logger.info('Getting bulk stats');

    try {
      const queueStats = await batchProcessingService.getQueueStats();

      res.status(200).json({
        success: true,
        data: {
          queue: queueStats
        }
      });
    } catch (error: any) {
      logger.error('Failed to get bulk stats', {
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
