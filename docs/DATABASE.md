# Database Schema Documentation

## Table of Contents
- [Overview](#overview)
- [Collections](#collections)
  - [Users](#users-collection)
  - [Agents](#agents-collection)
  - [Phones](#phones-collection)
  - [CallLogs](#calllogs-collection)
  - [Sessions](#sessions-collection)
- [Indexes](#indexes)
- [Relationships](#relationships)
- [Redis Cache Structure](#redis-cache-structure)
- [Data Migration](#data-migration)
- [Backup Strategy](#backup-strategy)

## Overview

The platform uses MongoDB as the primary database for persistent storage and Redis for caching and real-time session management.

### Database: `ai-calling-platform`

**MongoDB Version:** 7.0+
**Default Port:** 27017

### Connection String

```
mongodb://localhost:27017/ai-calling-platform
```

**Production (with authentication):**
```
mongodb://username:password@host:27017/ai-calling-platform?authSource=admin
```

---

## Collections

### Users Collection

Stores user account information and credentials.

**Collection Name:** `users`

#### Schema

```typescript
interface IUser {
  _id: ObjectId;
  email: string;              // Unique, indexed
  password: string;           // Bcrypt hashed
  name: string;
  role: 'user' | 'admin';
  credits: number;            // Available calling credits
  exotelConfig?: {
    apiKey: string;
    apiToken: string;         // Encrypted
    sid: string;
    subdomain: string;
  };
  isActive: boolean;
  lastLoginAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}
```

#### Example Document

```json
{
  "_id": ObjectId("64f8a1b2c3d4e5f6a7b8c9d0"),
  "email": "user@example.com",
  "password": "$2b$10$abcdefghijklmnopqrstuvwxyz...",
  "name": "John Doe",
  "role": "user",
  "credits": 100.50,
  "exotelConfig": {
    "apiKey": "EXxxxxxxxxxx",
    "apiToken": "encrypted_token_here",
    "sid": "your-sid",
    "subdomain": "your-subdomain"
  },
  "isActive": true,
  "lastLoginAt": ISODate("2024-01-20T14:30:00.000Z"),
  "createdAt": ISODate("2024-01-15T10:30:00.000Z"),
  "updatedAt": ISODate("2024-01-20T14:30:00.000Z")
}
```

#### Indexes

```javascript
db.users.createIndex({ email: 1 }, { unique: true });
db.users.createIndex({ createdAt: -1 });
db.users.createIndex({ isActive: 1 });
```

#### Validation Rules

- `email`: Valid email format, required, unique
- `password`: Required, hashed with bcrypt (min 8 characters before hashing)
- `name`: Required, 1-100 characters
- `role`: Enum ['user', 'admin'], default: 'user'
- `credits`: Number >= 0, default: 0

---

### Agents Collection

Stores AI agent configurations.

**Collection Name:** `agents`

#### Schema

```typescript
interface IAgent {
  _id: ObjectId;
  userId: ObjectId;           // Reference to users collection
  name: string;
  config: {
    prompt: string;           // System prompt for the agent
    voice: {
      provider: 'openai' | 'elevenlabs' | 'cartesia';
      voiceId: string;
      model?: string;
      settings?: Record<string, any>;
    };
    language: string;         // ISO language code (e.g., 'en', 'es')
    llm: {
      model: 'gpt-4' | 'gpt-3.5-turbo' | 'gpt-4-turbo';
      temperature: number;    // 0-2
      maxTokens?: number;
    };
    firstMessage?: string;    // Initial greeting
    sessionTimeout?: number;  // Seconds
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
```

#### Example Document

```json
{
  "_id": ObjectId("64f8a1b2c3d4e5f6a7b8c9d1"),
  "userId": ObjectId("64f8a1b2c3d4e5f6a7b8c9d0"),
  "name": "Customer Support Agent",
  "config": {
    "prompt": "You are a helpful customer support agent for XYZ Company...",
    "voice": {
      "provider": "elevenlabs",
      "voiceId": "21m00Tcm4TlvDq8ikWAM",
      "model": "eleven_turbo_v2"
    },
    "language": "en",
    "llm": {
      "model": "gpt-4",
      "temperature": 0.7,
      "maxTokens": 500
    },
    "firstMessage": "Hello! How can I help you today?",
    "sessionTimeout": 300,
    "flow": {
      "userStartFirst": false,
      "interruption": {
        "allowed": true
      },
      "responseDelay": 500
    }
  },
  "isActive": true,
  "stats": {
    "totalCalls": 150,
    "totalDuration": 45000,
    "avgDuration": 300,
    "successRate": 0.92
  },
  "createdAt": ISODate("2024-01-15T10:30:00.000Z"),
  "updatedAt": ISODate("2024-01-20T14:30:00.000Z")
}
```

#### Indexes

```javascript
db.agents.createIndex({ userId: 1, createdAt: -1 });
db.agents.createIndex({ userId: 1, isActive: 1 });
db.agents.createIndex({ name: 'text' }); // Text search
```

#### Validation Rules

- `name`: Required, 1-100 characters
- `config.prompt`: Required, 10-5000 characters
- `config.voice.provider`: Required, enum
- `config.voice.voiceId`: Required
- `config.language`: Required, valid ISO language code
- `config.llm.temperature`: 0-2
- `config.llm.model`: Required, enum

---

### Phones Collection

Stores phone number information and agent assignments.

**Collection Name:** `phones`

#### Schema

```typescript
interface IPhone {
  _id: ObjectId;
  userId: ObjectId;           // Reference to users collection
  number: string;             // E.164 format (e.g., +919876543210)
  country: string;            // ISO country code
  provider: 'exotel';
  agentId?: ObjectId;         // Reference to agents collection
  tags: string[];
  status: 'active' | 'inactive';
  exotelData?: {
    sid: string;
    appId?: string;
  };
  agentConfigOverride?: Partial<IAgent['config']>; // Override agent config
  createdAt: Date;
  updatedAt: Date;
}
```

#### Example Document

```json
{
  "_id": ObjectId("64f8a1b2c3d4e5f6a7b8c9d2"),
  "userId": ObjectId("64f8a1b2c3d4e5f6a7b8c9d0"),
  "number": "+919876543210",
  "country": "IN",
  "provider": "exotel",
  "agentId": ObjectId("64f8a1b2c3d4e5f6a7b8c9d1"),
  "tags": ["sales", "inbound", "priority"],
  "status": "active",
  "exotelData": {
    "sid": "EX123456",
    "appId": "APP123"
  },
  "agentConfigOverride": {
    "firstMessage": "Thank you for calling! How may I assist you?"
  },
  "createdAt": ISODate("2024-01-15T10:30:00.000Z"),
  "updatedAt": ISODate("2024-01-20T14:30:00.000Z")
}
```

#### Indexes

```javascript
db.phones.createIndex({ number: 1 }, { unique: true });
db.phones.createIndex({ userId: 1, status: 1 });
db.phones.createIndex({ agentId: 1 });
db.phones.createIndex({ tags: 1 });
```

#### Validation Rules

- `number`: Required, unique, E.164 format
- `country`: Required, valid ISO country code
- `provider`: Required, enum ['exotel']
- `status`: Required, enum ['active', 'inactive']
- `tags`: Array of strings, max 10 tags

---

### CallLogs Collection

Stores call history and metadata.

**Collection Name:** `calllogs`

#### Schema

```typescript
interface ICallLog {
  _id: ObjectId;
  sessionId: string;          // Unique session identifier
  userId: ObjectId;           // Reference to users collection
  agentId: ObjectId;          // Reference to agents collection
  fromPhone: string;
  toPhone: string;
  direction: 'inbound' | 'outbound';
  status: 'initiated' | 'ringing' | 'in-progress' | 'completed' |
          'failed' | 'no-answer' | 'busy' | 'canceled' | 'user-ended' | 'agent-ended';
  startedAt?: Date;
  endedAt?: Date;
  durationSec?: number;
  transcript?: string;        // Full conversation transcript
  recordingUrl?: string;      // S3 URL
  exotelCallSid?: string;     // Exotel call ID
  costBreakdown?: {
    stt: number;
    llm: number;
    tts: number;
    telephony: number;
    total: number;
  };
  metadata?: Record<string, any>; // Custom metadata
  error?: {
    code: string;
    message: string;
  };
  createdAt: Date;
  updatedAt: Date;
}
```

#### Example Document

```json
{
  "_id": ObjectId("64f8a1b2c3d4e5f6a7b8c9d3"),
  "sessionId": "sess_abc123xyz",
  "userId": ObjectId("64f8a1b2c3d4e5f6a7b8c9d0"),
  "agentId": ObjectId("64f8a1b2c3d4e5f6a7b8c9d1"),
  "fromPhone": "+919876543210",
  "toPhone": "+919123456789",
  "direction": "outbound",
  "status": "completed",
  "startedAt": ISODate("2024-01-15T10:30:00.000Z"),
  "endedAt": ISODate("2024-01-15T10:35:30.000Z"),
  "durationSec": 330,
  "transcript": "User: Hello\nAgent: Hi! How can I help you today?\nUser: I need help with my order\n...",
  "recordingUrl": "https://s3.amazonaws.com/recordings/call_sess_abc123xyz.mp3",
  "exotelCallSid": "CA123456789",
  "costBreakdown": {
    "stt": 0.022,
    "llm": 0.045,
    "tts": 0.0002,
    "telephony": 0.03,
    "total": 0.0972
  },
  "metadata": {
    "customerName": "John Doe",
    "orderId": "ORD-12345",
    "department": "sales"
  },
  "createdAt": ISODate("2024-01-15T10:30:00.000Z"),
  "updatedAt": ISODate("2024-01-15T10:35:30.000Z")
}
```

#### Indexes

```javascript
db.calllogs.createIndex({ sessionId: 1 }, { unique: true });
db.calllogs.createIndex({ userId: 1, createdAt: -1 });
db.calllogs.createIndex({ agentId: 1, createdAt: -1 });
db.calllogs.createIndex({ status: 1, createdAt: -1 });
db.calllogs.createIndex({ direction: 1, createdAt: -1 });
db.calllogs.createIndex({ fromPhone: 1 });
db.calllogs.createIndex({ toPhone: 1 });
db.calllogs.createIndex({ exotelCallSid: 1 });
db.calllogs.createIndex({
  startedAt: -1,
  endedAt: -1
});
```

#### Validation Rules

- `sessionId`: Required, unique
- `direction`: Required, enum ['inbound', 'outbound']
- `status`: Required, enum (see schema)
- `durationSec`: Number >= 0
- `costBreakdown.total`: Number >= 0

---

### Sessions Collection

Stores active call session state (also cached in Redis).

**Collection Name:** `sessions`

#### Schema

```typescript
interface ISession {
  _id: ObjectId;
  sessionId: string;          // Unique session identifier
  userId: ObjectId;
  agentId: ObjectId;
  callLogId: ObjectId;        // Reference to calllogs collection
  userPhone: string;
  agentPhone: string;
  agentConfig: IAgent['config']; // Snapshot of config at call time
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
```

#### Example Document

```json
{
  "_id": ObjectId("64f8a1b2c3d4e5f6a7b8c9d4"),
  "sessionId": "sess_abc123xyz",
  "userId": ObjectId("64f8a1b2c3d4e5f6a7b8c9d0"),
  "agentId": ObjectId("64f8a1b2c3d4e5f6a7b8c9d1"),
  "callLogId": ObjectId("64f8a1b2c3d4e5f6a7b8c9d3"),
  "userPhone": "+919123456789",
  "agentPhone": "+919876543210",
  "agentConfig": {
    "prompt": "You are a helpful customer support agent...",
    "voice": { /* voice config */ },
    "llm": { /* llm config */ }
  },
  "conversationHistory": [
    {
      "role": "assistant",
      "content": "Hello! How can I help you today?",
      "timestamp": ISODate("2024-01-15T10:30:02.000Z")
    },
    {
      "role": "user",
      "content": "I need help with my order",
      "timestamp": ISODate("2024-01-15T10:30:10.000Z")
    },
    {
      "role": "assistant",
      "content": "I'd be happy to help you with your order. Can you provide me with your order number?",
      "timestamp": ISODate("2024-01-15T10:30:13.000Z")
    }
  ],
  "status": "active",
  "metadata": {
    "customerName": "John Doe",
    "orderId": "ORD-12345"
  },
  "exotelCallSid": "CA123456789",
  "startedAt": ISODate("2024-01-15T10:30:00.000Z"),
  "lastActivityAt": ISODate("2024-01-15T10:30:13.000Z"),
  "createdAt": ISODate("2024-01-15T10:30:00.000Z"),
  "updatedAt": ISODate("2024-01-15T10:30:13.000Z")
}
```

#### Indexes

```javascript
db.sessions.createIndex({ sessionId: 1 }, { unique: true });
db.sessions.createIndex({ userId: 1, status: 1 });
db.sessions.createIndex({ status: 1, lastActivityAt: -1 });
db.sessions.createIndex({ exotelCallSid: 1 });
// TTL index to auto-delete old ended sessions after 24 hours
db.sessions.createIndex(
  { updatedAt: 1 },
  { expireAfterSeconds: 86400, partialFilterExpression: { status: 'ended' } }
);
```

---

## Relationships

### Entity Relationship Diagram

```
┌──────────────┐
│    Users     │
│  (users)     │
└──────┬───────┘
       │
       │ 1:N
       │
       ├──────────────────┐
       │                  │
       ▼                  ▼
┌──────────────┐    ┌──────────────┐
│   Agents     │    │   Phones     │
│  (agents)    │    │  (phones)    │
└──────┬───────┘    └──────┬───────┘
       │                   │
       │ 1:N               │ 1:1 (optional)
       │                   │
       ▼                   ▼
┌──────────────────────────────────┐
│          Call Logs               │
│         (calllogs)               │
└──────────────┬───────────────────┘
               │
               │ 1:1
               │
               ▼
       ┌──────────────┐
       │   Sessions   │
       │  (sessions)  │
       └──────────────┘
```

### Relationship Details

**Users → Agents (1:N)**
- One user can create multiple agents
- Field: `agents.userId` references `users._id`

**Users → Phones (1:N)**
- One user can own multiple phone numbers
- Field: `phones.userId` references `users._id`

**Agents → Phones (1:N)**
- One agent can be assigned to multiple phones
- Field: `phones.agentId` references `agents._id`

**Users → CallLogs (1:N)**
- One user can have multiple call logs
- Field: `calllogs.userId` references `users._id`

**Agents → CallLogs (1:N)**
- One agent can handle multiple calls
- Field: `calllogs.agentId` references `agents._id`

**CallLogs → Sessions (1:1)**
- Each call log has one session
- Field: `sessions.callLogId` references `calllogs._id`

---

## Redis Cache Structure

Redis is used for caching and real-time data.

### Key Patterns

#### Session Cache
```
session:{sessionId}
```
**Value:** JSON string of session data
**TTL:** 3600 seconds (1 hour)

**Example:**
```
session:sess_abc123xyz
{
  "sessionId": "sess_abc123xyz",
  "userId": "64f8a1b2c3d4e5f6a7b8c9d0",
  "conversationHistory": [...],
  "status": "active"
}
```

#### User Token Cache
```
user:token:{userId}
```
**Value:** JWT token
**TTL:** 604800 seconds (7 days)

#### Rate Limit
```
ratelimit:{endpoint}:{userId}
```
**Value:** Request count
**TTL:** 900 seconds (15 minutes)

**Example:**
```
ratelimit:calls:outbound:64f8a1b2c3d4e5f6a7b8c9d0
Value: 8
```

#### API Response Cache
```
cache:api:{route}:{params}
```
**Value:** JSON response
**TTL:** 60-300 seconds (varies by endpoint)

**Example:**
```
cache:api:agents:list:64f8a1b2c3d4e5f6a7b8c9d0
```

---

## Data Migration

### Initial Setup

```javascript
// Run in MongoDB shell or using script

// Create database
use ai-calling-platform;

// Create collections with validation
db.createCollection('users', {
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['email', 'password', 'name', 'role'],
      properties: {
        email: {
          bsonType: 'string',
          pattern: '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$'
        },
        password: { bsonType: 'string' },
        name: { bsonType: 'string' },
        role: { enum: ['user', 'admin'] },
        credits: { bsonType: 'number', minimum: 0 }
      }
    }
  }
});

// Create indexes (see indexes section above)

// Create default admin user
db.users.insertOne({
  email: 'admin@example.com',
  password: '$2b$10$...', // Hash 'admin123'
  name: 'Admin User',
  role: 'admin',
  credits: 1000,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date()
});
```

### Migration Scripts

**Location:** `backend/src/migrations/`

```typescript
// Example migration: 001-add-agent-stats.ts
export const up = async () => {
  await Agent.updateMany(
    { stats: { $exists: false } },
    {
      $set: {
        stats: {
          totalCalls: 0,
          totalDuration: 0,
          avgDuration: 0,
          successRate: 0
        }
      }
    }
  );
};

export const down = async () => {
  await Agent.updateMany(
    {},
    { $unset: { stats: '' } }
  );
};
```

**Run migrations:**
```bash
npm run migrate
```

---

## Backup Strategy

### MongoDB Backup

**Automated daily backups using mongodump:**

```bash
#!/bin/bash
# backup.sh

DATE=$(date +%Y-%m-%d)
BACKUP_DIR="/backups/mongodb/$DATE"

mkdir -p $BACKUP_DIR

mongodump \
  --uri="mongodb://localhost:27017/ai-calling-platform" \
  --out=$BACKUP_DIR \
  --gzip

# Upload to S3
aws s3 sync $BACKUP_DIR s3://your-backup-bucket/mongodb/$DATE/

# Keep only last 30 days locally
find /backups/mongodb/* -mtime +30 -exec rm -rf {} \;
```

**Schedule with cron:**
```
0 2 * * * /path/to/backup.sh
```

### Redis Backup

**Enable RDB snapshots in redis.conf:**
```
save 900 1
save 300 10
save 60 10000
```

**Manual backup:**
```bash
redis-cli BGSAVE
cp /var/lib/redis/dump.rdb /backups/redis/dump-$(date +%Y-%m-%d).rdb
```

### Restore from Backup

**MongoDB:**
```bash
mongorestore \
  --uri="mongodb://localhost:27017" \
  --gzip \
  /backups/mongodb/2024-01-15/ai-calling-platform
```

**Redis:**
```bash
redis-cli SHUTDOWN
cp /backups/redis/dump-2024-01-15.rdb /var/lib/redis/dump.rdb
redis-server
```

---

## Database Maintenance

### Regular Maintenance Tasks

**1. Update Indexes**
```javascript
// Add new indexes as needed
db.calllogs.createIndex({ 'metadata.orderId': 1 });
```

**2. Analyze Query Performance**
```javascript
// Use explain() to analyze slow queries
db.calllogs.find({ userId: ObjectId('...') }).explain('executionStats');
```

**3. Compact Collections**
```javascript
// Reclaim disk space
db.runCommand({ compact: 'calllogs' });
```

**4. Monitor Database Size**
```javascript
db.stats();
db.calllogs.stats();
```

**5. Clean Old Sessions**
```javascript
// Delete ended sessions older than 7 days
db.sessions.deleteMany({
  status: 'ended',
  updatedAt: { $lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
});
```

---

## Performance Optimization

### Query Optimization Tips

1. **Always use indexes for queries**
2. **Project only needed fields**
   ```javascript
   db.agents.find({}, { name: 1, 'config.prompt': 1 });
   ```
3. **Use lean() in Mongoose for read-only operations**
   ```typescript
   const agents = await Agent.find().lean();
   ```
4. **Limit result sets**
   ```javascript
   db.calllogs.find().limit(20);
   ```
5. **Use aggregation pipeline for complex queries**

### Connection Pooling

```typescript
// backend/src/config/db.ts
mongoose.connect(process.env.MONGODB_URI, {
  maxPoolSize: 10,
  minPoolSize: 5,
  socketTimeoutMS: 45000,
  serverSelectionTimeoutMS: 5000
});
```

---

**Next:** See [DEPLOYMENT.md](DEPLOYMENT.md) for deployment instructions.
