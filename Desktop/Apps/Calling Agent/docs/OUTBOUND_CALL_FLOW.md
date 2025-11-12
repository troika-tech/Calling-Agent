# Outbound Call Flow Documentation

## Overview

Outbound calling in the AI Calling Platform leverages the same ultra-low latency voice pipeline as inbound calls, with the key difference being **proactive AI greeting** - the AI speaks first when the recipient answers.

---

## Architecture

### Components

1. **REST API** - Initiate outbound calls
2. **ExotelOutboundService** - Exotel API integration with circuit breaker & rate limiting
3. **OutgoingCallService** - Call orchestration & concurrency control
4. **WebSocket Server** - Real-time voice streaming
5. **ExotelVoiceHandler** - Voice pipeline (works for both inbound & outbound)
6. **Webhook Handler** - Status updates from Exotel

---

## Complete Outbound Call Flow

### Phase 1: Call Initiation

```
┌─────────────┐
│   Client    │
│   (API)     │
└──────┬──────┘
       │
       │ POST /api/v1/calls/outbound
       │ {
       │   phoneNumber: "+919876543210",
       │   agentId: "agent123",
       │   userId: "user123"
       │ }
       │
       ▼
┌──────────────────────────┐
│ OutgoingCallsRoutes      │
│ - Validate phone (E.164) │
│ - Validate request       │
└──────┬───────────────────┘
       │
       ▼
┌──────────────────────────────┐
│ OutgoingCallService          │
│ - Verify agent exists        │
│ - Check concurrent limit     │
│ - Create CallLog (direction: │
│   'outbound', status:        │
│   'initiated')               │
└──────┬───────────────────────┘
       │
       ▼
┌──────────────────────────────┐
│ ExotelOutboundService        │
│ - Circuit breaker check      │
│ - Rate limiter (20/sec)      │
│ - Call Exotel API            │
│   - from: Virtual number     │
│   - to: Customer number      │
│   - appId: Voicebot applet   │
│   - customField: callLogId   │
└──────┬───────────────────────┘
       │
       ▼
┌──────────────────────────────┐
│ Exotel Platform              │
│ - Queue call                 │
│ - Initiate outbound dial     │
│ - Return call SID            │
└──────┬───────────────────────┘
       │
       ▼
┌──────────────────────────────┐
│ Update CallLog               │
│ - exotelCallSid: <SID>       │
│ - outboundStatus: 'queued'   │
│ - status: 'ringing'          │
└──────┬───────────────────────┘
       │
       ▼
┌──────────────────────────────┐
│ Response to Client           │
│ {                            │
│   callLogId: "call123",      │
│   status: "initiated"        │
│ }                            │
└──────────────────────────────┘
```

---

### Phase 2: Call Connection

```
┌──────────────────────────────┐
│ Exotel                       │
│ - Dials customer number      │
│ - Customer answers           │
└──────┬───────────────────────┘
       │
       │ Webhook: status = "in-progress"
       │
       ▼
┌──────────────────────────────┐
│ ExotelController             │
│ .handleStatusWebhook()       │
│ - Find CallLog by SID or     │
│   CustomField (callLogId)    │
│ - Update status:             │
│   'in-progress'              │
│ - Update outboundStatus:     │
│   'connected'                │
└──────┬───────────────────────┘
       │
       ▼
┌──────────────────────────────┐
│ Exotel Voicebot Applet       │
│ - Initiates WebSocket        │
│   connection to:             │
│   wss://your-domain/ws/      │
│   exotel/voice/:callLogId    │
└──────┬───────────────────────┘
       │
       ▼
┌──────────────────────────────┐
│ WebSocket Server             │
│ - Accepts connection         │
│ - Extracts callLogId from    │
│   URL path                   │
└──────┬───────────────────────┘
       │
       ▼
┌──────────────────────────────┐
│ ExotelVoiceHandler           │
│ .handleConnection()          │
│ - Load CallLog & Agent       │
│ - Initialize voice pipeline  │
│ - Acquire Deepgram conn      │
│   from pool (max 20)         │
│ - Setup streaming STT        │
│ - *** SEND GREETING ***      │
│   (AI speaks first!)         │
└──────────────────────────────┘
```

---

### Phase 3: Voice Conversation (AI Speaks First)

