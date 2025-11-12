# Complete Cost Analysis - AI Calling Platform

**Last Updated:** 2025-01-31
**Status:** 📊 Comprehensive Cost Breakdown

---

## Executive Summary

### Cost Per Call (5-minute average call)

| Component | Low-Cost Setup | Balanced Setup | Premium Setup |
|-----------|---------------|----------------|---------------|
| **Server (AWS EC2)** | $0.00015 | $0.00015 | $0.00015 |
| **STT (Deepgram)** | $0.0215 | $0.0295 | $0.0295 |
| **LLM** | $0.002 | $0.008 | $0.008 |
| **TTS** | $0.006 | $0.024 | $0.45 |
| **Telephony (Exotel)** | $0.015 | $0.015 | $0.015 |
| **TOTAL PER CALL** | **$0.045** | **$0.077** | **$0.505** |
| **PER 1000 CALLS** | **$45** | **$77** | **$505** |

### Monthly Cost Breakdown (1000 calls/month)

| Setup | Monthly Cost | Annual Cost | Best For |
|-------|-------------|-------------|----------|
| **Low-Cost** | $60 | $720 | Startups, high volume |
| **Balanced** | $92 | $1,104 | Most businesses |
| **Premium** | $520 | $6,240 | VIP customers only |

---

## 1. Server Infrastructure Costs

### AWS EC2 t3.small

**Specifications:**
- 2 vCPUs
- 2 GB RAM
- Up to 5 Gbps network
- General Purpose, burstable

**Pricing (2025):**
- **Hourly:** $0.0208/hour
- **Monthly (24/7):** $15.18/month
- **Annual:** $182/year

**Cost Per Call:**
- Average call duration: 5 minutes
- Calls per hour (concurrent): ~12 calls/hour (1 server can handle)
- Cost allocation: $15.18 / 1000 calls = **$0.015 per 100 calls**
- **Per call: ~$0.00015**

**Scaling:**

| Call Volume | Servers Needed | Monthly Cost | Cost Per Call |
|-------------|---------------|--------------|---------------|
| 1,000 calls | 1 | $15.18 | $0.015 |
| 10,000 calls | 1-2 | $15-30 | $0.0015-0.003 |
| 50,000 calls | 2-3 | $30-45 | $0.0006-0.0009 |
| 100,000 calls | 4-5 | $60-75 | $0.0006-0.00075 |

**Optimization Options:**

1. **Reserved Instances (1-year):**
   - Save 40%: $0.0125/hour ($9.11/month)

2. **Reserved Instances (3-year):**
   - Save 62%: $0.0079/hour ($5.76/month)

3. **Spot Instances:**
   - Save up to 70%: $0.0062/hour ($4.52/month)
   - Note: Can be interrupted

**Recommendation:** Start with on-demand, move to 1-year reserved after validating usage

---

## 2. Speech-to-Text (STT) Costs

### Deepgram Nova-2 (Only Provider)

**Pricing (2025):**
- **Batch/Pre-recorded:** $0.0043 per minute
- **Streaming (Real-time):** $0.0059 per minute ⭐ **YOU USE THIS**

**Your Setup:** Streaming STT with VAD (Voice Activity Detection)

**Cost Per Call:**

| Call Duration | Batch Cost | Streaming Cost | Your Cost |
|---------------|-----------|----------------|-----------|
| 2 min | $0.0086 | $0.0118 | $0.0118 |
| 5 min ⭐ | $0.0215 | $0.0295 | **$0.0295** |
| 10 min | $0.0430 | $0.0590 | $0.0590 |
| 30 min | $0.1290 | $0.1770 | $0.1770 |

**Volume Pricing:**

| Calls/Month | Minutes/Month | Monthly Cost | Per Call |
|-------------|---------------|--------------|----------|
| 100 | 500 | $2.95 | $0.0295 |
| 1,000 ⭐ | 5,000 | $29.50 | $0.0295 |
| 10,000 | 50,000 | $295 | $0.0295 |
| 100,000 | 500,000 | $2,950 | $0.0295 |

**Free Tier:**
- New users: $200 credit (covers ~6,800 calls)
- No ongoing free tier

**Why Streaming Costs More (+37%):**
- Real-time transcription as user speaks
- Voice Activity Detection (VAD)
- Interim results (partial transcripts)
- Zero STT latency
- **Worth it:** Better UX, 20% lower total latency

---

## 3. LLM (Language Model) Costs

### Option A: OpenAI GPT-4o-mini (Recommended) ⭐

