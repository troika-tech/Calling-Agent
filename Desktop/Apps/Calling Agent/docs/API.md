# API Documentation

## Table of Contents
- [Authentication](#authentication)
- [API Endpoints](#api-endpoints)
  - [Auth Endpoints](#auth-endpoints)
  - [Agent Endpoints](#agent-endpoints)
  - [Phone Endpoints](#phone-endpoints)
  - [Call Endpoints](#call-endpoints)
  - [Webhook Endpoints](#webhook-endpoints)
  - [Dashboard Endpoints](#dashboard-endpoints)
- [Request/Response Format](#requestresponse-format)
- [Error Handling](#error-handling)
- [Rate Limiting](#rate-limiting)
- [WebSocket Events](#websocket-events)

## Base URL

**Development:** `http://localhost:5000/api/v1`
**Production:** `https://api.yourdomain.com/api/v1`

## Authentication

The API uses JWT (JSON Web Tokens) for authentication.

### Authentication Flow

1. Sign up or login to receive access and refresh tokens
2. Include the access token in the `Authorization` header for all protected endpoints
3. Use the refresh token to obtain a new access token when it expires

### Token Format

```
Authorization: Bearer <access_token>
```

### Token Expiration

- **Access Token:** 7 days
- **Refresh Token:** 30 days

---

## API Endpoints

### Auth Endpoints

#### POST /auth/signup

Create a new user account.

**Authentication:** Not required

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "SecurePassword123!",
  "name": "John Doe"
}
```

**Validation:**
- `email`: Valid email format, required
- `password`: Minimum 8 characters, required
- `name`: String, optional

**Success Response (201):**
```json
{
  "success": true,
  "data": {
    "user": {
      "_id": "64f8a1b2c3d4e5f6a7b8c9d0",
      "email": "user@example.com",
      "name": "John Doe",
      "role": "user",
      "credits": 0,
      "createdAt": "2024-01-15T10:30:00.000Z"
    },
    "tokens": {
      "access": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
      "refresh": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
    }
  }
}
```

**Error Responses:**
- `400`: Validation error
- `409`: Email already registered

---

#### POST /auth/login

Authenticate user and get tokens.

**Authentication:** Not required

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "SecurePassword123!"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "user": {
      "_id": "64f8a1b2c3d4e5f6a7b8c9d0",
      "email": "user@example.com",
      "name": "John Doe",
      "role": "user",
      "credits": 100
    },
    "tokens": {
      "access": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
      "refresh": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
    }
  }
}
```

**Error Responses:**
- `400`: Validation error
- `401`: Invalid credentials

---

#### POST /auth/refresh

Get a new access token using refresh token.

**Authentication:** Not required

**Request Body:**
```json
{
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "access": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

**Error Responses:**
- `400`: Missing refresh token
- `401`: Invalid or expired refresh token

---

#### GET /auth/me

Get current authenticated user information.

**Authentication:** Required

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "user": {
      "_id": "64f8a1b2c3d4e5f6a7b8c9d0",
      "email": "user@example.com",
      "name": "John Doe",
      "role": "user",
      "credits": 100,
      "createdAt": "2024-01-15T10:30:00.000Z",
      "exotelConfig": {
        "apiKey": "EXxxxxxxxxxx",
        "subdomain": "your-subdomain"
      }
    }
  }
}
```

**Error Responses:**
- `401`: Unauthorized

---

### Agent Endpoints

#### GET /agents

Get list of user's agents.

**Authentication:** Required

**Query Parameters:**
- `page` (optional): Page number, default 1
- `limit` (optional): Items per page, default 20, max 100
- `search` (optional): Search by agent name

**Example Request:**
```
GET /agents?page=1&limit=20&search=customer
```

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "agents": [
      {
        "_id": "64f8a1b2c3d4e5f6a7b8c9d1",
        "name": "Customer Support Agent",
        "config": {
          "prompt": "You are a helpful customer support agent...",
          "voice": {
            "provider": "elevenlabs",
            "voiceId": "21m00Tcm4TlvDq8ikWAM",
            "model": "eleven_turbo_v2"
          },
          "language": "en",
          "llm": {
            "model": "gpt-4",
            "temperature": 0.7
          },
          "firstMessage": "Hello! How can I help you today?"
        },
        "isActive": true,
        "createdAt": "2024-01-15T10:30:00.000Z",
        "updatedAt": "2024-01-15T10:30:00.000Z"
      }
    ],
    "pagination": {
      "total": 5,
      "page": 1,
      "limit": 20,
      "pages": 1
    }
  }
}
```

---

#### POST /agents

Create a new agent.

**Authentication:** Required

**Request Body:**
```json
{
  "name": "Sales Agent",
  "config": {
    "prompt": "You are a friendly sales representative...",
    "voice": {
      "provider": "elevenlabs",
      "voiceId": "21m00Tcm4TlvDq8ikWAM",
      "model": "eleven_turbo_v2"
    },
    "language": "en",
    "llm": {
      "model": "gpt-4",
      "temperature": 0.7
    },
    "firstMessage": "Hi! I'm calling from XYZ Company.",
    "sessionTimeout": 300
  }
}
```

**Validation:**
- `name`: Required, 1-100 characters
- `config.prompt`: Required, 10-5000 characters
- `config.voice.provider`: Required, enum: ['openai', 'elevenlabs', 'cartesia']
- `config.voice.voiceId`: Required
- `config.language`: Required, valid language code
- `config.llm.model`: Required, enum: ['gpt-4', 'gpt-3.5-turbo', 'gpt-4-turbo']
- `config.llm.temperature`: Optional, 0-2, default 0.7

**Success Response (201):**
```json
{
  "success": true,
  "data": {
    "agent": {
      "_id": "64f8a1b2c3d4e5f6a7b8c9d1",
      "userId": "64f8a1b2c3d4e5f6a7b8c9d0",
      "name": "Sales Agent",
      "config": { /* config object */ },
      "isActive": true,
      "createdAt": "2024-01-15T10:30:00.000Z"
    }
  }
}
```

**Error Responses:**
- `400`: Validation error
- `401`: Unauthorized

---

#### GET /agents/:id

Get agent details by ID.

**Authentication:** Required

**Path Parameters:**
- `id`: Agent ID (MongoDB ObjectId)

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "agent": {
      "_id": "64f8a1b2c3d4e5f6a7b8c9d1",
      "name": "Sales Agent",
      "config": { /* config object */ },
      "isActive": true,
      "stats": {
        "totalCalls": 150,
        "totalDuration": 45000,
        "avgDuration": 300,
        "successRate": 0.92
      },
      "createdAt": "2024-01-15T10:30:00.000Z",
      "updatedAt": "2024-01-20T14:20:00.000Z"
    }
  }
}
```

**Error Responses:**
- `401`: Unauthorized
- `404`: Agent not found

---

#### PUT /agents/:id

Update agent configuration.

**Authentication:** Required

**Path Parameters:**
- `id`: Agent ID

**Request Body:** (All fields optional, partial update supported)
```json
{
  "name": "Updated Sales Agent",
  "config": {
    "prompt": "Updated prompt...",
    "temperature": 0.8
  }
}
```

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "agent": { /* updated agent object */ }
  }
}
```

**Error Responses:**
- `400`: Validation error
- `401`: Unauthorized
- `404`: Agent not found

---

#### DELETE /agents/:id

Delete an agent.

**Authentication:** Required

**Path Parameters:**
- `id`: Agent ID

**Success Response (200):**
```json
{
  "success": true,
  "message": "Agent deleted successfully"
}
```

**Error Responses:**
- `401`: Unauthorized
- `404`: Agent not found
- `409`: Cannot delete agent with active calls

---

#### POST /agents/:id/duplicate

Duplicate an existing agent.

**Authentication:** Required

**Path Parameters:**
- `id`: Agent ID to duplicate

**Request Body:**
```json
{
  "name": "Copy of Sales Agent"
}
```

**Success Response (201):**
```json
{
  "success": true,
  "data": {
    "agent": { /* duplicated agent object */ }
  }
}
```

---

### Phone Endpoints

#### GET /phones

Get list of user's phone numbers.

**Authentication:** Required

**Query Parameters:**
- `page` (optional): Page number
- `limit` (optional): Items per page
- `status` (optional): Filter by status ('active' | 'inactive')

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "phones": [
      {
        "_id": "64f8a1b2c3d4e5f6a7b8c9d2",
        "number": "+919876543210",
        "country": "IN",
        "provider": "exotel",
        "agentId": "64f8a1b2c3d4e5f6a7b8c9d1",
        "agentName": "Sales Agent",
        "tags": ["sales", "inbound"],
        "status": "active",
        "exotelData": {
          "sid": "EX123456"
        },
        "createdAt": "2024-01-15T10:30:00.000Z"
      }
    ],
    "pagination": {
      "total": 3,
      "page": 1,
      "limit": 20,
      "pages": 1
    }
  }
}
```

---

#### POST /phones/import

Import a phone number from Exotel.

**Authentication:** Required

**Request Body:**
```json
{
  "number": "+919876543210",
  "country": "IN",
  "exotelConfig": {
    "apiKey": "your-api-key",
    "apiToken": "your-api-token",
    "sid": "your-sid",
    "subdomain": "your-subdomain"
  }
}
```

**Success Response (201):**
```json
{
  "success": true,
  "data": {
    "phone": {
      "_id": "64f8a1b2c3d4e5f6a7b8c9d2",
      "number": "+919876543210",
      "country": "IN",
      "provider": "exotel",
      "status": "active",
      "createdAt": "2024-01-15T10:30:00.000Z"
    }
  }
}
```

**Error Responses:**
- `400`: Validation error or Exotel configuration invalid
- `409`: Phone number already exists

---

#### PUT /phones/:id/agent

Assign an agent to a phone number.

**Authentication:** Required

**Path Parameters:**
- `id`: Phone ID

**Request Body:**
```json
{
  "agentId": "64f8a1b2c3d4e5f6a7b8c9d1"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "phone": {
      "_id": "64f8a1b2c3d4e5f6a7b8c9d2",
      "number": "+919876543210",
      "agentId": "64f8a1b2c3d4e5f6a7b8c9d1",
      "agentName": "Sales Agent"
    }
  }
}
```

---

#### PUT /phones/:id/tags

Update phone number tags.

**Authentication:** Required

**Request Body:**
```json
{
  "tags": ["sales", "priority", "inbound"]
}
```

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "phone": {
      "_id": "64f8a1b2c3d4e5f6a7b8c9d2",
      "number": "+919876543210",
      "tags": ["sales", "priority", "inbound"]
    }
  }
}
```

---

#### DELETE /phones/:id

Delete a phone number.

**Authentication:** Required

**Success Response (200):**
```json
{
  "success": true,
  "message": "Phone number deleted successfully"
}
```

---

### Call Endpoints

#### POST /calls/outbound

Initiate an outbound call.

**Authentication:** Required

**Request Body:**
```json
{
  "fromPhone": "+919876543210",
  "toPhone": "+919123456789",
  "agentId": "64f8a1b2c3d4e5f6a7b8c9d1",
  "metadata": {
    "customerName": "John Doe",
    "orderId": "ORD-12345"
  }
}
```

**Validation:**
- `fromPhone`: Required, must be owned by user
- `toPhone`: Required, valid phone number
- `agentId`: Required, must be owned by user
- `metadata`: Optional, object

**Success Response (201):**
```json
{
  "success": true,
  "data": {
    "call": {
      "_id": "64f8a1b2c3d4e5f6a7b8c9d3",
      "sessionId": "sess_abc123xyz",
      "fromPhone": "+919876543210",
      "toPhone": "+919123456789",
      "agentId": "64f8a1b2c3d4e5f6a7b8c9d1",
      "direction": "outbound",
      "status": "initiated",
      "exotelCallSid": "CA123456789",
      "metadata": {
        "customerName": "John Doe",
        "orderId": "ORD-12345"
      },
      "createdAt": "2024-01-15T10:30:00.000Z"
    }
  }
}
```

**Error Responses:**
- `400`: Validation error
- `401`: Unauthorized
- `402`: Insufficient credits
- `404`: Agent or phone not found

---

#### GET /calls

Get call logs with filtering.

**Authentication:** Required

**Query Parameters:**
- `page` (optional): Page number
- `limit` (optional): Items per page
- `status` (optional): Filter by status
- `direction` (optional): 'inbound' | 'outbound'
- `agentId` (optional): Filter by agent
- `fromDate` (optional): ISO date string
- `toDate` (optional): ISO date string

**Example Request:**
```
GET /calls?page=1&limit=20&status=completed&direction=outbound&fromDate=2024-01-01
```

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "calls": [
      {
        "_id": "64f8a1b2c3d4e5f6a7b8c9d3",
        "sessionId": "sess_abc123xyz",
        "fromPhone": "+919876543210",
        "toPhone": "+919123456789",
        "agentId": "64f8a1b2c3d4e5f6a7b8c9d1",
        "agentName": "Sales Agent",
        "direction": "outbound",
        "status": "completed",
        "startedAt": "2024-01-15T10:30:00.000Z",
        "endedAt": "2024-01-15T10:35:30.000Z",
        "durationSec": 330,
        "recordingUrl": "https://s3.amazonaws.com/recordings/call_123.mp3",
        "costBreakdown": {
          "stt": 0.022,
          "llm": 0.045,
          "tts": 0.0002,
          "telephony": 0.03,
          "total": 0.0972
        },
        "createdAt": "2024-01-15T10:30:00.000Z"
      }
    ],
    "pagination": {
      "total": 150,
      "page": 1,
      "limit": 20,
      "pages": 8
    }
  }
}
```

---

#### GET /calls/:id

Get detailed call information.

**Authentication:** Required

**Path Parameters:**
- `id`: Call ID

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "call": {
      "_id": "64f8a1b2c3d4e5f6a7b8c9d3",
      "sessionId": "sess_abc123xyz",
      "fromPhone": "+919876543210",
      "toPhone": "+919123456789",
      "agentId": "64f8a1b2c3d4e5f6a7b8c9d1",
      "agentName": "Sales Agent",
      "direction": "outbound",
      "status": "completed",
      "startedAt": "2024-01-15T10:30:00.000Z",
      "endedAt": "2024-01-15T10:35:30.000Z",
      "durationSec": 330,
      "transcript": "User: Hello\nAgent: Hi! How can I help you?\n...",
      "recordingUrl": "https://s3.amazonaws.com/recordings/call_123.mp3",
      "conversationHistory": [
        {
          "role": "user",
          "content": "Hello",
          "timestamp": "2024-01-15T10:30:05.000Z"
        },
        {
          "role": "assistant",
          "content": "Hi! How can I help you?",
          "timestamp": "2024-01-15T10:30:07.000Z"
        }
      ],
      "metadata": {
        "customerName": "John Doe",
        "orderId": "ORD-12345"
      },
      "costBreakdown": {
        "stt": 0.022,
        "llm": 0.045,
        "tts": 0.0002,
        "telephony": 0.03,
        "total": 0.0972
      }
    }
  }
}
```

---

#### POST /calls/:sessionId/end

End an active call.

**Authentication:** Required

**Path Parameters:**
- `sessionId`: Session ID of active call

**Request Body:**
```json
{
  "reason": "user_requested"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Call ended successfully",
  "data": {
    "sessionId": "sess_abc123xyz",
    "status": "ended"
  }
}
```

---

### Webhook Endpoints

#### POST /webhooks/exotel/incoming

Handle incoming calls from Exotel.

**Authentication:** Exotel signature verification

**Request Body:** (Exotel webhook format)
```json
{
  "From": "+919123456789",
  "To": "+919876543210",
  "CallSid": "CA123456789",
  "Direction": "inbound"
}
```

**Success Response (200):**
Returns Exotel XML response
```xml
<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="en-US-Neural2-F">
    Hello! How can I help you today?
  </Say>
  <Stream url="wss://yourdomain.com/audio/sess_abc123xyz" />
</Response>
```

---

#### POST /webhooks/exotel/status

Handle call status updates from Exotel.

**Authentication:** Exotel signature verification

**Request Body:**
```json
{
  "CallSid": "CA123456789",
  "CallStatus": "completed",
  "CallDuration": "330",
  "RecordingUrl": "https://exotel.com/recordings/call_123.mp3"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Status updated"
}
```

---

#### POST /webhooks/exotel/recording

Handle recording available webhook.

**Success Response (200):**
```json
{
  "success": true,
  "message": "Recording saved"
}
```

---

### Dashboard Endpoints

#### GET /dashboard/stats

Get dashboard statistics.

**Authentication:** Required

**Query Parameters:**
- `fromDate` (optional): ISO date string
- `toDate` (optional): ISO date string

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "stats": {
      "totalCalls": 150,
      "totalDuration": 45000,
      "avgDuration": 300,
      "successRate": 0.92,
      "totalCost": 14.58,
      "callsByStatus": {
        "completed": 138,
        "failed": 8,
        "no-answer": 4
      },
      "callsByDirection": {
        "inbound": 85,
        "outbound": 65
      },
      "topAgents": [
        {
          "agentId": "64f8a1b2c3d4e5f6a7b8c9d1",
          "agentName": "Sales Agent",
          "totalCalls": 95,
          "avgDuration": 320
        }
      ]
    }
  }
}
```

---

## Request/Response Format

### Standard Success Response

```json
{
  "success": true,
  "data": { /* response data */ },
  "message": "Optional success message"
}
```

### Standard Error Response

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable error message",
    "details": { /* additional error details */ }
  }
}
```

### Pagination Format

```json
{
  "pagination": {
    "total": 100,
    "page": 1,
    "limit": 20,
    "pages": 5
  }
}
```

---

## Error Handling

### HTTP Status Codes

- `200` - Success
- `201` - Created
- `400` - Bad Request (validation error)
- `401` - Unauthorized (invalid/missing token)
- `402` - Payment Required (insufficient credits)
- `403` - Forbidden (insufficient permissions)
- `404` - Not Found
- `409` - Conflict (duplicate resource)
- `422` - Unprocessable Entity
- `429` - Too Many Requests (rate limit)
- `500` - Internal Server Error
- `502` - Bad Gateway (external service error)
- `503` - Service Unavailable

### Error Codes

```typescript
enum ErrorCode {
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  NOT_FOUND = 'NOT_FOUND',
  DUPLICATE_RESOURCE = 'DUPLICATE_RESOURCE',
  INSUFFICIENT_CREDITS = 'INSUFFICIENT_CREDITS',
  EXTERNAL_SERVICE_ERROR = 'EXTERNAL_SERVICE_ERROR',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  INTERNAL_ERROR = 'INTERNAL_ERROR'
}
```

### Example Error Response

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed",
    "details": {
      "fields": [
        {
          "field": "email",
          "message": "Invalid email format"
        },
        {
          "field": "password",
          "message": "Password must be at least 8 characters"
        }
      ]
    }
  }
}
```

---

## Rate Limiting

API requests are rate limited to prevent abuse.

### Limits

- **Authentication endpoints:** 5 requests per 15 minutes per IP
- **General API:** 100 requests per 15 minutes per user
- **Call initiation:** 10 requests per minute per user
- **Webhooks:** No limit (signature verified)

### Rate Limit Headers

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1705318800
```

### Rate Limit Error Response (429)

```json
{
  "success": false,
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Too many requests, please try again later",
    "details": {
      "retryAfter": 900
    }
  }
}
```

---

## WebSocket Events

Connect to WebSocket server at: `ws://localhost:5000` (dev) or `wss://api.yourdomain.com` (prod)

