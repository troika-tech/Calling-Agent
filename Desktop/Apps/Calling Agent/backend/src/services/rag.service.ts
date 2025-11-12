import { KnowledgeBase } from '../models/KnowledgeBase';
import { KnowledgeChunk } from '../models/KnowledgeChunk';
import { embeddingsService } from './embeddings.service';
import { logger } from '../utils/logger';

export interface RAGContext {
  query: string;
  chunks: Array<{
    text: string;
    score: number;
    fileName: string;
    fileType: string;
    chunkIndex: number;
    metadata?: {
      pageNumber?: number;
      section?: string;
    };
  }>;
  totalChunks: number;
  maxScore: number;
  avgScore: number;
}

export interface RAGQueryOptions {
  topK?: number;              // Number of chunks to retrieve
  minScore?: number;          // Minimum similarity score
  maxContextLength?: number;  // Max total characters in context
  includeMetadata?: boolean;  // Include chunk metadata
}

class RAGService {
  private readonly DEFAULT_TOP_K = 5;
  private readonly DEFAULT_MIN_SCORE = 0.7;
  private readonly DEFAULT_MAX_CONTEXT_LENGTH = 3000;  // ~750 tokens

  /**
   * Query knowledge base and retrieve relevant context
   */
  async queryKnowledgeBase(
    query: string,
    agentId: string,
    options?: RAGQueryOptions
  ): Promise<RAGContext> {
    try {
      const topK = options?.topK || this.DEFAULT_TOP_K;
      const minScore = options?.minScore || this.DEFAULT_MIN_SCORE;
      const maxContextLength = options?.maxContextLength || this.DEFAULT_MAX_CONTEXT_LENGTH;

      logger.info('Querying knowledge base with RAG', {
        query: query.substring(0, 100),
        agentId,
        topK,
        minScore
      });

      // Step 1: Generate embedding for query
      const startEmbedTime = Date.now();
      const { embedding: queryEmbedding } = await embeddingsService.generateEmbedding(query);
      const embeddingTime = Date.now() - startEmbedTime;

      logger.debug('Query embedding generated', {
        dimensions: queryEmbedding.length,
        time: `${embeddingTime}ms`
      });

      // Step 2: Vector search in MongoDB (using KnowledgeChunk model)
      const startSearchTime = Date.now();
      const results = await KnowledgeChunk.vectorSearch(
        queryEmbedding,
        agentId,
        {
          limit: topK * 2,  // Get more candidates for re-ranking
          minScore,
          filter: {
            isActive: true
          }
        }
      );
      const searchTime = Date.now() - startSearchTime;

      logger.info('Vector search completed', {
        resultsFound: results.length,
        searchTime: `${searchTime}ms`
      });

      if (results.length === 0) {
        logger.warn('No relevant chunks found in knowledge base', {
          query: query.substring(0, 100),
          agentId
        });

        return {
          query,
          chunks: [],
          totalChunks: 0,
          maxScore: 0,
          avgScore: 0
        };
      }

      // Step 3: Re-rank and format results
      const chunks = results
        .map(result => ({
          text: result.text,
          score: result.score,
          fileName: result.fileName,
          fileType: result.fileType,
          chunkIndex: result.chunkIndex,
          metadata: result.metadata
        }))
        .sort((a, b) => b.score - a.score);

      // Step 4: Apply context length limit
      const limitedChunks = this.limitContextLength(chunks, maxContextLength);

      // Calculate statistics
      const scores = limitedChunks.map(c => c.score);
      const maxScore = Math.max(...scores);
      const avgScore = scores.reduce((sum, s) => sum + s, 0) / scores.length;

      logger.info('RAG context prepared', {
        totalChunks: limitedChunks.length,
        maxScore: maxScore.toFixed(3),
        avgScore: avgScore.toFixed(3),
        totalChars: limitedChunks.reduce((sum, c) => sum + c.text.length, 0)
      });

      return {
        query,
        chunks: limitedChunks,
        totalChunks: limitedChunks.length,
        maxScore,
        avgScore
      };
    } catch (error: any) {
      logger.error('Failed to query knowledge base', {
        error: error.message,
        agentId,
        query: query.substring(0, 100)
      });
      throw error;
    }
  }

  /**
   * Format RAG context for LLM prompt
   */
  formatContextForLLM(context: RAGContext): string {
    if (context.chunks.length === 0) {
      return '';
    }

    const formattedChunks = context.chunks.map((chunk, index) => {
      const source = chunk.metadata?.pageNumber
        ? `${chunk.fileName} (Page ${chunk.metadata.pageNumber})`
        : chunk.fileName;

      return `[${index + 1}] Source: ${source}
${chunk.text}`;
    });

    return `# Knowledge Base Information

${formattedChunks.join('\n\n---\n\n')}

# Instructions
- Use the information above to answer questions when relevant
- If you reference information, cite the source number (e.g., [1])
- If the answer is not in the knowledge base, say so clearly
- Do not make up information not provided above`;
  }

