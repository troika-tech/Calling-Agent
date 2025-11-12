# Error Handling Matrix - Outbound Calls

**Version**: 1.0
**Last Updated**: 2025-11-01
**Status**: Draft

---

## Overview

This document defines all error scenarios, their handling strategies, retry policies, and user-facing messages for the outbound calling system.

---

## Error Categories

### 1. Call Initiation Errors

| Error Code | Scenario | HTTP Status | Retry? | User Message | System Action |
|------------|----------|-------------|--------|--------------|---------------|
| `INVALID_PHONE_NUMBER` | Phone number format invalid | 400 | No | "Invalid phone number format. Please use E.164 format (e.g., +919876543210)" | Reject request immediately |
| `AGENT_NOT_FOUND` | Agent ID doesn't exist | 404 | No | "Agent not found. Please check the agent ID." | Reject request immediately |
| `CONCURRENT_LIMIT_REACHED` | Max concurrent calls reached | 429 | Yes | "Maximum concurrent calls reached. Please try again in a few minutes." | Queue request or return error |
| `INSUFFICIENT_BALANCE` | Exotel account low balance | 402 | No | "Insufficient account balance. Please recharge your account." | Reject + alert admin |
| `INVALID_EXOTEL_NUMBER` | Exotel virtual number invalid | 500 | No | "Service configuration error. Please contact support." | Reject + alert admin |
| `RATE_LIMITED` | Too many API requests | 429 | Yes | "Too many requests. Please try again in {retryAfter} seconds." | Return with Retry-After header |

---

### 2. Call Execution Errors

| Error Code | Exotel Status | Retry Strategy | Max Retries | Base Delay | User Notification |
|------------|---------------|----------------|-------------|------------|-------------------|
| `NO_ANSWER` | `no-answer` | Exponential backoff | 3 | 5 min | Optional SMS/email |
| `BUSY` | `busy` | Exponential backoff | 3 | 10 min | Optional SMS/email |
| `INVALID_NUMBER` | `failed` (invalid) | No retry | 0 | - | Mark as invalid |
| `NETWORK_ERROR` | `failed` (network) | Exponential backoff | 5 | 1 min | None (auto-retry) |
| `CALL_REJECTED` | `busy` | Exponential backoff | 2 | 30 min | Optional SMS/email |
| `VOICEMAIL` | Detected via heuristics | No retry | 0 | - | Mark as voicemail left |
| `CUSTOMER_HANGUP` | `completed` (duration <30s) | No retry | 0 | - | None (consider success) |

**Retry Delays**:
```typescript
const RETRY_CONFIG = {
  NO_ANSWER: {
    attempt1: 5 minutes,
    attempt2: 10 minutes,
    attempt3: 20 minutes
  },
  BUSY: {
    attempt1: 10 minutes,
    attempt2: 20 minutes,
    attempt3: 40 minutes
  },
  NETWORK_ERROR: {
    attempt1: 1 minute,
    attempt2: 2 minutes,
    attempt3: 4 minutes,
    attempt4: 8 minutes,
    attempt5: 16 minutes
  }
};
```

---

### 3. WebSocket Errors

| Error Code | Scenario | Recovery Strategy | User Impact |
|------------|----------|-------------------|-------------|
| `CONNECTION_LOST` | WebSocket disconnect mid-call | Retry connection once immediately | Call may drop if can't reconnect |
| `TIMEOUT` | No message for 30 seconds | Send ping, close if no pong | Call ends, marked as failed |
| `INVALID_MESSAGE` | Malformed message from Exotel | Log and ignore | None (continue call) |
| `AUDIO_DECODE_ERROR` | Can't decode audio chunk | Log and skip chunk | Brief audio glitch |

---

### 4. External API Errors

#### Exotel API

| Error | Status Code | Cause | Retry? | Action |
|-------|-------------|-------|--------|--------|
| Authentication Failed | 401 | Invalid credentials | No | Alert admin, check config |
| Rate Limit Exceeded | 429 | Too many requests | Yes | Exponential backoff (1min, 2min, 4min) |
| Server Error | 500 | Exotel internal error | Yes | Exponential backoff (1min, 2min, 4min, 8min) |
| Service Unavailable | 503 | Exotel maintenance | Yes | Circuit breaker opens, retry after 5 min |
| Timeout | - | Network timeout | Yes | Retry immediately once, then exponential |

