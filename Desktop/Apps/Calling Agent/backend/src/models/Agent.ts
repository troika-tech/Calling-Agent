import mongoose, { Document, Schema } from 'mongoose';

export interface IAgent extends Document {
  userId: mongoose.Types.ObjectId;
  name: string;  // Agent name
  description?: string;  // Optional description
  config: {
    prompt: string;  // Agent-specific persona (backward compatibility)
    persona?: string;  // New: Agent-specific persona/character description
    greetingMessage: string;  // First message when call starts
    endCallPhrases: string[];  // Phrases that trigger call end (e.g., ["goodbye", "bye", "end call"])
    voice: {
      provider: 'openai' | 'elevenlabs' | 'cartesia' | 'deepgram' | 'sarvam';
      voiceId: string;
      model?: string;
      settings?: Record<string, any>;
    };
    language: string;  // Language code (e.g., 'en', 'es', 'fr') - acts as fallback when auto-detection is enabled
    enableAutoLanguageDetection?: boolean;  // Enable automatic language detection and switching
    sttProvider?: 'deepgram' | 'sarvam' | 'whisper';  // STT provider selection
    llm: {
      model: 'gpt-4' | 'gpt-3.5-turbo' | 'gpt-4-turbo' | 'gpt-4o' | 'gpt-4o-mini' | 'claude-3-5-haiku-20241022' | 'claude-3-5-sonnet-20241022';
      temperature: number;
      maxTokens?: number;  // Optional - omit to let prompt control brevity
    };
    voicemailDetection?: {
      enabled: boolean;  // Enable voicemail detection (default: true)
      confidenceThreshold: number;  // Confidence threshold (0-1, default: 0.7)
      minDetectionTime: number;  // Minimum seconds before detection (default: 3)
      keywords?: string[];  // Custom keywords (optional, uses defaults if not provided)
      // Audio AMD settings
      enableAudioAMD?: boolean;  // Enable audio-based AMD (default: true)
      audioAMDPriority?: 'audio_first' | 'keyword_first' | 'both';  // Detection priority (default: 'both')
    };
    firstMessage?: string;  // Deprecated: use greetingMessage instead
    sessionTimeout?: number;
    flow?: {
      userStartFirst?: boolean;
      interruption?: {
        allowed: boolean;
      };
      responseDelay?: number;
    };
  };
  isActive: boolean;
  stats?: {
    totalCalls: number;
    totalDuration: number;
    avgDuration: number;
    successRate: number;
  };
  createdAt: Date;
  updatedAt: Date;
}

const agentSchema = new Schema<IAgent>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 100
    },
    description: {
      type: String,
      trim: true,
      maxlength: 500
    },
    config: {
      prompt: {
        type: String,
        required: true,
        minlength: 10,
        maxlength: 50000
      },
      persona: {
        type: String,
        minlength: 10,
        maxlength: 20000
      },
      greetingMessage: {
        type: String,
        required: true,
        trim: true,
        minlength: 5,
        maxlength: 500
      },
      endCallPhrases: {
        type: [String],
        default: ['goodbye', 'bye', 'end call', 'thank you goodbye', 'talk to you later']
      },
      voice: {
        provider: {
          type: String,
          required: true,
          enum: ['openai', 'elevenlabs', 'cartesia', 'deepgram', 'sarvam']
        },
        voiceId: {
          type: String,
          required: true
        },
        model: String,
        settings: Schema.Types.Mixed
      },
      language: {
        type: String,
        required: true,
        default: 'en'
      },
      enableAutoLanguageDetection: {
        type: Boolean,
        default: false
      },
      sttProvider: {
        type: String,
        enum: ['deepgram', 'sarvam', 'whisper'],
        default: 'deepgram'  // Default to Deepgram for international languages
      },
      llm: {
        model: {
          type: String,
          required: true,
          enum: ['gpt-4', 'gpt-3.5-turbo', 'gpt-4-turbo', 'gpt-4o', 'gpt-4o-mini', 'claude-3-5-haiku-20241022', 'claude-3-5-sonnet-20241022'],
          default: 'gpt-4o-mini'
        },
        temperature: {
          type: Number,
          min: 0,
          max: 2,
          default: 0.7
        },
        maxTokens: Number  // Optional: Let system prompt control brevity naturally
      },
      voicemailDetection: {
        type: {
          enabled: {
            type: Boolean,
            default: true
          },
          confidenceThreshold: {
            type: Number,
            min: 0,
            max: 1,
            default: 0.7
          },
          minDetectionTime: {
            type: Number,
            min: 0,
            default: 3  // 3 seconds minimum before detection
          },
          keywords: {
            type: [String],
            required: false
          },
          enableAudioAMD: {
            type: Boolean,
            default: true  // Enable audio-based AMD by default
          },
          audioAMDPriority: {
            type: String,
            enum: ['audio_first', 'keyword_first', 'both'],
            default: 'both'  // Use both audio and keyword detection
          }
        },
        required: false,
        default: undefined
      },
      firstMessage: String,
      sessionTimeout: Number,
      flow: {
        type: {
          userStartFirst: Boolean,
          interruption: {
            allowed: Boolean
          },
          responseDelay: Number
        },
        required: false,
        default: undefined
      }
    },
    isActive: {
      type: Boolean,
      default: true
    },
    stats: {
      totalCalls: {
        type: Number,
        default: 0
      },
      totalDuration: {
        type: Number,
        default: 0
      },
      avgDuration: {
        type: Number,
        default: 0
      },
      successRate: {
        type: Number,
        default: 0,
        min: 0,
        max: 1
      }
    }
  },
  {
    timestamps: true
  }
);

// Indexes
agentSchema.index({ userId: 1, createdAt: -1 });
agentSchema.index({ userId: 1, isActive: 1 });
agentSchema.index({ name: 'text' });

export const Agent = mongoose.model<IAgent>('Agent', agentSchema);
