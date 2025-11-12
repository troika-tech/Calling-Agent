# API Cost Analysis - Voice Calling Agent

## Executive Summary

This document provides a detailed breakdown of API costs for different service provider combinations used in our voice calling agent system.

**Current Configuration:** GPT-4o-mini + Deepgram Flux + Google Wavenet
**Cost per minute:** $0.009525
**Cost per hour:** $0.57

---

## Cost Assumptions

### Typical 1-Minute Conversation Pattern

- **User speaks:** ~15 seconds per turn
- **AI responds:** ~15 seconds per turn
- **Conversation turns:** ~2 per minute

### Per Turn Estimates

- **User speech:** 30-40 words (~150-200 characters)
- **AI response:** 30-40 words (~150-200 characters)
- **LLM tokens:** ~300 tokens total (150 prompt + 150 completion)
- **Characters per minute:** ~400 (2 AI responses × 200 chars)

---

## Setup 1: GPT-4o-mini + Deepgram Flux + Google Wavenet

### Component Breakdown

#### Speech-to-Text (Deepgram Flux)
- **Model:** Flux (Conversational speech recognition)
- **Price:** $0.0077 per minute
- **Features:**
  - Built-in turn detection
  - Natural interruption handling
  - Ultra-low latency
  - Purpose-built for real-time voice agents
- **Cost per minute:** $0.0077

#### Language Model (OpenAI GPT-4o-mini)
- **Model:** gpt-4o-mini
- **Pricing:**
  - Input tokens: $0.15 per 1M tokens
  - Output tokens: $0.60 per 1M tokens
- **Usage per minute:** ~600 tokens (300 prompt + 300 completion)
- **Calculation:**
  ```
  Input:  (300 tokens × $0.15) / 1,000,000 = $0.000045
  Output: (300 tokens × $0.60) / 1,000,000 = $0.00018
  Total:                                     $0.000225
  ```
- **Cost per minute:** $0.000225

#### Text-to-Speech (Google Wavenet)
- **Model:** WaveNet voices
- **Price:** $0.000004 per character ($4 per 1M characters)
- **Usage per minute:** ~400 characters (2 AI responses × 200 chars)
- **Calculation:**
  ```
  400 characters × $0.000004 = $0.0016
  ```
- **Cost per minute:** $0.0016

### Total Cost - Setup 1

| Component | Cost/min | Percentage |
|-----------|----------|------------|
| STT (Flux) | $0.0077 | 80.8% |
| LLM (GPT-4o-mini) | $0.000225 | 2.4% |
| TTS (Wavenet) | $0.0016 | 16.8% |
| **TOTAL** | **$0.009525** | **100%** |

**Cost per hour:** $0.57
**Cost per 100 minutes:** $0.95
**Cost per 1000 minutes:** $9.53

---

## Setup 2: GPT-4o-mini + Deepgram Nova-3 + Google Wavenet

### Component Breakdown

#### Speech-to-Text (Deepgram Nova-3 Monolingual)
- **Model:** Nova-3 (Monolingual)
- **Price:** $0.0077 per minute
- **Features:**
  - Highest performing general-purpose model
  - Handles background noise, crosstalk, far-field audio
  - Good for multiple languages (monolingual pricing)
- **Cost per minute:** $0.0077

#### Language Model (OpenAI GPT-4o-mini)
- Same as Setup 1
- **Cost per minute:** $0.000225

#### Text-to-Speech (Google Wavenet)
- Same as Setup 1
- **Cost per minute:** $0.0016

### Total Cost - Setup 2

| Component | Cost/min | Percentage |
|-----------|----------|------------|
| STT (Nova-3) | $0.0077 | 80.8% |
| LLM (GPT-4o-mini) | $0.000225 | 2.4% |
| TTS (Wavenet) | $0.0016 | 16.8% |
| **TOTAL** | **$0.009525** | **100%** |

**Cost per hour:** $0.57
**Cost per 100 minutes:** $0.95
**Cost per 1000 minutes:** $9.53

---

## Setup 3: GPT-4o-mini + Deepgram Nova-3 Multilingual + Google Wavenet

### Component Breakdown

