import { Router } from 'express';
import multer from 'multer';
import {
  uploadDocument,
  listDocuments,
  getDocument,
  deleteDocument,
  queryKnowledgeBase,
  getStats
} from '../controllers/knowledgeBase.controller';
import { authenticate, requireAdmin } from '../middlewares/auth.middleware';
import { BadRequestError } from '../utils/errors';

const router = Router();

// All routes require authentication and admin access
router.use(authenticate);
router.use(requireAdmin);

// Configure multer for file uploads
const storage = multer.memoryStorage(); // Store in memory for processing

const fileFilter = (req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  // Allowed MIME types
  const allowedTypes = [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain'
  ];

  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new BadRequestError('Invalid file type. Only PDF, DOCX, and TXT files are allowed'));
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max file size
    files: 1 // Single file upload
  }
});

/**
 * @route   POST /api/v1/knowledge-base/upload
 * @desc    Upload knowledge base document (PDF/DOCX/TXT)
 * @access  Admin only
 */
router.post('/upload', upload.single('file'), uploadDocument);

/**
 * @route   GET /api/v1/knowledge-base/:agentId
 * @desc    List all knowledge base documents for an agent
 * @access  Admin only
 */
router.get('/:agentId', listDocuments);

/**
 * @route   GET /api/v1/knowledge-base/document/:documentId
 * @desc    Get single knowledge base document details
 * @access  Admin only
 */
router.get('/document/:documentId', getDocument);

/**
 * @route   DELETE /api/v1/knowledge-base/:documentId
 * @desc    Delete knowledge base document
 * @access  Admin only
 */
router.delete('/:documentId', deleteDocument);

/**
 * @route   POST /api/v1/knowledge-base/query
 * @desc    Query knowledge base (test RAG)
 * @access  Admin only
 */
router.post('/query', queryKnowledgeBase);

/**
 * @route   GET /api/v1/knowledge-base/stats/:agentId
 * @desc    Get knowledge base statistics for an agent
 * @access  Admin only
 */
router.get('/stats/:agentId', getStats);

export default router;
