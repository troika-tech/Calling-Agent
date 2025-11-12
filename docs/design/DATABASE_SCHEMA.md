# Database Schema Design - Outbound Calls

**Version**: 1.0
**Last Updated**: 2025-11-01
**Status**: Draft

---

## Overview

This document defines the database schema changes required for the outbound calling system. We're using MongoDB, so schemas are defined using Mongoose.

---

## Schema Changes

### 1. CallLog Model (UPDATED)

**File**: `backend/src/models/CallLog.ts`

**Changes**: Add outbound-specific fields to existing model

```typescript
import mongoose, { Document, Schema } from 'mongoose';

interface ICallLog extends Document {
  // ========== EXISTING FIELDS ==========
  phoneNumber: string;
  agentId: mongoose.Types.ObjectId;
  status: 'initiated' | 'ringing' | 'in-progress' | 'completed' | 'failed' | 'cancelled';
  transcript: Array<{
    speaker: 'user' | 'assistant';
    text: string;
    timestamp: Date;
  }>;
  startedAt?: Date;
  endedAt?: Date;
  duration?: number;  // seconds

  // ========== NEW FIELDS FOR OUTBOUND ==========
  direction: 'inbound' | 'outbound';
  outboundStatus?: 'queued' | 'ringing' | 'connected' | 'no_answer' | 'busy' | 'voicemail';
  scheduledFor?: Date;
  initiatedAt?: Date;
  retryCount: number;
  retryOf?: mongoose.Types.ObjectId;  // Reference to original call if retry
  failureReason?: 'no_answer' | 'busy' | 'voicemail' | 'invalid_number' | 'network_error' | 'cancelled';
  exotelCallSid?: string;
  recordingUrl?: string;
  metadata?: {
    campaignId?: string;
    customerId?: string;
    leadId?: string;
    batchId?: string;
    priority?: 'low' | 'medium' | 'high';
    voicemailLeft?: boolean;
    successfulRetryId?: string;
    maxRetriesReached?: boolean;
    [key: string]: any;
  };

  createdAt: Date;
  updatedAt: Date;
}

const CallLogSchema = new Schema<ICallLog>({
  // ========== EXISTING FIELDS ==========
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
  agentId: {
    type: Schema.Types.ObjectId,
    ref: 'Agent',
    required: true,
    index: true
  },
  status: {
    type: String,
    enum: ['initiated', 'ringing', 'in-progress', 'completed', 'failed', 'cancelled'],
    required: true,
    default: 'initiated',
    index: true
  },
  transcript: [{
    speaker: {
      type: String,
      enum: ['user', 'assistant'],
      required: true
    },
    text: {
      type: String,
      required: true
    },
    timestamp: {
      type: Date,
      required: true
    }
  }],
  startedAt: Date,
  endedAt: Date,
  duration: Number,

  // ========== NEW FIELDS ==========
  direction: {
    type: String,
    enum: ['inbound', 'outbound'],
    required: true,
    default: 'inbound',
    index: true
  },
  outboundStatus: {
    type: String,
    enum: ['queued', 'ringing', 'connected', 'no_answer', 'busy', 'voicemail']
  },
  scheduledFor: {
    type: Date,
    index: true
  },
  initiatedAt: Date,
  retryCount: {
    type: Number,
    default: 0
  },
  retryOf: {
    type: Schema.Types.ObjectId,
    ref: 'CallLog',
    index: true
  },
  failureReason: {
    type: String,
    enum: ['no_answer', 'busy', 'voicemail', 'invalid_number', 'network_error', 'cancelled']
  },
  exotelCallSid: {
    type: String,
    unique: true,
    sparse: true,
    index: true
  },
  recordingUrl: String,
  metadata: {
    type: Schema.Types.Mixed,
    default: {}
  }
}, {
  timestamps: true
});

// ========== INDEXES ==========
CallLogSchema.index({ direction: 1, status: 1 });
CallLogSchema.index({ direction: 1, status: 1, createdAt: -1 });
CallLogSchema.index({ agentId: 1, direction: 1, createdAt: -1 });
CallLogSchema.index({ scheduledFor: 1, status: 1 });
CallLogSchema.index({ 'metadata.campaignId': 1 });
CallLogSchema.index({ 'metadata.batchId': 1 });
CallLogSchema.index({ exotelCallSid: 1 });
CallLogSchema.index({ phoneNumber: 1, createdAt: -1 });

// ========== VIRTUAL FIELDS ==========
CallLogSchema.virtual('isRetry').get(function() {
  return this.retryOf != null;
});

CallLogSchema.virtual('canCancel').get(function() {
  return ['initiated', 'queued', 'ringing'].includes(this.status);
});

CallLogSchema.virtual('canRetry').get(function() {
  return this.status === 'failed' && this.retryCount < 3;
});

// ========== METHODS ==========
CallLogSchema.methods.toJSON = function() {
  const obj = this.toObject();
  obj.isRetry = this.isRetry;
  obj.canCancel = this.canCancel;
  obj.canRetry = this.canRetry;
  return obj;
};

export const CallLog = mongoose.model<ICallLog>('CallLog', CallLogSchema);
```

