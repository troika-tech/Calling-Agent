# API Documentation

## Overview

Complete API reference for the AI Calling Platform.

**Base URL**: `https://api.yourdomain.com/api/v1`
**Authentication**: Bearer token (JWT)
**Content-Type**: `application/json`

---

## 🔐 Authentication

### Register User

```http
POST /auth/register
```

**Request Body**:
```json
{
  "email": "user@example.com",
  "password": "SecurePassword123!",
  "name": "John Doe"
}
```

**Response** (201 Created):
```json
{
  "success": true,
  "message": "User registered successfully",
  "data": {
    "user": {
      "_id": "user_123",
      "email": "user@example.com",
      "name": "John Doe"
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

### Login

```http
POST /auth/login
```

**Request Body**:
```json
{
  "email": "user@example.com",
  "password": "SecurePassword123!"
}
```

**Response** (200 OK):
```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "user": {
      "_id": "user_123",
      "email": "user@example.com",
      "name": "John Doe"
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

---

## 🤖 Agents

### Create Agent

```http
POST /agents
Authorization: Bearer <token>
```

**Request Body**:
```json
{
  "name": "Customer Support Agent",
  "systemPrompt": "You are a helpful customer support agent for Acme Corp. Answer questions about our products and services politely and professionally.",
  "voice": "Rachel",
  "model": "gpt-4",
  "temperature": 0.7,
  "maxTokens": 150,
  "isActive": true
}
```

**Response** (201 Created):
```json
{
  "success": true,
  "message": "Agent created successfully",
  "data": {
    "_id": "agent_123",
    "name": "Customer Support Agent",
    "systemPrompt": "You are a helpful...",
    "voice": "Rachel",
    "model": "gpt-4",
    "temperature": 0.7,
    "maxTokens": 150,
    "isActive": true,
    "userId": "user_123",
    "createdAt": "2025-11-01T10:00:00.000Z"
  }
}
```

### List Agents

```http
GET /agents
Authorization: Bearer <token>
```

**Query Parameters**:
- `isActive` (optional): `true` | `false`
- `page` (optional): Page number (default: 1)
- `limit` (optional): Results per page (default: 10)

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "agents": [
      {
        "_id": "agent_123",
        "name": "Customer Support Agent",
        "isActive": true,
        "createdAt": "2025-11-01T10:00:00.000Z"
      }
    ],
    "pagination": {
      "total": 1,
      "page": 1,
      "limit": 10,
      "pages": 1
    }
  }
}
```

### Get Agent

```http
GET /agents/:id
Authorization: Bearer <token>
```

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "_id": "agent_123",
    "name": "Customer Support Agent",
    "systemPrompt": "You are a helpful...",
    "voice": "Rachel",
    "model": "gpt-4",
    "temperature": 0.7,
    "maxTokens": 150,
    "isActive": true,
    "userId": "user_123",
    "createdAt": "2025-11-01T10:00:00.000Z"
  }
}
```

### Update Agent

```http
PUT /agents/:id
Authorization: Bearer <token>
```

**Request Body** (all fields optional):
```json
{
  "name": "Updated Agent Name",
  "systemPrompt": "Updated prompt...",
  "isActive": false
}
```

**Response** (200 OK):
```json
{
  "success": true,
  "message": "Agent updated successfully",
  "data": {
    "_id": "agent_123",
    "name": "Updated Agent Name",
    ...
  }
}
```

### Delete Agent

```http
DELETE /agents/:id
Authorization: Bearer <token>
```

**Response** (200 OK):
```json
{
  "success": true,
  "message": "Agent deleted successfully"
}
```

---

## 📞 Phone Numbers

### Register Phone Number

```http
POST /phones
Authorization: Bearer <token>
```

**Request Body**:
```json
{
  "phoneNumber": "+919876543210",
  "agentId": "agent_123"
}
```

