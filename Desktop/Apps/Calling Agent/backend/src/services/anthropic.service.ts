import Anthropic from '@anthropic-ai/sdk';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import { ExternalServiceError } from '../utils/errors';

export interface ClaudeMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ClaudeCompletionResult {
  text: string;
  stopReason: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
}

export class AnthropicService {
  private client: Anthropic | null = null;
  private isInitialized: boolean = false;

  constructor() {
    if (env.ANTHROPIC_API_KEY) {
      try {
        this.client = new Anthropic({
          apiKey: env.ANTHROPIC_API_KEY
        });
        this.isInitialized = true;
        logger.info('Anthropic service initialized');
      } catch (error: any) {
        logger.error('Failed to initialize Anthropic', {
          error: error.message
        });
      }
    } else {
      logger.warn('Anthropic API key not configured - Claude models not available');
    }
  }

  /**
   * Check if Anthropic is available
   */
  isAvailable(): boolean {
    return this.isInitialized && !!this.client;
  }

  /**
   * Get chat completion from Claude
   */
  async getChatCompletion(
    messages: ClaudeMessage[],
    options?: {
      model?: string;
      temperature?: number;
      maxTokens?: number;
      systemPrompt?: string;
    }
  ): Promise<ClaudeCompletionResult> {
    if (!this.isAvailable() || !this.client) {
      throw new ExternalServiceError('Anthropic service not available');
    }

    try {
      const startTime = Date.now();

      logger.info('Requesting Claude completion', {
        messageCount: messages.length,
        model: options?.model || 'claude-3-5-haiku-20241022'
      });

      // Separate system message if present
      const systemMessage = messages.find(m => (m as any).role === 'system');
      const userMessages = messages.filter(m => (m as any).role !== 'system');

      const response = await this.client.messages.create({
        model: options?.model || 'claude-3-5-haiku-20241022',
        max_tokens: options?.maxTokens || 1024,
        temperature: options?.temperature ?? 0.7,
        system: options?.systemPrompt || systemMessage?.content,
        messages: userMessages as any
      });

      const duration = Date.now() - startTime;

      logger.info('Claude completion received', {
        text: response.content[0].type === 'text' ? response.content[0].text : '',
        stopReason: response.stop_reason,
        duration: `${duration}ms`,
        usage: response.usage
      });

      return {
        text: response.content[0].type === 'text' ? response.content[0].text : '',
        stopReason: response.stop_reason || 'end_turn',
        usage: {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens
        }
      };
    } catch (error: any) {
      logger.error('Failed to get Claude completion', {
        error: error.message
      });

      throw new ExternalServiceError('Failed to get response from Claude');
    }
  }

  /**
   * Get streaming chat completion from Claude
   * ULTRA FAST - 100-150 tokens/sec!
   */
  async *getChatCompletionStream(
    messages: ClaudeMessage[],
    options?: {
      model?: string;
      temperature?: number;
      maxTokens?: number;
      systemPrompt?: string;
    }
  ): AsyncGenerator<string, void, unknown> {
    if (!this.isAvailable() || !this.client) {
      throw new ExternalServiceError('Anthropic service not available');
    }

    try {
      logger.info('Requesting streaming Claude completion', {
        messageCount: messages.length,
        model: options?.model || 'claude-3-5-haiku-20241022'
      });

      // Separate system message
      const systemMessage = messages.find(m => (m as any).role === 'system');
      const userMessages = messages.filter(m => (m as any).role !== 'system');

      const stream = await this.client.messages.create({
        model: options?.model || 'claude-3-5-haiku-20241022',
        max_tokens: options?.maxTokens || 1024,
        temperature: options?.temperature ?? 0.7,
        system: options?.systemPrompt || systemMessage?.content,
        messages: userMessages as any,
        stream: true
      });

      for await (const event of stream) {
        if (event.type === 'content_block_delta' &&
            event.delta.type === 'text_delta') {
          yield event.delta.text;
        }
      }

      logger.info('Streaming Claude completion completed');
    } catch (error: any) {
      logger.error('Failed to get streaming Claude completion', {
        error: error.message
      });

      throw new ExternalServiceError('Failed to stream response from Claude');
    }
  }
}

export const anthropicService = new AnthropicService();
