# Deploy Deepgram TTS to Production

## Why This Update?

### Current Issue
- **Greeting works** ✅
- **AI processes requests** ✅
- **But WebSocket closes before response** ❌

### Root Cause
ElevenLabs TTS is too slow:
- **TTFB**: 1400ms (Time To First Byte)
- **Total processing**: 6 seconds (transcribe 2s + LLM 2s + TTS 1.4s)
- **Exotel timeout**: WebSocket closes before response ready

### Solution: Deepgram TTS
- **TTFB**: <200ms (7× faster)
- **Cost**: $0.030 per 1000 chars (10× cheaper)
- **Format**: Linear PCM native (no conversion needed)
- **Expected result**: Responses in ~3 seconds (within Exotel timeout)

---

## Deployment Steps

### 1. SSH to Production Server

```bash
ssh ubuntu@calling-api.0804.in
```

### 2. Navigate to Project

```bash
cd /var/www/calling-agent
```

### 3. Pull Latest Code

```bash
git pull origin main
```

You should see these new commits:
- ✅ Add Deepgram streaming TTS service
- ✅ Update voice pipeline to support Deepgram
- ✅ Add detailed v2 logging
- ✅ Make cache init non-blocking
- ✅ Add script to update agents

### 4. Install Deepgram SDK

```bash
cd backend
npm install @deepgram/sdk
```

### 5. Build TypeScript

```bash
npm run build
```

### 6. Update Agent to Use Deepgram

```bash
node update-agent-to-deepgram.js
```

Expected output:
```
✅ Connected to MongoDB
📋 Found 1 agents using ElevenLabs

🔄 Updating agent: Customer Support AI
   Old provider: elevenlabs
   Old voice: 21m00Tcm4TlvDq8ikWAM
   ✅ New provider: deepgram
   ✅ New voice: aura-asteria-en

✅ Successfully updated 1 agents to Deepgram TTS
💰 Cost savings: 10× cheaper ($0.030 vs $0.30 per 1000 chars)
⚡ Speed improvement: Sub-200ms TTFB vs 1400ms
```

### 7. Restart PM2

```bash
cd ..
pm2 restart calling-agent
```

### 8. Monitor Logs

```bash
pm2 logs calling-agent --lines 100
```

Look for these new v2 logs on startup:
```
🏗️ Starting cache init (v2) { provider: 'deepgram' }
✅ Cached message (v2) { message: 'Just a moment please.', count: '1/4' }
✅ Cached message (v2) { message: 'Let me check that for you.', count: '2/4' }
✅ Cached message (v2) { message: 'One second.', count: '3/4' }
✅ Cached message (v2) { message: 'Please hold.', count: '4/4' }
🎉 CACHE INIT COMPLETE (v2) { cached: 4, total: 4, duration: '800ms' }
```

### 9. Make Test Call

Call the Exotel number: **07948516111**

### 10. Check Logs During Call

You should see:
```
🔌 INIT CONNECTION (v2)
✅ STARTING SESSION (v2)
✅ AGENT LOADED (v2) { agentName: 'Customer Support AI' }
📞 CALL STARTED (v2)
🎤 GENERATING GREETING (v2) { provider: 'deepgram', voiceId: 'aura-asteria-en' }
✅ GREETING AUDIO READY (v2)
✅ GREETING SENT (v2)
✅ INIT COMPLETE (v2)
```

When you speak:
```
🛑 STOP (v2)
⚡ PROCESSING (v2)
💬 HOLDING MSG (v2) { message: 'Just a moment please.', cached: true }
✅ HOLDING SENT (v2)
🎤 PROCESS START (v2)
🎙️ TRANSCRIBING (v2)
👤 USER (v2): { transcript: 'your question' }
🤖 AI (v2): { response: 'AI answer' }
```

---

## Expected Results

### Before (ElevenLabs)
```
11:17:47 - Stop event + Disconnect
11:17:48 - Holding message ready (1s later) ❌ WebSocket CLOSED
11:17:53 - AI response ready (6s later) ❌ WebSocket CLOSED
Result: Only hear greeting, no AI response
```

