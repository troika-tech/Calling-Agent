# Quick Start - WebSocket Voice Pipeline Testing

## 🚀 Quick Test (3 Steps)

### 1. Get a User ID

**Register a new user:**
```bash
curl -X POST http://localhost:5000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"test@example.com\",\"password\":\"Test@1234\",\"name\":\"Test User\"}"
```

Copy the `user.id` from the response.

### 2. Create Test Data

```bash
node test-setup.js <YOUR_USER_ID>
```

Example:
```bash
node test-setup.js 507f1f77bcf86cd799439011
```

Copy the **Agent ID** and **Call Log ID** from the output.

### 3. Test in Browser

1. Open `test-websocket.html` in Chrome
2. Click **Connect**
3. Paste the Agent ID and Call Log ID
4. Click **Initialize Session**
5. Try **Send Text** or **Start Recording**

## 📋 What You Should See

**Server Console:**
```
[info]: WebSocket server initialized { path: "/ws" }
[info]: Server started successfully {
  port: 5000,
  websocket: "ws://localhost:5000/ws"
}
```

**Browser Console (when session initializes):**
```
[12:34:56] Connecting to ws://localhost:5000/ws...
[12:34:56] WebSocket connected!
[12:34:56] Initializing session...
[12:34:57] Session initialized: Test Voice Agent
[12:34:57] Playing audio response
```

**Expected Flow:**
1. Connect → Green status "Connected"
2. Init → First message plays automatically
3. Send text → See LLM response in text
4. Record audio → Full STT → LLM → TTS pipeline

## 🐛 Quick Troubleshooting

| Problem | Solution |
|---------|----------|
| Won't connect | Check server is running on port 5000 |
| "Agent not found" | Run `node test-setup.js <userId>` again |
| No audio playback | Check browser console, verify ElevenLabs API key |
| Microphone error | Grant permissions, try Chrome |

## 📁 Files Created

- `test-websocket.html` - Interactive test client
- `test-setup.js` - Creates test data
- `WEBSOCKET_TESTING.md` - Full testing guide

## ✅ Success Checklist

- [ ] WebSocket connects (green status)
- [ ] Session initializes
- [ ] First message plays
- [ ] Text input works
- [ ] Audio recording works
- [ ] AI responds with voice

## 🔗 WebSocket URL

```
ws://localhost:5000/ws
```

## 📖 Full Documentation

See `WEBSOCKET_TESTING.md` for detailed testing guide.
