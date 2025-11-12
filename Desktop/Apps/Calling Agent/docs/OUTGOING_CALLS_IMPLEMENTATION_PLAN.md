# Ultra Low Latency Outgoing Calls - Implementation Plan

## Executive Summary

This document provides a comprehensive plan to implement ultra low latency outgoing calls, leveraging the existing incoming call infrastructure that achieves **1.4-1.85 seconds total latency**. The implementation will reuse 80%+ of the current architecture while adding outbound-specific components for call initiation, scheduling, retry logic, and state management.

**Target Performance**: Sub-2 second latency (same as incoming calls)
**Target Concurrency**: 20-30 concurrent outbound calls (initial), 100+ (scaled)
**Key Innovation**: Reuse streaming pipeline + add proactive call orchestration

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Reusable Components](#2-reusable-components)
3. [New Components Required](#3-new-components-required)
4. [Detailed Implementation Plan](#4-detailed-implementation-plan)
5. [API Design](#5-api-design)
6. [Database Schema](#6-database-schema)
7. [Call Flow Diagrams](#7-call-flow-diagrams)
8. [Performance Optimization](#8-performance-optimization)
9. [Error Handling & Retry Logic](#9-error-handling--retry-logic)
10. [Concurrency & Scaling](#10-concurrency--scaling)
11. [Testing Strategy](#11-testing-strategy)
12. [Deployment & Rollout](#12-deployment--rollout)
13. [Cost Analysis](#13-cost-analysis)
14. [Timeline & Milestones](#14-timeline--milestones)

---

## 1. Architecture Overview

### 1.1 High-Level Comparison

| Aspect | Incoming Calls | Outgoing Calls |
|--------|---------------|----------------|
| **Initiator** | Customer | System |
| **Trigger** | Exotel webhook | API request / Schedule |
| **WebSocket** | Exotel initiates | System initiates (same as incoming after connection) |
| **First Speaker** | Customer | AI (typically) |
| **Call States** | Connected → Conversation → Ended | Initiated → Ringing → Connected → Conversation → Ended |
| **Failure Modes** | Connection errors | No answer, busy, voicemail, network failure |
| **Scheduling** | N/A | Required |
| **Retry Logic** | N/A | Required |
| **Concurrency Control** | WebSocket limit | API rate limits + call volume limits |

### 1.2 Architectural Approach

```
┌─────────────────────────────────────────────────────────┐
│              OUTGOING CALL SYSTEM                        │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ┌────────────────────┐      ┌──────────────────┐      │
│  │  Call Scheduler    │      │  Retry Manager   │      │
│  │  (Bull Queue)      │      │  (Exponential    │      │
│  │                    │      │   Backoff)       │      │
│  └──────────┬─────────┘      └─────────┬────────┘      │
│             │                           │               │
│             ▼                           ▼               │
│  ┌──────────────────────────────────────────────┐      │
│  │      Outgoing Call Orchestrator              │      │
│  │  • Call initiation                           │      │
│  │  • State management                          │      │
│  │  • Concurrent call tracking                  │      │
│  └──────────────────┬───────────────────────────┘      │
│                     │                                   │
│                     ▼                                   │
│  ┌──────────────────────────────────────────────┐      │
│  │         Exotel Call API Client               │      │
│  │  POST /v2/accounts/:sid/calls                │      │
│  └──────────────────┬───────────────────────────┘      │
│                     │                                   │
└─────────────────────┼───────────────────────────────────┘
                      │
                      ▼
         ┌────────────────────────┐
         │      Exotel API         │
         │  • Initiates call       │
         │  • Returns call SID     │
         │  • Sends status updates │
         └────────────┬─────────────┘
                      │
                      ▼
         ┌────────────────────────┐
         │   Customer Phone        │
         │  • Rings                │
         │  • Answers/Declines     │
         └────────────┬─────────────┘
                      │
                      │ (Call Answered)
                      ▼
         ┌────────────────────────┐
         │   Exotel Webhook        │
         │  • Call connected       │
         │  • Returns WebSocket URL│
         └────────────┬─────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────┐
│  EXISTING VOICE PIPELINE (Reused 100%)                  │
│  ┌──────────────────────────────────────────────┐      │
│  │  WebSocket Handler                           │      │
│  │  • Deepgram STT (streaming + VAD)            │      │
│  │  • LLM processing (parallel on partials)     │      │
│  │  • ElevenLabs/Deepgram TTS (streaming)       │      │
│  │  • Audio conversion & chunking               │      │
│  └──────────────────────────────────────────────┘      │
└─────────────────────────────────────────────────────────┘
```

**Key Insight**: Everything after "Call Answered" is **identical** to incoming calls. We only need to implement the orchestration layer above it.

---

## 2. Reusable Components

### 2.1 Can Be Reused 100% (No Changes)

| Component | File | Purpose |
|-----------|------|---------|
| **Voice Pipeline Service** | `backend/src/services/voicePipeline.service.ts` | LLM conversation, RAG, transcript management |
| **Deepgram STT Service** | `backend/src/services/deepgram.service.ts` | Streaming speech-to-text |
| **Deepgram Connection Pool** | `backend/src/services/deepgramConnectionPool.service.ts` | Connection management (20 concurrent) |
| **ElevenLabs TTS Service** | `backend/src/services/elevenlabsTTS.service.ts` | Streaming text-to-speech |
| **Deepgram TTS Service** | `backend/src/services/deepgramTTS.service.ts` | Alternative TTS provider |
| **Audio Converter** | `backend/src/utils/audioConverter.ts` | PCM/MP3/WAV conversions |
| **OpenAI Service** | `backend/src/services/openai.service.ts` | LLM + fallback STT |
| **RAG Service** | `backend/src/services/rag.service.ts` | Knowledge base queries |

**Total Reusable Code**: ~3,500 lines (80% of current codebase)

### 2.2 Can Be Extended (Minor Changes)

| Component | File | Changes Needed |
|-----------|------|----------------|
| **WebSocket Handler** | `backend/src/websocket/handlers/exotelVoice.handler.ts` | Add outbound-specific initialization logic |
| **Call Log Model** | `backend/src/models/CallLog.ts` | Add outbound-specific fields |
| **WebSocket Server** | `backend/src/websocket/websocket.server.ts` | No changes (already handles path-based routing) |

**Estimated Changes**: ~200 lines of code

---

## 3. New Components Required

### 3.1 Outgoing Call Service

**Purpose**: Core orchestration for initiating and managing outbound calls

**Responsibilities**:
- Call Exotel API to initiate calls
- Track call state transitions
- Handle concurrent call limits
- Interface with scheduler and retry manager

**File**: `backend/src/services/outgoingCall.service.ts`

**Key Methods**:
```typescript
class OutgoingCallService {
  // Initiate a single call immediately
  async initiateCall(params: OutgoingCallParams): Promise<string>

  // Get current call status
  async getCallStatus(callLogId: string): Promise<CallStatus>

  // Cancel an in-progress call
  async cancelCall(callLogId: string): Promise<void>

  // Bulk initiate multiple calls
  async bulkInitiateCalls(params: OutgoingCallParams[]): Promise<string[]>

  // Get active outbound call count
  async getActiveCalls(): Promise<number>

  // Check if can initiate new call (concurrency limit)
  async canInitiateCall(): Promise<boolean>
}
```

**Estimated Lines**: ~400

### 3.2 Call Scheduler

**Purpose**: Schedule calls for future execution with priority queuing

**Responsibilities**:
- Queue calls for future execution
- Process queue at scheduled times
- Handle timezone conversions
- Implement business hours logic
- Support recurring calls

**File**: `backend/src/services/callScheduler.service.ts`

**Technology**: Bull queue (Redis-backed job queue)

**Key Methods**:
```typescript
class CallScheduler {
  // Add call to schedule
  async scheduleCall(params: ScheduledCallParams): Promise<string>

  // Update scheduled time
  async rescheduleCall(scheduleId: string, newTime: Date): Promise<void>

  // Cancel scheduled call
  async cancelScheduledCall(scheduleId: string): Promise<void>

  // List scheduled calls
  async getScheduledCalls(filters: ScheduleFilters): Promise<ScheduledCall[]>

  // Schedule recurring calls (daily, weekly, monthly)
  async scheduleRecurringCall(params: RecurringCallParams): Promise<string>
}
```

**Estimated Lines**: ~350

### 3.3 Retry Manager

**Purpose**: Handle call failures with intelligent retry logic

**Responsibilities**:
- Track failed calls
- Implement exponential backoff
- Respect retry limits
- Handle different failure types (no answer, busy, error)

**File**: `backend/src/services/retryManager.service.ts`

**Key Methods**:
```typescript
class RetryManager {
  // Schedule retry for failed call
  async scheduleRetry(callLogId: string, reason: FailureReason): Promise<void>

  // Get retry history for a call
  async getRetryHistory(callLogId: string): Promise<RetryAttempt[]>

  // Cancel pending retries
  async cancelRetries(callLogId: string): Promise<void>

  // Check if should retry based on failure type
  shouldRetry(reason: FailureReason, attemptCount: number): boolean

  // Calculate next retry delay (exponential backoff)
  calculateRetryDelay(attemptCount: number): number
}
```

**Retry Strategy**:
```typescript
const RETRY_CONFIG = {
  'no_answer': {
    maxRetries: 3,
    baseDelay: 300000,      // 5 minutes
    maxDelay: 3600000       // 1 hour
  },
  'busy': {
    maxRetries: 3,
    baseDelay: 600000,      // 10 minutes
    maxDelay: 7200000       // 2 hours
  },
  'network_error': {
    maxRetries: 5,
    baseDelay: 60000,       // 1 minute
    maxDelay: 900000        // 15 minutes
  },
  'voicemail': {
    maxRetries: 0,          // Don't retry voicemail
  },
  'invalid_number': {
    maxRetries: 0,          // Don't retry invalid numbers
  }
};

// Exponential backoff: delay = baseDelay * (2 ^ attempt)
function calculateDelay(reason: string, attempt: number): number {
  const config = RETRY_CONFIG[reason];
  const delay = config.baseDelay * Math.pow(2, attempt - 1);
  return Math.min(delay, config.maxDelay);
}
```

**Estimated Lines**: ~300

### 3.4 Exotel Outbound API Client

**Purpose**: Interface with Exotel's Call API

**Responsibilities**:
- Make HTTP requests to Exotel API
- Handle authentication
- Parse responses
- Handle rate limits

**File**: `backend/src/services/exotelOutbound.service.ts`

**Key Methods**:
```typescript
class ExotelOutboundService {
  // Initiate outbound call
  async makeCall(params: ExotelCallParams): Promise<ExotelCallResponse>

  // Get call details
  async getCallDetails(callSid: string): Promise<ExotelCallDetails>

  // Hangup call
  async hangupCall(callSid: string): Promise<void>

  // Get call recording URL
  async getRecordingUrl(callSid: string): Promise<string>
}
```

**Exotel API Request**:
```typescript
POST https://api.exotel.com/v2/accounts/{account_sid}/calls

Headers:
  Authorization: Basic {base64(api_key:api_token)}
  Content-Type: application/json

Body:
{
  "from": "{exotel_virtual_number}",
  "to": "{customer_number}",
  "caller_id": "{exotel_virtual_number}",
  "app_id": "{voice_app_id}",
  "custom_field": "{call_log_id}"
}

Response:
{
  "sid": "call_sid_123",
  "status": "queued",
  "from": "+911234567890",
  "to": "+919876543210",
  "direction": "outbound-api"
}
```

**Estimated Lines**: ~250

### 3.5 Outbound WebSocket Handler Extension

**Purpose**: Handle outbound-specific WebSocket logic

**Responsibilities**:
- Detect outbound vs inbound calls
- Send proactive greeting (AI speaks first)
- Handle "no answer" timeout
- Voicemail detection

**File**: `backend/src/websocket/handlers/outboundVoice.handler.ts`

**Approach**: Extend existing `ExotelVoiceHandler` class

```typescript
class OutboundVoiceHandler extends ExotelVoiceHandler {
  protected async handleConnection(
    client: WebSocketClient,
    callLogId: string
  ): Promise<void> {
    // 1. Load call log
    const callLog = await CallLog.findById(callLogId).populate('agentId');

    // 2. Check call direction
    if (callLog.direction === 'outbound') {
      // Outbound-specific logic
      await this.handleOutboundConnection(client, callLog);
    } else {
      // Standard incoming call logic
      await super.handleConnection(client, callLogId);
    }
  }

  private async handleOutboundConnection(
    client: WebSocketClient,
    callLog: CallLog
  ): Promise<void> {
    // 1. Initialize session (same as incoming)
    const session = await this.initializeSession(client, callLog);

    // 2. Send proactive greeting (AI speaks first)
    await this.sendProactiveGreeting(client, session);

    // 3. Wait for customer response
    // If no response in 10 seconds, prompt again
    session.noResponseTimeout = setTimeout(() => {
      this.handleNoInitialResponse(client, session);
    }, 10000);

    // 4. Listen for speech (same as incoming from here)
    // ... existing logic
  }

  private async sendProactiveGreeting(
    client: WebSocketClient,
    session: VoiceSession
  ): Promise<void> {
    const greeting = session.agent.config.outboundGreeting ||
                     `Hello! This is ${session.agent.name}. How can I help you today?`;

    // Use streaming TTS (same as incoming)
    await this.streamTTSToExotel(client, greeting, session);

    // Add to transcript
    await this.saveTranscript(session.callLogId, 'assistant', greeting);
  }

  private async handleNoInitialResponse(
    client: WebSocketClient,
    session: VoiceSession
  ): Promise<void> {
    const prompt = "Hello? Are you there?";
    await this.streamTTSToExotel(client, prompt, session);

    // Wait another 5 seconds
    session.noResponseTimeout = setTimeout(() => {
      // Still no response - hang up
      this.endCall(client, session, 'no_response');
    }, 5000);
  }
}
```

**Estimated Lines**: ~200

### 3.6 Voicemail Detection

**Purpose**: Detect when call goes to voicemail and leave pre-recorded message

**Responsibilities**:
- Analyze audio patterns (beep detection)
- Timing analysis (long greeting = voicemail)
- Leave voicemail message
- Hang up gracefully

**File**: `backend/src/services/voicemailDetector.service.ts`

**Strategy**:
```typescript
class VoicemailDetector {
  // Analyze audio chunk for beep frequency (800-1200 Hz)
  async detectBeep(audioChunk: Buffer): Promise<boolean>

  // Check if greeting duration exceeds threshold (>8 seconds = voicemail)
  isLikelyVoicemail(greetingDuration: number): boolean

  // Leave voicemail message
  async leaveVoicemail(
    client: WebSocketClient,
    session: VoiceSession
  ): Promise<void> {
    const message = session.agent.config.voicemailMessage ||
                    `Hello, this is ${session.agent.name}. Please call us back at...`;

    // Send pre-recorded message
    await this.streamTTSToExotel(client, message, session);

    // Wait 2 seconds, then hang up
    await sleep(2000);
    await this.endCall(client, session, 'voicemail');
  }
}
```

**Detection Heuristics**:
1. **Beep Detection**: Frequency analysis for 800-1200 Hz tone
2. **Duration Analysis**: Greeting >8 seconds = likely voicemail
3. **Silence Pattern**: Long silence (>5s) after greeting
4. **Speech Pattern**: No conversational responses

**Estimated Lines**: ~250

---

## 4. Detailed Implementation Plan

### Phase 1: Core Infrastructure (Week 1-2)

#### Task 1.1: Database Schema Updates
- [ ] Add outbound-specific fields to `CallLog` model
- [ ] Create `ScheduledCall` model
- [ ] Create `RetryAttempt` model
- [ ] Add indexes for performance
- [ ] Migration scripts

**Files**:
- `backend/src/models/CallLog.ts`
- `backend/src/models/ScheduledCall.ts`
- `backend/src/models/RetryAttempt.ts`
- `backend/src/migrations/001_add_outbound_fields.ts`

#### Task 1.2: Exotel Outbound API Client
- [ ] Implement `ExotelOutboundService`
- [ ] Add authentication
- [ ] Add error handling
- [ ] Add rate limiting
- [ ] Unit tests

**Files**:
- `backend/src/services/exotelOutbound.service.ts`
- `backend/tests/services/exotelOutbound.test.ts`

#### Task 1.3: Outgoing Call Service (Basic)
- [ ] Implement `OutgoingCallService`
- [ ] Add `initiateCall` method
- [ ] Add concurrency tracking
- [ ] Add status checking
- [ ] Unit tests

**Files**:
- `backend/src/services/outgoingCall.service.ts`
- `backend/tests/services/outgoingCall.test.ts`

**Deliverable**: Can initiate a single outbound call manually

---

### Phase 2: WebSocket Integration (Week 2-3)

#### Task 2.1: Extend WebSocket Handler
- [ ] Create `OutboundVoiceHandler` extending `ExotelVoiceHandler`
- [ ] Implement outbound connection initialization
- [ ] Implement proactive greeting
- [ ] Add "no response" timeout handling
- [ ] Integration tests

**Files**:
- `backend/src/websocket/handlers/outboundVoice.handler.ts`
- `backend/tests/websocket/outboundVoice.test.ts`

#### Task 2.2: Update Call Log Model
- [ ] Add `direction` field ('inbound' | 'outbound')
- [ ] Add `outboundStatus` field
- [ ] Add `scheduledFor` field
- [ ] Add `retryCount` field
- [ ] Update indexes

**Files**:
- `backend/src/models/CallLog.ts`

#### Task 2.3: End-to-End Testing
- [ ] Test manual outbound call
- [ ] Verify WebSocket connection
- [ ] Verify streaming pipeline works
- [ ] Verify call transcript saves correctly
- [ ] Verify performance (latency <2s)

**Deliverable**: Fully functional manual outbound call with streaming pipeline

---

### Phase 3: Scheduling & Retry (Week 3-4)

#### Task 3.1: Call Scheduler
- [ ] Set up Bull queue with Redis
- [ ] Implement `CallScheduler` service
- [ ] Add queue processing logic
- [ ] Add timezone handling
- [ ] Add business hours logic
- [ ] Unit tests

**Files**:
- `backend/src/services/callScheduler.service.ts`
- `backend/src/queues/outboundCalls.queue.ts`
- `backend/tests/services/callScheduler.test.ts`

#### Task 3.2: Retry Manager
- [ ] Implement `RetryManager` service
- [ ] Add exponential backoff logic
- [ ] Add failure type handling
- [ ] Add retry limit enforcement
- [ ] Unit tests

**Files**:
- `backend/src/services/retryManager.service.ts`
- `backend/tests/services/retryManager.test.ts`

#### Task 3.3: Integration
- [ ] Connect scheduler to outgoing call service
- [ ] Connect retry manager to outgoing call service
- [ ] Add webhook handlers for call status updates
- [ ] Integration tests

**Files**:
- `backend/src/routes/webhooks.routes.ts`
- `backend/tests/integration/outbound.test.ts`

**Deliverable**: Can schedule calls and automatically retry failures

---

### Phase 4: Advanced Features (Week 4-5)

#### Task 4.1: Voicemail Detection
- [ ] Implement `VoicemailDetector` service
- [ ] Add beep detection algorithm
- [ ] Add duration-based detection
- [ ] Add voicemail message handling
- [ ] Unit tests

**Files**:
- `backend/src/services/voicemailDetector.service.ts`
- `backend/tests/services/voicemailDetector.test.ts`

#### Task 4.2: Bulk Operations
- [ ] Implement `bulkInitiateCalls` in `OutgoingCallService`
- [ ] Add CSV import functionality
- [ ] Add batch scheduling
- [ ] Add progress tracking
- [ ] Unit tests

**Files**:
- `backend/src/services/outgoingCall.service.ts`
- `backend/src/routes/bulkCalls.routes.ts`
- `backend/tests/routes/bulkCalls.test.ts`

#### Task 4.3: Monitoring & Analytics
- [ ] Add outbound call metrics to stats API
- [ ] Add success/failure rate tracking
- [ ] Add average call duration tracking
- [ ] Add retry rate tracking
- [ ] Dashboard integration

**Files**:
- `backend/src/routes/stats.routes.ts`
- `backend/src/services/analytics.service.ts`

**Deliverable**: Production-ready outbound calling system with full feature set

---

### Phase 5: Testing & Optimization (Week 5-6)

#### Task 5.1: Load Testing
- [ ] Test with 10 concurrent outbound calls
- [ ] Test with 20 concurrent outbound calls
- [ ] Test with 50 concurrent outbound calls
- [ ] Identify bottlenecks
- [ ] Optimize as needed

#### Task 5.2: Edge Case Testing
- [ ] Test no answer scenarios
- [ ] Test busy signals
- [ ] Test voicemail scenarios
- [ ] Test network failures
- [ ] Test invalid numbers

#### Task 5.3: Performance Optimization
- [ ] Profile latency at each stage
- [ ] Optimize slow paths
- [ ] Pre-warm Deepgram connections for scheduled calls
- [ ] Cache greeting audio
- [ ] Reduce memory usage

**Deliverable**: Verified performance and reliability at scale

---

## 5. API Design

### 5.1 Outbound Call Endpoints

#### POST /api/v1/calls/outbound

**Description**: Initiate an immediate outbound call

**Request Body**:
```json
{
  "phoneNumber": "+919876543210",
  "agentId": "agent_123",
  "metadata": {
    "campaignId": "summer_sale_2025",
    "customerId": "cust_456"
  },
  "priority": "high"
}
```

**Response** (202 Accepted):
```json
{
  "callLogId": "call_789",
  "status": "initiated",
  "message": "Call is being initiated",
  "estimatedStartTime": "2025-11-01T14:30:15.000Z"
}
```

**Error Responses**:
- `400 Bad Request`: Invalid phone number or agent ID
- `429 Too Many Requests`: Concurrent call limit reached
- `503 Service Unavailable`: Exotel API unavailable

---

#### POST /api/v1/calls/outbound/schedule

**Description**: Schedule an outbound call for future execution

**Request Body**:
```json
{
  "phoneNumber": "+919876543210",
  "agentId": "agent_123",
  "scheduledFor": "2025-11-02T10:00:00Z",
  "timezone": "Asia/Kolkata",
  "metadata": {
    "appointmentId": "appt_789"
  },
  "respectBusinessHours": true,
  "businessHours": {
    "start": "09:00",
    "end": "18:00",
    "timezone": "Asia/Kolkata"
  }
}
```

**Response** (201 Created):
```json
{
  "scheduleId": "sched_456",
  "callLogId": "call_789",
  "scheduledFor": "2025-11-02T10:00:00Z",
  "status": "scheduled",
  "message": "Call scheduled successfully"
}
```

---

#### POST /api/v1/calls/outbound/bulk

**Description**: Initiate multiple outbound calls in batch

**Request Body**:
```json
{
  "calls": [
    {
      "phoneNumber": "+919876543210",
      "agentId": "agent_123",
      "metadata": { "leadId": "lead_1" }
    },
    {
      "phoneNumber": "+919876543211",
      "agentId": "agent_123",
      "metadata": { "leadId": "lead_2" }
    }
  ],
  "priority": "medium",
  "throttle": {
    "maxConcurrent": 5,
    "delayBetweenCalls": 2000
  }
}
```

**Response** (202 Accepted):
```json
{
  "batchId": "batch_123",
  "totalCalls": 2,
  "status": "processing",
  "callLogIds": ["call_789", "call_790"],
  "estimatedCompletionTime": "2025-11-01T14:35:00.000Z"
}
```

---

#### GET /api/v1/calls/:callLogId

**Description**: Get call details and status

**Response** (200 OK):
```json
{
  "callLogId": "call_789",
  "direction": "outbound",
  "phoneNumber": "+919876543210",
  "agentId": "agent_123",
  "status": "in-progress",
  "outboundStatus": "connected",
  "startedAt": "2025-11-01T14:30:15.000Z",
  "duration": 45,
  "transcript": [
    {
      "speaker": "assistant",
      "text": "Hello! This is Sarah from XYZ Company.",
      "timestamp": "2025-11-01T14:30:20.000Z"
    },
    {
      "speaker": "user",
      "text": "Hi, yes, I was expecting your call.",
      "timestamp": "2025-11-01T14:30:25.000Z"
    }
  ],
  "metadata": {
    "campaignId": "summer_sale_2025"
  }
}
```

---

#### POST /api/v1/calls/:callLogId/cancel

**Description**: Cancel a scheduled or in-progress call

**Response** (200 OK):
```json
{
  "callLogId": "call_789",
  "status": "cancelled",
  "message": "Call cancelled successfully"
}
```

---

#### GET /api/v1/calls/scheduled

**Description**: List all scheduled calls

**Query Parameters**:
- `agentId` (optional): Filter by agent
- `from` (optional): Start date filter
- `to` (optional): End date filter
- `status` (optional): Filter by status
- `page` (default: 1)
- `limit` (default: 50)

**Response** (200 OK):
```json
{
  "total": 150,
  "page": 1,
  "limit": 50,
  "calls": [
    {
      "scheduleId": "sched_456",
      "callLogId": "call_789",
      "phoneNumber": "+919876543210",
      "agentId": "agent_123",
      "scheduledFor": "2025-11-02T10:00:00Z",
      "status": "scheduled",
      "metadata": {}
    }
  ]
}
```

---

#### GET /api/v1/calls/outbound/stats

**Description**: Get outbound call statistics

**Query Parameters**:
- `from` (optional): Start date
- `to` (optional): End date
- `agentId` (optional): Filter by agent

**Response** (200 OK):
```json
{
  "period": {
    "from": "2025-11-01T00:00:00Z",
    "to": "2025-11-01T23:59:59Z"
  },
  "totalCalls": 250,
  "successful": 180,
  "failed": 70,
  "successRate": 72.0,
  "failureBreakdown": {
    "no_answer": 35,
    "busy": 15,
    "voicemail": 10,
    "invalid_number": 5,
    "network_error": 5
  },
  "averageDuration": 125,
  "totalDuration": 22500,
  "retryRate": 28.0,
  "totalRetries": 70,
  "scheduledCalls": 45,
  "activeCalls": 12
}
```

---

### 5.2 Webhook Endpoints (Exotel → System)

#### POST /api/v1/webhooks/exotel/call-status

**Description**: Receive call status updates from Exotel

**Request Body** (from Exotel):
```json
{
  "CallSid": "call_sid_123",
  "CallStatus": "completed",
  "CallDuration": "125",
  "CustomField": "call_789",
  "RecordingUrl": "https://exotel.com/recordings/rec_123.mp3"
}
```

**Possible CallStatus values**:
- `queued`: Call is queued
- `ringing`: Phone is ringing
- `in-progress`: Call is connected
- `completed`: Call ended normally
- `busy`: Recipient is busy
- `failed`: Call failed
- `no-answer`: No one answered

**Handler Logic**:
```typescript
async handleCallStatus(body: ExotelWebhook) {
  const callLogId = body.CustomField;
  const callLog = await CallLog.findById(callLogId);

  switch (body.CallStatus) {
    case 'ringing':
      await CallLog.updateOne({ _id: callLogId }, {
        outboundStatus: 'ringing',
        exotelCallSid: body.CallSid
      });
      break;

    case 'in-progress':
      await CallLog.updateOne({ _id: callLogId }, {
        status: 'in-progress',
        outboundStatus: 'connected',
        startedAt: new Date()
      });
      break;

    case 'completed':
      await CallLog.updateOne({ _id: callLogId }, {
        status: 'completed',
        endedAt: new Date(),
        duration: parseInt(body.CallDuration),
        recordingUrl: body.RecordingUrl
      });
      break;

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
  }
}
```

---

## 6. Database Schema

### 6.1 CallLog Model Updates

**File**: `backend/src/models/CallLog.ts`

```typescript
interface ICallLog extends Document {
  // Existing fields
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
  duration?: number; // seconds

  // NEW: Outbound-specific fields
  direction: 'inbound' | 'outbound';
  outboundStatus?: 'queued' | 'ringing' | 'connected' | 'no_answer' | 'busy' | 'voicemail';
  scheduledFor?: Date;
  initiatedAt?: Date;
  retryCount: number;
  retryOf?: mongoose.Types.ObjectId; // Reference to original call if this is a retry
  failureReason?: 'no_answer' | 'busy' | 'voicemail' | 'invalid_number' | 'network_error' | 'cancelled';
  exotelCallSid?: string;
  recordingUrl?: string;

  // Metadata
  metadata?: {
    campaignId?: string;
    customerId?: string;
    leadId?: string;
    priority?: 'low' | 'medium' | 'high';
    [key: string]: any;
  };
}

const CallLogSchema = new Schema<ICallLog>({
  // ... existing fields ...

  direction: {
    type: String,
    enum: ['inbound', 'outbound'],
    required: true,
    default: 'inbound'
  },
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
  exotelCallSid: String,
  recordingUrl: String,
  metadata: Schema.Types.Mixed
}, {
  timestamps: true
});

// Indexes for performance
CallLogSchema.index({ direction: 1, status: 1 });
CallLogSchema.index({ scheduledFor: 1 });
CallLogSchema.index({ agentId: 1, direction: 1, createdAt: -1 });
CallLogSchema.index({ 'metadata.campaignId': 1 });
CallLogSchema.index({ exotelCallSid: 1 });
```

### 6.2 ScheduledCall Model (NEW)

**File**: `backend/src/models/ScheduledCall.ts`

```typescript
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
    start: string; // "09:00"
    end: string;   // "18:00"
    timezone: string;
    daysOfWeek?: number[]; // 0=Sun, 1=Mon, ... 6=Sat
  };

  // Recurring settings
  recurring?: {
    frequency: 'daily' | 'weekly' | 'monthly';
    interval: number; // Every N days/weeks/months
    endDate?: Date;
    maxOccurrences?: number;
  };

  metadata?: any;

  // Processing metadata
  processedAt?: Date;
  failedAt?: Date;
  failureReason?: string;
  nextRun?: Date; // For recurring calls
}

const ScheduledCallSchema = new Schema<IScheduledCall>({
  callLogId: {
    type: Schema.Types.ObjectId,
    ref: 'CallLog',
    required: true
  },
  phoneNumber: {
    type: String,
    required: true
  },
  agentId: {
    type: Schema.Types.ObjectId,
    ref: 'Agent',
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
    default: 'pending'
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
    interval: Number,
    endDate: Date,
    maxOccurrences: Number
  },
  metadata: Schema.Types.Mixed,
  processedAt: Date,
  failedAt: Date,
  failureReason: String,
  nextRun: Date
}, {
  timestamps: true
});

// Indexes
ScheduledCallSchema.index({ scheduledFor: 1, status: 1 });
ScheduledCallSchema.index({ agentId: 1, scheduledFor: 1 });
ScheduledCallSchema.index({ status: 1, scheduledFor: 1 });
```

### 6.3 RetryAttempt Model (NEW)

**File**: `backend/src/models/RetryAttempt.ts`

```typescript
interface IRetryAttempt extends Document {
  originalCallLogId: mongoose.Types.ObjectId;
  retryCallLogId?: mongoose.Types.ObjectId;
  attemptNumber: number;
  scheduledFor: Date;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  failureReason: string;
  processedAt?: Date;
  metadata?: any;
}

const RetryAttemptSchema = new Schema<IRetryAttempt>({
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
    required: true
  },
  scheduledFor: {
    type: Date,
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'failed', 'cancelled'],
    default: 'pending'
  },
  failureReason: {
    type: String,
    required: true
  },
  processedAt: Date,
  metadata: Schema.Types.Mixed
}, {
  timestamps: true
});

// Indexes
RetryAttemptSchema.index({ originalCallLogId: 1, attemptNumber: 1 });
RetryAttemptSchema.index({ scheduledFor: 1, status: 1 });
```

---

## 7. Call Flow Diagrams

### 7.1 Immediate Outbound Call Flow

```
┌──────────────────────────────────────────────────────────────────┐
│ 1. API Request                                                    │
│    POST /api/v1/calls/outbound                                   │
│    { phoneNumber, agentId, metadata }                            │
└───────────────────────┬──────────────────────────────────────────┘
                        │
                        ▼
┌──────────────────────────────────────────────────────────────────┐
│ 2. Outgoing Call Service                                         │
│    • Validate input (phone number format, agent exists)          │
│    • Check concurrent call limit (20 max)                        │
│    • Create CallLog (direction: 'outbound', status: 'initiated') │
└───────────────────────┬──────────────────────────────────────────┘
                        │
                        ▼
┌──────────────────────────────────────────────────────────────────┐
│ 3. Exotel API Call                                               │
│    POST /v2/accounts/:sid/calls                                  │
│    {                                                             │
│      from: exotel_number,                                        │
│      to: customer_number,                                        │
│      app_id: voice_app_id,                                       │
│      custom_field: callLogId                                     │
│    }                                                             │
└───────────────────────┬──────────────────────────────────────────┘
                        │
                        ▼
┌──────────────────────────────────────────────────────────────────┐
│ 4. Exotel Processing                                             │
│    Status: queued → ringing                                      │
│    Sends webhook: CallStatus = 'ringing'                         │
└───────────────────────┬──────────────────────────────────────────┘
                        │
                        ├─────────────┬─────────────┬──────────────┐
                        │             │             │              │
                        ▼             ▼             ▼              ▼
         ┌──────────────┐  ┌──────────────┐  ┌──────────┐  ┌───────────┐
         │ Customer     │  │ No Answer    │  │ Busy     │  │ Failed    │
         │ Answers      │  │              │  │          │  │           │
         └──────┬───────┘  └──────┬───────┘  └────┬─────┘  └─────┬─────┘
                │                 │               │              │
                │                 ▼               ▼              ▼
                │        ┌─────────────────────────────────────────┐
                │        │ Schedule Retry (RetryManager)           │
                │        │ • No answer: retry in 5 min             │
                │        │ • Busy: retry in 10 min                 │
                │        │ • Failed: retry in 1 min                │
                │        └─────────────────────────────────────────┘
                │
                ▼
┌──────────────────────────────────────────────────────────────────┐
│ 5. Call Connected                                                │
│    Exotel sends webhook: CallStatus = 'in-progress'              │
│    Update CallLog: status = 'in-progress', startedAt = now       │
└───────────────────────┬──────────────────────────────────────────┘
                        │
                        ▼
┌──────────────────────────────────────────────────────────────────┐
│ 6. Exotel Requests WebSocket URL                                 │
│    Our webhook returns:                                          │
│    wss://our-domain.com/ws/exotel/voice/:callLogId              │
└───────────────────────┬──────────────────────────────────────────┘
                        │
                        ▼
┌──────────────────────────────────────────────────────────────────┐
│ 7. WebSocket Connection Established                              │
│    OutboundVoiceHandler.handleConnection()                       │
│    • Load CallLog and Agent config                               │
│    • Initialize VoiceSession                                     │
│    • Acquire Deepgram connection from pool                       │
└───────────────────────┬──────────────────────────────────────────┘
                        │
                        ▼
┌──────────────────────────────────────────────────────────────────┐
│ 8. Send Proactive Greeting (AI speaks first)                    │
│    "Hello! This is Sarah from XYZ Company. How can I help?"     │
│    • Use streaming TTS (Deepgram/ElevenLabs)                    │
│    • Convert to PCM, chunk, send to Exotel                      │
│    • Save to transcript                                          │
└───────────────────────┬──────────────────────────────────────────┘
                        │
                        ▼
┌──────────────────────────────────────────────────────────────────┐
│ 9. Wait for Customer Response                                    │
│    Start 10-second timeout                                       │
│    If no speech detected → "Hello? Are you there?"               │
│    If still no response (5s) → Hang up (status: no_response)    │
└───────────────────────┬──────────────────────────────────────────┘
                        │
                        ▼
┌──────────────────────────────────────────────────────────────────┐
│ 10. Customer Speaks                                              │
│     Audio chunks → Deepgram STT (streaming)                      │
│     Clear no-response timeout                                    │
└───────────────────────┬──────────────────────────────────────────┘
                        │
                        ▼
┌──────────────────────────────────────────────────────────────────┐
│ 11-15. STREAMING VOICE PIPELINE (Same as Incoming)              │
│     • Deepgram VAD detects speech end (UtteranceEnd)             │
│     • Parallel LLM processing on partial transcript (3+ words)   │
│     • RAG query if relevant (200-500ms)                          │
│     • LLM streaming (sentence-by-sentence)                       │
│     • TTS streaming (chunk-by-chunk)                             │
│     • Audio sent to Exotel in real-time                          │
│     • Total latency: 1.4-1.85 seconds                            │
└───────────────────────┬──────────────────────────────────────────┘
                        │
                        ▼
┌──────────────────────────────────────────────────────────────────┐
│ 16. Conversation Loop                                            │
│     Customer speaks → AI responds → Repeat                       │
│     Detect end phrases: "goodbye", "thanks, bye", etc.           │
└───────────────────────┬──────────────────────────────────────────┘
                        │
                        ▼
┌──────────────────────────────────────────────────────────────────┐
│ 17. Call Termination                                             │
│     • Send goodbye message                                       │
│     • Wait 2 seconds                                             │
│     • Close WebSocket                                            │
│     • Release Deepgram connection to pool                        │
│     • Update CallLog: status = 'completed', endedAt = now        │
└──────────────────────────────────────────────────────────────────┘
                        │
                        ▼
┌──────────────────────────────────────────────────────────────────┐
│ 18. Post-Call Processing                                         │
│     • Exotel sends final webhook: CallStatus = 'completed'       │
│     • Update duration, recording URL                             │
│     • Trigger analytics update                                   │
│     • Clean up session                                           │
└──────────────────────────────────────────────────────────────────┘
```

### 7.2 Scheduled Call Flow

```
┌──────────────────────────────────────────────────────────────────┐
│ 1. Schedule Call API                                             │
│    POST /api/v1/calls/outbound/schedule                          │
│    {                                                             │
│      phoneNumber, agentId,                                       │
│      scheduledFor: "2025-11-02T10:00:00Z",                      │
│      timezone: "Asia/Kolkata"                                    │
│    }                                                             │
└───────────────────────┬──────────────────────────────────────────┘
                        │
                        ▼
┌──────────────────────────────────────────────────────────────────┐
│ 2. Call Scheduler                                                │
│    • Create CallLog (status: 'scheduled')                        │
│    • Create ScheduledCall record                                 │
│    • Add to Bull queue with delay                                │
│    delay = scheduledFor - now                                    │
└───────────────────────┬──────────────────────────────────────────┘
                        │
                        ▼
┌──────────────────────────────────────────────────────────────────┐
│ 3. Queue Processing (at scheduled time)                          │
│    Bull queue worker picks up job                                │
│    • Check business hours (if respectBusinessHours = true)       │
│    • If outside hours, reschedule to next available time         │
│    • If within hours, proceed to initiate call                   │
└───────────────────────┬──────────────────────────────────────────┘
                        │
                        ▼
┌──────────────────────────────────────────────────────────────────┐
│ 4. Initiate Call                                                 │
│    OutgoingCallService.initiateCall(callLogId)                   │
│    • Update CallLog status: scheduled → initiated                │
│    • Call Exotel API                                             │
│    • Update ScheduledCall status: processing                     │
└───────────────────────┬──────────────────────────────────────────┘
                        │
                        ▼
                 [Same as Immediate Call Flow from step 3]
                        │
                        ▼
┌──────────────────────────────────────────────────────────────────┐
│ 5. Post-Call (for recurring calls)                               │
│    If call.recurring:                                            │
│    • Calculate next run time                                     │
│    • Create new ScheduledCall                                    │
│    • Add to queue                                                │
└──────────────────────────────────────────────────────────────────┘
```

### 7.3 Retry Flow

```
┌──────────────────────────────────────────────────────────────────┐
│ 1. Call Fails (no answer, busy, error)                          │
│    Exotel webhook: CallStatus = 'no-answer' | 'busy' | 'failed' │
└───────────────────────┬──────────────────────────────────────────┘
                        │
                        ▼
┌──────────────────────────────────────────────────────────────────┐
│ 2. Webhook Handler                                               │
│    • Update CallLog: status = 'failed', failureReason           │
│    • Call RetryManager.scheduleRetry(callLogId, reason)          │
└───────────────────────┬──────────────────────────────────────────┘
                        │
                        ▼
┌──────────────────────────────────────────────────────────────────┐
│ 3. Retry Manager                                                 │
│    • Check retry count (< maxRetries?)                           │
│    • Calculate delay based on failure type & attempt #           │
│    • Create RetryAttempt record                                  │
│    • Schedule via CallScheduler                                  │
│                                                                  │
│    Example (no_answer, attempt 1):                               │
│    delay = 300000ms (5 minutes)                                  │
│    scheduledFor = now + 5 minutes                                │
└───────────────────────┬──────────────────────────────────────────┘
                        │
                        ▼
┌──────────────────────────────────────────────────────────────────┐
│ 4. Queue Processing (at retry time)                              │
│    • Create new CallLog (retryOf: originalCallLogId)            │
│    • Increment retryCount                                        │
│    • Initiate call                                               │
└───────────────────────┬──────────────────────────────────────────┘
                        │
                        ├─────────────┬───────────────┐
                        ▼             ▼               ▼
              ┌──────────────┐  ┌─────────┐  ┌─────────────┐
              │ Success      │  │ Fail    │  │ Max Retries │
              │ (Connected)  │  │ Again   │  │ Reached     │
              └──────┬───────┘  └────┬────┘  └──────┬──────┘
                     │               │              │
                     ▼               ▼              ▼
            ┌──────────────┐  ┌──────────┐  ┌────────────────┐
            │ Normal Call  │  │ Schedule │  │ Mark as        │
            │ Flow         │  │ Next     │  │ Permanently    │
            │              │  │ Retry    │  │ Failed         │
            └──────────────┘  └──────────┘  └────────────────┘
```

---

## 8. Performance Optimization

### 8.1 Reused Optimizations from Incoming Calls

All the following optimizations will work identically for outbound calls:

1. **Parallel LLM Processing** (500-1000ms savings)
   - Start LLM on partial transcript (3+ words)
   - Skip RAG for early responses

2. **Sentence-by-Sentence Streaming** (1-3s perceived latency reduction)
   - Stream LLM output sentence-by-sentence
   - Start TTS for first sentence while generating rest

3. **Streaming TTS with Immediate Transmission** (0ms buffering delay)
   - Send audio chunks as they arrive from TTS
   - No waiting for full audio synthesis

4. **Zero-Delay Audio Chunking** (~1000ms savings)
   - Remove artificial delays between chunks
   - WebSocket TCP backpressure handles flow control

5. **Deepgram VAD-Based Processing** (150-200ms savings)
   - Use Deepgram's UtteranceEnd event instead of silence timeouts
   - More accurate speech boundary detection

6. **Connection Pooling** (300-500ms savings per call)
   - Reuse Deepgram connections from pool
   - No connection setup latency

**Total Reused Latency Savings**: 2-4 seconds → **Sub-2s target achieved!**

### 8.2 Outbound-Specific Optimizations

#### Optimization 1: Pre-warm Connections for Scheduled Calls

**Problem**: Scheduled calls still need to acquire Deepgram connection at start time

**Solution**: Pre-acquire connection 30 seconds before scheduled time

```typescript
// In CallScheduler
async scheduleCall(params: ScheduledCallParams): Promise<string> {
  const scheduledFor = new Date(params.scheduledFor);
  const preWarmTime = new Date(scheduledFor.getTime() - 30000); // 30s before

  // Schedule pre-warm job
  await this.queue.add('pre-warm-connection', {
    callLogId: params.callLogId
  }, {
    delay: preWarmTime.getTime() - Date.now()
  });

  // Schedule actual call
  await this.queue.add('initiate-call', {
    callLogId: params.callLogId
  }, {
    delay: scheduledFor.getTime() - Date.now()
  });
}

// Queue processor
this.queue.process('pre-warm-connection', async (job) => {
  const { callLogId } = job.data;
  // Pre-acquire connection and associate with call
  await deepgramConnectionPool.preAcquireForCall(callLogId);
});
```

**Latency Savings**: 300-500ms (eliminates connection acquisition time)

#### Optimization 2: Cache Greeting Audio

**Problem**: Same greeting synthesized repeatedly for same agent

**Solution**: Cache synthesized greeting audio per agent

```typescript
class GreetingCache {
  private cache: Map<string, Buffer> = new Map();

  async getGreeting(
    agentId: string,
    greetingText: string,
    voiceProvider: string,
    voiceId: string
  ): Promise<Buffer> {
    const cacheKey = `${agentId}:${voiceProvider}:${voiceId}:${greetingText}`;

    if (this.cache.has(cacheKey)) {
      logger.info('Using cached greeting audio');
      return this.cache.get(cacheKey)!;
    }

    // Synthesize greeting
    const audioBuffer = await voicePipelineService.synthesizeText(
      greetingText,
      { voiceProvider, voiceId }
    );

    // Convert to PCM (Exotel format)
    const pcmAudio = await audioConverter.convertToPCM(audioBuffer);

    // Cache for future use
    this.cache.set(cacheKey, pcmAudio);

    return pcmAudio;
  }

  // Clear cache daily to refresh
  clearCache() {
    this.cache.clear();
  }
}

// Use in OutboundVoiceHandler
const greetingAudio = await greetingCache.getGreeting(
  session.agent._id.toString(),
  session.agent.config.outboundGreeting,
  session.config.voiceProvider,
  session.config.voiceId
);

await this.sendPCMAudioToExotel(client, greetingAudio, session.streamSid);
```

**Latency Savings**: 300-700ms (eliminates TTS synthesis time for greeting)

**Memory Usage**: ~50KB per cached greeting × 100 agents = ~5MB (negligible)

#### Optimization 3: Parallel Greeting + STT Setup

**Problem**: Sequential greeting send → STT initialization adds latency

**Solution**: Start listening for speech while greeting is being sent

```typescript
async handleOutboundConnection(client: WebSocketClient, callLog: CallLog) {
  const session = await this.initializeSession(client, callLog);

  // PARALLEL: Send greeting AND set up speech listening
  await Promise.all([
    // Task 1: Send greeting
    this.sendProactiveGreeting(client, session),

    // Task 2: Initialize Deepgram connection for listening
    (async () => {
      session.deepgramConnection = await deepgramConnectionPool.acquireConnection(
        client.id,
        this.getDeepgramOptions(session)
      );
      logger.info('Deepgram ready to receive audio');
    })()
  ]);

  // Now both greeting is sent AND STT is ready
  logger.info('Outbound call fully initialized');
}
```

**Latency Savings**: 100-300ms (parallelizes initialization)

#### Optimization 4: Batch Outbound Call Preparation

**Problem**: Bulk calls initiated sequentially, each with setup overhead

**Solution**: Batch-prepare resources before initiating calls

```typescript
async bulkInitiateCalls(calls: OutgoingCallParams[]): Promise<string[]> {
  // 1. Pre-create all CallLog records in single DB transaction
  const callLogs = await CallLog.insertMany(
    calls.map(call => ({
      direction: 'outbound',
      phoneNumber: call.phoneNumber,
      agentId: call.agentId,
      status: 'initiated',
      metadata: call.metadata
    }))
  );

  // 2. Pre-acquire Deepgram connections (up to pool limit)
  const maxPreAcquire = Math.min(calls.length, 20);
  const connectionPromises = Array(maxPreAcquire).fill(null).map((_, i) =>
    deepgramConnectionPool.preAcquireForCall(callLogs[i]._id.toString())
  );
  await Promise.allSettled(connectionPromises);

  // 3. Pre-cache greetings for unique agents
  const uniqueAgents = [...new Set(calls.map(c => c.agentId))];
  await Promise.allSettled(
    uniqueAgents.map(agentId => this.preCacheGreeting(agentId))
  );

  // 4. Initiate calls with throttling
  const results = [];
  for (let i = 0; i < calls.length; i++) {
    results.push(
      this.initiateCall({
        ...calls[i],
        callLogId: callLogs[i]._id.toString()
      })
    );

    // Throttle: wait between initiations
    if (i < calls.length - 1) {
      await sleep(calls.throttle?.delayBetweenCalls || 1000);
    }
  }

  return results;
}
```

**Latency Savings**: 30-50% reduction in bulk call initiation time

#### Optimization 5: Smart Retry Scheduling

**Problem**: Retries scheduled randomly may conflict with peak hours

**Solution**: Schedule retries during low-traffic periods

```typescript
class RetryManager {
  async scheduleRetry(callLogId: string, reason: FailureReason): Promise<void> {
    const baseDelay = RETRY_CONFIG[reason].baseDelay;
    const attemptCount = await this.getRetryCount(callLogId);
    const delay = this.calculateRetryDelay(reason, attemptCount);

    // Calculate scheduled time
    let scheduledFor = new Date(Date.now() + delay);

    // OPTIMIZATION: Adjust to avoid peak hours (9am-5pm)
    const hour = scheduledFor.getHours();
    if (hour >= 9 && hour <= 17) {
      // Peak hours - schedule for after 5pm
      scheduledFor = this.getNext5PM(scheduledFor);
    }

    // Create retry attempt
    await RetryAttempt.create({
      originalCallLogId: callLogId,
      attemptNumber: attemptCount + 1,
      scheduledFor,
      status: 'pending',
      failureReason: reason
    });

    // Schedule via CallScheduler
    await callScheduler.scheduleCall({
      callLogId,
      scheduledFor,
      isRetry: true
    });
  }

  private getNext5PM(from: Date): Date {
    const next = new Date(from);
    next.setHours(17, 0, 0, 0); // 5:00 PM

    // If already past 5pm today, use tomorrow 5pm
    if (next <= from) {
      next.setDate(next.getDate() + 1);
    }

    return next;
  }
}
```

**Benefits**:
- Reduces peak-hour load
- Better success rates (less competition for connections)
- Smoother load distribution

### 8.3 Performance Monitoring

**Enhanced Stats API** (`/api/v1/stats`):

```typescript
{
  // ... existing stats ...

  "outboundCalls": {
    "active": 12,
    "scheduled": 45,
    "pendingRetries": 8,
    "averageLatency": {
      "greetingSent": 850,      // Time to send greeting (ms)
      "firstResponse": 1420,    // Time to first AI response (ms)
      "total": 1450             // Total latency (ms)
    },
    "cacheHitRate": {
      "greetings": 85.5,        // % of cached greetings used
      "connections": 78.3       // % of pre-warmed connections used
    },
    "retryStats": {
      "totalRetries": 45,
      "successAfterRetry": 32,
      "failedAfterRetries": 13,
      "averageRetriesPerCall": 1.8
    }
  },

  "performance": {
    "p50Latency": 1380,
    "p95Latency": 1620,
    "p99Latency": 1850
  }
}
```

---

## 9. Error Handling & Retry Logic

### 9.1 Failure Scenarios

| Failure Type | Detection Method | Retry Strategy | Max Retries |
|--------------|------------------|----------------|-------------|
| **No Answer** | Exotel webhook: `CallStatus = 'no-answer'` | Exponential backoff: 5min, 10min, 20min | 3 |
| **Busy** | Exotel webhook: `CallStatus = 'busy'` | Exponential backoff: 10min, 20min, 40min | 3 |
| **Network Error** | Exotel webhook: `CallStatus = 'failed'` | Exponential backoff: 1min, 2min, 4min, 8min, 16min | 5 |
| **Voicemail** | Beep detection + duration analysis | Leave message, no retry | 0 |
| **Invalid Number** | Exotel error response | No retry | 0 |
| **Rate Limited** | Exotel API 429 response | Exponential backoff: 1min, 2min, 4min | 5 |
| **Connection Lost** | WebSocket disconnect before completion | Retry immediately once | 1 |
| **No Initial Response** | Timeout after greeting (15s silence) | Mark as no_answer, retry | 3 |

### 9.2 Retry Implementation

**File**: `backend/src/services/retryManager.service.ts`

```typescript
class RetryManager {
  private readonly RETRY_CONFIG = {
    no_answer: {
      maxRetries: 3,
      baseDelay: 300000,      // 5 minutes
      maxDelay: 3600000,      // 1 hour
      multiplier: 2
    },
    busy: {
      maxRetries: 3,
      baseDelay: 600000,      // 10 minutes
      maxDelay: 7200000,      // 2 hours
      multiplier: 2
    },
    network_error: {
      maxRetries: 5,
      baseDelay: 60000,       // 1 minute
      maxDelay: 900000,       // 15 minutes
      multiplier: 2
    },
    voicemail: {
      maxRetries: 0
    },
    invalid_number: {
      maxRetries: 0
    },
    rate_limited: {
      maxRetries: 5,
      baseDelay: 60000,       // 1 minute
      maxDelay: 600000,       // 10 minutes
      multiplier: 2
    },
    connection_lost: {
      maxRetries: 1,
      baseDelay: 0,           // Immediate
      maxDelay: 0,
      multiplier: 1
    },
    no_response: {
      maxRetries: 3,
      baseDelay: 300000,      // 5 minutes
      maxDelay: 3600000,      // 1 hour
      multiplier: 2
    }
  };

  async scheduleRetry(
    callLogId: string,
    reason: FailureReason
  ): Promise<void> {
    // Get retry configuration
    const config = this.RETRY_CONFIG[reason];

    if (!config || config.maxRetries === 0) {
      logger.info(`No retry for ${reason}`);
      return;
    }

    // Get current retry count
    const callLog = await CallLog.findById(callLogId);
    const attemptNumber = callLog.retryCount + 1;

    // Check if max retries reached
    if (attemptNumber > config.maxRetries) {
      logger.warn(`Max retries reached for call ${callLogId}`);
      await CallLog.updateOne({ _id: callLogId }, {
        status: 'failed',
        failureReason: `${reason}_max_retries`
      });
      return;
    }

    // Calculate delay (exponential backoff)
    const delay = Math.min(
      config.baseDelay * Math.pow(config.multiplier, attemptNumber - 1),
      config.maxDelay
    );

    // Add jitter (±10%) to prevent thundering herd
    const jitter = delay * 0.1 * (Math.random() * 2 - 1);
    const actualDelay = Math.max(0, delay + jitter);

    const scheduledFor = new Date(Date.now() + actualDelay);

    logger.info(`Scheduling retry ${attemptNumber}/${config.maxRetries} for call ${callLogId}`, {
      reason,
      delay: actualDelay,
      scheduledFor
    });

    // Create retry attempt record
    const retryAttempt = await RetryAttempt.create({
      originalCallLogId: callLogId,
      attemptNumber,
      scheduledFor,
      status: 'pending',
      failureReason: reason
    });

    // Schedule via CallScheduler
    await callScheduler.scheduleCall({
      phoneNumber: callLog.phoneNumber,
      agentId: callLog.agentId.toString(),
      scheduledFor,
      metadata: {
        ...callLog.metadata,
        isRetry: true,
        originalCallLogId: callLogId,
        retryAttemptId: retryAttempt._id.toString(),
        attemptNumber
      }
    });
  }

  async getRetryHistory(callLogId: string): Promise<RetryAttempt[]> {
    return RetryAttempt.find({ originalCallLogId: callLogId })
      .sort({ attemptNumber: 1 });
  }

  async cancelRetries(callLogId: string): Promise<void> {
    // Find pending retries
    const pendingRetries = await RetryAttempt.find({
      originalCallLogId: callLogId,
      status: 'pending'
    });

    // Cancel each
    for (const retry of pendingRetries) {
      if (retry.retryCallLogId) {
        // Cancel the scheduled call
        await CallLog.updateOne({ _id: retry.retryCallLogId }, {
          status: 'cancelled'
        });
      }

      // Update retry attempt status
      await RetryAttempt.updateOne({ _id: retry._id }, {
        status: 'cancelled'
      });
    }

    logger.info(`Cancelled ${pendingRetries.length} pending retries for call ${callLogId}`);
  }

  shouldRetry(reason: FailureReason, attemptCount: number): boolean {
    const config = this.RETRY_CONFIG[reason];
    return config && attemptCount < config.maxRetries;
  }

  calculateRetryDelay(reason: FailureReason, attemptNumber: number): number {
    const config = this.RETRY_CONFIG[reason];
    if (!config) return 0;

    const delay = config.baseDelay * Math.pow(config.multiplier, attemptNumber - 1);
    return Math.min(delay, config.maxDelay);
  }
}

export const retryManager = new RetryManager();
```

### 9.3 Error Recovery Patterns

#### Pattern 1: Circuit Breaker for Exotel API

```typescript
class ExotelCircuitBreaker {
  private failureCount = 0;
  private lastFailureTime?: Date;
  private state: 'closed' | 'open' | 'half-open' = 'closed';

  private readonly FAILURE_THRESHOLD = 5;
  private readonly TIMEOUT = 60000; // 1 minute

  async call<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      // Check if timeout has passed
      if (Date.now() - this.lastFailureTime!.getTime() > this.TIMEOUT) {
        this.state = 'half-open';
        logger.info('Circuit breaker entering half-open state');
      } else {
        throw new Error('Circuit breaker is OPEN - Exotel API unavailable');
      }
    }

    try {
      const result = await fn();

      // Success - reset
      if (this.state === 'half-open') {
        this.state = 'closed';
        this.failureCount = 0;
        logger.info('Circuit breaker closed - service recovered');
      }

      return result;
    } catch (error) {
      this.failureCount++;
      this.lastFailureTime = new Date();

      if (this.failureCount >= this.FAILURE_THRESHOLD) {
        this.state = 'open';
        logger.error('Circuit breaker opened - too many failures');
      }

      throw error;
    }
  }
}

// Usage in ExotelOutboundService
class ExotelOutboundService {
  private circuitBreaker = new ExotelCircuitBreaker();

  async makeCall(params: ExotelCallParams): Promise<ExotelCallResponse> {
    return this.circuitBreaker.call(async () => {
      // Actual API call
      const response = await axios.post(EXOTEL_API_URL, params);
      return response.data;
    });
  }
}
```

#### Pattern 2: Graceful Degradation

```typescript
async initiateCall(params: OutgoingCallParams): Promise<string> {
  try {
    // Try to initiate call normally
    return await this.exotelService.makeCall(params);
  } catch (error) {
    if (error.message.includes('Circuit breaker is OPEN')) {
      // Exotel API is down - queue for later
      logger.warn('Exotel API unavailable - queueing call for retry');

      const callLog = await CallLog.create({
        ...params,
        status: 'queued',
        failureReason: 'api_unavailable'
      });

      // Schedule retry in 5 minutes
      await retryManager.scheduleRetry(callLog._id.toString(), 'rate_limited');

      return callLog._id.toString();
    }

    throw error;
  }
}
```

#### Pattern 3: Idempotency for Retries

```typescript
// Prevent duplicate calls from retries
async initiateCall(params: OutgoingCallParams): Promise<string> {
  // Check if this call was already initiated
  if (params.metadata?.retryAttemptId) {
    const retryAttempt = await RetryAttempt.findById(params.metadata.retryAttemptId);

    if (retryAttempt.status === 'processing' || retryAttempt.status === 'completed') {
      logger.warn('Retry attempt already processed - skipping duplicate');
      return retryAttempt.retryCallLogId!.toString();
    }

    // Update status to processing
    await RetryAttempt.updateOne({ _id: retryAttempt._id }, {
      status: 'processing',
      processedAt: new Date()
    });
  }

  // Proceed with call initiation
  // ...
}
```

---

## 10. Concurrency & Scaling

### 10.1 Concurrency Limits

| Resource | Current Limit | Bottleneck | Solution |
|----------|---------------|------------|----------|
| **Deepgram STT Connections** | 20 (Pay-as-you-go) | Pool managed with queue | Upgrade to Growth plan (100) or Enterprise (unlimited) |
| **ElevenLabs TTS** | 10-20 concurrent | API rate limit | Queue requests, use Deepgram TTS for some calls |
| **Exotel Outbound API** | Unknown (likely 20-50/sec) | API rate limit | Add rate limiter, implement backoff |
| **MongoDB Connections** | 10 (default pool) | Connection pool | Increase to 50-100 |
| **In-Memory Sessions** | ~50-100 calls | Memory (1-2GB) | Migrate to Redis for horizontal scaling |
| **Bull Queue** | Unlimited (Redis) | Redis memory | Monitor queue size, add alerts |

### 10.2 Scaling Strategy

#### Tier 1: Current Setup (0-30 concurrent calls)

**Infrastructure**:
- Single EC2 instance (t3.large: 2 vCPU, 8GB RAM)
- MongoDB Atlas M10
- Redis (single instance)
- Deepgram Pay-as-you-go (20 connections)
- ElevenLabs Creator (10 concurrent)

**Cost**: ~$150/month + call costs

**Limitations**:
- 20 concurrent calls (Deepgram limit)
- Single point of failure (one server)
- No horizontal scaling

#### Tier 2: Medium Scale (30-100 concurrent calls)

**Infrastructure**:
- 2-3 EC2 instances (t3.large) behind load balancer
- MongoDB Atlas M30 (replica set)
- Redis Cluster (3 nodes)
- **Deepgram Growth plan (100 connections)**
- ElevenLabs Pro (unlimited concurrent)

**Architecture Changes**:
```typescript
// 1. Migrate sessions to Redis
class RedisSessionManager {
  async setSession(clientId: string, session: VoiceSession): Promise<void> {
    await redis.setex(
      `session:${clientId}`,
      3600,
      JSON.stringify(session)
    );
  }

  async getSession(clientId: string): Promise<VoiceSession | null> {
    const data = await redis.get(`session:${clientId}`);
    return data ? JSON.parse(data) : null;
  }
}

// 2. Sticky sessions on load balancer (WebSocket requirement)
// ALB configuration:
{
  "TargetGroupAttributes": [
    {
      "Key": "stickiness.enabled",
      "Value": "true"
    },
    {
      "Key": "stickiness.type",
      "Value": "app_cookie"
    }
  ]
}

// 3. Shared Bull queue (already Redis-based, no changes needed)

// 4. Distributed Deepgram connection pool
class DistributedDeepgramPool {
  async acquireConnection(clientId: string): Promise<LiveClient> {
    // Check global count via Redis
    const globalCount = await redis.get('deepgram:active_count');

    if (parseInt(globalCount || '0') >= 100) {
      // Pool full globally
      return this.enqueueRequest(clientId);
    }

    // Increment global counter
    await redis.incr('deepgram:active_count');

    // Create connection locally
    const connection = await this.createConnection(clientId);

    // Track in Redis
    await redis.setex(`deepgram:${clientId}`, 3600, 'active');

    return connection;
  }

  async releaseConnection(clientId: string): Promise<void> {
    // Release locally
    await this.localRelease(clientId);

    // Decrement global counter
    await redis.decr('deepgram:active_count');

    // Remove tracking
    await redis.del(`deepgram:${clientId}`);
  }
}
```

**Cost**: ~$500/month + call costs

**Capacity**: 100 concurrent calls

#### Tier 3: Large Scale (100-500 concurrent calls)

**Infrastructure**:
- Auto-scaling group (5-10 EC2 instances)
- MongoDB Atlas M60 (sharded cluster)
- Redis Cluster (6 nodes, high availability)
- **Deepgram Enterprise (unlimited connections)**
- ElevenLabs Enterprise

**Architecture Changes**:
```typescript
// 1. Service mesh for inter-service communication
// 2. Distributed tracing (OpenTelemetry)
// 3. Advanced monitoring (Prometheus + Grafana)
// 4. Auto-scaling based on queue depth

// Auto-scaling policy
{
  "ScalingPolicies": [
    {
      "MetricName": "CallQueueDepth",
      "TargetValue": 10,  // Scale up when queue > 10
      "ScaleUpCooldown": 60,
      "ScaleDownCooldown": 300
    }
  ]
}
```

**Cost**: ~$2000/month + call costs

**Capacity**: 500+ concurrent calls

### 10.3 Load Balancing

**WebSocket Load Balancing Requirements**:
1. **Sticky sessions**: Same client must connect to same server
2. **Health checks**: Don't route to unhealthy instances
3. **Graceful shutdown**: Drain connections before terminating

**AWS Application Load Balancer (ALB) Configuration**:

```yaml
# ALB Target Group
TargetGroup:
  Type: AWS::ElasticLoadBalancingV2::TargetGroup
  Properties:
    HealthCheckEnabled: true
    HealthCheckIntervalSeconds: 30
    HealthCheckPath: /health
    HealthCheckProtocol: HTTP
    HealthCheckTimeoutSeconds: 5
    HealthyThresholdCount: 2
    UnhealthyThresholdCount: 3

    # Sticky sessions (required for WebSocket)
    TargetGroupAttributes:
      - Key: stickiness.enabled
        Value: true
      - Key: stickiness.type
        Value: app_cookie
      - Key: stickiness.app_cookie.cookie_name
        Value: AWSALB
      - Key: stickiness.app_cookie.duration_seconds
        Value: 3600

      # Connection draining
      - Key: deregistration_delay.timeout_seconds
        Value: 300  # 5 minutes to finish active calls

# Listener for WebSocket
Listener:
  Type: AWS::ElasticLoadBalancingV2::Listener
  Properties:
    Protocol: HTTPS
    Port: 443
    DefaultActions:
      - Type: forward
        TargetGroupArn: !Ref TargetGroup
```

**Health Check Endpoint**:

```typescript
// backend/src/routes/health.routes.ts
router.get('/health', async (req, res) => {
  // Check critical dependencies
  const checks = {
    mongodb: await checkMongoDB(),
    redis: await checkRedis(),
    deepgramPool: deepgramConnectionPool.getStats().utilization < 95,
    memory: process.memoryUsage().heapUsed / process.memoryUsage().heapTotal < 0.9
  };

  const healthy = Object.values(checks).every(Boolean);

  res.status(healthy ? 200 : 503).json({
    status: healthy ? 'healthy' : 'unhealthy',
    checks,
    timestamp: new Date()
  });
});
```

### 10.4 Rate Limiting

**Exotel API Rate Limiter**:

```typescript
import Bottleneck from 'bottleneck';

class ExotelOutboundService {
  // Limit: 20 calls per second (assumed, adjust based on Exotel docs)
  private limiter = new Bottleneck({
    reservoir: 20,           // Number of jobs
    reservoirRefreshAmount: 20,
    reservoirRefreshInterval: 1000,  // per 1 second
    maxConcurrent: 10,       // Max concurrent requests
    minTime: 50              // Min 50ms between requests
  });

  async makeCall(params: ExotelCallParams): Promise<ExotelCallResponse> {
    return this.limiter.schedule(async () => {
      const response = await axios.post(EXOTEL_API_URL, params, {
        headers: {
          'Authorization': `Basic ${this.getAuthToken()}`,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      });

      return response.data;
    });
  }
}
```

---

## 11. Testing Strategy

### 11.1 Unit Tests

**Files to Test**:
- `outgoingCall.service.ts`
- `callScheduler.service.ts`
- `retryManager.service.ts`
- `exotelOutbound.service.ts`
- `outboundVoice.handler.ts`
- `voicemailDetector.service.ts`

**Example Test** (`backend/tests/services/retryManager.test.ts`):

```typescript
import { retryManager } from '../../src/services/retryManager.service';
import { CallLog } from '../../src/models/CallLog';
import { RetryAttempt } from '../../src/models/RetryAttempt';

describe('RetryManager', () => {
  beforeEach(async () => {
    await CallLog.deleteMany({});
    await RetryAttempt.deleteMany({});
  });

  describe('scheduleRetry', () => {
    it('should schedule retry for no_answer with 5min delay', async () => {
      const callLog = await CallLog.create({
        phoneNumber: '+919876543210',
        agentId: 'agent_123',
        direction: 'outbound',
        status: 'failed',
        failureReason: 'no_answer',
        retryCount: 0
      });

      await retryManager.scheduleRetry(callLog._id.toString(), 'no_answer');

      const retry = await RetryAttempt.findOne({ originalCallLogId: callLog._id });
      expect(retry).toBeTruthy();
      expect(retry.attemptNumber).toBe(1);
      expect(retry.failureReason).toBe('no_answer');

      // Check scheduled time is approximately 5 minutes from now
      const expectedTime = Date.now() + 300000; // 5 minutes
      const actualTime = retry.scheduledFor.getTime();
      expect(Math.abs(actualTime - expectedTime)).toBeLessThan(30000); // Within 30s (jitter)
    });

    it('should not schedule retry for voicemail', async () => {
      const callLog = await CallLog.create({
        phoneNumber: '+919876543210',
        agentId: 'agent_123',
        direction: 'outbound',
        status: 'failed',
        failureReason: 'voicemail',
        retryCount: 0
      });

      await retryManager.scheduleRetry(callLog._id.toString(), 'voicemail');

      const retry = await RetryAttempt.findOne({ originalCallLogId: callLog._id });
      expect(retry).toBeNull();
    });

    it('should not schedule retry after max attempts', async () => {
      const callLog = await CallLog.create({
        phoneNumber: '+919876543210',
        agentId: 'agent_123',
        direction: 'outbound',
        status: 'failed',
        failureReason: 'no_answer',
        retryCount: 3
      });

      await retryManager.scheduleRetry(callLog._id.toString(), 'no_answer');

      const retry = await RetryAttempt.findOne({ originalCallLogId: callLog._id });
      expect(retry).toBeNull();

      const updatedCallLog = await CallLog.findById(callLog._id);
      expect(updatedCallLog.status).toBe('failed');
      expect(updatedCallLog.failureReason).toBe('no_answer_max_retries');
    });

    it('should use exponential backoff for multiple retries', async () => {
      const delays = [];

      for (let i = 0; i < 3; i++) {
        const delay = retryManager.calculateRetryDelay('no_answer', i + 1);
        delays.push(delay);
      }

      expect(delays[0]).toBe(300000);  // 5 min
      expect(delays[1]).toBe(600000);  // 10 min
      expect(delays[2]).toBe(1200000); // 20 min
    });
  });

  describe('cancelRetries', () => {
    it('should cancel all pending retries', async () => {
      const callLog = await CallLog.create({
        phoneNumber: '+919876543210',
        agentId: 'agent_123',
        direction: 'outbound',
        status: 'failed'
      });

      // Create 3 pending retries
      await RetryAttempt.create({
        originalCallLogId: callLog._id,
        attemptNumber: 1,
        scheduledFor: new Date(Date.now() + 300000),
        status: 'pending',
        failureReason: 'no_answer'
      });

      await retryManager.cancelRetries(callLog._id.toString());

      const retries = await RetryAttempt.find({ originalCallLogId: callLog._id });
      expect(retries.every(r => r.status === 'cancelled')).toBe(true);
    });
  });
});
```

### 11.2 Integration Tests

**Test Scenarios**:
1. Complete outbound call flow (E2E)
2. Scheduled call execution
3. Retry after failure
4. Voicemail detection and message
5. Bulk call initiation
6. Concurrent call limits

**Example Integration Test**:

```typescript
describe('Outbound Call Integration', () => {
  let server: WebSocketServer;
  let mockExotelAPI: MockExotelAPI;

  beforeAll(async () => {
    // Start server
    server = await startTestServer();

    // Mock Exotel API
    mockExotelAPI = new MockExotelAPI();
    mockExotelAPI.start();
  });

  afterAll(async () => {
    await server.close();
    await mockExotelAPI.stop();
  });

  it('should complete full outbound call flow', async () => {
    // 1. Initiate call
    const response = await request(server.app)
      .post('/api/v1/calls/outbound')
      .send({
        phoneNumber: '+919876543210',
        agentId: testAgent._id.toString()
      });

    expect(response.status).toBe(202);
    const { callLogId } = response.body;

    // 2. Verify Exotel API was called
    await waitFor(() => {
      expect(mockExotelAPI.getCallCount()).toBe(1);
    });

    // 3. Simulate customer answering
    await mockExotelAPI.simulateAnswer(callLogId);

    // 4. Simulate WebSocket connection
    const ws = new WebSocket(`ws://localhost:3000/ws/exotel/voice/${callLogId}`);

    await waitForWebSocketOpen(ws);

    // 5. Verify greeting was sent
    const messages = await collectWebSocketMessages(ws, 1);
    expect(messages[0].event).toBe('media');
    expect(messages[0].media.track).toBe('outbound');

    // 6. Send audio from customer
    ws.send(JSON.stringify({
      event: 'media',
      media: {
        payload: base64EncodedPCM
      }
    }));

    // 7. Verify AI response
    const responses = await collectWebSocketMessages(ws, 5);
    expect(responses.some(m => m.event === 'media')).toBe(true);

    // 8. Verify transcript saved
    const callLog = await CallLog.findById(callLogId);
    expect(callLog.transcript.length).toBeGreaterThan(0);
    expect(callLog.status).toBe('in-progress');

    // 9. End call
    ws.close();

    // 10. Verify final status
    await waitFor(async () => {
      const finalCallLog = await CallLog.findById(callLogId);
      expect(finalCallLog.status).toBe('completed');
    });
  }, 30000);
});
```

### 11.3 Load Testing

**Tool**: Artillery

**Test Configuration** (`load-test.yml`):

```yaml
config:
  target: 'wss://your-domain.com'
  phases:
    # Warm-up: 0 → 10 calls over 1 minute
    - duration: 60
      arrivalRate: 0
      rampTo: 10
      name: "Warm-up"

    # Sustained: 10 calls/sec for 5 minutes
    - duration: 300
      arrivalRate: 10
      name: "Sustained load"

    # Spike: 10 → 30 calls over 1 minute
    - duration: 60
      arrivalRate: 10
      rampTo: 30
      name: "Spike"

    # Recovery: 30 → 5 calls over 2 minutes
    - duration: 120
      arrivalRate: 30
      rampTo: 5
      name: "Recovery"

scenarios:
  - name: "Outbound call"
    engine: "ws"
    flow:
      # 1. Initiate call via HTTP
      - post:
          url: "/api/v1/calls/outbound"
          json:
            phoneNumber: "+919876543210"
            agentId: "{{ agentId }}"
          capture:
            - json: "$.callLogId"
              as: "callLogId"

      # 2. Wait for call to connect (simulate)
      - think: 5

      # 3. Connect WebSocket (simulate Exotel)
      - connect:
          url: "/ws/exotel/voice/{{ callLogId }}"

      # 4. Receive greeting
      - receive:
          match:
            event: "media"

      # 5. Send audio (3 times)
      - loop:
          count: 3
          flow:
            - send:
                payload:
                  event: "media"
                  media:
                    payload: "{{ base64Audio }}"
            - receive:
                match:
                  event: "media"
            - think: 2

      # 6. Close connection
      - close

  thinktime: 1

  # Custom metrics
  ensure:
    maxErrorRate: 5
    p95: 2000  # 95th percentile latency < 2s
    p99: 3000  # 99th percentile latency < 3s
```

**Run Load Test**:
```bash
artillery run load-test.yml --output report.json
artillery report report.json
```

**Key Metrics to Monitor**:
- Request rate (calls/sec)
- Error rate (< 5%)
- Latency (p50, p95, p99)
- Deepgram pool utilization
- Memory usage
- CPU usage
- MongoDB connection pool
- WebSocket connection count

### 11.4 Manual Testing Checklist

#### Basic Functionality
- [ ] Initiate immediate outbound call
- [ ] Customer answers and conversation works
- [ ] AI greeting plays correctly
- [ ] Speech recognition works (Deepgram STT)
- [ ] AI responses are relevant (LLM)
- [ ] AI speech sounds natural (TTS)
- [ ] Call transcript saves correctly
- [ ] Call log status updates correctly

#### Scheduling
- [ ] Schedule call for future time
- [ ] Call executes at scheduled time
- [ ] Timezone conversion works
- [ ] Business hours respect works
- [ ] Recurring calls work (daily, weekly, monthly)
- [ ] Cancel scheduled call

#### Retry Logic
- [ ] No answer triggers retry
- [ ] Busy signal triggers retry
- [ ] Network error triggers retry
- [ ] Retry executes at correct time
- [ ] Exponential backoff works
- [ ] Max retries respected
- [ ] Voicemail does NOT retry

#### Voicemail
- [ ] Voicemail detected correctly
- [ ] Voicemail message plays
- [ ] Call ends gracefully after message

#### Error Handling
- [ ] Invalid phone number rejected
- [ ] Missing agent ID rejected
- [ ] Concurrent limit enforced
- [ ] Circuit breaker opens after failures
- [ ] Graceful degradation when Exotel down

#### Performance
- [ ] Greeting latency < 1s
- [ ] First response latency < 2s
- [ ] Subsequent responses < 2s
- [ ] No memory leaks during long calls
- [ ] Connection pool managed correctly

#### Bulk Operations
- [ ] Bulk initiate 10 calls
- [ ] Bulk initiate 50 calls
- [ ] Throttling respected
- [ ] Progress tracking works

---

## 12. Deployment & Rollout

### 12.1 Deployment Phases

#### Phase 1: Development & Staging (Week 1-5)

**Environment**: `dev` and `staging`

**Activities**:
1. Implement all components
2. Unit tests (80%+ coverage)
3. Integration tests
4. Manual testing
5. Code review

**Success Criteria**:
- All tests passing
- No critical bugs
- Latency < 2s in staging
- Code reviewed and approved

#### Phase 2: Beta Testing (Week 6)

**Environment**: `production` (limited rollout)

**Activities**:
1. Deploy to production
2. Enable for 1-2 test agents only
3. Monitor closely
4. Collect feedback
5. Fix issues

**Metrics to Monitor**:
- Success rate (target: >90%)
- Latency (target: <2s p95)
- Error rate (target: <5%)
- Retry rate (target: <30%)
- Customer satisfaction

**Success Criteria**:
- >95% success rate
- <2s latency (p95)
- <3% error rate
- No critical bugs

#### Phase 3: Gradual Rollout (Week 7-8)

**Strategy**: Canary deployment

**Timeline**:
- **Day 1**: 5% of agents
- **Day 2**: 10% of agents
- **Day 3**: 25% of agents
- **Day 5**: 50% of agents
- **Day 7**: 100% of agents

**Rollback Criteria**:
- Error rate >10%
- Latency >3s (p95)
- Success rate <85%
- Critical bug discovered

**Monitoring**:
- Real-time dashboard (Grafana)
- Alerts (PagerDuty)
- Daily metrics report
- Customer feedback

#### Phase 4: Full Production (Week 9+)

**Environment**: `production` (100% rollout)

**Ongoing Activities**:
- Performance monitoring
- Cost optimization
- Feature enhancements
- Bug fixes
- User feedback integration

### 12.2 Deployment Checklist

#### Pre-Deployment
- [ ] All tests passing (unit + integration)
- [ ] Code reviewed and approved
- [ ] Documentation updated
- [ ] Database migrations prepared
- [ ] Environment variables configured
- [ ] Redis cluster ready
- [ ] Monitoring dashboards configured
- [ ] Alerts configured
- [ ] Rollback plan documented

#### Deployment Steps
```bash
# 1. Backup database
mongodump --uri="mongodb://..." --out=/backups/$(date +%Y%m%d)

# 2. Run database migrations
npm run migrate:up

# 3. Deploy code (blue-green deployment)
# Deploy to "green" environment (inactive)
git pull origin main
npm install
npm run build

# 4. Run smoke tests on green environment
npm run test:smoke

# 5. Switch traffic to green (via load balancer)
aws elbv2 modify-listener --listener-arn $LISTENER_ARN \
  --default-actions Type=forward,TargetGroupArn=$GREEN_TARGET_GROUP

# 6. Monitor for 10 minutes
# Check error rates, latency, success rate

# 7. If stable, terminate blue environment
# If issues, rollback to blue
aws elbv2 modify-listener --listener-arn $LISTENER_ARN \
  --default-actions Type=forward,TargetGroupArn=$BLUE_TARGET_GROUP
```

#### Post-Deployment
- [ ] Verify all services healthy
- [ ] Check error rates (<5%)
- [ ] Check latency (<2s p95)
- [ ] Verify scheduled calls executing
- [ ] Verify retries working
- [ ] Monitor for 24 hours
- [ ] Announce deployment to team

### 12.3 Rollback Plan

**Trigger Conditions**:
- Error rate >10%
- Latency >3s (p95)
- Success rate <80%
- Critical bug affecting calls
- Data corruption detected

**Rollback Steps** (< 5 minutes):
```bash
# 1. Switch traffic back to previous version (blue)
aws elbv2 modify-listener --listener-arn $LISTENER_ARN \
  --default-actions Type=forward,TargetGroupArn=$BLUE_TARGET_GROUP

# 2. Verify traffic switched
curl https://api.example.com/health

# 3. Check metrics stabilizing
# Monitor for 10 minutes

# 4. If needed, rollback database migrations
npm run migrate:down

# 5. Post-mortem
# Document what went wrong
# Plan fixes
```

**Communication Plan**:
1. Alert on-call engineer (PagerDuty)
2. Notify team in Slack (#incidents)
3. Update status page
4. Post-mortem within 48 hours

---

## 13. Cost Analysis

### 13.1 Per-Call Cost Breakdown

**Assumptions**:
- Average call duration: 5 minutes
- Average speech: 1500 characters
- LLM: GPT-4o-mini
- STT: Deepgram Nova-2
- TTS: Deepgram Aura (primary) or ElevenLabs (premium)

#### Deepgram Stack (Standard Quality)

| Service | Usage | Unit Cost | Cost per Call |
|---------|-------|-----------|---------------|
| **Deepgram STT** | 5 min audio | $0.0036/min | $0.018 |
| **Deepgram TTS** | 1500 chars | $0.015/1000 chars | $0.0225 |
| **GPT-4o-mini** | ~2000 tokens | $0.0005/1K tokens | $0.001 |
| **MongoDB** | Minimal | $0.08/hr ÷ 100 calls/hr | $0.0008 |
| **EC2** | Compute | $0.23/hr ÷ 20 calls/hr | $0.0115 |
| **Exotel** | 5 min call | ₹0.30/min × 5 = ₹1.50 | $0.018 |
| **TOTAL** | | | **$0.0718** |

**Per 1000 calls**: $71.80

#### ElevenLabs Stack (Premium Quality)

| Service | Usage | Unit Cost | Cost per Call |
|---------|-------|-----------|---------------|
| **Deepgram STT** | 5 min audio | $0.0036/min | $0.018 |
| **ElevenLabs TTS** | 1500 chars | $0.22/1000 chars | $0.33 |
| **GPT-4o-mini** | ~2000 tokens | $0.0005/1K tokens | $0.001 |
| **MongoDB** | Minimal | $0.08/hr ÷ 100 calls/hr | $0.0008 |
| **EC2** | Compute | $0.23/hr ÷ 20 calls/hr | $0.0115 |
| **Exotel** | 5 min call | ₹0.30/min × 5 = ₹1.50 | $0.018 |
| **TOTAL** | | | **$0.3793** |

**Per 1000 calls**: $379.30

### 13.2 Monthly Cost Projections

#### Scenario 1: 10,000 calls/month (333/day)

**Deepgram Stack**:
- Call costs: 10,000 × $0.0718 = $718
- Infrastructure: $150/month
- **Total**: $868/month

**ElevenLabs Stack**:
- Call costs: 10,000 × $0.3793 = $3,793
- Infrastructure: $150/month
- **Total**: $3,943/month

**Hybrid** (30% ElevenLabs for VIP, 70% Deepgram):
- Call costs: (3,000 × $0.3793) + (7,000 × $0.0718) = $1,138 + $503 = $1,641
- Infrastructure: $150/month
- **Total**: $1,791/month

#### Scenario 2: 50,000 calls/month (1,667/day)

**Deepgram Stack**:
- Call costs: 50,000 × $0.0718 = $3,590
- Infrastructure: $500/month (scaled)
- **Total**: $4,090/month

**Hybrid** (30% ElevenLabs):
- Call costs: (15,000 × $0.3793) + (35,000 × $0.0718) = $5,690 + $2,513 = $8,203
- Infrastructure: $500/month
- **Total**: $8,703/month

#### Scenario 3: 100,000 calls/month (3,333/day)

**Deepgram Stack**:
- Call costs: 100,000 × $0.0718 = $7,180
- Infrastructure: $2,000/month (auto-scaling)
- **Total**: $9,180/month

**Hybrid** (30% ElevenLabs):
- Call costs: (30,000 × $0.3793) + (70,000 × $0.0718) = $11,379 + $5,026 = $16,405
- Infrastructure: $2,000/month
- **Total**: $18,405/month

### 13.3 Cost Optimization Strategies

#### Strategy 1: Dynamic TTS Provider Selection

```typescript
function selectTTSProvider(call: OutgoingCallParams): 'deepgram' | 'elevenlabs' {
  // Use ElevenLabs for:
  // 1. VIP customers
  // 2. High-priority campaigns
  // 3. Premium agents

  if (call.metadata?.tier === 'vip' ||
      call.metadata?.priority === 'high' ||
      call.agent.config.usePremiumTTS) {
    return 'elevenlabs';
  }

  // Default: Use Deepgram (cheaper)
  return 'deepgram';
}
```

**Savings**: 5-10x reduction in TTS costs for standard calls

#### Strategy 2: Greeting Audio Caching

**Before**: Synthesize greeting for every call
- 10,000 calls × $0.0225 (Deepgram) = $225/month

**After**: Synthesize once, cache, reuse
- 100 unique greetings × $0.0225 = $2.25/month

**Savings**: $222.75/month (99% reduction)

#### Strategy 3: Off-Peak Scheduling

```typescript
// Schedule non-urgent calls during off-peak hours
async scheduleCall(params: ScheduledCallParams) {
  if (params.priority === 'low') {
    // Schedule between 8pm-8am (off-peak)
    const offPeakTime = this.getNextOffPeakTime();
    params.scheduledFor = offPeakTime;
  }

  // ... rest of scheduling logic
}
```

**Benefits**:
- Lower Exotel rates (if applicable)
- Better connection pool utilization
- Higher success rates (less competition)

#### Strategy 4: Retry Optimization

**Problem**: Failed calls still cost money (Exotel charges for ringing time)

**Solution**: Intelligent retry scheduling + max retry limits

**Before**:
- 1000 calls, 30% fail, 3 retries each
- Total attempts: 1000 + (300 × 3) = 1,900 attempts
- Cost: 1,900 × $0.0718 = $136.42

**After** (smart retry limits):
- 1000 calls, 30% fail, 2 retries each (reduced from 3)
- Total attempts: 1000 + (300 × 2) = 1,600 attempts
- Cost: 1,600 × $0.0718 = $114.88

**Savings**: $21.54 per 1000 calls (16% reduction)

### 13.4 Revenue Model (Example)

**Pricing Tiers for Customers**:

| Tier | Calls/Month | Price | Cost | Margin |
|------|-------------|-------|------|--------|
| **Starter** | 1,000 | $500 | $87 | 82.6% |
| **Growth** | 5,000 | $2,000 | $409 | 79.5% |
| **Business** | 20,000 | $6,000 | $1,636 | 72.7% |
| **Enterprise** | 100,000+ | Custom | ~$9,180 | ~50-70% |

**Note**: These are example prices. Actual pricing depends on market, competition, value proposition, and target customers.

---

## 14. Timeline & Milestones

### Week 1-2: Core Infrastructure

**Focus**: Database, Exotel API integration, basic outbound call

**Tasks**:
- [ ] Database schema updates (CallLog, ScheduledCall, RetryAttempt)
- [ ] Exotel outbound API client
- [ ] Outgoing call service (basic)
- [ ] Unit tests
- [ ] Integration with WebSocket handler

**Deliverable**: Can manually initiate a single outbound call

**Team**: 1 backend engineer

**Estimated Hours**: 60-80

---

### Week 2-3: WebSocket Integration

**Focus**: Voice pipeline integration, streaming, performance

**Tasks**:
- [ ] Outbound voice handler extension
- [ ] Proactive greeting implementation
- [ ] No-response timeout handling
- [ ] Performance optimization (greeting cache, parallel setup)
- [ ] End-to-end testing

**Deliverable**: Fully functional outbound call with sub-2s latency

**Team**: 1 backend engineer

**Estimated Hours**: 60-80

---

### Week 3-4: Scheduling & Retry

**Focus**: Delayed execution, failure handling, reliability

**Tasks**:
- [ ] Bull queue setup
- [ ] Call scheduler service
- [ ] Retry manager service
- [ ] Webhook handlers for Exotel status updates
- [ ] Business hours logic
- [ ] Timezone handling
- [ ] Integration tests

**Deliverable**: Can schedule calls and automatically retry failures

**Team**: 1 backend engineer

**Estimated Hours**: 60-80

---

### Week 4-5: Advanced Features

**Focus**: Voicemail, bulk operations, monitoring

**Tasks**:
- [ ] Voicemail detector service
- [ ] Bulk call API endpoints
- [ ] CSV import functionality
- [ ] Enhanced stats API
- [ ] Analytics dashboard integration
- [ ] Load testing

**Deliverable**: Production-ready system with all features

**Team**: 1 backend engineer + 1 frontend engineer (for dashboard)

**Estimated Hours**: 80-100

---

### Week 5-6: Testing & Documentation

**Focus**: Quality assurance, performance verification, docs

**Tasks**:
- [ ] Comprehensive unit tests (80%+ coverage)
- [ ] Integration test suite
- [ ] Load testing (10, 20, 50 concurrent calls)
- [ ] Manual testing checklist completion
- [ ] API documentation
- [ ] Deployment guide
- [ ] Runbook for on-call engineers

**Deliverable**: Fully tested, documented system

**Team**: 1 backend engineer + 1 QA engineer

**Estimated Hours**: 60-80

---

### Week 6: Beta Testing

**Focus**: Real-world validation, bug fixes

**Tasks**:
- [ ] Deploy to production (limited rollout)
- [ ] Enable for 2 test agents
- [ ] Monitor metrics closely
- [ ] Fix bugs as discovered
- [ ] Collect feedback
- [ ] Performance tuning

**Deliverable**: Production-validated system

**Team**: 1 backend engineer (on-call)

**Estimated Hours**: 40-60

---

### Week 7-8: Gradual Rollout

**Focus**: Scaling up, monitoring, stability

**Tasks**:
- [ ] Day 1: 5% rollout
- [ ] Day 2: 10% rollout
- [ ] Day 3: 25% rollout
- [ ] Day 5: 50% rollout
- [ ] Day 7: 100% rollout
- [ ] Monitor at each step
- [ ] Address issues as they arise
- [ ] Final performance tuning

**Deliverable**: 100% production deployment

**Team**: 1 backend engineer (on-call) + 1 DevOps engineer

**Estimated Hours**: 40-60

---

### Week 9+: Maintenance & Enhancements

**Focus**: Stability, optimization, new features

**Tasks**:
- [ ] Monitor production metrics
- [ ] Optimize costs
- [ ] Fix bugs
- [ ] Performance improvements
- [ ] Feature requests
- [ ] User feedback integration

**Deliverable**: Stable, optimized system

**Team**: 1 backend engineer (ongoing)

**Estimated Hours**: 20-40/week

---

## Summary

This implementation plan provides a comprehensive roadmap to build an **ultra low latency outbound calling system** that matches the performance of the existing incoming call infrastructure (1.4-1.85s latency).

### Key Highlights

1. **80%+ Code Reuse**: Leverages existing voice pipeline, STT, TTS, and audio processing
2. **Sub-2s Latency**: Reuses all performance optimizations from incoming calls
3. **Scalable Architecture**: Designed to handle 20-30 concurrent calls initially, 100+ with scaling
4. **Robust Retry Logic**: Intelligent failure handling with exponential backoff
5. **Cost-Effective**: ~$0.07-$0.38 per call depending on TTS provider
6. **Production-Ready**: Comprehensive testing, monitoring, and error handling
7. **6-8 Week Timeline**: Realistic estimate for full implementation and rollout

### Next Steps

1. **Review & Approve**: Get stakeholder approval on plan
2. **Allocate Resources**: Assign engineers and budget
3. **Start Phase 1**: Begin with database and Exotel API integration
4. **Iterate**: Adjust plan based on learnings during implementation

---

**Document Version**: 1.0
**Last Updated**: 2025-11-01
**Author**: AI Assistant
**Status**: Ready for Review