**Response** (201 Created):
```json
{
  "success": true,
  "message": "Phone number registered successfully",
  "data": {
    "_id": "phone_123",
    "phoneNumber": "+919876543210",
    "agentId": "agent_123",
    "userId": "user_123",
    "isActive": true,
    "createdAt": "2025-11-01T10:00:00.000Z"
  }
}
```

### List Phone Numbers

```http
GET /phones
Authorization: Bearer <token>
```

**Response** (200 OK):
```json
{
  "success": true,
  "data": [
    {
      "_id": "phone_123",
      "phoneNumber": "+919876543210",
      "agentId": {
        "_id": "agent_123",
        "name": "Customer Support Agent"
      },
      "isActive": true
    }
  ]
}
```

### Update Phone Number

```http
PUT /phones/:id
Authorization: Bearer <token>
```

**Request Body**:
```json
{
  "agentId": "agent_456",
  "isActive": false
}
```

**Response** (200 OK):
```json
{
  "success": true,
  "message": "Phone number updated successfully",
  "data": {
    "_id": "phone_123",
    "phoneNumber": "+919876543210",
    "agentId": "agent_456",
    "isActive": false
  }
}
```

---

## 📤 Outbound Calls

### Initiate Call

```http
POST /calls/outbound
Authorization: Bearer <token>
```

**Request Body**:
```json
{
  "toPhone": "+919876543210",
  "agentId": "agent_123",
  "context": "Customer callback regarding order #12345",
  "scheduledFor": "2025-11-02T10:00:00Z",
  "timezone": "Asia/Kolkata",
  "priority": "high"
}
```

**Fields**:
- `toPhone` (required): Recipient phone number
- `agentId` (required): Agent to use for the call
- `context` (optional): Additional context for the agent
- `scheduledFor` (optional): ISO 8601 timestamp (default: immediate)
- `timezone` (optional): Timezone for scheduling (default: UTC)
- `priority` (optional): `low` | `normal` | `high` (default: normal)

**Response** (201 Created):
```json
{
  "success": true,
  "message": "Call initiated successfully",
  "data": {
    "_id": "call_123",
    "toPhone": "+919876543210",
    "agentId": "agent_123",
    "status": "scheduled",
    "scheduledFor": "2025-11-02T10:00:00Z",
    "timezone": "Asia/Kolkata",
    "priority": "high",
    "createdAt": "2025-11-01T10:00:00.000Z"
  }
}
```

### List Calls

```http
GET /calls/outbound
Authorization: Bearer <token>
```

**Query Parameters**:
- `status` (optional): `scheduled` | `in-progress` | `completed` | `failed`
- `agentId` (optional): Filter by agent
- `startDate` (optional): ISO 8601 timestamp
- `endDate` (optional): ISO 8601 timestamp
- `page` (optional): Page number
- `limit` (optional): Results per page

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "calls": [
      {
        "_id": "call_123",
        "toPhone": "+919876543210",
        "agentId": "agent_123",
        "status": "completed",
        "duration": 180,
        "createdAt": "2025-11-01T10:00:00.000Z"
      }
    ],
    "pagination": {
      "total": 1,
      "page": 1,
      "limit": 10,
      "pages": 1
    }
  }
}
```

### Get Call Details

```http
GET /calls/outbound/:id
Authorization: Bearer <token>
```

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "_id": "call_123",
    "toPhone": "+919876543210",
    "agentId": "agent_123",
    "status": "completed",
    "duration": 180,
    "transcript": [
      {
        "role": "assistant",
        "content": "Hello! This is customer support from Acme Corp.",
        "timestamp": "2025-11-01T10:00:05.000Z"
      },
      {
        "role": "user",
        "content": "Hi, I'm calling about my order.",
        "timestamp": "2025-11-01T10:00:10.000Z"
      }
    ],
    "metadata": {
      "voicemailDetected": false,
      "callQuality": "good"
    },
    "createdAt": "2025-11-01T10:00:00.000Z"
  }
}
```

### Cancel Scheduled Call

```http
DELETE /calls/outbound/:id
Authorization: Bearer <token>
```

