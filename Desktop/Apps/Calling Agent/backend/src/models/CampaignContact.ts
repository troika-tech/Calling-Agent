import mongoose, { Document, Schema } from 'mongoose';

export interface ICampaignContact extends Document {
  campaignId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  phoneNumber: string;  // E.164 format

  // Contact details
  name?: string;
  email?: string;
  customData?: Record<string, any>;  // Additional contact metadata

  // Call tracking
  status: 'pending' | 'queued' | 'calling' | 'completed' | 'failed' | 'voicemail' | 'skipped';
  callLogId?: mongoose.Types.ObjectId;  // Reference to CallLog when call is made

  // Retry tracking
  retryCount: number;
  lastAttemptAt?: Date;
  nextRetryAt?: Date;
  failureReason?: string;

  // Priority for queue ordering
  priority: number;  // Higher number = higher priority (default: 0)

  // Scheduling
  scheduledFor?: Date;  // Override campaign schedule for individual contact

  createdAt: Date;
  updatedAt: Date;
}

const campaignContactSchema = new Schema<ICampaignContact>(
  {
    campaignId: {
      type: Schema.Types.ObjectId,
      ref: 'Campaign',
      required: true,
      index: true
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    phoneNumber: {
      type: String,
      required: true,
      trim: true,
      validate: {
        validator: function(v: string) {
          // E.164 format validation (+ followed by 1-15 digits)
          return /^\+[1-9]\d{1,14}$/.test(v);
        },
        message: 'Phone number must be in E.164 format (e.g., +14155551234)'
      }
    },
    name: {
      type: String,
      trim: true,
      maxlength: 200
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      maxlength: 320
    },
    customData: {
      type: Schema.Types.Mixed
    },
    status: {
      type: String,
      required: true,
      enum: ['pending', 'queued', 'calling', 'completed', 'failed', 'voicemail', 'skipped'],
      default: 'pending',
      index: true
    },
    callLogId: {
      type: Schema.Types.ObjectId,
      ref: 'CallLog'
    },
    retryCount: {
      type: Number,
      default: 0,
      min: 0
    },
    lastAttemptAt: {
      type: Date
    },
    nextRetryAt: {
      type: Date,
      index: true
    },
    failureReason: {
      type: String,
      maxlength: 500
    },
    priority: {
      type: Number,
      default: 0,
      index: true
    },
    scheduledFor: {
      type: Date
    }
  },
  {
    timestamps: true
  }
);

// Compound indexes for efficient querying
campaignContactSchema.index({ campaignId: 1, status: 1 });
campaignContactSchema.index({ campaignId: 1, status: 1, priority: -1, createdAt: 1 });  // For queue ordering
campaignContactSchema.index({ campaignId: 1, phoneNumber: 1 }, { unique: true });  // Prevent duplicates
campaignContactSchema.index({ status: 1, nextRetryAt: 1 });  // For retry scheduling

export const CampaignContact = mongoose.model<ICampaignContact>('CampaignContact', campaignContactSchema);