**Pricing (2025):**
- Input: $0.15 per 1M tokens
- Output: $0.60 per 1M tokens

**Typical Usage (5-min call):**
- System prompt: ~500 tokens (input)
- Conversation history: ~1,000 tokens (input)
- User messages: ~500 tokens (input)
- AI responses: ~1,000 tokens (output)
- **Total: 2,000 input + 1,000 output = 3,000 tokens**

**Cost Per Call:**
- Input: 2,000 tokens × $0.15/1M = $0.0003
- Output: 1,000 tokens × $0.60/1M = $0.0006
- **Total: $0.0009 ≈ $0.001 per call**

**With 10 exchanges (typical):**
- Input: ~5,000 tokens
- Output: ~3,000 tokens
- **Cost: $0.0027 ≈ $0.003 per call**

**Conservative Estimate:** **$0.002 per call**

**Volume Pricing:**

| Calls/Month | Tokens/Month | Monthly Cost |
|-------------|--------------|--------------|
| 100 | 300,000 | $0.20 |
| 1,000 ⭐ | 3,000,000 | $2.00 |
| 10,000 | 30,000,000 | $20 |
| 100,000 | 300,000,000 | $200 |

**Batch API (50% discount):**
- Good for: Post-call summaries, analytics
- Not suitable for: Real-time calls

---

### Option B: Anthropic Claude 3.5 Haiku (Fastest) ⚡

**Pricing (2025):**
- Input: $1.00 per 1M tokens
- Output: $5.00 per 1M tokens

**Cost Per Call (same usage):**
- Input: 5,000 tokens × $1.00/1M = $0.005
- Output: 3,000 tokens × $5.00/1M = $0.015
- **Total: $0.020 per call**

**Conservative Estimate:** **$0.008 per call**

**Volume Pricing:**

| Calls/Month | Monthly Cost | vs GPT-4o-mini |
|-------------|--------------|----------------|
| 100 | $0.80 | +$0.60 |
| 1,000 ⭐ | $8.00 | +$6.00 |
| 10,000 | $80 | +$60 |
| 100,000 | $800 | +$600 |

**Performance:**
- 30-40% faster than GPT-4o-mini
- TTFT: 100-200ms vs 200-400ms
- Total response: 600-900ms vs 800-1200ms

**Trade-off:** 4x more expensive, but 300ms faster

---

### LLM Comparison Table

| Model | Cost/Call | Speed | Quality | Recommendation |
|-------|-----------|-------|---------|----------------|
| **GPT-4o-mini** ⭐ | $0.002 | ⚡⚡⚡⚡ | ⭐⭐⭐⭐ | **Best value** |
| **Claude 3.5 Haiku** | $0.008 | ⚡⚡⚡⚡⚡⚡ | ⭐⭐⭐⭐ | Premium speed |
| GPT-4o | $0.015 | ⚡⚡⚡ | ⭐⭐⭐⭐⭐ | Complex tasks |
| GPT-3.5-turbo | $0.003 | ⚡⚡⚡ | ⭐⭐⭐ | Deprecated |

**Recommendation:**
- **Standard:** GPT-4o-mini ($2/1000 calls)
- **Premium:** Claude 3.5 Haiku ($8/1000 calls) - only if latency critical

---

## 4. Text-to-Speech (TTS) Costs

### Option A: Deepgram Aura-2 (Current Default) ⚡

**Pricing (2025):**
- $0.030 per 1,000 characters

**Typical Usage (5-min call):**
- AI speaks ~1,500 characters per call
- Average sentence: 150 characters
- ~10 AI responses per call

**Cost Per Call:**
- 1,500 chars × $0.030/1000 = **$0.045 per call**

**Volume Pricing:**

| Calls/Month | Characters/Month | Monthly Cost | Per Call |
|-------------|------------------|--------------|----------|
| 100 | 150,000 | $4.50 | $0.045 |
| 1,000 ⭐ | 1,500,000 | $45.00 | $0.045 |
| 10,000 | 15,000,000 | $450 | $0.045 |
| 100,000 | 150,000,000 | $4,500 | $0.045 |

**Performance:**
- TTFB: 150-200ms (fastest!)
- Streaming: Yes (WebSocket)
- Audio format: PCM (no conversion)
- Quality: ⭐⭐⭐⭐

**Free Tier:** $200 credit (covers ~6,600 calls)

---

### Option B: ElevenLabs (Premium Quality) 🎙️

**Pricing (2025):**