**Response** (200 OK):
```json
{
  "success": true,
  "message": "Call cancelled successfully"
}
```

---

## 📅 Scheduling

### Schedule Recurring Call

```http
POST /scheduling/recurring
Authorization: Bearer <token>
```

**Request Body**:
```json
{
  "agentId": "agent_123",
  "toPhone": "+919876543210",
  "pattern": "daily",
  "time": "10:00",
  "timezone": "Asia/Kolkata",
  "startDate": "2025-11-01",
  "endDate": "2025-11-30",
  "businessHoursOnly": true
}
```

**Fields**:
- `pattern`: `daily` | `weekly` | `monthly`
- `time`: HH:MM format (24-hour)
- `businessHoursOnly`: Respect business hours (9 AM - 6 PM)

**Response** (201 Created):
```json
{
  "success": true,
  "message": "Recurring call scheduled successfully",
  "data": {
    "_id": "schedule_123",
    "agentId": "agent_123",
    "toPhone": "+919876543210",
    "pattern": "daily",
    "time": "10:00",
    "timezone": "Asia/Kolkata",
    "isActive": true,
    "nextRunAt": "2025-11-02T10:00:00Z"
  }
}
```

### List Scheduled Calls

```http
GET /scheduling/list
Authorization: Bearer <token>
```

**Response** (200 OK):
```json
{
  "success": true,
  "data": [
    {
      "_id": "schedule_123",
      "agentId": "agent_123",
      "toPhone": "+919876543210",
      "pattern": "daily",
      "time": "10:00",
      "isActive": true,
      "nextRunAt": "2025-11-02T10:00:00Z"
    }
  ]
}
```

### Cancel Recurring Schedule

```http
DELETE /scheduling/recurring/:id
Authorization: Bearer <token>
```

**Response** (200 OK):
```json
{
  "success": true,
  "message": "Recurring schedule cancelled successfully"
}
```

### Get Queue Statistics

```http
GET /scheduling/stats
Authorization: Bearer <token>
```

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "queue": {
      "waiting": 5,
      "active": 2,
      "completed": 150,
      "failed": 10
    },
    "scheduledCalls": {
      "next24Hours": 25,
      "nextWeek": 100
    }
  }
}
```

---

## 🔄 Retry Management

### Get Retry Configuration

```http
GET /retry/config/:agentId
Authorization: Bearer <token>
```

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "agentId": "agent_123",
    "retryConfig": {
      "no_answer": {
        "maxAttempts": 3,
        "initialDelay": 300000,
        "backoffMultiplier": 2
      },
      "busy": {
        "maxAttempts": 2,
        "initialDelay": 600000,
        "backoffMultiplier": 1.5
      },
      "failed": {
        "maxAttempts": 2,
        "initialDelay": 900000,
        "backoffMultiplier": 1.5
      }
    }
  }
}
```

### Update Retry Configuration

```http
PUT /retry/config/:agentId
Authorization: Bearer <token>
```

**Request Body**:
```json
{
  "no_answer": {
    "maxAttempts": 5,
    "initialDelay": 600000
  }
}
```

**Response** (200 OK):
```json
{
  "success": true,
  "message": "Retry configuration updated successfully"
}
```

### List Pending Retries

```http
GET /retry/pending
Authorization: Bearer <token>
```

**Response** (200 OK):
```json
{
  "success": true,
  "data": [
    {
      "_id": "call_123",
      "toPhone": "+919876543210",
      "retryAttempt": 2,
      "nextRetryAt": "2025-11-01T11:00:00Z",
      "failureReason": "no_answer"
    }
  ]
}
```

### Manual Retry

```http
POST /retry/manual/:callId
Authorization: Bearer <token>
```

**Response** (200 OK):
```json
{
  "success": true,
  "message": "Call retry initiated successfully",
  "data": {
    "_id": "call_456",
    "originalCallId": "call_123",
    "retryAttempt": 3,
    "status": "scheduled"
  }
}
```

---