```
┌──────────────────────────────┐
│ ExotelVoiceHandler           │
│ .sendGreeting()              │
│                              │
│ 1. Get greeting message      │
│    from agent config         │
│    (greetingMessage or       │
│    firstMessage field)       │
│                              │
│ 2. Generate TTS audio        │
│    - ElevenLabs streaming OR │
│    - Deepgram TTS            │
│                              │
│ 3. Convert audio:            │
│    16kHz PCM → 8kHz PCM      │
│    (Exotel format)           │
│                              │
│ 4. Send to customer via      │
│    WebSocket:                │
│    {                         │
│      event: "media",         │
│      media: {                │
│        payload: "<base64>"   │
│      }                       │
│    }                         │
└──────┬───────────────────────┘
       │
       ▼
┌──────────────────────────────┐
│ Customer Hears Greeting      │
│ "Hello! How can I help       │
│  you today?"                 │
└──────┬───────────────────────┘
       │
       │ Customer responds...
       │
       ▼
┌──────────────────────────────┐
│ Streaming Voice Pipeline     │
│ (Same as Inbound)            │
│                              │
│ 1. Audio chunks arrive via   │
│    WebSocket (8kHz PCM)      │
│                              │
│ 2. Send to Deepgram Live     │
│    STT (streaming)           │
│    - Endpointing: 100ms      │
│    - VAD events enabled      │
│                              │
│ 3. Partial transcripts →     │
│    Trigger early LLM         │
│    (parallel processing)     │
│                              │
│ 4. Final transcript →        │
│    Complete LLM call         │
│                              │
│ 5. LLM response →            │
│    Streaming TTS             │
│                              │
│ 6. TTS audio →               │
│    Send to customer          │
│                              │
│ ULTRA-LOW LATENCY:           │
│ - STT streaming: <150ms      │
│ - Early LLM trigger: 3 words │
│ - TTS streaming: <200ms      │
│ - Total: <500ms response     │
└──────────────────────────────┘
```

---

### Phase 4: Call Completion

```
┌──────────────────────────────┐
│ Call Ends                    │
│ - Customer hangs up OR       │
│ - AI ends call OR            │
│ - API cancels call           │
└──────┬───────────────────────┘
       │
       │ WebSocket "stop" event
       │
       ▼
┌──────────────────────────────┐
│ ExotelVoiceHandler           │
│ .handleStop()                │
│ - Save conversation          │
│ - Release Deepgram conn      │
│ - Update CallLog:            │
│   status: 'completed',       │
│   endedAt: Date              │
│ - Clean up session           │
└──────┬───────────────────────┘
       │
       │ Exotel webhook:
       │ status = "completed"
       │
       ▼
┌──────────────────────────────┐
│ ExotelController             │
│ .handleStatusWebhook()       │
│ - Update CallLog:            │
│   - duration                 │
│   - recordingUrl             │
│   - final status             │
│ - Call                       │
│   outgoingCallService        │
│   .markCallEnded()           │
│   (remove from active        │
│   calls tracking)            │
└──────────────────────────────┘
```

---

## Key Features

### 1. Proactive AI Greeting

**Unlike inbound calls where the customer speaks first**, outbound calls have the AI initiate the conversation:

```typescript
// From exotelVoice.handler.ts
async sendGreeting(client: WebSocketClient, session: VoiceSession) {
  const greeting = agent.config?.greetingMessage ||
                   agent.config?.firstMessage ||
                   'Hello! How can I help you today?';

  // Generate TTS audio
  // Send to customer
  // Customer hears AI first!
}
```

**Agent Configuration**:
```json
{
  "config": {
    "greetingMessage": "Hi! This is Sarah from Acme Corp. Is this a good time to talk?",
    "prompt": "You are a friendly sales agent...",
    "voice": {
      "provider": "elevenlabs",
      "voiceId": "21m00Tcm4TlvDq8ikWAM"
    }
  }
}
```

### 2. Ultra-Low Latency Pipeline

**Same performance as inbound calls**:

| Component | Latency |
|-----------|---------|
| Speech End → Transcript | <150ms |
| Early LLM Trigger | 3 words (parallel) |
| LLM First Token | <300ms |
| TTS First Chunk | <200ms |
| **Total Response Time** | **<500ms** |

**Optimizations**:
- Deepgram Live STT with 100ms endpointing
- Connection pooling (max 20 concurrent)
- Early LLM triggering on partial transcripts
- Streaming TTS (ElevenLabs or Deepgram)
- Audio format conversion caching

### 3. Concurrent Call Management

```typescript
// From outgoingCall.service.ts
MAX_CONCURRENT_CALLS: 10 (configurable)

Active call tracking:
- Map<callLogId, timestamp>
- Automatic cleanup after 1 hour
- Real-time utilization monitoring
```

### 4. Fault Tolerance

**Circuit Breaker**:
```typescript
FAILURE_THRESHOLD: 5
TIMEOUT: 60 seconds
States: closed → open → half-open
```

**Rate Limiting**:
```typescript
Reservoir: 20 calls/second
MaxConcurrent: 10
MinTime: 50ms between calls
```

---

## API Endpoints

### Initiate Outbound Call

