# Getting Started with AI Calling Agent Platform

## Quick Start Guide

This guide will help you get the AI Calling Agent platform up and running in under 10 minutes.

## What You'll Build

A complete AI calling agent platform with:
- User authentication
- Agent management interface
- Real-time voice calling via Exotel
- Call logs with transcripts
- Analytics dashboard

## Prerequisites Checklist

Before starting, make sure you have:

- [ ] Node.js 18+ installed
- [ ] MongoDB running (local or Atlas)
- [ ] Redis running (local or cloud)
- [ ] Exotel account with API keys
- [ ] OpenAI API key
- [ ] ElevenLabs API key (optional)

## Step 1: Clone and Install

```bash
# Navigate to project root
cd "C:\Users\USER\Desktop\Apps\Calling Agent"

# Install backend dependencies
cd backend
npm install

# Install frontend dependencies
cd ../frontend
npm install
```

## Step 2: Configure Backend

### Create Backend .env

```bash
cd backend
cp .env.example .env
```

### Edit backend/.env

```env
# Server
NODE_ENV=development
PORT=5000

# Database
MONGODB_URI=mongodb+srv://your-connection-string
REDIS_URL=redis://localhost:6379

# JWT
JWT_SECRET=your-super-secret-jwt-key-min-32-characters
JWT_EXPIRE=7d

# Exotel
EXOTEL_API_KEY=your-exotel-api-key
EXOTEL_API_TOKEN=your-exotel-api-token
EXOTEL_SID=your-exotel-sid
EXOTEL_SUBDOMAIN=api.exotel.com

# OpenAI
OPENAI_API_KEY=sk-your-openai-key

# ElevenLabs
ELEVENLABS_API_KEY=sk_your-elevenlabs-key

# Webhooks (update after ngrok)
WEBHOOK_BASE_URL=http://localhost:5000
```

## Step 3: Configure Frontend

### Create Frontend .env

```bash
cd frontend
cp .env.example .env
```

### Edit frontend/.env

```env
VITE_API_URL=http://localhost:5000/api
```

## Step 4: Start Services

### Option A: Using Provided Scripts (Windows)

```bash
# Terminal 1 - Start backend
START.bat

# Terminal 2 - Start frontend
START_FRONTEND.bat
```

### Option B: Manual Start

```bash
# Terminal 1 - Backend
cd backend
npm run dev

# Terminal 2 - Frontend
cd frontend
npm run dev
```

## Step 5: Expose Webhooks (Development)

For Exotel webhooks to work, your backend needs to be accessible from the internet.

### Install ngrok

```bash
npm install -g ngrok
```

### Start ngrok

```bash
# In a new terminal
ngrok http 5000
```

### Update WEBHOOK_BASE_URL

Copy the ngrok HTTPS URL (e.g., `https://abc123.ngrok.io`) and update:

1. `backend/.env`:
```env
WEBHOOK_BASE_URL=https://abc123.ngrok.io
```

2. Restart backend server

## Step 6: Configure Exotel