## 📊 Bulk Operations

### Validate CSV

```http
POST /bulk/import/validate
Authorization: Bearer <token>
Content-Type: multipart/form-data
```

**Form Data**:
- `file`: CSV file
- `skipHeader`: `true` | `false` (optional)

**CSV Format**:
```csv
phoneNumber,agentId,userId,scheduledFor,timezone,priority
+919876543210,agent_123,user_123,2025-11-02T10:00:00Z,Asia/Kolkata,high
+919876543211,agent_123,user_123,2025-11-02T11:00:00Z,Asia/Kolkata,normal
```

**Response** (200 OK):
```json
{
  "success": true,
  "message": "CSV validation successful",
  "data": {
    "totalRows": 2,
    "validRows": 2,
    "invalidRows": 0,
    "errors": [],
    "preview": [
      {
        "phoneNumber": "+919876543210",
        "agentId": "agent_123",
        "scheduledFor": "2025-11-02T10:00:00Z"
      }
    ]
  }
}
```

### Import CSV

```http
POST /bulk/import
Authorization: Bearer <token>
Content-Type: multipart/form-data
```

**Form Data**:
- `file`: CSV file
- `skipHeader`: `true` | `false` (optional)
- `autoSchedule`: `true` | `false` (default: true)

**Response** (202 Accepted):
```json
{
  "success": true,
  "message": "CSV import started",
  "data": {
    "importId": "import_123",
    "totalRows": 100,
    "status": "processing"
  }
}
```

### Get Import Status

```http
GET /bulk/import/:importId/status
Authorization: Bearer <token>
```

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "importId": "import_123",
    "status": "completed",
    "totalRows": 100,
    "successfulRows": 95,
    "failedRows": 5,
    "errors": [
      {
        "row": 10,
        "error": "Invalid phone number"
      }
    ],
    "createdAt": "2025-11-01T10:00:00.000Z",
    "completedAt": "2025-11-01T10:05:00.000Z"
  }
}
```

---

## 📈 Analytics

### Get Call Analytics

```http
GET /analytics/calls
Authorization: Bearer <token>
```

**Query Parameters**:
- `startDate` (required): ISO 8601 timestamp
- `endDate` (required): ISO 8601 timestamp
- `agentId` (optional): Filter by agent
- `groupBy` (optional): `day` | `week` | `month`

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "summary": {
      "totalCalls": 500,
      "successfulCalls": 350,
      "failedCalls": 150,
      "successRate": 70,
      "averageDuration": 180
    },
    "byStatus": {
      "completed": 350,
      "no_answer": 80,
      "busy": 40,
      "failed": 30
    },
    "byDate": [
      {
        "date": "2025-11-01",
        "calls": 100,
        "successRate": 72
      }
    ]
  }
}
```

### Get Agent Performance

```http
GET /analytics/agents/:agentId
Authorization: Bearer <token>
```

**Query Parameters**:
- `startDate` (required)
- `endDate` (required)

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "agentId": "agent_123",
    "agentName": "Customer Support Agent",
    "totalCalls": 200,
    "successRate": 75,
    "averageDuration": 200,
    "voicemailDetectionRate": 25,
    "retrySuccessRate": 40,
    "topFailureReasons": [
      {
        "reason": "no_answer",
        "count": 30
      }
    ]
  }
}
```

### Get Cost Analytics

```http
GET /analytics/costs
Authorization: Bearer <token>
```

**Query Parameters**:
- `startDate` (required)
- `endDate` (required)

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "totalCost": 5000.50,
    "costPerCall": 10.00,
    "breakdown": {
      "stt": 1500.00,
      "llm": 2000.00,
      "tts": 1000.00,
      "exotel": 500.50
    },
    "byAgent": [
      {
        "agentId": "agent_123",
        "agentName": "Customer Support Agent",
        "totalCost": 2500.00,
        "calls": 250
      }
    ]
  }
}
```

---

## 📚 Knowledge Base

### Upload Document