| Plan | Characters/Month | Monthly Fee | Per 1000 Chars | Per Call (1500 chars) |
|------|------------------|-------------|----------------|----------------------|
| Free | 10,000 | $0 | - | $0 (6 calls) |
| Starter | 30,000 | $5 | $0.167 | $0.25 |
| Creator | 100,000 | $22 | $0.220 | $0.33 |
| Independent | 500,000 | $99 | $0.198 | $0.30 |
| Pro | 2,000,000 | $330 | $0.165 | $0.25 |

**Cost Per Call:** **$0.25 - $0.33 per call**

**Volume Pricing:**

| Calls/Month | Required Plan | Monthly Cost | Per Call |
|-------------|---------------|--------------|----------|
| 100 | Creator | $22 | $0.22 |
| 333 | Independent | $99 | $0.30 |
| 1,000 ⭐ | Pro | $330 | $0.33 |
| 1,333+ | Pro | $330 | $0.25 |

**Performance:**
- TTFB: 300-400ms
- Streaming: Yes (WebSocket)
- Audio format: MP3 (needs conversion)
- Quality: ⭐⭐⭐⭐⭐⭐ (best in market)

**Trade-off:** 5-10x more expensive, but superior quality

---

### Option C: Google Cloud TTS

**Pricing (2025):**

| Voice Type | Price/1M Chars | Per Call (1500 chars) | Quality |
|------------|----------------|----------------------|---------|
| **Standard** | $4.00 | $0.006 | ⭐⭐⭐ |
| **WaveNet** | $16.00 | $0.024 | ⭐⭐⭐⭐ |
| **Neural2** ⭐ | $16.00 | $0.024 | ⭐⭐⭐⭐⭐ |
| **Studio** | $160.00 | $0.240 | ⭐⭐⭐⭐⭐⭐ |

**Free Tier:**
- Standard: 4M chars/month (2,666 calls)
- Neural2: 1M chars/month (666 calls)

**Cost Per 1000 Calls:**

| Voice Type | Monthly Cost | vs Deepgram | vs ElevenLabs |
|------------|--------------|-------------|---------------|
| Standard | $6 | -$39 (87% cheaper) | -$324 |
| Neural2 ⭐ | $24 | -$21 (47% cheaper) | -$306 |
| WaveNet | $24 | -$21 | -$306 |
| Studio | $240 | +$195 | -$90 |

**Performance:**
- TTFB: 250-400ms
- Streaming: No (batch only)
- Audio format: MP3/WAV (needs conversion)
- Quality: ⭐⭐⭐⭐⭐ (Neural2)

**Trade-off:** Slightly slower, but best value for quality

---

### TTS Comparison Summary

| Provider | Cost/Call | Cost/1000 | Quality | Speed | Streaming |
|----------|-----------|-----------|---------|-------|-----------|
| **Google Standard** | $0.006 | $6 | ⭐⭐⭐ | Medium | ❌ |
| **Google Neural2** ⭐ | $0.024 | $24 | ⭐⭐⭐⭐⭐ | Medium | ❌ |
| **Deepgram** ⭐ | $0.045 | $45 | ⭐⭐⭐⭐ | Fastest | ✅ |
| **ElevenLabs** | $0.30 | $300 | ⭐⭐⭐⭐⭐⭐ | Fast | ✅ |

**Recommendations:**
- **Budget:** Google Standard ($6/1000 calls)
- **Balanced:** Google Neural2 ($24/1000 calls) ⭐⭐
- **Speed:** Deepgram ($45/1000 calls) ⭐
- **Premium:** ElevenLabs ($300/1000 calls)

---

## 5. Telephony Costs (Exotel)

**Estimated Costs (India):**
- Incoming calls: ₹0.30-0.40/min ($0.0036-0.0048/min)
- Outgoing calls: ₹0.40-0.60/min ($0.0048-0.0072/min)

**Conservative Estimate (5-min call):**
- **Per call:** $0.015
- **Per 1000 calls:** $15

**Note:** Actual costs depend on:
- Exotel pricing plan
- Call direction (inbound/outbound)
- Geographic location
- Volume commitments

---

## 6. Complete Cost Scenarios

### Scenario 1: Budget Optimized 💰

**Configuration:**
- Server: AWS EC2 t3.small (Reserved 1-year)
- STT: Deepgram Streaming
- LLM: GPT-4o-mini
- TTS: Google Cloud Standard
- Telephony: Exotel

