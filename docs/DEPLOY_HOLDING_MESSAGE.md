# Deploy Holding Message Fix - Quick Guide

## What Changed

Added a "please wait" holding message that plays IMMEDIATELY when the user stops speaking, keeping the call active during AI processing (which takes 12+ seconds).

**Before**: User speaks → 12 seconds of silence → Call times out ❌

**After**: User speaks → "Just a moment please" → 10 seconds → AI response ✅

---

## Deployment Commands

```bash
# SSH to EC2 server
ssh -i "C:\Users\USER\.ssh\calling-agent.pem" ubuntu@calling-api.0804.in

# Navigate to project
cd ~/calling-agent

# Pull latest code
git pull origin main

# Build TypeScript
cd backend
npm run build

# Restart PM2
pm2 restart calling-agent

# Watch logs
pm2 logs calling-agent --lines 100
```

---

## Testing the Fix

1. **Make a test call** to your Exotel number

2. **Wait for greeting**: "Hello! How can I help you today?"

3. **Ask a question clearly**: "What can you help me with?"

4. **Stop speaking and wait** (don't say anything else)

5. **You should hear**: "Just a moment please." (or "Let me check that for you." or "One second." or "Please hold.")
   - This plays within 2-3 seconds after you stop speaking

6. **Keep waiting** (stay on line, DO NOT mute your mic)

7. **You should hear**: The actual AI response to your question
   - This takes another 10-12 seconds

---

## What to Look For in Logs

### Successful Flow:
```
[info]: Processing user speech
[info]: Sending holding message to keep call active { message: 'Just a moment please.' }
[info]: Generating speech with OpenAI
[info]: Streaming PCM audio to Exotel
[info]: Holding message sent successfully
[info]: Converting Exotel PCM to WAV for Whisper
[info]: Audio transcription completed
[info]: Streaming LLM response
[info]: AI response streaming completed
```

### Key Indicators:
- ✅ "Sending holding message to keep call active"
- ✅ "Holding message sent successfully"
- ✅ WebSocket stays open (no readyState: 3 errors)

---

## Common Issues

### Issue: Still not hearing AI response
**Possible causes**:
1. Muting microphone after speaking (DON'T do this!)
2. Hanging up too early (wait at least 20 seconds)
3. Holding message TTS fails (check logs for warnings)

**Solution**: Stay on call with mic UNMUTED for at least 20 seconds after speaking

### Issue: Holding message not playing
**Check logs for**:
```
[warn]: Failed to send holding message (non-critical)
```
This means TTS or audio conversion failed for the holding message. The system will continue processing but without the holding message.

---

## Rollback (If Needed)

If this causes issues:

```bash
cd ~/calling-agent
git log --oneline -5  # Find previous commit hash
git checkout <previous-commit-hash>
cd backend
npm run build
pm2 restart calling-agent
```

---

## Next Steps (If This Works)

1. **Optimize Processing Speed**:
   - Use faster TTS (Cartesia instead of ElevenLabs)
   - Use gpt-3.5-turbo instead of gpt-4o-mini
   - Implement parallel processing

2. **Better Holding Messages**:
   - Make them more contextual
   - Use different messages for different agent types
   - Add configurable holding messages per agent

3. **Progress Indicators**:
   - For very long processing (15+ seconds)
   - Add second holding message: "Still working on that..."

---

## File Changed

- `backend/src/websocket/handlers/exotelVoice.handler.ts`
  - Added `sendHoldingMessage()` function (lines 364-404)
  - Modified `processUserSpeech()` to call it first (line 389)

---

## Support

If issues persist after this fix, provide:
1. PM2 logs showing the full call flow
2. Confirmation that you heard the holding message
3. How long you stayed on the call

**Commit**: `0259c64` - Add holding message to prevent call timeouts during AI processing
