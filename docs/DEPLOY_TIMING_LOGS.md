# Deploy Enhanced Timing Logs - Diagnose Call Flow

## What This Does

Adds comprehensive timing logs to track the **exact sequence** of events during a call to diagnose why audio isn't being heard.

### Key Timing Logs Added

1. **🔔 SILENCE DETECTED** - When 800ms of silence triggers holding message
2. **🛑 STOP EVENT RECEIVED** - When Exotel sends stop event
3. **⚡ STARTING HOLDING MESSAGE** - When holding message begins
4. **✅ HOLDING MESSAGE SENT** - When holding message completes
5. **🔌 WEBSOCKET DISCONNECTED** - When WebSocket closes

---

## Deploy Commands

```bash
# SSH to server
ssh -i "C:\Users\USER\.ssh\calling-agent.pem" ubuntu@calling-api.0804.in

# Pull latest code
cd ~/calling-agent && git pull origin main

# Build TypeScript
cd backend && npm run build

# Restart PM2
pm2 restart calling-agent

# Watch logs
pm2 logs calling-agent --lines 50
```

---

## What to Look For in Logs

### Scenario 1: Silence Detection Wins (DESIRED) ✅

This is what we WANT to see - silence detection fires BEFORE stop event:

```
08:45:00.000 - User stops speaking (last media event)
08:45:00.800 - 🔔 SILENCE DETECTED { timeSinceLastSpeech: "800ms" }
08:45:00.801 - ⚡ STARTING HOLDING MESSAGE { cacheAvailable: true }
08:45:00.850 - ✅ HOLDING MESSAGE SENT { duration: "49ms" }
08:45:01.500 - 🛑 STOP EVENT RECEIVED { timeSinceLastSpeech: "1500ms" }
08:45:01.500 - ⚡ STARTING HOLDING MESSAGE { cacheAvailable: true } (duplicate attempt, ok)
08:45:02.000 - 🔌 WEBSOCKET DISCONNECTED
```

**What this means**:
- ✅ Silence detection fired at 800ms
- ✅ Holding message sent within 50ms (from cache)
- ✅ Stop event came later at 1500ms
- ✅ We beat Exotel's timeout!
- **User SHOULD hear holding message**

---

### Scenario 2: Stop Event Wins (PROBLEM) ❌

This is what we're trying to AVOID:

```
08:45:00.000 - User stops speaking (last media event)
08:45:00.500 - 🛑 STOP EVENT RECEIVED { timeSinceLastSpeech: "500ms" }
08:45:00.501 - ⚡ STARTING HOLDING MESSAGE { cacheAvailable: true }
08:45:00.550 - 🔌 WEBSOCKET DISCONNECTED (too early!)
08:45:00.600 - ✅ HOLDING MESSAGE SENT { duration: "99ms" } (but call already ended!)
```

**What this means**:
- ❌ Stop event came at 500ms (before 800ms silence threshold)
- ❌ WebSocket closed immediately after stop event
- ❌ Holding message sent, but call already terminated
- **User DOESN'T hear holding message**

---

### Scenario 3: User Hangs Up Immediately ⚠️

```
08:45:00.000 - User stops speaking
08:45:00.100 - 🛑 STOP EVENT RECEIVED { timeSinceLastSpeech: "100ms" }
08:45:00.100 - 🔌 WEBSOCKET DISCONNECTED (instant!)
```

**What this means**:
- User hung up phone immediately
- No way to send audio (call ended by user)
- This is expected behavior

---

## Test Call Procedure

### Step 1: Make the Call
1. Call your Exotel number
2. Wait for greeting: "Hello! How can I help you today?"

### Step 2: Ask Question and STAY ON LINE
3. Ask: "What services do you offer?"
4. **IMPORTANT**: Stay silent and keep call connected for at least 10 seconds
5. Do NOT hang up
6. Listen carefully for any audio

### Step 3: Check Logs Immediately

```bash
pm2 logs calling-agent | grep -E "(🔔|🛑|⚡|✅|🔌)"
```

Or for detailed timing:

```bash
pm2 logs calling-agent | grep -E "(SILENCE DETECTED|STOP EVENT|STARTING HOLDING|HOLDING MESSAGE SENT|WEBSOCKET DISCONNECTED)"
```

---

## Understanding the Race Condition

### The Problem
We have TWO timers racing:

**Our Timer** (Silence Detection):
- Starts when user stops speaking
- Fires after 800ms
- Sends holding message

**Exotel's Timer** (Stop Event):
- Starts when user stops speaking
- Fires after ~1-1.5 seconds (estimated)
- Sends stop event → closes WebSocket

### The Goal
Our 800ms timer must fire BEFORE Exotel's ~1-1.5s timer.

**If we win**: User hears holding message ✅
**If Exotel wins**: Call ends before audio sent ❌

### Current Settings
- `SILENCE_THRESHOLD = 800ms` (line 78 in exotelVoice.handler.ts)
- This gives us a ~700ms head start before Exotel's estimated timeout

---

## Interpreting Results

### If User HEARS Holding Message
**Expected logs**:
```
🔔 SILENCE DETECTED { timeSinceLastSpeech: "800ms" }
✅ HOLDING MESSAGE SENT { duration: "50ms" }
🛑 STOP EVENT RECEIVED { timeSinceLastSpeech: "1200ms" }
```

