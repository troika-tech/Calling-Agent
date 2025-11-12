const pdfParse = require('pdf-parse');
import mammoth from 'mammoth';
import { logger } from '../utils/logger';
import { ExternalServiceError } from '../utils/errors';

export interface ExtractedText {
  text: string;
  metadata: {
    pageCount?: number;
    pages?: Array<{
      pageNumber: number;
      text: string;
    }>;
    wordCount: number;
    characterCount: number;
  };
}

class TextExtractionService {
  /**
   * Extract text from PDF file
   */
  async extractFromPDF(buffer: Buffer): Promise<ExtractedText> {
    try {
      logger.info('Extracting text from PDF', {
        bufferSize: buffer.length
      });

      const data = await pdfParse(buffer);

      // Extract text from each page if available
      const pages: Array<{ pageNumber: number; text: string }> = [];

      // pdf-parse doesn't provide per-page text by default
      // For now, use the full text
      const fullText = data.text.trim();

      logger.info('PDF text extracted successfully', {
        pages: data.numpages,
        characters: fullText.length,
        words: fullText.split(/\s+/).length
      });

      return {
        text: fullText,
        metadata: {
          pageCount: data.numpages,
          wordCount: fullText.split(/\s+/).length,
          characterCount: fullText.length
        }
      };
    } catch (error: any) {
      logger.error('Failed to extract text from PDF', {
        error: error.message
      });
      throw new ExternalServiceError('Failed to extract text from PDF file');
    }
  }

  /**
   * Extract text from DOCX file
   */
  async extractFromDOCX(buffer: Buffer): Promise<ExtractedText> {
    try {
      logger.info('Extracting text from DOCX', {
        bufferSize: buffer.length
      });

      const result = await mammoth.extractRawText({ buffer });
      const text = result.value.trim();

      // Count warnings
      if (result.messages.length > 0) {
        logger.warn('DOCX extraction warnings', {
          warnings: result.messages.map(m => m.message)
        });
      }

      logger.info('DOCX text extracted successfully', {
        characters: text.length,
        words: text.split(/\s+/).length,
        warnings: result.messages.length
      });

      return {
        text,
        metadata: {
          wordCount: text.split(/\s+/).length,
          characterCount: text.length
        }
      };
    } catch (error: any) {
      logger.error('Failed to extract text from DOCX', {
        error: error.message
      });
      throw new ExternalServiceError('Failed to extract text from DOCX file');
    }
  }

  /**
   * Extract text from TXT file
   */
  async extractFromTXT(buffer: Buffer): Promise<ExtractedText> {
    try {
      logger.info('Extracting text from TXT', {
        bufferSize: buffer.length
      });

      const text = buffer.toString('utf-8').trim();

      logger.info('TXT text extracted successfully', {
        characters: text.length,
        words: text.split(/\s+/).length
      });

      return {
        text,
        metadata: {
          wordCount: text.split(/\s+/).length,
          characterCount: text.length
        }
      };
    } catch (error: any) {
      logger.error('Failed to extract text from TXT', {
        error: error.message
      });
      throw new ExternalServiceError('Failed to extract text from TXT file');
    }
  }

  /**
   * Extract text based on file type
   */
  async extractText(
    buffer: Buffer,
    fileType: 'pdf' | 'docx' | 'txt'
  ): Promise<ExtractedText> {
    switch (fileType) {
      case 'pdf':
        return await this.extractFromPDF(buffer);
      case 'docx':
        return await this.extractFromDOCX(buffer);
      case 'txt':
        return await this.extractFromTXT(buffer);
      default:
        throw new Error(`Unsupported file type: ${fileType}`);
    }
  }

  /**
   * Validate extracted text
   */
  validateExtractedText(extracted: ExtractedText): boolean {
    if (!extracted.text || extracted.text.length < 10) {
      logger.warn('Extracted text too short', {
        length: extracted.text?.length || 0
      });
      return false;
    }

    if (extracted.text.length > 5_000_000) {  // 5MB of text
      logger.warn('Extracted text too large', {
        length: extracted.text.length
      });
      return false;
    }

    return true;
  }
}

export const textExtractionService = new TextExtractionService();
