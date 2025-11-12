import mongoose, { Document, Schema } from 'mongoose';

export interface IRetryAttempt extends Document {
  originalCallLogId: mongoose.Types.ObjectId;
  retryCallLogId?: mongoose.Types.ObjectId;
  attemptNumber: number;
  scheduledFor: Date;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  failureReason: string;
  processedAt?: Date;
  failedAt?: Date;
  metadata?: Record<string, any>;

  createdAt: Date;
  updatedAt: Date;
}

const retryAttemptSchema = new Schema<IRetryAttempt>(
  {
    originalCallLogId: {
      type: Schema.Types.ObjectId,
      ref: 'CallLog',
      required: true
    },
    retryCallLogId: {
      type: Schema.Types.ObjectId,
      ref: 'CallLog'
    },
    attemptNumber: {
      type: Number,
      required: true,
      min: 1
    },
    scheduledFor: {
      type: Date,
      required: true
    },
    status: {
      type: String,
      enum: ['pending', 'processing', 'completed', 'failed', 'cancelled'],
      default: 'pending',
      required: true
    },
    failureReason: {
      type: String,
      required: true,
      enum: ['no_answer', 'busy', 'voicemail', 'invalid_number', 'network_error', 'rate_limited', 'api_unavailable']
    },
    processedAt: Date,
    failedAt: Date,
    metadata: Schema.Types.Mixed
  },
  {
    timestamps: true
  }
);

// Indexes
retryAttemptSchema.index({ originalCallLogId: 1, attemptNumber: 1 }, { unique: true });
retryAttemptSchema.index({ scheduledFor: 1, status: 1 });
retryAttemptSchema.index({ status: 1, scheduledFor: 1 });
retryAttemptSchema.index({ retryCallLogId: 1 });

// Virtual fields
retryAttemptSchema.virtual('isPending').get(function(this: IRetryAttempt) {
  return this.status === 'pending';
});

retryAttemptSchema.virtual('isProcessed').get(function(this: IRetryAttempt) {
  return ['completed', 'failed', 'cancelled'].includes(this.status);
});

// Methods
retryAttemptSchema.methods.toJSON = function() {
  const obj = this.toObject();
  obj.isPending = this.isPending;
  obj.isProcessed = this.isProcessed;
  return obj;
};

export const RetryAttempt = mongoose.model<IRetryAttempt>('RetryAttempt', retryAttemptSchema);
