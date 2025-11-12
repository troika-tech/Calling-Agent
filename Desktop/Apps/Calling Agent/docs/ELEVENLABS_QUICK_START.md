# ElevenLabs Quick Start Guide

## ✅ Integration Complete!

ElevenLabs TTS is now fully integrated with ultra-low latency streaming support.

---

## 🚀 Quick Setup (3 Steps)

### 1. Get API Key
- Go to [elevenlabs.io](https://elevenlabs.io)
- Sign up / Log in
- Navigate to Profile → API Keys
- Generate new API key (starts with `sk_`)

### 2. Add to Environment
```bash
# backend/.env
ELEVENLABS_API_KEY=sk_your_actual_api_key_here
```

### 3. Restart Backend
```bash
cd backend
npm run dev
```

That's it! ✨

---

## 📋 Create Agent with ElevenLabs

**Example Agent Configuration:**

```json
{
  "name": "Premium Sales Assistant",
  "description": "High-quality voice for VIP customers",
  "config": {
    "prompt": "You are a professional sales assistant...",
    "greetingMessage": "Hello! Thank you for calling. How may I assist you today?",
    "endCallPhrases": ["goodbye", "bye", "end call"],
    "voice": {
      "provider": "elevenlabs",
      "voiceId": "EXAVITQu4vr4xnSDxMaL",
      "model": "eleven_turbo_v2_5",
      "settings": {
        "stability": 0.5,
        "similarityBoost": 0.75,
        "style": 0,
        "useSpeakerBoost": true
      }
    },
    "language": "en",
    "llm": {
      "model": "gpt-4o-mini",
      "temperature": 0.7
    }
  }
}
```

---

## 🎙️ Popular Voice IDs

| Voice Name | ID | Gender | Description |
|------------|-----|--------|-------------|
| **Rachel** | `EXAVITQu4vr4xnSDxMaL` | Female | Young, friendly (DEFAULT) |
| **Adam** | `pNInz6obpgDQGcFmaJgB` | Male | Deep, mature |
| **Charlotte** | `21m00Tcm4TlvDq8ikWAM` | Female | British, clear |
| **Sam** | `yoZ06aMxZJJ28mfd3POQ` | Male | American, dynamic |
| **Domi** | `AZnzlk1XvdvUeBnXmlld` | Female | American, strong |

**Get full list:**
```bash
curl -X GET https://api.elevenlabs.io/v1/voices \
  -H "xi-api-key: YOUR_API_KEY"
```

---

## 💰 Cost Estimate

**Example: 1000 calls/month (5 min each, ~1,500 characters per call)**

| Plan | Characters | Monthly Cost | Cost per Call |
|------|-----------|--------------|---------------|
| Free | 10,000 | $0 | $0 (6 calls) |
| Starter | 30,000 | $5 | $0.25 (20 calls) |
| Creator | 100,000 | $22 | $0.33 (66 calls) |
| Independent | 500,000 | $99 | $0.30 (333 calls) |
| Pro | 2,000,000 | $330 | $0.25 (1,333 calls) |

**For 1,000 calls/month:** You need Independent ($99/mo) or Pro ($330/mo)

---

## ⚡ Performance

**Latency Breakdown:**
```
User stops speaking
  ↓ 0ms - VAD detection (Deepgram)
  ↓ 50-200ms - STT (Deepgram streaming)
  ↓ 1000ms - LLM (GPT-4o-mini)
  ↓ 300ms - ElevenLabs TTS first audio
  ↓ 100ms - MP3 → PCM conversion
  ↓ 200ms - Audio transmission
─────────────────────────────────
Total: ~1.65 - 1.85 seconds ⚡⚡⚡⚡⚡
```

**Compare to Deepgram:** +200-300ms, but MUCH better quality!

---

## 🎛️ Voice Settings Explained

### Stability (0.0 - 1.0)
- **0.3:** Expressive, varies (entertainment)
- **0.5:** Balanced (DEFAULT, recommended)
- **0.7:** Consistent, stable (professional)

### Similarity Boost (0.0 - 1.0)
- **0.7:** Creative interpretation
- **0.75:** Balanced (DEFAULT)
- **0.85:** Closer to original voice

### Style (0.0 - 1.0)
- **0.0:** Neutral, flat
- **0.5:** Some expression
- **0.9:** Maximum emotion

### Speaker Boost
- **true:** Enhanced clarity (DEFAULT, recommended)
- **false:** Natural processing

---

## 📊 When to Use Each Provider

### Use ElevenLabs ✅
- Premium/VIP customers
- Sales & marketing calls
- Brand voice consistency
- Highest quality needed
- Budget allows 5-10x cost

### Use Deepgram ✅
- High-volume calls
- Speed critical (fastest)
- Cost-conscious
- Standard customer service

### Use Google Neural2 ✅
- Balance of quality & cost
- Multi-language needs
- Best value option

---

## 🔧 Test Your Setup

```bash
# Check if service initialized
cd backend
npm run dev

# Look for this in logs:
# "ElevenLabs TTS service initialized"

# Test API connectivity (replace with your key)
curl -X GET https://api.elevenlabs.io/v1/user \
  -H "xi-api-key: sk_your_key"
```

---

## 🐛 Troubleshooting

### "ElevenLabs TTS service not available"
- ✅ Check `.env` has `ELEVENLABS_API_KEY`
- ✅ Key starts with `sk_`
- ✅ Restart backend after adding key

### High latency (>1s first audio)
- ✅ Using `eleven_turbo_v2_5` model?
- ✅ `optimizeStreamingLatency: 4` set?
- ✅ Check network to ElevenLabs API

### Rate limit errors
- ✅ Check character usage with API
- ✅ Upgrade to higher plan
- ✅ Switch to Deepgram for standard calls

---

## 📚 Full Documentation

- **Complete Guide:** [docs/ELEVENLABS_TTS_INTEGRATION.md](docs/ELEVENLABS_TTS_INTEGRATION.md)
- **All Providers:** [docs/TTS_PROVIDERS_OVERVIEW.md](docs/TTS_PROVIDERS_OVERVIEW.md)
- **Cost Analysis:** [docs/COST_BREAKDOWN_ANALYSIS.md](docs/COST_BREAKDOWN_ANALYSIS.md)

---

## 💡 Pro Tips

1. **Hybrid Strategy:** Use ElevenLabs for VIP, Deepgram for standard
2. **Cache Common Phrases:** Save on character usage
3. **Monitor Usage:** Check character count regularly
4. **Test Voices:** Try different voices for your brand
5. **Settings Matter:** Tune stability/similarity for your use case

---

## ✅ Checklist

- [ ] API key added to `.env`
- [ ] Backend restarted
- [ ] Test agent created with ElevenLabs
- [ ] Voice ID selected
- [ ] Test call made
- [ ] Quality verified
- [ ] Cost monitoring set up

---

**Status:** ✅ Ready to use!
**Build Status:** ✅ Compiles successfully
**Integration Status:** ✅ Fully integrated with streaming support

Enjoy premium voice quality! 🎙️✨
