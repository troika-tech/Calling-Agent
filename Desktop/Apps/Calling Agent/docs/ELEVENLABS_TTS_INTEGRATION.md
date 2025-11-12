# ElevenLabs TTS Integration Guide

**Last Updated:** 2025-01-31
**Status:** ✅ Ready to Use

---

## Overview

ElevenLabs TTS is now fully integrated with ultra-low latency streaming support, providing the highest quality voice synthesis in the market.

### Key Features
✅ **Streaming TTS** - Sub-400ms Time To First Byte
✅ **Best Voice Quality** - Industry-leading natural voices
✅ **420+ Voices** - Massive voice library
✅ **Emotional Control** - Adjust stability, similarity, style
✅ **Multi-language** - 29+ languages supported
✅ **Turbo Model** - `eleven_turbo_v2_5` for lowest latency

---

## Why ElevenLabs?

### Voice Quality Comparison
| Provider | Quality | Latency | Cost | Best For |
|----------|---------|---------|------|----------|
| **ElevenLabs** | ⭐⭐⭐⭐⭐⭐ | 300-400ms | $$$ | Premium quality |
| **Deepgram** | ⭐⭐⭐⭐ | 150-200ms | $ | Speed |
| **Google Neural2** | ⭐⭐⭐⭐⭐ | 250-400ms | $$ | Balance |
| **OpenAI** | ⭐⭐⭐⭐ | 300-600ms | $ | Integration |

### ElevenLabs Advantages
- **Highest Quality:** Most natural-sounding voices available
- **Voice Cloning:** Create custom voices (Pro plan)
- **Emotional Range:** Adjust voice characteristics in real-time
- **Professional Voices:** Access to actor-quality voiceovers
- **Turbo Model:** Optimized for low-latency streaming

---

## Pricing (2025)

### Plans
| Plan | Characters/Month | Price | Cost per 1000 chars |
|------|------------------|-------|---------------------|
| **Free** | 10,000 | $0 | $0 |
| **Starter** | 30,000 | $5 | $0.167 |
| **Creator** | 100,000 | $22 | $0.220 |
| **Independent** | 500,000 | $99 | $0.198 |
| **Pro** | 2,000,000 | $330 | $0.165 |

### Cost Per Call (5-minute call, 1,500 characters)
- **Free:** Not enough for production use
- **Starter:** $0.25 per call ($250 per 1000 calls)
- **Creator:** $0.33 per call ($330 per 1000 calls)
- **Independent:** $0.30 per call ($300 per 1000 calls)
- **Pro:** $0.25 per call ($250 per 1000 calls)

### Cost Comparison (Per 1000 Calls)
- **Deepgram:** $45 (cheapest, fast)
- **Google Standard:** $6 (budget option)
- **Google Neural2:** $24 (best value)
- **ElevenLabs:** $250-$330 (highest quality)
- **Note:** ElevenLabs is 5-10x more expensive but offers superior quality

---

## Setup Instructions

### Step 1: Get ElevenLabs API Key

