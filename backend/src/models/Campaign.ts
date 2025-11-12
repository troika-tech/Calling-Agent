import mongoose, { Document, Schema } from 'mongoose';

export interface ICampaign extends Document {
  userId: mongoose.Types.ObjectId;
  agentId: mongoose.Types.ObjectId;
  phoneId?: mongoose.Types.ObjectId;  // Phone configuration for outbound calls
  name: string;
  description?: string;
  status: 'draft' | 'scheduled' | 'active' | 'paused' | 'completed' | 'cancelled' | 'failed';

  // Contact stats
  totalContacts: number;
  queuedCalls: number;
  activeCalls: number;
  completedCalls: number;
  failedCalls: number;
  voicemailCalls: number;

  // Campaign settings
  settings: {
    retryFailedCalls: boolean;
    maxRetryAttempts: number;
    retryDelayMinutes: number;
    excludeVoicemail: boolean;  // Don't retry voicemail detections
    priorityMode: 'fifo' | 'lifo' | 'priority';  // First In First Out, Last In First Out, or Priority
    concurrentCallsLimit: number;  // Number of concurrent calls for this campaign
  };

  // Scheduling
  scheduledFor?: Date;  // When to start the campaign
  startedAt?: Date;  // When campaign actually started
  completedAt?: Date;  // When campaign finished
  pausedAt?: Date;  // Last time campaign was paused

  // Metadata
  metadata?: Record<string, any>;  // Custom data for analytics

  // Virtual properties
  progress?: number;  // Progress percentage (virtual)
  successRate?: number;  // Success rate percentage (virtual)

  createdAt: Date;
  updatedAt: Date;
}

const campaignSchema = new Schema<ICampaign>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    agentId: {
      type: Schema.Types.ObjectId,
      ref: 'Agent',
      required: true,
      index: true
    },
    phoneId: {
      type: Schema.Types.ObjectId,
      ref: 'Phone',
      required: false
    },
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 200
    },
    description: {
      type: String,
      trim: true,
      maxlength: 1000
    },
    status: {
      type: String,
      required: true,
      enum: ['draft', 'scheduled', 'active', 'paused', 'completed', 'cancelled', 'failed'],
      default: 'draft',
      index: true
    },
    totalContacts: {
      type: Number,
      default: 0,
      min: 0
    },
    queuedCalls: {
      type: Number,
      default: 0,
      min: 0
    },
    activeCalls: {
      type: Number,
      default: 0,
      min: 0
    },
    completedCalls: {
      type: Number,
      default: 0,
      min: 0
    },
    failedCalls: {
      type: Number,
      default: 0,
      min: 0
    },
    voicemailCalls: {
      type: Number,
      default: 0,
      min: 0
    },
    settings: {
      retryFailedCalls: {
        type: Boolean,
        default: true
      },
      maxRetryAttempts: {
        type: Number,
        default: 3,
        min: 0,
        max: 10
      },
      retryDelayMinutes: {
        type: Number,
        default: 30,
        min: 1
      },
      excludeVoicemail: {
        type: Boolean,
        default: true  // Don't retry voicemail detections by default
      },
      priorityMode: {
        type: String,
        enum: ['fifo', 'lifo', 'priority'],
        default: 'fifo'
      },
      concurrentCallsLimit: {
        type: Number,
        required: true,
        min: 1,
        max: 50,
        default: 3
      }
    },
    scheduledFor: {
      type: Date
    },
    startedAt: {
      type: Date
    },
    completedAt: {
      type: Date
    },
    pausedAt: {
      type: Date
    },
    metadata: {
      type: Schema.Types.Mixed
    }
  },
  {
    timestamps: true
  }
);

// Compound indexes for common queries
campaignSchema.index({ userId: 1, status: 1, createdAt: -1 });
campaignSchema.index({ agentId: 1, status: 1 });
campaignSchema.index({ status: 1, scheduledFor: 1 });

// Virtual for progress percentage
campaignSchema.virtual('progress').get(function() {
  if (this.totalContacts === 0) return 0;
  return Math.round(((this.completedCalls + this.failedCalls) / this.totalContacts) * 100);
});

// Virtual for success rate
campaignSchema.virtual('successRate').get(function() {
  const totalProcessed = this.completedCalls + this.failedCalls;
  if (totalProcessed === 0) return 0;
  return Math.round((this.completedCalls / totalProcessed) * 100);
});

// Ensure virtuals are included in JSON
campaignSchema.set('toJSON', { virtuals: true });
campaignSchema.set('toObject', { virtuals: true });

export const Campaign = mongoose.model<ICampaign>('Campaign', campaignSchema);