**Circuit Breaker**:
- **Threshold**: 5 consecutive failures
- **Open Duration**: 1 minute
- **Half-Open**: Try 1 request to test recovery
- **Action when Open**: Return 503 Service Unavailable, don't call Exotel

---

#### Deepgram STT

| Error | Cause | Retry? | Action |
|-------|-------|--------|--------|
| Connection Pool Exhausted | 20 concurrent limit reached | Queue | Wait up to 30s, fallback to batch STT |
| API Error (4xx) | Invalid config/audio | No | Log error, fallback to batch STT |
| API Error (5xx) | Deepgram outage | Yes | Retry 3x, then fallback to batch STT |
| Timeout | Network issue | Yes | Retry 2x, then fallback to batch STT |
| Empty Transcript | No speech detected | No | Prompt user to speak |

**Fallback Chain**:
1. Deepgram Live (streaming)
2. Deepgram Batch (if live fails)
3. OpenAI Whisper (if Deepgram unavailable)

---

#### TTS (ElevenLabs / Deepgram)

| Error | Cause | Retry? | Fallback |
|-------|-------|--------|----------|
| Rate Limit (429) | Concurrent limit | Yes (5 retries) | Switch to Deepgram TTS |
| Quota Exceeded (402) | Monthly quota reached | No | Switch to Deepgram TTS permanently |
| API Error (5xx) | Service outage | Yes (3 retries) | Switch to Deepgram TTS |
| Timeout | Network issue | Yes (2 retries) | Switch to Deepgram TTS |
| Audio Decode Error | Corrupted response | No | Re-synthesize same text |

**Fallback Order**:
1. ElevenLabs (if configured for premium)
2. Deepgram TTS (default)
3. OpenAI TTS (last resort)

---

#### LLM (OpenAI / Anthropic)

| Error | Cause | Retry? | Action |
|-------|-------|--------|--------|
| Rate Limit (429) | Quota exceeded | Yes (3 retries, exponential) | Wait and retry |
| Token Limit (400) | Context too long | No | Truncate context, retry |
| API Error (5xx) | Service outage | Yes (3 retries) | Switch provider if configured |
| Timeout (>30s) | Slow response | Yes (1 retry) | Use faster model next time |
| Content Filter (400) | Inappropriate content | No | Send generic response |

**Generic Fallback Response**:
```
"I apologize, I'm having trouble processing that. Could you please rephrase?"
```

---

### 5. Database Errors

| Error | Cause | Retry? | Action |
|-------|-------|--------|--------|
| Connection Lost | Network/DB down | Yes | Retry 5x with exponential backoff, then fail |
| Write Failed | Disk full / replication lag | Yes | Retry 3x, then fail request |
| Query Timeout | Slow query | Yes | Retry 2x with simpler query, then fail |
| Validation Error | Invalid data | No | Return 400 Bad Request |
| Duplicate Key | Unique constraint violation | No | Return 409 Conflict |

**Critical Operations** (must succeed):
- Creating CallLog: Retry indefinitely with alerting
- Saving transcript: Best effort, log if fails
- Updating call status: Retry 10x, alert if all fail

---

### 6. Queue/Redis Errors

| Error | Cause | Retry? | Action |
|-------|-------|--------|--------|
| Redis Connection Lost | Redis down | Yes | Reconnect automatically, queue in-memory temporarily |
| Job Failed | Processing error | Yes | Bull auto-retries (3x default) |
| Job Stalled | Worker died | Auto | Bull auto-recovers stalled jobs |
| Queue Full | Too many jobs | No | Return 503 Service Unavailable |

**Job Retry Policy**:
```typescript
{
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 2000  // 2s, 4s, 8s
  },
  removeOnComplete: 1000,  // Keep last 1000
  removeOnFail: 5000       // Keep last 5000 failed
}
```

---

## Error Response Format