---

### 2. ScheduledCall Model (NEW)

**File**: `backend/src/models/ScheduledCall.ts`

```typescript
import mongoose, { Document, Schema } from 'mongoose';

interface IScheduledCall extends Document {
  callLogId: mongoose.Types.ObjectId;
  phoneNumber: string;
  agentId: mongoose.Types.ObjectId;
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

  metadata?: any;

  // Processing metadata
  processedAt?: Date;
  failedAt?: Date;
  failureReason?: string;
  nextRun?: Date;  // For recurring calls

  createdAt: Date;
  updatedAt: Date;
}

const ScheduledCallSchema = new Schema<IScheduledCall>({
  callLogId: {
    type: Schema.Types.ObjectId,
    ref: 'CallLog',
    required: true,
    index: true
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
  agentId: {
    type: Schema.Types.ObjectId,
    ref: 'Agent',
    required: true,
    index: true
  },
  scheduledFor: {
    type: Date,
    required: true,
    index: true
  },
  timezone: {
    type: String,
    default: 'UTC'
  },
  status: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'cancelled', 'failed'],
    default: 'pending',
    index: true
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
}, {
  timestamps: true
});

// ========== INDEXES ==========
ScheduledCallSchema.index({ scheduledFor: 1, status: 1 });
ScheduledCallSchema.index({ status: 1, scheduledFor: 1 });
ScheduledCallSchema.index({ agentId: 1, scheduledFor: 1 });
ScheduledCallSchema.index({ status: 1, createdAt: -1 });

// ========== VIRTUAL FIELDS ==========
ScheduledCallSchema.virtual('isPending').get(function() {
  return this.status === 'pending';
});

ScheduledCallSchema.virtual('isRecurring').get(function() {
  return this.recurring != null;
});

ScheduledCallSchema.virtual('canCancel').get(function() {
  return this.status === 'pending';
});

// ========== METHODS ==========
ScheduledCallSchema.methods.toJSON = function() {
  const obj = this.toObject();
  obj.isPending = this.isPending;
  obj.isRecurring = this.isRecurring;
  obj.canCancel = this.canCancel;
  return obj;
};

export const ScheduledCall = mongoose.model<IScheduledCall>('ScheduledCall', ScheduledCallSchema);
```

---

### 3. RetryAttempt Model (NEW)

**File**: `backend/src/models/RetryAttempt.ts`

