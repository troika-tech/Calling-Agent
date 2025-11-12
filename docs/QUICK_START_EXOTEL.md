# Quick Start - Get ngrok URL and Configure Exotel

## Step 1: Get Your ngrok Webhook URL

### Option A: ngrok Web Dashboard (Easiest)
1. **Open your browser**
2. **Navigate to**: `http://localhost:4040`
3. **Look for** the "Forwarding" section
4. **Copy the HTTPS URL** (it looks like this):
   ```
   https://1234-56-78-90-12.ngrok-free.app
   ```
5. **This is your base URL!**

### Option B: Check ngrok in Terminal
If you see the ngrok terminal, look for a line like:
```
Forwarding  https://1234-56-78-90-12.ngrok-free.app -> http://localhost:5000
```

## Step 2: Build Your Webhook URL

Take your ngrok URL and add the endpoint:

**Your ngrok URL:**
```
https://YOUR-NGROK-URL.ngrok-free.app
```

**Your Exotel Webhook URL:**
```
https://YOUR-NGROK-URL.ngrok-free.app/api/v1/exotel/voice/incoming
```

**Example:**
If ngrok gave you: `https://abc123.ngrok-free.app`

Your webhook URL is: `https://abc123.ngrok-free.app/api/v1/exotel/voice/incoming`

## Step 3: Configure Exotel (5 minutes)

### A. Login to Exotel
1. Go to: https://my.exotel.com/
2. Login with your credentials

### B. Create App (if you haven't already)
1. Click **"Apps"** in sidebar
2. Click **"Create New App"**
3. Name it: `AI Voice Agent`

### C. Configure the App Flow
1. Click your app to edit
2. Click **"Edit Flow"** button
3. **Drag "Passthru" applet** to the flow canvas
4. **Click the Passthru applet** to configure
5. **Set URL to**:
   ```
   https://YOUR-NGROK-URL.ngrok-free.app/api/v1/exotel/voice/incoming
   ```
6. **Set Method**: `POST`
7. **Set Response Type**: `Exotel Response XML`
8. Click **"Save"**

### D. Assign App to Phone Number
1. Go to **"Phone Numbers"** in sidebar
2. Find your Exotel number
3. Click **"Edit"** (gear icon)
4. Under **"Connected App"**, select `AI Voice Agent`
5. Click **"Save"**

## Step 4: Test the Setup

### Before Making the Call

**Checklist:**
- [  ] Server is running (`npm run dev` in terminal)
- [  ] ngrok is running (check `http://localhost:4040`)
- [  ] Agent created in database (use API or Postman)
- [  ] Phone number imported (use API or Postman)
- [  ] Agent assigned to phone (use API or Postman)
- [  ] Exotel app configured with webhook URL
- [  ] App assigned to Exotel phone number

### Make a Test Call

1. **Open ngrok dashboard**: `http://localhost:4040` (to monitor requests)
2. **Keep terminal open** (to see server logs)
3. **Call your Exotel number** from any phone
4. **Listen for AI greeting** (should hear agent's first message)
5. **Speak**: Say something like "Hello!"
6. **Listen**: AI should respond
7. **Continue conversation**
8. **Hangup when done**

### What to Watch For

**In ngrok Dashboard** (`http://localhost:4040`):
```
POST /api/v1/exotel/voice/incoming  → 200 OK
GET  /api/v1/exotel/voice/greeting  → 200 OK
POST /api/v1/exotel/voice/input     → 200 OK
POST /api/v1/exotel/voice/end       → 200 OK
```

**In Terminal Logs**:
```
[info]: Incoming call received
[info]: Greeting audio generated
[info]: Processing audio input
[info]: Voice pipeline processing complete
[info]: Call ended and logged
```

## Common Issues & Solutions

### Issue: Can't access `http://localhost:4040`
**Solution**: ngrok is not running. Start it:
```bash
ngrok http 5000
```

### Issue: 502 Bad Gateway
**Solution**: Server is not running. Start it:
```bash
cd backend
npm run dev
```

### Issue: Call connects but silence after greeting
**Possible causes:**
- Recording not enabled in Exotel
- Microphone not working on your phone
- Check server logs for errors

### Issue: AI not responding
**Check:**
1. OpenAI API key in `.env`
2. ElevenLabs API key in `.env`
3. Server logs for specific error messages

### Issue: "Agent not found" error
**Solution**: Create an agent first using the API:
```bash
POST http://localhost:5000/api/v1/agents
Headers: Authorization: Bearer <your-jwt-token>
Body: {
  "name": "Customer Support Bot",
  "config": {
    "prompt": "You are a helpful customer support assistant.",
    "voice": {
      "provider": "elevenlabs",
      "voiceId": "21m00Tcm4TlvDq8ikWAM",
      "settings": {
        "stability": 0.5,
        "similarityBoost": 0.75
      }
    },
    "language": "en",
    "llm": {
      "model": "gpt-4",
      "temperature": 0.7,
      "maxTokens": 150
    },
    "firstMessage": "Hello! How can I help you today?"
  }
}
```

## Quick Commands Reference

### Check if server is running
```bash
curl http://localhost:5000/health
```

### Check if ngrok is running
Open browser: `http://localhost:4040`

### Restart server
```bash
# Kill old process
taskkill //F //IM node.exe

# Start new
cd backend
npm run dev
```

### Restart ngrok
```bash
# Kill old process (if needed)
taskkill //F //IM ngrok.exe

# Start new
ngrok http 5000
```

## Your Webhook URL Template

Fill this in and save it:

```
ngrok URL: https://_________________________.ngrok-free.app

Webhook URL: https://_________________________.ngrok-free.app/api/v1/exotel/voice/incoming
```

Then paste the Webhook URL into your Exotel app's Passthru applet!

## Need Help?

1. Check full guide: `EXOTEL_SETUP_GUIDE.md`
2. Check logs in terminal
3. Check ngrok dashboard at `http://localhost:4040`
4. Verify all prerequisites are met

---

🚀 **You're ready!** Get your ngrok URL from `http://localhost:4040` and configure Exotel!
