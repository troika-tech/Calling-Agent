# Scale Pricing Analysis - 50,000+ Minutes/Month

**Last Updated:** 2025-01-31
**Status:** 📊 Enterprise Volume Analysis

---

## Executive Summary

### Cost Reduction at Scale (50,000 minutes/month)

| Setup | Standard Rate | At Scale | Savings | % Reduction |
|-------|--------------|----------|---------|-------------|
| **Budget** | $0.0076/min | **$0.0058/min** | $0.0018 | **24%** |
| **Balanced** | $0.0112/min | **$0.0087/min** | $0.0025 | **22%** |
| **Speed** | $0.0166/min | **$0.0128/min** | $0.0038 | **23%** |
| **Premium** | $0.0676/min | **$0.0541/min** | $0.0135 | **20%** |

**Key Finding:** You can save **20-24%** at 50,000 minutes/month scale! 💰

---

## 1. Component-by-Component Scaling

### Server Costs (AWS EC2)

**Current:** 1 server at 10-15 concurrent calls

**At 50,000 minutes/month:**
- Average call: 5 minutes
- Total calls: 10,000 calls/month
- Peak concurrent: 30-50 calls (depends on distribution)
- **Servers needed:** 3-4 t3.small instances

#### Standard On-Demand Pricing

| Servers | Monthly Cost | Per Minute | vs Single Server |
|---------|--------------|------------|------------------|
| 1 | $15.18 | $0.0003 | - |
| 3 | $45.54 | $0.0009 | 3x |
| 4 | $60.72 | $0.0012 | 4x |

**Seems expensive, BUT...**

#### Reserved Instances (1-Year)

| Servers | Monthly Cost | Per Minute | Savings |
|---------|--------------|------------|---------|
| 1 | $9.11 | $0.00018 | 40% |
| 3 | $27.33 | $0.00055 | 40% |
| 4 | $36.44 | $0.00073 | 40% |

#### Reserved Instances (3-Year)

| Servers | Monthly Cost | Per Minute | Savings |
|---------|--------------|------------|---------|
| 1 | $5.76 | $0.00012 | 62% |
| 3 | $17.28 | $0.00035 | 62% |
| 4 | $23.04 | $0.00046 | 62% |

**Recommendation at scale:** 3-year reserved instances

**Cost at 50k minutes/month:**
- 3 servers × $5.76 = $17.28/month
- **Per minute: $0.00035**
- **Savings vs on-demand: $28.26/month (62%)**

**Impact:** Minimal (server is already <1% of total cost)

---

### STT Costs (Deepgram Nova-2)

**Current Pricing:**
- Streaming: $0.0059 per minute (flat rate)

**Volume Discounts:**
Deepgram offers custom enterprise pricing at scale.

#### Estimated Enterprise Pricing

| Volume/Month | Standard | Enterprise | Discount |
|--------------|----------|------------|----------|
| 5,000 min | $0.0059 | $0.0059 | 0% |
| 25,000 min | $0.0059 | $0.0053 | 10% |
| 50,000 min ⭐ | $0.0059 | **$0.0047** | **20%** |
| 100,000 min | $0.0059 | $0.0042 | 29% |
| 500,000 min | $0.0059 | $0.0035 | 41% |

**At 50k minutes:**
- Standard: $295/month
- Enterprise: **$235/month** (estimated)
- **Savings: $60/month**

**Per minute:** **$0.0047** (down from $0.0059)

**How to Get:**
- Contact Deepgram sales team
- Request enterprise pricing
- Sign annual contract
- Typical: 15-30% discount at 50k+ minutes

---

### LLM Costs

#### Option A: OpenAI GPT-4o-mini

**Current Pricing:**
- Input: $0.15/1M tokens
- Output: $0.60/1M tokens
- **Per minute: $0.0004**

**Volume Discounts:**
OpenAI offers tiered pricing based on usage.

| Monthly Tokens | Tier | Discount |
|----------------|------|----------|
| 0-10M | 1 | 0% |
| 10M-50M | 2 | 0% |
| 50M-500M | 3 | ~10% |
| 500M+ | 4 | ~20% |

**At 50k minutes:**
- Total tokens: ~150M tokens/month
- Falls into **Tier 3**
- **Estimated discount: 10%**

**New rate:**
- Input: $0.135/1M tokens
- Output: $0.54/1M tokens
- **Per minute: $0.00036** (down from $0.0004)

**Savings:** $0.04/1000 minutes = $2/month (minimal)

---

#### Option B: Claude 3.5 Haiku

**Current Pricing:**
- Input: $1.00/1M tokens
- Output: $5.00/1M tokens
- **Per minute: $0.0016**