```typescript
import mongoose, { Document, Schema } from 'mongoose';

interface IRetryAttempt extends Document {
  originalCallLogId: mongoose.Types.ObjectId;
  retryCallLogId?: mongoose.Types.ObjectId;
  attemptNumber: number;
  scheduledFor: Date;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  failureReason: string;
  processedAt?: Date;
  metadata?: any;

  createdAt: Date;
  updatedAt: Date;
}

const RetryAttemptSchema = new Schema<IRetryAttempt>({
  originalCallLogId: {
    type: Schema.Types.ObjectId,
    ref: 'CallLog',
    required: true,
    index: true
  },
  retryCallLogId: {
    type: Schema.Types.ObjectId,
    ref: 'CallLog',
    index: true
  },
  attemptNumber: {
    type: Number,
    required: true,
    min: 1
  },
  scheduledFor: {
    type: Date,
    required: true,
    index: true
  },
  status: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'failed', 'cancelled'],
    default: 'pending',
    required: true,
    index: true
  },
  failureReason: {
    type: String,
    required: true,
    enum: ['no_answer', 'busy', 'voicemail', 'invalid_number', 'network_error', 'rate_limited', 'api_unavailable']
  },
  processedAt: Date,
  metadata: Schema.Types.Mixed
}, {
  timestamps: true
});

// ========== INDEXES ==========
RetryAttemptSchema.index({ originalCallLogId: 1, attemptNumber: 1 }, { unique: true });
RetryAttemptSchema.index({ scheduledFor: 1, status: 1 });
RetryAttemptSchema.index({ status: 1, scheduledFor: 1 });

// ========== VIRTUAL FIELDS ==========
RetryAttemptSchema.virtual('isPending').get(function() {
  return this.status === 'pending';
});

RetryAttemptSchema.virtual('isProcessed').get(function() {
  return ['completed', 'failed', 'cancelled'].includes(this.status);
});

// ========== METHODS ==========
RetryAttemptSchema.methods.toJSON = function() {
  const obj = this.toObject();
  obj.isPending = this.isPending;
  obj.isProcessed = this.isProcessed;
  return obj;
};

export const RetryAttempt = mongoose.model<IRetryAttempt>('RetryAttempt', RetryAttemptSchema);
```

---

### 4. Agent Model (UPDATED)

**File**: `backend/src/models/Agent.ts`

**Changes**: Add outbound-specific configuration

```typescript
// Add to existing IAgent interface
interface IAgent extends Document {
  // ... existing fields ...

  config: {
    // ... existing config fields ...

    // NEW: Outbound-specific settings
    outboundGreeting?: string;
    outboundNoResponsePrompt?: string;
    outboundGoodbyeMessage?: string;
    voicemailMessage?: string;
    maxCallDuration?: number;  // seconds, default 600
    callbackNumber?: string;   // For voicemail message
  };
}

// Update schema
const AgentSchema = new Schema<IAgent>({
  // ... existing fields ...

  config: {
    // ... existing config fields ...

    outboundGreeting: {
      type: String,
      default: 'Hello! This is {agentName}. How can I help you today?'
    },
    outboundNoResponsePrompt: {
      type: String,
      default: 'Hello? Are you there?'
    },
    outboundGoodbyeMessage: {
      type: String,
      default: 'Thank you for your time. Goodbye!'
    },
    voicemailMessage: {
      type: String,
      default: 'Hello, this is {agentName} from {company}. Please call us back at {callbackNumber}. Thank you!'
    },
    maxCallDuration: {
      type: Number,
      default: 600,  // 10 minutes
      min: 60,
      max: 3600
    },
    callbackNumber: String
  }
});
```

---

## Migration Scripts

### Migration 001: Add Outbound Fields to CallLog

**File**: `backend/src/migrations/001_add_outbound_fields.ts`

```typescript
import mongoose from 'mongoose';
import { CallLog } from '../models/CallLog';

export async function up() {
  console.log('Running migration: Add outbound fields to CallLog');

  // Add direction field (default to 'inbound' for existing records)
  await CallLog.updateMany(
    { direction: { $exists: false } },
    { $set: { direction: 'inbound', retryCount: 0 } }
  );

  // Create new indexes
  await CallLog.collection.createIndex({ direction: 1, status: 1 });
  await CallLog.collection.createIndex({ direction: 1, status: 1, createdAt: -1 });
  await CallLog.collection.createIndex({ scheduledFor: 1, status: 1 });
  await CallLog.collection.createIndex({ 'metadata.campaignId': 1 });
  await CallLog.collection.createIndex({ 'metadata.batchId': 1 });
  await CallLog.collection.createIndex({ exotelCallSid: 1 }, { unique: true, sparse: true });

  console.log('Migration completed successfully');
}

export async function down() {
  console.log('Rolling back migration: Add outbound fields to CallLog');

  // Remove direction field
  await CallLog.updateMany(
    {},
    { $unset: { direction: '', outboundStatus: '', scheduledFor: '', initiatedAt: '', retryCount: '', retryOf: '', failureReason: '', exotelCallSid: '', recordingUrl: '' } }
  );

  // Drop new indexes
  await CallLog.collection.dropIndex({ direction: 1, status: 1 });
  await CallLog.collection.dropIndex({ direction: 1, status: 1, createdAt: -1 });
  await CallLog.collection.dropIndex({ scheduledFor: 1, status: 1 });
  await CallLog.collection.dropIndex({ 'metadata.campaignId': 1 });
  await CallLog.collection.dropIndex({ 'metadata.batchId': 1 });
  await CallLog.collection.dropIndex({ exotelCallSid: 1 });

  console.log('Rollback completed successfully');
}
```