1. Log in to [Exotel Dashboard](https://my.exotel.com/)
2. Go to your phone number settings
3. Configure Exotel Voice Bot:
   - **Applet Type**: Voice Bot
   - **WebSocket URL**: Will be returned from our webhook
   - **Webhook URL**: `https://your-ngrok-url.ngrok.io/api/exotel/voice/incoming`

## Step 7: Test the Platform

### 1. Access the Frontend

Open your browser to `http://localhost:5173`

### 2. Create an Account

- Click "Sign up"
- Enter your details:
  - Name: Test User
  - Email: test@example.com
  - Password: password123
- Click "Sign Up"

### 3. Create Your First Agent

- Navigate to "Agents"
- Click "Create Agent"
- Fill in the details:
  - **Name**: Sales Agent
  - **Description**: AI sales assistant
  - **System Prompt**: You are a helpful sales assistant. Be friendly and professional.
  - **First Message**: Hello! How can I help you today?
  - **Voice**: Choose any voice from ElevenLabs
  - **Model**: GPT-4
  - **Temperature**: 0.7
  - **Language**: English
- Click "Create Agent"

### 4. Make a Test Call

The agent is now ready! When someone calls your Exotel number, the AI agent will answer.

To test:
1. Call your Exotel phone number
2. The AI agent will greet you with the first message
3. Start speaking - the agent will respond intelligently
4. End the call

### 5. View Call Logs

- Navigate to "Call Logs"
- Click on any call to view:
  - Full transcript
  - Call duration
  - Call status
  - Metadata

## Architecture Overview

```
┌─────────────┐
│   Browser   │
│ (React App) │ ← http://localhost:5173
└──────┬──────┘
       │ REST API
       ▼
┌─────────────┐
│   Backend   │ ← http://localhost:5000
│  (Node.js)  │
└──────┬──────┘
       │
       ├─→ MongoDB (Database)
       ├─→ Redis (Session)
       ├─→ Exotel (Telephony)
       ├─→ OpenAI (STT + LLM)
       └─→ ElevenLabs (TTS)
```

## Common URLs

- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:5000
- **API Docs**: http://localhost:5000/api-docs (if implemented)
- **ngrok URL**: https://your-ngrok-url.ngrok.io

## Troubleshooting

### Backend Won't Start

1. Check MongoDB is running:
```bash
# If using Docker
docker ps | grep mongo
```

2. Check Redis is running:
```bash
# If using Docker
docker ps | grep redis
```

3. Verify environment variables in `backend/.env`

### Frontend Won't Start

1. Clear cache and reinstall:
```bash
cd frontend
rm -rf node_modules package-lock.json
npm install
```

2. Check `VITE_API_URL` in `frontend/.env`

### Calls Not Working

1. **Verify ngrok is running** and URL is updated in `.env`
2. **Check Exotel configuration** in dashboard
3. **View backend logs** for errors
4. **Check API keys** are valid

### No Audio in Calls

1. Verify ElevenLabs API key is valid
2. Check ffmpeg is installed: `ffmpeg -version`
3. Review backend logs for audio conversion errors

## Next Steps

### For Development

1. **Read the documentation**:
   - [FRONTEND_SETUP.md](FRONTEND_SETUP.md) - Frontend development guide
   - [backend/README.md](backend/README.md) - Backend API guide

2. **Explore the codebase**:
   - Frontend: `frontend/src/`
   - Backend: `backend/src/`

3. **Customize your agents**:
   - Try different system prompts
   - Adjust voice settings
   - Configure LLM parameters

### For Production Deployment

1. **Deploy to AWS EC2**:
   - See existing deployment at `https://calling-api.0804.in`
   - Follow [backend/DEPLOYMENT.md](backend/DEPLOYMENT.md)

2. **Set up proper domain**:
   - Point DNS to your server
   - Configure SSL with Let's Encrypt
   - Update WEBHOOK_BASE_URL

3. **Enable monitoring**:
   - Set up PM2 for process management
   - Configure logging
   - Add error tracking (Sentry)

## Support

If you encounter issues:

1. **Check logs**:
   - Backend: Terminal where `npm run dev` is running
   - Frontend: Browser console (F12)

2. **Review documentation**:
   - README.md - Project overview
   - FRONTEND_SETUP.md - Frontend guide
   - Backend docs - API reference

3. **Common issues**:
   - CORS errors → Check backend CORS configuration
   - Auth errors → Verify JWT_SECRET is set
   - Call errors → Check Exotel webhook configuration

## What's Next?

Now that your platform is running:

1. ✅ Test different conversation flows
2. ✅ Create multiple agents for different use cases
3. ✅ Monitor call analytics
4. ✅ Fine-tune agent responses
5. ✅ Deploy to production

Happy calling! 🎉