### API Error Response

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable message",
    "details": {
      "field": "value",
      "suggestion": "Try X instead"
    },
    "retryAfter": 60,
    "requestId": "req_abc123"
  }
}
```

### Error Codes

**Client Errors (4xx)**:
- `INVALID_REQUEST` (400): Request validation failed
- `UNAUTHORIZED` (401): Missing or invalid auth token
- `FORBIDDEN` (403): Insufficient permissions
- `NOT_FOUND` (404): Resource not found
- `CONFLICT` (409): Resource conflict
- `RATE_LIMITED` (429): Too many requests

**Server Errors (5xx)**:
- `INTERNAL_ERROR` (500): Unexpected server error
- `SERVICE_UNAVAILABLE` (503): Temporary unavailability

---

## Handling Strategies

### Strategy 1: Immediate Retry

**When to use**: Transient network errors, temporary service unavailability

**Implementation**:
```typescript
async function withImmediateRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 2
): Promise<T> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      // Wait briefly before retry
      await sleep(100 * (i + 1));
    }
  }
  throw new Error('Max retries reached');
}
```

---

### Strategy 2: Exponential Backoff

**When to use**: API rate limits, call failures (no answer, busy)

**Implementation**:
```typescript
function calculateDelay(attempt: number, baseDelay: number): number {
  const delay = baseDelay * Math.pow(2, attempt - 1);
  const jitter = delay * 0.1 * (Math.random() * 2 - 1);  // ±10% jitter
  return delay + jitter;
}

// Example: No answer retry
// Attempt 1: 5 min ± 30s
// Attempt 2: 10 min ± 1min
// Attempt 3: 20 min ± 2min
```

---

### Strategy 3: Circuit Breaker

**When to use**: External API failures, prevent cascading failures

**States**:
- **Closed**: Normal operation
- **Open**: Too many failures, reject requests immediately
- **Half-Open**: Test with single request

**Implementation**:
```typescript
class CircuitBreaker {
  private state: 'closed' | 'open' | 'half-open' = 'closed';
  private failureCount = 0;
  private lastFailureTime?: Date;