```http
POST /knowledge-base/upload
Authorization: Bearer <token>
Content-Type: multipart/form-data
```

**Form Data**:
- `file`: PDF file
- `agentId`: Agent ID
- `title`: Document title (optional)
- `category`: Document category (optional)

**Response** (201 Created):
```json
{
  "success": true,
  "message": "Document uploaded successfully",
  "data": {
    "_id": "doc_123",
    "title": "Product Manual",
    "fileName": "manual.pdf",
    "agentId": "agent_123",
    "status": "processing",
    "createdAt": "2025-11-01T10:00:00.000Z"
  }
}
```

### List Documents

```http
GET /knowledge-base
Authorization: Bearer <token>
```

**Query Parameters**:
- `agentId` (optional): Filter by agent

**Response** (200 OK):
```json
{
  "success": true,
  "data": [
    {
      "_id": "doc_123",
      "title": "Product Manual",
      "fileName": "manual.pdf",
      "agentId": "agent_123",
      "status": "ready",
      "vectorCount": 150,
      "createdAt": "2025-11-01T10:00:00.000Z"
    }
  ]
}
```

### Delete Document

```http
DELETE /knowledge-base/:id
Authorization: Bearer <token>
```

**Response** (200 OK):
```json
{
  "success": true,
  "message": "Document deleted successfully"
}
```

### Search Knowledge Base

```http
POST /knowledge-base/search
Authorization: Bearer <token>
```

**Request Body**:
```json
{
  "query": "What is the return policy?",
  "agentId": "agent_123",
  "limit": 5
}
```

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "results": [
      {
        "content": "Our return policy allows returns within 30 days...",
        "score": 0.95,
        "documentId": "doc_123",
        "documentTitle": "Return Policy"
      }
    ]
  }
}
```

---

## 📊 Statistics

### Get System Stats

```http
GET /stats
Authorization: Bearer <token>
```

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "calls": {
      "total": 1000,
      "inbound": 400,
      "outbound": 600,
      "successRate": 72
    },
    "agents": {
      "total": 5,
      "active": 3
    },
    "queue": {
      "waiting": 10,
      "active": 5
    },
    "uptime": "99.95%",
    "version": "1.0.0"
  }
}
```

---

## ❌ Error Responses

All error responses follow this format:

```json
{
  "success": false,
  "message": "Error message description",
  "error": {
    "code": "ERROR_CODE",
    "details": "Additional error details"
  }
}
```

### Common HTTP Status Codes

| Code | Meaning | Description |
|------|---------|-------------|
| 200 | OK | Request successful |
| 201 | Created | Resource created successfully |
| 202 | Accepted | Request accepted for processing |
| 400 | Bad Request | Invalid request parameters |
| 401 | Unauthorized | Missing or invalid authentication |
| 403 | Forbidden | Insufficient permissions |
| 404 | Not Found | Resource not found |
| 409 | Conflict | Resource already exists |
| 422 | Unprocessable Entity | Validation error |
| 429 | Too Many Requests | Rate limit exceeded |
| 500 | Internal Server Error | Server error |
| 503 | Service Unavailable | Service temporarily unavailable |

### Common Error Codes

```javascript
{
  // Authentication errors
  "INVALID_CREDENTIALS": "Invalid email or password",
  "TOKEN_EXPIRED": "Authentication token has expired",
  "UNAUTHORIZED": "Authentication required",

  // Validation errors
  "VALIDATION_ERROR": "Request validation failed",
  "INVALID_PHONE_NUMBER": "Phone number format is invalid",
  "INVALID_AGENT_ID": "Agent not found",

  // Resource errors
  "NOT_FOUND": "Resource not found",
  "DUPLICATE_RESOURCE": "Resource already exists",

  // Rate limiting
  "RATE_LIMIT_EXCEEDED": "Too many requests, please try again later",

  // Server errors
  "INTERNAL_SERVER_ERROR": "An internal error occurred",
  "SERVICE_UNAVAILABLE": "Service temporarily unavailable"
}
```

