import { z } from 'zod';

// Auth validation schemas
export const signupSchema = {
  body: z.object({
    email: z
      .string()
      .email('Invalid email format')
      .min(1, 'Email is required'),
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .max(128, 'Password must not exceed 128 characters'),
    name: z
      .string()
      .min(1, 'Name is required')
      .max(100, 'Name must not exceed 100 characters')
      .trim()
  })
};

export const loginSchema = {
  body: z.object({
    email: z
      .string()
      .email('Invalid email format')
      .min(1, 'Email is required'),
    password: z
      .string()
      .min(1, 'Password is required')
  })
};

export const refreshTokenSchema = {
  body: z.object({
    refreshToken: z
      .string()
      .min(1, 'Refresh token is required')
  })
};

export const changePasswordSchema = {
  body: z.object({
    currentPassword: z
      .string()
      .min(1, 'Current password is required'),
    newPassword: z
      .string()
      .min(8, 'New password must be at least 8 characters')
      .max(128, 'New password must not exceed 128 characters')
  })
};

// Agent validation schemas
export const createAgentSchema = {
  body: z.object({
    name: z
      .string()
      .min(1, 'Name is required')
      .max(100, 'Name must not exceed 100 characters')
      .trim(),
    description: z
      .string()
      .max(500, 'Description must not exceed 500 characters')
      .optional(),
    config: z.object({
      prompt: z
        .string()
        .min(10, 'Prompt must be at least 10 characters')
        .max(50000, 'Prompt must not exceed 50000 characters'),
      persona: z
        .string()
        .min(10, 'Persona must be at least 10 characters')
        .max(20000, 'Persona must not exceed 20000 characters')
        .optional(),
      greetingMessage: z
        .string()
        .min(5, 'Greeting message must be at least 5 characters')
        .max(500, 'Greeting message must not exceed 500 characters')
        .optional(),
      voice: z.object({
        provider: z.enum(['openai', 'elevenlabs', 'cartesia', 'deepgram', 'sarvam']),
        voiceId: z.string().min(1, 'Voice ID is required'),
        model: z.string().optional(),
        settings: z.record(z.any()).optional()
      }),
      language: z
        .string()
        .min(2, 'Language code is required')
        .max(10, 'Invalid language code'),
      sttProvider: z.enum(['auto', 'deepgram', 'sarvam', 'whisper']).optional(),
      llm: z.object({
        model: z.enum([
          'gpt-4',
          'gpt-3.5-turbo',
          'gpt-4-turbo',
          'gpt-4o',
          'gpt-4o-mini',
          'claude-3-5-haiku-20241022',
          'claude-3-5-sonnet-20241022'
        ]),
        temperature: z
          .number()
          .min(0, 'Temperature must be between 0 and 2')
          .max(2, 'Temperature must be between 0 and 2')
          .default(0.7),
        maxTokens: z.number().positive().optional()
      }),
      endCallPhrases: z.array(z.string()).optional(),
      firstMessage: z.string().max(500).optional(),
      sessionTimeout: z.number().positive().optional(),
      flow: z.object({
        userStartFirst: z.boolean().optional(),
        interruption: z.object({
          allowed: z.boolean()
        }).optional(),
        responseDelay: z.number().min(0).optional()
      }).optional()
    })
  })
};