**Volume Discounts:**
Anthropic offers enterprise pricing.

**Estimated at 50k+ minutes:**
- Discount: 10-15%
- Input: $0.85-0.90/1M tokens
- Output: $4.25-4.50/1M tokens
- **Per minute: $0.0014** (down from $0.0016)

**Savings:** $10/month

**How to Get:**
- Contact Anthropic enterprise sales
- Annual commitment required
- Typical: 10-20% discount at scale

---

### TTS Costs (Multiple Options)

#### Option A: Google Cloud Standard

**Current Pricing:**
- $4.00 per 1M characters
- **Per minute: $0.0012**

**Volume Discounts:**
- None for standard pricing
- But committed use discounts available

**Committed Use Discount (1-year):**
- 25% discount
- **New rate: $3.00 per 1M chars**
- **Per minute: $0.0009**

**At 50k minutes:**
- Standard: $60/month
- Committed: **$45/month**
- **Savings: $15/month**

---

#### Option B: Google Cloud Neural2 ⭐

**Current Pricing:**
- $16.00 per 1M characters
- **Per minute: $0.0048**

**Committed Use Discount (1-year):**
- 25% discount
- **New rate: $12.00 per 1M chars**
- **Per minute: $0.0036**

**At 50k minutes:**
- Standard: $240/month
- Committed: **$180/month**
- **Savings: $60/month (25%)**

**How to Get:**
- Sign up for committed use
- 1-year or 3-year contract
- Automatic 25% discount

---

#### Option C: Deepgram Aura-2

**Current Pricing:**
- $30.00 per 1M characters
- **Per minute: $0.0090**

**Enterprise Pricing (50k+ minutes):**
- Estimated 20% discount
- **New rate: $24.00 per 1M chars**
- **Per minute: $0.0072**

**At 50k minutes:**
- Standard: $450/month
- Enterprise: **$360/month**
- **Savings: $90/month**

---

#### Option D: ElevenLabs

**Current Pricing (Pro Plan):**
- $330/month for 2M characters
- $0.165 per 1K chars
- **Per minute: $0.0495**

**At 50k minutes:**
- Characters needed: 15M/month
- Pro plan: 2M chars ($330)
- Need 7.5× Pro plans
- **Cost: $2,475/month**

**Enterprise Pricing:**
Contact for custom pricing at 15M+ chars/month

**Estimated Enterprise Discount:**
- 30-40% discount possible
- **New rate: $0.099-0.115 per 1K chars**
- **Per minute: $0.0297-0.0345**

**At 50k minutes:**
- Estimated: **$1,485-1,725/month**
- **Savings: $750-990/month**

**Still expensive compared to alternatives!**

---

## 2. Complete Scenarios at Scale (50k minutes)

### Scenario 1: Budget Setup at Scale 💰

**Standard Configuration:**
- Server: 3× t3.small (3-year reserved)
- STT: Deepgram Streaming (enterprise)
- LLM: GPT-4o-mini (tier 3)
- TTS: Google Standard (committed use)

**Standard Cost:**
```
Server:      $0.00003
STT:         $0.0059
LLM:         $0.0004
TTS:         $0.0012
────────────────────────
TOTAL:       $0.0076/min
Monthly:     $380
```

**At Scale Cost:**
```
Server:      $0.00035  (3 servers, reserved)
STT:         $0.0047   (enterprise, -20%)
LLM:         $0.00036  (tier 3, -10%)
TTS:         $0.0009   (committed, -25%)
────────────────────────
TOTAL:       $0.0058/min
Monthly:     $290
────────────────────────
SAVINGS:     $90/month (24%)
```

**Annual Savings:** $1,080

---

### Scenario 2: Balanced Setup at Scale ⭐

**Standard Configuration:**
- Server: 3× t3.small (3-year reserved)
- STT: Deepgram Streaming (enterprise)
- LLM: GPT-4o-mini (tier 3)
- TTS: Google Neural2 (committed use)

**Standard Cost:**
```
Server:      $0.00003
STT:         $0.0059
LLM:         $0.0004
TTS:         $0.0048
────────────────────────
TOTAL:       $0.0112/min
Monthly:     $560
```

**At Scale Cost:**
```
Server:      $0.00035  (3 servers, reserved)
STT:         $0.0047   (enterprise, -20%)
LLM:         $0.00036  (tier 3, -10%)
TTS:         $0.0036   (committed, -25%)
────────────────────────
TOTAL:       $0.0087/min
Monthly:     $435
────────────────────────
SAVINGS:     $125/month (22%)
```

**Annual Savings:** $1,500

---

