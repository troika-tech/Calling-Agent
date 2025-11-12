# Enterprise Concurrency Implementation Plan for AI Calling Agent

**Document Version**: 1.0
**Date**: 2025-11-01
**Status**: Planning Phase - No Code Changes Yet

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Current System Analysis](#current-system-analysis)
3. [Concurrency Bottlenecks](#concurrency-bottlenecks)
4. [AWS EC2 Cost Analysis](#aws-ec2-cost-analysis)
5. [Implementation Roadmap](#implementation-roadmap)
6. [Instance Capacity Analysis](#instance-capacity-analysis)
7. [Auto Scaling Deep Dive](#auto-scaling-deep-dive)
8. [Production Recommendations](#production-recommendations)

---

## Executive Summary

This document outlines a comprehensive plan to scale the AI Calling Agent system from its current state (10-15 concurrent calls) to enterprise-level capacity (100+ concurrent calls) while optimizing costs.

### Key Findings

- **Current Safe Capacity**: 10-15 concurrent calls on single t3.medium
- **Primary Bottlenecks**: Deepgram STT (20 connection limit), ElevenLabs TTS (10 concurrent streams), In-memory session storage
- **Cost per Call**: $6.63 - $8.85/month infrastructure (excluding API costs)
- **Recommended First Step**: Implement API rate limiting & queuing (Priority 1)

### Quick Reference

| Target Calls | Recommended Setup | Monthly Cost | Implementation Time |
|-------------|-------------------|--------------|-------------------|
| 10-20 | 1× t3.medium + Priority 1 | $66-131 | 3 days |
| 30-50 | 2× c6i.large + Load Balancer + Redis | $343 | 1 week |
| 80-100 | 4× c6i.xlarge + Full Infrastructure | $810-962 | 2-3 weeks |

---

## Current System Analysis

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    Current Architecture                      │
└─────────────────────────────────────────────────────────────┘

Exotel Call → WebSocket → Node.js Server → External APIs
                             │
                             ├─ Deepgram STT (Streaming)
                             ├─ OpenAI GPT-4o-mini (LLM)
                             ├─ Deepgram TTS (Streaming)
                             └─ MongoDB (Session Storage)

Session Storage: In-memory Map (exotelVoice.handler.ts:97)
Connection Pooling: MongoDB only (5-10 pool)
Redis: Available but unused for sessions
```

### What's Built Right ✅

1. **Per-call session isolation**
   - Location: `exotelVoice.handler.ts:59-94`
   - Each call gets isolated `VoiceSession` object
   - Prevents cross-contamination between calls

2. **Ultra-low latency pipeline**
   - 200-400ms total response time
   - Parallel processing: LLM starts before user finishes speaking
   - Streaming TTS for sub-200ms TTFB

3. **Streaming architecture**
   - Deepgram live STT: `deepgram.service.ts:104-190`
   - Streaming TTS: `elevenlabsTTS.service.ts:145-212`
   - Prevents blocking on I/O operations

4. **Singleton services**
   - STT, LLM, TTS services are shared across calls
   - Good design for concurrency

5. **MongoDB connection pooling**
   - Location: `db.ts:8-9`
   - Pool size: 5-10 connections
   - Adequate for current scale

6. **Redis infrastructure**
   - Location: `redis.ts:1-120`
   - Ready but not used for sessions yet

---

## Concurrency Bottlenecks

### Critical Bottlenecks (Prevent Scale) 🚨

#### 1. Deepgram STT Rate Limit - BLOCKS AT 20 CALLS

**Location**: `deepgram.service.ts:104-190`

```typescript
async createLiveConnectionWithVAD(...): Promise<LiveClient> {
  const connection = this.client.listen.live({ ... });
  // Each call creates 1 WebSocket connection to Deepgram
}
```

**Problem**:
- Deepgram Pay-as-you-go: 20 concurrent connections limit
- Each call = 1 live connection
- Call #21 fails immediately with connection error

**Impact**:
```
10 concurrent calls  → 10 Deepgram connections (50% capacity) ✅
20 concurrent calls  → 20 Deepgram connections (100% capacity) ⚠️
21 concurrent calls  → ERROR: Connection limit exceeded ❌
```

**Solution**: Connection pool with queuing (Priority 1)

---

#### 2. ElevenLabs TTS Rate Limit - BLOCKS AT ~10 CALLS

**Location**: `elevenlabsTTS.service.ts:145-212`

```typescript
async synthesizeStreaming(text, onAudioChunk, voiceId, modelId) {
  const response = await this.client.textToSpeech.stream(voiceId, { ... });
}
```

**Problem**:
- ElevenLabs Creator plan: ~10 concurrent WebSocket streams
- No queuing mechanism
- All requests sent simultaneously

**Impact**:
```
5 concurrent calls   → Synthesis: 200-400ms ✅
10 concurrent calls  → Synthesis: 400-800ms ⚠️
20 concurrent calls  → 10 wait 30-60 seconds ❌
```

**Solution**: TTS request queue (Priority 1)

---

#### 3. In-Memory Session Storage - PREVENTS HORIZONTAL SCALING

**Location**: `exotelVoice.handler.ts:97`

```typescript
class ExotelVoiceHandler {
  private sessions: Map<string, VoiceSession> = new Map();
  // Sessions stored in JavaScript Map (in-memory only)
}
```

**Problem**:
- Can't share sessions across multiple server instances
- Sessions lost on server restart/crash
- Memory grows linearly with active calls
- No horizontal scaling possible

**Impact**:
```
Memory per session: 2-5 MB
100 concurrent calls: 200-500 MB just for sessions
Server restart: All active calls dropped
Load balancer: Can't route to different instance (session lost)
```

**Solution**: Redis-based session storage (Priority 2)

---

#### 4. Database Write Contention

**Location**: `exotelVoice.handler.ts:1556-1564`

```typescript
private async saveTranscript(callLogId, speaker, text) {
  await CallLog.findByIdAndUpdate(callLogId, {
    $push: { transcript: { speaker, text, timestamp } }
  });
  // Every message = 1 database write with $push
}
```

**Problem**:
- Each transcript message = separate `$push` operation
- 50+ concurrent calls = MongoDB lock contention
- No batching

**Impact**:
```
10 calls, 20 messages each  → 200 writes/minute (OK) ✅
50 calls, 20 messages each  → 1,000 writes/minute (slow) ⚠️
100 calls, 20 messages each → 2,000 writes/minute (locks) ❌
```

**Solution**: Transcript batching (Priority 2)

---

#### 5. No Webhook Rate Limiting - DoS VULNERABILITY

**Location**: `websocket.server.ts:38-59`

```typescript
server.on('upgrade', (request, socket, head) => {
  if (pathname.startsWith('/ws/exotel/voice/')) {
    this.wss.handleUpgrade(request, socket, head, (ws) => {
      this.handleExotelConnection(ws, request);
    });
  }
  // No rate limiting on incoming connections
});
```

**Problem**:
- No protection against connection floods
- Attacker can exhaust resources

**Solution**: Webhook rate limiter (Priority 1)

---

### Estimated Concurrency Limits

| Scenario | Safe Limit | Maximum Burst | Notes |
|----------|-----------|---------------|-------|
| **Current (no changes)** | 10-15 calls | 20-30 calls | Deepgram limit hit at 20 |
| **+ Priority 1 (Queuing)** | 20-30 calls | 50+ calls | 3 days implementation |
| **+ Priority 2 (Redis + DB)** | 40-60 calls | 100+ calls | 5 days implementation |
| **+ Priority 3 (Full Enterprise)** | 80-120 calls | 200+ calls | 10 days implementation |

---

## AWS EC2 Cost Analysis

### Scenario 1: 10 Concurrent Calls

#### Recommended: t3.small ($15.18/month)

**Instance Specifications**:
```
vCPUs:        2 vCPUs (burstable)
RAM:          2 GB
Network:      Up to 5 Gbps
Baseline CPU: 20%
```

**Capacity Analysis**:
```
Memory:  800 MB base + (10 × 1 MB) = 810 MB / 2,048 MB (40%) ✅
CPU:     20% baseline + (10 × 3%) = 50% (using burst credits)
Safe:    8-10 concurrent calls
Maximum: 12-15 concurrent calls (short bursts)
```

**Total Monthly Cost**:
```
EC2 (t3.small On-Demand)     $15.18/month
Data Transfer (500 GB)       $45.00/month
EBS Storage (30 GB)          $3.00/month
────────────────────────────────────────
TOTAL                        $63.18/month

With 1-Year Reserved Instance:
EC2 (t3.small RI)            $9.13/month
TOTAL                        $57.13/month (10% savings)
```

**Cost per Call**: $6.32/month (at 10 calls)

---

### Scenario 2: 20 Concurrent Calls

#### Recommended: t3.medium ($30.37/month)

**Instance Specifications**:
```
vCPUs:        2 vCPUs
RAM:          4 GB
Network:      Up to 5 Gbps
Baseline CPU: 20%
```

**Capacity Analysis**:
```
Memory:  800 MB + (20 × 1 MB) = 820 MB / 4,096 MB (20%) ✅
CPU:     20% + (20 × 3%) = 80% (sustainable)
Safe:    15-18 concurrent calls
Maximum: 25-30 concurrent calls
```

**Total Monthly Cost**:
```
EC2 (t3.medium On-Demand)    $30.37/month
Data Transfer (1 TB)         $90.00/month
EBS Storage (50 GB)          $5.00/month
────────────────────────────────────────
TOTAL                        $125.37/month

With 1-Year Reserved + Priority 1 Optimizations:
EC2 (t3.medium RI)           $18.25/month
TOTAL                        $113.25/month (10% savings)
```

**Cost per Call**: $5.66/month (at 20 calls)

---

### Scenario 3: 50 Concurrent Calls

#### Recommended: 2× c6i.large + Load Balancer + Redis

**Architecture**:
```
┌─────────────────────────────────────┐
│   Application Load Balancer         │
│   (Distributes WebSocket traffic)   │
└──────────┬──────────────────────────┘
           │
    ┌──────┴──────┐
    │             │
┌───▼────┐   ┌────▼───┐
│ c6i.   │   │ c6i.   │
│ large  │   │ large  │
│(25 call│   │(25 call│
└────┬───┘   └────┬───┘
     │            │
     └──────┬─────┘
            │
    ┌───────▼────────┐
    │ Redis Cluster  │
    │(Session Store) │
    └────────────────┘
```

**Instance Specifications (per c6i.large)**:
```
vCPUs:        2
RAM:          4 GB
Network:      Up to 12.5 Gbps
Architecture: Compute-optimized (better for sustained load)
Cost:         $62.78/month each
```

**Total Monthly Cost**:
```
EC2 (2× c6i.large On-Demand)   $125.56/month
Application Load Balancer      $21.20/month
Redis (cache.t3.micro)         $11.52/month
Data Transfer (2.5 TB)         $225.00/month
EBS Storage (100 GB)           $10.00/month
──────────────────────────────────────────
TOTAL                          $393.28/month

With 1-Year Reserved Instances:
EC2 (2× c6i.large RI)          $75.36/month
Other services                 $267.72/month
──────────────────────────────────────────
TOTAL                          $343.08/month (13% savings)
```

**Cost per Call**: $6.86/month (at 50 calls)

**Why c6i instead of t3**:
- Better network performance (12.5 Gbps vs 5 Gbps)
- No burst credits (consistent CPU performance)
- Optimized for sustained concurrent connections

---

### Scenario 4: 100 Concurrent Calls

#### Recommended: 4× c6i.xlarge + Full Infrastructure

**Architecture**:
```
┌────────────────────────────────────────────────────┐
│          Application Load Balancer                  │
│     (Least connections routing algorithm)           │
└─────┬──────────┬──────────┬──────────┬─────────────┘
      │          │          │          │
  ┌───▼───┐  ┌───▼───┐  ┌───▼───┐  ┌───▼───┐
  │c6i.   │  │c6i.   │  │c6i.   │  │c6i.   │
  │xlarge │  │xlarge │  │xlarge │  │xlarge │
  │25calls│  │25calls│  │25calls│  │25calls│
  └───┬───┘  └───┬───┘  └───┬───┘  └───┬───┘
      │          │          │          │
      └──────────┴──────────┴──────────┘
                 │
         ┌───────┴────────┐
         │                │
    ┌────▼────┐     ┌─────▼─────┐
    │ Redis   │     │ MongoDB   │
    │ m6g.    │     │ Atlas M10 │
    │ large   │     │ (Managed) │
    └─────────┘     └───────────┘
```

**Instance Specifications (per c6i.xlarge)**:
```
vCPUs:        4
RAM:          8 GB
Network:      Up to 12.5 Gbps
Capacity:     25 concurrent calls each
Cost:         $125.56/month each
```

**Total Monthly Cost**:
```
EC2 (4× c6i.xlarge On-Demand)   $502.24/month
Application Load Balancer       $31.20/month
Redis (cache.m6g.large)         $92.16/month
MongoDB Atlas (M10)             $57.00/month
Data Transfer (5 TB)            $450.00/month
EBS Storage (200 GB)            $20.00/month
CloudWatch Monitoring           $10.00/month
────────────────────────────────────────────
TOTAL                           $1,162.60/month

With 1-Year Reserved Instances:
EC2 (4× c6i.xlarge RI)          $301.34/month (40% savings)
Other services                  $660.36/month
────────────────────────────────────────────
TOTAL                           $961.70/month

With 3-Year Reserved + Savings Plans:
EC2 (4× c6i.xlarge)             $225.00/month (55% savings)
Other services                  $660.36/month
────────────────────────────────────────────
TOTAL                           $885.36/month
```

**Cost per Call**: $8.85/month (at 100 calls)

---

### Cost Comparison Table

| Concurrent Calls | On-Demand | 1-Year Reserved | 3-Year Reserved | Per Call/Month |
|-----------------|-----------|-----------------|-----------------|----------------|
| **10** | $78.37 | $66.25 | $54.20 | $6.63 |
| **20** | $155.74 | $131.50 | $107.50 | $6.58 |
| **50** | $393.28 | $343.08 | $280.50 | $6.86 |
| **100** | $1,162.60 | $961.70 | $885.36 | $8.85 |

---

## Auto Scaling Deep Dive

### What is Auto Scaling?

Auto Scaling automatically adjusts the number of EC2 instances based on demand, similar to a restaurant hiring more waiters during dinner rush and sending them home during slow hours.

### Configuration Example

```yaml
AutoScalingGroup:
  MinSize: 2                    # Always running (even at 3 AM)
  MaxSize: 6                    # Maximum during peak
  DesiredCapacity: 2            # Starting point
  TargetMetric: ActiveCalls     # Scale based on concurrent calls
  TargetValue: 25               # 25 calls per instance
  ScaleUpIncrement: 1           # Add 1 instance at a time
  ScaleDownIncrement: -1        # Remove 1 instance at a time
  ScaleUpCooldown: 300          # Wait 5 min before scaling up again
  ScaleDownCooldown: 600        # Wait 10 min before scaling down
```

### How It Works: Real-World Example

**Scenario**: E-commerce business operating 9 AM - 9 PM

```
Time          │ Concurrent Calls │ Instances │ Action Taken
──────────────┼──────────────────┼───────────┼─────────────────────
12 AM - 8 AM  │ 5-10 calls       │ 2         │ Minimum maintained
9:00 AM       │ 15 calls         │ 2         │ No action (under 50)
10:00 AM      │ 35 calls         │ 2         │ Exceeds 50 → +1 instance
10:05 AM      │ 40 calls         │ 3         │ New instance ready
12:00 PM      │ 65 calls         │ 3         │ Exceeds 75 → +1 instance
12:05 PM      │ 70 calls         │ 4         │ New instance ready
5:00 PM       │ 95 calls         │ 4         │ Exceeds 100 → +1 instance
5:05 PM       │ 100 calls        │ 5         │ New instance ready
6:00 PM       │ 125 calls        │ 5         │ Exceeds 125 → +1 instance
6:05 PM       │ 130 calls        │ 6         │ Max reached (cap)
9:00 PM       │ 40 calls         │ 6         │ Under 150 → -1 instance
9:10 PM       │ 35 calls         │ 5         │ Instance terminated
10:00 PM      │ 20 calls         │ 5         │ Under 125 → -1 instance
...continues until back to 2 instances minimum
```

### Cost Calculation: Auto Scaling vs Fixed

**Example**: c6i.xlarge ($0.1736/hour)

#### Fixed Capacity (No Auto Scaling)
```
Always running: 4 instances × 24 hours × 30 days
Total hours:    2,880 instance-hours/month
Cost:           2,880 × $0.1736 = $499.97/month
```

#### With Auto Scaling
```
Off-Peak (16 hours/day - midnight to 8 AM + 9 PM to midnight):
  2 instances × 16 hours × 30 days = 960 hours
  Cost: 960 × $0.1736 = $166.66/month

Peak Hours (8 hours/day - 9 AM to 5 PM):
  9 AM - 11 AM:  3 instances × 2 hours × 30 days = 180 hours
  11 AM - 2 PM:  5 instances × 3 hours × 30 days = 450 hours
  2 PM - 5 PM:   4 instances × 3 hours × 30 days = 360 hours
  5 PM - 9 PM:   6 instances × 4 hours × 30 days = 720 hours
  Total peak: 1,710 hours
  Cost: 1,710 × $0.1736 = $296.85/month

Total: $166.66 + $296.85 = $463.51/month
Savings: $499.97 - $463.51 = $36.46/month (7% savings)
```

### When Auto Scaling Saves Money

✅ **Business Hours Only (9 AM - 5 PM)**
```
Peak:    6 instances × 8 hours × 30 days = 1,440 hours
Off:     1 instance × 16 hours × 30 days = 480 hours
Total:   1,920 hours × $0.1736 = $333.31/month

vs Fixed: 6 instances × 24 × 30 = 4,320 × $0.1736 = $749.95/month
SAVINGS:  $416.64/month (56% savings!) ✅
```

✅ **Predictable Daily Spikes**
```
Example: Lunch rush (12-2 PM) and dinner rush (6-8 PM)
Baseline: 2 instances (20 hours/day)
Spikes:   6 instances (4 hours/day)
Average:  ~2.8 instances effective
SAVINGS:  45% vs running 6 instances 24/7 ✅
```

❌ **24/7 Consistent Traffic**
```
Always need 4+ instances
Auto Scaling overhead (brief over-provisioning)
Minimum enforced even when need less
Better: Fixed capacity ❌
```

### Custom Metric: Active Calls (Better than CPU)

**Problem with CPU-based scaling**:
```
Your system is I/O bound, not CPU bound!

Scenario: 50 concurrent calls
CPU Usage: 45% (low because waiting on network I/O)
Auto Scaling: Won't add servers ❌
Reality: Deepgram connections at limit, calls failing ❌
```

**Solution: Scale on active concurrent calls**

```typescript
// backend/src/middleware/cloudwatchMetrics.ts
import { CloudWatch } from 'aws-sdk';

const cloudwatch = new CloudWatch();

// Publish custom metric every minute
setInterval(async () => {
  const activeCalls = wsManager.clients.size;

  await cloudwatch.putMetricData({
    Namespace: 'CallingAgent',
    MetricData: [{
      MetricName: 'ActiveCalls',
      Value: activeCalls,
      Unit: 'Count',
      Timestamp: new Date()
    }]
  });
}, 60000);
```

**Auto Scaling Policy**:
```json
{
  "TargetTrackingScalingPolicyConfiguration": {
    "TargetValue": 25.0,
    "CustomizedMetricSpecification": {
      "MetricName": "ActiveCalls",
      "Namespace": "CallingAgent",
      "Statistic": "Average"
    }
  }
}
```

**Result**:
```
Active Calls │ Instances Needed (25 per instance)
─────────────┼────────────────────────────────────
10           │ 2 (minimum enforced)
30           │ 2 (30/25 = 1.2 → rounded to 2)
50           │ 2 instances
55           │ 3 instances (55/25 = 2.2 → rounded to 3)
75           │ 3 instances
80           │ 4 instances
125          │ 5 instances
150          │ 6 instances (max)
```

---

## Implementation Roadmap

### Priority 1: API Rate Limiting & Queuing (3 days) 🔴 CRITICAL

**Why First**: Prevents cascading failures when hitting external API limits

#### Components to Build

**1. Deepgram Connection Pool Manager**

Create: `backend/src/services/deepgramConnectionPool.service.ts`

```typescript
import { deepgramService } from './deepgram.service';
import { logger } from '../utils/logger';

interface QueuedRequest {
  resolve: (connection: any) => void;
  reject: (error: Error) => void;
  timestamp: number;
}

export class DeepgramConnectionPool {
  private maxConnections = 20; // Deepgram limit
  private activeConnections = 0;
  private queue: QueuedRequest[] = [];
  private activeClients: Map<string, any> = new Map();

  /**
   * Acquire a Deepgram live connection from pool
   * Queues request if at limit
   */
  async acquireConnection(clientId: string, options?: any): Promise<any> {
    logger.info('Acquiring Deepgram connection', {
      clientId,
      active: this.activeConnections,
      queued: this.queue.length
    });

    if (this.activeConnections < this.maxConnections) {
      return await this.createConnection(clientId, options);
    }

    // Queue the request
    return new Promise((resolve, reject) => {
      this.queue.push({
        resolve: (connection) => {
          this.createConnection(clientId, options)
            .then(resolve)
            .catch(reject);
        },
        reject,
        timestamp: Date.now()
      });

      logger.warn('Deepgram connection queued', {
        clientId,
        queuePosition: this.queue.length
      });

      // Timeout after 30 seconds
      setTimeout(() => {
        const index = this.queue.findIndex(q => q.timestamp === Date.now());
        if (index > -1) {
          this.queue.splice(index, 1);
          reject(new Error('Connection request timeout'));
        }
      }, 30000);
    });
  }

  /**
   * Create actual Deepgram connection
   */
  private async createConnection(clientId: string, options?: any): Promise<any> {
    try {
      this.activeConnections++;
      const connection = await deepgramService.createLiveConnectionWithVAD(options);
      this.activeClients.set(clientId, connection);

      logger.info('Deepgram connection created', {
        clientId,
        activeConnections: this.activeConnections
      });

      return connection;
    } catch (error: any) {
      this.activeConnections--;
      logger.error('Failed to create Deepgram connection', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Release connection back to pool
   */
  releaseConnection(clientId: string): void {
    const connection = this.activeClients.get(clientId);
    if (connection) {
      try {
        connection.finish();
        this.activeClients.delete(clientId);
        this.activeConnections--;

        logger.info('Deepgram connection released', {
          clientId,
          activeConnections: this.activeConnections
        });

        // Process next in queue
        if (this.queue.length > 0) {
          const next = this.queue.shift();
          if (next) {
            next.resolve(null); // Will trigger acquireConnection again
          }
        }
      } catch (error: any) {
        logger.error('Error releasing Deepgram connection', {
          error: error.message
        });
      }
    }
  }

  /**
   * Get pool statistics
   */
  getStats() {
    return {
      active: this.activeConnections,
      queued: this.queue.length,
      capacity: this.maxConnections,
      utilization: (this.activeConnections / this.maxConnections) * 100
    };
  }
}

export const deepgramConnectionPool = new DeepgramConnectionPool();
```

**2. TTS Request Queue Manager**

Create: `backend/src/services/ttsQueue.service.ts`

```typescript
import { logger } from '../utils/logger';

interface TTSRequest {
  resolve: (buffer: Buffer) => void;
  reject: (error: Error) => void;
  text: string;
  provider: string;
  config: any;
  timestamp: number;
}

export class TTSQueueManager {
  private limits = {
    elevenlabs: 10,  // Concurrent streams
    deepgram: 100,   // More generous
    openai: 50
  };

  private active = {
    elevenlabs: 0,
    deepgram: 0,
    openai: 0
  };

  private queues = {
    elevenlabs: [] as TTSRequest[],
    deepgram: [] as TTSRequest[],
    openai: [] as TTSRequest[]
  };

  /**
   * Queue TTS request with automatic provider-specific limiting
   */
  async synthesize(
    provider: 'elevenlabs' | 'deepgram' | 'openai',
    text: string,
    synthesizeFunc: () => Promise<Buffer>,
    config?: any
  ): Promise<Buffer> {
    const limit = this.limits[provider];
    const active = this.active[provider];

    logger.info('TTS request', {
      provider,
      active,
      limit,
      queued: this.queues[provider].length
    });

    if (active < limit) {
      return await this.executeSynthesis(provider, synthesizeFunc);
    }

    // Queue the request
    return new Promise((resolve, reject) => {
      this.queues[provider].push({
        resolve: async () => {
          try {
            const buffer = await this.executeSynthesis(provider, synthesizeFunc);
            resolve(buffer);
          } catch (error) {
            reject(error);
          }
        },
        reject,
        text,
        provider,
        config,
        timestamp: Date.now()
      });

      logger.warn('TTS request queued', {
        provider,
        queuePosition: this.queues[provider].length
      });
    });
  }

  /**
   * Execute TTS synthesis with slot management
   */
  private async executeSynthesis(
    provider: 'elevenlabs' | 'deepgram' | 'openai',
    synthesizeFunc: () => Promise<Buffer>
  ): Promise<Buffer> {
    this.active[provider]++;

    try {
      const buffer = await synthesizeFunc();
      return buffer;
    } finally {
      this.active[provider]--;

      // Process next in queue
      if (this.queues[provider].length > 0) {
        const next = this.queues[provider].shift();
        if (next) {
          next.resolve(null as any); // Will trigger executeSynthesis
        }
      }
    }
  }

  /**
   * Get queue statistics
   */
  getStats() {
    return {
      elevenlabs: {
        active: this.active.elevenlabs,
        queued: this.queues.elevenlabs.length,
        limit: this.limits.elevenlabs
      },
      deepgram: {
        active: this.active.deepgram,
        queued: this.queues.deepgram.length,
        limit: this.limits.deepgram
      },
      openai: {
        active: this.active.openai,
        queued: this.queues.openai.length,
        limit: this.limits.openai
      }
    };
  }
}

export const ttsQueueManager = new TTSQueueManager();
```

**3. Webhook Rate Limiter**

Create: `backend/src/middleware/callRateLimit.ts`

```typescript
import rateLimit from 'express-rate-limit';
import { logger } from '../utils/logger';

/**
 * Rate limiter for incoming Exotel webhook calls
 * Prevents DoS attacks and resource exhaustion
 */
export const callRateLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute window
  max: 50, // 50 calls per minute max
  message: 'Too many incoming calls, please try again later',

  handler: (req, res) => {
    logger.warn('Call rate limit exceeded', {
      ip: req.ip,
      path: req.path
    });

    res.status(429).json({
      error: 'Too many requests',
      message: 'System is at capacity, please try again in a moment'
    });
  },

  // Skip rate limiting for specific IPs (Exotel servers)
  skip: (req) => {
    const trustedIPs = process.env.EXOTEL_IPS?.split(',') || [];
    return trustedIPs.includes(req.ip);
  },

  // Use Redis for distributed rate limiting (when scaling horizontally)
  // store: new RedisStore({
  //   client: redis,
  //   prefix: 'rate_limit:'
  // })
});

/**
 * Per-agent rate limiter (more granular)
 */
export const perAgentRateLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 20, // 20 calls per agent per minute
  keyGenerator: (req) => {
    // Extract agentId from request
    return req.params.agentId || req.ip;
  }
});
```

#### Files to Modify

**Modify**: `exotelVoice.handler.ts`

```typescript
// Line 214-264: Replace direct Deepgram connection with pool
import { deepgramConnectionPool } from '../services/deepgramConnectionPool.service';

// OLD CODE (Line 216-264):
if (deepgramService.isAvailable()) {
  const deepgramConnection = await deepgramService.createLiveConnectionWithVAD({...});
  session.deepgramConnection = deepgramConnection;
}

// NEW CODE:
if (deepgramService.isAvailable()) {
  try {
    const deepgramConnection = await deepgramConnectionPool.acquireConnection(
      client.id,
      {
        endpointing: 100,
        vadEvents: true,
        language: agent.config.language || 'en',
        onTranscript: async (result) => { /* ... */ },
        onSpeechEnded: async () => { /* ... */ }
      }
    );
    session.deepgramConnection = deepgramConnection;
  } catch (error: any) {
    logger.error('Failed to acquire Deepgram connection from pool', {
      error: error.message,
      poolStats: deepgramConnectionPool.getStats()
    });
    // Fall back to batch STT if pool exhausted
  }
}

// Line 1712-1722: Replace direct release with pool release
// OLD CODE:
if (session.deepgramConnection) {
  session.deepgramConnection.finish();
}

// NEW CODE:
if (session.deepgramConnection) {
  deepgramConnectionPool.releaseConnection(client.id);
}
```

**Modify**: `voicePipeline.service.ts`

```typescript
// Line 106-136: Wrap TTS synthesis with queue
import { ttsQueueManager } from '../services/ttsQueue.service';

// OLD CODE (Line 106-136):
private async synthesizeSpeech(text: string, config: VoicePipelineConfig): Promise<Buffer> {
  switch (provider) {
    case 'elevenlabs':
      return await elevenlabsTTSService.synthesizeText(text, voiceId, modelId);
    case 'deepgram':
      return await deepgramTTSService.synthesizeText(text, voiceId);
    // ...
  }
}

// NEW CODE:
private async synthesizeSpeech(text: string, config: VoicePipelineConfig): Promise<Buffer> {
  const provider = config.voiceProvider;

  return await ttsQueueManager.synthesize(
    provider,
    text,
    async () => {
      switch (provider) {
        case 'elevenlabs':
          return await elevenlabsTTSService.synthesizeText(
            text,
            config.voiceId || 'EXAVITQu4vr4xnSDxMaL',
            config.voiceSettings?.modelId || 'eleven_turbo_v2_5'
          );
        case 'deepgram':
          return await deepgramTTSService.synthesizeText(
            text,
            config.voiceId || 'aura-asteria-en'
          );
        default:
          throw new Error(`Unsupported provider: ${provider}`);
      }
    },
    config
  );
}
```

**Modify**: `backend/src/index.ts` or `app.ts`

```typescript
import { callRateLimiter } from './middleware/callRateLimit';

// Apply rate limiter to Exotel webhook endpoint
app.use('/ws/exotel', callRateLimiter);
```

#### Testing Priority 1

```bash
# Monitor pool statistics
curl http://localhost:3000/api/stats

# Expected response:
{
  "deepgramPool": {
    "active": 15,
    "queued": 3,
    "capacity": 20,
    "utilization": 75
  },
  "ttsQueue": {
    "elevenlabs": { "active": 8, "queued": 2, "limit": 10 },
    "deepgram": { "active": 12, "queued": 0, "limit": 100 }
  }
}
```

#### Expected Results

- ✅ Handle 20+ concurrent calls without Deepgram errors
- ✅ Queue overflow calls instead of rejecting them
- ✅ Prevent DoS attacks via rate limiting
- ✅ Better error messages for users during high load

---

### Priority 2: Redis Session Storage + DB Optimization (5 days) 🟠

**Why Second**: Enables horizontal scaling & reduces database bottlenecks

#### Components to Build

**1. Redis Session Manager**

Create: `backend/src/services/sessionManager.service.ts`

```typescript
import { redis } from '../config/redis';
import { logger } from '../utils/logger';

export interface VoiceSession {
  callLogId: string;
  agent: any;
  config: any;
  isProcessing: boolean;
  lastSpeechTime: number;
  firstSpeechTime?: number;
  streamSid?: string;
  sequenceNumber: number;
  userTranscript?: string;
  partialTranscript?: string;
  llmStarted?: boolean;
  llmTriggeredOnPartial?: boolean;
  earlyLLMResponse?: string;
  timings?: any;
}

export class SessionManager {
  private readonly SESSION_TTL = 3600; // 1 hour
  private readonly KEY_PREFIX = 'session:';

  /**
   * Create new session in Redis
   */
  async createSession(clientId: string, session: VoiceSession): Promise<void> {
    try {
      const key = this.getKey(clientId);
      await redis.setEx(key, this.SESSION_TTL, JSON.stringify(session));

      logger.info('Session created in Redis', { clientId });
    } catch (error: any) {
      logger.error('Failed to create session', {
        clientId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get session from Redis
   */
  async getSession(clientId: string): Promise<VoiceSession | null> {
    try {
      const key = this.getKey(clientId);
      const data = await redis.get(key);

      if (!data) {
        return null;
      }

      return JSON.parse(data) as VoiceSession;
    } catch (error: any) {
      logger.error('Failed to get session', {
        clientId,
        error: error.message
      });
      return null;
    }
  }

  /**
   * Update session with partial data
   */
  async updateSession(
    clientId: string,
    updates: Partial<VoiceSession>
  ): Promise<void> {
    try {
      const session = await this.getSession(clientId);
      if (!session) {
        throw new Error('Session not found');
      }

      const updated = { ...session, ...updates };
      await this.createSession(clientId, updated);

      logger.debug('Session updated', { clientId });
    } catch (error: any) {
      logger.error('Failed to update session', {
        clientId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Delete session from Redis
   */
  async deleteSession(clientId: string): Promise<void> {
    try {
      const key = this.getKey(clientId);
      await redis.del(key);

      logger.info('Session deleted', { clientId });
    } catch (error: any) {
      logger.error('Failed to delete session', {
        clientId,
        error: error.message
      });
    }
  }

  /**
   * Extend session TTL (keep alive)
   */
  async extendSession(clientId: string): Promise<void> {
    try {
      const key = this.getKey(clientId);
      await redis.expire(key, this.SESSION_TTL);
    } catch (error: any) {
      logger.error('Failed to extend session', {
        clientId,
        error: error.message
      });
    }
  }

  /**
   * Get all active session IDs
   */
  async getAllSessions(): Promise<string[]> {
    try {
      const pattern = `${this.KEY_PREFIX}*`;
      const keys = await redis.keys(pattern);
      return keys.map(key => key.replace(this.KEY_PREFIX, ''));
    } catch (error: any) {
      logger.error('Failed to get all sessions', {
        error: error.message
      });
      return [];
    }
  }

  private getKey(clientId: string): string {
    return `${this.KEY_PREFIX}${clientId}`;
  }
}

export const sessionManager = new SessionManager();
```

**2. Transcript Batcher**

Create: `backend/src/services/transcriptBatcher.service.ts`

```typescript
import { CallLog } from '../models/CallLog';
import { logger } from '../utils/logger';

interface TranscriptEntry {
  speaker: 'user' | 'assistant';
  text: string;
  timestamp: Date;
}

export class TranscriptBatcher {
  private batches: Map<string, TranscriptEntry[]> = new Map();
  private readonly BATCH_SIZE = 5; // Flush every 5 entries
  private readonly BATCH_TIMEOUT = 10000; // Or every 10 seconds
  private timers: Map<string, NodeJS.Timeout> = new Map();

  /**
   * Add transcript entry to batch
   */
  add(callLogId: string, speaker: 'user' | 'assistant', text: string): void {
    if (!this.batches.has(callLogId)) {
      this.batches.set(callLogId, []);
    }

    const entry: TranscriptEntry = {
      speaker,
      text,
      timestamp: new Date()
    };

    this.batches.get(callLogId)!.push(entry);

    logger.debug('Transcript entry batched', {
      callLogId,
      batchSize: this.batches.get(callLogId)!.length
    });

    // Flush if batch size reached
    if (this.batches.get(callLogId)!.length >= this.BATCH_SIZE) {
      this.flush(callLogId);
    } else {
      // Set timeout to flush if not already set
      if (!this.timers.has(callLogId)) {
        const timer = setTimeout(() => {
          this.flush(callLogId);
        }, this.BATCH_TIMEOUT);
        this.timers.set(callLogId, timer);
      }
    }
  }

  /**
   * Flush batch to database
   */
  async flush(callLogId: string): Promise<void> {
    const entries = this.batches.get(callLogId) || [];
    if (entries.length === 0) {
      return;
    }

    try {
      await CallLog.findByIdAndUpdate(callLogId, {
        $push: {
          transcript: {
            $each: entries
          }
        }
      });

      logger.info('Transcript batch flushed', {
        callLogId,
        entries: entries.length
      });

      // Clear batch and timer
      this.batches.set(callLogId, []);
      const timer = this.timers.get(callLogId);
      if (timer) {
        clearTimeout(timer);
        this.timers.delete(callLogId);
      }
    } catch (error: any) {
      logger.error('Failed to flush transcript batch', {
        callLogId,
        error: error.message
      });
    }
  }

  /**
   * Flush all batches (for graceful shutdown)
   */
  async flushAll(): Promise<void> {
    const callLogIds = Array.from(this.batches.keys());

    logger.info('Flushing all transcript batches', {
      count: callLogIds.length
    });

    await Promise.all(
      callLogIds.map(callLogId => this.flush(callLogId))
    );
  }
}

export const transcriptBatcher = new TranscriptBatcher();

// Flush all batches on shutdown
process.on('SIGTERM', async () => {
  await transcriptBatcher.flushAll();
});
```

**3. MongoDB Indexes**

Create: `backend/src/migrations/add-indexes.ts`

```typescript
import mongoose from 'mongoose';
import { CallLog } from '../models/CallLog';
import { Agent } from '../models/Agent';
import { logger } from '../utils/logger';

/**
 * Add database indexes for better query performance
 */
export async function addIndexes(): Promise<void> {
  try {
    logger.info('Adding database indexes...');

    // CallLog indexes
    await CallLog.collection.createIndex(
      { status: 1, createdAt: -1 },
      { name: 'status_created_idx' }
    );

    await CallLog.collection.createIndex(
      { agentId: 1, status: 1 },
      { name: 'agent_status_idx' }
    );

    await CallLog.collection.createIndex(
      { createdAt: -1 },
      { name: 'created_desc_idx' }
    );

    // Agent indexes
    await Agent.collection.createIndex(
      { userId: 1, isActive: 1 },
      { name: 'user_active_idx' }
    );

    logger.info('Database indexes added successfully');
  } catch (error: any) {
    logger.error('Failed to add database indexes', {
      error: error.message
    });
    throw error;
  }
}

// Run if executed directly
if (require.main === module) {
  mongoose.connect(process.env.MONGODB_URI!)
    .then(() => addIndexes())
    .then(() => process.exit(0))
    .catch((error) => {
      logger.error('Migration failed', { error });
      process.exit(1);
    });
}
```

#### Files to Modify

**Modify**: `exotelVoice.handler.ts`

Replace in-memory Map with Redis:

```typescript
// Line 97: Remove in-memory sessions
// OLD:
private sessions: Map<string, VoiceSession> = new Map();

// NEW:
// Sessions now in Redis via sessionManager

// Line 188-203: Create session in Redis
import { sessionManager } from '../services/sessionManager.service';

// OLD:
this.sessions.set(client.id, session);

// NEW:
await sessionManager.createSession(client.id, session);

// Line 284: Get session from Redis
// OLD:
const session = this.sessions.get(client.id);

// NEW:
const session = await sessionManager.getSession(client.id);

// Line 1550-1571: Use transcript batcher
import { transcriptBatcher } from '../services/transcriptBatcher.service';

// OLD:
private async saveTranscript(callLogId, speaker, text) {
  await CallLog.findByIdAndUpdate(callLogId, {
    $push: { transcript: { speaker, text, timestamp: new Date() } }
  });
}

// NEW:
private async saveTranscript(callLogId, speaker, text) {
  transcriptBatcher.add(callLogId, speaker, text);
}
```

#### Testing Priority 2

```bash
# Test Redis session persistence
# 1. Start a call
# 2. Restart server
# 3. Call should resume (if within TTL)

# Monitor Redis
redis-cli KEYS "session:*"
redis-cli GET "session:ws_1234567890_abc"

# Check MongoDB index usage
db.calllogs.find({status: "in-progress"}).explain("executionStats")
```

#### Expected Results

- ✅ Sessions persist across server restarts (within 1 hour)
- ✅ Can run multiple server instances with shared session state
- ✅ Database writes reduced by 80% (batching)
- ✅ Query performance improved 5-10× (indexes)

---

### Priority 3: Horizontal Scaling & Monitoring (10 days) 🟡

**Why Third**: Enables true enterprise scale (100+ concurrent calls)

#### Components to Build

**1. Nginx Load Balancer Configuration**

Create: `nginx.conf`

```nginx
upstream calling_agent {
    least_conn;  # Route to server with fewest active connections

    server app1:3000 max_fails=3 fail_timeout=30s;
    server app2:3000 max_fails=3 fail_timeout=30s;
    server app3:3000 max_fails=3 fail_timeout=30s;
    server app4:3000 max_fails=3 fail_timeout=30s;
}

server {
    listen 80;
    server_name callingagent.example.com;

    # WebSocket upgrade support
    location /ws/ {
        proxy_pass http://calling_agent;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;

        # WebSocket timeout (1 hour for long calls)
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }

    # API endpoints
    location /api/ {
        proxy_pass http://calling_agent;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # Health check endpoint
    location /health {
        proxy_pass http://calling_agent/health;
        access_log off;
    }
}
```

**2. Health Check Endpoint**

Create: `backend/src/middleware/healthCheck.ts`

```typescript
import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { redis } from '../config/redis';
import { wsManager } from '../websocket/websocket.server';
import { deepgramConnectionPool } from '../services/deepgramConnectionPool.service';
import { ttsQueueManager } from '../services/ttsQueue.service';

export interface HealthStatus {
  status: 'ok' | 'degraded' | 'overload' | 'error';
  timestamp: string;
  uptime: number;
  activeCalls: number;
  capacity: {
    deepgram: {
      active: number;
      queued: number;
      utilization: number;
    };
    tts: any;
  };
  services: {
    redis: boolean;
    mongodb: boolean;
    deepgram: boolean;
  };
}

export async function healthCheck(req: Request, res: Response): Promise<void> {
  try {
    const activeCalls = wsManager?.clients?.size || 0;
    const deepgramStats = deepgramConnectionPool.getStats();
    const ttsStats = ttsQueueManager.getStats();

    // Check service connectivity
    const redisOk = await redis.ping() === 'PONG';
    const mongoOk = mongoose.connection.readyState === 1;

    let status: 'ok' | 'degraded' | 'overload' | 'error' = 'ok';

    // Determine status based on load
    if (activeCalls > 80) {
      status = 'degraded';
    }
    if (activeCalls > 100) {
      status = 'overload';
    }
    if (!redisOk || !mongoOk) {
      status = 'error';
    }

    const health: HealthStatus = {
      status,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      activeCalls,
      capacity: {
        deepgram: deepgramStats,
        tts: ttsStats
      },
      services: {
        redis: redisOk,
        mongodb: mongoOk,
        deepgram: deepgramStats.active < deepgramStats.capacity
      }
    };

    // Return 200 for ok/degraded, 503 for overload/error
    const statusCode = status === 'ok' || status === 'degraded' ? 200 : 503;
    res.status(statusCode).json(health);
  } catch (error: any) {
    res.status(503).json({
      status: 'error',
      error: error.message
    });
  }
}
```

**3. Prometheus Metrics**

Create: `backend/src/middleware/metrics.ts`

```typescript
import promClient from 'prom-client';

// Create registry
const register = new promClient.Registry();

// Default metrics (CPU, memory, event loop lag)
promClient.collectDefaultMetrics({ register });

// Custom metrics for calling agent

// Call duration histogram
export const callDurationHistogram = new promClient.Histogram({
  name: 'call_duration_seconds',
  help: 'Call duration in seconds',
  buckets: [10, 30, 60, 120, 300, 600, 1800], // 10s to 30min
  registers: [register]
});

// Active calls gauge
export const activeCallsGauge = new promClient.Gauge({
  name: 'active_calls_total',
  help: 'Number of currently active calls',
  registers: [register]
});

// Total calls counter
export const totalCallsCounter = new promClient.Counter({
  name: 'calls_total',
  help: 'Total number of calls handled',
  labelNames: ['status'], // completed, failed
  registers: [register]
});

// API latency histogram
export const apiLatencyHistogram = new promClient.Histogram({
  name: 'api_latency_seconds',
  help: 'External API call latency',
  labelNames: ['service'], // deepgram_stt, openai_llm, deepgram_tts
  buckets: [0.1, 0.5, 1, 2, 5, 10],
  registers: [register]
});

// Queue depth gauge
export const queueDepthGauge = new promClient.Gauge({
  name: 'queue_depth',
  help: 'Number of requests in queue',
  labelNames: ['queue_type'], // deepgram_pool, tts_queue
  registers: [register]
});

// Metrics endpoint
export function metricsHandler(req: any, res: any) {
  res.set('Content-Type', register.contentType);
  res.end(register.metrics());
}

export { register };
```

**4. Circuit Breaker**

Create: `backend/src/utils/circuitBreaker.ts`

```typescript
import { logger } from './logger';

export enum CircuitState {
  CLOSED = 'closed',      // Normal operation
  OPEN = 'open',          // Failing, reject immediately
  HALF_OPEN = 'half_open' // Testing if recovered
}

export interface CircuitBreakerConfig {
  failureThreshold: number;    // Open after N failures
  successThreshold: number;    // Close after N successes in half-open
  timeout: number;             // Time to wait before half-open (ms)
}

export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failures = 0;
  private successes = 0;
  private nextAttempt = 0;
  private config: CircuitBreakerConfig;

  constructor(
    private name: string,
    config?: Partial<CircuitBreakerConfig>
  ) {
    this.config = {
      failureThreshold: config?.failureThreshold || 5,
      successThreshold: config?.successThreshold || 2,
      timeout: config?.timeout || 60000 // 1 minute
    };
  }

  /**
   * Execute function with circuit breaker protection
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    // Check if circuit is open
    if (this.state === CircuitState.OPEN) {
      if (Date.now() < this.nextAttempt) {
        throw new Error(`Circuit breaker open for ${this.name}`);
      }
      // Try half-open
      this.state = CircuitState.HALF_OPEN;
      logger.info('Circuit breaker half-open', { name: this.name });
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    this.failures = 0;

    if (this.state === CircuitState.HALF_OPEN) {
      this.successes++;
      if (this.successes >= this.config.successThreshold) {
        this.state = CircuitState.CLOSED;
        this.successes = 0;
        logger.info('Circuit breaker closed', { name: this.name });
      }
    }
  }

  private onFailure(): void {
    this.failures++;
    this.successes = 0;

    if (this.failures >= this.config.failureThreshold) {
      this.state = CircuitState.OPEN;
      this.nextAttempt = Date.now() + this.config.timeout;
      logger.error('Circuit breaker opened', {
        name: this.name,
        failures: this.failures
      });
    }
  }

  getState(): CircuitState {
    return this.state;
  }
}

// Export pre-configured circuit breakers
export const deepgramCircuitBreaker = new CircuitBreaker('deepgram', {
  failureThreshold: 5,
  timeout: 30000
});

export const openaiCircuitBreaker = new CircuitBreaker('openai', {
  failureThreshold: 3,
  timeout: 60000
});
```

**5. Docker Compose for Multi-Instance**

Create: `docker-compose.yml`

```yaml
version: '3.8'

services:
  # Nginx Load Balancer
  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
    depends_on:
      - app1
      - app2
      - app3
      - app4
    restart: unless-stopped

  # Application Instances
  app1:
    build: ./backend
    environment:
      - NODE_ENV=production
      - MONGODB_URI=${MONGODB_URI}
      - REDIS_URL=redis://redis:6379
      - INSTANCE_ID=app1
    depends_on:
      - redis
      - mongodb
    restart: unless-stopped

  app2:
    build: ./backend
    environment:
      - NODE_ENV=production
      - MONGODB_URI=${MONGODB_URI}
      - REDIS_URL=redis://redis:6379
      - INSTANCE_ID=app2
    depends_on:
      - redis
      - mongodb
    restart: unless-stopped

  app3:
    build: ./backend
    environment:
      - NODE_ENV=production
      - MONGODB_URI=${MONGODB_URI}
      - REDIS_URL=redis://redis:6379
      - INSTANCE_ID=app3
    depends_on:
      - redis
      - mongodb
    restart: unless-stopped

  app4:
    build: ./backend
    environment:
      - NODE_ENV=production
      - MONGODB_URI=${MONGODB_URI}
      - REDIS_URL=redis://redis:6379
      - INSTANCE_ID=app4
    depends_on:
      - redis
      - mongodb
    restart: unless-stopped

  # Redis for session storage
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis-data:/data
    restart: unless-stopped

  # MongoDB
  mongodb:
    image: mongo:6
    ports:
      - "27017:27017"
    volumes:
      - mongo-data:/data/db
    environment:
      - MONGO_INITDB_ROOT_USERNAME=admin
      - MONGO_INITDB_ROOT_PASSWORD=${MONGO_PASSWORD}
    restart: unless-stopped

  # Prometheus (metrics)
  prometheus:
    image: prom/prometheus:latest
    ports:
      - "9090:9090"
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml:ro
      - prometheus-data:/prometheus
    restart: unless-stopped

  # Grafana (dashboards)
  grafana:
    image: grafana/grafana:latest
    ports:
      - "3001:3000"
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=${GRAFANA_PASSWORD}
    volumes:
      - grafana-data:/var/lib/grafana
    depends_on:
      - prometheus
    restart: unless-stopped

volumes:
  redis-data:
  mongo-data:
  prometheus-data:
  grafana-data:
```

#### Expected Results

- ✅ Can run 4+ instances simultaneously
- ✅ Load balanced across instances
- ✅ Health checks prevent routing to unhealthy instances
- ✅ Prometheus metrics for monitoring
- ✅ Grafana dashboards for visualization
- ✅ Circuit breakers prevent cascade failures

---

## Instance Capacity Analysis

### T3.SMALL Capacity Analysis

**Specifications**:
```
vCPUs:        2 vCPUs (burstable)
RAM:          2 GB (2,048 MB)
Network:      Up to 5 Gbps
Baseline CPU: 20%
Burst:        100% (with credits)
CPU Credits:  24 credits/hour earned
Cost:         $15.18/month (On-Demand)
              $9.13/month (1-year Reserved)
```

**Memory Breakdown**:
```
Base System:
├─ Node.js runtime:        200 MB
├─ Express framework:      100 MB
├─ Mongoose (MongoDB):     50 MB
├─ WebSocket server:       30 MB
├─ Redis client:           20 MB
└─ OS + buffers:           400 MB
────────────────────────────────
Base memory usage:         800 MB

Per Call:
├─ VoiceSession object:    500 bytes
├─ Audio buffers:          500 KB
├─ Deepgram WebSocket:     100 KB
├─ Transcripts:            2 KB
└─ Overhead:               400 KB
────────────────────────────────
Per call memory:           ~1 MB

Available: 2,048 MB - 800 MB = 1,248 MB
Capacity: 1,248 MB / 1 MB = ~1,248 calls (theoretical)
```

**CPU Analysis**:
```
Per Call CPU Usage:
├─ WebSocket handling:     5%
├─ Audio buffering:        3%
├─ JSON parsing:           2%
└─ Database writes:        1%
────────────────────────────────
Total per call:            11% (misleading!)

Actual (I/O bound):
├─ Active processing:      3%
├─ Waiting on network:     0% (async)
────────────────────────────────
Real per call CPU:         ~3%

Sustained capacity: 0.4 vCPU / 0.03 = ~13 calls
Burst capacity:     2.0 vCPU / 0.03 = ~66 calls (temporary)
```

**CPU Credit Depletion**:
```
Scenario: 15 concurrent calls at 5% CPU each = 75% total

Hour 0:  144 credits (full), 75% CPU → spending 26 credits/hour
Hour 1:  118 credits, still smooth performance
Hour 2:  92 credits, slight latency increase
Hour 3:  66 credits, noticeable slowdown
Hour 4:  40 credits, calls taking 2× longer
Hour 5:  14 credits, severe degradation
Hour 6:  0 credits → CPU throttled to 20% → FAILURE

Recovery: 24 credits/hour when load drops
```

**Network Bandwidth**:
```
Per Call:
├─ Incoming audio (Exotel):     128 kbps
├─ Outgoing audio (Exotel):     128 kbps
├─ Deepgram STT upload:         ~1 MB over 3 min
├─ Deepgram TTS download:       ~3 MB over 3 min
└─ OpenAI LLM:                  ~5 KB
────────────────────────────────────────────
Total per 3-min call:           ~12 MB
Sustained rate:                 ~32 kbps

T3.SMALL capacity: 5 Gbps = 5,000 Mbps
Max calls:         5,000 / 0.032 = 156,250 (not a bottleneck)
```

**Real-World Limits**:
```
Factor                  Limit       Bottleneck?
────────────────────────────────────────────────
Memory                  1,248 calls  ❌ No
CPU (sustained)         13 calls     ⚠️ Soft limit
CPU (burst)             30 calls     ⚠️ Temporary
Network                 156k calls   ❌ No
Deepgram connections    20 calls     ✅ HARD LIMIT
Node.js WebSockets      10k calls    ❌ No
────────────────────────────────────────────────
REALISTIC CAPACITY:     8-10 calls   ✅ Safe
MAXIMUM BURST:          12-15 calls  ⚠️ Short term
```

### T3 Family Comparison

| Instance | vCPU | RAM | Baseline | On-Demand | Reserved | Safe Calls | Max Calls |
|----------|------|-----|----------|-----------|----------|------------|-----------|
| **t3.micro** | 2 | 1 GB | 10% | $7.59/mo | $4.56/mo | 3-4 | 6-8 |
| **t3.small** | 2 | 2 GB | 20% | $15.18/mo | $9.13/mo | **8-10** | **12-15** |
| **t3.medium** | 2 | 4 GB | 20% | $30.37/mo | $18.25/mo | 15-18 | 25-30 |
| **t3.large** | 2 | 8 GB | 30% | $60.74/mo | $36.50/mo | 30-35 | 50-60 |
| **t3.xlarge** | 4 | 16 GB | 40% | $121.47/mo | $73.00/mo | 60-70 | 100-120 |
| **c6i.large** | 2 | 4 GB | 100% | $62.78/mo | $37.70/mo | 20-25 | 30-35 |
| **c6i.xlarge** | 4 | 8 GB | 100% | $125.56/mo | $75.36/mo | 25-30 | 40-50 |

**Key Differences**:

**T3 (Burstable)**:
- ✅ Lower cost for variable workloads
- ✅ Good for development/testing
- ❌ CPU credits can deplete under sustained load
- ❌ Performance degrades after burst period

**C6i (Compute-Optimized)**:
- ✅ Consistent performance 24/7
- ✅ Better network (12.5 Gbps vs 5 Gbps)
- ✅ No burst credits to manage
- ❌ Higher cost (~2× t3 equivalent)
- ✅ Better for production sustained loads

---

## Production Recommendations

### Recommendation by Scale

#### 10 Concurrent Calls: Bootstrap Tier

**Setup**:
```
1× t3.small (1-year Reserved)
Priority 1 optimizations (queuing)
```

**Monthly Cost**:
```
EC2 (t3.small RI)         $9.13/month
Data Transfer (500 GB)    $45.00/month
EBS Storage (30 GB)       $3.00/month
────────────────────────────────────
TOTAL                     $57.13/month
Per call                  $5.71/month
```

**Pros**:
- ✅ Minimal cost
- ✅ Simple to manage (single instance)
- ✅ Adequate for MVP/testing

**Cons**:
- ❌ Single point of failure
- ❌ No redundancy
- ❌ Limited burst capacity

**Best for**: MVP, testing, small business, predictable load

---

#### 20 Concurrent Calls: Growth Tier

**Setup**:
```
1× t3.medium (1-year Reserved)
Priority 1 + 2 optimizations
```

**Monthly Cost**:
```
EC2 (t3.medium RI)        $18.25/month
Data Transfer (1 TB)      $90.00/month
EBS Storage (50 GB)       $5.00/month
────────────────────────────────────
TOTAL                     $113.25/month
Per call                  $5.66/month
```

**Pros**:
- ✅ 50% headroom (can handle spikes to 30 calls)
- ✅ Still simple single-instance architecture
- ✅ Low cost

**Cons**:
- ❌ Single point of failure
- ❌ Can't scale horizontally

**Best for**: Early customers, growing business, predictable growth

---

#### 50 Concurrent Calls: Scale Tier

**Setup**:
```
2× c6i.large (1-year Reserved)
Application Load Balancer
Redis (cache.t3.micro)
Priority 1 + 2 + 3 (partial)
```

**Monthly Cost**:
```
EC2 (2× c6i.large RI)     $75.36/month
Application Load Balancer $21.20/month
Redis (cache.t3.micro)    $11.52/month
Data Transfer (2.5 TB)    $225.00/month
EBS Storage (100 GB)      $10.00/month
────────────────────────────────────
TOTAL                     $343.08/month
Per call                  $6.86/month
```

**Pros**:
- ✅ High availability (redundancy)
- ✅ Can handle spikes to 70-80 calls
- ✅ Horizontal scaling ready
- ✅ Consistent performance (no burst limits)

**Cons**:
- ❌ More complex architecture
- ❌ Requires load balancer setup
- ❌ Higher cost

**Best for**: Established business, variable load, high availability needs

---

#### 100 Concurrent Calls: Enterprise Tier

**Setup**:
```
4× c6i.xlarge (Spot Instances)
Application Load Balancer
Redis (cache.m6g.large)
MongoDB Atlas M10
Full Priority 1 + 2 + 3
Auto Scaling (2-6 instances)
```

**Monthly Cost**:
```
EC2 (4× c6i.xlarge Spot)  $150.67/month
Application Load Balancer $31.20/month
Redis (cache.m6g.large)   $92.16/month
MongoDB Atlas (M10)       $57.00/month
Data Transfer (5 TB)      $450.00/month
Storage & Monitoring      $30.00/month
────────────────────────────────────
TOTAL                     $810.43/month
Per call                  $8.10/month
```

**Pros**:
- ✅ Enterprise-grade reliability
- ✅ Auto-scaling for cost optimization
- ✅ Comprehensive monitoring
- ✅ Circuit breakers for resilience
- ✅ Can handle 100-150 concurrent calls

**Cons**:
- ❌ Complex architecture
- ❌ Requires DevOps expertise
- ❌ Higher cost

**Best for**: High-volume operations, 24/7 business, enterprise clients

---

### Cost Optimization Strategies

#### 1. Reserved Instances (40% savings)
```
c6i.xlarge On-Demand:     $125.56/month
c6i.xlarge 1-Year RI:     $75.36/month
Savings:                  $50.20/month (40%)

Commitment: Pay upfront for 1 or 3 years
Best for: Predictable baseline capacity
```

#### 2. Spot Instances (70% savings)
```
c6i.xlarge On-Demand:     $125.56/month
c6i.xlarge Spot:          $37.67/month
Savings:                  $87.89/month (70%)

Risk: Can be terminated with 2-minute warning
Best for: Worker instances (not main servers)
Mitigation: Graceful shutdown handling
```

#### 3. Auto Scaling (30-50% savings)
```
Fixed: 6 instances × 24/7 = $749.95/month
Auto:  2-6 instances (avg 3.5) = $416.64/month
Savings:                       $333.31/month (44%)

Best for: Variable traffic patterns
Requirement: Clear peak/off-peak patterns
```

#### 4. ARM Graviton Instances (20% savings)
```
c6i.xlarge (x86):         $125.56/month
c6g.xlarge (ARM):         $100.45/month
Savings:                  $25.11/month (20%)

Requirement: ARM-compatible Docker images
Note: Node.js natively supports ARM ✅
```

#### 5. Data Transfer Optimization
```
Current: 5 TB/month = $450/month
With compression: 3 TB/month = $270/month
Savings:                       $180/month (40%)

Implementation:
- Enable WebSocket compression
- Use efficient audio codecs
- CDN for static assets
```

**Combined Savings Example (100 concurrent calls)**:
```
Baseline (all On-Demand):           $1,162.60/month
+ 1-Year Reserved Instances:        $961.70/month (-17%)
+ Spot for 2/4 instances:           $848.50/month (-27%)
+ Auto Scaling (off-peak):          $710.00/month (-39%)
+ Graviton (ARM):                   $650.00/month (-44%)
+ Data transfer optimization:       $540.00/month (-53%)
────────────────────────────────────────────────────────
Final optimized cost:               $540.00/month
Total savings:                      $622.60/month (53%)
```

---

### Complete Cost with API Costs

#### 100 Concurrent Calls - Full Breakdown

**Assumptions**:
```
Average call duration:     3 minutes
100 concurrent calls:      ~2,000 calls/hour
Operating hours:           12 hours/day
Daily calls:               24,000 calls
Monthly calls:             720,000 calls
Monthly minutes:           2,160,000 minutes
```

**AWS Infrastructure**:
```
EC2 (4× c6i.xlarge RI)    $301.34/month
Load Balancer             $31.20/month
Redis                     $92.16/month
MongoDB Atlas             $57.00/month
Data Transfer             $450.00/month
Storage & Monitoring      $30.00/month
────────────────────────────────────
Infrastructure Total      $961.70/month
```

**API Costs** (per 1,000 minutes):
```
Deepgram STT:             $12.00
OpenAI GPT-4o-mini:       $3.00
Deepgram TTS:             $15.00
────────────────────────────────────
Total per 1,000 minutes:  $30.00

Monthly (2,160,000 mins): $64,800.00
```

**Grand Total**:
```
Infrastructure:           $961.70/month
API Costs:                $64,800.00/month
────────────────────────────────────
TOTAL:                    $65,761.70/month

Per call:                 $0.09
Per minute:               $0.030
```

**Revenue Requirements**:
```
To break even at $65,761.70/month with 720,000 calls:
Minimum per call:         $0.09
Minimum per minute:       $0.03

Target pricing (40% margin):
Per call:                 $0.15
Per minute:               $0.05
Monthly revenue:          $108,000/month
```

---

## Next Steps

### Immediate Actions (This Week)

1. **Review and approve this plan**
   - Confirm target concurrent calls
   - Confirm budget constraints
   - Confirm timeline

2. **Set up AWS infrastructure**
   - Create AWS account (if needed)
   - Set up billing alerts
   - Create VPC and security groups

3. **Implement Priority 1 (3 days)**
   - Deepgram connection pool
   - TTS request queue
   - Webhook rate limiter
   - **Result**: Handle 20+ concurrent calls safely

### Short-term (2-4 Weeks)

4. **Implement Priority 2 (5 days)**
   - Redis session storage
   - Transcript batching
   - MongoDB indexes
   - **Result**: Enable horizontal scaling

5. **Load testing**
   - Simulate 20, 50, 100 concurrent calls
   - Identify bottlenecks
   - Optimize as needed

6. **Monitoring setup**
   - Health check endpoint
   - Prometheus metrics
   - Grafana dashboards

### Medium-term (1-3 Months)

7. **Implement Priority 3 (10 days)**
   - Load balancer configuration
   - Multi-instance deployment
   - Auto-scaling policies
   - Circuit breakers
   - **Result**: Enterprise-grade reliability

8. **Cost optimization**
   - Purchase Reserved Instances
   - Implement Spot for workers
   - Set up Auto Scaling
   - **Result**: 40-50% cost reduction

9. **Production deployment**
   - Staging environment testing
   - Gradual rollout
   - Monitor metrics

### Questions to Answer

Before implementation, please confirm:

1. **Target capacity**: 10, 20, 50, or 100+ concurrent calls?
2. **Budget**: Monthly infrastructure budget limit?
3. **Timeline**: When do you need production-ready system?
4. **Availability**: Single instance OK or need redundancy?
5. **Growth**: Expected growth rate over next 6-12 months?
6. **API plans**: Current Deepgram/ElevenLabs/OpenAI plan tiers?

---

## Appendix

### Architecture Diagram

```
┌──────────────────────────────────────────────────────────────┐
│                     CURRENT ARCHITECTURE                      │
└──────────────────────────────────────────────────────────────┘

Exotel Call
    │
    ▼
WebSocket (/ws/exotel/voice/:callLogId)
    │
    ▼
┌───────────────────────────────────────┐
│         Node.js Server (Single)        │
│  ┌─────────────────────────────────┐  │
│  │  ExotelVoiceHandler             │  │
│  │  - In-memory session Map        │  │
│  │  - Per-call VoiceSession        │  │
│  └─────────────────────────────────┘  │
└───────────┬───────────────────────────┘
            │
    ┌───────┴──────────┬─────────────┬──────────┐
    │                  │             │          │
    ▼                  ▼             ▼          ▼
Deepgram STT      OpenAI LLM   Deepgram TTS  MongoDB
(Live WS)         (GPT-4o-mini) (Streaming)  (Sessions)
20 conn limit     100 req/min   100 concurrent


┌──────────────────────────────────────────────────────────────┐
│               TARGET ARCHITECTURE (Priority 3)                │
└──────────────────────────────────────────────────────────────┘

Exotel Calls
    │
    ▼
┌──────────────────────────────┐
│  Application Load Balancer   │
│  (Least connections routing) │
└──────────┬───────────────────┘
           │
    ┌──────┴──────┬──────────┬──────────┐
    │             │          │          │
    ▼             ▼          ▼          ▼
┌────────┐   ┌────────┐ ┌────────┐ ┌────────┐
│Node.js │   │Node.js │ │Node.js │ │Node.js │
│Instance│   │Instance│ │Instance│ │Instance│
│  #1    │   │  #2    │ │  #3    │ │  #4    │
│(25 call│   │(25 call│ │(25 call│ │(25 call│
└───┬────┘   └───┬────┘ └───┬────┘ └───┬────┘
    │            │          │          │
    └────────────┴──────────┴──────────┘
                 │
         ┌───────┴────────┐
         │                │
    ┌────▼────┐     ┌─────▼──────┐
    │  Redis  │     │  MongoDB   │
    │ Session │     │  Atlas M10 │
    │ Storage │     │ (Managed)  │
    └────┬────┘     └─────┬──────┘
         │                │
         └────────┬───────┘
                  │
    ┌─────────────▼──────────────┐
    │   External API Managers    │
    ├────────────────────────────┤
    │ Deepgram Pool (20 conn)    │
    │ TTS Queue (per-provider)   │
    │ Circuit Breakers           │
    └────────────────────────────┘
```

### File Structure

```
backend/
├── src/
│   ├── config/
│   │   ├── db.ts                    # MongoDB connection (✅ exists)
│   │   ├── redis.ts                 # Redis connection (✅ exists)
│   │   └── env.ts
│   ├── middleware/
│   │   ├── callRateLimit.ts         # 🆕 Priority 1
│   │   ├── healthCheck.ts           # 🆕 Priority 3
│   │   └── metrics.ts               # 🆕 Priority 3
│   ├── services/
│   │   ├── deepgramConnectionPool.service.ts  # 🆕 Priority 1
│   │   ├── ttsQueue.service.ts                # 🆕 Priority 1
│   │   ├── sessionManager.service.ts          # 🆕 Priority 2
│   │   ├── transcriptBatcher.service.ts       # 🆕 Priority 2
│   │   ├── deepgram.service.ts      # ✏️ Modify
│   │   ├── elevenlabsTTS.service.ts # ✏️ Modify
│   │   └── voicePipeline.service.ts # ✏️ Modify
│   ├── websocket/
│   │   ├── handlers/
│   │   │   └── exotelVoice.handler.ts # ✏️ Modify heavily
│   │   └── websocket.server.ts      # ✏️ Modify
│   ├── utils/
│   │   └── circuitBreaker.ts        # 🆕 Priority 3
│   └── migrations/
│       └── add-indexes.ts           # 🆕 Priority 2
├── nginx.conf                        # 🆕 Priority 3
├── docker-compose.yml                # 🆕 Priority 3
└── prometheus.yml                    # 🆕 Priority 3

docs/
└── ENTERPRISE_CONCURRENCY_IMPLEMENTATION_PLAN.md # This file
```

### Glossary

- **Concurrent Calls**: Number of active phone calls happening simultaneously
- **Burst Capacity**: Temporary ability to handle more load (T3 CPU credits)
- **Horizontal Scaling**: Adding more server instances (vs vertical = bigger instance)
- **Circuit Breaker**: Pattern to prevent cascade failures by failing fast
- **Rate Limiting**: Restricting number of requests to prevent overload
- **Connection Pool**: Reusing limited resources (Deepgram connections)
- **Queue**: Waiting line for requests when at capacity
- **Session Storage**: Where call state is kept (memory vs Redis)
- **Load Balancer**: Distributes traffic across multiple servers
- **Auto Scaling**: Automatically add/remove servers based on load
- **Reserved Instance**: Pre-paid AWS instance for 1-3 years (40% discount)
- **Spot Instance**: Spare AWS capacity at 70% discount (can be terminated)
- **Prometheus**: Time-series database for metrics
- **Grafana**: Dashboard for visualizing metrics

---

**Document End**

For questions or clarifications, please contact the implementation team.
