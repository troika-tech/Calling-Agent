import { Request, Response } from 'express';
import multer from 'multer';
import { KnowledgeBase } from '../models/KnowledgeBase';
import { KnowledgeChunk } from '../models/KnowledgeChunk';
import { textExtractionService } from '../services/textExtraction.service';
import { chunkingService } from '../services/chunking.service';
import { embeddingsService } from '../services/embeddings.service';
import { ragService } from '../services/rag.service';
import { logger } from '../utils/logger';
import { BadRequestError, NotFoundError } from '../utils/errors';
import mongoose from 'mongoose';

/**
 * Upload and process knowledge base document
 * POST /api/v1/knowledge-base/upload
 */
export const uploadDocument = async (req: Request & { file?: Express.Multer.File }, res: Response) => {
  try {
    const { agentId } = req.body;
    const file = req.file;

    if (!file) {
      throw new BadRequestError('No file uploaded');
    }

    if (!agentId) {
      throw new BadRequestError('Agent ID is required');
    }

    // Validate file type
    const allowedTypes = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain'];
    if (!allowedTypes.includes(file.mimetype)) {
      throw new BadRequestError('Invalid file type. Only PDF, DOCX, and TXT files are allowed');
    }

    // Map MIME type to file type
    const fileTypeMap: Record<string, 'pdf' | 'docx' | 'txt'> = {
      'application/pdf': 'pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
      'text/plain': 'txt'
    };
    const fileType = fileTypeMap[file.mimetype];

    logger.info('📄 KB Document upload started', {
      fileName: file.originalname,
      fileType,
      fileSize: file.size,
      agentId
    });

    // Create KB document with 'processing' status
    const kbDocument = await KnowledgeBase.create({
      agentId: new mongoose.Types.ObjectId(agentId),
      userId: (req as any).user.id,
      fileName: file.originalname,
      fileType,
      fileSize: file.size,
      status: 'processing',
      totalChunks: 0,
      totalTokens: 0,
      totalCharacters: 0,
      uploadedAt: new Date(),
      isActive: true
    });

    // Process document asynchronously
    processDocument(kbDocument._id.toString(), file.buffer, fileType).catch((error) => {
      logger.error('Failed to process KB document', {
        documentId: kbDocument._id,
        error: error.message
      });
    });

    res.status(202).json({
      success: true,
      message: 'Document upload started. Processing in background.',
      data: {
        documentId: kbDocument._id,
        fileName: kbDocument.fileName,
        status: kbDocument.status
      }
    });
  } catch (error: any) {
    logger.error('KB document upload failed', {
      error: error.message
    });
    throw error;
  }
};

/**
 * Process document in background
 * Extracts text, chunks it, generates embeddings, and stores in DB
 */
async function processDocument(
  documentId: string,
  fileBuffer: Buffer,
  fileType: 'pdf' | 'docx' | 'txt'
): Promise<void> {
  try {
    const startTime = Date.now();

    logger.info('🔄 Starting KB document processing', { documentId });

    // Step 1: Extract text
    logger.info('📖 Extracting text from document');
    const { text, metadata } = await textExtractionService.extractText(fileBuffer, fileType);

    if (!text || text.trim().length === 0) {
      throw new Error('No text content extracted from document');
    }

    logger.info('✅ Text extracted', {
      textLength: text.length,
      metadata
    });

    // Step 2: Chunk text semantically
    logger.info('✂️ Chunking text semantically');
    const textChunks = await chunkingService.chunkText(text);

    logger.info('✅ Text chunked', {
      totalChunks: textChunks.length,
      avgChunkSize: Math.round(textChunks.reduce((sum, c) => sum + c.text.length, 0) / textChunks.length)
    });

    // Step 3: Generate embeddings for all chunks
    logger.info('🧠 Generating embeddings for chunks');
    const chunkTexts = textChunks.map(c => c.text);
    const { embeddings, totalTokens, cost } = await embeddingsService.generateBatchEmbeddings(chunkTexts);

    logger.info('✅ Embeddings generated', {
      totalEmbeddings: embeddings.length,
      totalTokens,
      cost: `$${cost.toFixed(4)}`
    });

    // Step 4: Get KB document info
    const kbDocument = await KnowledgeBase.findById(documentId);
    if (!kbDocument) {
      throw new Error('KB document not found');
    }

    // Step 5: Create KnowledgeChunk documents (one per chunk)
    const chunkDocuments = textChunks.map((chunk, index) => ({
      documentId: kbDocument._id,
      agentId: kbDocument.agentId,
      userId: kbDocument.userId,
      fileName: kbDocument.fileName,
      fileType: kbDocument.fileType,
      text: chunk.text,
      embedding: embeddings[index],
      chunkIndex: index,
      metadata: {
        pageNumber: chunk.metadata?.pageNumber,
        section: chunk.metadata?.section,
        startChar: chunk.metadata.startChar,
        endChar: chunk.metadata.endChar
      },
      isActive: true
    }));

    // Bulk insert all chunks
    await KnowledgeChunk.insertMany(chunkDocuments);

    logger.info('✅ KB chunks created', {
      documentId,
      totalChunks: chunkDocuments.length
    });

    // Step 6: Update KB document status
    await KnowledgeBase.findByIdAndUpdate(documentId, {
      totalChunks: chunkDocuments.length,
      totalTokens,
      totalCharacters: text.length,
      status: 'ready',
      processedAt: new Date(),
      processingMetadata: {
        duration: Date.now() - startTime,
        cost,
        chunkingMethod: 'RecursiveCharacterTextSplitter',
        embeddingModel: 'text-embedding-3-small'
      }
    });

    const duration = Date.now() - startTime;

    logger.info('✅ KB document processing complete', {
      documentId,
      duration: `${duration}ms`,
      totalChunks: chunkDocuments.length,
      cost: `$${cost.toFixed(4)}`
    });
  } catch (error: any) {
    logger.error('❌ KB document processing failed', {
      documentId,
      error: error.message
    });

    // Update status to 'failed'
    await KnowledgeBase.findByIdAndUpdate(documentId, {
      status: 'failed',
      error: error.message
    });

    throw error;
  }
}