  async call<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      // Check if timeout has passed
      if (Date.now() - this.lastFailureTime!.getTime() > TIMEOUT) {
        this.state = 'half-open';
      } else {
        throw new Error('Circuit breaker is OPEN');
      }
    }

    try {
      const result = await fn();

      // Success - reset if half-open
      if (this.state === 'half-open') {
        this.state = 'closed';
        this.failureCount = 0;
      }

      return result;
    } catch (error) {
      this.failureCount++;
      this.lastFailureTime = new Date();

      if (this.failureCount >= FAILURE_THRESHOLD) {
        this.state = 'open';
      }

      throw error;
    }
  }
}
```

---

### Strategy 4: Graceful Degradation

**When to use**: Non-critical features, can provide reduced functionality

**Examples**:

**RAG Query Failure**:
```typescript
try {
  const context = await ragService.query(text);
  return await llm.generate(text, context);
} catch (error) {
  logger.warn('RAG query failed, continuing without context');
  // Degrade: Continue without RAG context
  return await llm.generate(text);
}
```

**TTS Failure**:
```typescript
try {
  return await elevenlabsTTS.synthesize(text);
} catch (error) {
  logger.warn('ElevenLabs failed, falling back to Deepgram');
  // Degrade: Use cheaper TTS
  return await deepgramTTS.synthesize(text);
}
```

---

### Strategy 5: Fallback Chain

**When to use**: Multiple providers available, want high availability

**Example - STT Fallback**:
```typescript
async function transcribeAudio(audio: Buffer): Promise<string> {
  // Try 1: Deepgram Live (streaming, fastest)
  try {
    return await deepgramLive.transcribe(audio);
  } catch (error) {
    logger.warn('Deepgram Live failed', error);
  }

  // Try 2: Deepgram Batch (backup)
  try {
    return await deepgramBatch.transcribe(audio);
  } catch (error) {
    logger.warn('Deepgram Batch failed', error);
  }

  // Try 3: OpenAI Whisper (last resort)
  try {
    return await whisper.transcribe(audio);
  } catch (error) {
    logger.error('All STT providers failed', error);
    throw new Error('Speech recognition unavailable');
  }
}
```

---

## Logging & Monitoring

### Error Logging

**All errors must be logged with**:
- Error code
- Error message
- Stack trace (for 5xx errors)
- Context (callLogId, agentId, etc.)
- Request ID (for tracing)

**Example**:
```typescript
logger.error('Failed to initiate call', {
  error: {
    code: 'EXOTEL_API_ERROR',
    message: error.message,
    stack: error.stack
  },
  context: {
    callLogId: callLog._id,
    agentId: params.agentId,
    phoneNumber: params.phoneNumber
  },
  requestId: req.id
});
```

---

### Error Metrics

**Track**:
- Error rate by type
- Error rate by endpoint
- Error rate by external API
- Mean time to recovery (MTTR)
- Error resolution rate

**Dashboards**:
- Real-time error rate (alert if >5%)
- Error breakdown (pie chart)
- Error trend (line chart)

---

### Alerting

**Critical Errors** (page immediately):
- Error rate >10% for 5 minutes
- All calls failing for 2 minutes
- Database connection lost
- Redis connection lost
- Exotel API unavailable for 5 minutes

**Warning Errors** (notify team):
- Error rate >5% for 10 minutes
- Specific endpoint error rate >10%
- External API errors >20%
- Circuit breaker opened

---

## User-Facing Error Messages

### Design Principles

1. **Be Specific**: Tell user what went wrong
2. **Be Helpful**: Suggest how to fix it
3. **Be Honest**: Don't hide errors behind vague messages
4. **Be Apologetic**: Acknowledge inconvenience

### Examples

**Good**:
```
"Invalid phone number format. Please use international format starting with +,
e.g., +919876543210"
```

**Bad**:
```
"Error occurred" ❌
```

**Good**:
```
"The number you're trying to call appears to be busy. We'll automatically
retry in 10 minutes."
```

**Bad**:
```
"Call failed" ❌
```

---

## Testing Error Scenarios

### Unit Tests

Test each error type:
```typescript
describe('OutgoingCallService', () => {
  it('should return INVALID_PHONE_NUMBER for invalid number', async () => {
    const result = await service.initiateCall({
      phoneNumber: 'invalid',
      agentId: 'agent_123'
    });

    expect(result.error.code).toBe('INVALID_PHONE_NUMBER');
    expect(result.status).toBe(400);
  });

  it('should retry on NETWORK_ERROR', async () => {
    // Mock Exotel API to fail 2x then succeed
    exotelMock.makeCall
      .mockRejectedValueOnce(new Error('Network timeout'))
      .mockRejectedValueOnce(new Error('Network timeout'))
      .mockResolvedValueOnce({ callSid: 'call_123' });

    const result = await service.initiateCall(validParams);

    expect(result.success).toBe(true);
    expect(exotelMock.makeCall).toHaveBeenCalledTimes(3);
  });
});
```

---

### Integration Tests

Test error recovery:
```typescript
describe('Call Retry Flow', () => {
  it('should retry failed call after delay', async () => {
    // Initiate call
    const call = await initiateCall(params);

    // Simulate no-answer webhook
    await webhookHandler.handleCallStatus({
      CallSid: call.exotelCallSid,
      CallStatus: 'no-answer',
      CustomField: call.id
    });

    // Check retry scheduled
    const retries = await RetryAttempt.find({ originalCallLogId: call.id });
    expect(retries).toHaveLength(1);
    expect(retries[0].scheduledFor).toBeCloseTo(
      Date.now() + 300000,  // 5 minutes
      -10000  // ±10 seconds for jitter
    );
  });
});
```

---

## Runbook: Handling Production Errors

### Error Rate Spike

**Symptom**: Error rate >10% for 5+ minutes

**Diagnosis**:
1. Check which error codes are most common
2. Check if errors from specific endpoint or all
3. Check external API status (Exotel, Deepgram, etc.)
4. Check database/Redis connectivity

**Actions**:
- If Exotel down: Wait for recovery, queue calls
- If database down: Failover to replica
- If bug in code: Rollback deployment
- If misconfiguration: Fix config, restart

---

### Circuit Breaker Opened

**Symptom**: "Circuit breaker is OPEN" errors

**Diagnosis**:
1. Check which service has open circuit
2. Check that service's error rate
3. Check service health/status

**Actions**:
- Wait for circuit to half-open (automatic)
- If service still down, investigate root cause
- Consider manual intervention if critical

---

### Queue Depth Growing

**Symptom**: Bull queue depth >100 and increasing

**Diagnosis**:
1. Check worker status (running?)
2. Check job processing time (slow?)
3. Check job failure rate

**Actions**:
- If workers stopped: Restart workers
- If jobs slow: Scale up workers
- If jobs failing: Fix bug, clear failed jobs
- If legitimate spike: Temporary, wait it out

---

**Document Status**: Draft - Ready for Review
**Next Steps**: Review error scenarios, implement handlers, create tests