---

## Index Analysis

### CallLog Indexes

| Index | Type | Purpose | Estimated Size |
|-------|------|---------|----------------|
| `_id` | Primary | Default MongoDB ID | Auto |
| `agentId` | Single | Filter by agent | ~1MB per 100K docs |
| `status` | Single | Filter by status | ~500KB per 100K docs |
| `direction, status` | Compound | Filter outbound/inbound by status | ~1MB per 100K docs |
| `direction, status, createdAt` | Compound | Sorted list of calls | ~1.5MB per 100K docs |
| `agentId, direction, createdAt` | Compound | Agent's calls sorted | ~1.5MB per 100K docs |
| `scheduledFor, status` | Compound | Find scheduled calls | ~1MB per 100K docs |
| `metadata.campaignId` | Single | Filter by campaign | ~500KB per 100K docs |
| `metadata.batchId` | Single | Filter by batch | ~500KB per 100K docs |
| `exotelCallSid` | Unique | Lookup by Exotel ID | ~1MB per 100K docs |
| `phoneNumber, createdAt` | Compound | Call history for number | ~1MB per 100K docs |
| `retryOf` | Single | Find retry calls | ~500KB per 100K docs |

**Total Index Size Estimate**: ~10MB per 100K documents

### ScheduledCall Indexes

| Index | Type | Purpose | Estimated Size |
|-------|------|---------|----------------|
| `_id` | Primary | Default MongoDB ID | Auto |
| `callLogId` | Single | Reference to CallLog | ~500KB per 100K docs |
| `agentId` | Single | Filter by agent | ~500KB per 100K docs |
| `scheduledFor` | Single | Time-based queries | ~500KB per 100K docs |
| `status` | Single | Filter by status | ~500KB per 100K docs |
| `scheduledFor, status` | Compound | Find pending scheduled | ~1MB per 100K docs |
| `status, scheduledFor` | Compound | Process queue | ~1MB per 100K docs |
| `agentId, scheduledFor` | Compound | Agent's schedule | ~1MB per 100K docs |
| `status, createdAt` | Compound | Recently created | ~1MB per 100K docs |

**Total Index Size Estimate**: ~6.5MB per 100K documents

### RetryAttempt Indexes

| Index | Type | Purpose | Estimated Size |
|-------|------|---------|----------------|
| `_id` | Primary | Default MongoDB ID | Auto |
| `originalCallLogId, attemptNumber` | Compound Unique | Prevent duplicates | ~1MB per 100K docs |
| `scheduledFor, status` | Compound | Find pending retries | ~1MB per 100K docs |
| `status, scheduledFor` | Compound | Process queue | ~1MB per 100K docs |
| `retryCallLogId` | Single | Lookup retry call | ~500KB per 100K docs |
| `originalCallLogId` | Single | Find all retries | ~500KB per 100K docs |

**Total Index Size Estimate**: ~4MB per 100K documents

---

## Data Size Estimates

### Average Document Sizes

**CallLog** (with transcript):
- Minimal: ~500 bytes
- Average: ~2KB (5-minute call, 10 exchanges)
- Large: ~10KB (long call with many exchanges)

**ScheduledCall**:
- Average: ~300 bytes

