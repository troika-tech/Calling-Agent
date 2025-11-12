# Outbound Calls API Specification

**Version**: 1.0
**Last Updated**: 2025-11-01
**Status**: Draft

---

## Table of Contents

1. [Overview](#overview)
2. [Authentication](#authentication)
3. [Error Handling](#error-handling)
4. [Rate Limiting](#rate-limiting)
5. [API Endpoints](#api-endpoints)
6. [Webhook Endpoints](#webhook-endpoints)
7. [Data Models](#data-models)

---

## Overview

This document defines the API contracts for the outbound calling system. All endpoints follow RESTful principles and return JSON responses.

**Base URL**: `https://api.yourdomain.com/api/v1`

**Content-Type**: `application/json`

**Date Format**: ISO 8601 (e.g., `2025-11-01T10:00:00.000Z`)

---

## Authentication

All API requests must include an authentication token in the header:

```http
Authorization: Bearer {access_token}
```

**Token Acquisition**: Contact your account manager or use the OAuth 2.0 flow (if implemented).

---

## Error Handling

### Standard Error Response

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message",
    "details": {
      "field": "Additional context"
    }
  }
}
```

### Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `INVALID_REQUEST` | 400 | Request body validation failed |
| `UNAUTHORIZED` | 401 | Missing or invalid authentication token |
| `FORBIDDEN` | 403 | Insufficient permissions |
| `NOT_FOUND` | 404 | Resource not found |
| `CONFLICT` | 409 | Resource already exists or conflict |
| `RATE_LIMITED` | 429 | Too many requests |
| `INTERNAL_ERROR` | 500 | Internal server error |
| `SERVICE_UNAVAILABLE` | 503 | Service temporarily unavailable |
| `INVALID_PHONE_NUMBER` | 400 | Phone number format invalid |
| `AGENT_NOT_FOUND` | 404 | Agent ID does not exist |
| `CONCURRENT_LIMIT_REACHED` | 429 | Maximum concurrent calls reached |
| `SCHEDULE_IN_PAST` | 400 | Scheduled time is in the past |
| `CALL_ALREADY_COMPLETED` | 409 | Cannot modify completed call |

---

## Rate Limiting

**Default Limits**:
- 100 requests per minute per API key
- 1000 requests per hour per API key

**Headers Returned**:
```http
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1698765432
```

**Rate Limit Exceeded Response**:
```json
{
  "error": {
    "code": "RATE_LIMITED",
    "message": "Rate limit exceeded. Try again in 45 seconds.",
    "details": {
      "retryAfter": 45
    }
  }
}
```

---

## API Endpoints

### 1. Initiate Outbound Call

**Endpoint**: `POST /calls/outbound`

**Description**: Initiates an immediate outbound call.

**Request Body**:
```json
{
  "phoneNumber": "+919876543210",
  "agentId": "agent_abc123",
  "metadata": {
    "campaignId": "summer_sale_2025",
    "customerId": "cust_xyz789",
    "priority": "high"
  },
  "priority": "high"
}
```

**Request Schema**:
```typescript
{
  phoneNumber: string;      // E.164 format required (e.g., +919876543210)
  agentId: string;          // Required, must exist in system
  metadata?: object;        // Optional, free-form key-value pairs
  priority?: "low" | "medium" | "high";  // Optional, default: "medium"
}
```

**Response** (202 Accepted):
```json
{
  "callLogId": "call_def456",
  "status": "initiated",
  "message": "Call is being initiated",
  "estimatedStartTime": "2025-11-01T14:30:15.000Z"
}
```

**Example cURL**:
```bash
curl -X POST https://api.yourdomain.com/api/v1/calls/outbound \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{
    "phoneNumber": "+919876543210",
    "agentId": "agent_abc123",
    "metadata": {
      "campaignId": "summer_sale_2025"
    }
  }'
```

---

### 2. Schedule Outbound Call

**Endpoint**: `POST /calls/outbound/schedule`

**Description**: Schedules an outbound call for future execution.

**Request Body**:
```json
{
  "phoneNumber": "+919876543210",
  "agentId": "agent_abc123",
  "scheduledFor": "2025-11-02T10:00:00Z",
  "timezone": "Asia/Kolkata",
  "metadata": {
    "appointmentId": "appt_123"
  },
  "respectBusinessHours": true,
  "businessHours": {
    "start": "09:00",
    "end": "18:00",
    "timezone": "Asia/Kolkata",
    "daysOfWeek": [1, 2, 3, 4, 5]
  },
  "recurring": {
    "frequency": "weekly",
    "interval": 1,
    "endDate": "2025-12-31T23:59:59Z"
  }
}
```

**Request Schema**:
```typescript
{
  phoneNumber: string;
  agentId: string;
  scheduledFor: string;     // ISO 8601 date-time
  timezone?: string;        // IANA timezone (default: "UTC")
  metadata?: object;
  respectBusinessHours?: boolean;  // Default: false
  businessHours?: {
    start: string;          // "HH:MM" format
    end: string;            // "HH:MM" format
    timezone: string;
    daysOfWeek?: number[];  // 0=Sun, 1=Mon, ..., 6=Sat
  };
  recurring?: {
    frequency: "daily" | "weekly" | "monthly";
    interval: number;       // Every N days/weeks/months
    endDate?: string;
    maxOccurrences?: number;
  };
}
```

**Response** (201 Created):
```json
{
  "scheduleId": "sched_ghi789",
  "callLogId": "call_jkl012",
  "scheduledFor": "2025-11-02T10:00:00Z",
  "adjustedFor": "2025-11-02T09:00:00Z",
  "status": "scheduled",
  "message": "Call scheduled successfully"
}
```

---

### 3. Bulk Initiate Calls

**Endpoint**: `POST /calls/outbound/bulk`

**Description**: Initiates multiple outbound calls in batch.

**Request Body**:
```json
{
  "calls": [
    {
      "phoneNumber": "+919876543210",
      "agentId": "agent_abc123",
      "metadata": { "leadId": "lead_1" }
    },
    {
      "phoneNumber": "+919876543211",
      "agentId": "agent_abc123",
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

**Request Schema**:
```typescript
{
  calls: Array<{
    phoneNumber: string;
    agentId: string;
    metadata?: object;
  }>;                       // Max 1000 calls per request
  priority?: "low" | "medium" | "high";
  throttle?: {
    maxConcurrent?: number;      // Max concurrent initiations
    delayBetweenCalls?: number;  // Milliseconds between calls
  };
}
```

**Response** (202 Accepted):
```json
{
  "batchId": "batch_mno345",
  "totalCalls": 2,
  "status": "processing",
  "callLogIds": ["call_pqr678", "call_stu901"],
  "estimatedCompletionTime": "2025-11-01T14:35:00.000Z"
}
```

---

### 4. Import Calls from CSV

**Endpoint**: `POST /calls/outbound/import`

**Description**: Import and initiate calls from CSV file.

**Request**: `multipart/form-data`

**Form Fields**:
- `file`: CSV file (required)
- `agentId`: Default agent ID if not in CSV (optional)
- `campaignId`: Campaign ID for all calls (optional)

**CSV Format**:
```csv
phone,agentId,name,customerId,campaignId
+919876543210,agent_abc123,John Doe,cust_1,summer_sale
+919876543211,agent_abc123,Jane Smith,cust_2,summer_sale
```

**Response** (202 Accepted):
```json
{
  "batchId": "batch_vwx234",
  "totalCalls": 2,
  "status": "processing",
  "callLogIds": ["call_yz567", "call_ab890"]
}
```

---

### 5. Get Call Details

**Endpoint**: `GET /calls/:callLogId`

**Description**: Retrieves details of a specific call.

**Path Parameters**:
- `callLogId`: The unique call log identifier

**Response** (200 OK):
```json
{
  "callLogId": "call_def456",
  "direction": "outbound",
  "phoneNumber": "+919876543210",
  "agentId": "agent_abc123",
  "agent": {
    "id": "agent_abc123",
    "name": "Sarah",
    "company": "XYZ Corp"
  },
  "status": "completed",
  "outboundStatus": "connected",
  "startedAt": "2025-11-01T14:30:15.000Z",
  "endedAt": "2025-11-01T14:35:20.000Z",
  "duration": 305,
  "transcript": [
    {
      "speaker": "assistant",
      "text": "Hello! This is Sarah from XYZ Corp.",
      "timestamp": "2025-11-01T14:30:20.000Z"
    },
    {
      "speaker": "user",
      "text": "Hi, yes, I was expecting your call.",
      "timestamp": "2025-11-01T14:30:25.000Z"
    }
  ],
  "recordingUrl": "https://exotel.com/recordings/rec_123.mp3",
  "metadata": {
    "campaignId": "summer_sale_2025",
    "customerId": "cust_xyz789"
  },
  "retryCount": 0,
  "retryOf": null,
  "failureReason": null
}
```

---

### 6. Cancel Call

**Endpoint**: `POST /calls/:callLogId/cancel`

**Description**: Cancels a scheduled or in-progress call.

**Path Parameters**:
- `callLogId`: The unique call log identifier

**Response** (200 OK):
```json
{
  "callLogId": "call_def456",
  "status": "cancelled",
  "message": "Call cancelled successfully"
}
```

**Error Response** (409 Conflict):
```json
{
  "error": {
    "code": "CALL_ALREADY_COMPLETED",
    "message": "Cannot cancel a completed call",
    "details": {
      "currentStatus": "completed"
    }
  }
}
```

---

### 7. Get Retry History

**Endpoint**: `GET /calls/:callLogId/retries`

**Description**: Retrieves retry history for a call.

**Path Parameters**:
- `callLogId`: The unique call log identifier

**Response** (200 OK):
```json
{
  "callLogId": "call_def456",
  "retries": [
    {
      "attemptNumber": 1,
      "scheduledFor": "2025-11-01T14:35:00.000Z",
      "status": "completed",
      "failureReason": "no_answer",
      "retryCallLogId": "call_retry1"
    },
    {
      "attemptNumber": 2,
      "scheduledFor": "2025-11-01T14:45:00.000Z",
      "status": "pending",
      "failureReason": "no_answer",
      "retryCallLogId": null
    }
  ],
  "totalRetries": 2,
  "maxRetries": 3
}
```

---

### 8. Manual Retry

**Endpoint**: `POST /calls/:callLogId/retry`

**Description**: Manually trigger a retry for a failed call (ignores max retry limit).

**Path Parameters**:
- `callLogId`: The unique call log identifier

**Request Body** (optional):
```json
{
  "immediate": true,
  "delayMinutes": 5
}
```

**Response** (202 Accepted):
```json
{
  "callLogId": "call_def456",
  "retryScheduledFor": "2025-11-01T14:35:00.000Z",
  "message": "Retry scheduled successfully"
}
```

---

### 9. Cancel Retries

**Endpoint**: `DELETE /calls/:callLogId/retries`

**Description**: Cancels all pending retries for a call.

**Path Parameters**:
- `callLogId`: The unique call log identifier

**Response** (200 OK):
```json
{
  "callLogId": "call_def456",
  "cancelledRetries": 2,
  "message": "All pending retries cancelled"
}
```

---

### 10. List Scheduled Calls

**Endpoint**: `GET /calls/scheduled`

**Description**: Lists all scheduled calls with filtering and pagination.

**Query Parameters**:
- `agentId` (optional): Filter by agent
- `from` (optional): Start date filter (ISO 8601)
- `to` (optional): End date filter (ISO 8601)
- `status` (optional): Filter by status (`pending`, `processing`, `completed`, `cancelled`)
- `page` (default: 1): Page number
- `limit` (default: 50, max: 100): Items per page

**Example**:
```
GET /calls/scheduled?agentId=agent_abc123&status=pending&page=1&limit=50
```

**Response** (200 OK):
```json
{
  "total": 150,
  "page": 1,
  "limit": 50,
  "pages": 3,
  "calls": [
    {
      "scheduleId": "sched_ghi789",
      "callLogId": "call_jkl012",
      "phoneNumber": "+919876543210",
      "agentId": "agent_abc123",
      "scheduledFor": "2025-11-02T10:00:00Z",
      "status": "pending",
      "metadata": {
        "appointmentId": "appt_123"
      }
    }
  ]
}
```

---

### 11. Update Scheduled Call

**Endpoint**: `PUT /calls/scheduled/:scheduleId`

**Description**: Reschedules a scheduled call.

**Path Parameters**:
- `scheduleId`: The unique schedule identifier

**Request Body**:
```json
{
  "scheduledFor": "2025-11-02T14:00:00Z",
  "timezone": "Asia/Kolkata"
}
```

**Response** (200 OK):
```json
{
  "scheduleId": "sched_ghi789",
  "callLogId": "call_jkl012",
  "scheduledFor": "2025-11-02T14:00:00Z",
  "previousScheduledFor": "2025-11-02T10:00:00Z",
  "message": "Call rescheduled successfully"
}
```

---

### 12. Cancel Scheduled Call

**Endpoint**: `DELETE /calls/scheduled/:scheduleId`

**Description**: Cancels a scheduled call.

**Path Parameters**:
- `scheduleId`: The unique schedule identifier

**Response** (200 OK):
```json
{
  "scheduleId": "sched_ghi789",
  "callLogId": "call_jkl012",
  "status": "cancelled",
  "message": "Scheduled call cancelled successfully"
}
```

---

### 13. Get Batch Progress

**Endpoint**: `GET /calls/batches/:batchId`

**Description**: Retrieves progress of a bulk call batch.

**Path Parameters**:
- `batchId`: The unique batch identifier

**Response** (200 OK):
```json
{
  "batchId": "batch_mno345",
  "stats": {
    "total": 100,
    "queued": 10,
    "initiated": 15,
    "inProgress": 20,
    "completed": 45,
    "failed": 10,
    "progress": 55.0
  },
  "calls": [
    {
      "callLogId": "call_1",
      "status": "completed",
      "phoneNumber": "+919876543210"
    }
  ]
}
```

---

### 14. Get Outbound Stats

**Endpoint**: `GET /stats/outbound`

**Description**: Retrieves outbound call statistics.

**Query Parameters**:
- `from` (optional): Start date (ISO 8601)
- `to` (optional): End date (ISO 8601)
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
  "activeCalls": 12,
  "performance": {
    "p50Latency": 1420,
    "p95Latency": 1680,
    "p99Latency": 1920
  }
}
```

---

## Webhook Endpoints

These endpoints are called BY Exotel to notify your system of call events.

### 1. Call Status Update

**Endpoint**: `POST /webhooks/exotel/call-status`

**Description**: Receives call status updates from Exotel.

**Request Body** (from Exotel):
```json
{
  "CallSid": "call_sid_123",
  "CallStatus": "completed",
  "CallDuration": "125",
  "CallFrom": "+919876543210",
  "CallTo": "+911234567890",
  "CustomField": "call_def456",
  "RecordingUrl": "https://exotel.com/recordings/rec_123.mp3"
}
```

**Call Status Values**:
- `queued`: Call is queued
- `ringing`: Phone is ringing
- `in-progress`: Call is connected
- `completed`: Call ended normally
- `busy`: Recipient is busy
- `failed`: Call failed
- `no-answer`: No one answered

**Response** (200 OK):
```json
{
  "status": "received"
}
```

---

### 2. Voice Connected

**Endpoint**: `POST /webhooks/exotel/voice-connected`

**Description**: Called when customer answers, returns WebSocket URL.

**Request Body** (from Exotel):
```json
{
  "CallSid": "call_sid_123",
  "CustomField": "call_def456"
}
```

**Response** (200 OK):
```json
{
  "response": {
    "action": "connect",
    "url": "wss://yourdomain.com/ws/exotel/voice/call_def456"
  }
}
```

---

## Data Models

### CallLog

```typescript
interface CallLog {
  _id: string;
  direction: "inbound" | "outbound";
  phoneNumber: string;
  agentId: string;
  status: "initiated" | "ringing" | "in-progress" | "completed" | "failed" | "cancelled";
  outboundStatus?: "queued" | "ringing" | "connected" | "no_answer" | "busy" | "voicemail";

  // Timestamps
  scheduledFor?: Date;
  initiatedAt?: Date;
  startedAt?: Date;
  endedAt?: Date;
  duration?: number;  // seconds

  // Transcript
  transcript: Array<{
    speaker: "user" | "assistant";
    text: string;
    timestamp: Date;
  }>;

  // Retry information
  retryCount: number;
  retryOf?: string;  // CallLog ID
  failureReason?: "no_answer" | "busy" | "voicemail" | "invalid_number" | "network_error" | "cancelled";

  // External IDs
  exotelCallSid?: string;
  recordingUrl?: string;

  // Metadata
  metadata?: {
    campaignId?: string;
    customerId?: string;
    batchId?: string;
    priority?: "low" | "medium" | "high";
    [key: string]: any;
  };

  createdAt: Date;
  updatedAt: Date;
}
```

### ScheduledCall

```typescript
interface ScheduledCall {
  _id: string;
  callLogId: string;
  phoneNumber: string;
  agentId: string;
  scheduledFor: Date;
  timezone: string;
  status: "pending" | "processing" | "completed" | "cancelled" | "failed";

  // Business hours
  respectBusinessHours: boolean;
  businessHours?: {
    start: string;
    end: string;
    timezone: string;
    daysOfWeek?: number[];
  };

  // Recurring
  recurring?: {
    frequency: "daily" | "weekly" | "monthly";
    interval: number;
    endDate?: Date;
    maxOccurrences?: number;
  };

  metadata?: any;
  processedAt?: Date;
  failedAt?: Date;
  failureReason?: string;
  nextRun?: Date;

  createdAt: Date;
  updatedAt: Date;
}
```

### RetryAttempt

```typescript
interface RetryAttempt {
  _id: string;
  originalCallLogId: string;
  retryCallLogId?: string;
  attemptNumber: number;
  scheduledFor: Date;
  status: "pending" | "processing" | "completed" | "failed" | "cancelled";
  failureReason: string;
  processedAt?: Date;
  metadata?: any;

  createdAt: Date;
  updatedAt: Date;
}
```

---

## Validation Rules

### Phone Number
- Format: E.164 (e.g., `+919876543210`)
- Regex: `^\\+[1-9]\\d{1,14}$`
- Min length: 8 characters
- Max length: 16 characters

### Scheduled Time
- Must be in future (at least 1 minute from now)
- Must be valid ISO 8601 date-time
- Max scheduling: 1 year in advance

### Bulk Calls
- Max 1000 calls per request
- Each call must have valid phone number and agent ID

### Metadata
- Max size: 10KB per call
- Must be valid JSON object

---

## Pagination

All list endpoints support pagination:

**Query Parameters**:
- `page` (default: 1): Page number (1-indexed)
- `limit` (default: 50, max: 100): Items per page

**Response Format**:
```json
{
  "total": 250,
  "page": 1,
  "limit": 50,
  "pages": 5,
  "data": [...]
}
```

---

## Versioning

API version is included in the URL: `/api/v1/...`

Breaking changes will result in a new version (v2, v3, etc.).

**Deprecation Policy**:
- 6 months notice for deprecated endpoints
- Deprecated endpoints return `Deprecation` header
- Old versions supported for 12 months after deprecation

---

**Document Status**: Draft - Ready for Review
**Next Steps**: Review and approve, then implement