**Conclusion**: Fix is working! Silence detection beats stop event.

**Next step**: Verify full AI response also plays after holding message.

---

### If User DOESN'T Hear Holding Message
**Expected logs**:
```
🛑 STOP EVENT RECEIVED { timeSinceLastSpeech: "600ms" }
🔌 WEBSOCKET DISCONNECTED { timeSinceLastSpeech: "600ms" }
```

**Conclusion**: Exotel's timeout is more aggressive than expected (<800ms).

**Next step**: Reduce `SILENCE_THRESHOLD` to 400ms or 500ms to beat it.

---

### If Logs Show Stop Event But Audio Sent Successfully
**Expected logs**:
```
🛑 STOP EVENT RECEIVED { timeSinceLastSpeech: "900ms" }
⚡ STARTING HOLDING MESSAGE { cacheAvailable: true }
✅ HOLDING MESSAGE SENT { duration: "48ms", timeSinceStopEvent: "48ms" }
🔌 WEBSOCKET DISCONNECTED { timeSinceLastSpeech: "1500ms" }
```

**Conclusion**: Holding message sent after stop event but before disconnect.

**Analysis**: WebSocket stays open for ~600ms after stop event, giving us time to send.

**Result**: This might actually work! Check if user heard audio.

---

## Timing Analysis Table

| Event | Expected Timing | Log Indicator |
|-------|----------------|---------------|
| User stops speaking | 0ms | (Last media event) |
| Silence detection | 800ms | 🔔 SILENCE DETECTED |
| Holding msg cached | 850ms | ✅ HOLDING MESSAGE SENT |
| Stop event (estimated) | 1000-1500ms | 🛑 STOP EVENT RECEIVED |
| WebSocket close | 1500-2000ms | 🔌 WEBSOCKET DISCONNECTED |

**Goal**: Holding message sent (850ms) < Stop event (~1200ms) ✅

---

## Troubleshooting

### Issue: No Timing Logs Appearing

**Check**:
```bash
pm2 logs calling-agent | grep "SILENCE\|STOP\|HOLDING\|DISCONNECTED"
```

**If empty**: Build/restart didn't pick up new code.

**Fix**:
```bash
cd ~/calling-agent/backend
npm run build
pm2 restart calling-agent
```

---

### Issue: Silence Detection Never Fires

**Logs show**:
```
🛑 STOP EVENT RECEIVED { timeSinceLastSpeech: "600ms" }
(No 🔔 SILENCE DETECTED)
```

**Cause**: Stop event arrives before 800ms silence threshold.

**Fix**: Reduce threshold in `exotelVoice.handler.ts` line 78:
```typescript
private readonly SILENCE_THRESHOLD = 500; // Reduced from 800
```

Then rebuild and redeploy.

---

### Issue: Cache Not Available

**Logs show**:
```
⚡ STARTING HOLDING MESSAGE { cacheAvailable: false }
```

**Cause**: Cache initialization failed or not run yet.

**Check**:
```bash
pm2 logs calling-agent | grep -i "cache"
```

**Expected**:
```
[info]: Initializing holding message audio cache...
[info]: Cached holding message { message: "Just a moment please." }
[info]: Cached holding message { message: "Let me check that for you." }
[info]: Cached holding message { message: "One second." }
[info]: Cached holding message { message: "Please hold." }
[info]: Holding message cache initialized { cachedCount: 4 }
```

**If missing**: Cache initialization errored. Check ElevenLabs API key and credits.

---

## Success Criteria

**Minimum Success** (Phase 1):
- [ ] 🔔 SILENCE DETECTED fires at 800ms
- [ ] ✅ HOLDING MESSAGE SENT within 100ms
- [ ] Holding message sent BEFORE stop event
- [ ] User reports hearing "One second" or similar

**Full Success** (Phase 2):
- [ ] Holding message plays
- [ ] Full AI response plays after holding message
- [ ] Call completes naturally (not cut off)

---

## Next Steps Based on Results

### If Silence Detection Wins (Timing Good)
- User should hear holding message
- If not, check Exotel call recording for audio issues
- May need to investigate audio format/quality

### If Stop Event Wins (Timing Bad)
- Reduce `SILENCE_THRESHOLD` to 500ms or 400ms
- Redeploy and test again
- Continue reducing until we beat Exotel's timeout

### If Timing Good But Still No Audio
- Investigate Exotel Voicebot applet settings
- Check if bidirectional audio is enabled
- Verify WebSocket URL is correct
- Review Exotel dashboard for call recordings

---

## Rollback

If issues occur:

```bash
cd ~/calling-agent
git log --oneline -5  # Find previous commit
git checkout <previous-commit-hash>
cd backend && npm run build
pm2 restart calling-agent
```

---

## Summary

**What We're Testing**: Does our 800ms silence threshold fire BEFORE Exotel's stop event?

**How We'll Know**: Logs will show exact timing of all events in milliseconds.

**Expected Outcome**:
- Silence detection at 800ms
- Stop event at 1200ms+
- Holding message heard by user

**If It Doesn't Work**: We'll know exactly how fast we need to be (logs will show Exotel's actual timeout).

---

**Commit**: `50eb97c` - Add comprehensive timing logs to diagnose Exotel call flow

Ready to deploy and test! 🚀