/**
 * List all knowledge base documents for an agent
 * GET /api/v1/knowledge-base/:agentId
 */
export const listDocuments = async (req: Request, res: Response) => {
  try {
    const { agentId } = req.params;
    const { status } = req.query;

    const filter: any = {
      agentId: new mongoose.Types.ObjectId(agentId),
      isActive: true
    };

    if (status) {
      filter.status = status;
    }

    const documents = await KnowledgeBase.find(filter)
      .sort({ uploadedAt: -1 });

    // Get statistics
    const stats = await ragService.getRAGStats(agentId);

    res.json({
      success: true,
      data: {
        documents: documents.map(doc => ({
          id: doc._id,
          fileName: doc.fileName,
          fileType: doc.fileType,
          fileSize: doc.fileSize,
          status: doc.status,
          totalChunks: doc.totalChunks,
          totalTokens: doc.totalTokens,
          totalCharacters: doc.totalCharacters,
          uploadedAt: doc.uploadedAt,
          processedAt: doc.processedAt,
          error: doc.error
        })),
        stats
      }
    });
  } catch (error: any) {
    logger.error('Failed to list KB documents', {
      error: error.message
    });
    throw error;
  }
};

/**
 * Get single knowledge base document details
 * GET /api/v1/knowledge-base/document/:documentId
 */
export const getDocument = async (req: Request, res: Response) => {
  try {
    const { documentId } = req.params;

    const document = await KnowledgeBase.findById(documentId);

    if (!document) {
      throw new NotFoundError('Knowledge base document not found');
    }

    // Get chunks for this document
    const chunks = await KnowledgeChunk.find({
      documentId: document._id,
      isActive: true
    })
      .select('-embedding') // Exclude embeddings from response
      .sort({ chunkIndex: 1 });

    res.json({
      success: true,
      data: {
        id: document._id,
        fileName: document.fileName,
        fileType: document.fileType,
        fileSize: document.fileSize,
        status: document.status,
        totalChunks: document.totalChunks,
        totalTokens: document.totalTokens,
        totalCharacters: document.totalCharacters,
        uploadedAt: document.uploadedAt,
        processedAt: document.processedAt,
        processingMetadata: document.processingMetadata,
        chunks: chunks.map(c => ({
          text: c.text,
          chunkIndex: c.chunkIndex,
          metadata: c.metadata
        })),
        error: document.error
      }
    });
  } catch (error: any) {
    logger.error('Failed to get KB document', {
      error: error.message
    });
    throw error;
  }
};

/**
 * Delete knowledge base document
 * DELETE /api/v1/knowledge-base/:documentId
 */
export const deleteDocument = async (req: Request, res: Response) => {
  try {
    const { documentId } = req.params;

    const document = await KnowledgeBase.findById(documentId);

    if (!document) {
      throw new NotFoundError('Knowledge base document not found');
    }

    // Soft delete document
    await KnowledgeBase.findByIdAndUpdate(documentId, {
      isActive: false,
      deletedAt: new Date()
    });

    // Soft delete all associated chunks
    await KnowledgeChunk.updateMany(
      { documentId: document._id },
      {
        isActive: false,
        updatedAt: new Date()
      }
    );

    logger.info('KB document and chunks deleted', {
      documentId,
      fileName: document.fileName
    });

    res.json({
      success: true,
      message: 'Knowledge base document deleted successfully'
    });
  } catch (error: any) {
    logger.error('Failed to delete KB document', {
      error: error.message
    });
    throw error;
  }
};

/**
 * Query knowledge base (test RAG)
 * POST /api/v1/knowledge-base/query
 */
export const queryKnowledgeBase = async (req: Request, res: Response) => {
  try {
    const { query, agentId, topK, minScore } = req.body;

    if (!query || !agentId) {
      throw new BadRequestError('Query and agentId are required');
    }

    logger.info('🔍 RAG query request', {
      query: query.substring(0, 100),
      agentId,
      topK,
      minScore
    });

    // Query knowledge base
    const context = await ragService.queryKnowledgeBase(query, agentId, {
      topK,
      minScore
    });

    // Format context for LLM
    const formattedContext = ragService.formatContextForLLM(context);

    res.json({
      success: true,
      data: {
        query: context.query,
        chunks: context.chunks,
        totalChunks: context.totalChunks,
        maxScore: context.maxScore,
        avgScore: context.avgScore,
        formattedContext
      }
    });
  } catch (error: any) {
    logger.error('Failed to query KB', {
      error: error.message
    });
    throw error;
  }
};

/**
 * Get knowledge base statistics for an agent
 * GET /api/v1/knowledge-base/stats/:agentId
 */
export const getStats = async (req: Request, res: Response) => {
  try {
    const { agentId } = req.params;

    const stats = await ragService.getRAGStats(agentId);

    res.json({
      success: true,
      data: stats
    });
  } catch (error: any) {
    logger.error('Failed to get KB stats', {
      error: error.message
    });
    throw error;
  }
};
