import { z } from 'zod';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Define environment schema
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().transform(Number).default('5000'),
  FRONTEND_URL: z.string().url().default('http://localhost:5173'),

  // Database
  MONGODB_URI: z.string().default('mongodb://localhost:27017/ai-calling-platform'),
  REDIS_URL: z.string().default('redis://localhost:6379'),

  // JWT
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRE: z.string().default('7d'),
  JWT_REFRESH_EXPIRE: z.string().default('30d'),

  // Exotel
  EXOTEL_API_KEY: z.string().optional(),
  EXOTEL_API_TOKEN: z.string().optional(),
  EXOTEL_SID: z.string().optional(),
  EXOTEL_SUBDOMAIN: z.string().optional(),
  EXOTEL_BASE_URL: z.string().url().default('https://api.exotel.com/v2/accounts'),

  // AI Services
  OPENAI_API_KEY: z.string().startsWith('sk-').optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  DEEPGRAM_API_KEY: z.string().optional(),
  ELEVENLABS_API_KEY: z.string().optional(),
  SARVAM_API_KEY: z.string().optional(),  // Sarvam.ai for Indian languages

  // AWS
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  AWS_S3_BUCKET: z.string().default('ai-calling-recordings'),
  AWS_REGION: z.string().default('us-east-1'),

  // Webhooks
  WEBHOOK_BASE_URL: z.string().url().default('http://localhost:5000')
});

// Parse and validate environment variables
export const env = envSchema.parse(process.env);

// Export type
export type Env = z.infer<typeof envSchema>;