1. Sign up at [elevenlabs.io](https://elevenlabs.io)
2. Go to Profile → API Keys
3. Generate a new API key
4. Copy the key (starts with `sk_...`)

### Step 2: Configure Environment

Add to your `.env` file:
```bash
ELEVENLABS_API_KEY=sk_your_api_key_here
```

### Step 3: Restart Backend

```bash
cd backend
npm run dev
```

The service will automatically initialize if the API key is present.

---

## Usage

### Configure Agent to Use ElevenLabs

```json
{
  "name": "Premium AI Assistant",
  "config": {
    "voice": {
      "provider": "elevenlabs",
      "voiceId": "EXAVITQu4vr4xnSDxMaL",  // Rachel (default)
      "model": "eleven_turbo_v2_5",       // Fastest model
      "settings": {
        "stability": 0.5,
        "similarityBoost": 0.75,
        "style": 0,
        "useSpeakerBoost": true
      }
    }
  }
}
```

### Available Voice IDs (Popular Voices)

| Voice ID | Name | Gender | Description |
|----------|------|--------|-------------|
| `EXAVITQu4vr4xnSDxMaL` | **Rachel** | Female | Young, friendly (default) |
| `pNInz6obpgDQGcFmaJgB` | **Adam** | Male | Deep, mature |
| `yoZ06aMxZJJ28mfd3POQ` | **Sam** | Male | American, dynamic |
| `2EiwWnXFnvU5JabPnv8n` | **Clyde** | Male | Warm, rich |
| `21m00Tcm4TlvDq8ikWAM` | **Charlotte** | Female | British, clear |
| `AZnzlk1XvdvUeBnXmlld` | **Domi** | Female | American, strong |
| `MF3mGyEYCl7XYWbV9V6O` | **Elli** | Female | Emotional, young |
| `ErXwobaYiN019PkySvjV` | **Antoni** | Male | Well-rounded, calm |
| `VR6AewLTigWG4xSOukaG` | **Arnold** | Male | American, crisp |
| `pqHfZKP75CvOlQylNhV4` | **Bill** | Male | American, deep |

**Get Full Voice List:**
```bash
curl -X GET https://api.elevenlabs.io/v1/voices \
  -H "xi-api-key: YOUR_API_KEY"
```

Or use the service:
```typescript
const voices = await elevenlabsTTSService.getVoices();
```

---

## Models

### Available Models

| Model ID | Speed | Quality | Best For |
|----------|-------|---------|----------|
| **eleven_turbo_v2_5** | ⚡⚡⚡⚡⚡⚡ | ⭐⭐⭐⭐⭐ | **Real-time calls (RECOMMENDED)** |
| **eleven_multilingual_v2** | ⚡⚡⚡⚡ | ⭐⭐⭐⭐⭐⭐ | Multi-language, highest quality |
| **eleven_monolingual_v1** | ⚡⚡⚡ | ⭐⭐⭐⭐⭐ | English only, high quality |

**Recommendation:** Use `eleven_turbo_v2_5` for phone calls (lowest latency)

---

## Performance

### Latency Profile

**ElevenLabs Streaming (Turbo V2.5):**
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

### Comparison with Other Providers

| Provider | TTFB | Total Latency | Quality |
|----------|------|---------------|---------|
| **Deepgram** | 150ms | 1.4-1.55s | ⭐⭐⭐⭐ |
| **ElevenLabs Turbo** | 300ms | 1.65-1.85s | ⭐⭐⭐⭐⭐⭐ |
| **Google Neural2** | 250ms | 1.6-1.75s | ⭐⭐⭐⭐⭐ |
| **OpenAI** | 400ms | 1.8-2.2s | ⭐⭐⭐⭐ |

**Trade-off:** +200-300ms latency vs Deepgram, but significantly better quality

---

## Streaming Implementation

The integration uses **true streaming** for ultra-low latency:

### How It Works

1. **Text Sent to ElevenLabs** → Streaming API with `optimize_streaming_latency: 4`
2. **Audio Chunks Arrive** → MP3 chunks streamed via WebSocket
3. **Real-time Conversion** → Each chunk converted MP3 → PCM
4. **Immediate Transmission** → PCM sent to Exotel (no buffering)

### Code Example

```typescript
// Automatic streaming (handled by exotelVoice.handler)
if (session.config.voiceProvider === 'elevenlabs') {
  const audioDurationMs = await this.streamTTSToExotel(
    client,
    aiResponse,
    session
  );
}

// Manual streaming
await elevenlabsTTSService.synthesizeStreaming(
  "Hello! How can I help you today?",
  async (audioChunk: Buffer) => {
    // Convert MP3 chunk to PCM
    const pcmAudio = await audioConverter.convertToPCM(audioChunk);
    // Send to Exotel immediately
    await sendPCMAudioToExotel(client, pcmAudio, streamSid);
  },
  'EXAVITQu4vr4xnSDxMaL', // Rachel
  'eleven_turbo_v2_5'      // Turbo model
);
```

---

## Voice Settings

### Stability (0.0 - 1.0)
- **Low (0.0-0.4):** More expressive, varies more
- **Medium (0.5):** Balanced (default)
- **High (0.6-1.0):** More consistent, stable

### Similarity Boost (0.0 - 1.0)
- **Low (0.0-0.5):** More creative interpretation
- **Medium (0.75):** Balanced (default)
- **High (0.8-1.0):** Stays closer to original voice

### Style (0.0 - 1.0)
- **Low (0.0):** Neutral, flat delivery
- **Medium (0.5):** Some expression
- **High (1.0):** Maximum expressiveness

### Speaker Boost (boolean)
- **True:** Enhances voice clarity (default)
- **False:** Natural processing

### Example Configurations

**Professional/Corporate:**
```json
{
  "stability": 0.7,
  "similarityBoost": 0.8,
  "style": 0.3,
  "useSpeakerBoost": true
}
```

**Friendly/Casual:**
```json
{
  "stability": 0.5,
  "similarityBoost": 0.75,
  "style": 0.6,
  "useSpeakerBoost": true
}
```

**Dramatic/Expressive:**
```json
{
  "stability": 0.3,
  "similarityBoost": 0.7,
  "style": 0.9,
  "useSpeakerBoost": true
}
```

---

## Testing

### Test ElevenLabs Integration

```bash
# 1. Ensure API key is set
cat backend/.env | grep ELEVENLABS_API_KEY

# 2. Start backend
cd backend
npm run dev

# 3. Watch for initialization
# Look for: "ElevenLabs TTS service initialized"

# 4. Create test agent
curl -X POST http://localhost:5000/api/v1/agents \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT" \
  -d '{
    "name": "ElevenLabs Test Agent",
    "config": {
      "prompt": "You are a friendly assistant.",
      "greetingMessage": "Hello! This is an ElevenLabs test.",
      "voice": {
        "provider": "elevenlabs",
        "voiceId": "EXAVITQu4vr4xnSDxMaL",
        "model": "eleven_turbo_v2_5"
      },
      "language": "en",
      "llm": {
        "model": "gpt-4o-mini",
        "temperature": 0.7
      }
    }
  }'

# 5. Make test call and listen for quality
```

### Expected Logs

```
✅ ElevenLabs TTS service initialized
🎙️ ElevenLabs TTS streaming { textLength: 52, voice: 'EXAVITQu4vr4xnSDxMaL', model: 'eleven_turbo_v2_5' }
⚡ First audio byte { ttfb: '320ms' }
✅ ElevenLabs TTS streaming complete { duration: '1850ms', chunks: 47 }
```

---

## Troubleshooting

### Issue: "ElevenLabs TTS service not available"

**Solution:**
1. Check API key is set: `echo $ELEVENLABS_API_KEY`
2. Verify key starts with `sk_`
3. Restart backend after adding key
4. Check logs for initialization errors

### Issue: High latency (>1s TTFB)

**Solution:**
1. Use `eleven_turbo_v2_5` model (fastest)
2. Check `optimize_streaming_latency` is set to 4
3. Verify network connection to ElevenLabs API
4. Consider upgrading ElevenLabs plan (higher tiers get priority)

### Issue: Audio quality issues

**Solution:**
1. Adjust voice settings (try higher stability)
2. Enable speaker boost: `useSpeakerBoost: true`
3. Try different voices (some work better for certain content)
4. Use `eleven_multilingual_v2` for highest quality

### Issue: Rate limit errors

**Solution:**
1. Check your character limit: `await elevenlabsTTSService.getUserInfo()`
2. Upgrade to higher plan if needed
3. Implement caching for repeated phrases
4. Consider switching to Deepgram for high-volume scenarios

---

## Cost Optimization

### Tips to Reduce Costs

1. **Use for Premium Calls Only**
   - Use Deepgram for standard calls
   - Switch to ElevenLabs for VIP customers

2. **Enable Response Caching**
   - Cache common phrases ("Hello", "Goodbye", etc.)
   - Reuse audio for frequent responses

3. **Optimize Text Length**
   - Keep AI responses concise
   - Set `maxTokens` in LLM config

4. **Monitor Usage**
   ```typescript
   const usage = await elevenlabsTTSService.getUserInfo();
   console.log({
     used: usage.subscription.character_count,
     limit: usage.subscription.character_limit,
     remaining: usage.subscription.character_limit - usage.subscription.character_count
   });
   ```

5. **Hybrid Approach**
   - Greeting: Use cached audio
   - Responses: Use ElevenLabs for quality
   - Goodbye: Use cached audio

---

## Comparison: When to Use Each Provider

### Use **Deepgram** When:
✅ Speed is critical (sub-200ms TTFB needed)
✅ High call volume (cost-effective)
✅ Budget-conscious
✅ Voice quality is "good enough"

### Use **ElevenLabs** When:
✅ Voice quality is top priority
✅ Premium/VIP customers
✅ Marketing/sales calls where impression matters
✅ Budget allows for 5-10x higher cost
✅ Need emotional/expressive voices

### Use **Google Neural2** When:
✅ Need balance of quality and cost
✅ Want more voice options
✅ Existing Google Cloud setup
✅ Need SSML features

---

## API Reference

### ElevenLabsTTSService Methods

```typescript
// Check if service is available
elevenlabsTTSService.isAvailable(): boolean

// Synthesize text (returns complete audio)
await elevenlabsTTSService.synthesizeText(
  text: string,
  voiceId?: string,
  modelId?: string
): Promise<Buffer>

// Stream synthesis with callback (ultra-low latency)
await elevenlabsTTSService.synthesizeStreaming(
  text: string,
  onAudioChunk: (chunk: Buffer) => void | Promise<void>,
  voiceId?: string,
  modelId?: string
): Promise<void>

// Get available voices
await elevenlabsTTSService.getVoices(): Promise<Voice[]>

// Get user info and usage
await elevenlabsTTSService.getUserInfo(): Promise<UserInfo>
```

---

## Examples

### Example 1: Basic Agent Configuration

```json
{
  "name": "Premium Sales Assistant",
  "config": {
    "prompt": "You are a professional sales assistant...",
    "greetingMessage": "Hello! Thank you for calling. How may I assist you today?",
    "voice": {
      "provider": "elevenlabs",
      "voiceId": "21m00Tcm4TlvDq8ikWAM",  // Charlotte (British)
      "model": "eleven_turbo_v2_5"
    },
    "language": "en",
    "llm": {
      "model": "gpt-4o-mini",
      "temperature": 0.7
    }
  }
}
```

### Example 2: Expressive Voice for Entertainment

```json
{
  "voice": {
    "provider": "elevenlabs",
    "voiceId": "MF3mGyEYCl7XYWbV9V6O",  // Elli (emotional)
    "model": "eleven_multilingual_v2",
    "settings": {
      "stability": 0.3,
      "similarityBoost": 0.7,
      "style": 0.9,
      "useSpeakerBoost": true
    }
  }
}
```

### Example 3: Professional Corporate Voice

```json
{
  "voice": {
    "provider": "elevenlabs",
    "voiceId": "pNInz6obpgDQGcFmaJgB",  // Adam (deep, mature)
    "model": "eleven_turbo_v2_5",
    "settings": {
      "stability": 0.7,
      "similarityBoost": 0.8,
      "style": 0.3,
      "useSpeakerBoost": true
    }
  }
}
```

---

## Summary

✅ **Installed:** `@elevenlabs/elevenlabs-js` SDK
✅ **Service:** `backend/src/services/elevenlabsTTS.service.ts`
✅ **Streaming:** Ultra-low latency with chunked delivery
✅ **Integration:** Fully integrated with voice pipeline and Exotel handler
✅ **Quality:** Best-in-market voice synthesis
✅ **Cost:** $250-$330 per 1000 calls (5-10x higher than alternatives)

**Recommendation:** Use ElevenLabs for premium/VIP calls where voice quality is critical. Use Deepgram for standard high-volume calls.

---

**Files Modified:**
- ✅ [elevenlabsTTS.service.ts](../backend/src/services/elevenlabsTTS.service.ts) - New service
- ✅ [voicePipeline.service.ts](../backend/src/services/voicePipeline.service.ts) - Updated to support ElevenLabs
- ✅ [exotelVoice.handler.ts](../backend/src/websocket/handlers/exotelVoice.handler.ts) - Added streaming support
- ✅ [Agent.ts](../backend/src/models/Agent.ts) - Already includes 'elevenlabs' in enum
- ✅ [env.ts](../backend/src/config/env.ts) - Already has ELEVENLABS_API_KEY

**Ready to Use!** Just add your API key to `.env` and configure your agents.

---

**Last Updated:** 2025-01-31
**Status:** ✅ Production Ready