#### Speech-to-Text (Deepgram Nova-3 Multilingual)
- **Model:** Nova-3 (Multilingual)
- **Price:** $0.0092 per minute
- **Features:**
  - Supports multiple languages automatically
  - Highest performing model for multilingual use cases
  - Handles background noise, crosstalk, far-field audio
- **Cost per minute:** $0.0092

#### Language Model (OpenAI GPT-4o-mini)
- Same as Setup 1 & 2
- **Cost per minute:** $0.000225

#### Text-to-Speech (Google Wavenet)
- Same as Setup 1 & 2
- **Cost per minute:** $0.0016

### Total Cost - Setup 3

| Component | Cost/min | Percentage |
|-----------|----------|------------|
| STT (Nova-3 Multi) | $0.0092 | 83.4% |
| LLM (GPT-4o-mini) | $0.000225 | 2.0% |
| TTS (Wavenet) | $0.0016 | 14.5% |
| **TOTAL** | **$0.011025** | **100%** |

**Cost per hour:** $0.66
**Cost per 100 minutes:** $1.10
**Cost per 1000 minutes:** $11.03

**Extra cost vs Setup 1:** +$0.0015/min (+15.7%)

---

## Side-by-Side Comparison

| Metric | Setup 1 (Flux) | Setup 2 (Nova-3 Mono) | Setup 3 (Nova-3 Multi) |
|--------|----------------|------------------------|-------------------------|
| **STT Model** | Flux | Nova-3 Mono | Nova-3 Multi |
| **STT Cost** | $0.0077 | $0.0077 | $0.0092 |
| **LLM Cost** | $0.000225 | $0.000225 | $0.000225 |
| **TTS Cost** | $0.0016 | $0.0016 | $0.0016 |
| **Total/min** | **$0.009525** | **$0.009525** | **$0.011025** |
| **Total/hour** | **$0.57** | **$0.57** | **$0.66** |
| **Total/100min** | **$0.95** | **$0.95** | **$1.10** |

---

## Key Insights

### 1. STT Dominates Total Cost
- Speech-to-Text accounts for **80-83%** of total API costs
- Optimizing STT provider/model has the biggest cost impact
- LLM and TTS are relatively minor expenses

### 2. LLM Cost is Negligible
- GPT-4o-mini costs only **2-2.4%** of total
- Even with longer responses, LLM remains cheapest component
- Can upgrade to more powerful models without major cost impact

### 3. Google Wavenet is Very Cost-Effective
- TTS costs only **14-17%** of total
- Significantly cheaper than alternatives:
  - ElevenLabs Turbo: $0.30 per 1K chars = $0.12/min (7.5x more expensive)
  - OpenAI TTS: $15 per 1M chars = $0.006/min (3.75x more expensive)
  - Deepgram Aura: $0.015 per 1K chars = $0.006/min (3.75x more expensive)

### 4. Flux vs Nova-3 Monolingual
- **Same price** ($0.0077/min)
- **Flux advantages:**
  - Built-in turn detection
  - Natural interruption handling
  - Lower latency
  - Purpose-built for voice agents
- **Nova-3 advantages:**
  - Better for noisy environments
  - More robust general-purpose transcription

### 5. Multilingual Support Cost
- Adding multilingual support: **+$0.0015/min** (+15.7%)
- Only switch to Nova-3 Multilingual when needed
- Consider dynamic model selection based on language detection

---

## Cost Projections

### Monthly Costs (30 days)

| Usage Volume | Setup 1 & 2 | Setup 3 (Multi) |
|--------------|-------------|-----------------|
| **1 hour/day** | $17.10 | $19.80 |
| **5 hours/day** | $85.50 | $99.00 |
| **10 hours/day** | $171.00 | $198.00 |
| **24 hours/day** | $410.40 | $475.20 |

### Per Call Costs (Average 5-minute call)

| Setup | Cost per 5-min call |
|-------|---------------------|
| Setup 1 (Flux) | $0.048 |
| Setup 2 (Nova-3 Mono) | $0.048 |
| Setup 3 (Nova-3 Multi) | $0.055 |

### Break-even Analysis

For **100 calls per day** (5 min avg):
- Setup 1/2: $4.76/day = $142.80/month
- Setup 3: $5.51/day = $165.30/month

