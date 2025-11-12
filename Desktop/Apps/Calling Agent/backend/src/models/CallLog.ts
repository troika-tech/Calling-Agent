import mongoose, { Document, Schema } from 'mongoose';

export interface ICallLog extends Document {
  sessionId: string;
  userId: mongoose.Types.ObjectId;
  phoneId?: mongoose.Types.ObjectId;
  agentId?: mongoose.Types.ObjectId;
  campaignId?: mongoose.Types.ObjectId;  // Campaign association for concurrent tracking
  fromPhone: string;
  toPhone: string;
  direction: 'inbound' | 'outbound';
  status: 'initiated' | 'ringing' | 'in-progress' | 'completed' | 'failed' | 'no-answer' | 'busy' | 'canceled' | 'user-ended' | 'agent-ended';

  // Outbound-specific fields
  outboundStatus?: 'queued' | 'ringing' | 'connected' | 'no_answer' | 'busy' | 'voicemail';
  scheduledFor?: Date;
  initiatedAt?: Date;
  retryCount: number;
  retryOf?: mongoose.Types.ObjectId;
  failureReason?: 'no_answer' | 'busy' | 'voicemail' | 'invalid_number' | 'network_error' | 'cancelled';

  startedAt?: Date;
  endedAt?: Date;
  durationSec?: number;
  transcript?: Array<{
    speaker: string;
    text: string;
    timestamp: Date;
    language?: string;  // Detected or configured language for this transcript entry
  }>;
  // Language tracking
  configuredLanguage?: string;  // Original configured language
  detectedLanguages?: string[];  // All languages detected during the call
  primaryLanguage?: string;  // Most frequently used language
  languageSwitches?: Array<{
    timestamp: Date;
    fromLanguage: string;
    toLanguage: string;
    confidence: number;
  }>;
  summary?: string;
  recordingUrl?: string;
  exotelCallSid?: string;
  costBreakdown?: {
    stt: number;
    llm: number;
    tts: number;
    telephony: number;
    total: number;
  };
  metadata?: Record<string, any>;
  error?: {
    code: string;
    message: string;
  };
  createdAt: Date;
  updatedAt: Date;
}

const callLogSchema = new Schema<ICallLog>(
  {
    sessionId: {
      type: String,
      required: true,
      unique: true
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    phoneId: {
      type: Schema.Types.ObjectId,
      ref: 'Phone'
    },
    agentId: {
      type: Schema.Types.ObjectId,
      ref: 'Agent'
    },
    campaignId: {
      type: Schema.Types.ObjectId,
      ref: 'Campaign'
    },
    fromPhone: {
      type: String,
      required: true
    },
    toPhone: {
      type: String,
      required: true
    },
    direction: {
      type: String,
      required: true,
      enum: ['inbound', 'outbound']
    },
    status: {
      type: String,
      required: true,
      enum: ['initiated', 'ringing', 'in-progress', 'completed', 'failed', 'no-answer', 'busy', 'canceled', 'user-ended', 'agent-ended'],
      default: 'initiated'
    },

    // Outbound-specific fields
    outboundStatus: {
      type: String,
      enum: ['queued', 'ringing', 'connected', 'no_answer', 'busy', 'voicemail']
    },
    scheduledFor: Date,
    initiatedAt: Date,
    retryCount: {
      type: Number,
      default: 0
    },
    retryOf: {
      type: Schema.Types.ObjectId,
      ref: 'CallLog'
    },
    failureReason: {
      type: String,
      enum: ['no_answer', 'busy', 'voicemail', 'invalid_number', 'network_error', 'cancelled']
    },

    startedAt: Date,
    endedAt: Date,
    durationSec: {
      type: Number,
      min: 0
    },
    transcript: [{
      speaker: {
        type: String,
        required: true
      },
      text: {
        type: String,
        required: true
      },
      timestamp: {
        type: Date,
        required: true
      },
      language: String  // Detected or configured language for this entry
    }],
    // Language tracking fields
    configuredLanguage: String,
    detectedLanguages: [String],
    primaryLanguage: String,
    languageSwitches: [{
      timestamp: Date,
      fromLanguage: String,
      toLanguage: String,
      confidence: Number
    }],
    summary: String,
    recordingUrl: String,
    exotelCallSid: String,
    costBreakdown: {
      stt: Number,
      llm: Number,
      tts: Number,
      telephony: Number,
      total: Number
    },
    metadata: Schema.Types.Mixed,
    error: {
      code: String,
      message: String
    }
  },
  {
    timestamps: true
  }
);

// Indexes
callLogSchema.index({ sessionId: 1 }, { unique: true });
callLogSchema.index({ userId: 1, createdAt: -1 });
callLogSchema.index({ phoneId: 1, createdAt: -1 });
callLogSchema.index({ agentId: 1, createdAt: -1 });
callLogSchema.index({ status: 1, createdAt: -1 });
callLogSchema.index({ direction: 1, createdAt: -1 });
callLogSchema.index({ fromPhone: 1 });
callLogSchema.index({ toPhone: 1 });
callLogSchema.index({ exotelCallSid: 1 });
callLogSchema.index({ startedAt: -1, endedAt: -1 });

// Outbound-specific indexes
callLogSchema.index({ direction: 1, status: 1 });
callLogSchema.index({ direction: 1, status: 1, createdAt: -1 });
callLogSchema.index({ scheduledFor: 1, status: 1 });
callLogSchema.index({ retryOf: 1 });
callLogSchema.index({ 'metadata.campaignId': 1 });
callLogSchema.index({ 'metadata.batchId': 1 });

// Voicemail detection indexes
callLogSchema.index({ failureReason: 1, createdAt: -1 });
callLogSchema.index({ outboundStatus: 1, createdAt: -1 });
callLogSchema.index({ 'metadata.voicemailDetected': 1 });

// Pre-save hook to calculate duration if not set
callLogSchema.pre('save', function(next) {
  // If durationSec is not set but we have startedAt and endedAt, calculate it
  if (!this.durationSec && this.startedAt && this.endedAt) {
    const durationMs = this.endedAt.getTime() - this.startedAt.getTime();
    if (durationMs > 0) {
      this.durationSec = Math.floor(durationMs / 1000);
    }
  }
  next();
});

// Method to calculate duration on existing documents
callLogSchema.methods.calculateDuration = function() {
  if (!this.durationSec && this.startedAt && this.endedAt) {
    const durationMs = this.endedAt.getTime() - this.startedAt.getTime();
    if (durationMs > 0) {
      this.durationSec = Math.floor(durationMs / 1000);
    }
  }
  return this.durationSec;
};

export const CallLog = mongoose.model<ICallLog>('CallLog', callLogSchema);