### After (Deepgram)
```
11:17:47 - Stop event
11:17:47 - Holding message sent (0ms - from cache) ✅
11:17:48 - Transcription done (1s) ✅
11:17:49 - AI response ready (2s total) ✅
11:17:49 - Audio sent successfully ✅
Result: Hear greeting + AI response within 2-3 seconds
```

---

## Troubleshooting

### If Cache Init Fails

Check if Deepgram API key is set:
```bash
grep DEEPGRAM_API_KEY /var/www/calling-agent/backend/.env
```

If missing, add it:
```bash
echo "DEEPGRAM_API_KEY=your_deepgram_api_key" >> /var/www/calling-agent/backend/.env
pm2 restart calling-agent
```

### If Still Using ElevenLabs

Check agent configuration:
```bash
node -e "require('dotenv').config(); const mongoose = require('mongoose'); mongoose.connect(process.env.MONGODB_URI).then(async () => { const Agent = mongoose.model('Agent', new mongoose.Schema({ name: String, config: Object })); const agents = await Agent.find({}); console.log(agents.map(a => ({ name: a.name, provider: a.config.voice.provider }))); process.exit(0); })"
```

Should show:
```json
[{ "name": "Customer Support AI", "provider": "deepgram" }]
```

If still showing `"elevenlabs"`, run the update script again:
```bash
cd /var/www/calling-agent/backend
node update-agent-to-deepgram.js
pm2 restart calling-agent
```

### If WebSocket Still Closes Early

This means processing is still taking >5 seconds. Check logs for:
- Transcription time (should be <1s with Deepgram)
- LLM response time (should be 1-2s)
- TTS time (should be <200ms with Deepgram)

If any step is slow, check:
```bash
# Check network latency to APIs
ping api.deepgram.com
ping api.openai.com

# Check CPU usage
top
```

---

## Rollback (If Needed)

If Deepgram causes issues, rollback to ElevenLabs:

```bash
cd /var/www/calling-agent
git log --oneline -5  # Find commit before Deepgram
git checkout <commit-hash>
cd backend
npm install
npm run build
pm2 restart calling-agent
```

Then update agent back to ElevenLabs:
```javascript
// In mongo shell or script
db.agents.updateOne(
  { name: "Customer Support AI" },
  { $set: {
    "config.voice.provider": "elevenlabs",
    "config.voice.voiceId": "21m00Tcm4TlvDq8ikWAM"
  }}
)
```

---

## Success Criteria

✅ **Cache initializes on startup** - See 🎉 CACHE INIT COMPLETE in logs
✅ **Greeting uses Deepgram** - See `provider: 'deepgram'` in logs
✅ **Holding message is cached** - See `cached: true` in logs
✅ **Responses arrive within 3 seconds** - Check timestamps in logs
✅ **User hears AI responses** - Test with actual call

---

## Performance Comparison

| Metric | ElevenLabs | Deepgram | Improvement |
|--------|------------|----------|-------------|
| TTFB | 1400ms | <200ms | **7× faster** |
| Cost | $0.30/1k | $0.030/1k | **10× cheaper** |
| Format | MP3 (convert) | PCM (native) | **No conversion** |
| Caching | Slow | Fast | **Instant** |
| Total Time | 6s | ~2-3s | **2× faster** |

---

## Next Steps After Deployment

1. **Monitor first 10 calls** - Check logs for any errors
2. **Test different questions** - Verify AI responds correctly
3. **Check call quality** - Ensure Deepgram voice sounds good
4. **Monitor costs** - Should see 10× reduction in TTS costs
5. **Optimize further** - Consider streaming LLM responses

---

## Support

If issues persist after deployment:
- Check PM2 logs: `pm2 logs calling-agent --lines 200`
- Check system resources: `htop`
- Verify API keys: `cat backend/.env | grep API_KEY`
- Test Deepgram: `curl https://api.deepgram.com/v1/listen -H "Authorization: Bearer $DEEPGRAM_API_KEY"`

Good luck! 🚀