### Client → Server Events

#### `call:join`
Join a call session to receive real-time updates.

```javascript
socket.emit('call:join', {
  sessionId: 'sess_abc123xyz',
  token: 'your-jwt-token'
});
```

#### `call:leave`
Leave a call session.

```javascript
socket.emit('call:leave', {
  sessionId: 'sess_abc123xyz'
});
```

#### `call:hangup`
End an active call.

```javascript
socket.emit('call:hangup', {
  sessionId: 'sess_abc123xyz'
});
```

### Server → Client Events

#### `call:started`
Call has been initiated.

```javascript
socket.on('call:started', (data) => {
  console.log(data);
  // {
  //   sessionId: 'sess_abc123xyz',
  //   status: 'initiated',
  //   timestamp: '2024-01-15T10:30:00.000Z'
  // }
});
```

#### `call:connected`
Call has been answered.

```javascript
socket.on('call:connected', (data) => {
  // {
  //   sessionId: 'sess_abc123xyz',
  //   status: 'in-progress',
  //   timestamp: '2024-01-15T10:30:05.000Z'
  // }
});
```

#### `call:transcript`
Real-time transcript update.

```javascript
socket.on('call:transcript', (data) => {
  // {
  //   sessionId: 'sess_abc123xyz',
  //   role: 'user', // or 'assistant'
  //   text: 'Hello, how are you?',
  //   timestamp: '2024-01-15T10:30:10.000Z'
  // }
});
```