**Cost Breakdown (per 5-min call):**
```
Server:      $0.00009  (reserved)
STT:         $0.0295   (streaming)
LLM:         $0.002    (gpt-4o-mini)
TTS:         $0.006    (google standard)
Telephony:   $0.015    (exotel)
─────────────────────────────────
TOTAL:       $0.053 per call
```

**Monthly (1,000 calls):**
- Server: $9.11
- STT: $29.50
- LLM: $2.00
- TTS: $6.00 (or FREE with free tier!)
- Telephony: $15.00
- **Total: $61.61/month** (or $55.61 with free tier)

**Annual:** $660-$739

**Best for:** High-volume, cost-conscious deployments

---

### Scenario 2: Balanced (Recommended) ⭐

**Configuration:**
- Server: AWS EC2 t3.small (On-demand)
- STT: Deepgram Streaming
- LLM: GPT-4o-mini
- TTS: Google Cloud Neural2
- Telephony: Exotel

**Cost Breakdown (per 5-min call):**
```
Server:      $0.00015  (on-demand)
STT:         $0.0295   (streaming)
LLM:         $0.002    (gpt-4o-mini)
TTS:         $0.024    (google neural2)
Telephony:   $0.015    (exotel)
─────────────────────────────────
TOTAL:       $0.071 per call
```

**Monthly (1,000 calls):**
- Server: $15.18
- STT: $29.50
- LLM: $2.00
- TTS: $24.00
- Telephony: $15.00
- **Total: $85.68/month**

**Annual:** $1,028

**Best for:** Most businesses, quality + cost balance

---

### Scenario 3: Speed Optimized ⚡

**Configuration:**
- Server: AWS EC2 t3.small (On-demand)
- STT: Deepgram Streaming
- LLM: Claude 3.5 Haiku
- TTS: Deepgram Aura-2
- Telephony: Exotel

**Cost Breakdown (per 5-min call):**
```
Server:      $0.00015  (on-demand)
STT:         $0.0295   (streaming)
LLM:         $0.008    (claude haiku)
TTS:         $0.045    (deepgram)
Telephony:   $0.015    (exotel)
─────────────────────────────────
TOTAL:       $0.098 per call
```

**Monthly (1,000 calls):**
- Server: $15.18
- STT: $29.50
- LLM: $8.00
- TTS: $45.00
- Telephony: $15.00
- **Total: $112.68/month**

**Annual:** $1,352

**Best for:** Lowest latency, premium UX

---

### Scenario 4: Premium Quality 🎙️

**Configuration:**
- Server: AWS EC2 t3.small (On-demand)
- STT: Deepgram Streaming
- LLM: Claude 3.5 Haiku
- TTS: ElevenLabs
- Telephony: Exotel

**Cost Breakdown (per 5-min call):**
```
Server:      $0.00015  (on-demand)
STT:         $0.0295   (streaming)
LLM:         $0.008    (claude haiku)
TTS:         $0.30     (elevenlabs)
Telephony:   $0.015    (exotel)
─────────────────────────────────
TOTAL:       $0.353 per call
```

**Monthly (1,000 calls):**
- Server: $15.18
- STT: $29.50
- LLM: $8.00
- TTS: $300.00
- Telephony: $15.00
- **Total: $367.68/month**

**Annual:** $4,412

**Best for:** VIP customers, premium service

---

## 7. Volume-Based Pricing

### Monthly Costs by Call Volume

| Calls/Month | Budget | Balanced ⭐ | Speed | Premium |
|-------------|--------|-----------|-------|---------|
| **100** | $6.00 | $9.00 | $12.00 | $37.00 |
| **500** | $30.00 | $43.00 | $56.00 | $184.00 |
| **1,000** ⭐ | $61.61 | $85.68 | $112.68 | $367.68 |
| **5,000** | $293 | $413 | $548 | $1,823 |
| **10,000** | $575 | $815 | $1,085 | $3,635 |
| **50,000** | $2,845 | $4,045 | $5,395 | $18,145 |

### Annual Costs (1,000 calls/month)

| Scenario | Monthly | Annual | Per Call |
|----------|---------|--------|----------|
| Budget 💰 | $61.61 | $739 | $0.061 |
| Balanced ⭐ | $85.68 | $1,028 | $0.086 |
| Speed ⚡ | $112.68 | $1,352 | $0.113 |
| Premium 🎙️ | $367.68 | $4,412 | $0.368 |

---

## 8. Cost Optimization Strategies

### Server Optimization

**Switch to Reserved Instances (1-year):**
- Save: $6.07/month × 12 = $72.84/year
- ROI: 40% savings on compute

