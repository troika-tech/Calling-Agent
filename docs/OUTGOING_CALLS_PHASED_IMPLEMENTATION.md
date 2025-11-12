# Outgoing Calls - Phased Implementation Plan

## Overview

This document breaks down the outgoing calls implementation into **6 distinct phases**, each with clear objectives, tasks, deliverables, and success criteria. Each phase builds upon the previous one, allowing for incremental development and testing.

**Total Timeline**: 6-8 weeks
**Team Size**: 1-2 backend engineers + 1 QA engineer (part-time)

---

## Table of Contents

- [Phase 0: Planning & Setup (Week 0)](#phase-0-planning--setup-week-0)
- [Phase 1: Foundation - Database & API Integration (Week 1)](#phase-1-foundation---database--api-integration-week-1)
- [Phase 2: Core Calling - WebSocket & Voice Pipeline (Week 2)](#phase-2-core-calling---websocket--voice-pipeline-week-2)
- [Phase 3: Scheduling System (Week 3)](#phase-3-scheduling-system-week-3)
- [Phase 4: Retry Logic & Error Handling (Week 4)](#phase-4-retry-logic--error-handling-week-4)
- [Phase 5: Advanced Features & Optimization (Week 5)](#phase-5-advanced-features--optimization-week-5)
- [Phase 6: Testing, Documentation & Production Rollout (Week 6-8)](#phase-6-testing-documentation--production-rollout-week-6-8)

---

## Phase 0: Planning & Setup (Week 0)

**Duration**: 3-5 days (before development starts)
**Team**: Tech Lead + Backend Engineer
**Objective**: Prepare for development with proper planning, environment setup, and design decisions

### 0.1 Design Decisions

**Tasks**:
- [ ] Review and approve implementation plan
- [ ] Define API contracts (request/response schemas)
- [ ] Design database schema (all models)
- [ ] Choose queue system (Bull with Redis confirmed)
- [ ] Define error codes and failure reasons
- [ ] Choose monitoring/observability tools
- [ ] Define success metrics and KPIs

**Deliverables**:
- ✅ API specification document
- ✅ Database schema ERD
- ✅ Architecture diagram
- ✅ Error handling matrix
- ✅ Monitoring plan

### 0.2 Environment Setup

**Tasks**:
- [ ] Set up development environment
  - [ ] Install Redis locally
  - [ ] Configure Bull queue
  - [ ] Update `.env` with new variables
- [ ] Set up Exotel test account
  - [ ] Get API credentials
  - [ ] Configure test phone numbers
  - [ ] Set up webhook endpoints (ngrok for local testing)
- [ ] Create feature branch
  ```bash
  git checkout -b feature/outgoing-calls
  ```
- [ ] Set up test data
  - [ ] Create test agents
  - [ ] Prepare test phone numbers
  - [ ] Create mock Exotel API (for unit tests)

**Deliverables**:
- ✅ Working development environment
- ✅ Exotel test credentials
- ✅ Feature branch created
- ✅ Mock services ready

### 0.3 Dependencies & Prerequisites

**Verify**:
- [ ] Existing incoming calls system working
- [ ] Deepgram connection pool functional
- [ ] Voice pipeline service operational
- [ ] MongoDB connection stable
- [ ] Redis available (new requirement)

**New Dependencies to Install**:
```bash
npm install bull
npm install @types/bull --save-dev
npm install bottleneck  # For rate limiting
npm install node-cron   # For scheduled jobs
```

### Success Criteria
- ✅ All design documents approved
- ✅ Development environment ready
- ✅ Team aligned on approach
- ✅ Exotel test credentials obtained
- ✅ Redis running and accessible

**Estimated Effort**: 16-24 hours

---

## Phase 1: Foundation - Database & API Integration (Week 1)

**Duration**: 5-7 days
**Team**: 1 Backend Engineer
**Objective**: Build the foundation - database models, Exotel API client, and basic call initiation

### 1.1 Database Schema Implementation

**Files to Create/Modify**:
- `backend/src/models/CallLog.ts` (modify)
- `backend/src/models/ScheduledCall.ts` (new)
- `backend/src/models/RetryAttempt.ts` (new)

**Task 1.1.1: Update CallLog Model**

```typescript
// Add outbound-specific fields
interface ICallLog extends Document {
  // ... existing fields ...

  // NEW fields
  direction: 'inbound' | 'outbound';
  outboundStatus?: 'queued' | 'ringing' | 'connected' | 'no_answer' | 'busy' | 'voicemail';
  scheduledFor?: Date;
  initiatedAt?: Date;
  retryCount: number;
  retryOf?: mongoose.Types.ObjectId;
  failureReason?: 'no_answer' | 'busy' | 'voicemail' | 'invalid_number' | 'network_error' | 'cancelled';
  exotelCallSid?: string;
  recordingUrl?: string;
  metadata?: any;
}
```

**Checklist**:
- [ ] Add new fields to interface
- [ ] Update schema definition
- [ ] Add default values
- [ ] Create indexes:
  ```typescript
  CallLogSchema.index({ direction: 1, status: 1 });
  CallLogSchema.index({ scheduledFor: 1 });
  CallLogSchema.index({ exotelCallSid: 1 });
  CallLogSchema.index({ 'metadata.campaignId': 1 });
  ```
- [ ] Write migration script (if needed for existing data)
- [ ] Test with sample data

**Task 1.1.2: Create ScheduledCall Model**

**Checklist**:
- [ ] Create model file
- [ ] Define interface and schema
- [ ] Add indexes:
  ```typescript
  ScheduledCallSchema.index({ scheduledFor: 1, status: 1 });
  ScheduledCallSchema.index({ status: 1, scheduledFor: 1 });
  ```
- [ ] Add validation rules
- [ ] Test CRUD operations

**Task 1.1.3: Create RetryAttempt Model**

**Checklist**:
- [ ] Create model file
- [ ] Define interface and schema
- [ ] Add indexes:
  ```typescript
  RetryAttemptSchema.index({ originalCallLogId: 1, attemptNumber: 1 });
  RetryAttemptSchema.index({ scheduledFor: 1, status: 1 });
  ```
- [ ] Add validation rules
- [ ] Test CRUD operations

**Estimated Effort**: 8-12 hours

---

### 1.2 Exotel API Client Implementation

**File to Create**:
- `backend/src/services/exotelOutbound.service.ts`

**Task 1.2.1: Basic API Client**

```typescript
class ExotelOutboundService {
  private readonly apiUrl: string;
  private readonly accountSid: string;
  private readonly apiKey: string;
  private readonly apiToken: string;

  async makeCall(params: ExotelCallParams): Promise<ExotelCallResponse>
  async getCallDetails(callSid: string): Promise<ExotelCallDetails>
  async hangupCall(callSid: string): Promise<void>
}
```

**Checklist**:
- [ ] Create service class
- [ ] Implement authentication (Basic Auth)
- [ ] Implement `makeCall` method
  - [ ] Build request payload
  - [ ] Handle HTTP request
  - [ ] Parse response
  - [ ] Error handling
- [ ] Implement `getCallDetails` method
- [ ] Implement `hangupCall` method
- [ ] Add request/response logging
- [ ] Add timeout handling (10s)

**Task 1.2.2: Rate Limiting**

**Checklist**:
- [ ] Install Bottleneck: `npm install bottleneck`
- [ ] Configure rate limiter:
  ```typescript
  private limiter = new Bottleneck({
    reservoir: 20,
    reservoirRefreshAmount: 20,
    reservoirRefreshInterval: 1000,
    maxConcurrent: 10,
    minTime: 50
  });
  ```
- [ ] Wrap API calls with limiter
- [ ] Test rate limiting behavior

**Task 1.2.3: Circuit Breaker**

**Checklist**:
- [ ] Implement circuit breaker pattern
- [ ] Configure thresholds (5 failures = open)
- [ ] Configure timeout (1 minute)
- [ ] Add state transitions (closed → open → half-open → closed)
- [ ] Add logging for state changes
- [ ] Test circuit breaker behavior

**Estimated Effort**: 12-16 hours

---

### 1.3 Outgoing Call Service (Basic)

**File to Create**:
- `backend/src/services/outgoingCall.service.ts`

**Task 1.3.1: Core Service Implementation**

```typescript
class OutgoingCallService {
  async initiateCall(params: OutgoingCallParams): Promise<string>
  async getCallStatus(callLogId: string): Promise<CallStatus>
  async cancelCall(callLogId: string): Promise<void>
  async getActiveCalls(): Promise<number>
  async canInitiateCall(): Promise<boolean>
}
```

**Checklist**:
- [ ] Create service class
- [ ] Implement `initiateCall`:
  - [ ] Validate input (phone number, agent exists)
  - [ ] Check concurrent call limit
  - [ ] Create CallLog record
  - [ ] Call Exotel API
  - [ ] Update CallLog with Exotel call SID
  - [ ] Handle errors
- [ ] Implement `getCallStatus`
- [ ] Implement `cancelCall`
- [ ] Implement `getActiveCalls` (count active outbound calls)
- [ ] Implement `canInitiateCall` (check concurrency limit)
- [ ] Add comprehensive logging

**Task 1.3.2: Concurrency Control**

**Checklist**:
- [ ] Define max concurrent outbound calls (start with 10)
- [ ] Track active calls in memory (Map)
- [ ] Check limit before initiating call
- [ ] Release slot when call ends
- [ ] Add metrics tracking

**Estimated Effort**: 10-14 hours

---

### 1.4 Basic API Endpoints

**File to Create**:
- `backend/src/routes/outgoingCalls.routes.ts`

**Task 1.4.1: Create Routes**

**Checklist**:
- [ ] Create router file
- [ ] Implement `POST /api/v1/calls/outbound`
  - [ ] Request validation (Joi/Zod schema)
  - [ ] Call `outgoingCallService.initiateCall`
  - [ ] Return 202 Accepted with callLogId
  - [ ] Error handling
- [ ] Implement `GET /api/v1/calls/:callLogId`
  - [ ] Fetch CallLog from database
  - [ ] Return call details
  - [ ] Handle not found
- [ ] Implement `POST /api/v1/calls/:callLogId/cancel`
  - [ ] Validate call can be cancelled
  - [ ] Call `outgoingCallService.cancelCall`
  - [ ] Return success response
- [ ] Add authentication middleware
- [ ] Add rate limiting middleware
- [ ] Mount router in `backend/src/routes/index.ts`

**Task 1.4.2: Request Validation Schemas**

```typescript
const initiateCallSchema = Joi.object({
  phoneNumber: Joi.string().pattern(/^\+[1-9]\d{1,14}$/).required(),
  agentId: Joi.string().required(),
  metadata: Joi.object().optional(),
  priority: Joi.string().valid('low', 'medium', 'high').optional()
});
```

**Checklist**:
- [ ] Create validation schemas
- [ ] Add to route handlers
- [ ] Test with valid/invalid inputs

**Estimated Effort**: 6-8 hours

---

### 1.5 Unit Tests

**Files to Create**:
- `backend/tests/services/exotelOutbound.test.ts`
- `backend/tests/services/outgoingCall.test.ts`
- `backend/tests/routes/outgoingCalls.test.ts`

**Checklist**:
- [ ] Test ExotelOutboundService:
  - [ ] `makeCall` success
  - [ ] `makeCall` with invalid params
  - [ ] `makeCall` with API error
  - [ ] Rate limiting behavior
  - [ ] Circuit breaker behavior
- [ ] Test OutgoingCallService:
  - [ ] `initiateCall` success
  - [ ] `initiateCall` with invalid agent
  - [ ] `initiateCall` when at limit
  - [ ] `cancelCall` success
  - [ ] `getActiveCalls` accuracy
- [ ] Test API routes:
  - [ ] POST /outbound success (202)
  - [ ] POST /outbound validation errors (400)
  - [ ] GET /:callLogId success (200)
  - [ ] GET /:callLogId not found (404)
  - [ ] POST /:callLogId/cancel success (200)

**Target Coverage**: 80%+

**Estimated Effort**: 8-10 hours

---

### Phase 1 Deliverables

✅ **Database Models**:
- Updated CallLog with outbound fields
- ScheduledCall model
- RetryAttempt model
- All indexes created

✅ **Services**:
- ExotelOutboundService (with rate limiting & circuit breaker)
- OutgoingCallService (basic implementation)

✅ **API Endpoints**:
- POST /api/v1/calls/outbound
- GET /api/v1/calls/:callLogId
- POST /api/v1/calls/:callLogId/cancel

✅ **Tests**:
- Unit tests for all services
- Unit tests for all routes
- 80%+ code coverage

✅ **Manual Testing**:
- Can initiate a call via API
- Call appears in Exotel dashboard
- CallLog created in database
- Can retrieve call status

### Phase 1 Success Criteria

- ✅ API call successfully initiates outbound call in Exotel
- ✅ CallLog record created with correct data
- ✅ Exotel call SID stored in database
- ✅ Can query call status via API
- ✅ Rate limiting prevents API overload
- ✅ Circuit breaker protects against Exotel downtime
- ✅ All unit tests passing
- ✅ No critical bugs

**Total Estimated Effort**: 44-60 hours (1 week for 1 engineer)

---

## Phase 2: Core Calling - WebSocket & Voice Pipeline (Week 2)

**Duration**: 5-7 days
**Team**: 1 Backend Engineer
**Objective**: Connect outbound calls to the existing voice pipeline for full conversation capability

### 2.1 Exotel Webhook Handler

**File to Create**:
- `backend/src/routes/webhooks.routes.ts` (or extend existing)

**Task 2.1.1: Call Status Webhook**

**Checklist**:
- [ ] Create `POST /api/v1/webhooks/exotel/call-status` endpoint
- [ ] Parse Exotel webhook payload
- [ ] Update CallLog based on CallStatus:
  - [ ] `queued` → Update outboundStatus
  - [ ] `ringing` → Update outboundStatus, store call SID
  - [ ] `in-progress` → Update status to 'in-progress', set startedAt
  - [ ] `completed` → Update status, set endedAt, duration
  - [ ] `no-answer` → Mark as failed, trigger retry
  - [ ] `busy` → Mark as failed, trigger retry
  - [ ] `failed` → Mark as failed, trigger retry
- [ ] Store recording URL when available
- [ ] Add webhook signature verification (security)
- [ ] Add logging for all status updates
- [ ] Test with mock webhook payloads

**Task 2.1.2: WebSocket URL Response**

When call is answered, Exotel requests WebSocket URL via webhook.

**Checklist**:
- [ ] Create `POST /api/v1/webhooks/exotel/voice-connected` endpoint
- [ ] Parse webhook payload (extract call SID, custom field)
- [ ] Look up CallLog by ID (from custom field)
- [ ] Return WebSocket URL:
  ```json
  {
    "response": {
      "action": "connect",
      "url": "wss://your-domain.com/ws/exotel/voice/{callLogId}"
    }
  }
  ```
- [ ] Test webhook response format

**Estimated Effort**: 6-8 hours

---

### 2.2 Outbound Voice Handler

**File to Create**:
- `backend/src/websocket/handlers/outboundVoice.handler.ts`

**Task 2.2.1: Extend ExotelVoiceHandler**

```typescript
class OutboundVoiceHandler extends ExotelVoiceHandler {
  protected async handleConnection(client: WebSocketClient, callLogId: string): Promise<void>
  private async handleOutboundConnection(client: WebSocketClient, callLog: CallLog): Promise<void>
  private async sendProactiveGreeting(client: WebSocketClient, session: VoiceSession): Promise<void>
  private async handleNoInitialResponse(client: WebSocketClient, session: VoiceSession): Promise<void>
}
```

**Checklist**:
- [ ] Create OutboundVoiceHandler class extending ExotelVoiceHandler
- [ ] Override `handleConnection` to detect direction:
  ```typescript
  if (callLog.direction === 'outbound') {
    await this.handleOutboundConnection(client, callLog);
  } else {
    await super.handleConnection(client, callLogId);
  }
  ```
- [ ] Implement `handleOutboundConnection`:
  - [ ] Initialize session (same as incoming)
  - [ ] Send proactive greeting (AI speaks first)
  - [ ] Start no-response timeout (10 seconds)
  - [ ] Set up audio listening
- [ ] Implement `sendProactiveGreeting`:
  - [ ] Get greeting text from agent config
  - [ ] Use streaming TTS (reuse existing method)
  - [ ] Send to Exotel via WebSocket
  - [ ] Save to transcript
- [ ] Implement `handleNoInitialResponse`:
  - [ ] Send prompt: "Hello? Are you there?"
  - [ ] Wait 5 more seconds
  - [ ] If still no response, end call
- [ ] Clear timeout when customer speaks
- [ ] Handle all edge cases

**Task 2.2.2: Update WebSocket Server**

**File**: `backend/src/websocket/websocket.server.ts`

**Checklist**:
- [ ] Import OutboundVoiceHandler
- [ ] Modify connection routing to use OutboundVoiceHandler:
  ```typescript
  if (pathname.startsWith('/ws/exotel/voice/')) {
    const handler = new OutboundVoiceHandler();
    this.wss.handleUpgrade(request, socket, head, (ws) => {
      handler.handleConnection(ws, request);
    });
  }
  ```
- [ ] Test routing logic

**Estimated Effort**: 12-16 hours

---

### 2.3 Agent Configuration Updates

**File to Modify**:
- `backend/src/models/Agent.ts`

**Task 2.3.1: Add Outbound Settings**

**Checklist**:
- [ ] Add outbound-specific config fields:
  ```typescript
  interface IAgent {
    // ... existing fields ...
    config: {
      // ... existing fields ...
      outboundGreeting?: string;
      outboundNoResponsePrompt?: string;
      outboundGoodbyeMessage?: string;
      voicemailMessage?: string;
      maxCallDuration?: number; // seconds, default 600
    }
  }
  ```
- [ ] Add default values
- [ ] Update agent creation/update APIs to include new fields
- [ ] Test with sample agent

**Estimated Effort**: 2-4 hours

---

### 2.4 Integration Testing

**Task 2.4.1: End-to-End Manual Test**

**Test Scenario**: Complete outbound call flow

**Steps**:
1. [ ] Start local server with ngrok for webhooks
2. [ ] Call API to initiate outbound call:
   ```bash
   curl -X POST http://localhost:3000/api/v1/calls/outbound \
     -H "Content-Type: application/json" \
     -d '{
       "phoneNumber": "+919876543210",
       "agentId": "test_agent_id"
     }'
   ```
3. [ ] Verify call appears in Exotel dashboard
4. [ ] Answer call on test phone
5. [ ] Verify greeting plays: "Hello! This is..."
6. [ ] Speak to test STT: "Hi, I need help"
7. [ ] Verify AI responds (streaming TTS)
8. [ ] Have conversation (3-5 exchanges)
9. [ ] Say goodbye: "Thanks, goodbye"
10. [ ] Verify call ends gracefully
11. [ ] Check CallLog in database:
    - [ ] Status = 'completed'
    - [ ] Transcript contains conversation
    - [ ] Duration recorded
    - [ ] Recording URL present

**Task 2.4.2: Edge Case Testing**

**Checklist**:
- [ ] Test no answer scenario:
  - [ ] Initiate call
  - [ ] Don't answer
  - [ ] Verify CallLog status = 'failed', failureReason = 'no_answer'
- [ ] Test busy scenario (if possible to simulate)
- [ ] Test customer silence after answer:
  - [ ] Answer call
  - [ ] Don't speak after greeting
  - [ ] Verify prompt: "Hello? Are you there?"
  - [ ] Still don't speak
  - [ ] Verify call ends after total 15 seconds
- [ ] Test WebSocket disconnect mid-call:
  - [ ] Start call
  - [ ] Force disconnect WebSocket
  - [ ] Verify graceful handling
- [ ] Test very long call (>10 minutes if configured)

**Task 2.4.3: Performance Testing**

**Checklist**:
- [ ] Measure latency at each stage:
  - [ ] Greeting sent time (target: <1s after connection)
  - [ ] First AI response time (target: <2s after customer speech ends)
  - [ ] Subsequent responses (target: <2s)
- [ ] Verify Deepgram connection acquired from pool
- [ ] Verify TTS streaming working (no buffering)
- [ ] Check memory usage during call
- [ ] Verify connection released after call

**Estimated Effort**: 8-12 hours

---

### 2.5 Optimization Implementation

**Task 2.5.1: Greeting Audio Caching**

**File to Create**:
- `backend/src/services/greetingCache.service.ts`

**Checklist**:
- [ ] Create GreetingCache class
- [ ] Implement `getGreeting` method:
  - [ ] Check cache by key (agentId + voiceProvider + voiceId + text)
  - [ ] If cached, return immediately
  - [ ] If not, synthesize via TTS
  - [ ] Convert to PCM (Exotel format)
  - [ ] Store in cache
  - [ ] Return audio
- [ ] Implement cache eviction (daily clear or LRU)
- [ ] Add cache hit rate metrics
- [ ] Integrate with OutboundVoiceHandler
- [ ] Test cache hit/miss behavior

**Task 2.5.2: Parallel Greeting + STT Setup**

**Checklist**:
- [ ] Modify `handleOutboundConnection` to parallelize:
  ```typescript
  await Promise.all([
    this.sendProactiveGreeting(client, session),
    this.setupDeepgramConnection(client, session)
  ]);
  ```
- [ ] Test both tasks complete successfully
- [ ] Measure latency improvement (~100-300ms)

**Estimated Effort**: 6-8 hours

---

### Phase 2 Deliverables

✅ **Webhook Handlers**:
- Call status webhook (handles all Exotel status updates)
- Voice connected webhook (returns WebSocket URL)
- Webhook signature verification

✅ **Voice Pipeline Integration**:
- OutboundVoiceHandler (extends existing handler)
- Proactive greeting implementation
- No-response timeout handling
- Full conversation capability

✅ **Agent Configuration**:
- Outbound-specific settings added
- Default greetings configured

✅ **Optimizations**:
- Greeting audio caching (99% cost reduction)
- Parallel greeting + STT setup (100-300ms savings)

✅ **Testing**:
- End-to-end manual test passed
- Edge cases tested
- Performance verified (<2s latency)

### Phase 2 Success Criteria

- ✅ Outbound call connects to voice pipeline
- ✅ Greeting plays within 1 second of connection
- ✅ Customer can have natural conversation with AI
- ✅ STT, LLM, TTS all working via streaming pipeline
- ✅ Total latency <2 seconds (same as incoming calls)
- ✅ Transcript saves correctly
- ✅ Call ends gracefully
- ✅ No-response timeout works
- ✅ All edge cases handled
- ✅ Greeting cache working (hit rate >50% in testing)

**Total Estimated Effort**: 34-48 hours (1 week for 1 engineer)

---

## Phase 3: Scheduling System (Week 3)

**Duration**: 5-7 days
**Team**: 1 Backend Engineer
**Objective**: Implement call scheduling with Bull queue for delayed execution

### 3.1 Queue Setup

**Task 3.1.1: Install and Configure Bull**

**Checklist**:
- [ ] Install Bull: `npm install bull @types/bull`
- [ ] Configure Redis connection:
  ```typescript
  // backend/src/config/redis.ts
  export const redisConfig = {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD,
    db: parseInt(process.env.REDIS_DB || '0')
  };
  ```
- [ ] Create queue instance:
  ```typescript
  // backend/src/queues/outboundCalls.queue.ts
  import Queue from 'bull';

  export const outboundCallsQueue = new Queue('outbound-calls', {
    redis: redisConfig,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000
      },
      removeOnComplete: false,
      removeOnFail: false
    }
  });
  ```
- [ ] Test queue connection
- [ ] Add queue health check to `/health` endpoint

**Task 3.1.2: Queue Worker Setup**

**Checklist**:
- [ ] Create queue processor:
  ```typescript
  outboundCallsQueue.process('initiate-call', async (job) => {
    const { callLogId, phoneNumber, agentId, metadata } = job.data;

    try {
      await outgoingCallService.initiateCall({
        callLogId,
        phoneNumber,
        agentId,
        metadata
      });

      return { success: true, callLogId };
    } catch (error) {
      logger.error('Failed to initiate call from queue', { error, job: job.id });
      throw error; // Will trigger retry
    }
  });
  ```
- [ ] Add event listeners:
  ```typescript
  outboundCallsQueue.on('completed', (job, result) => {
    logger.info('Call initiated successfully', { jobId: job.id, result });
  });

  outboundCallsQueue.on('failed', (job, error) => {
    logger.error('Call initiation failed', { jobId: job.id, error: error.message });
  });

  outboundCallsQueue.on('stalled', (job) => {
    logger.warn('Job stalled', { jobId: job.id });
  });
  ```
- [ ] Test job processing

**Estimated Effort**: 6-8 hours

---

### 3.2 Call Scheduler Service

**File to Create**:
- `backend/src/services/callScheduler.service.ts`

**Task 3.2.1: Core Scheduler Implementation**

```typescript
class CallScheduler {
  async scheduleCall(params: ScheduledCallParams): Promise<string>
  async rescheduleCall(scheduleId: string, newTime: Date): Promise<void>
  async cancelScheduledCall(scheduleId: string): Promise<void>
  async getScheduledCalls(filters: ScheduleFilters): Promise<ScheduledCall[]>
  private async adjustForBusinessHours(scheduledFor: Date, businessHours: BusinessHours): Promise<Date>
}
```

**Checklist**:
- [ ] Create CallScheduler class
- [ ] Implement `scheduleCall`:
  - [ ] Validate input (scheduledFor is future, agent exists)
  - [ ] Create CallLog with status 'scheduled'
  - [ ] Create ScheduledCall record
  - [ ] Check business hours (if respectBusinessHours = true)
  - [ ] Calculate delay from now
  - [ ] Add job to Bull queue:
    ```typescript
    await outboundCallsQueue.add('initiate-call', {
      callLogId: callLog._id.toString(),
      phoneNumber: params.phoneNumber,
      agentId: params.agentId,
      metadata: params.metadata
    }, {
      delay: delay,
      jobId: scheduleId
    });
    ```
  - [ ] Return scheduleId
- [ ] Implement `rescheduleCall`:
  - [ ] Fetch ScheduledCall
  - [ ] Remove old job from queue
  - [ ] Add new job with new delay
  - [ ] Update ScheduledCall.scheduledFor
- [ ] Implement `cancelScheduledCall`:
  - [ ] Fetch ScheduledCall
  - [ ] Remove job from queue
  - [ ] Update status to 'cancelled'
  - [ ] Update associated CallLog
- [ ] Implement `getScheduledCalls`:
  - [ ] Query ScheduledCall with filters
  - [ ] Paginate results
  - [ ] Return list

**Task 3.2.2: Business Hours Logic**

**Checklist**:
- [ ] Implement `adjustForBusinessHours`:
  - [ ] Parse business hours (start, end, timezone, daysOfWeek)
  - [ ] Convert scheduledFor to business hours timezone
  - [ ] Check if time is within business hours
  - [ ] If yes, return as-is
  - [ ] If no, calculate next available business hour
  - [ ] Handle weekends (skip to Monday)
  - [ ] Return adjusted time
- [ ] Add comprehensive tests for edge cases:
  - [ ] Schedule at 8pm → next day 9am
  - [ ] Schedule on Saturday → Monday 9am
  - [ ] Schedule on Friday 6pm → Monday 9am
  - [ ] Different timezones

**Task 3.2.3: Recurring Calls**

**Checklist**:
- [ ] Extend `scheduleCall` to support recurring:
  ```typescript
  interface ScheduledCallParams {
    // ... existing fields ...
    recurring?: {
      frequency: 'daily' | 'weekly' | 'monthly';
      interval: number;
      endDate?: Date;
      maxOccurrences?: number;
    }
  }
  ```
- [ ] After call completes, schedule next occurrence:
  - [ ] Calculate next run time based on frequency
  - [ ] Create new ScheduledCall
  - [ ] Check endDate and maxOccurrences
  - [ ] Add to queue
- [ ] Test recurring schedules

**Estimated Effort**: 12-16 hours

---

### 3.3 Schedule API Endpoints

**File to Modify**:
- `backend/src/routes/outgoingCalls.routes.ts`

**Task 3.3.1: Implement Schedule Endpoints**

**Checklist**:
- [ ] Implement `POST /api/v1/calls/outbound/schedule`:
  - [ ] Validate request body (scheduledFor, timezone, etc.)
  - [ ] Call `callScheduler.scheduleCall`
  - [ ] Return 201 Created with scheduleId
- [ ] Implement `PUT /api/v1/calls/scheduled/:scheduleId`:
  - [ ] Validate new scheduledFor
  - [ ] Call `callScheduler.rescheduleCall`
  - [ ] Return updated schedule
- [ ] Implement `DELETE /api/v1/calls/scheduled/:scheduleId`:
  - [ ] Call `callScheduler.cancelScheduledCall`
  - [ ] Return 200 OK
- [ ] Implement `GET /api/v1/calls/scheduled`:
  - [ ] Parse query params (filters, pagination)
  - [ ] Call `callScheduler.getScheduledCalls`
  - [ ] Return paginated list
- [ ] Add request validation schemas
- [ ] Add authentication middleware
- [ ] Test all endpoints

**Estimated Effort**: 6-8 hours

---

### 3.4 Timezone Handling

**Task 3.4.1: Install and Configure Timezone Library**

**Checklist**:
- [ ] Install moment-timezone: `npm install moment-timezone`
- [ ] Create timezone utility:
  ```typescript
  // backend/src/utils/timezone.ts
  import moment from 'moment-timezone';

  export function convertToTimezone(date: Date, timezone: string): Date {
    return moment(date).tz(timezone).toDate();
  }

  export function isWithinBusinessHours(
    time: Date,
    businessHours: BusinessHours
  ): boolean {
    const localTime = moment(time).tz(businessHours.timezone);
    const hour = localTime.hour();
    const day = localTime.day();

    // Check day of week
    if (businessHours.daysOfWeek && !businessHours.daysOfWeek.includes(day)) {
      return false;
    }

    // Check time range
    const startHour = parseInt(businessHours.start.split(':')[0]);
    const endHour = parseInt(businessHours.end.split(':')[0]);

    return hour >= startHour && hour < endHour;
  }

  export function getNextBusinessHour(
    from: Date,
    businessHours: BusinessHours
  ): Date {
    let current = moment(from).tz(businessHours.timezone);

    // Max 14 days to prevent infinite loop
    for (let i = 0; i < 14; i++) {
      if (isWithinBusinessHours(current.toDate(), businessHours)) {
        return current.toDate();
      }

      // Move to next day at business start time
      current = current.add(1, 'day').startOf('day')
        .add(parseInt(businessHours.start.split(':')[0]), 'hours');
    }

    throw new Error('Could not find business hour within 14 days');
  }
  ```
- [ ] Test with various timezones (UTC, Asia/Kolkata, America/New_York)
- [ ] Test edge cases (DST transitions)

**Estimated Effort**: 4-6 hours

---

### 3.5 Queue Monitoring

**Task 3.5.1: Add Queue Metrics to Stats API**

**File to Modify**:
- `backend/src/routes/stats.routes.ts`

**Checklist**:
- [ ] Add queue stats to `/api/v1/stats`:
  ```typescript
  const queueStats = {
    waiting: await outboundCallsQueue.getWaitingCount(),
    active: await outboundCallsQueue.getActiveCount(),
    completed: await outboundCallsQueue.getCompletedCount(),
    failed: await outboundCallsQueue.getFailedCount(),
    delayed: await outboundCallsQueue.getDelayedCount()
  };
  ```
- [ ] Add scheduled calls count:
  ```typescript
  const scheduledCallsCount = await ScheduledCall.countDocuments({
    status: 'pending',
    scheduledFor: { $gte: new Date() }
  });
  ```
- [ ] Return in stats response
- [ ] Test endpoint

**Task 3.5.2: Queue Dashboard (Optional)**

**Checklist**:
- [ ] Install Bull Board: `npm install @bull-board/express`
- [ ] Set up dashboard:
  ```typescript
  import { createBullBoard } from '@bull-board/api';
  import { BullAdapter } from '@bull-board/api/bullAdapter';
  import { ExpressAdapter } from '@bull-board/express';

  const serverAdapter = new ExpressAdapter();
  createBullBoard({
    queues: [new BullAdapter(outboundCallsQueue)],
    serverAdapter
  });

  app.use('/admin/queues', serverAdapter.getRouter());
  ```
- [ ] Access at `http://localhost:3000/admin/queues`
- [ ] Test queue visibility and management

**Estimated Effort**: 4-6 hours

---

### 3.6 Testing

**Task 3.6.1: Unit Tests**

**Files to Create**:
- `backend/tests/services/callScheduler.test.ts`

**Checklist**:
- [ ] Test `scheduleCall`:
  - [ ] Success case
  - [ ] Past date validation
  - [ ] Invalid agent
  - [ ] Business hours adjustment
- [ ] Test `rescheduleCall`:
  - [ ] Success case
  - [ ] Schedule not found
  - [ ] Already processed
- [ ] Test `cancelScheduledCall`:
  - [ ] Success case
  - [ ] Already cancelled
- [ ] Test timezone utilities:
  - [ ] Conversion accuracy
  - [ ] Business hours detection
  - [ ] Next business hour calculation
- [ ] Test recurring schedules:
  - [ ] Daily recurrence
  - [ ] Weekly recurrence
  - [ ] Monthly recurrence
  - [ ] End date respected
  - [ ] Max occurrences respected

**Task 3.6.2: Integration Tests**

**Checklist**:
- [ ] Schedule a call for 10 seconds in future:
  - [ ] Verify job added to queue
  - [ ] Wait 10 seconds
  - [ ] Verify call initiated
  - [ ] Verify ScheduledCall status = 'completed'
- [ ] Schedule call outside business hours:
  - [ ] Verify time adjusted to next business hour
- [ ] Cancel scheduled call:
  - [ ] Verify job removed from queue
  - [ ] Verify status = 'cancelled'
- [ ] Reschedule call:
  - [ ] Verify old job removed
  - [ ] Verify new job added with new time

**Task 3.6.3: Manual Testing**

**Checklist**:
- [ ] Schedule call for 1 minute in future via API
- [ ] Monitor queue dashboard
- [ ] Verify call executes at scheduled time
- [ ] Check CallLog and ScheduledCall status
- [ ] Schedule recurring daily call
- [ ] Verify first execution
- [ ] Verify next occurrence scheduled

**Estimated Effort**: 10-12 hours

---

### Phase 3 Deliverables

✅ **Queue System**:
- Bull queue configured with Redis
- Queue processor for initiating calls
- Job event handlers (completed, failed, stalled)
- Queue health monitoring

✅ **Call Scheduler Service**:
- Schedule calls for future execution
- Reschedule existing scheduled calls
- Cancel scheduled calls
- Business hours respect
- Timezone handling
- Recurring calls support

✅ **API Endpoints**:
- POST /api/v1/calls/outbound/schedule
- PUT /api/v1/calls/scheduled/:scheduleId
- DELETE /api/v1/calls/scheduled/:scheduleId
- GET /api/v1/calls/scheduled

✅ **Monitoring**:
- Queue stats in /api/v1/stats
- Bull Board dashboard (optional)

✅ **Tests**:
- Unit tests for scheduler
- Unit tests for timezone logic
- Integration tests for queue processing
- Manual testing passed

### Phase 3 Success Criteria

- ✅ Can schedule calls for future execution
- ✅ Scheduled calls execute at correct time (±5s accuracy)
- ✅ Business hours logic works correctly
- ✅ Timezone conversions accurate
- ✅ Can cancel/reschedule scheduled calls
- ✅ Recurring calls work (daily, weekly, monthly)
- ✅ Queue monitoring shows accurate stats
- ✅ All tests passing
- ✅ No jobs stuck in queue

**Total Estimated Effort**: 42-56 hours (1 week for 1 engineer)

---

## Phase 4: Retry Logic & Error Handling (Week 4)

**Duration**: 5-7 days
**Team**: 1 Backend Engineer
**Objective**: Implement intelligent retry logic with exponential backoff and comprehensive error handling

### 4.1 Retry Manager Service

**File to Create**:
- `backend/src/services/retryManager.service.ts`

**Task 4.1.1: Core Retry Logic**

```typescript
class RetryManager {
  async scheduleRetry(callLogId: string, reason: FailureReason): Promise<void>
  async getRetryHistory(callLogId: string): Promise<RetryAttempt[]>
  async cancelRetries(callLogId: string): Promise<void>
  shouldRetry(reason: FailureReason, attemptCount: number): boolean
  calculateRetryDelay(reason: FailureReason, attemptNumber: number): number
}
```

**Checklist**:
- [ ] Define retry configuration:
  ```typescript
  private readonly RETRY_CONFIG = {
    no_answer: { maxRetries: 3, baseDelay: 300000, multiplier: 2 },
    busy: { maxRetries: 3, baseDelay: 600000, multiplier: 2 },
    network_error: { maxRetries: 5, baseDelay: 60000, multiplier: 2 },
    voicemail: { maxRetries: 0 },
    invalid_number: { maxRetries: 0 }
  };
  ```
- [ ] Implement `scheduleRetry`:
  - [ ] Get retry config for failure reason
  - [ ] Check if retries allowed
  - [ ] Get current retry count from CallLog
  - [ ] Check if max retries reached
  - [ ] Calculate delay (exponential backoff + jitter)
  - [ ] Create RetryAttempt record
  - [ ] Schedule via CallScheduler
  - [ ] Update CallLog.retryCount
- [ ] Implement `calculateRetryDelay`:
  - [ ] Base delay × (multiplier ^ attemptNumber)
  - [ ] Cap at maxDelay
  - [ ] Add jitter (±10%) to prevent thundering herd
- [ ] Implement `getRetryHistory`:
  - [ ] Query RetryAttempt by originalCallLogId
  - [ ] Sort by attemptNumber
  - [ ] Return list
- [ ] Implement `cancelRetries`:
  - [ ] Find pending RetryAttempts
  - [ ] Cancel each scheduled call
  - [ ] Update RetryAttempt status to 'cancelled'
- [ ] Implement `shouldRetry`:
  - [ ] Check config for failure reason
  - [ ] Check attempt count vs max
  - [ ] Return boolean

**Estimated Effort**: 10-12 hours

---

### 4.2 Integrate Retry with Webhook Handler

**File to Modify**:
- `backend/src/routes/webhooks.routes.ts`

**Task 4.2.1: Trigger Retries on Failure**

**Checklist**:
- [ ] Modify call status webhook handler:
  ```typescript
  case 'no-answer':
    await CallLog.updateOne({ _id: callLogId }, {
      status: 'failed',
      failureReason: 'no_answer'
    });
    // Schedule retry
    await retryManager.scheduleRetry(callLogId, 'no_answer');
    break;

  case 'busy':
    await CallLog.updateOne({ _id: callLogId }, {
      status: 'failed',
      failureReason: 'busy'
    });
    await retryManager.scheduleRetry(callLogId, 'busy');
    break;

  case 'failed':
    await CallLog.updateOne({ _id: callLogId }, {
      status: 'failed',
      failureReason: 'network_error'
    });
    await retryManager.scheduleRetry(callLogId, 'network_error');
    break;
  ```
- [ ] Add logging for retry scheduling
- [ ] Test with mock webhook calls

**Estimated Effort**: 4-6 hours

---

### 4.3 Retry Execution

**Task 4.3.1: Handle Retry Calls**

**File to Modify**:
- `backend/src/services/outgoingCall.service.ts`

**Checklist**:
- [ ] Detect retry calls in `initiateCall`:
  ```typescript
  async initiateCall(params: OutgoingCallParams): Promise<string> {
    // Check if this is a retry
    if (params.metadata?.isRetry) {
      const retryAttemptId = params.metadata.retryAttemptId;
      const originalCallLogId = params.metadata.originalCallLogId;

      // Update retry attempt status
      await RetryAttempt.updateOne({ _id: retryAttemptId }, {
        status: 'processing',
        processedAt: new Date()
      });

      // Create new CallLog linked to original
      const callLog = await CallLog.create({
        ...params,
        retryOf: originalCallLogId,
        retryCount: params.metadata.attemptNumber
      });

      params.callLogId = callLog._id.toString();
    }

    // Continue with normal initiation
    // ...
  }
  ```
- [ ] Update CallLog when retry succeeds:
  ```typescript
  // In webhook handler when retry call completes successfully
  if (callLog.retryOf) {
    // Update original call to show successful retry
    await CallLog.updateOne({ _id: callLog.retryOf }, {
      $set: { 'metadata.successfulRetryId': callLog._id }
    });

    // Update retry attempt
    await RetryAttempt.updateOne({ retryCallLogId: callLog._id }, {
      status: 'completed'
    });
  }
  ```
- [ ] Test retry execution flow

**Estimated Effort**: 6-8 hours

---

### 4.4 Smart Retry Scheduling

**Task 4.4.1: Off-Peak Retry Scheduling**

**File to Modify**:
- `backend/src/services/retryManager.service.ts`

**Checklist**:
- [ ] Add off-peak adjustment to `scheduleRetry`:
  ```typescript
  async scheduleRetry(callLogId: string, reason: FailureReason): Promise<void> {
    // ... calculate delay ...

    let scheduledFor = new Date(Date.now() + delay);

    // OPTIMIZATION: Avoid peak hours (9am-5pm)
    const hour = scheduledFor.getHours();
    if (hour >= 9 && hour <= 17 && reason !== 'network_error') {
      scheduledFor = this.getNext5PM(scheduledFor);
      logger.info('Adjusted retry to off-peak hours', { scheduledFor });
    }

    // ... schedule call ...
  }

  private getNext5PM(from: Date): Date {
    const next = new Date(from);
    next.setHours(17, 0, 0, 0);

    if (next <= from) {
      next.setDate(next.getDate() + 1);
    }

    return next;
  }
  ```
- [ ] Test off-peak adjustment
- [ ] Make configurable (peak hours via config)

**Estimated Effort**: 4-6 hours

---

### 4.5 Error Handling Enhancements

**Task 4.5.1: Idempotency for Retries**

**File to Modify**:
- `backend/src/services/outgoingCall.service.ts`

**Checklist**:
- [ ] Prevent duplicate retry processing:
  ```typescript
  async initiateCall(params: OutgoingCallParams): Promise<string> {
    // Check if retry attempt already processed
    if (params.metadata?.retryAttemptId) {
      const retryAttempt = await RetryAttempt.findById(params.metadata.retryAttemptId);

      if (retryAttempt.status === 'processing' || retryAttempt.status === 'completed') {
        logger.warn('Retry attempt already processed - skipping duplicate');
        return retryAttempt.retryCallLogId!.toString();
      }
    }

    // ... continue ...
  }
  ```
- [ ] Test duplicate retry prevention

**Task 4.5.2: Graceful Degradation**

**Checklist**:
- [ ] Handle Exotel API unavailable:
  ```typescript
  async initiateCall(params: OutgoingCallParams): Promise<string> {
    try {
      return await this.exotelService.makeCall(params);
    } catch (error) {
      if (error.message.includes('Circuit breaker is OPEN')) {
        // Exotel API down - queue for retry
        logger.warn('Exotel API unavailable - queueing for retry');

        const callLog = await CallLog.create({
          ...params,
          status: 'queued',
          failureReason: 'api_unavailable'
        });

        // Schedule retry in 5 minutes
        await retryManager.scheduleRetry(callLog._id.toString(), 'network_error');

        return callLog._id.toString();
      }

      throw error;
    }
  }
  ```
- [ ] Test graceful degradation

**Task 4.5.3: Max Retry Handling**

**Checklist**:
- [ ] When max retries reached:
  ```typescript
  async scheduleRetry(callLogId: string, reason: FailureReason): Promise<void> {
    // ... check retry count ...

    if (attemptNumber > config.maxRetries) {
      logger.warn(`Max retries reached for call ${callLogId}`);

      await CallLog.updateOne({ _id: callLogId }, {
        status: 'failed',
        failureReason: `${reason}_max_retries`,
        'metadata.maxRetriesReached': true
      });

      // Optionally: Trigger alert/notification
      // await notificationService.sendAlert(...);

      return;
    }

    // ... continue scheduling ...
  }
  ```
- [ ] Test max retry behavior

**Estimated Effort**: 6-8 hours

---

### 4.6 Retry API Endpoints

**File to Modify**:
- `backend/src/routes/outgoingCalls.routes.ts`

**Task 4.6.1: Retry Management Endpoints**

**Checklist**:
- [ ] Implement `GET /api/v1/calls/:callLogId/retries`:
  - [ ] Call `retryManager.getRetryHistory`
  - [ ] Return list of retry attempts
- [ ] Implement `POST /api/v1/calls/:callLogId/retry`:
  - [ ] Manually trigger retry (ignore max retries)
  - [ ] Call `retryManager.scheduleRetry` with force flag
  - [ ] Return 202 Accepted
- [ ] Implement `DELETE /api/v1/calls/:callLogId/retries`:
  - [ ] Call `retryManager.cancelRetries`
  - [ ] Return 200 OK
- [ ] Add request validation
- [ ] Test all endpoints

**Estimated Effort**: 4-6 hours

---

### 4.7 Monitoring & Alerts

**Task 4.7.1: Retry Metrics**

**File to Modify**:
- `backend/src/routes/stats.routes.ts`

**Checklist**:
- [ ] Add retry stats to `/api/v1/stats`:
  ```typescript
  const retryStats = {
    totalRetries: await RetryAttempt.countDocuments(),
    pendingRetries: await RetryAttempt.countDocuments({ status: 'pending' }),
    successfulRetries: await RetryAttempt.countDocuments({ status: 'completed' }),
    failedRetries: await RetryAttempt.countDocuments({ status: 'failed' }),

    // Breakdown by failure reason
    byReason: await RetryAttempt.aggregate([
      { $group: { _id: '$failureReason', count: { $sum: 1 } } }
    ]),

    // Average retries per call
    averageRetriesPerCall: await this.calculateAverageRetries()
  };
  ```
- [ ] Test stats endpoint

**Task 4.7.2: Failure Rate Alerts**

**Checklist**:
- [ ] Create alert utility:
  ```typescript
  // backend/src/utils/alerts.ts
  export async function checkFailureRate() {
    const last1Hour = new Date(Date.now() - 3600000);

    const totalCalls = await CallLog.countDocuments({
      direction: 'outbound',
      createdAt: { $gte: last1Hour }
    });

    const failedCalls = await CallLog.countDocuments({
      direction: 'outbound',
      status: 'failed',
      createdAt: { $gte: last1Hour }
    });

    const failureRate = (failedCalls / totalCalls) * 100;

    if (failureRate > 20) {
      logger.error('High failure rate detected', { failureRate, totalCalls, failedCalls });
      // Send alert (email, Slack, PagerDuty, etc.)
    }
  }
  ```
- [ ] Schedule periodic check (every 5 minutes):
  ```typescript
  import cron from 'node-cron';

  cron.schedule('*/5 * * * *', async () => {
    await checkFailureRate();
  });
  ```
- [ ] Test alert triggering

**Estimated Effort**: 4-6 hours

---

### 4.8 Testing

**Task 4.8.1: Unit Tests**

**Files to Create**:
- `backend/tests/services/retryManager.test.ts`

**Checklist**:
- [ ] Test retry configuration:
  - [ ] Correct delays for each failure reason
  - [ ] Max retries respected
  - [ ] Exponential backoff calculation
- [ ] Test `scheduleRetry`:
  - [ ] Success cases for all failure reasons
  - [ ] Max retries reached
  - [ ] Voicemail doesn't retry
  - [ ] Invalid number doesn't retry
- [ ] Test `cancelRetries`:
  - [ ] Cancels all pending retries
  - [ ] Doesn't affect completed retries
- [ ] Test idempotency:
  - [ ] Duplicate retry attempts rejected
- [ ] Test off-peak adjustment:
  - [ ] Peak hour schedule → 5pm
  - [ ] Off-peak schedule → as-is

**Task 4.8.2: Integration Tests**

**Checklist**:
- [ ] Test full retry flow:
  - [ ] Initiate call
  - [ ] Simulate no-answer (mock webhook)
  - [ ] Verify retry scheduled
  - [ ] Wait for retry execution
  - [ ] Verify new call initiated
  - [ ] Verify RetryAttempt status updated
- [ ] Test max retries:
  - [ ] Fail call 4 times (max = 3)
  - [ ] Verify 4th retry not scheduled
  - [ ] Verify CallLog marked permanently failed
- [ ] Test retry success:
  - [ ] First call fails
  - [ ] Retry succeeds
  - [ ] Verify original CallLog updated

**Task 4.8.3: Manual Testing**

**Checklist**:
- [ ] Initiate call to number that won't answer
- [ ] Verify retry scheduled (check queue)
- [ ] Wait for retry execution
- [ ] Verify retry call initiated
- [ ] Check retry history via API
- [ ] Cancel pending retries
- [ ] Verify cancellation worked

**Estimated Effort**: 10-12 hours

---

### Phase 4 Deliverables

✅ **Retry Manager Service**:
- Intelligent retry scheduling with exponential backoff
- Configurable retry limits per failure reason
- Jitter to prevent thundering herd
- Off-peak scheduling optimization
- Retry history tracking

✅ **Webhook Integration**:
- Automatic retry triggering on failures
- Proper failure reason detection
- Retry attempt tracking

✅ **Error Handling**:
- Idempotency for retry processing
- Graceful degradation when API unavailable
- Max retry enforcement
- Comprehensive logging

✅ **API Endpoints**:
- GET /api/v1/calls/:callLogId/retries
- POST /api/v1/calls/:callLogId/retry (manual)
- DELETE /api/v1/calls/:callLogId/retries (cancel)

✅ **Monitoring**:
- Retry metrics in stats API
- Failure rate alerts
- Retry success rate tracking

✅ **Tests**:
- Unit tests for retry logic
- Integration tests for full retry flow
- Edge case testing

### Phase 4 Success Criteria

- ✅ Failed calls automatically retry with exponential backoff
- ✅ No-answer retries at 5min, 10min, 20min intervals
- ✅ Busy signal retries at 10min, 20min, 40min intervals
- ✅ Network errors retry at 1min, 2min, 4min, 8min, 16min intervals
- ✅ Voicemail and invalid numbers don't retry
- ✅ Max retries enforced (no infinite loops)
- ✅ Retry history accessible via API
- ✅ Can manually trigger/cancel retries
- ✅ Failure rate alerts working
- ✅ All tests passing
- ✅ Retry success rate >60%

**Total Estimated Effort**: 48-64 hours (1 week for 1 engineer)

---

## Phase 5: Advanced Features & Optimization (Week 5)

**Duration**: 5-7 days
**Team**: 1 Backend Engineer + 1 Frontend Engineer (for dashboard)
**Objective**: Implement voicemail detection, bulk operations, and performance optimizations

### 5.1 Voicemail Detection

**File to Create**:
- `backend/src/services/voicemailDetector.service.ts`

**Task 5.1.1: Detection Heuristics**

```typescript
class VoicemailDetector {
  async detectVoicemail(session: VoiceSession): Promise<boolean>
  async leaveVoicemail(client: WebSocketClient, session: VoiceSession): Promise<void>
  private isLongGreeting(duration: number): boolean
  private detectBeep(audioChunk: Buffer): boolean
}
```

**Checklist**:
- [ ] Implement duration-based detection:
  ```typescript
  private isLongGreeting(duration: number): boolean {
    // If initial speech >8 seconds before customer speaks, likely voicemail
    return duration > 8000;
  }
  ```
- [ ] Implement silence pattern detection:
  ```typescript
  private hasLongSilence(session: VoiceSession): boolean {
    // If >5 seconds of silence after greeting, likely voicemail
    const silenceDuration = Date.now() - session.lastSpeechTime;
    return silenceDuration > 5000;
  }
  ```
- [ ] Implement beep detection (basic):
  ```typescript
  private detectBeep(audioChunk: Buffer): boolean {
    // Simplified: detect sudden volume spike
    // More advanced: FFT analysis for 800-1200 Hz frequency
    const volume = this.calculateVolume(audioChunk);
    return volume > this.beepThreshold;
  }
  ```
- [ ] Combine heuristics:
  ```typescript
  async detectVoicemail(session: VoiceSession): Promise<boolean> {
    const greetingDuration = session.timings.firstCustomerSpeech - session.timings.greetingSent;

    if (this.isLongGreeting(greetingDuration)) {
      return true;
    }

    if (this.hasLongSilence(session)) {
      return true;
    }

    // Could add beep detection here

    return false;
  }
  ```

**Task 5.1.2: Leave Voicemail Message**

**Checklist**:
- [ ] Implement `leaveVoicemail`:
  ```typescript
  async leaveVoicemail(
    client: WebSocketClient,
    session: VoiceSession
  ): Promise<void> {
    const message = session.agent.config.voicemailMessage ||
      `Hello, this is ${session.agent.name} from ${session.agent.company}. ` +
      `I was calling to discuss ${session.metadata.topic}. ` +
      `Please call us back at ${session.agent.config.callbackNumber}. Thank you!`;

    logger.info('Leaving voicemail message', { callLogId: session.callLogId });

    // Synthesize and send message
    await this.streamTTSToExotel(client, message, session);

    // Wait 2 seconds
    await sleep(2000);

    // Update CallLog
    await CallLog.updateOne({ _id: session.callLogId }, {
      status: 'completed',
      outboundStatus: 'voicemail',
      'metadata.voicemailLeft': true
    });

    // End call
    await this.endCall(client, session);
  }
  ```
- [ ] Test voicemail message

**Task 5.1.3: Integrate with Outbound Handler**

**File to Modify**:
- `backend/src/websocket/handlers/outboundVoice.handler.ts`

**Checklist**:
- [ ] Add voicemail detection to connection handler:
  ```typescript
  private async handleOutboundConnection(...) {
    // ... existing code ...

    // Start monitoring for voicemail
    session.voicemailCheckInterval = setInterval(async () => {
      const isVoicemail = await voicemailDetector.detectVoicemail(session);

      if (isVoicemail) {
        clearInterval(session.voicemailCheckInterval);
        await voicemailDetector.leaveVoicemail(client, session);
      }
    }, 1000); // Check every second
  }
  ```
- [ ] Clear interval on call end:
  ```typescript
  async endCall(...) {
    if (session.voicemailCheckInterval) {
      clearInterval(session.voicemailCheckInterval);
    }
    // ... existing cleanup ...
  }
  ```
- [ ] Test voicemail detection

**Estimated Effort**: 12-16 hours

---

### 5.2 Bulk Call Operations

**File to Create**:
- `backend/src/routes/bulkCalls.routes.ts`

**Task 5.2.1: Bulk Initiate API**

**Checklist**:
- [ ] Implement `POST /api/v1/calls/outbound/bulk`:
  ```typescript
  async bulkInitiateCalls(req, res) {
    const { calls, throttle } = req.body;

    // Validate
    if (!Array.isArray(calls) || calls.length === 0) {
      return res.status(400).json({ error: 'Invalid calls array' });
    }

    if (calls.length > 1000) {
      return res.status(400).json({ error: 'Max 1000 calls per batch' });
    }

    // Create batch ID
    const batchId = new ObjectId();

    // Create all CallLogs in single transaction
    const callLogs = await CallLog.insertMany(
      calls.map(call => ({
        ...call,
        direction: 'outbound',
        status: 'queued',
        metadata: {
          ...call.metadata,
          batchId: batchId.toString()
        }
      }))
    );

    // Schedule calls with throttling
    const maxConcurrent = throttle?.maxConcurrent || 5;
    const delayBetweenCalls = throttle?.delayBetweenCalls || 2000;

    for (let i = 0; i < callLogs.length; i++) {
      const delay = Math.floor(i / maxConcurrent) * delayBetweenCalls;

      await outboundCallsQueue.add('initiate-call', {
        callLogId: callLogs[i]._id.toString(),
        phoneNumber: calls[i].phoneNumber,
        agentId: calls[i].agentId,
        metadata: calls[i].metadata
      }, {
        delay
      });
    }

    return res.status(202).json({
      batchId: batchId.toString(),
      totalCalls: calls.length,
      status: 'processing',
      callLogIds: callLogs.map(c => c._id.toString())
    });
  }
  ```
- [ ] Add validation schema
- [ ] Test with 10, 50, 100 calls

**Task 5.2.2: CSV Import**

**Checklist**:
- [ ] Install CSV parser: `npm install csv-parse`
- [ ] Implement `POST /api/v1/calls/outbound/import`:
  ```typescript
  import { parse } from 'csv-parse/sync';

  async importFromCSV(req, res) {
    const csvData = req.file.buffer.toString();

    // Parse CSV
    const records = parse(csvData, {
      columns: true,
      skip_empty_lines: true
    });

    // Transform to call objects
    const calls = records.map(record => ({
      phoneNumber: record.phone,
      agentId: record.agentId || req.body.defaultAgentId,
      metadata: {
        name: record.name,
        campaignId: record.campaignId,
        customData: record
      }
    }));

    // Use bulk initiate
    return this.bulkInitiateCalls({ body: { calls } }, res);
  }
  ```
- [ ] Add file upload middleware (multer)
- [ ] Test CSV import

**Task 5.2.3: Batch Progress Tracking**

**Checklist**:
- [ ] Implement `GET /api/v1/calls/batches/:batchId`:
  ```typescript
  async getBatchProgress(req, res) {
    const { batchId } = req.params;

    const calls = await CallLog.find({
      'metadata.batchId': batchId
    });

    const stats = {
      total: calls.length,
      queued: calls.filter(c => c.status === 'queued').length,
      initiated: calls.filter(c => c.status === 'initiated').length,
      inProgress: calls.filter(c => c.status === 'in-progress').length,
      completed: calls.filter(c => c.status === 'completed').length,
      failed: calls.filter(c => c.status === 'failed').length,
      progress: (calls.filter(c => ['completed', 'failed'].includes(c.status)).length / calls.length) * 100
    };

    return res.json({
      batchId,
      stats,
      calls: calls.map(c => ({
        callLogId: c._id,
        status: c.status,
        phoneNumber: c.phoneNumber
      }))
    });
  }
  ```
- [ ] Test progress tracking

**Estimated Effort**: 10-14 hours

---

### 5.3 Performance Optimizations

**Task 5.3.1: Pre-warm Connections for Scheduled Calls**

**File to Modify**:
- `backend/src/services/callScheduler.service.ts`
- `backend/src/services/deepgramConnectionPool.service.ts`

**Checklist**:
- [ ] Add pre-warm job type to queue:
  ```typescript
  async scheduleCall(params: ScheduledCallParams): Promise<string> {
    const scheduledFor = new Date(params.scheduledFor);
    const preWarmTime = new Date(scheduledFor.getTime() - 30000); // 30s before

    // Schedule pre-warm
    await outboundCallsQueue.add('pre-warm-connection', {
      callLogId: params.callLogId
    }, {
      delay: Math.max(0, preWarmTime.getTime() - Date.now())
    });

    // Schedule actual call
    await outboundCallsQueue.add('initiate-call', {
      ...params
    }, {
      delay: scheduledFor.getTime() - Date.now()
    });

    return scheduleId;
  }
  ```
- [ ] Implement pre-warm processor:
  ```typescript
  outboundCallsQueue.process('pre-warm-connection', async (job) => {
    const { callLogId } = job.data;

    logger.info('Pre-warming Deepgram connection', { callLogId });

    // Pre-acquire connection
    await deepgramConnectionPool.preAcquireForCall(callLogId);
  });
  ```
- [ ] Add `preAcquireForCall` to connection pool:
  ```typescript
  // In deepgramConnectionPool.service.ts
  async preAcquireForCall(callLogId: string): Promise<void> {
    const connection = await this.acquireConnection(callLogId, {});

    // Store in map with expiry (will be used when call starts)
    this.preWarmedConnections.set(callLogId, {
      connection,
      expiresAt: Date.now() + 60000 // 1 minute expiry
    });
  }

  // Clean up expired pre-warmed connections
  private cleanupExpiredPreWarmed() {
    const now = Date.now();
    for (const [callLogId, { connection, expiresAt }] of this.preWarmedConnections) {
      if (expiresAt < now) {
        this.releaseConnection(callLogId);
        this.preWarmedConnections.delete(callLogId);
      }
    }
  }
  ```
- [ ] Test pre-warming

**Task 5.3.2: Connection Pool Scaling**

**Checklist**:
- [ ] Increase Deepgram connection limit (if using Growth plan):
  ```typescript
  // Update in deepgramConnectionPool.service.ts
  private maxConnections = parseInt(process.env.DEEPGRAM_MAX_CONNECTIONS || '20');
  ```
- [ ] Add environment variable to `.env`:
  ```
  DEEPGRAM_MAX_CONNECTIONS=100  # For Growth plan
  ```
- [ ] Test with higher limit

**Task 5.3.3: Database Query Optimization**

**Checklist**:
- [ ] Add missing indexes (verify):
  ```typescript
  // CallLog indexes
  CallLogSchema.index({ direction: 1, status: 1, createdAt: -1 });
  CallLogSchema.index({ 'metadata.batchId': 1 });
  CallLogSchema.index({ retryOf: 1 });

  // ScheduledCall indexes
  ScheduledCallSchema.index({ status: 1, scheduledFor: 1 });

  // RetryAttempt indexes
  RetryAttemptSchema.index({ originalCallLogId: 1, status: 1 });
  ```
- [ ] Use projection in queries to reduce data transfer:
  ```typescript
  // Instead of
  const calls = await CallLog.find({ direction: 'outbound' });

  // Use
  const calls = await CallLog.find(
    { direction: 'outbound' },
    { _id: 1, status: 1, phoneNumber: 1 }  // Only fetch needed fields
  );
  ```
- [ ] Use lean() for read-only queries:
  ```typescript
  const calls = await CallLog.find({...}).lean();  // Returns plain JS objects
  ```
- [ ] Test query performance

**Estimated Effort**: 8-12 hours

---

### 5.4 Analytics Dashboard (Frontend)

**Task 5.4.1: Enhanced Stats API**

**File to Modify**:
- `backend/src/routes/stats.routes.ts`

**Checklist**:
- [ ] Add outbound-specific stats:
  ```typescript
  GET /api/v1/stats/outbound

  {
    today: {
      totalCalls: 150,
      completed: 95,
      failed: 40,
      inProgress: 15,
      successRate: 70.4,
      averageDuration: 245
    },
    thisWeek: { ... },
    thisMonth: { ... },

    failureBreakdown: {
      no_answer: 18,
      busy: 12,
      voicemail: 5,
      network_error: 3,
      invalid_number: 2
    },

    scheduledCalls: {
      next1Hour: 12,
      next24Hours: 45,
      total: 123
    },

    retries: {
      pending: 8,
      successRate: 65.2
    },

    performance: {
      p50Latency: 1420,
      p95Latency: 1680,
      p99Latency: 1920
    }
  }
  ```
- [ ] Test stats endpoint

**Task 5.4.2: Dashboard UI (Frontend Work)**

**Note**: This is frontend work - coordinate with frontend engineer

**Components to Build**:
- [ ] Outbound Calls Dashboard
  - [ ] Real-time stats (auto-refresh every 5s)
  - [ ] Call history table
  - [ ] Scheduled calls list
  - [ ] Retry queue status
- [ ] Charts:
  - [ ] Call success rate over time (line chart)
  - [ ] Failure breakdown (pie chart)
  - [ ] Call volume by hour (bar chart)
- [ ] Actions:
  - [ ] Initiate call button
  - [ ] Schedule call form
  - [ ] Bulk import modal
  - [ ] Cancel scheduled call

**Estimated Effort**: 16-24 hours (frontend engineer)

---

### 5.5 Testing & Documentation

**Task 5.5.1: Integration Tests**

**Checklist**:
- [ ] Test voicemail detection:
  - [ ] Mock long greeting scenario
  - [ ] Verify voicemail detected
  - [ ] Verify message left
  - [ ] Verify call ended
- [ ] Test bulk operations:
  - [ ] Import CSV with 10 calls
  - [ ] Verify all calls queued
  - [ ] Verify throttling respected
  - [ ] Track batch progress
- [ ] Test pre-warming:
  - [ ] Schedule call 1 minute out
  - [ ] Verify pre-warm job created
  - [ ] Verify connection acquired 30s before
  - [ ] Verify call uses pre-warmed connection

**Task 5.5.2: Load Testing**

**Checklist**:
- [ ] Test 10 concurrent outbound calls
- [ ] Test 20 concurrent outbound calls
- [ ] Test 50 concurrent outbound calls (if pool supports)
- [ ] Monitor:
  - [ ] CPU usage
  - [ ] Memory usage
  - [ ] Database connections
  - [ ] Deepgram pool utilization
  - [ ] Queue depth
- [ ] Identify bottlenecks

**Task 5.5.3: API Documentation**

**Checklist**:
- [ ] Document all API endpoints (OpenAPI/Swagger)
- [ ] Add request/response examples
- [ ] Document error codes
- [ ] Add authentication details
- [ ] Publish to developer portal

**Estimated Effort**: 12-16 hours

---

### Phase 5 Deliverables

✅ **Voicemail Detection**:
- Duration-based detection
- Silence pattern detection
- Automated voicemail message delivery
- Proper call status tracking

✅ **Bulk Operations**:
- Bulk call initiation API
- CSV import functionality
- Batch progress tracking
- Throttling controls

✅ **Performance Optimizations**:
- Connection pre-warming for scheduled calls (300-500ms savings)
- Greeting cache (from Phase 2)
- Database query optimization
- Connection pool scaling support

✅ **Analytics**:
- Enhanced stats API with outbound metrics
- Dashboard UI (frontend)
- Real-time monitoring
- Performance metrics (p50, p95, p99)

✅ **Documentation**:
- Complete API documentation
- Integration examples
- Error handling guide

✅ **Testing**:
- Integration tests for all features
- Load testing results
- Performance benchmarks

### Phase 5 Success Criteria

- ✅ Voicemail detection accuracy >70%
- ✅ Can bulk import and initiate 100+ calls
- ✅ Batch processing respects throttling limits
- ✅ Pre-warming reduces connection latency by 300-500ms
- ✅ Database queries optimized (<100ms for stats)
- ✅ Dashboard displays real-time metrics
- ✅ System handles 20+ concurrent calls with <5% error rate
- ✅ All API endpoints documented
- ✅ Load tests pass at target concurrency

**Total Estimated Effort**: 58-82 hours (1 week for 2 engineers)

---

## Phase 6: Testing, Documentation & Production Rollout (Week 6-8)

**Duration**: 2-3 weeks
**Team**: 1 Backend Engineer + 1 QA Engineer + 1 DevOps Engineer
**Objective**: Comprehensive testing, production deployment, and gradual rollout

### 6.1 Comprehensive Testing (Week 6)

**Task 6.1.1: Unit Test Completion**

**Checklist**:
- [ ] Achieve 80%+ code coverage for all new code
- [ ] Test all services:
  - [ ] OutgoingCallService
  - [ ] ExotelOutboundService
  - [ ] CallScheduler
  - [ ] RetryManager
  - [ ] VoicemailDetector
  - [ ] GreetingCache
- [ ] Test all route handlers
- [ ] Test all utilities (timezone, audio conversion, etc.)
- [ ] Fix failing tests
- [ ] Review test quality (not just coverage)

**Task 6.1.2: Integration Test Suite**

**Checklist**:
- [ ] End-to-end test scenarios:
  - [ ] Happy path: Immediate call → conversation → completion
  - [ ] Scheduled call: Schedule → execute → complete
  - [ ] Retry flow: Fail → retry → success
  - [ ] Bulk import: CSV → queue → execute
  - [ ] Voicemail: Detect → leave message → end
- [ ] Error scenarios:
  - [ ] Invalid phone number
  - [ ] Agent not found
  - [ ] Concurrent limit reached
  - [ ] Exotel API unavailable
  - [ ] Database connection lost
  - [ ] Redis unavailable
- [ ] Edge cases:
  - [ ] Call exactly at business hours boundary
  - [ ] Schedule during DST transition
  - [ ] Retry during peak hours
  - [ ] Very long call (>10 minutes)
  - [ ] Rapid successive calls to same number

**Task 6.1.3: Load Testing**

**Use Artillery or k6**:

**Test Scenarios**:
1. **Baseline**: 5 calls/minute for 10 minutes
2. **Moderate**: 10 calls/minute for 30 minutes
3. **Peak**: 20 calls/minute for 10 minutes
4. **Spike**: 5 → 30 calls/minute (ramp over 2 min)
5. **Sustained**: 15 calls/minute for 60 minutes

**Metrics to Monitor**:
- [ ] Request success rate (target: >95%)
- [ ] Latency (p50, p95, p99)
- [ ] CPU usage (target: <70%)
- [ ] Memory usage (target: <80%)
- [ ] Database connection pool
- [ ] Deepgram pool utilization
- [ ] Queue depth
- [ ] Error rate by type

**Checklist**:
- [ ] Run all load test scenarios
- [ ] Document results
- [ ] Identify bottlenecks
- [ ] Optimize if needed
- [ ] Re-test after optimizations
- [ ] Get sign-off on performance

**Task 6.1.4: Security Testing**

**Checklist**:
- [ ] Test webhook signature verification
- [ ] Test authentication on all endpoints
- [ ] Test authorization (users can only access their calls)
- [ ] Test rate limiting effectiveness
- [ ] Test input validation (injection attacks)
- [ ] Test for sensitive data exposure in logs
- [ ] Scan for dependencies with known vulnerabilities:
  ```bash
  npm audit
  npm audit fix
  ```
- [ ] Run security scanner (OWASP ZAP, Burp Suite)

**Task 6.1.5: Manual QA Testing**

**Test Matrix**: Test on multiple environments and scenarios

**Checklist**:
- [ ] Test on development environment
- [ ] Test on staging environment (production-like)
- [ ] Test with real Exotel account (not sandbox)
- [ ] Test with different agents/configurations
- [ ] Test with different phone number formats
- [ ] Test with international numbers
- [ ] Test scheduling across timezones
- [ ] Test during actual business hours
- [ ] Test UI dashboard (if built)
- [ ] Test mobile responsiveness (if applicable)
- [ ] Accessibility testing (if applicable)
- [ ] Cross-browser testing (if applicable)

**Estimated Effort**: 60-80 hours (1 week, backend + QA engineer)

---

### 6.2 Documentation (Week 6)

**Task 6.2.1: API Documentation**

**Use Swagger/OpenAPI**:

**Checklist**:
- [ ] Document all endpoints:
  - [ ] POST /api/v1/calls/outbound
  - [ ] POST /api/v1/calls/outbound/schedule
  - [ ] POST /api/v1/calls/outbound/bulk
  - [ ] POST /api/v1/calls/outbound/import
  - [ ] GET /api/v1/calls/:callLogId
  - [ ] POST /api/v1/calls/:callLogId/cancel
  - [ ] GET /api/v1/calls/:callLogId/retries
  - [ ] POST /api/v1/calls/:callLogId/retry
  - [ ] DELETE /api/v1/calls/:callLogId/retries
  - [ ] GET /api/v1/calls/scheduled
  - [ ] PUT /api/v1/calls/scheduled/:scheduleId
  - [ ] DELETE /api/v1/calls/scheduled/:scheduleId
  - [ ] GET /api/v1/calls/batches/:batchId
  - [ ] GET /api/v1/stats/outbound
- [ ] Add request schemas with validation rules
- [ ] Add response schemas with examples
- [ ] Document error codes and meanings
- [ ] Add authentication details
- [ ] Generate Swagger UI
- [ ] Publish to developer portal

**Task 6.2.2: Integration Guide**

**Create comprehensive integration guide**:

**Checklist**:
- [ ] Getting started guide
- [ ] Authentication setup
- [ ] Making your first outbound call
- [ ] Scheduling calls
- [ ] Handling webhooks
- [ ] Bulk operations
- [ ] Error handling best practices
- [ ] Code examples in multiple languages:
  - [ ] JavaScript/TypeScript
  - [ ] Python
  - [ ] cURL
- [ ] Webhook integration guide
- [ ] Testing guide (sandbox mode)

**Task 6.2.3: Operational Documentation**

**Runbook for on-call engineers**:

**Checklist**:
- [ ] Architecture overview
- [ ] Deployment process
- [ ] Monitoring guide
- [ ] Common issues and solutions
- [ ] Troubleshooting guide
- [ ] Rollback procedures
- [ ] Database backup/restore
- [ ] Queue management (clearing stuck jobs)
- [ ] Scaling procedures
- [ ] Contact information (Exotel support, etc.)

**Task 6.2.4: Internal Documentation**

**For development team**:

**Checklist**:
- [ ] Code architecture documentation
- [ ] Database schema ERD
- [ ] Sequence diagrams for key flows
- [ ] Design decisions and rationale
- [ ] Performance optimization notes
- [ ] Testing strategy
- [ ] Future enhancements roadmap

**Estimated Effort**: 30-40 hours

---

### 6.3 Pre-Production Preparation (Week 6-7)

**Task 6.3.1: Environment Setup**

**Checklist**:
- [ ] Provision production infrastructure:
  - [ ] EC2 instances (or equivalent)
  - [ ] MongoDB Atlas (production tier)
  - [ ] Redis cluster (production)
  - [ ] Load balancer (ALB/ELB)
  - [ ] DNS configuration
  - [ ] SSL certificates
- [ ] Configure environment variables:
  - [ ] Exotel production credentials
  - [ ] Database connection strings
  - [ ] Redis connection
  - [ ] API keys (Deepgram, ElevenLabs, OpenAI)
  - [ ] Webhook URLs
  - [ ] Monitoring/logging keys
- [ ] Set up monitoring:
  - [ ] CloudWatch (AWS)
  - [ ] Datadog / New Relic (optional)
  - [ ] Error tracking (Sentry)
  - [ ] Uptime monitoring (Pingdom, UptimeRobot)
  - [ ] Log aggregation (CloudWatch Logs, ELK)
- [ ] Set up alerts:
  - [ ] High error rate (>10%)
  - [ ] High latency (>3s p95)
  - [ ] Queue depth (>100 jobs)
  - [ ] Database connection issues
  - [ ] Deepgram pool saturation (>90%)
  - [ ] Disk space low (<20%)
  - [ ] Memory usage high (>90%)

**Task 6.3.2: Database Preparation**

**Checklist**:
- [ ] Run all migrations on production DB
- [ ] Create indexes on production
- [ ] Set up automated backups (daily)
- [ ] Test backup restoration process
- [ ] Set up point-in-time recovery (if available)
- [ ] Configure connection pooling (50-100 connections)
- [ ] Enable slow query logging
- [ ] Set up monitoring for database performance

**Task 6.3.3: Queue Setup**

**Checklist**:
- [ ] Set up production Redis cluster
- [ ] Configure persistence (AOF + RDB)
- [ ] Enable Redis authentication
- [ ] Set up Redis monitoring
- [ ] Configure queue retention:
  ```typescript
  defaultJobOptions: {
    removeOnComplete: 1000,  // Keep last 1000 completed
    removeOnFail: 5000       // Keep last 5000 failed
  }
  ```
- [ ] Set up queue metrics dashboard

**Task 6.3.4: CI/CD Pipeline**

**Checklist**:
- [ ] Set up automated testing in CI:
  ```yaml
  # .github/workflows/test.yml
  name: Test
  on: [push, pull_request]
  jobs:
    test:
      runs-on: ubuntu-latest
      steps:
        - uses: actions/checkout@v2
        - uses: actions/setup-node@v2
        - run: npm install
        - run: npm test
        - run: npm run test:integration
  ```
- [ ] Set up automated deployment:
  ```yaml
  # .github/workflows/deploy.yml
  name: Deploy
  on:
    push:
      branches: [main]
  jobs:
    deploy:
      runs-on: ubuntu-latest
      steps:
        - uses: actions/checkout@v2
        - run: npm install
        - run: npm run build
        - run: npm run deploy:prod  # Your deployment script
  ```
- [ ] Configure deployment to staging on PR merge to develop
- [ ] Configure deployment to production on PR merge to main
- [ ] Add manual approval step for production

**Task 6.3.5: Disaster Recovery Plan**

**Checklist**:
- [ ] Document backup locations
- [ ] Document restoration procedures
- [ ] Test database restoration (dry run)
- [ ] Document failover procedures
- [ ] Set up backup region (if multi-region)
- [ ] Create incident response plan
- [ ] Conduct disaster recovery drill

**Estimated Effort**: 40-60 hours (backend + DevOps)

---

### 6.4 Beta Testing (Week 7)

**Task 6.4.1: Limited Production Rollout**

**Strategy**: Deploy to production but enable for limited users only

**Checklist**:
- [ ] Deploy to production environment
- [ ] Enable feature flag for outbound calls
- [ ] Whitelist 2-3 test agents:
  ```typescript
  const BETA_AGENT_IDS = [
    'agent_test_1',
    'agent_test_2'
  ];

  // In API endpoints
  if (!BETA_AGENT_IDS.includes(req.body.agentId)) {
    return res.status(403).json({
      error: 'Outbound calls not yet available for this agent'
    });
  }
  ```
- [ ] Notify beta testers
- [ ] Provide testing instructions
- [ ] Set up feedback collection mechanism

**Task 6.4.2: Beta Monitoring**

**Monitor closely for 7 days**:

**Daily Checklist**:
- [ ] Check error rates
- [ ] Check success rates
- [ ] Check latency metrics
- [ ] Review failed calls (investigate each)
- [ ] Check retry statistics
- [ ] Review Exotel logs
- [ ] Check queue health
- [ ] Review database performance
- [ ] Check for memory leaks
- [ ] Review user feedback

**Weekly Review**:
- [ ] Compile metrics report
- [ ] Document issues found
- [ ] Prioritize fixes
- [ ] Update documentation if needed
- [ ] Decide go/no-go for wider rollout

**Task 6.4.3: Bug Fixes**

**Checklist**:
- [ ] Fix critical bugs immediately
- [ ] Fix high-priority bugs within 24 hours
- [ ] Document known issues
- [ ] Update release notes
- [ ] Deploy fixes to production
- [ ] Verify fixes in production

**Success Criteria for Beta**:
- ✅ >95% success rate
- ✅ <2s latency (p95)
- ✅ <3% error rate
- ✅ No critical bugs
- ✅ Positive user feedback
- ✅ System stable for 5+ consecutive days

**Estimated Effort**: 30-50 hours (1 week, on-call support)

---

### 6.5 Gradual Rollout (Week 8)

**Task 6.5.1: Canary Deployment**

**Strategy**: Gradually increase percentage of agents with access

**Timeline**:
- **Day 1**: 5% of agents (~10 agents if you have 200 total)
- **Day 2**: 10% of agents (~20 agents)
- **Day 3**: 25% of agents (~50 agents)
- **Day 5**: 50% of agents (~100 agents)
- **Day 7**: 100% of agents (full rollout)

**Checklist for Each Stage**:
- [ ] Update feature flag/whitelist
- [ ] Monitor for 4-8 hours
- [ ] Check key metrics:
  - [ ] Error rate <5%
  - [ ] Success rate >90%
  - [ ] Latency <2s (p95)
  - [ ] No infrastructure issues
- [ ] Review feedback from new users
- [ ] If stable, proceed to next stage
- [ ] If issues, halt and investigate

**Rollback Criteria** (stop rollout if):
- Error rate >10%
- Success rate <85%
- Latency >3s (p95)
- Critical bug discovered
- Infrastructure issues (DB, Redis, etc.)
- Negative user feedback trend

**Task 6.5.2: Monitoring During Rollout**

**Real-time Dashboard** (check every hour):

**Checklist**:
- [ ] Total calls (outbound)
- [ ] Success rate %
- [ ] Error rate %
- [ ] Average latency
- [ ] Active calls count
- [ ] Queue depth
- [ ] Deepgram pool utilization
- [ ] Database connections
- [ ] Memory usage
- [ ] CPU usage

**Alert Thresholds**:
- [ ] Error rate >8% for 5 minutes → Page on-call
- [ ] Latency >2.5s p95 for 5 minutes → Alert
- [ ] Queue depth >50 for 10 minutes → Alert
- [ ] Pool utilization >95% for 5 minutes → Alert
- [ ] Any service down → Page on-call immediately

**Task 6.5.3: Communication Plan**

**Checklist**:
- [ ] Announce beta completion (internal)
- [ ] Announce gradual rollout plan (to users)
- [ ] Provide documentation links
- [ ] Set up support channel (Slack, email)
- [ ] Daily status updates (internal)
- [ ] Announce each rollout stage
- [ ] Announce full rollout (100%)
- [ ] Publish case studies / success stories

**Task 6.5.4: Post-Rollout Review**

**After 100% Rollout**:

**Checklist**:
- [ ] Compile final metrics:
  - [ ] Total calls made
  - [ ] Success rate
  - [ ] Average latency
  - [ ] User adoption rate
  - [ ] Cost analysis (actual vs projected)
- [ ] Conduct retrospective:
  - [ ] What went well?
  - [ ] What could be improved?
  - [ ] Lessons learned
  - [ ] Future enhancements
- [ ] Document rollout process
- [ ] Update internal wiki
- [ ] Thank the team!

**Estimated Effort**: 40-60 hours (1 week, distributed)

---

### Phase 6 Deliverables

✅ **Testing**:
- 80%+ unit test coverage
- Comprehensive integration test suite
- Load test results (5, 10, 20 concurrent calls)
- Security testing completed
- Manual QA sign-off

✅ **Documentation**:
- Complete API documentation (Swagger)
- Integration guide with code examples
- Operational runbook
- Internal architecture docs
- Release notes

✅ **Production Infrastructure**:
- Production environment provisioned
- Monitoring and alerting configured
- CI/CD pipeline operational
- Disaster recovery plan in place

✅ **Rollout**:
- Beta testing completed (2-3 agents, 1 week)
- Gradual rollout completed (5% → 100%)
- 100% of agents have access
- System stable in production

✅ **Performance**:
- >95% success rate
- <2s latency (p95)
- <3% error rate
- System handles target concurrent load

### Phase 6 Success Criteria

- ✅ All tests passing (unit, integration, load)
- ✅ Security vulnerabilities addressed
- ✅ Complete documentation published
- ✅ Production environment stable
- ✅ Monitoring and alerting operational
- ✅ Beta testing successful (>95% success rate)
- ✅ Gradual rollout completed without issues
- ✅ 100% of users have access
- ✅ Post-rollout metrics meet targets
- ✅ Positive user feedback
- ✅ Team retrospective completed

**Total Estimated Effort**: 160-230 hours (2-3 weeks, 2-3 engineers)

---

## Summary: Complete Timeline

| Phase | Duration | Team | Key Deliverables | Effort (hours) |
|-------|----------|------|------------------|----------------|
| **Phase 0: Planning** | 3-5 days | Tech Lead + 1 BE | Design docs, environment setup | 16-24 |
| **Phase 1: Foundation** | 1 week | 1 BE | Database, Exotel API, basic calling | 44-60 |
| **Phase 2: Voice Pipeline** | 1 week | 1 BE | WebSocket, voice integration, <2s latency | 34-48 |
| **Phase 3: Scheduling** | 1 week | 1 BE | Bull queue, scheduler, business hours | 42-56 |
| **Phase 4: Retry Logic** | 1 week | 1 BE | Retry manager, exponential backoff, errors | 48-64 |
| **Phase 5: Advanced** | 1 week | 1 BE + 1 FE | Voicemail, bulk ops, optimizations, dashboard | 58-82 |
| **Phase 6: Production** | 2-3 weeks | 1 BE + 1 QA + 1 DevOps | Testing, docs, beta, rollout | 160-230 |
| **TOTAL** | **7-9 weeks** | **2-3 engineers** | **Production-ready outbound calling system** | **402-564 hours** |

---

## Risk Mitigation

### High-Risk Areas

1. **Exotel API Reliability**
   - **Risk**: API downtime or rate limits
   - **Mitigation**: Circuit breaker, retry logic, graceful degradation
   - **Owner**: Backend engineer

2. **Deepgram Connection Pool Exhaustion**
   - **Risk**: More calls than pool capacity
   - **Mitigation**: Queue overflow requests, monitoring, alerts
   - **Owner**: Backend engineer

3. **Database Performance**
   - **Risk**: Slow queries at scale
   - **Mitigation**: Proper indexing, query optimization, connection pooling
   - **Owner**: Backend engineer + DBA

4. **WebSocket Scaling**
   - **Risk**: Can't handle concurrent connections
   - **Mitigation**: Load balancing with sticky sessions, horizontal scaling
   - **Owner**: DevOps engineer

5. **Cost Overrun**
   - **Risk**: Higher than expected API costs (TTS, STT, LLM)
   - **Mitigation**: Cost monitoring, provider optimization, caching
   - **Owner**: Tech Lead

### Contingency Plans

**If Phase 1-2 takes longer**:
- Extend timeline by 1 week
- Consider reducing scope (skip voicemail detection)

**If performance targets not met**:
- Dedicate 1 week to optimization
- Defer advanced features to v2

**If Exotel API has issues**:
- Work with Exotel support
- Consider backup provider (Twilio, Plivo)

**If team capacity reduced**:
- Prioritize core features (Phases 1-4)
- Defer dashboard and bulk operations

---

## Success Metrics

### Technical Metrics

- ✅ **Latency**: <2s (p95) from customer speech to AI response
- ✅ **Success Rate**: >95% of initiated calls connect and complete
- ✅ **Error Rate**: <3% overall error rate
- ✅ **Availability**: 99.5% uptime (max 3.6 hours downtime/month)
- ✅ **Retry Success**: >60% of retried calls succeed

### Business Metrics

- ✅ **Adoption**: 80%+ of agents use outbound calling within 1 month
- ✅ **Volume**: Handle 10,000+ outbound calls in first month
- ✅ **Cost**: Stay within $0.10 per call budget
- ✅ **Satisfaction**: NPS >50 from users

### Operational Metrics

- ✅ **Deployment**: Zero-downtime deployments
- ✅ **MTTR**: Mean time to recovery <30 minutes
- ✅ **Test Coverage**: >80% code coverage
- ✅ **Documentation**: 100% of public APIs documented

---

## Post-Launch Roadmap (v2)

**Potential Enhancements** (after successful v1 rollout):

1. **Advanced Voicemail Detection** (AI-based)
2. **Predictive Dialing** (initiate calls before agent available)
3. **Call Recording Transcription** (async)
4. **Multi-language Support** (40+ languages)
5. **Advanced Analytics** (sentiment analysis, topic extraction)
6. **A/B Testing** (test different greetings, agents)
7. **CRM Integration** (Salesforce, HubSpot)
8. **White-label Solution** (for resellers)
9. **Mobile App** (manage calls on-the-go)
10. **Voice Analytics Dashboard** (deep insights)

---

**Document Version**: 1.0
**Last Updated**: 2025-11-01
**Status**: Ready for Execution