```http
POST /api/v1/calls/outbound
Content-Type: application/json

{
  "phoneNumber": "+919876543210",
  "agentId": "agent123",
  "userId": "user123",
  "metadata": {
    "campaignId": "camp123",
    "purpose": "sales_follow_up"
  },
  "priority": "high"
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "callLogId": "call123",
    "status": "initiated",
    "message": "Outbound call initiated successfully"
  }
}
```

### Get Call Status

```http
GET /api/v1/calls/:callLogId
```

**Response**:
```json
{
  "success": true,
  "data": {
    "callLogId": "call123",
    "status": "in-progress",
    "outboundStatus": "connected",
    "phoneNumber": "+919876543210",
    "startedAt": "2025-11-01T10:00:00Z",
    "duration": 45
  }
}
```

### Cancel Call

```http
POST /api/v1/calls/:callLogId/cancel
```

**Response**:
```json
{
  "success": true,
  "data": {
    "callLogId": "call123",
    "status": "canceled",
    "message": "Call cancelled successfully"
  }
}
```

---

## WebSocket Protocol

### Connection

```
wss://your-domain/ws/exotel/voice/:callLogId
```

**Initiated by**: Exotel Voicebot Applet (after customer answers)

### Messages (Exotel → Server)

**Media Event** (Customer Audio):
```json
{
  "event": "media",
  "stream_sid": "stream123",
  "media": {
    "chunk": "1",
    "timestamp": "1234567890",
    "payload": "<base64 PCM audio, 8kHz, 16-bit>"
  }
}
```

**Stop Event** (Call End):
```json
{
  "event": "stop",
  "stop": {
    "call_sid": "call123",
    "account_sid": "account123",
    "reason": "call_ended"
  }
}
```

### Messages (Server → Exotel)

**Media Event** (AI Audio):
```json
{
  "event": "media",
  "stream_sid": "stream123",
  "media": {
    "payload": "<base64 PCM audio, 8kHz, 16-bit>"
  }
}
```

**Mark Event** (Audio Playback Confirmation):
```json
{
  "event": "mark",
  "stream_sid": "stream123",
  "mark": {
    "name": "audio_chunk_123"
  }
}
```

---

## Database Schema

### CallLog (Outbound Fields)

```typescript
{
  // Standard fields
  sessionId: string,
  userId: ObjectId,
  agentId: ObjectId,
  fromPhone: string,  // Virtual number
  toPhone: string,    // Customer number
  direction: 'outbound',

  // Outbound-specific
  outboundStatus: 'queued' | 'ringing' | 'connected' | 'no_answer' | 'busy' | 'voicemail',
  scheduledFor: Date,     // If scheduled
  initiatedAt: Date,      // When call started
  retryCount: number,     // Number of retries
  retryOf: ObjectId,      // Original call if retry
  failureReason: 'no_answer' | 'busy' | 'voicemail' | 'invalid_number',

  // Call tracking
  status: 'initiated' | 'ringing' | 'in-progress' | 'completed' | 'failed',
  exotelCallSid: string,
  startedAt: Date,
  endedAt: Date,
  durationSec: number,
  recordingUrl: string,

  // Conversation
  transcript: Array<{
    speaker: 'user' | 'agent',
    text: string,
    timestamp: Date
  }>
}
```

---

## Error Handling

### Common Errors

| Error Code | Description | HTTP Status |
|-----------|-------------|-------------|
| `INVALID_PHONE_NUMBER` | Invalid E.164 format | 400 |
| `AGENT_NOT_FOUND` | Agent doesn't exist | 404 |
| `CONCURRENT_LIMIT_REACHED` | Max calls exceeded | 429 |
| `API_UNAVAILABLE` | Circuit breaker open | 503 |
| `RATE_LIMIT_EXCEEDED` | Too many requests | 429 |

### Retry Strategy

Handled by `RetryAttempt` model (Phase 4):

```typescript
{
  failureReason: 'no_answer',
  maxRetries: 3,
  backoffStrategy: 'exponential',
  delays: [300000, 900000, 1800000]  // 5min, 15min, 30min
}
```

---

## Configuration

### Environment Variables

```env
# Exotel API
EXOTEL_API_KEY=your_key
EXOTEL_API_TOKEN=your_token
EXOTEL_SID=your_sid
EXOTEL_VIRTUAL_NUMBER=+91xxxxxxxxxx
EXOTEL_APP_ID=your_voicebot_app_id

# Outbound Calling
MAX_CONCURRENT_OUTBOUND_CALLS=10

# Deepgram
DEEPGRAM_MAX_CONNECTIONS=20

# WebSocket
WEBHOOK_BASE_URL=https://calling-api.0804.in
```

### Agent Configuration