### Scenario 3: Speed Setup at Scale ⚡

**Standard Configuration:**
- Server: 3× t3.small (3-year reserved)
- STT: Deepgram Streaming (enterprise)
- LLM: Claude 3.5 Haiku (enterprise)
- TTS: Deepgram (enterprise)

**Standard Cost:**
```
Server:      $0.00003
STT:         $0.0059
LLM:         $0.0016
TTS:         $0.0090
────────────────────────
TOTAL:       $0.0166/min
Monthly:     $830
```

**At Scale Cost:**
```
Server:      $0.00035  (3 servers, reserved)
STT:         $0.0047   (enterprise, -20%)
LLM:         $0.0014   (enterprise, -12%)
TTS:         $0.0072   (enterprise, -20%)
────────────────────────
TOTAL:       $0.0128/min
Monthly:     $640
────────────────────────
SAVINGS:     $190/month (23%)
```

**Annual Savings:** $2,280

---

### Scenario 4: Premium Setup at Scale 🎙️

**Standard Configuration:**
- Server: 3× t3.small (3-year reserved)
- STT: Deepgram Streaming (enterprise)
- LLM: Claude 3.5 Haiku (enterprise)
- TTS: ElevenLabs (enterprise)

**Standard Cost:**
```
Server:      $0.00003
STT:         $0.0059
LLM:         $0.0016
TTS:         $0.0600
────────────────────────
TOTAL:       $0.0676/min
Monthly:     $3,380
```

**At Scale Cost:**
```
Server:      $0.00035  (3 servers, reserved)
STT:         $0.0047   (enterprise, -20%)
LLM:         $0.0014   (enterprise, -12%)
TTS:         $0.0480   (enterprise, -20%)
────────────────────────
TOTAL:       $0.0541/min
Monthly:     $2,705
────────────────────────
SAVINGS:     $675/month (20%)
```

**Annual Savings:** $8,100

---

## 3. Scaling Comparison Table

### Cost Reduction by Volume

| Volume | Budget | Balanced | Speed | Premium |
|--------|--------|----------|-------|---------|
| **5,000 min** | $0.0076 | $0.0112 | $0.0166 | $0.0676 |
| **25,000 min** | $0.0068 | $0.0101 | $0.0149 | $0.0615 |
| **50,000 min** ⭐ | **$0.0058** | **$0.0087** | **$0.0128** | **$0.0541** |
| **100,000 min** | $0.0053 | $0.0080 | $0.0118 | $0.0498 |
| **500,000 min** | $0.0046 | $0.0070 | $0.0104 | $0.0445 |

### Monthly Cost by Volume

| Volume | Budget | Balanced | Speed | Premium |
|--------|--------|----------|-------|---------|
| 5,000 min | $38 | $56 | $83 | $338 |
| 25,000 min | $170 | $253 | $373 | $1,538 |
| **50,000 min** ⭐ | **$290** | **$435** | **$640** | **$2,705** |
| 100,000 min | $530 | $800 | $1,180 | $4,980 |
| 500,000 min | $2,300 | $3,500 | $5,200 | $22,250 |

### Savings by Component at 50k Minutes

| Component | Standard Monthly | At Scale | Savings | % Reduction |
|-----------|------------------|----------|---------|-------------|
| **Server** | $45 | $17 | $28 | 62% |
| **STT** | $295 | $235 | $60 | 20% |
| **LLM (GPT-4o-mini)** | $20 | $18 | $2 | 10% |
| **LLM (Claude)** | $80 | $70 | $10 | 12% |
| **TTS (Google Std)** | $60 | $45 | $15 | 25% |
| **TTS (Google Neural2)** | $240 | $180 | $60 | 25% |
| **TTS (Deepgram)** | $450 | $360 | $90 | 20% |
| **TTS (ElevenLabs)** | $3,000 | $2,400 | $600 | 20% |

---

## 4. Break-Even Analysis for Enterprise Plans

### Deepgram Enterprise (20% discount)

**Minimum to justify:**
- Enterprise discount: 20%
- Annual contract required
- Minimum spend: ~$10k/year

**Break-even volume:**
- At $0.0012/min savings
- Need: $833/month savings
- **Requires: ~40,000 minutes/month**

**At 50k minutes:**
- Savings: $60/month
- **ROI: Positive** ✅

---

### Google Cloud Committed Use

**Minimum commitment:**
- 1-year: ~$100-500/month
- 3-year: Lower rate, same commitment

**Break-even (Neural2):**
- Savings: $60/month at 50k min
- Commitment: None required (pay-as-you-go with commitment)
- **ROI: Immediate** ✅

---

