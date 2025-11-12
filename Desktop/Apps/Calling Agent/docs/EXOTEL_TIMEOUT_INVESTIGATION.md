# Exotel Timeout Investigation

## The Problem

User waits 40 seconds after speaking, but WebSocket closes at 2 seconds (when user stops speaking).

## Evidence from Logs

```
07:30:43 - User stops speaking (47 seconds into call)
07:30:43 - WebSocket disconnects (readyState: 3)
07:30:43 - Stop event received
```

**Key observation**: The disconnect happens at the EXACT timestamp the user stops speaking.

## Possible Causes

### 1. Exotel Voicebot Inactivity Timeout

Exotel may have a built-in timeout for silence. If no audio is sent/received for X seconds, it ends the call.

**Common timeout values**:
- 2-3 seconds of complete silence
- 5 seconds of no audio from bot
- 10 seconds of no input from user

### 2. User Behavior Misinterpretation

When user stops speaking, Exotel might interpret this as:
- End of conversation
- User hung up
- No more input expected

### 3. Missing "mark" Events

WebSocket protocols often use "mark" or "ping" events to keep connection alive. We might not be sending these.

## Solutions

### Solution 1: Send Audio Immediately (Current Fix)

Send "Just a moment please" within 2 seconds to prevent timeout.

**Status**: Implemented but NOT deployed to server yet!

### Solution 2: Send Silence/Comfort Noise

Send empty audio frames or comfort noise to keep stream active.

```typescript
// Send silence chunks every 500ms while processing
const silenceInterval = setInterval(() => {
  if (session.isProcessing) {
    const silenceChunk = Buffer.alloc(320).fill(0); // 20ms of silence
    this.sendAudioToExotel(client, silenceChunk, session.streamSid);
  }
}, 500);
```

### Solution 3: Configure Exotel Timeout

Check if Exotel Voicebot has configurable timeout settings.

**Action needed**: Check Exotel Voicebot configuration panel for timeout settings.

### Solution 4: Send "mark" Events

Some WebSocket protocols need periodic "mark" events:

```typescript
// Send mark event every second
const markMessage = {
  event: 'mark',
  stream_sid: session.streamSid,
  mark: {
    name: 'processing'
  }
};
client.send(JSON.stringify(markMessage));
```

## Recommendation

**Deploy the current fix FIRST** (holding message), then if it still fails, try Solution 2 (silence chunks).

The holding message should send audio within 2 seconds, which should prevent Exotel from timing out.

## Testing Plan

1. Deploy holding message fix
2. Make test call
3. Check if holding message plays within 2 seconds
4. Check if AI response plays afterward
5. If still fails, implement silence chunk sending

## Exotel Voicebot Documentation

Need to check:
- What is the default inactivity timeout?
- Can it be configured?
- Are there keep-alive mechanisms?
- What triggers call termination?

**Action**: Check Exotel Voicebot applet settings for timeout configuration.