export const updateAgentSchema = {
  params: z.object({
    id: z.string().min(1, 'Agent ID is required')
  }),
  body: z.object({
    name: z
      .string()
      .min(1)
      .max(100)
      .trim()
      .optional(),
    description: z
      .string()
      .max(500)
      .optional(),
    config: z.object({
      prompt: z.string().min(10).max(50000).optional(),
      persona: z.string().min(10).max(20000).optional(),
      greetingMessage: z.string().min(5).max(500).optional(),
      voice: z.object({
        provider: z.enum(['openai', 'elevenlabs', 'cartesia', 'deepgram', 'sarvam']).optional(),
        voiceId: z.string().optional(),
        model: z.string().optional(),
        settings: z.record(z.any()).optional()
      }).optional(),
      language: z.string().optional(),
      sttProvider: z.enum(['auto', 'deepgram', 'sarvam', 'whisper']).optional(),
      llm: z.object({
        model: z.enum([
          'gpt-4',
          'gpt-3.5-turbo',
          'gpt-4-turbo',
          'gpt-4o',
          'gpt-4o-mini',
          'claude-3-5-haiku-20241022',
          'claude-3-5-sonnet-20241022'
        ]).optional(),
        temperature: z.number().min(0).max(2).optional(),
        maxTokens: z.number().positive().optional()
      }).optional(),
      endCallPhrases: z.array(z.string()).optional(),
      firstMessage: z.string().max(500).optional(),
      sessionTimeout: z.number().positive().optional(),
      flow: z.object({
        userStartFirst: z.boolean().optional(),
        interruption: z.object({
          allowed: z.boolean()
        }).optional(),
        responseDelay: z.number().min(0).optional()
      }).optional()
    }).optional()
  })
};

export const getAgentsSchema = {
  query: z.object({
    page: z.string().optional(),
    limit: z.string().optional(),
    search: z.string().optional(),
    isActive: z.enum(['true', 'false']).optional()
  }).optional()
};

export const agentIdSchema = {
  params: z.object({
    id: z.string().min(1, 'Agent ID is required')
  })
};

// Phone validation schemas
export const importPhoneSchema = {
  body: z.object({
    number: z
      .string()
      .min(1, 'Phone number is required')
      .max(20, 'Phone number too long')
      .regex(/^\+?[1-9]\d{1,14}$/, 'Invalid phone number format'),
    country: z
      .string()
      .length(2, 'Country code must be 2 characters')
      .toUpperCase(),
    exotelConfig: z.object({
      apiKey: z.string().min(1),
      apiToken: z.string().min(1),
      sid: z.string().min(1),
      subdomain: z.string().min(1),
      appId: z.string().optional()  // Voicebot App ID for outbound calls
    }).optional(),
    tags: z
      .array(z.string().min(1).max(30))
      .max(10, 'Maximum 10 tags allowed')
      .optional()
  })
};

export const assignAgentSchema = {
  params: z.object({
    id: z.string().min(1, 'Phone ID is required')
  }),
  body: z.object({
    agentId: z.string().min(1, 'Agent ID is required')
  })
};

export const updateTagsSchema = {
  params: z.object({
    id: z.string().min(1, 'Phone ID is required')
  }),
  body: z.object({
    tags: z
      .array(z.string().min(1).max(30))
      .max(10, 'Maximum 10 tags allowed')
      .optional(),
    isActive: z.boolean().optional()
  })
};

export const getPhonesSchema = {
  query: z.object({
    page: z.string().optional(),
    limit: z.string().optional(),
    search: z.string().optional(),
    isActive: z.enum(['true', 'false']).optional(),
    hasAgent: z.enum(['true', 'false']).optional()
  }).optional()
};

export const phoneIdSchema = {
  params: z.object({
    id: z.string().min(1, 'Phone ID is required')
  })
};

// Call validation schemas
export const startCallSchema = z.object({
  body: z.object({
    fromPhone: z
      .string()
      .min(1, 'From phone is required')
      .regex(/^\+?[1-9]\d{1,14}$/, 'Invalid phone number format'),
    toPhone: z
      .string()
      .min(1, 'To phone is required')
      .regex(/^\+?[1-9]\d{1,14}$/, 'Invalid phone number format'),
    agentId: z.string().min(1, 'Agent ID is required'),
    metadata: z.record(z.any()).optional()
  })
});

// Query validation schemas
export const paginationSchema = z.object({
  query: z.object({
    page: z
      .string()
      .optional()
      .transform((val) => (val ? parseInt(val, 10) : 1))
      .refine((val) => val > 0, 'Page must be positive'),
    limit: z
      .string()
      .optional()
      .transform((val) => (val ? parseInt(val, 10) : 20))
      .refine((val) => val > 0 && val <= 100, 'Limit must be between 1 and 100'),
    search: z.string().max(100).optional()
  })
});

export const idParamSchema = z.object({
  params: z.object({
    id: z.string().min(1, 'ID is required')
  })
});