### OpenAI/Anthropic Enterprise

**Minimum spend:**
- OpenAI: ~$100-500/month
- Anthropic: ~$1,000/month

**Break-even:**
- Savings minimal (<10%)
- **Not worth it at 50k minutes** unless using Claude heavily

---

## 5. Scaling Trajectory

### Growth Stages

#### Stage 1: Startup (0-5,000 min/month)
**Strategy:** Pay-as-you-go, no commitments
- Cost: $0.0076-0.0112/min
- Focus: Product-market fit
- Infrastructure: 1 server (on-demand)

#### Stage 2: Growth (5,000-25,000 min/month)
**Strategy:** Start optimizing
- Cost: $0.0068-0.0101/min (10% reduction)
- Actions:
  - Switch to 1-year reserved instances (-40%)
  - Use Google committed use for TTS (-25%)
  - Implement caching
- Infrastructure: 1-2 servers (reserved)

#### Stage 3: Scale (25,000-100,000 min/month) ⭐
**Strategy:** Enterprise agreements
- Cost: $0.0053-0.0087/min (20-25% reduction)
- Actions:
  - Deepgram enterprise pricing (-20%)
  - Google committed use (-25%)
  - 3-year reserved instances (-62%)
  - OpenAI tier 3 discounts (-10%)
- Infrastructure: 3-5 servers (reserved)

#### Stage 4: Enterprise (100,000+ min/month)
**Strategy:** Full enterprise stack
- Cost: $0.0046-0.0080/min (30-40% reduction)
- Actions:
  - Custom pricing from all vendors
  - Dedicated account managers
  - SLA guarantees
  - Priority support
- Infrastructure: 10+ servers (reserved/spot mix)

---

## 6. Optimization Strategies at Scale

### Server Optimization (Biggest Impact)

**Current at 50k min:**
- Need: 3-4 servers
- On-demand: $45-60/month

**Optimized:**
1. **3-year reserved:** $17-23/month (62% savings)
2. **Spot instances + Reserved mix:**
   - 2 reserved + 2 spot
   - Cost: $11.52 + $9 = $20.52/month
   - Savings: $25-40/month

**Auto-scaling:**
- Scale up during peak hours
- Scale down at night
- Save 30-50% on server costs

---

### STT Optimization

**Negotiate with Deepgram:**
- At 50k minutes: ~$295/month standard
- Ask for: 20-30% discount
- Target: **$207-235/month**

**Negotiation tips:**
1. Show monthly volume
2. Commit to 1-year contract
3. Pre-pay quarterly
4. Mention competitors (AssemblyAI, Rev.ai)

---

### TTS Optimization

**Strategy: Aggressive Caching**

**Current usage at 50k minutes:**
- 15M characters/month
- 30% are common phrases

**With caching:**
- Cache 4.5M chars (30%)
- Reduce billable: 10.5M chars
- **Savings:**
  - Google Neural2: $72/month (30%)
  - Deepgram: $135/month (30%)
  - ElevenLabs: $900/month (30%)

**ROI:**
- Development: 20 hours (~$2,000)
- Monthly savings: $72-900
- **Payback: 2-3 months**

---

### Hybrid TTS Strategy

**Mix providers based on use case:**

```typescript
if (customer.tier === 'vip') {
  // 10% of calls
  ttsProvider = 'elevenlabs';  // $0.0480/min (enterprise)
} else if (callType === 'sales') {
  // 30% of calls
  ttsProvider = 'deepgram';  // $0.0072/min
} else {
  // 60% of calls
  ttsProvider = 'google-neural2';  // $0.0036/min
}
```

**Effective TTS cost:**
- (0.10 × $0.0480) + (0.30 × $0.0072) + (0.60 × $0.0036)
- = $0.0048 + $0.00216 + $0.00216
- = **$0.00912/min**

**vs Single Provider:**
- All Neural2: $0.0036/min ✅ (cheaper!)
- All Deepgram: $0.0072/min
- All ElevenLabs: $0.0480/min

**Conclusion:** Hybrid only makes sense if quality demands vary

---

## 7. Maximum Possible Savings

### Most Optimized Setup (50k minutes)

**Configuration:**
- Server: 3× t3.small (3-year reserved + spot)
- STT: Deepgram Enterprise (30% negotiated discount)
- LLM: GPT-4o-mini (tier 3 + optimized tokens)
- TTS: Google Neural2 (committed use + 30% caching)

**Cost Breakdown:**
```
Server:      $0.00040  (reserved + spot mix)
STT:         $0.0041   (30% enterprise discount)
LLM:         $0.0002   (optimized tokens, 50% reduction)
TTS:         $0.0025   (committed + caching)
────────────────────────
TOTAL:       $0.0072/min
Monthly:     $360
────────────────────────
vs Standard: $560 (36% savings!)
```