  /**
   * Generate RAG-enhanced prompt
   */
  generateRAGPrompt(
    originalPrompt: string,
    context: RAGContext,
    userQuery: string
  ): string {
    if (context.chunks.length === 0) {
      // No relevant context found
      return originalPrompt;
    }

    const contextText = this.formatContextForLLM(context);

    return `${originalPrompt}

${contextText}

Remember: Answer based on the knowledge base when relevant, and cite sources using [1], [2], etc.`;
  }

  /**
   * Limit context to maximum character length
   * Keeps highest-scoring chunks that fit
   */
  private limitContextLength(
    chunks: RAGContext['chunks'],
    maxLength: number
  ): RAGContext['chunks'] {
    const result: RAGContext['chunks'] = [];
    let currentLength = 0;

    // Sort by score (already sorted, but ensure it)
    const sorted = [...chunks].sort((a, b) => b.score - a.score);

    for (const chunk of sorted) {
      const chunkLength = chunk.text.length;

      if (currentLength + chunkLength <= maxLength) {
        result.push(chunk);
        currentLength += chunkLength;
      } else {
        // Check if we can fit a truncated version
        const remaining = maxLength - currentLength;
        if (remaining > 200) {  // Only if meaningful space left
          // Truncate at sentence boundary if possible
          const truncated = this.truncateAtSentence(chunk.text, remaining);
          if (truncated.length > 100) {
            result.push({
              text: truncated + '...',
              score: chunk.score,
              fileName: chunk.fileName,
              fileType: chunk.fileType,
              chunkIndex: chunk.chunkIndex,
              metadata: chunk.metadata
            });
          }
        }
        break;
      }
    }

    // Re-sort by original order (chunk index) for coherent reading
    return result.sort((a, b) => a.chunkIndex - b.chunkIndex);
  }

  /**
   * Truncate text at sentence boundary
   */
  private truncateAtSentence(text: string, maxLength: number): string {
    if (text.length <= maxLength) {
      return text;
    }

    const truncated = text.substring(0, maxLength);

    // Find last sentence ending
    const lastPeriod = truncated.lastIndexOf('. ');
    const lastQuestion = truncated.lastIndexOf('? ');
    const lastExclamation = truncated.lastIndexOf('! ');

    const lastSentenceEnd = Math.max(lastPeriod, lastQuestion, lastExclamation);

    if (lastSentenceEnd > maxLength * 0.7) {  // If we have at least 70% of text
      return truncated.substring(0, lastSentenceEnd + 1);
    }

    return truncated;
  }

  /**
   * Check if query is relevant to knowledge base
   * Returns false for general conversation queries
   */
  isQueryRelevantForKB(query: string): boolean {
    const lowerQuery = query.toLowerCase();

    // Keywords that suggest user wants specific information
    const relevantKeywords = [
      'what', 'how', 'when', 'where', 'why', 'who',
      'explain', 'describe', 'tell me about', 'information about',
      'details', 'documentation', 'guide', 'instructions',
      'can you show', 'do you have', 'is there'
    ];

    // Keywords that suggest general conversation
    const conversationalKeywords = [
      'hello', 'hi', 'hey', 'thanks', 'thank you',
      'okay', 'ok', 'yes', 'no', 'bye', 'goodbye'
    ];

    // Check if it's too short (likely not a real question)
    if (query.trim().split(/\s+/).length < 3) {
      return false;
    }

    // Check for conversational patterns
    if (conversationalKeywords.some(kw => lowerQuery.includes(kw))) {
      return false;
    }

    // Check for relevant patterns
    return relevantKeywords.some(kw => lowerQuery.includes(kw)) || query.includes('?');
  }

  /**
   * Get RAG statistics for an agent
   */
  async getRAGStats(agentId: string): Promise<{
    totalDocuments: number;
    totalChunks: number;
    readyDocuments: number;
    processingDocuments: number;
  }> {
    const documents = await KnowledgeBase.find({ agentId });

    const stats = {
      totalDocuments: documents.length,
      totalChunks: documents.reduce((sum, doc) => sum + doc.totalChunks, 0),
      readyDocuments: documents.filter(d => d.status === 'ready').length,
      processingDocuments: documents.filter(d => d.status === 'processing').length
    };

    return stats;
  }
}

export const ragService = new RAGService();
