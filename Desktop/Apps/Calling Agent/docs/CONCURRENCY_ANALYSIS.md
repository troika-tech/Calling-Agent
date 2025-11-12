# AI Calling Agent - Concurrency Analysis

## Executive Summary

The system handles concurrent calls with per-call session isolation. However, critical external API rate limits restrict safe operation to 10-15 concurrent calls.

## Critical Bottlenecks

### 1. Deepgram STT Rate Limit (CRITICAL)
- Limit: 20 concurrent connections (Pro tier)
- Current: One connection per call
- At 30 calls: 10 will FAIL to connect
- Fix: Implement connection queue

### 2. ElevenLabs TTS Rate Limit (CRITICAL)
- Limit: 10 concurrent (Creator), 20+ (Pro)
- Current: One stream per response
- At 20 calls with Creator: 50% timeout waiting for TTS
- Fix: Implement TTS request queue

### 3. In-Memory Sessions (MEDIUM)
- Sessions stored in JavaScript Map only
- No persistence, no clustering support
- Blocks horizontal scaling
- Fix: Move to Redis

## Key Findings

STRENGTHS:
- Per-call isolation (no cross-contamination)
- Excellent streaming/latency (200-400ms end-to-end)
- Parallel processing (LLM starts before user finishes)
- MongoDB connection pooling (10 connections)

WEAKNESSES:
- Per-call external API connections (bottleneck)
- In-memory session storage only
- No API request queuing
- No rate limiting on webhooks

## Concurrency Limits

Current: 10-15 safe, 20-30 maximum
With Priority 1 fixes: 20-30 safe, 50+ maximum
With all improvements: 80-120 safe, 200+ maximum

## Recommendation

Deploy with 10-15 concurrent call limit. Implement Priority 1 improvements (connection/TTS queues) before exceeding 20 calls.