---

## 🔒 Rate Limiting

**Limits**:
- **Authentication endpoints**: 5 requests per minute
- **API endpoints**: 100 requests per minute
- **Bulk operations**: 10 requests per hour

**Headers**:
```http
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1635768000
```

---

## 📝 Webhooks

### Exotel Incoming Call Webhook

```http
POST /exotel/webhook/incoming
```

**Request Body** (sent by Exotel):
```json
{
  "CallSid": "exotel_call_sid",
  "From": "+919876543210",
  "To": "+919876543211",
  "CallStatus": "in-progress",
  "Direction": "inbound"
}
```

**Response** (200 OK):
```json
{
  "success": true,
  "message": "Webhook received"
}
```

---

## 📚 Code Examples

### JavaScript/Node.js

```javascript
const axios = require('axios');

const API_BASE = 'https://api.yourdomain.com/api/v1';
const TOKEN = 'your-jwt-token';

// Create agent
async function createAgent() {
  const response = await axios.post(
    `${API_BASE}/agents`,
    {
      name: 'Customer Support Agent',
      systemPrompt: 'You are a helpful customer support agent...',
      voice: 'Rachel',
      isActive: true
    },
    {
      headers: {
        'Authorization': `Bearer ${TOKEN}`,
        'Content-Type': 'application/json'
      }
    }
  );

  return response.data;
}

// Initiate call
async function initiateCall(agentId, toPhone) {
  const response = await axios.post(
    `${API_BASE}/calls/outbound`,
    {
      toPhone,
      agentId,
      priority: 'high'
    },
    {
      headers: {
        'Authorization': `Bearer ${TOKEN}`,
        'Content-Type': 'application/json'
      }
    }
  );

  return response.data;
}
```

### Python

```python
import requests

API_BASE = 'https://api.yourdomain.com/api/v1'
TOKEN = 'your-jwt-token'

headers = {
    'Authorization': f'Bearer {TOKEN}',
    'Content-Type': 'application/json'
}

# Create agent
def create_agent():
    response = requests.post(
        f'{API_BASE}/agents',
        json={
            'name': 'Customer Support Agent',
            'systemPrompt': 'You are a helpful customer support agent...',
            'voice': 'Rachel',
            'isActive': True
        },
        headers=headers
    )
    return response.json()

# Initiate call
def initiate_call(agent_id, to_phone):
    response = requests.post(
        f'{API_BASE}/calls/outbound',
        json={
            'toPhone': to_phone,
            'agentId': agent_id,
            'priority': 'high'
        },
        headers=headers
    )
    return response.json()
```

### cURL

```bash
# Create agent
curl -X POST https://api.yourdomain.com/api/v1/agents \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Customer Support Agent",
    "systemPrompt": "You are a helpful customer support agent...",
    "voice": "Rachel",
    "isActive": true
  }'

# Initiate call
curl -X POST https://api.yourdomain.com/api/v1/calls/outbound \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "toPhone": "+919876543210",
    "agentId": "agent_123",
    "priority": "high"
  }'

# Upload CSV
curl -X POST https://api.yourdomain.com/api/v1/bulk/import \
  -H "Authorization: Bearer <token>" \
  -F "file=@contacts.csv" \
  -F "skipHeader=true"
```

---

## 📖 Postman Collection

Import this Postman collection for easy API testing:

```json
{
  "info": {
    "name": "AI Calling Platform API",
    "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
  },
  "auth": {
    "type": "bearer",
    "bearer": [
      {
        "key": "token",
        "value": "{{token}}",
        "type": "string"
      }
    ]
  },
  "variable": [
    {
      "key": "baseUrl",
      "value": "https://api.yourdomain.com/api/v1"
    }
  ]
}
```

---

## 🆘 Support

- **Documentation**: https://docs.yourdomain.com
- **API Status**: https://status.yourdomain.com
- **Support Email**: support@yourdomain.com
- **Slack Community**: https://slack.yourdomain.com
