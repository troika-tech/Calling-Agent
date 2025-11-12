# Exotel Voice Agent Setup Guide

Complete guide to configure Exotel for AI voice calling with your backend.

## Prerequisites

✅ Server running on `http://localhost:5000`
✅ ngrok installed (already have it!)
✅ Exotel account with purchased phone number
✅ Agent created in database
✅ Phone imported and agent assigned

## Step 1: Start ngrok Tunnel

ngrok is already running! To get your public URL:

**Option A: Check ngrok Web Interface**
1. Open your browser
2. Go to: `http://localhost:4040`
3. You'll see the ngrok dashboard with your public URLs
4. Copy the **HTTPS URL** (looks like: `https://xxxx-xx-xx-xx-xx.ngrok-free.app`)

**Option B: Use ngrok CLI**
```bash
ngrok http 5000
```
Look for the line that says:
```
Forwarding  https://xxxx-xx-xx-xx-xx.ngrok-free.app -> http://localhost:5000
```

## Step 2: Get Your Webhook URLs

Once you have the ngrok URL (e.g., `https://abc123.ngrok-free.app`), your webhook URLs are:

### Main Webhook URL (for Exotel App Flow)
```
https://YOUR-NGROK-URL.ngrok-free.app/api/v1/exotel/voice/incoming
```

Example:
```
https://abc123.ngrok-free.app/api/v1/exotel/voice/incoming
```

### Other Webhook URLs (automatically called by the flow)
- **Greeting**: `https://YOUR-NGROK-URL/api/v1/exotel/voice/greeting`
- **User Input**: `https://YOUR-NGROK-URL/api/v1/exotel/voice/input`
- **Call End**: `https://YOUR-NGROK-URL/api/v1/exotel/voice/end`
- **Continue**: `https://YOUR-NGROK-URL/api/v1/exotel/voice/continue`

## Step 3: Configure Exotel App Flow

