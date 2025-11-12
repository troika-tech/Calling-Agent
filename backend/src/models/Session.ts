import mongoose, { Document, Schema } from 'mongoose';

export interface ISession extends Document {
  sessionId: string;
  userId: mongoose.Types.ObjectId;
  agentId: mongoose.Types.ObjectId;
  callLogId: mongoose.Types.ObjectId;
  userPhone: string;
  agentPhone: string;
  agentConfig: Record<string, any>;
  conversationHistory: Array<{
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: Date;
  }>;
  status: 'active' | 'ended';
  metadata?: Record<string, any>;
  exotelCallSid?: string;
  startedAt: Date;
  lastActivityAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const sessionSchema = new Schema<ISession>(
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
    agentId: {
      type: Schema.Types.ObjectId,
      ref: 'Agent',
      required: true
    },
    callLogId: {
      type: Schema.Types.ObjectId,
      ref: 'CallLog',
      required: true
    },
    userPhone: {
      type: String,
      required: true
    },
    agentPhone: {
      type: String,
      required: true
    },
    agentConfig: {
      type: Schema.Types.Mixed,
      required: true
    },
    conversationHistory: [
      {
        role: {
          type: String,
          enum: ['user', 'assistant', 'system'],
          required: true
        },
        content: {
          type: String,
          required: true
        },
        timestamp: {
          type: Date,
          default: Date.now
        }
      }
    ],
    status: {
      type: String,
      enum: ['active', 'ended'],
      default: 'active'
    },
    metadata: Schema.Types.Mixed,
    exotelCallSid: String,
    startedAt: {
      type: Date,
      default: Date.now
    },
    lastActivityAt: {
      type: Date,
      default: Date.now
    }
  },
  {
    timestamps: true
  }
);

// Indexes
sessionSchema.index({ sessionId: 1 }, { unique: true });
sessionSchema.index({ userId: 1, status: 1 });
sessionSchema.index({ status: 1, lastActivityAt: -1 });
sessionSchema.index({ exotelCallSid: 1 });

// TTL index to auto-delete old ended sessions after 24 hours
sessionSchema.index(
  { updatedAt: 1 },
  {
    expireAfterSeconds: 86400,
    partialFilterExpression: { status: 'ended' }
  }
);

export const Session = mongoose.model<ISession>('Session', sessionSchema);
