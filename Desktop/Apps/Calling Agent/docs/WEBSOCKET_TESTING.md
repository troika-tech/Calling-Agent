# WebSocket Voice Pipeline Testing Guide

This guide will help you test the complete voice pipeline integration with WebSocket.

## Overview

The voice pipeline processes audio in real-time through three stages:
1. **STT (Speech-to-Text)** - OpenAI Whisper converts audio to text
2. **LLM (Language Model)** - OpenAI GPT generates intelligent responses
3. **TTS (Text-to-Speech)** - ElevenLabs converts text back to audio

## Prerequisites

Before testing, ensure you have:

- [x] Server running on `http://localhost:5000`
- [x] WebSocket server running on `ws://localhost:5000/ws`
- [x] MongoDB Atlas connected
- [x] Redis connected
- [x] API keys configured in `.env`:
  - `OPENAI_API_KEY`
  - `ELEVENLABS_API_KEY`

## Testing Steps

### Step 1: Get a User ID

First, you need a valid user ID from your database. You can:

**Option A: Register a new user**
```bash
curl -X POST http://localhost:5000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "Test@1234",
    "name": "Test User"
  }'
```

The response will include the user ID:
```json
{
  "user": {
    "id": "507f1f77bcf86cd799439011",
    ...
  }
}
```

**Option B: Check MongoDB directly**
- Open MongoDB Compass or Atlas
- Navigate to your database → `users` collection
- Copy any user's `_id` field

### Step 2: Create Test Data

Run the test setup script to create an agent and call log:

```bash
cd backend
node test-setup.js <YOUR_USER_ID>
```

Example:
```bash
node test-setup.js 507f1f77bcf86cd799439011
```

This will output:
```
═══════════════════════════════════════════════════════
COPY THESE IDs TO test-websocket.html:
═══════════════════════════════════════════════════════
Agent ID:     674e8f3a2b1c4d5e6f7a8b9c
Call Log ID:  674e8f3a2b1c4d5e6f7a8b9d
═══════════════════════════════════════════════════════
```

### Step 3: Open Test Client

1. Open `test-websocket.html` in your browser (Chrome recommended)
2. Click **"Connect"** button
3. Wait for status to show **"Connected"** (green)

### Step 4: Initialize Session

1. Paste the **Agent ID** from Step 2
2. Paste the **Call Log ID** from Step 2
3. Click **"Initialize Session"**
4. You should hear the first message: "Hello! I am your AI assistant. How can I help you today?"

### Step 5: Test Text Mode (No Audio)

To test without microphone:

1. Type a message in the text area, e.g., "What's the weather like?"
2. Click **"Send Text"**
3. Watch the event log for:
   - `llm_start` - AI is thinking
   - `llm_chunk` - Response chunks (real-time)
   - `llm_complete` - AI finished thinking
4. See the text response in the "AI Response" section

### Step 6: Test Audio Mode (With Microphone)

To test the full voice pipeline:

1. Click **"Start Recording"** 🎤
2. Grant microphone permissions when prompted
3. Speak your message clearly, e.g., "Hello, can you hear me?"
4. Click **"Stop Recording"** ⏹️
5. Watch the event log for the full pipeline:
   - `processing_started` - Audio received
   - `stt_start` - Transcribing your speech
   - `stt_complete` - Shows what you said
   - `llm_start` - AI processing
   - `llm_chunk` - Response generation
   - `llm_complete` - Response ready
   - `tts_start` - Generating speech
   - `tts_complete` - Speech ready
   - `audio_response` - Playing AI voice
6. The audio player will automatically play the AI's voice response

## WebSocket Message Protocol

### Client → Server Messages

**Initialize Session**
```json
{
  "type": "init",
  "data": {
    "agentId": "674e8f3a2b1c4d5e6f7a8b9c",
    "callLogId": "674e8f3a2b1c4d5e6f7a8b9d"
  }
}
```

**Send Text**
```json
{
  "type": "text",
  "data": {
    "text": "Hello, how are you?"
  }
}
```

**Send Audio**
```json
{
  "type": "audio",
  "data": {
    "audio": "<base64-encoded-audio>"
  }
}
```

**End Session**
```json
{
  "type": "end",
  "data": {}
}
```

### Server → Client Messages

**Session Initialized**
```json
{
  "type": "init_success",
  "data": {
    "callLogId": "...",
    "agentName": "Test Voice Agent",
    "message": "Voice pipeline initialized"
  }
}
```