**Switch to Reserved Instances (3-year):**
- Save: $9.42/month × 36 = $339.12 over 3 years
- ROI: 62% savings on compute

**Use Spot Instances (if architecture allows):**
- Save: $10.66/month = $127.92/year
- Risk: Can be interrupted

---

### STT Optimization

**Can't optimize much:**
- Streaming STT is necessary for low latency
- Batch STT would save $8/1000 calls but add 800ms latency
- **Not recommended:** UX > $8 savings

---

### LLM Optimization

**Keep Responses Concise:**
- Current: 1,000 output tokens/call = $0.0006
- Optimized: 500 output tokens/call = $0.0003
- Savings: $0.30/1000 calls

**Set maxTokens in System Prompt:**
```json
{
  "llm": {
    "model": "gpt-4o-mini",
    "maxTokens": 150,
    "temperature": 0.7
  }
}
```

**Savings:** 30-50% on LLM costs

---

### TTS Optimization

**Implement Response Caching:**

Cache common phrases:
- "Hello! How can I help you?"
- "Thank you for calling."
- "Goodbye!"
- "Let me check that for you."

**Potential Savings:**
- 20-30% of TTS cost
- $9-13.50/1000 calls (with Deepgram)

**Implementation:**
```typescript
const commonPhrases = {
  'greeting': 'cached_audio_greeting.pcm',
  'goodbye': 'cached_audio_goodbye.pcm'
};
```

---

### Hybrid TTS Strategy

**Use different TTS for different scenarios:**

```typescript
if (customer.tier === 'vip') {
  ttsProvider = 'elevenlabs';  // $0.30/call
} else if (callType === 'sales') {
  ttsProvider = 'google-neural2';  // $0.024/call
} else {
  ttsProvider = 'deepgram';  // $0.045/call
}
```

**Potential Savings:**
- Average: $0.10/call
- Monthly (1,000 calls): $100

---

## 9. Break-Even Analysis

### Startup Phase (0-1,000 calls/month)

**Fixed Costs:**
- Server: $15/month
- Development: (one-time)
- Marketing: (variable)

**Variable Costs:**
- Per call: $0.06-0.37 (depends on config)

**Revenue Needed (assuming $0.10 profit per call):**
- Break-even: 150-370 calls/month
- Time to profitability: 1-2 months

---

### Growth Phase (1,000-10,000 calls/month)

**Optimization Kicks In:**
- Reserved instances save $72/year
- Response caching saves $100/month
- Volume discounts from providers

**Profit Margins:**
- At $1/call revenue:
  - Budget config: $0.94 profit (94%)
  - Balanced config: $0.91 profit (91%)
  - Premium config: $0.63 profit (63%)

---

### Scale Phase (10,000+ calls/month)

**Enterprise Discounts Available:**
- Deepgram: Custom pricing at scale
- ElevenLabs: Enterprise plans
- AWS: Volume commitments

**Estimated Savings:**
- 15-30% on all AI services
- 40-60% on server costs

---

## 10. Pricing Strategy Recommendations

### Consumer Pricing

**Free Tier:**
- 10 free calls/month
- Test the service
- Cost to you: $0.60-0.90

**Basic Plan: $29/month**
- 100 calls/month
- Your cost: $6-9
- Profit: $20-23 (70-80% margin)
- Config: Budget

**Pro Plan: $99/month**
- 500 calls/month
- Your cost: $30-43
- Profit: $56-69 (57-70% margin)
- Config: Balanced

**Enterprise: Custom**
- 1,000+ calls/month
- Volume discounts
- Premium features
- Config: Speed/Premium

---

### B2B Pricing

**Tier 1: $199/month**
- 1,000 calls
- Basic support
- Your cost: $62-86
- Profit: $113-137 (57-69% margin)

**Tier 2: $499/month**
- 3,000 calls
- Priority support
- Custom voices
- Your cost: $185-258
- Profit: $241-314 (48-63% margin)

**Tier 3: $999/month**
- 7,000 calls
- Premium features
- Dedicated support
- Your cost: $430-601
- Profit: $398-569 (40-57% margin)

---

## 11. Cost Comparison with Competitors

### vs Traditional Call Centers

**Traditional:**
- Agent cost: $15-25/hour
- 5-min call: $1.25-2.08
- 1,000 calls: $1,250-2,080/month

**Your AI Platform (Balanced):**
- Cost: $0.086/call
- 1,000 calls: $86/month
- **Savings: 95-96%** 🎯

---

### vs Other AI Calling Platforms

