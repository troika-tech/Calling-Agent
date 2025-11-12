# Architecture Documentation

## Table of Contents
- [System Overview](#system-overview)
- [Architecture Layers](#architecture-layers)
- [Component Details](#component-details)
- [Data Flow](#data-flow)
- [Call Flow Sequence](#call-flow-sequence)
- [Technology Decisions](#technology-decisions)
- [Scalability Considerations](#scalability-considerations)
- [Security Architecture](#security-architecture)

## System Overview

The AI Calling Platform is a distributed system designed to handle real-time voice conversations between users and AI agents over telephone networks. The system follows a microservices-inspired architecture while maintaining simplicity for MVP deployment.

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         User Devices                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │   Browser    │  │    Phone     │  │    Mobile    │          │
│  │  Dashboard   │  │   Network    │  │     App      │          │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘          │
└─────────┼──────────────────┼──────────────────┼─────────────────┘
          │                  │                  │
          │ HTTPS           │ PSTN             │ HTTPS
          │                  │                  │
┌─────────▼──────────────────▼──────────────────▼─────────────────┐
│                      API Gateway / Load Balancer                 │
│                         (Nginx / CloudFlare)                     │
└─────────┬────────────────────────────────────────────────────────┘
          │
┌─────────▼────────────────────────────────────────────────────────┐
│                     Application Layer (Node.js)                  │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐    │
│  │  Express API   │  │  Socket.io     │  │  Bull Workers  │    │
│  │  REST/GraphQL  │  │  WebSocket     │  │  Job Queue     │    │
│  └────────┬───────┘  └────────┬───────┘  └────────┬───────┘    │
└───────────┼──────────────────────┼──────────────────┼────────────┘
            │                      │                  │
┌───────────▼──────────────────────▼──────────────────▼────────────┐
│                        Data Layer                                 │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐    │
│  │   MongoDB      │  │     Redis      │  │    AWS S3      │    │
│  │  Primary DB    │  │ Cache/Session  │  │  Recordings    │    │
│  └────────────────┘  └────────────────┘  └────────────────┘    │
└───────────────────────────────────────────────────────────────────┘
            │                      │                  │
┌───────────▼──────────────────────▼──────────────────▼────────────┐
│                     External Services                             │
│  ┌────────────┐  ┌───────────┐  ┌──────────┐  ┌────────────┐   │
│  │  Exotel    │  │ Deepgram  │  │  OpenAI  │  │ ElevenLabs │   │
│  │ Telephony  │  │    STT    │  │   LLM    │  │    TTS     │   │
│  └────────────┘  └───────────┘  └──────────┘  └────────────┘   │
└───────────────────────────────────────────────────────────────────┘
```

## Architecture Layers

### 1. Presentation Layer

**Frontend Application (React)**
- Single Page Application (SPA)
- TypeScript for type safety
- Redux Toolkit for state management
- Material-UI for consistent UI/UX
- Real-time updates via WebSocket

**Responsibilities:**
- User authentication and session management
- Agent configuration interface
- Call monitoring dashboard
- Analytics and reporting views
- Real-time transcript display

### 2. API Layer

**Express.js REST API**
- RESTful endpoints for CRUD operations
- JWT-based authentication
- Request validation with Zod
- Rate limiting and security middleware
- Comprehensive error handling

**Key Routes:**
- `/api/v1/auth/*` - Authentication
- `/api/v1/agents/*` - Agent management
- `/api/v1/phones/*` - Phone number management
- `/api/v1/calls/*` - Call operations
- `/api/v1/webhooks/*` - External service webhooks

### 3. Real-time Communication Layer

**Socket.io WebSocket Server**
- Bidirectional real-time communication
- Room-based architecture for call sessions
- Automatic reconnection handling
- Event-driven updates for call status

**Events:**
- `call:started` - Call initiated
- `call:transcript` - Real-time transcript updates
- `call:ended` - Call completed
- `call:error` - Error notifications

### 4. Business Logic Layer

**Services Architecture**

```typescript
services/
├── auth.service.ts          // User authentication
├── agent.service.ts         // Agent CRUD operations
├── phone.service.ts         // Phone number management
├── call.service.ts          // Call orchestration
├── exotel.service.ts        // Exotel API integration
├── deepgram.service.ts      // Speech-to-Text
├── openai.service.ts        // LLM processing
├── tts.service.ts           // Text-to-Speech
└── voice-pipeline.service.ts // Orchestrate voice flow
```

**Key Responsibilities:**
- Business rule enforcement
- Data validation and transformation
- External API integration
- Error handling and logging
- Transaction management

### 5. Data Persistence Layer

**MongoDB (Primary Database)**
- Document-based storage
- Flexible schema for agent configurations
- Indexed queries for performance
- Aggregation for analytics

**Redis (Cache & Queue)**
- Session storage
- API response caching
- Job queue backend (Bull)
- Rate limiting storage

**AWS S3 (Object Storage)**
- Call recording files
- Knowledge base documents
- User uploads

### 6. Background Processing Layer

**Bull Job Queue**
- Asynchronous call processing
- Campaign execution
- Webhook retries
- Analytics aggregation

**Workers:**
```typescript
workers/
├── call.worker.ts          // Process call jobs
├── voice.worker.ts         // Handle voice pipeline
├── campaign.worker.ts      // Execute campaigns
└── analytics.worker.ts     // Aggregate statistics
```

## Component Details

### Voice Pipeline Service

The core component that orchestrates the voice conversation flow.

```typescript
class VoicePipelineService {
  // Main conversation loop
  async processCallTurn(sessionId: string, audioChunk: Buffer): Promise<Buffer> {
    // 1. Speech to Text
    const transcript = await this.sttService.transcribe(audioChunk);

    // 2. Get conversation context
    const session = await this.getSession(sessionId);

    // 3. Build LLM prompt
    const messages = this.buildConversationHistory(session, transcript);

    // 4. Get AI response
    const aiResponse = await this.llmService.chat(messages, session.agentConfig);

    // 5. Update session history
    await this.updateConversationHistory(sessionId, transcript, aiResponse);

    // 6. Convert to speech
    const audioBuffer = await this.ttsService.synthesize(
      aiResponse,
      session.agentConfig.voice
    );

    // 7. Emit real-time updates
    this.socketService.emitTranscript(sessionId, { transcript, aiResponse });

    return audioBuffer;
  }
}
```

### Exotel Integration Service

Handles all telephony operations through Exotel API.

```typescript
class ExotelService {
  // Make outbound call
  async makeCall(fromPhone: string, toPhone: string, agentId: string): Promise<string> {
    const response = await axios.post(
      `${this.baseUrl}/Calls/connect`,
      {
        From: fromPhone,
        To: toPhone,
        CallerId: fromPhone,
        Url: `${this.webhookUrl}/webhooks/exotel/incoming`,
        StatusCallback: `${this.webhookUrl}/webhooks/exotel/status`
      },
      { auth: { username: this.apiKey, password: this.apiToken } }
    );

    return response.data.Call.Sid;
  }

  // Handle incoming call webhook
  async handleIncomingCall(callData: ExotelCallData): Promise<string> {
    // Find assigned agent for phone number
    const phone = await Phone.findOne({ number: callData.To });
    const agent = await Agent.findById(phone.agentId);

    // Create session
    const session = await this.createSession(callData, agent);

    // Return TwiML/Exotel XML response
    return this.generateCallResponse(agent, session);
  }
}
```

### Session Management

Sessions maintain conversation state for active calls.

```typescript
interface SessionState {
  sessionId: string;
  agentId: string;
  userPhone: string;
  conversationHistory: ConversationTurn[];
  metadata: Record<string, any>;
  startedAt: Date;
  status: 'active' | 'ended';
}

class SessionManager {
  // Store session in Redis for fast access
  async createSession(sessionId: string, data: SessionState): Promise<void> {
    await redis.setex(
      `session:${sessionId}`,
      3600, // 1 hour TTL
      JSON.stringify(data)
    );
  }

  // Retrieve active session
  async getSession(sessionId: string): Promise<SessionState | null> {
    const data = await redis.get(`session:${sessionId}`);
    return data ? JSON.parse(data) : null;
  }

  // Update conversation history
  async addConversationTurn(
    sessionId: string,
    turn: ConversationTurn
  ): Promise<void> {
    const session = await this.getSession(sessionId);
    if (session) {
      session.conversationHistory.push(turn);
      await redis.setex(
        `session:${sessionId}`,
        3600,
        JSON.stringify(session)
      );
    }
  }
}
```

## Data Flow

### 1. User Authentication Flow

```
User → Frontend → POST /api/v1/auth/login
                      ↓
                  Validate credentials
                      ↓
                  Generate JWT tokens
                      ↓
                  Return tokens + user data
                      ↓
Frontend stores in localStorage + Redux
```

### 2. Agent Creation Flow

```
User → Frontend → POST /api/v1/agents
                      ↓
                  Validate JWT
                      ↓
                  Validate agent config
                      ↓
                  Save to MongoDB
                      ↓
                  Return agent data
                      ↓
Frontend updates Redux store
```

### 3. Outbound Call Flow

```
User clicks "Call" → Frontend → POST /api/v1/calls/outbound
                                    ↓
                              Validate phone & agent
                                    ↓
                              Create CallLog entry
                                    ↓
                              Call Exotel API
                                    ↓
                              Create Session
                                    ↓
                              Add job to Bull queue
                                    ↓
Exotel initiates call ← Return call ID
        ↓
User answers phone
        ↓
Exotel webhook → /api/v1/webhooks/exotel/incoming
        ↓
Start voice pipeline
        ↓
Audio stream → Deepgram STT → OpenAI LLM → ElevenLabs TTS → Play audio
        ↓
Conversation loop continues
        ↓
Call ends → /api/v1/webhooks/exotel/status
        ↓
Update CallLog
        ↓
Close session
        ↓
Socket.io emits "call:ended" → Frontend updates UI
```

### 4. Inbound Call Flow

```
User calls phone number
        ↓
Exotel receives call
        ↓
Exotel webhook → POST /api/v1/webhooks/exotel/incoming
        ↓
Find phone number in DB
        ↓
Get assigned agent
        ↓
Create session
        ↓
Return Exotel XML with agent instructions
        ↓
Exotel plays first message
        ↓
User speaks → Audio stream → Voice Pipeline
        ↓
[Same as outbound from here]
```

## Call Flow Sequence

### Detailed Call Processing Sequence

```
┌─────┐     ┌────────┐     ┌─────────┐     ┌──────────┐     ┌─────────┐
│User │     │ Exotel │     │ Backend │     │ Deepgram │     │ OpenAI  │
└──┬──┘     └───┬────┘     └────┬────┘     └────┬─────┘     └────┬────┘
   │            │               │               │                │
   │ Dial phone │               │               │                │
   ├───────────>│               │               │                │
   │            │               │               │                │
   │            │ Webhook (incoming)            │                │
   │            ├──────────────>│               │                │
   │            │               │               │                │
   │            │               │ Create session│                │
   │            │               ├──────────┐    │                │
   │            │               │          │    │                │
   │            │               │<─────────┘    │                │
   │            │               │               │                │
   │            │ Exotel XML    │               │                │
   │            │<──────────────┤               │                │
   │            │               │               │                │
   │ Play greeting              │               │                │
   │<───────────┤               │               │                │
   │            │               │               │                │
   │ User speaks                │               │                │
   ├───────────>│               │               │                │
   │            │               │               │                │
   │            │ Audio stream  │               │                │
   │            ├──────────────>│               │                │
   │            │               │               │                │
   │            │               │ Transcribe    │                │
   │            │               ├──────────────>│                │
   │            │               │               │                │
   │            │               │ Text transcript                │
   │            │               │<──────────────┤                │
   │            │               │               │                │
   │            │               │ Build prompt & send            │
   │            │               ├───────────────────────────────>│
   │            │               │               │                │
   │            │               │ AI response   │                │
   │            │               │<───────────────────────────────┤
   │            │               │               │                │
   │            │               │ Convert to speech (TTS)        │
   │            │               ├──────────┐    │                │
   │            │               │          │    │                │
   │            │               │<─────────┘    │                │
   │            │               │               │                │
   │            │ Audio buffer  │               │                │
   │            │<──────────────┤               │                │
   │            │               │               │                │
   │ AI speaks  │               │               │                │
   │<───────────┤               │               │                │
   │            │               │               │                │
   │            │               │ [Loop continues]               │
   │            │               │               │                │
   │ User ends call             │               │                │
   ├───────────>│               │               │                │
   │            │               │               │                │
   │            │ Status webhook│               │                │
   │            ├──────────────>│               │                │
   │            │               │               │                │
   │            │               │ Update CallLog & Session       │
   │            │               ├──────────┐    │                │
   │            │               │          │    │                │
   │            │               │<─────────┘    │                │
   │            │               │               │                │
```

## Technology Decisions

### Why MERN Stack?

**Pros:**
- JavaScript/TypeScript across the stack (unified language)
- Large ecosystem and community
- Excellent real-time capabilities (Socket.io)
- Fast development speed
- Easy to find developers
- Good for MVP and scaling

**Cons:**
- Not as performant as Go/Rust for CPU-intensive tasks
- Memory management requires careful attention
- Single-threaded (mitigated with clustering)

### Why MongoDB?

**Pros:**
- Flexible schema for agent configurations
- Easy to iterate during development
- Good performance for document-based queries
- Built-in aggregation framework
- Horizontal scaling with sharding

**Cons:**
- Not ideal for complex relationships
- No built-in transactions (mitigated in modern versions)
- Requires careful index management

### Why Redis?

**Pros:**
- Extremely fast (in-memory)
- Perfect for session storage
- Built-in pub/sub for real-time features
- Excellent for caching
- Simple key-value operations

**Use Cases:**
- Session storage (active calls)
- API response caching
- Rate limiting counters
- Bull queue backend

### Why Bull for Job Queue?

**Pros:**
- Redis-backed (reliable)
- Priority queues
- Delayed jobs
- Job retries with backoff
- Web UI for monitoring

**Use Cases:**
- Async call processing
- Campaign execution
- Webhook retries
- Batch operations

## Scalability Considerations

### Horizontal Scaling

```
┌─────────────────────────────────────────────────────────┐
│                    Load Balancer                         │
│                  (Nginx / AWS ALB)                       │
└─────────────┬───────────────┬──────────────┬────────────┘
              │               │              │
    ┌─────────▼────┐  ┌──────▼──────┐  ┌───▼──────────┐
    │  App Server  │  │ App Server  │  │  App Server  │
    │  Instance 1  │  │ Instance 2  │  │  Instance 3  │
    └─────────┬────┘  └──────┬──────┘  └───┬──────────┘
              │               │              │
              └───────────────┴──────────────┘
                              │
                    ┌─────────▼─────────┐
                    │   Shared Redis    │
                    │  (Session Store)  │
                    └───────────────────┘
```

**Strategy:**
1. Stateless API servers (sessions in Redis)
2. Load balancer distributes requests
3. Sticky sessions for WebSocket connections
4. Shared MongoDB and Redis instances
5. Auto-scaling based on CPU/memory

### Database Scaling

**MongoDB:**
- Read replicas for read-heavy operations
- Sharding for data partitioning
- Indexing on frequently queried fields
- Connection pooling

**Redis:**
- Redis Cluster for high availability
- Separate instances for different use cases
- Cache aside pattern for API responses

### Job Queue Scaling

**Bull Workers:**
- Multiple worker processes
- Separate queues for different job types
- Priority-based processing
- Concurrency limits per worker

### CDN and Caching

- CloudFlare for static assets
- API response caching (Redis)
- Database query result caching
- Prefetch common data

## Security Architecture

### Authentication & Authorization

```typescript
// JWT Authentication Middleware
const authMiddleware = async (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = await User.findById(decoded.userId);
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

// Role-Based Authorization
const requireAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};
```

### API Security

- **Rate Limiting**: Prevent brute force attacks
- **Input Validation**: Zod schemas for all inputs
- **SQL Injection**: Mongoose parameterized queries
- **XSS Protection**: Sanitize user inputs
- **CORS**: Whitelist allowed origins
- **HTTPS Only**: Force SSL/TLS
- **Helmet.js**: Security headers

### Webhook Security

```typescript
// Exotel Webhook Verification
const verifyExotelWebhook = (req, res, next) => {
  const signature = req.headers['x-exotel-signature'];
  const payload = JSON.stringify(req.body);

  const expectedSignature = crypto
    .createHmac('sha256', process.env.EXOTEL_WEBHOOK_SECRET)
    .update(payload)
    .digest('hex');

  if (signature !== expectedSignature) {
    return res.status(401).json({ error: 'Invalid webhook signature' });
  }

  next();
};
```

### Data Protection

- **Encryption at Rest**: MongoDB encryption
- **Encryption in Transit**: TLS for all connections
- **PII Protection**: Hash sensitive data
- **Audit Logs**: Track data access
- **Backup Strategy**: Daily automated backups

---

## Performance Optimization

### API Optimization
- Response compression (gzip)
- Database connection pooling
- Query optimization and indexing
- Pagination for large datasets
- Caching strategies

### Real-time Optimization
- WebSocket connection pooling
- Message batching
- Compression for Socket.io
- Efficient room management

### Voice Pipeline Optimization
- Parallel processing where possible
- Audio streaming (don't wait for full file)
- Pre-warm connections to AI services
- Fallback providers for high availability

---

**Next:** See [API.md](API.md) for detailed API documentation.