```json
{
  "name": "Sales Agent",
  "config": {
    "greetingMessage": "Hi! This is Sarah from Acme Corp. How are you today?",
    "prompt": "You are a friendly sales representative...",
    "voice": {
      "provider": "elevenlabs",
      "voiceId": "21m00Tcm4TlvDq8ikWAM",
      "settings": {
        "stability": 0.5,
        "similarityBoost": 0.75
      }
    },
    "llm": {
      "model": "claude-3-5-sonnet-20241022",
      "temperature": 0.7,
      "maxTokens": 150
    },
    "language": "en"
  }
}
```

---

## Monitoring & Observability

### Performance Metrics

Logged for every conversation turn:

```typescript
{
  speechDuration: 2345,      // User speech length (ms)
  sttLatency: 145,           // STT processing time (ms)
  ragLatency: 89,            // RAG lookup time (ms)
  llmLatency: 287,           // LLM generation time (ms)
  llmTTFT: 145,              // Time to first token (ms)
  ttsLatency: 178,           // TTS generation time (ms)
  ttsTTFC: 92,               // Time to first chunk (ms)
  totalLatency: 456          // Total response time (ms)
}
```

### Service Stats

```http
GET /api/v1/calls/outbound/stats
```

**Response**:
```json
{
  "activeCalls": 5,
  "maxConcurrentCalls": 10,
  "utilization": 50,
  "circuitBreaker": "closed",
  "rateLimiter": {
    "currentJobs": 2,
    "queuedJobs": 0
  }
}
```

---

## Testing

### Manual Test (cURL)

```bash
# 1. Initiate call
curl -X POST http://localhost:5000/api/v1/calls/outbound \
  -H "Content-Type: application/json" \
  -d '{
    "phoneNumber": "+919876543210",
    "agentId": "agent_id_here",
    "userId": "user_id_here"
  }'

# 2. Get status
curl http://localhost:5000/api/v1/calls/call123

# 3. Cancel if needed
curl -X POST http://localhost:5000/api/v1/calls/call123/cancel
```

### Expected Flow

1. ✅ Call initiated → `status: "initiated"`
2. ✅ Exotel dials → `outboundStatus: "ringing"`
3. ✅ Customer answers → `outboundStatus: "connected"`
4. ✅ WebSocket connects
5. ✅ AI sends greeting (customer hears AI first)
6. ✅ Customer responds
7. ✅ Full conversation via streaming pipeline
8. ✅ Call ends → `status: "completed"`

---

## Comparison: Inbound vs Outbound

| Aspect | Inbound | Outbound |
|--------|---------|----------|
| **Initiator** | Customer | System (API) |
| **First Speaker** | Customer | AI (proactive greeting) |
| **Phone Numbers** | Customer → Virtual | Virtual → Customer |
| **Call Direction** | `inbound` | `outbound` |
| **Concurrency** | Unlimited | Limited (configurable) |
| **Voice Pipeline** | ✅ Same | ✅ Same |
| **Streaming STT** | ✅ Yes | ✅ Yes |
| **Ultra-Low Latency** | ✅ Yes | ✅ Yes |
| **WebSocket Path** | `/ws/exotel/voice/:callLogId` | Same |
| **Voice Handler** | `exotelVoiceHandler` | Same |

**Key Insight**: The voice pipeline is **completely direction-agnostic**. The only difference is **who initiates the call** and **who speaks first**.

---

## Implementation Status

✅ **Phase 1: Foundation** (COMPLETED)
- Database models
- Exotel API client
- Outgoing call service
- REST API endpoints
- Unit tests (58+ tests)

✅ **Phase 2: Voice Pipeline Integration** (COMPLETED)
- Webhook handlers for status updates
- Voice handler verification (already supports outbound)
- Proactive greeting (already implemented)
- Streaming pipeline integration (already implemented)

⏳ **Phase 3: Scheduling** (PENDING)
- Scheduled calls
- Business hours
- Timezone handling
- Recurring calls

⏳ **Phase 4: Retry Logic** (PENDING)
- Automatic retries
- Exponential backoff
- Failure categorization

⏳ **Phase 5: Advanced Features** (PENDING)
- Campaign management
- Bulk operations
- Analytics dashboard

⏳ **Phase 6: Production** (PENDING)
- Load testing
- Security audit
- Documentation
- Deployment

---

## Next Steps

1. **Test End-to-End Flow**
   - Initiate test call via API
   - Verify WebSocket connection
   - Confirm AI greeting plays
   - Test full conversation

2. **Configure Exotel Voicebot Applet**
   - Set WebSocket URL
   - Configure audio format (8kHz PCM)
   - Set custom field mapping

3. **Production Deployment**
   - SSL/TLS for WebSocket
   - Load balancer configuration
   - Monitoring & alerting
   - Scaling strategy

---

**Document Version**: 1.0
**Last Updated**: 2025-11-01
**Status**: Phase 2 Complete