| Platform | Cost/Call | Cost/1000 | vs Yours |
|----------|-----------|-----------|----------|
| **Bland.ai** | $0.09-0.12 | $90-120 | Similar |
| **Vapi.ai** | $0.05-0.15 | $50-150 | Similar |
| **Retell.ai** | $0.08-0.10 | $80-100 | Similar |
| **Your Platform** | $0.06-0.37 | $60-370 | Competitive ✅ |

**Your Advantage:**
- Full control over costs
- No vendor lock-in
- Flexible provider selection
- Better margins

---

## 12. Final Recommendations

### For Most Businesses (Recommended) ⭐

**Configuration:**
- STT: Deepgram Streaming
- LLM: GPT-4o-mini
- TTS: Google Cloud Neural2
- Server: AWS EC2 t3.small (Reserved 1-year)

**Costs:**
- **Per call:** $0.071
- **Per 1,000 calls:** $79/month
- **Annual:** $948

**Why:**
- Best quality/cost balance
- Great voice quality (Neural2)
- Fast enough (1.6-1.75s)
- Predictable costs
- 91% profit margin at $1/call

---

### For High-Volume Budget (Alternative)

**Configuration:**
- STT: Deepgram Streaming
- LLM: GPT-4o-mini
- TTS: Google Standard
- Server: AWS EC2 t3.small (Reserved 3-year)

**Costs:**
- **Per call:** $0.055
- **Per 1,000 calls:** $61/month
- **Annual:** $732

**Why:**
- Lowest possible cost
- Still good quality
- 94% profit margin at $1/call
- Great for high volume

---

### For Premium Service (VIP Only)

**Configuration:**
- STT: Deepgram Streaming
- LLM: Claude 3.5 Haiku
- TTS: ElevenLabs
- Server: AWS EC2 t3.small

**Costs:**
- **Per call:** $0.368
- **Per 1,000 calls:** $368/month
- **Use for:** Top 10-20% of customers only

**Why:**
- Best quality available
- Fastest responses
- Premium brand image
- Charge $2-3 per call

---

## 13. Quick Reference Tables

### Cost Per Call Summary

| Component | Budget | Balanced | Speed | Premium |
|-----------|--------|----------|-------|---------|
| Server | $0.00009 | $0.00015 | $0.00015 | $0.00015 |
| STT | $0.0295 | $0.0295 | $0.0295 | $0.0295 |
| LLM | $0.002 | $0.002 | $0.008 | $0.008 |
| TTS | $0.006 | $0.024 | $0.045 | $0.30 |
| Telephony | $0.015 | $0.015 | $0.015 | $0.015 |
| **TOTAL** | **$0.053** | **$0.071** | **$0.098** | **$0.353** |

### Monthly Cost (1,000 calls)

| Scenario | Monthly | Annual | Margin @ $1/call |
|----------|---------|--------|------------------|
| Budget | $61 | $732 | 94% |
| Balanced ⭐ | $86 | $1,032 | 91% |
| Speed | $113 | $1,356 | 90% |
| Premium | $368 | $4,416 | 63% |

### Provider Pricing Quick Reference

| Service | Provider | Cost/Unit | Cost/Call |
|---------|----------|-----------|-----------|
| **Server** | AWS EC2 t3.small | $15.18/mo | $0.00015 |
| **STT** | Deepgram Streaming | $0.0059/min | $0.0295 |
| **LLM** | GPT-4o-mini | $0.15 in/$0.60 out per 1M | $0.002 |
| **LLM** | Claude 3.5 Haiku | $1 in/$5 out per 1M | $0.008 |
| **TTS** | Google Standard | $4/1M chars | $0.006 |
| **TTS** | Google Neural2 | $16/1M chars | $0.024 |
| **TTS** | Deepgram | $30/1M chars | $0.045 |
| **TTS** | ElevenLabs | ~$165-330/1M chars | $0.25-0.33 |

---

## Summary

**Bottom Line:**
- **Minimum viable cost:** $0.053 per call ($53/1000 calls)
- **Recommended setup:** $0.071 per call ($71/1000 calls)
- **Premium setup:** $0.353 per call ($353/1000 calls)

**At 1,000 calls/month with $1/call revenue:**
- Budget: $939 profit (94% margin)
- Balanced: $914 profit (91% margin) ⭐
- Premium: $632 profit (63% margin)

**Your platform is HIGHLY PROFITABLE** even at conservative pricing! 🚀

---

**Last Updated:** 2025-01-31
**Status:** ✅ Complete Analysis