**Actions Required:**
1. ✅ 3-year reserved instances
2. ✅ Negotiate Deepgram enterprise (30%)
3. ✅ Google committed use (25%)
4. ✅ Implement response caching (30%)
5. ✅ Optimize LLM tokens (50%)
6. ✅ Use spot instances for peak loads

**Effort:** High (6-12 months to implement fully)
**Savings:** $200/month = $2,400/year

---

## 8. When to Negotiate Enterprise Deals

### Deepgram (STT)

**When to Contact:**
- Volume: 25,000+ minutes/month
- Spend: $150+/month
- Commitment: 1-year contract

**Expected Discounts:**
- 25k min: 10-15%
- 50k min: 20-25% ⭐
- 100k min: 25-35%
- 500k min: 35-50%

**Contact:** sales@deepgram.com

---

### Google Cloud

**When to Use Committed Use:**
- Anytime (no minimum)
- Just commit to 1-year spend

**Discounts:**
- 1-year: 25%
- 3-year: 52%

**Setup:** GCP Console → Committed Use Discounts

---

### OpenAI

**When to Contact:**
- Volume: 100M+ tokens/month
- Spend: $500+/month

**Expected Discounts:**
- <10% at low volume
- 10-20% at high volume

**Auto-applies** via tier system

---

### ElevenLabs

**When to Contact:**
- Volume: 10M+ characters/month
- Spend: $1,500+/month

**Expected Discounts:**
- 10M chars: 20-30%
- 50M chars: 30-40%
- 100M chars: 40-50%

**Contact:** enterprise@elevenlabs.io

---

## 9. ROI Calculator

### Investment vs Savings (50k minutes/month)

**Investment:**
- 3-year reserved instances: $0 (pay over time)
- Enterprise negotiations: 10-20 hours (~$2,000)
- Caching implementation: 20-40 hours (~$4,000)
- **Total upfront: ~$6,000**

**Monthly Savings:**
- Balanced setup: $125/month
- With optimizations: $200/month

**Payback Period:**
- $6,000 / $200 = 30 months
- **ROI becomes positive at ~2.5 years**

**Lifetime Value (5 years):**
- Savings: $200 × 60 months = $12,000
- Investment: $6,000
- **Net benefit: $6,000** ✅

---

## 10. Quick Reference

### Cost Per Minute at 50k Scale

| Setup | Standard | At Scale | Savings |
|-------|----------|----------|---------|
| Budget | $0.0076 | $0.0058 | 24% |
| Balanced ⭐ | $0.0112 | $0.0087 | 22% |
| Speed | $0.0166 | $0.0128 | 23% |
| Premium | $0.0676 | $0.0541 | 20% |

### Monthly Cost at 50k Minutes

| Setup | Standard | At Scale | Savings |
|-------|----------|----------|---------|
| Budget | $380 | $290 | $90 |
| Balanced ⭐ | $560 | $435 | $125 |
| Speed | $830 | $640 | $190 |
| Premium | $3,380 | $2,705 | $675 |

### Annual Savings at 50k Minutes

| Setup | Annual Savings |
|-------|----------------|
| Budget | $1,080 |
| Balanced ⭐ | **$1,500** |
| Speed | $2,280 |
| Premium | $8,100 |

---

## Summary

**At 50,000 minutes/month, you can save 20-24%!**

### Key Savings Opportunities:

1. **Server Costs:** 62% reduction (3-year reserved)
   - Savings: $28/month

2. **STT (Deepgram):** 20% reduction (enterprise)
   - Savings: $60/month

3. **TTS (Google Neural2):** 25% reduction (committed use)
   - Savings: $60/month

4. **Caching:** 30% TTS reduction
   - Savings: $54/month

**Total Possible Savings:** $200+/month ($2,400+/year)

### Recommendations:

**At 50k minutes/month:**
1. ✅ Immediately: Switch to reserved instances (40-62% savings)
2. ✅ Immediately: Use Google committed use (25% savings)
3. ✅ Month 2: Contact Deepgram for enterprise pricing (20% savings)
4. ✅ Month 3: Implement response caching (30% TTS savings)
5. ✅ Month 6: Optimize LLM token usage (50% LLM savings)

**Your optimized cost at 50k minutes:**
- **Balanced setup: $0.0087/min ($435/month)**
- vs Standard: $560/month
- **Savings: $125/month (22%)**

---

**Last Updated:** 2025-01-31
**Status:** ✅ Complete Scale Analysis
