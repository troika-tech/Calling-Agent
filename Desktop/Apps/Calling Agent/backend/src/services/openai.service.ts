import OpenAI, { toFile } from 'openai';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import { ExternalServiceError } from '../utils/errors';
import { Readable } from 'stream';

export interface TranscriptionResult {
  text: string;
  language?: string;
  detectedLanguage?: string;  // Auto-detected language from Whisper
  confidence?: number;         // Detection confidence (0-1)
  duration?: number;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatCompletionResult {
  text: string;
  finishReason: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface TextToSpeechOptions {
  text: string;
  voice?: string;
  model?: string;
}

export class OpenAIService {
  private client: OpenAI;

  constructor() {
    if (!env.OPENAI_API_KEY) {
      logger.error('OpenAI API key not configured');
      throw new Error('OPENAI_API_KEY is required to use AI voice features');
    }

    this.client = new OpenAI({
      apiKey: env.OPENAI_API_KEY
    });

    logger.info('OpenAI service initialized');
  }

  /**
   * Transcribe audio to text using Whisper with language detection
   */
  async transcribeAudio(
    audioBuffer: Buffer,
    language?: string
  ): Promise<TranscriptionResult> {
    try {
      const startTime = Date.now();

      logger.info('Starting audio transcription', {
        audioSize: audioBuffer.length,
        language: language || 'auto-detect'
      });

      // Create a file-like object from buffer
      const file = await toFile(audioBuffer, 'audio.wav');

      // Use verbose_json to get language detection info
      const response = await this.client.audio.transcriptions.create({
        file,
        model: 'whisper-1',
        language: language || undefined,
        response_format: 'verbose_json'
      });

      const duration = Date.now() - startTime;

      // Extract detected language and confidence from verbose response
      const detectedLanguage = (response as any).language;

      // Whisper doesn't provide explicit confidence for language detection,
      // but we can estimate it based on the transcription quality
      // For now, we'll use a high confidence if language was detected
      const confidence = detectedLanguage ? 0.9 : undefined;

      logger.info('Audio transcription completed', {
        text: response.text,
        configuredLanguage: language,
        detectedLanguage,
        duration: `${duration}ms`
      });

      return {
        text: response.text,
        language: language,
        detectedLanguage,
        confidence,
        duration
      };
    } catch (error: any) {
      logger.error('Failed to transcribe audio', {
        error: error.message
      });

      throw new ExternalServiceError('Failed to transcribe audio with Whisper');
    }
  }

  /**
   * Convert text to speech using OpenAI TTS
   */
  async textToSpeech(options: TextToSpeechOptions): Promise<Buffer> {
    try {
      const model = options.model || 'gpt-4o-mini-tts';
      const voice = options.voice || 'alloy';

      logger.info('Generating speech with OpenAI', {
        model,
        voice,
        textLength: options.text.length
      });

      const response = await this.client.audio.speech.create({
        model,
        voice,
        input: options.text
      });

      const audioBuffer = Buffer.from(await response.arrayBuffer());

      logger.info('OpenAI speech synthesis completed', {
        model,
        voice,
        size: audioBuffer.length
      });

      return audioBuffer;
    } catch (error: any) {
      logger.error('Failed to synthesize speech with OpenAI', {
        error: error.message
      });

      throw new ExternalServiceError('Failed to synthesize speech with OpenAI');
    }
  }

  /**
   * Transcribe audio stream to text
   */
  async transcribeAudioStream(
    audioStream: Readable,
    language?: string
  ): Promise<TranscriptionResult> {
    try {
      const chunks: Buffer[] = [];

      // Collect stream data
      for await (const chunk of audioStream) {
        chunks.push(chunk);
      }

      const audioBuffer = Buffer.concat(chunks);
      return await this.transcribeAudio(audioBuffer, language);
    } catch (error: any) {
      logger.error('Failed to transcribe audio stream', {
        error: error.message
      });

      throw new ExternalServiceError('Failed to transcribe audio stream');
    }
  }

  /**
   * Get chat completion from GPT
   */
  async getChatCompletion(
    messages: ChatMessage[],
    options?: {
      model?: string;
      temperature?: number;
      maxTokens?: number;
      stream?: boolean;
    }
  ): Promise<ChatCompletionResult> {
    try {
      const startTime = Date.now();

      logger.info('Requesting chat completion', {
        messageCount: messages.length,
        model: options?.model || 'gpt-4'
      });

      const response = await this.client.chat.completions.create({
        model: options?.model || 'gpt-4o-mini',
        messages: messages as any,
        temperature: options?.temperature ?? 0.7,
        max_tokens: options?.maxTokens,
        stream: false
      });

      const duration = Date.now() - startTime;

      const choice = response.choices[0];

      logger.info('Chat completion received', {
        text: choice.message.content,
        finishReason: choice.finish_reason,
        duration: `${duration}ms`,
        usage: response.usage
      });

      return {
        text: choice.message.content || '',
        finishReason: choice.finish_reason,
        usage: response.usage
          ? {
              promptTokens: response.usage.prompt_tokens,
              completionTokens: response.usage.completion_tokens,
              totalTokens: response.usage.total_tokens
            }
          : undefined
      };
    } catch (error: any) {
      logger.error('Failed to get chat completion', {
        error: error.message
      });

      throw new ExternalServiceError('Failed to get response from GPT');
    }
  }

  /**
   * Get streaming chat completion
   */
  async *getChatCompletionStream(
    messages: ChatMessage[],
    options?: {
      model?: string;
      temperature?: number;
      maxTokens?: number;
    }
  ): AsyncGenerator<string, void, unknown> {
    try {
      logger.info('Requesting streaming chat completion', {
        messageCount: messages.length,
        model: options?.model || 'gpt-4'
      });

      const stream = await this.client.chat.completions.create({
        model: options?.model || 'gpt-4o-mini',
        messages: messages as any,
        temperature: options?.temperature ?? 0.7,
        max_tokens: options?.maxTokens,
        stream: true
      });

      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content;
        if (content) {
          yield content;
        }
      }

      logger.info('Streaming chat completion completed');
    } catch (error: any) {
      logger.error('Failed to get streaming chat completion', {
        error: error.message
      });

      throw new ExternalServiceError('Failed to stream response from GPT');
    }
  }

  /**
   * Generate embeddings for text
   */
  async generateEmbedding(text: string): Promise<number[]> {
    try {
      logger.info('Generating embedding', {
        textLength: text.length
      });

      const response = await this.client.embeddings.create({
        model: 'text-embedding-ada-002',
        input: text
      });

      return response.data[0].embedding;
    } catch (error: any) {
      logger.error('Failed to generate embedding', {
        error: error.message
      });

      throw new ExternalServiceError('Failed to generate text embedding');
    }
  }

  /**
   * Create embeddings (public method for batch processing)
   */
  async createEmbeddings(input: string | string[], model: string = 'text-embedding-3-small') {
    return await this.client.embeddings.create({
      model,
      input
    });
  }
}

export const openaiService = new OpenAIService();