#### `call:ended`
Call has ended.

```javascript
socket.on('call:ended', (data) => {
  // {
  //   sessionId: 'sess_abc123xyz',
  //   status: 'completed',
  //   duration: 330,
  //   timestamp: '2024-01-15T10:35:30.000Z'
  // }
});
```

#### `call:error`
Error occurred during call.

```javascript
socket.on('call:error', (data) => {
  // {
  //   sessionId: 'sess_abc123xyz',
  //   error: {
  //     code: 'STT_ERROR',
  //     message: 'Speech recognition failed'
  //   }
  // }
});
```

### Example WebSocket Client

```javascript
import io from 'socket.io-client';

const socket = io('http://localhost:5000', {
  auth: {
    token: 'your-jwt-token'
  }
});

// Join call session
socket.emit('call:join', { sessionId: 'sess_abc123xyz' });

// Listen for transcript updates
socket.on('call:transcript', (data) => {
  console.log(`${data.role}: ${data.text}`);
});

// Handle call end
socket.on('call:ended', (data) => {
  console.log('Call ended:', data);
  socket.emit('call:leave', { sessionId: 'sess_abc123xyz' });
});
```

---

## API Testing

### Using cURL

```bash
# Login
curl -X POST http://localhost:5000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"password123"}'

# Create agent
curl -X POST http://localhost:5000/api/v1/agents \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "name": "Test Agent",
    "config": {
      "prompt": "You are a helpful assistant",
      "voice": {
        "provider": "openai",
        "voiceId": "alloy"
      },
      "language": "en",
      "llm": {
        "model": "gpt-4",
        "temperature": 0.7
      }
    }
  }'
```

### Using Postman

Import the Postman collection: [Download Collection](../postman/AI-Calling-Platform.postman_collection.json)

---

**Next:** See [DATABASE.md](DATABASE.md) for database schema documentation.
