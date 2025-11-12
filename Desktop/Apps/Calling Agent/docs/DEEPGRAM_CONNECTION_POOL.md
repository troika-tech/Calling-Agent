# Deepgram Connection Pool Implementation

**Status**: ✅ Implemented
**Date**: 2025-11-01
**Priority**: 1 (Critical for scale)

---

## Overview

The Deepgram Connection Pool manages live streaming STT connections to enforce Deepgram's 20 concurrent connection limit and prevent service disruption at scale.

### Problem Solved

**Before**: Direct connection creation without limit enforcement
```typescript
// ❌ Call #21 fails with cryptic error
const connection = await deepgramService.createLiveConnectionWithVAD({...});
```

**After**: Pool-managed connections with queuing
```typescript
// ✅ Call #21 queued, processed when slot available
const connection = await deepgramConnectionPool.acquireConnection(clientId, {...});
```

---

## Features

✅ **Enforces 20 connection limit** (Deepgram's Pay-as-you-go tier)
✅ **Queues overflow requests** instead of failing
✅ **Automatic timeout** for queued requests (30s default)
✅ **Connection tracking** by client ID
✅ **Automatic cleanup** on disconnect
✅ **Memory leak prevention** (removes event listeners)
✅ **Comprehensive metrics** (acquired, released, queued, failed)
✅ **Graceful shutdown** support

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│              Incoming Calls (Exotel)                     │
└──────────────┬──────────────────────────────────────────┘
               │
        ┌──────▼──────┐
        │Call #1 - #20│
        │  (Slots)    │
        └──────┬──────┘
               │
    ┌──────────▼──────────────┐
    │ Connection Pool Manager  │
    │ ┌────────────────────┐  │
    │ │ Active: 20/20      │  │
    │ │ Queue: 3 waiting   │  │
    │ └────────────────────┘  │
    └──────────┬──────────────┘
               │
        ┌──────▼──────┐
        │Call #21 - #23│
        │  (Queued)    │
        └──────────────┘
               │
    When slot available ──┐
                          │
               ┌──────────▼──────────┐
               │ Deepgram Live API   │
               │ (20 connections max)│
               └─────────────────────┘
```

---

## Usage

### Acquire Connection

```typescript
import { deepgramConnectionPool } from '../services/deepgramConnectionPool.service';

// In exotelVoice.handler.ts
const connection = await deepgramConnectionPool.acquireConnection(
  client.id, // Unique client identifier
  {
    endpointing: 100,
    vadEvents: true,
    language: 'en',
    onTranscript: async (result) => {
      // Handle transcription
    },
    onSpeechEnded: async () => {
      // Handle speech end
    }
  }
);
```

### Release Connection

```typescript
// When call ends or disconnects
deepgramConnectionPool.releaseConnection(client.id);
```

### Monitor Statistics

```typescript
// Get pool stats
const stats = deepgramConnectionPool.getStats();
console.log(stats);
// {
//   active: 18,
//   queued: 2,
//   capacity: 20,
//   utilization: 90,
//   totalAcquired: 150,
//   totalReleased: 132,
//   totalQueued: 10,
//   totalTimeout: 1,
//   totalFailed: 2
// }
```

### API Endpoint

```bash
# Get system stats including pool status
curl http://localhost:3000/api/v1/stats

# Response:
{
  "timestamp": "2025-11-01T12:00:00.000Z",
  "uptime": 3600,
  "memory": {
    "used": 245,
    "total": 512,
    "rss": 380,
    "unit": "MB"
  },
  "activeCalls": 18,
  "deepgramPool": {
    "active": 18,
    "queued": 2,
    "capacity": 20,
    "utilization": 90,
    "totalAcquired": 150,
    "totalReleased": 132,
    "totalQueued": 10,
    "totalTimeout": 1,
    "totalFailed": 2,
    "status": "high"
  }
}
```

---

## Configuration

The pool can be configured when instantiated:

```typescript
const pool = new DeepgramConnectionPool({
  maxConnections: 20,   // Deepgram's limit (default: 20)
  queueTimeout: 30000,  // Queue timeout in ms (default: 30s)
  maxQueueSize: 50      // Max queued requests (default: 50)
});
```

---

## Behavior

### Normal Operation (Pool has capacity)

```
1. Call arrives
2. Pool checks: active (15) < capacity (20) ✅
3. Creates Deepgram connection immediately
4. Stores in connectionMap
5. Returns connection to caller
```

### High Load (Pool at capacity)

```
1. Call arrives
2. Pool checks: active (20) >= capacity (20) ❌
3. Adds request to queue
4. Sets 30-second timeout
5. Returns Promise (pending)
6. When slot becomes available:
   ├─ Processes next in queue
   ├─ Creates connection
   └─ Resolves Promise
```

### Queue Full (Overload)

```
1. Call arrives
2. Pool checks: queued (50) >= maxQueueSize (50) ❌
3. Rejects immediately with RateLimitError
4. Caller can handle gracefully (e.g., fallback to batch STT)
```

### Connection Release

```
1. Call ends or disconnects
2. releaseConnection(clientId) called
3. Pool:
   ├─ Removes all event listeners (prevents memory leak)
   ├─ Calls connection.finish()
   ├─ Removes from connectionMap
   ├─ Decrements activeConnections
   └─ Processes next queued request (if any)
```

---

## Error Handling

### Queue Timeout

```typescript
try {
  const connection = await deepgramConnectionPool.acquireConnection(clientId, options);
} catch (error) {
  if (error.message.includes('timeout')) {
    // Request waited 30+ seconds in queue
    logger.error('Connection request timed out', { clientId });
    // Fallback to batch STT or notify user
  }
}
```

### Queue Full

```typescript
try {
  const connection = await deepgramConnectionPool.acquireConnection(clientId, options);
} catch (error) {
  if (error instanceof RateLimitError) {
    // System at max capacity
    logger.error('Pool exhausted', { clientId });
    // Fallback strategy or reject call politely
  }
}
```

### Connection Failed

```typescript
try {
  const connection = await deepgramConnectionPool.acquireConnection(clientId, options);
} catch (error) {
  // Deepgram API error (network, auth, etc.)
  logger.error('Failed to create connection', { error });
  // Fallback to batch STT
}
```

---

## Metrics & Monitoring

### Pool Status Levels

| Utilization | Status | Action |
|------------|--------|--------|
| 0-50% | `healthy` | Normal operation |
| 50-75% | `moderate` | Monitor closely |
| 75-90% | `high` | Consider scaling |
| 90-100% | `critical` | Scale immediately |

### Key Metrics

1. **active**: Current connections in use
2. **queued**: Requests waiting for slot
3. **utilization**: Percentage of capacity used
4. **totalAcquired**: Lifetime connections created
5. **totalReleased**: Lifetime connections released
6. **totalQueued**: Lifetime requests queued
7. **totalTimeout**: Requests that timed out in queue
8. **totalFailed**: Failed connection attempts

### Alerts to Set

```bash
# Critical: Pool at 90%+ for 5+ minutes
if (poolStats.utilization > 90 && duration > 300s) {
  alert("Deepgram pool critical - scale immediately");
}

# Warning: High queue depth
if (poolStats.queued > 10) {
  alert("High Deepgram queue depth - monitor");
}

# Error: High timeout rate
timeoutRate = poolStats.totalTimeout / poolStats.totalAcquired;
if (timeoutRate > 0.05) { // 5%+
  alert("High timeout rate - pool undersized");
}
```

---

## Performance Impact

### Before Pool (Direct connections)

```
Concurrent Calls: 1-20  ✅ Works
Concurrent Calls: 21+   ❌ Fails immediately
Error rate: 100% after limit
User experience: Call drops, no fallback
```

### After Pool (With queuing)

```
Concurrent Calls: 1-20  ✅ Immediate connection
Concurrent Calls: 21-70 ✅ Queued (0-30s wait)
Concurrent Calls: 71+   ⚠️ Queue full, graceful fallback
Error rate: <5% (timeouts + failures)
User experience: Slight delay, or fallback to batch STT
```

### Latency Impact

```
Normal (0-20 calls):
  Connection time: 100-300ms

Moderate (20-40 calls):
  Connection time: 100-300ms (immediate)
                 + 0-5s (queue wait if at capacity)

High (40-70 calls):
  Connection time: 100-300ms
                 + 5-30s (queue wait)
```

---

## Scaling Recommendations

### Current Limit: 20 Concurrent Calls

To handle more:

#### Option 1: Upgrade Deepgram Plan

```
Pay-as-you-go: 20 concurrent
Growth:        50 concurrent
Enterprise:    100+ concurrent (custom)

Update pool config:
const pool = new DeepgramConnectionPool({
  maxConnections: 50  // After upgrading to Growth
});
```

#### Option 2: Multiple API Keys (Workaround)

```typescript
// Create 2 pools with different API keys
const pool1 = new DeepgramConnectionPool({
  apiKey: 'key1',
  maxConnections: 20
});

const pool2 = new DeepgramConnectionPool({
  apiKey: 'key2',
  maxConnections: 20
});

// Load balance between them (40 total concurrent)
const pool = Math.random() > 0.5 ? pool1 : pool2;
const connection = await pool.acquireConnection(...);
```

#### Option 3: Fallback Strategy

```typescript
try {
  // Try streaming STT first
  const connection = await deepgramConnectionPool.acquireConnection(...);
} catch (error) {
  if (error instanceof RateLimitError) {
    // Fallback to batch STT (slower but no limit)
    logger.warn('Pool exhausted, using batch STT fallback');
    // Use buffer accumulation + batch transcription
  }
}
```

---

## Testing

### Unit Tests

```typescript
describe('DeepgramConnectionPool', () => {
  it('should enforce connection limit', async () => {
    const pool = new DeepgramConnectionPool({ maxConnections: 2 });

    // Acquire 2 connections
    await pool.acquireConnection('client1', {});
    await pool.acquireConnection('client2', {});

    // 3rd should queue
    const promise = pool.acquireConnection('client3', {});
    expect(pool.getStats().queued).toBe(1);

    // Release one
    pool.releaseConnection('client1');

    // 3rd should now acquire
    await promise;
    expect(pool.getStats().active).toBe(2);
  });

  it('should timeout queued requests', async () => {
    const pool = new DeepgramConnectionPool({
      maxConnections: 1,
      queueTimeout: 1000 // 1 second
    });

    await pool.acquireConnection('client1', {});

    // Should timeout after 1s
    await expect(
      pool.acquireConnection('client2', {})
    ).rejects.toThrow('timeout');
  });
});
```

### Load Testing

```bash
# Test with Artillery
artillery quick --count 50 --num 1 http://localhost:3000/api/call

# Monitor pool stats
watch -n 1 'curl -s http://localhost:3000/api/v1/stats | jq .deepgramPool'
```

---

## Migration Checklist

When deploying this change:

- [x] Connection pool service created
- [x] ExotelVoice handler updated to use pool
- [x] Stats API endpoint added
- [ ] Update Deepgram plan if needed (for >20 concurrent)
- [ ] Add monitoring alerts (utilization, queue depth)
- [ ] Load test with expected traffic
- [ ] Document fallback strategy for team
- [ ] Add Grafana dashboard for pool metrics

---

## Troubleshooting

### Issue: Pool always at 100%

**Symptoms**: Utilization stuck at 100%, queue growing

**Causes**:
1. Connections not being released (bug in cleanup)
2. Traffic exceeds capacity
3. Memory leak (listeners not removed)

**Debug**:
```typescript
// Check if connections are being released
const stats = deepgramConnectionPool.getStats();
console.log({
  acquired: stats.totalAcquired,
  released: stats.totalReleased,
  leaking: stats.totalAcquired - stats.totalReleased
});

// If leaking > 0 and growing, connections aren't being released
```

**Fix**:
- Ensure `releaseConnection()` called on disconnect
- Check for error paths that skip cleanup
- Add try-finally blocks

---

### Issue: High timeout rate

**Symptoms**: Many queued requests timing out

**Causes**:
1. Pool too small for traffic
2. Timeout too short
3. Traffic spikes

**Fix**:
1. Upgrade Deepgram plan (increase capacity)
2. Increase queue timeout
3. Add more instances (horizontal scale)
4. Implement fallback to batch STT

---

### Issue: Queue full errors

**Symptoms**: RateLimitError "Queue full"

**Causes**:
1. Sustained traffic > capacity
2. Max queue size too small

**Fix**:
1. Increase maxQueueSize (trade-off: more memory)
2. Add fallback strategy
3. Scale infrastructure

---

## Next Steps

This implementation completes **Priority 1** of the concurrency plan.

**Next**: Implement Priority 2
- [ ] TTS Request Queue (ElevenLabs limit)
- [ ] Webhook Rate Limiter (DoS protection)
- [ ] Redis Session Storage (horizontal scaling)

See: [ENTERPRISE_CONCURRENCY_IMPLEMENTATION_PLAN.md](./ENTERPRISE_CONCURRENCY_IMPLEMENTATION_PLAN.md)

---

## References

- Deepgram API Limits: https://developers.deepgram.com/docs/limits
- Connection Pool Pattern: https://en.wikipedia.org/wiki/Connection_pool
- Implementation Plan: [docs/ENTERPRISE_CONCURRENCY_IMPLEMENTATION_PLAN.md](./ENTERPRISE_CONCURRENCY_IMPLEMENTATION_PLAN.md)
