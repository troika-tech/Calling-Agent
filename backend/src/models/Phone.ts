import mongoose, { Document, Schema } from 'mongoose';

export interface IPhone extends Document {
  userId: mongoose.Types.ObjectId;
  number: string;
  country: string;
  provider: 'exotel';
  agentId?: mongoose.Types.ObjectId;
  tags: string[];
  status: 'active' | 'inactive';
  exotelData?: {
    apiKey: string;      // Encrypted
    apiToken: string;    // Encrypted
    sid: string;
    subdomain: string;
    appId?: string;      // Voicebot App ID for outbound calls
  };
  agentConfigOverride?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

const phoneSchema = new Schema<IPhone>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    number: {
      type: String,
      required: true,
      trim: true
    },
    country: {
      type: String,
      required: true,
      uppercase: true,
      length: 2
    },
    provider: {
      type: String,
      required: true,
      enum: ['exotel'],
      default: 'exotel'
    },
    agentId: {
      type: Schema.Types.ObjectId,
      ref: 'Agent'
    },
    tags: {
      type: [String],
      default: [],
      validate: {
        validator: function(tags: string[]) {
          return tags.length <= 10;
        },
        message: 'Maximum 10 tags allowed'
      }
    },
    status: {
      type: String,
      enum: ['active', 'inactive'],
      default: 'active'
    },
    exotelData: {
      apiKey: String,      // Will be encrypted
      apiToken: String,    // Will be encrypted
      sid: String,
      subdomain: String,
      appId: String        // Voicebot App ID for outbound calls
    },
    agentConfigOverride: Schema.Types.Mixed
  },
  {
    timestamps: true
  }
);

// Indexes
phoneSchema.index({ number: 1 }, { unique: true });
phoneSchema.index({ userId: 1, status: 1 });
phoneSchema.index({ agentId: 1 });
phoneSchema.index({ tags: 1 });

export const Phone = mongoose.model<IPhone>('Phone', phoneSchema);
