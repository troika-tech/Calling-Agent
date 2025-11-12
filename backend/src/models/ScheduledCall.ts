import mongoose, { Document, Schema } from 'mongoose';

export interface IScheduledCall extends Document {
  callLogId?: mongoose.Types.ObjectId;
  phoneNumber: string;
  phoneId?: mongoose.Types.ObjectId;  // User's phone record (contains Exotel credentials & appId)
  agentId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  scheduledFor: Date;
  timezone: string;
  status: 'pending' | 'processing' | 'completed' | 'cancelled' | 'failed';

  // Business hours respect
  respectBusinessHours: boolean;
  businessHours?: {
    start: string;      // "HH:MM" format (e.g., "09:00")
    end: string;        // "HH:MM" format (e.g., "18:00")
    timezone: string;   // IANA timezone (e.g., "Asia/Kolkata")
    daysOfWeek?: number[];  // 0=Sun, 1=Mon, ..., 6=Sat
  };

  // Recurring settings
  recurring?: {
    frequency: 'daily' | 'weekly' | 'monthly';
    interval: number;       // Every N days/weeks/months
    endDate?: Date;
    maxOccurrences?: number;
    currentOccurrence?: number;
  };

  metadata?: Record<string, any>;

  // Processing metadata
  processedAt?: Date;
  failedAt?: Date;
  failureReason?: string;
  nextRun?: Date;  // For recurring calls

  createdAt: Date;
  updatedAt: Date;

  // Virtual fields
  isPending?: boolean;
  isRecurring?: boolean;
  canCancel?: boolean;
}

const scheduledCallSchema = new Schema<IScheduledCall>(
  {
    callLogId: {
      type: Schema.Types.ObjectId,
      ref: 'CallLog'
    },
    phoneNumber: {
      type: String,
      required: true,
      validate: {
        validator: function(v: string) {
          return /^\+[1-9]\d{1,14}$/.test(v);
        },
        message: 'Phone number must be in E.164 format'
      }
    },
    phoneId: {
      type: Schema.Types.ObjectId,
      ref: 'Phone'
    },
    agentId: {
      type: Schema.Types.ObjectId,
      ref: 'Agent',
      required: true
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    scheduledFor: {
      type: Date,
      required: true
    },
    timezone: {
      type: String,
      default: 'UTC'
    },
    status: {
      type: String,
      enum: ['pending', 'processing', 'completed', 'cancelled', 'failed'],
      default: 'pending',
      required: true
    },
    respectBusinessHours: {
      type: Boolean,
      default: false
    },
    businessHours: {
      start: String,
      end: String,
      timezone: String,
      daysOfWeek: [Number]
    },
    recurring: {
      frequency: {
        type: String,
        enum: ['daily', 'weekly', 'monthly']
      },
      interval: {
        type: Number,
        min: 1
      },
      endDate: Date,
      maxOccurrences: {
        type: Number,
        min: 1
      },
      currentOccurrence: {
        type: Number,
        default: 1
      }
    },
    metadata: Schema.Types.Mixed,
    processedAt: Date,
    failedAt: Date,
    failureReason: String,
    nextRun: Date
  },
  {
    timestamps: true
  }
);

// Indexes
scheduledCallSchema.index({ callLogId: 1 });
scheduledCallSchema.index({ userId: 1, status: 1 });
scheduledCallSchema.index({ agentId: 1, scheduledFor: 1 });
scheduledCallSchema.index({ scheduledFor: 1, status: 1 });
scheduledCallSchema.index({ status: 1, scheduledFor: 1 });
scheduledCallSchema.index({ status: 1, createdAt: -1 });

// Virtual fields
scheduledCallSchema.virtual('isPending').get(function(this: IScheduledCall) {
  return this.status === 'pending';
});

scheduledCallSchema.virtual('isRecurring').get(function(this: IScheduledCall) {
  return this.recurring != null;
});

scheduledCallSchema.virtual('canCancel').get(function(this: IScheduledCall) {
  return this.status === 'pending';
});

// Methods
scheduledCallSchema.methods.toJSON = function() {
  const obj = this.toObject();
  obj.isPending = this.isPending;
  obj.isRecurring = this.isRecurring;
  obj.canCancel = this.canCancel;
  return obj;
};

export const ScheduledCall = mongoose.model<IScheduledCall>('ScheduledCall', scheduledCallSchema);