### A. Login to Exotel Dashboard
1. Go to [https://my.exotel.com/](https://my.exotel.com/)
2. Login with your credentials

### B. Create New App (if not already created)
1. Navigate to **"Apps"** in the sidebar
2. Click **"Create New App"**
3. Give it a name: e.g., "AI Voice Agent"

### C. Configure App Flow

**Important**: Exotel uses Passthru Applet for custom webhook integration.

1. In your app, click **"Edit Flow"**

2. Add a **Passthru Applet**:
   - Drag "Passthru" from the applets panel
   - Click on it to configure

3. Set the **Passthru URL**:
   ```
   https://YOUR-NGROK-URL.ngrok-free.app/api/v1/exotel/voice/incoming
   ```

4. Set **Method**: `POST`

5. **Response Type**: Select "Exotel Response XML"

6. Click **"Save"**

### D. Assign App to Phone Number

1. Go to **"Phone Numbers"** in sidebar
2. Find your purchased Exotel number
3. Click **"Edit"** or the gear icon
4. Under **"Connected App"**, select your newly created app
5. Click **"Save"**

## Step 4: Verify Configuration

### Check Your Setup

1. **Server Status**: Ensure backend is running
   ```
   Server should show: Server started successfully on port 5000
   ```

2. **ngrok Status**: Check ngrok dashboard at `http://localhost:4040`
   - Should show active tunnel
   - Should show requests as they come in

3. **Database**: Ensure you have:
   - At least one Agent created
   - At least one Phone imported
   - Agent assigned to Phone

### Test Webhook Manually

Test if Exotel can reach your webhook:

```bash
curl -X POST https://YOUR-NGROK-URL.ngrok-free.app/api/v1/exotel/voice/incoming \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "CallSid=test123&CallFrom=+919876543210&CallTo=+918888888888&Direction=inbound&Status=ringing"
```

Expected response: XML starting with `<?xml version="1.0"...`

## Step 5: Make a Test Call

### Prepare for Testing

1. **Check Server Logs**: Keep terminal open to see logs
   ```
   You should see logs like:
   - "Incoming call received"
   - "Greeting audio generated"
   - "Processing audio input"
   ```

2. **Check ngrok Dashboard**: Monitor requests at `http://localhost:4040`

3. **Have Phone Ready**: Use any phone to call your Exotel number

### Make the Call

1. **Dial your Exotel number** from any phone
2. **Wait for AI greeting**: Should hear the agent's first message
3. **Speak**: Say something like "Hello, can you help me?"
4. **Listen**: AI should respond with intelligent answer
5. **Continue conversation**: Keep talking!
6. **Hangup**: Call ends and transcript is saved

### What to Expect

**Call Flow:**
```
1. You call Exotel number
   ↓
2. Exotel hits your /incoming webhook
   ↓
3. Your backend returns XML flow
   ↓
4. Exotel plays greeting (first message)
   ↓
5. Exotel starts recording your voice
   ↓
6. Your voice is sent to /input webhook
   ↓
7. Backend processes: STT → LLM → TTS
   ↓
8. AI response is played back to you
   ↓
9. Loop continues until timeout or hangup
   ↓
10. /end webhook is called
   ↓
11. Transcript saved to database
```

**Expected Logs in Terminal:**
```
[info]: Incoming call received { callSid: '...', from: '+91...', to: '+91...' }
[info]: Call log created for incoming call
[info]: Greeting webhook called
[info]: Greeting audio generated
[info]: User input webhook called
[info]: Audio downloaded from Exotel { size: 45678 }
[info]: Processing audio input
[info]: Voice pipeline processing complete
[info]: Call end webhook called
[info]: Call ended and logged
```

## Troubleshooting

### Problem: Call doesn't connect

**Check:**
- Is ngrok running? (`http://localhost:4040`)
- Is server running? (Check terminal)
- Is Passthru URL correct in Exotel app?
- Is app assigned to phone number?

**Solution:**
```bash
# Restart server
cd backend
npm run dev

# Restart ngrok (if needed)
ngrok http 5000
```

### Problem: Hearing silence after greeting

**Check:**
- Exotel recording settings (should be enabled)
- Microphone working on your phone
- Server logs for errors

**Common Issue**: Exotel recording timeout
- Default: 10 seconds
- Increase in Exotel app settings if needed

### Problem: AI not responding

**Check Backend Logs for:**
- `[error]: Failed to download recording` - Exotel URL issue
- `[error]: Failed to transcribe` - OpenAI API key issue
- `[error]: Failed to generate response` - OpenAI GPT issue
- `[error]: Failed to synthesize speech` - ElevenLabs issue

**Verify API Keys in .env:**
```env
OPENAI_API_KEY=sk-proj-...
ELEVENLABS_API_KEY=sk_7daff7bca...
```

### Problem: ngrok URL keeps changing

**Issue**: Free ngrok URLs change every time you restart

**Solutions:**
1. **Keep ngrok running** - Don't restart it
2. **Use ngrok static domain** (paid plan)
3. **Update Exotel app** whenever ngrok URL changes

### Problem: "Invalid 'From' specified" error

**Cause**: Using test numbers instead of real Exotel purchased numbers

**Solution**: Use your actual Exotel purchased phone number from dashboard

### Problem: 502 Bad Gateway from ngrok

**Cause**: Backend server not running

**Solution**:
```bash
cd backend
npm run dev
```

## Monitoring & Debugging

### Server Logs
Monitor real-time logs in your backend terminal:
- Green `[info]` = Normal operation
- Red `[error]` = Something went wrong
- Look for call flow sequence

### ngrok Dashboard
Open `http://localhost:4040` to see:
- All incoming HTTP requests
- Request/response details
- Timing information
- Replay requests for testing

### Database
Check MongoDB for:
```javascript
// Find recent calls
db.calllogs.find().sort({createdAt: -1}).limit(5)

// Check transcript
db.calllogs.findOne({_id: "..."}).transcript
```

### Check Call Log via API
```bash
# Get call history
curl -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  http://localhost:5000/api/v1/exotel/calls/history
```

## Production Deployment

For production, you need a permanent URL instead of ngrok:

### Options:

1. **Deploy to Cloud** (Recommended)
   - AWS EC2, Google Cloud, Azure
   - DigitalOcean, Heroku, Railway
   - Get static IP and domain

2. **Use VPS with Domain**
   - Buy domain (e.g., example.com)
   - Point to your server IP
   - Use HTTPS with Let's Encrypt SSL
   - Webhook URL: `https://api.example.com/api/v1/exotel/voice/incoming`

3. **Use ngrok Paid Plan**
   - Get static subdomain
   - Webhook URL never changes
   - Cost: ~$8/month

## Sample Exotel Flow XML

This is what your backend returns (you don't need to create this manually):

```xml
<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="woman" language="en-IN">Connecting you to AI Agent</Say>

  <!-- Play greeting -->
  <Play>https://YOUR-NGROK-URL/api/v1/exotel/voice/greeting?callLogId=123</Play>

  <!-- Conversation loop -->
  <Gather action="https://YOUR-NGROK-URL/api/v1/exotel/voice/input?callLogId=123"
          method="POST"
          timeout="10"
          finishOnKey="#"
          maxLength="1">
    <Record maxLength="60" playBeep="true" />
  </Gather>

  <!-- If timeout, say goodbye -->
  <Say voice="woman" language="en-IN">Thank you for calling. Goodbye!</Say>

  <!-- Call end callback -->
  <Hangup statusCallback="https://YOUR-NGROK-URL/api/v1/exotel/voice/end?callLogId=123" />
</Response>
```

## Quick Reference

### Your URLs (replace with your ngrok URL)
```
ngrok Dashboard:    http://localhost:4040
Server API:         https://YOUR-NGROK-URL.ngrok-free.app
Incoming Webhook:   https://YOUR-NGROK-URL.ngrok-free.app/api/v1/exotel/voice/incoming
Health Check:       https://YOUR-NGROK-URL.ngrok-free.app/health
```

### Key Files
- **Controller**: `backend/src/controllers/exotelVoice.controller.ts`
- **Routes**: `backend/src/routes/exotelVoice.routes.ts`
- **Voice Pipeline**: `backend/src/services/voicePipeline.service.ts`
- **Logs**: Terminal where `npm run dev` is running

### API Endpoints
- `POST /api/v1/exotel/voice/incoming` - Call entry point
- `GET/POST /api/v1/exotel/voice/greeting` - First message audio
- `POST /api/v1/exotel/voice/input` - Process user speech
- `POST /api/v1/exotel/voice/end` - Call cleanup
- `GET/POST /api/v1/exotel/voice/continue` - Conversation loop

## Support

If you encounter issues:
1. Check server logs first
2. Check ngrok dashboard for failed requests
3. Verify all API keys are correct
4. Test webhooks manually with curl
5. Check Exotel app flow configuration

## Next Steps

After successful testing:
1. **Create more agents** with different personalities
2. **Test different scenarios** (greetings, questions, commands)
3. **Monitor costs** (OpenAI, ElevenLabs, Exotel usage)
4. **Optimize prompts** for better responses
5. **Deploy to production** for permanent URL
6. **Build frontend dashboard** to manage calls

---

🎉 **Ready to test!** Open `http://localhost:4040` to get your ngrok URL and configure Exotel!
