# Deploy Deepgram Integration - Step by Step

## Your Deepgram API Key (Already Added)
```
DEEPGRAM_API_KEY=48babbf80459d5ce6db3bfccaa9b7c20bfb7981a
```

---

## Step 1: SSH to Production Server

```bash
ssh -i "C:\Users\USER\.ssh\calling-agent.pem" ubuntu@calling-api.0804.in
```

---

## Step 2: Update .env File on Server

```bash
# Navigate to backend directory
cd ~/calling-agent/backend

# Edit .env file
nano .env

# Add this line if not present (or verify it exists):
DEEPGRAM_API_KEY=48babbf80459d5ce6db3bfccaa9b7c20bfb7981a

# Save: Ctrl+X, then Y, then Enter
```

---

## Step 3: Pull Latest Code

```bash
# Go to project root
cd ~/calling-agent

# Pull from GitHub
git pull origin main
```

Expected output:
```
remote: Enumerating objects: ...
Updating 0259c64..31d0511
Fast-forward
 4 files changed, 754 insertions(+)
 create mode 100644 DEEPGRAM_SPEED_FIX.md
 create mode 100644 backend/src/services/deepgram.service.ts
```

---

## Step 4: Build TypeScript

```bash
cd backend
npm run build
```

Expected output:
```
> ai-calling-platform-backend@1.0.0 build
> tsc
```

No errors = successful build ✅

---

## Step 5: Restart PM2

```bash
pm2 restart calling-agent
```

Expected output:
```
[PM2] Applying action restartProcessId on app [calling-agent]
[PM2] [calling-agent](0) ✓
```

---

## Step 6: Verify Deepgram Initialization

```bash
pm2 logs calling-agent --lines 50
```

**Look for these SUCCESS indicators:**

```
✅ [info]: Deepgram service initialized
✅ [info]: Server listening on port 5000
✅ [info]: WebSocket server running
```

**Do NOT see this:**

```
❌ [warn]: Deepgram API key not configured - falling back to Whisper
```

If you see the warning, the API key is missing or incorrect in server's `.env` file.

---

## Step 7: Test with a Call

1. **Call your Exotel number**

2. **Wait for greeting**: "Hello! How can I help you today?"

3. **Ask a clear question**: "What can you help me with?"

4. **Expected**: You should hear AI response within **2-3 seconds** (not 12+ seconds)

---

## Step 8: Check Logs During Call

In another terminal, watch logs in real-time:

```bash
ssh -i "C:\Users\USER\.ssh\calling-agent.pem" ubuntu@calling-api.0804.in
pm2 logs calling-agent
```

**What you should see:**

```
[info]: WebSocket connection established { clientId: 'ws_...' }
[info]: Processing user speech { audioSize: 12800 }
[info]: Using Deepgram for fast transcription ✅
[info]: Deepgram transcription completed {
  text: "What can you help me with?",
  confidence: 0.98,
  duration: "734ms" ✅ ← THIS IS THE KEY!
}
[info]: Streaming LLM response
[info]: Synthesizing sentence
[info]: Streaming PCM audio to Exotel
[info]: AI response streaming completed
```

**Key metric**: `"duration": "734ms"` (not `"7834ms"`)

---

## Success Criteria

✅ **Deepgram initialized** - See "Deepgram service initialized" in logs
✅ **Fast transcription** - Duration < 1000ms (not 8000ms)
✅ **Quick response** - User hears AI within 3 seconds
✅ **Accurate transcription** - Text matches what was said
✅ **No errors** - No WebSocket disconnections

---

## Troubleshooting

### Problem: Still seeing "falling back to Whisper"

**Solution:**
```bash
# Check if API key is in .env
cat ~/calling-agent/backend/.env | grep DEEPGRAM

# Should show:
# DEEPGRAM_API_KEY=48babbf80459d5ce6db3bfccaa9b7c20bfb7981a

# If missing, add it:
cd ~/calling-agent/backend
nano .env
# Add the key
# Save and restart:
pm2 restart calling-agent
```

### Problem: Build fails with TypeScript errors

**Solution:**
```bash
# Clean and rebuild
cd ~/calling-agent/backend
rm -rf dist
npm run build

# If still fails, check Git is up to date
cd ~/calling-agent
git status
git pull origin main
```

### Problem: PM2 won't restart

**Solution:**
```bash
# Check PM2 status
pm2 status

# If not running, start it
pm2 start calling-agent

# If process doesn't exist
cd ~/calling-agent/backend
pm2 start dist/server.js --name calling-agent
```

### Problem: Still slow (8+ seconds)

**Check logs for**:
```bash
pm2 logs calling-agent | grep "transcription completed"
```

If you see `"duration": "7834ms"`, Deepgram is NOT being used.

**Fix**:
1. Verify API key in server .env
2. Restart PM2
3. Check for "Deepgram service initialized" at startup

---

## Performance Comparison

| Before (Whisper) | After (Deepgram) |
|------------------|------------------|
| 8000ms transcription | 800ms transcription |
| 12+ seconds total | 3 seconds total |
| User hangs up | User gets answer |

---

## Quick Commands Reference

```bash
# SSH to server
ssh -i "C:\Users\USER\.ssh\calling-agent.pem" ubuntu@calling-api.0804.in

# Deploy
cd ~/calling-agent && git pull origin main
cd backend && npm run build && pm2 restart calling-agent

# Watch logs
pm2 logs calling-agent

# Check Deepgram usage
pm2 logs calling-agent | grep -i deepgram

# Check transcription speed
pm2 logs calling-agent | grep "transcription completed"
```

---

## What Happens Next

After successful deployment:

1. **Immediate**: 10x faster transcription (800ms vs 8000ms)
2. **User experience**: Responses in 3 seconds (vs 12+ seconds)
3. **Reliability**: Fewer dropped calls (users don't wait as long)
4. **Cost**: $21.50/month for 5,000 minutes (cheaper than alternatives)

---

## Next Steps (Optional Optimizations)

Once this is working well:

1. **Faster TTS**: Try Cartesia instead of ElevenLabs (100ms vs 1000ms)
2. **Model optimization**: Use GPT-3.5-turbo for even faster responses
3. **Caching**: Cache common questions/responses
4. **Parallel processing**: Start LLM while transcription finishes
5. **Real-time streaming**: Implement Deepgram live streaming API

But first - let's get this deployed and working! 🚀
