# Outbound Calls System Architecture

**Version**: 1.0
**Last Updated**: 2025-11-01
**Status**: Draft

---

## Table of Contents

1. [System Overview](#system-overview)
2. [Component Architecture](#component-architecture)
3. [Data Flow](#data-flow)
4. [Sequence Diagrams](#sequence-diagrams)
5. [Technology Stack](#technology-stack)
6. [Scalability & Performance](#scalability--performance)
7. [Security](#security)
8. [Monitoring & Observability](#monitoring--observability)

---

## System Overview

The outbound calling system extends the existing incoming call infrastructure to support proactive outbound calls with the same ultra-low latency (<2s) performance.

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     CLIENT LAYER                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │   Web UI     │  │  Mobile App  │  │  External API Clients│  │
│  └──────┬───────┘  └──────┬───────┘  └──────────┬───────────┘  │
│         │                 │                      │               │
└─────────┼─────────────────┼──────────────────────┼───────────────┘
          │                 │                      │
          └─────────────────┴──────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                     API GATEWAY                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  • Authentication & Authorization                          │ │
│  │  • Rate Limiting                                           │ │
│  │  • Request Validation                                      │ │
│  │  • Load Balancing                                          │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────┬───────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
        ▼                     ▼                     ▼
┌──────────────┐    ┌──────────────┐    ┌──────────────────┐
│  REST API    │    │  WebSocket   │    │  Webhook Handler │
│  Endpoints   │    │  Server      │    │  (Exotel)        │
└──────┬───────┘    └──────┬───────┘    └──────┬───────────┘
       │                   │                    │
       └───────────────────┴────────────────────┘
                           │
       ┌───────────────────┼───────────────────┐
       │                   │                   │
       ▼                   ▼                   ▼
┌──────────────┐  ┌──────────────────┐  ┌────────────────┐
│  Outgoing    │  │  Voice Pipeline  │  │  Retry Manager │
│  Call Service│  │  Service         │  │  Service       │
└──────┬───────┘  └──────┬───────────┘  └──────┬─────────┘
       │                 │                      │
       ├─────────────────┼──────────────────────┤
       │                 │                      │
       ▼                 ▼                      ▼
┌──────────────────────────────────────────────────────────────┐
│                    INFRASTRUCTURE LAYER                       │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────────┐  │
│  │   MongoDB   │  │  Redis       │  │  Bull Queue        │  │
│  │  (Database) │  │  (Cache &    │  │  (Job Scheduler)   │  │
│  │             │  │   Sessions)  │  │                    │  │
│  └─────────────┘  └──────────────┘  └────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
       │                 │                      │
       └─────────────────┴──────────────────────┘
                         │
       ┌─────────────────┴─────────────────┐
       │                                   │
       ▼                                   ▼
┌──────────────────┐              ┌──────────────────┐
│  EXTERNAL APIs   │              │  CUSTOMER PHONE  │
│  • Exotel        │              │                  │
│  • Deepgram STT  │              └──────────────────┘
│  • ElevenLabs TTS│
│  • OpenAI LLM    │
└──────────────────┘
```

---

## Component Architecture

### Core Services

#### 1. Outgoing Call Service

**Responsibilities**:
- Initiate outbound calls via Exotel API
- Track active call count (concurrency control)
- Validate phone numbers and agent IDs
- Create CallLog records
- Handle call cancellation

**Key Methods**:
```typescript
class OutgoingCallService {
  async initiateCall(params: OutgoingCallParams): Promise<string>
  async getCallStatus(callLogId: string): Promise<CallStatus>
  async cancelCall(callLogId: string): Promise<void>
  async getActiveCalls(): Promise<number>
  async canInitiateCall(): Promise<boolean>
  async bulkInitiateCalls(calls: OutgoingCallParams[]): Promise<string[]>
}
```

**Dependencies**:
- ExotelOutboundService (API client)
- CallLog model (MongoDB)
- DeepgramConnectionPool (optional pre-warming)

---

#### 2. Call Scheduler Service

**Responsibilities**:
- Schedule calls for future execution
- Respect business hours
- Handle timezone conversions
- Manage recurring calls
- Queue management (Bull)

**Key Methods**:
```typescript
class CallScheduler {
  async scheduleCall(params: ScheduledCallParams): Promise<string>
  async rescheduleCall(scheduleId: string, newTime: Date): Promise<void>
  async cancelScheduledCall(scheduleId: string): Promise<void>
  async getScheduledCalls(filters: ScheduleFilters): Promise<ScheduledCall[]>
  private async adjustForBusinessHours(time: Date, hours: BusinessHours): Promise<Date>
}
```

**Dependencies**:
- Bull queue (Redis)
- ScheduledCall model (MongoDB)
- Timezone utilities (moment-timezone)
- OutgoingCallService (for execution)

---

#### 3. Retry Manager Service

**Responsibilities**:
- Schedule retries for failed calls
- Implement exponential backoff
- Track retry attempts
- Enforce max retry limits
- Smart retry scheduling (off-peak hours)

**Key Methods**:
```typescript
class RetryManager {
  async scheduleRetry(callLogId: string, reason: FailureReason): Promise<void>
  async getRetryHistory(callLogId: string): Promise<RetryAttempt[]>
  async cancelRetries(callLogId: string): Promise<void>
  shouldRetry(reason: FailureReason, attemptCount: number): boolean
  calculateRetryDelay(reason: FailureReason, attemptNumber: number): number
}
```

**Dependencies**:
- CallScheduler (for scheduling retries)
- RetryAttempt model (MongoDB)
- CallLog model (MongoDB)

---

#### 4. Exotel Outbound Service

**Responsibilities**:
- Interface with Exotel Call API
- Handle authentication
- Implement rate limiting
- Circuit breaker pattern
- Error handling

**Key Methods**:
```typescript
class ExotelOutboundService {
  async makeCall(params: ExotelCallParams): Promise<ExotelCallResponse>
  async getCallDetails(callSid: string): Promise<ExotelCallDetails>
  async hangupCall(callSid: string): Promise<void>
  async getRecordingUrl(callSid: string): Promise<string>
}
```

**Dependencies**:
- Bottleneck (rate limiting)
- Circuit breaker implementation
- Axios (HTTP client)

---

#### 5. Outbound Voice Handler

**Responsibilities**:
- Handle WebSocket connections for outbound calls
- Send proactive greeting (AI speaks first)
- Manage no-response timeouts
- Integrate with voice pipeline
- Voicemail detection

**Key Methods**:
```typescript
class OutboundVoiceHandler extends ExotelVoiceHandler {
  protected async handleConnection(client: WebSocketClient, callLogId: string): Promise<void>
  private async handleOutboundConnection(client: WebSocketClient, callLog: CallLog): Promise<void>
  private async sendProactiveGreeting(client: WebSocketClient, session: VoiceSession): Promise<void>
  private async handleNoInitialResponse(client: WebSocketClient, session: VoiceSession): Promise<void>
}
```

**Dependencies**:
- ExotelVoiceHandler (base class - existing)
- VoicePipelineService (existing)
- DeepgramConnectionPool (existing)
- GreetingCache (new)
- VoicemailDetector (new)

---

#### 6. Voicemail Detector Service

**Responsibilities**:
- Detect voicemail using heuristics
- Leave automated voicemail message
- Track voicemail outcomes

**Key Methods**:
```typescript
class VoicemailDetector {
  async detectVoicemail(session: VoiceSession): Promise<boolean>
  async leaveVoicemail(client: WebSocketClient, session: VoiceSession): Promise<void>
  private isLongGreeting(duration: number): boolean
  private hasLongSilence(session: VoiceSession): boolean
  private detectBeep(audioChunk: Buffer): boolean
}
```

**Dependencies**:
- VoiceSession (from voice handler)
- TTS service (for message synthesis)

---

#### 7. Greeting Cache Service

**Responsibilities**:
- Cache synthesized greeting audio
- Reduce TTS API calls
- Manage cache lifecycle

**Key Methods**:
```typescript
class GreetingCache {
  async getGreeting(agentId: string, text: string, voiceProvider: string, voiceId: string): Promise<Buffer>
  clearCache(): void
  getCacheStats(): { size: number, hitRate: number }
}
```

**Dependencies**:
- VoicePipelineService (for TTS)
- AudioConverter (for PCM conversion)

---

### Reused Components (Existing)

These components are used as-is with NO changes:

1. **VoicePipelineService** - LLM conversation, RAG, transcript management
2. **DeepgramService** - Streaming STT
3. **DeepgramConnectionPool** - Connection management
4. **ElevenLabsTTSService** - Streaming TTS
5. **DeepgramTTSService** - Alternative TTS
6. **AudioConverter** - Audio format conversions
7. **OpenAIService** - LLM and fallback STT
8. **RAGService** - Knowledge base queries

---

## Data Flow

### Immediate Outbound Call Flow

```
┌────────┐     1. POST /calls/outbound      ┌──────────────────┐
│ Client │───────────────────────────────────▶│  REST API Route  │
└────────┘                                    └────────┬─────────┘
                                                       │
                    2. Validate & Check Limit         │
                                                       ▼
                                              ┌──────────────────┐
                                              │  Outgoing Call   │
                                              │  Service         │
                                              └────────┬─────────┘
                                                       │
                    3. Create CallLog                 │
                    (direction: 'outbound')            │
                                                       ▼
                                              ┌──────────────────┐
                                              │  MongoDB         │
                                              │  (CallLog)       │
                                              └────────┬─────────┘
                                                       │
                    4. Initiate Call                  │
                                                       ▼
                                              ┌──────────────────┐
                                              │  Exotel          │
                                              │  Outbound API    │
                                              └────────┬─────────┘
                                                       │
                    5. Call Status Updates            │
                   (queued, ringing, etc.)             │
                                                       ▼
                                              ┌──────────────────┐
                                              │  Webhook Handler │
                                              └────────┬─────────┘
                                                       │
                    6. Update CallLog                 │
                                                       ▼
                                              ┌──────────────────┐
                                              │  MongoDB         │
                                              └────────┬─────────┘
                                                       │
                    7. Customer Answers               │
                                                       ▼
                                              ┌──────────────────┐
                                              │  Webhook Returns │
                                              │  WebSocket URL   │
                                              └────────┬─────────┘
                                                       │
                    8. WebSocket Connection            │
                                                       ▼
                                              ┌──────────────────┐
                                              │  Outbound Voice  │
                                              │  Handler         │
                                              └────────┬─────────┘
                                                       │
                    9. Voice Pipeline                 │
                   (REUSE EXISTING)                    │
                                                       ▼
                              ┌──────────────────────────────────┐
                              │  Existing Voice Pipeline         │
                              │  • Deepgram STT (streaming)      │
                              │  • LLM (parallel processing)     │
                              │  • TTS (streaming)               │
                              │  • Audio to Exotel               │
                              └──────────────────────────────────┘
```

---

### Scheduled Call Flow

```
┌────────┐   1. POST /calls/outbound/schedule  ┌──────────────────┐
│ Client │─────────────────────────────────────▶│  REST API Route  │
└────────┘                                       └────────┬─────────┘
                                                          │
                 2. Validate & Create CallLog            │
                   (status: 'scheduled')                  │
                                                          ▼
                                                 ┌──────────────────┐
                                                 │  Call Scheduler  │
                                                 │  Service         │
                                                 └────────┬─────────┘
                                                          │
                 3. Create ScheduledCall Record          │
                                                          ▼
                                                 ┌──────────────────┐
                                                 │  MongoDB         │
                                                 │  (ScheduledCall) │
                                                 └────────┬─────────┘
                                                          │
                 4. Add to Queue with Delay              │
                                                          ▼
                                                 ┌──────────────────┐
                                                 │  Bull Queue      │
                                                 │  (Redis)         │
                                                 └────────┬─────────┘
                                                          │
                           ⏰ Wait until scheduled time   │
                                                          │
                 5. Queue Worker Picks Up Job            │
                                                          ▼
                                                 ┌──────────────────┐
                                                 │  Queue Processor │
                                                 └────────┬─────────┘
                                                          │
                 6. Check Business Hours                 │
                   (adjust if needed)                     │
                                                          ▼
                                                 ┌──────────────────┐
                                                 │  Outgoing Call   │
                                                 │  Service         │
                                                 └────────┬─────────┘
                                                          │
                 7. Initiate Call                        │
                   (Same as Immediate Flow)               │
                                                          ▼
                                                 [Continue with steps 4-9
                                                  from Immediate Flow]
```

---

### Retry Flow

```
┌────────────┐   1. Call Fails           ┌──────────────────┐
│  Exotel    │──────────────────────────▶│  Webhook Handler │
│  Webhook   │  (no-answer, busy, error)  └────────┬─────────┘
└────────────┘                                     │
                                                   │
              2. Update CallLog                   │
                (status: 'failed')                 │
                (failureReason: 'no_answer')       │
                                                   ▼
                                          ┌──────────────────┐
                                          │  MongoDB         │
                                          │  (CallLog)       │
                                          └────────┬─────────┘
                                                   │
              3. Trigger Retry                    │
                                                   ▼
                                          ┌──────────────────┐
                                          │  Retry Manager   │
                                          │  Service         │
                                          └────────┬─────────┘
                                                   │
              4. Check Retry Config               │
                (max retries, etc.)                │
                                                   │
              5. Calculate Delay                  │
                (exponential backoff)              │
                                                   ▼
                                          ┌──────────────────┐
                                          │  Create          │
                                          │  RetryAttempt    │
                                          └────────┬─────────┘
                                                   │
              6. Schedule via                     │
                Call Scheduler                     │
                                                   ▼
                                          ┌──────────────────┐
                                          │  Call Scheduler  │
                                          │  Service         │
                                          └────────┬─────────┘
                                                   │
              7. Add to Queue                     │
                with delay                         │
                                                   ▼
                                          ┌──────────────────┐
                                          │  Bull Queue      │
                                          └────────┬─────────┘
                                                   │
                           ⏰ Wait for retry time  │
                                                   │
              8. Execute Retry                    │
                (Same as Scheduled Flow)           │
                                                   ▼
                                          [Continue with Outgoing
                                           Call Service flow]
```

---

## Sequence Diagrams

### Immediate Outbound Call (Detailed)

```
Client    API     OutgoingCall   Exotel   Webhook   Voice    Voice
          Route   Service        API      Handler   Handler  Pipeline
  │         │         │            │         │         │         │
  ├────1────▶         │            │         │         │         │
  │  POST   │         │            │         │         │         │
  │         ├────2────▶            │         │         │         │
  │         │  validate()          │         │         │         │
  │         │         ├─────3──────▶         │         │         │
  │         │         │ makeCall() │         │         │         │
  │         │         │            ├────4────▶         │         │
  │         │         │            │ (webhook)         │         │
  │         │         │            │ queued  │         │         │
  │         │         │◀──────5────┤         │         │         │
  │         │         │  callSid   │         │         │         │
  │         │◀────6───┤            │         │         │         │
  │◀────7───┤  202    │            │         │         │         │
  │ Accept  │         │            │         │         │         │
  │         │         │            │         │         │         │
  │         │         │            │  ringing│         │         │
  │         │         │            ├────8────▶         │         │
  │         │         │            │         │         │         │
  │         │         │            │ answered│         │         │
  │         │         │            ├────9────▶         │         │
  │         │         │            │    WS URL◀───10───┤         │
  │         │         │            │◀────────┤         │         │
  │         │         │            │         │         │         │
  │         │         │            │ WS connect────11──▶         │
  │         │         │            │         │         ├────12───▶
  │         │         │            │         │         │ greeting │
  │         │         │            │◀──audio───────────┤         │
  │         │         │            │         │         │         │
  │         │         │            │──audio──▶         │         │
  │         │         │            │         │         ├─STT─────▶
  │         │         │            │         │         │         │
  │         │         │            │         │         │◀─LLM────┤
  │         │         │            │         │         │         │
  │         │         │            │         │         ├─TTS─────▶
  │         │         │            │◀──audio───────────┤         │
  │         │         │            │         │         │         │
  │         │         │            │  (conversation continues)    │
  │         │         │            │         │         │         │
  │         │         │            │completed│         │         │
  │         │         │            ├───13────▶         │         │
  │         │         │            │         │         │         │
```

---

## Technology Stack

### Backend

| Component | Technology | Purpose |
|-----------|-----------|---------|
| **Runtime** | Node.js 18+ | JavaScript runtime |
| **Framework** | Express.js | Web framework |
| **Language** | TypeScript | Type-safe JavaScript |
| **Database** | MongoDB 6.0+ | Primary data store |
| **Cache & Queue** | Redis 7.0+ | Caching and job queue |
| **Job Queue** | Bull | Background job processing |
| **WebSocket** | ws | WebSocket server |
| **HTTP Client** | Axios | API requests |
| **Validation** | Joi / Zod | Request validation |
| **Rate Limiting** | Bottleneck | API rate limiting |

### External APIs

| Service | Purpose | Vendor |
|---------|---------|--------|
| **Calling** | Outbound calls | Exotel |
| **STT** | Speech-to-text | Deepgram |
| **TTS** | Text-to-speech | ElevenLabs / Deepgram |
| **LLM** | AI conversation | OpenAI / Anthropic |

### Infrastructure

| Component | Technology | Purpose |
|-----------|-----------|---------|
| **Server** | EC2 / VPS | Application hosting |
| **Load Balancer** | ALB / Nginx | Traffic distribution |
| **Database** | MongoDB Atlas | Managed MongoDB |
| **Cache** | Redis Cloud / ElastiCache | Managed Redis |
| **Monitoring** | CloudWatch / Datadog | Metrics and logs |
| **Alerts** | PagerDuty / Slack | Incident notifications |

---

## Scalability & Performance

### Horizontal Scaling

**Stateless Services** (can scale horizontally):
- REST API endpoints
- Webhook handlers
- Queue workers

**Stateful Services** (require coordination):
- WebSocket handlers (use sticky sessions on load balancer)
- Voice pipeline (maintain session state in Redis)

### Scaling Strategy

#### Tier 1: Single Instance (0-20 concurrent calls)

```
┌─────────────────┐
│  Single Server  │
│  • API          │
│  • WebSocket    │
│  • Queue Worker │
└────────┬────────┘
         │
    ┌────┴────┐
    ▼         ▼
┌─────────┐ ┌──────┐
│ MongoDB │ │ Redis│
└─────────┘ └──────┘
```

**Characteristics**:
- Simple deployment
- Low cost (~$150/month)
- Single point of failure

---

#### Tier 2: Load Balanced (20-100 concurrent calls)

```
        ┌──────────────────┐
        │  Load Balancer   │
        │  (Sticky Sessions)│
        └────────┬──────────┘
                 │
       ┌─────────┼─────────┐
       ▼         ▼         ▼
  ┌────────┐ ┌────────┐ ┌────────┐
  │Server 1│ │Server 2│ │Server 3│
  └────┬───┘ └───┬────┘ └───┬────┘
       │         │          │
       └─────────┼──────────┘
                 │
         ┌───────┴───────┐
         ▼               ▼
    ┌─────────┐     ┌──────────┐
    │ MongoDB │     │  Redis   │
    │ Replica │     │  Cluster │
    │  Set    │     │          │
    └─────────┘     └──────────┘
```

**Characteristics**:
- High availability
- Horizontal scaling
- Moderate cost (~$500/month)
- 99.9% uptime

---

#### Tier 3: Auto-Scaling (100-500+ concurrent calls)

```
        ┌──────────────────┐
        │  Load Balancer   │
        └────────┬──────────┘
                 │
        ┌────────▼─────────┐
        │  Auto Scaling    │
        │  Group (5-10)    │
        └────────┬──────────┘
                 │
       ┌─────────┼─────────┐
       ▼         ▼         ▼
  ┌────────┐ ┌────────┐ ┌────────┐
  │Server 1│ │Server N│ │Server M│
  └────┬───┘ └───┬────┘ └───┬────┘
       │         │          │
       └─────────┼──────────┘
                 │
         ┌───────┴───────┐
         ▼               ▼
    ┌─────────┐     ┌──────────┐
    │ MongoDB │     │  Redis   │
    │ Sharded │     │  Cluster │
    │ Cluster │     │  (HA)    │
    └─────────┘     └──────────┘
```

**Characteristics**:
- Dynamic scaling
- High availability
- Multi-region support
- High cost (~$2000/month)
- 99.95% uptime

---

### Performance Targets

| Metric | Target | Measurement |
|--------|--------|-------------|
| **Latency** | <2s (p95) | User speech end → AI response start |
| **Throughput** | 20 calls/sec | Sustained call initiation rate |
| **Error Rate** | <3% | Failed calls / total calls |
| **Success Rate** | >95% | Completed calls / initiated calls |
| **Availability** | 99.5% | Uptime (max 3.6 hrs downtime/month) |

---

## Security

### Authentication & Authorization

**API Authentication**:
- Bearer token (JWT)
- Token expiry: 24 hours
- Refresh token: 30 days

**Authorization Levels**:
- **Admin**: Full access
- **Agent Manager**: Manage agents, view all calls
- **Agent**: View own calls only
- **API Client**: Limited to specific operations

### Data Security

**Encryption**:
- **In Transit**: TLS 1.3 (HTTPS/WSS)
- **At Rest**: MongoDB encrypted storage
- **Secrets**: AWS Secrets Manager / Vault

**PII Handling**:
- Phone numbers: Encrypted in logs
- Transcripts: Access-controlled
- Recordings: Separate encrypted storage
- Retention: 6 months (configurable)

### Webhook Security

**Exotel Webhooks**:
- IP whitelist (Exotel IPs only)
- Signature verification (HMAC)
- Rate limiting (prevent DoS)
- Request validation

### Rate Limiting

**API Endpoints**:
- 100 requests/minute per API key
- 1000 requests/hour per API key
- Burst allowance: 120 requests/minute

**Exotel API**:
- 20 calls/second (outbound)
- Circuit breaker on failures
- Exponential backoff

---

## Monitoring & Observability

### Metrics

**System Metrics**:
- CPU usage (target: <70%)
- Memory usage (target: <80%)
- Disk I/O
- Network bandwidth

**Application Metrics**:
- Active calls count
- Call success rate
- Call failure breakdown
- Average call duration
- Queue depth
- Deepgram pool utilization
- API response times

**Business Metrics**:
- Calls per day/week/month
- Success rate by agent
- Retry rate
- Voicemail rate
- Cost per call

### Logging

**Log Levels**:
- **ERROR**: Failures requiring attention
- **WARN**: Unusual but handled conditions
- **INFO**: Key events (call started, completed)
- **DEBUG**: Detailed diagnostic information (dev only)

**Structured Logging**:
```json
{
  "timestamp": "2025-11-01T14:30:15.000Z",
  "level": "INFO",
  "service": "outgoing-call",
  "callLogId": "call_123",
  "event": "call_initiated",
  "metadata": {
    "phoneNumber": "+91***3210",
    "agentId": "agent_abc"
  }
}
```

### Alerts

**Critical Alerts** (Page on-call immediately):
- API error rate >10% for 5 minutes
- Database connection lost
- Redis connection lost
- Deepgram pool exhausted for 2 minutes
- Service crash

**Warning Alerts** (Notify team):
- API latency >2s p95 for 5 minutes
- Queue depth >50 for 10 minutes
- Disk space <20%
- Memory usage >90%

### Dashboards

**Operations Dashboard**:
- Real-time call count
- Success/failure rates
- Active queues
- System health

**Business Dashboard**:
- Daily/weekly/monthly stats
- Agent performance
- Campaign metrics
- Cost tracking

---

**Document Status**: Draft - Ready for Review
**Next Steps**: Review architecture, identify risks, plan implementation