---

## Alternative Provider Comparisons

### STT Alternatives

| Provider/Model | Price/min | vs Current | Notes |
|----------------|-----------|------------|-------|
| **Deepgram Flux** | $0.0077 | Baseline | Best for voice agents |
| **Deepgram Nova-3 Mono** | $0.0077 | Same | Best for noisy audio |
| **Deepgram Nova-3 Multi** | $0.0092 | +19% | Required for multilingual |
| Deepgram Nova-2 | $0.0058 | -25% | Older model, less accurate |
| Deepgram Enhanced | $0.0165 | +114% | Overkill for real-time |
| OpenAI Whisper | $0.006 | -22% | Slower, batch-only |

### TTS Alternatives

| Provider/Model | Price/min* | vs Current | Notes |
|----------------|------------|------------|-------|
| **Google Wavenet** | $0.0016 | Baseline | Best value |
| OpenAI TTS-1 | $0.006 | +275% | Good quality |
| Deepgram Aura | $0.006 | +275% | Streaming optimized |
| ElevenLabs Turbo | $0.12 | +7400% | Premium quality, expensive |

*Based on 400 characters/minute

### LLM Alternatives

| Provider/Model | Price/min* | vs Current | Notes |
|----------------|-----------|------------|-------|
| **GPT-4o-mini** | $0.000225 | Baseline | Best value |
| Claude Haiku | $0.000248 | +10% | Faster responses |
| GPT-4o | $0.00183 | +713% | Higher quality |
| GPT-4 | $0.0061 | +2611% | Overkill for most cases |

*Based on 600 tokens/minute (300 in, 300 out)

---

## Recommendations

### For English-Only Use Cases
**Use Setup 1: GPT-4o-mini + Deepgram Flux + Google Wavenet**
- **Why:** Flux is optimized for voice agents at the same price as Nova-3
- **Cost:** $0.009525/min ($0.57/hour)
- **Benefits:** Better turn detection, interruption handling, lower latency

### For Multilingual Use Cases
**Use Setup 3: GPT-4o-mini + Deepgram Nova-3 Multilingual + Google Wavenet**
- **Why:** Only option that supports multiple languages
- **Cost:** $0.011025/min ($0.66/hour)
- **Extra cost:** +$0.0015/min (+15.7%)

### For Budget-Constrained Scenarios
**Option A:** Switch STT to Deepgram Nova-2 + Wavenet
- **Cost:** $0.0074/min ($0.44/hour)
- **Savings:** -22% vs current
- **Tradeoff:** Older model, slightly less accurate

**Option B:** Switch STT to OpenAI Whisper + Wavenet
- **Cost:** $0.0076/min ($0.46/hour)
- **Savings:** -20% vs current
- **Tradeoff:** Batch-only, higher latency, not suitable for real-time

### For Premium Quality
**Keep current setup, upgrade TTS to ElevenLabs Turbo**
- **Cost:** $0.128/min ($7.68/hour)
- **Increase:** +1244% total cost
- **Why:** Significantly better voice quality and naturalness
- **Use case:** High-value customers, brand-critical interactions

---

## Implementation Notes

### Current Configuration
**File:** `backend/src/services/deepgram.service.ts`
- Line 59: Model set to `flux`
- Line 123: Live connection model set to `flux`

### Dynamic Model Selection (Future Enhancement)
```typescript
// Switch between Flux (English) and Nova-3 Multi (other languages)
const model = options?.language === 'en' ? 'flux' : 'nova-3';
```

This allows:
- English calls use Flux ($0.0077/min) - optimized for agents
- Non-English calls use Nova-3 Multilingual ($0.0092/min)
- Automatic cost optimization based on language

### Cost Tracking Implementation
See main analysis document for implementing real-time cost tracking per call.

---

## Pricing Sources & Last Updated

- **Deepgram Pricing:** As of November 2024
- **OpenAI Pricing:** As of November 2024
- **Google Cloud TTS Pricing:** As of November 2024

**Note:** API pricing may change. Always verify current rates before major deployment decisions.

---

## Document Version
- **Version:** 1.0
- **Created:** November 6, 2025
- **Last Updated:** November 6, 2025