**Audio Response**
```json
{
  "type": "audio_response",
  "data": {
    "audio": "<base64-encoded-mp3>",
    "text": "I'm doing well, thank you!"
  }
}
```

**Text Response**
```json
{
  "type": "text_response",
  "data": {
    "text": "I'm doing well, thank you!"
  }
}
```

**Pipeline Events**
```json
// Speech-to-Text
{ "type": "stt_start", "data": {} }
{ "type": "stt_complete", "data": { "text": "..." } }

// Language Model
{ "type": "llm_start", "data": {} }
{ "type": "llm_chunk", "data": { "chunk": "I'm", "fullText": "I'm" } }
{ "type": "llm_complete", "data": { "text": "..." } }

// Text-to-Speech
{ "type": "tts_start", "data": {} }
{ "type": "tts_complete", "data": { "audio": "<base64>" } }
```

**Error**
```json
{
  "type": "error",
  "data": {
    "error": "Error message"
  }
}
```

## Testing Checklist

- [ ] WebSocket connects successfully
- [ ] Session initializes with agent and call log
- [ ] First message plays automatically
- [ ] Text input generates text responses
- [ ] Microphone recording works
- [ ] Audio is sent to server
- [ ] STT transcribes audio correctly
- [ ] LLM generates appropriate responses
- [ ] TTS creates audio successfully
- [ ] Audio plays in browser
- [ ] Event log shows all pipeline stages
- [ ] Error handling works (try invalid IDs)
- [ ] Session can be ended cleanly
- [ ] Reconnection works after disconnect

## Troubleshooting

### WebSocket Won't Connect
- Check server is running: `http://localhost:5000`
- Check WebSocket logs in server console
- Verify port 5000 is not blocked by firewall

### "Agent not found" Error
- Verify Agent ID is correct (24-char hex)
- Check agent exists in MongoDB `agents` collection
- Run test-setup.js again to create fresh test data

### "Session not initialized" Error
- Click "Initialize Session" before sending messages
- Verify both Agent ID and Call Log ID are entered

### No Audio Playback
- Check browser console for errors
- Verify ElevenLabs API key is valid
- Check audio player is not muted
- Try different browser (Chrome recommended)

### Microphone Not Working
- Grant microphone permissions when prompted
- Check browser microphone settings
- Test microphone in other apps first

### API Errors (OpenAI/ElevenLabs)
- Verify API keys in `.env`
- Check API quotas/credits
- Review server error logs

## Advanced Testing

### Custom Agent Configuration

Edit the agent in MongoDB to test different:
- **Voices**: Change `config.voice.voiceId` to different ElevenLabs voice IDs
- **LLM Models**: Change `config.llm.model` to `gpt-3.5-turbo` or `gpt-4-turbo`
- **Prompts**: Modify `config.prompt` for different personalities
- **Voice Settings**: Adjust `config.voice.settings.stability` (0-1) and `similarityBoost` (0-1)

### Load Testing

Test multiple simultaneous connections:
1. Open multiple browser tabs
2. Connect all to WebSocket
3. Initialize different sessions in each
4. Send messages simultaneously

### Conversation Flow

Test multi-turn conversations:
1. Initialize session
2. Send: "Hello"
3. Wait for response
4. Send: "What's your name?"
5. Wait for response
6. Send: "Can you help me?"
7. Verify conversation context is maintained

## Server Logs

Monitor the server console for detailed logs:

```
[info]: WebSocket client connected { clientId: '1a2b3c4d' }
[info]: Initializing voice pipeline session { clientId: '1a2b3c4d', callLogId: '...' }
[info]: Voice pipeline session initialized successfully
[info]: Processing audio input { clientId: '1a2b3c4d', audioSize: 45678 }
[info]: Audio processing completed
```

## Next Steps

After successful testing:

1. **Integrate with Exotel** - Connect voice pipeline to phone calls
2. **Build Frontend** - Create React dashboard for managing agents/calls
3. **Production Setup** - Configure ngrok for webhook URLs
4. **Monitoring** - Add analytics and error tracking
5. **Optimization** - Implement audio streaming and buffering

## Support

If you encounter issues:
1. Check server logs in console
2. Check browser console for errors
3. Review MongoDB for data integrity
4. Verify all API keys are valid
5. Check Redis connection is active
