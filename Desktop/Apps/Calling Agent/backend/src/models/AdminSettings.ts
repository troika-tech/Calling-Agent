import mongoose, { Document, Schema } from 'mongoose';

export interface IAdminSettings extends Document {
  userId: mongoose.Types.ObjectId;
  defaultTtsProvider: 'deepgram' | 'elevenlabs';
  ttsProviders: {
    deepgram?: {
      enabled: boolean;
      defaultVoiceId: string;
      apiKey?: string;
    };
    elevenlabs?: {
      enabled: boolean;
      defaultVoiceId: string;
      model?: string;
      apiKey?: string;
      settings?: {
        stability?: number;
        similarityBoost?: number;
      };
    };
  };
  createdAt: Date;
  updatedAt: Date;
}

const adminSettingsSchema = new Schema<IAdminSettings>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true // One settings document per user
    },
    defaultTtsProvider: {
      type: String,
      required: true,
      enum: ['deepgram', 'elevenlabs'],
      default: 'deepgram'
    },
    ttsProviders: {
      deepgram: {
        enabled: {
          type: Boolean,
          default: true
        },
        defaultVoiceId: {
          type: String,
          default: 'aura-asteria-en'
        },
        apiKey: String
      },
      elevenlabs: {
        enabled: {
          type: Boolean,
          default: false
        },
        defaultVoiceId: {
          type: String,
          default: ''
        },
        model: {
          type: String,
          default: 'eleven_turbo_v2_5'
        },
        apiKey: String,
        settings: {
          stability: {
            type: Number,
            min: 0,
            max: 1,
            default: 0.5
          },
          similarityBoost: {
            type: Number,
            min: 0,
            max: 1,
            default: 0.75
          }
        }
      }
    }
  },
  {
    timestamps: true
  }
);

// Indexes
adminSettingsSchema.index({ userId: 1 });

export const AdminSettings = mongoose.model<IAdminSettings>('AdminSettings', adminSettingsSchema);
