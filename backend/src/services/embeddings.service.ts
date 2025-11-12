import { openaiService } from './openai.service';
import { logger } from '../utils/logger';
import { ExternalServiceError } from '../utils/errors';

export interface EmbeddingResult {
  embedding: number[];
  tokens: number;
}

export interface BatchEmbeddingResult {
  embeddings: number[][];
  totalTokens: number;
  cost: number;
}

class EmbeddingsService {
  private readonly MODEL = 'text-embedding-3-small';
  private readonly DIMENSIONS = 1536;
  private readonly COST_PER_1M_TOKENS = 0.02;  // $0.02 per 1M tokens
  private readonly MAX_BATCH_SIZE = 2048;  // OpenAI limit
  private readonly MAX_TOKENS_PER_INPUT = 8191;  // Model limit

  /**
   * Generate embedding for a single text
   */
  async generateEmbedding(text: string): Promise<EmbeddingResult> {
    try {
      if (!text || text.trim().length === 0) {
        throw new Error('Cannot generate embedding for empty text');
      }

      logger.debug('Generating embedding', {
        textLength: text.length
      });

      const response = await openaiService.createEmbeddings(text.trim(), this.MODEL);

      const embedding = response.data[0].embedding;
      const tokens = response.usage?.total_tokens || 0;

      // Validate embedding dimensions
      if (embedding.length !== this.DIMENSIONS) {
        throw new Error(
          `Invalid embedding dimensions: ${embedding.length}, expected ${this.DIMENSIONS}`
        );
      }

      logger.debug('Embedding generated', {
        dimensions: embedding.length,
        tokens
      });

      return {
        embedding,
        tokens
      };
    } catch (error: any) {
      logger.error('Failed to generate embedding', {
        error: error.message,
        textLength: text?.length || 0
      });
      throw new ExternalServiceError('Failed to generate text embedding');
    }
  }

  /**
   * Generate embeddings for multiple texts in batch
   * More efficient than individual calls
   */
  async generateBatchEmbeddings(texts: string[]): Promise<BatchEmbeddingResult> {
    try {
      if (!texts || texts.length === 0) {
        throw new Error('Cannot generate embeddings for empty array');
      }

      // Filter out empty texts
      const validTexts = texts.filter(t => t && t.trim().length > 0);

      if (validTexts.length === 0) {
        throw new Error('All texts are empty');
      }

      logger.info('Generating batch embeddings', {
        totalTexts: validTexts.length,
        avgLength: Math.round(
          validTexts.reduce((sum, t) => sum + t.length, 0) / validTexts.length
        )
      });

      // Process in batches if needed
      const batches: string[][] = [];
      for (let i = 0; i < validTexts.length; i += this.MAX_BATCH_SIZE) {
        batches.push(validTexts.slice(i, i + this.MAX_BATCH_SIZE));
      }

      const allEmbeddings: number[][] = [];
      let totalTokens = 0;

      for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];

        logger.info(`Processing batch ${i + 1}/${batches.length}`, {
          batchSize: batch.length
        });

        const response = await openaiService.createEmbeddings(batch.map(t => t.trim()), this.MODEL);

        // Extract embeddings
        const batchEmbeddings = response.data.map(d => d.embedding);

        // Validate all embeddings
        batchEmbeddings.forEach((emb, idx) => {
          if (emb.length !== this.DIMENSIONS) {
            throw new Error(
              `Invalid embedding dimensions at index ${idx}: ${emb.length}`
            );
          }
        });

        allEmbeddings.push(...batchEmbeddings);
        totalTokens += response.usage?.total_tokens || 0;

        // Rate limiting: wait 100ms between batches
        if (i < batches.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      const cost = (totalTokens / 1_000_000) * this.COST_PER_1M_TOKENS;

      logger.info('Batch embeddings generated', {
        totalEmbeddings: allEmbeddings.length,
        totalTokens,
        cost: `$${cost.toFixed(4)}`,
        batches: batches.length
      });

      return {
        embeddings: allEmbeddings,
        totalTokens,
        cost
      };
    } catch (error: any) {
      logger.error('Failed to generate batch embeddings', {
        error: error.message,
        textsCount: texts?.length || 0
      });
      throw new ExternalServiceError('Failed to generate batch embeddings');
    }
  }

  /**
   * Calculate cosine similarity between two embeddings
   */
  cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error('Embeddings must have same dimensions');
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /**
   * Find most similar embeddings from a list
   */
  findMostSimilar(
    queryEmbedding: number[],
    candidateEmbeddings: Array<{ embedding: number[]; data: any }>,
    topK: number = 5
  ): Array<{ similarity: number; data: any }> {
    // Calculate similarities
    const similarities = candidateEmbeddings.map(candidate => ({
      similarity: this.cosineSimilarity(queryEmbedding, candidate.embedding),
      data: candidate.data
    }));

    // Sort by similarity (descending)
    similarities.sort((a, b) => b.similarity - a.similarity);

    // Return top K
    return similarities.slice(0, topK);
  }

  /**
   * Estimate cost for embedding generation
   */
  estimateCost(textLength: number): { tokens: number; cost: number } {
    // Rough estimate: 1 token ≈ 4 characters
    const estimatedTokens = Math.ceil(textLength / 4);
    const cost = (estimatedTokens / 1_000_000) * this.COST_PER_1M_TOKENS;

    return {
      tokens: estimatedTokens,
      cost
    };
  }

  /**
   * Validate embedding
   */
  validateEmbedding(embedding: number[]): boolean {
    if (!Array.isArray(embedding)) {
      return false;
    }

    if (embedding.length !== this.DIMENSIONS) {
      return false;
    }

    // Check if all values are numbers
    return embedding.every(v => typeof v === 'number' && !isNaN(v));
  }

  /**
   * Get model info
   */
  getModelInfo() {
    return {
      model: this.MODEL,
      dimensions: this.DIMENSIONS,
      maxTokensPerInput: this.MAX_TOKENS_PER_INPUT,
      maxBatchSize: this.MAX_BATCH_SIZE,
      costPer1MTokens: this.COST_PER_1M_TOKENS
    };
  }
}

export const embeddingsService = new EmbeddingsService();
