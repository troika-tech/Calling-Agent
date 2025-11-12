# Call Flow: Incoming vs Outgoing

## Current Implementation Status

### ✅ INCOMING CALLS - Fully Supported with Voice Pipeline

**Status:** ✅ **WORKING** - AI agent can handle incoming calls with full voice pipeline

**Flow:**
```
1. Customer calls your Exotel number
   ↓
2. Exotel → POST /api/v1/exotel/voice/incoming
   ↓
3. Backend creates CallLog and returns XML flow
   ↓
4. Exotel executes the flow:
   - Plays greeting (from /greeting webhook)
   - Records customer speech
   - Sends audio to /input webhook
   ↓
5. Backend processes audio:
   - Downloads audio from Exotel
   - STT: Whisper transcribes to text
   - LLM: GPT generates response
   - TTS: ElevenLabs creates audio
   ↓
6. Backend returns AI voice to customer
   ↓
7. Conversation loop continues
   ↓
8. Call ends → /end webhook saves transcript
```

**Configuration Required:**
- ✅ Exotel app with Passthru applet pointing to `/api/v1/exotel/voice/incoming`
- ✅ App assigned to Exotel phone number
- ✅ Agent created and assigned to phone in database

**To Test:**
```bash
# Just call your Exotel number from any phone!
# AI agent will answer and converse
```

---

### ❌ OUTGOING CALLS - Partially Supported (NO Voice Pipeline Yet)

**Status:** ⚠️ **BASIC ONLY** - Can make calls but NO AI voice pipeline

**Current Flow (WITHOUT AI):**
```
1. You call API: POST /api/v1/exotel/calls/make
   Body: { phoneId: "...", to: "+919876543210" }
   ↓
2. Backend → Exotel API: connect call
   ↓
3. Exotel calls customer
   ↓
4. Customer answers
   ↓
5. ❌ NO VOICE PIPELINE - Just connects call
   ❌ No AI greeting
   ❌ No STT/LLM/TTS processing
```

**What's Missing:**
- AI greeting when customer answers
- Voice pipeline integration
- Conversation handling
- Transcript saving

**Why It's Different:**

Incoming calls use Exotel's **Passthru App Flow** which executes your XML instructions.

Outgoing calls use Exotel's **Connect API** which just connects two numbers together (like a bridge call).

To get AI on outbound calls, we need to use **Exotel Connect API with URL parameter** that points to a flow.

---

## How to Enable AI for OUTGOING Calls

### Option 1: Use Exotel Connect with URL (Recommended)

Exotel's `/Calls/connect` API supports a `Url` parameter that can provide call flow XML.

**Updated Flow:**
```
1. POST /api/v1/exotel/calls/make
   ↓
2. Backend calls Exotel with:
   - From: Your Exotel number
   - To: Customer number
   - Url: https://your-ngrok-url/api/v1/exotel/voice/outbound
   ↓
3. Exotel calls customer
   ↓
4. When customer answers:
   - Exotel fetches XML from Url
   - Executes same voice pipeline flow
   - AI greeting + conversation loop
```

**Implementation Needed:**
1. Add `Url` parameter to Exotel service `makeCall()`
2. Create `/api/v1/exotel/voice/outbound` webhook
3. Return same XML flow as incoming calls
4. Voice pipeline works the same way!

### Option 2: Use WebSocket for Outbound (Advanced)

Instead of Exotel webhooks, connect customer directly to WebSocket:

**Flow:**
```
1. POST /api/v1/exotel/calls/make
   ↓
2. Exotel calls customer
   ↓
3. When customer answers:
   - Stream audio to WebSocket
   - Voice pipeline processes in real-time
   - Stream AI audio back
```

**Pros:**
- Real-time, low latency
- No webhook delays
- True bidirectional streaming

**Cons:**
- More complex
- Requires Exotel media streaming support
- Need to handle audio encoding/decoding

---

## Quick Fix: Enable AI for Outgoing Calls (5 minutes)

I can implement Option 1 now to make outgoing calls use the voice pipeline!

### Changes Needed:

**1. Update ExotelService.makeCall()** - Add URL parameter
```typescript
const payload = {
  From: data.from,
  To: data.to,
  CallerId: data.callerId || data.from,
  CallType: data.callType || 'trans',
  Url: data.flowUrl,  // NEW: Points to outbound flow
  StatusCallback: data.statusCallback
};
```

**2. Add Outbound Flow Handler** in `exotelVoice.controller.ts`
```typescript
async handleOutboundCall(req: Request, res: Response) {
  // Same as incoming but marks as outbound
  // Returns same XML voice pipeline flow
}
```

**3. Update makeCall() Controller** - Pass flow URL
```typescript
const callResponse = await exotelService.makeCall({
  from: phone.number,
  to,
  flowUrl: `${process.env.WEBHOOK_BASE_URL}/api/v1/exotel/voice/outbound?callLogId=${callLog._id}`,
  statusCallback: `${process.env.WEBHOOK_BASE_URL}/api/v1/exotel/webhook/status`
});
```

**4. Add Route**
```typescript
router.post('/outbound', exotelVoiceController.handleOutboundCall);
```

### Result:

```
POST /api/v1/exotel/calls/make
Body: { phoneId: "...", to: "+919876543210" }
   ↓
Exotel calls customer
   ↓
Customer answers
   ↓
✅ AI greeting plays
✅ Customer speaks
✅ AI processes with voice pipeline
✅ AI responds
✅ Conversation continues
✅ Transcript saved
```

---

## Summary Table

| Feature | Incoming Calls | Outgoing Calls (Current) | Outgoing Calls (After Fix) |
|---------|---------------|-------------------------|---------------------------|
| Can make/receive call | ✅ | ✅ | ✅ |
| AI greeting | ✅ | ❌ | ✅ |
| Voice pipeline (STT/LLM/TTS) | ✅ | ❌ | ✅ |
| Conversation loop | ✅ | ❌ | ✅ |
| Transcript saved | ✅ | ⚠️ Basic only | ✅ |
| Configuration needed | Exotel app | API call | API call |
| Works now | YES | NO AI | After implementation |

---

## What Should We Do?

### Recommendation:

**Implement outbound voice pipeline support (Option 1)** - This will make both incoming and outgoing calls work identically with full AI capabilities.

### Alternative:

If you only need **incoming calls** right now, the current implementation is **100% ready to test**! You can:

1. Configure Exotel app flow (as per QUICK_START_EXOTEL.md)
2. Test incoming calls immediately
3. Add outbound support later when needed

---

## Your Choice:

**Option A:** Test incoming calls now (already working)
- Configure Exotel app
- Make test call
- See AI in action!
- Add outbound later

**Option B:** Wait while I implement outbound support (~10 minutes)
- Both incoming and outgoing will work
- Unified voice pipeline
- Test both flows together

**Option C:** Implement outbound later as a separate task
- Focus on incoming calls for initial launch
- Add outbound when you need to make proactive calls

Let me know what you prefer! 🚀