**RetryAttempt**:
- Average: ~200 bytes

### Storage Projections

**For 100,000 calls/month**:
- CallLogs: 100K × 2KB = 200MB
- Indexes: ~10MB
- ScheduledCalls (20% scheduled): 20K × 300 bytes = 6MB
- RetryAttempts (30% need retry, avg 2 attempts): 60K × 200 bytes = 12MB

**Total per month**: ~230MB

**For 1 million calls/month**:
- CallLogs: 1M × 2KB = 2GB
- Indexes: ~100MB
- ScheduledCalls: 200K × 300 bytes = 60MB
- RetryAttempts: 600K × 200 bytes = 120MB

**Total per month**: ~2.3GB

**Retention Strategy**:
- Keep detailed data for 6 months
- Archive to cold storage after 6 months
- Keep summary stats forever

---

## Query Patterns

### Most Common Queries

1. **Get recent outbound calls** (Dashboard):
```javascript
CallLog.find({
  direction: 'outbound',
  createdAt: { $gte: startDate }
})
.sort({ createdAt: -1 })
.limit(50);
```
Index: `direction_1_status_1_createdAt_-1`

2. **Get pending scheduled calls** (Queue processor):
```javascript
ScheduledCall.find({
  status: 'pending',
  scheduledFor: { $lte: new Date() }
})
.sort({ scheduledFor: 1 })
.limit(10);
```
Index: `status_1_scheduledFor_1`

3. **Get retry history** (API):
```javascript
RetryAttempt.find({
  originalCallLogId: callId
})
.sort({ attemptNumber: 1 });
```
Index: `originalCallLogId_1_attemptNumber_1`

4. **Get batch progress** (API):
```javascript
CallLog.aggregate([
  { $match: { 'metadata.batchId': batchId } },
  { $group: {
    _id: '$status',
    count: { $sum: 1 }
  }}
]);
```
Index: `metadata.batchId_1`

5. **Get stats** (Analytics):
```javascript
CallLog.aggregate([
  {
    $match: {
      direction: 'outbound',
      createdAt: { $gte: startDate, $lte: endDate }
    }
  },
  {
    $group: {
      _id: '$status',
      count: { $sum: 1 },
      avgDuration: { $avg: '$duration' }
    }
  }
]);
```
Index: `direction_1_status_1_createdAt_-1`

---

## Performance Considerations

### Write Performance

**Expected Write Rate**:
- 10 concurrent calls = ~20 writes/sec (call start + end)
- 20 concurrent calls = ~40 writes/sec
- 50 concurrent calls = ~100 writes/sec

**Optimization**:
- Use bulk inserts for batch operations
- Avoid updating all fields (use `$set` with specific fields)
- Use upsert for idempotent operations

### Read Performance

**Expected Read Rate**:
- Dashboard polling (5s interval) = 0.2 reads/sec per user
- API calls = variable
- Queue processing = 1-10 reads/sec

**Optimization**:
- Use projection to fetch only needed fields
- Use `.lean()` for read-only queries (no Mongoose overhead)
- Cache frequently accessed data (Redis)

### Index Maintenance

**Considerations**:
- Indexes slow down writes (~10-20% overhead)
- Keep indexes selective (high cardinality)
- Monitor index usage with `db.collection.stats()`
- Drop unused indexes

---

## Backup & Recovery

### Backup Strategy

**Daily Backups**:
- Full database snapshot at 2 AM UTC
- Retention: 7 daily backups

**Point-in-Time Recovery**:
- MongoDB Oplog enabled
- Can restore to any point within last 24 hours

**Testing**:
- Monthly restore drill
- Document restore procedure

### Disaster Recovery

**RTO** (Recovery Time Objective): 1 hour
**RPO** (Recovery Point Objective): 1 hour (max data loss)

**Procedure**:
1. Identify failure (monitoring alerts)
2. Switch to backup MongoDB instance
3. Restore from latest snapshot
4. Replay oplog to recover recent data
5. Update application connection string
6. Verify data integrity
7. Resume operations

---

**Document Status**: Draft - Ready for Review
**Next Steps**: Review schema design, create migration scripts, test in development
