# AI Conversation Flow Documentation

## Overview

The AI calling agent uses a sophisticated pipeline to handle real-time conversations with callers. After the greeting message, the system automatically manages the conversation using AI.

## Architecture Components

### 1. **WebSocket Handler** (`exotelVoice.handler.ts`)
- Manages real-time audio streaming from Exotel
- Handles audio buffering and silence detection
- Coordinates the conversation flow

### 2. **Voice Pipeline Service** (`voicePipeline.service.ts`)
- Orchestrates STT → LLM → TTS pipeline
- Maintains conversation history
- Manages multiple concurrent sessions

### 3. **OpenAI Service** (`openai.service.ts`)
- Speech-to-Text (Whisper API)
- Chat Completion (GPT-4/GPT-3.5)
- Text-to-Speech (OpenAI TTS)

### 4. **ElevenLabs Service** (Optional TTS provider)
- Alternative voice synthesis
- High-quality voice cloning

---

## Conversation Flow

### Step 1: Call Connection & Greeting

```
User Calls → Exotel → WebSocket Connection → Backend
                                              ↓
                                     Initialize Session
                                              ↓
                                     Load Agent Config
                                              ↓
                                  Generate Greeting Audio (TTS)
                                              ↓
                                     Play Greeting to User
```

**Code Location**: [`exotelVoice.handler.ts:264-292`](backend/src/websocket/handlers/exotelVoice.handler.ts#L264-L292)

```typescript
private async sendGreeting(client: WebSocketClient, session: VoiceSession) {
  const greeting = agent.config?.firstMessage || 'Hello! How can I help you today?';

  // Generate audio using TTS
  const audioBuffer = await voicePipelineService.generateFirstMessage(greeting, config);

  // Send to Exotel
  await this.sendAudioToExotel(client, audioBuffer);

  // Save to transcript
  await this.saveTranscript(callLogId, 'assistant', greeting);
}
```

---

### Step 2: User Speaks (Audio Buffering)

```
User Speaks → Exotel WebSocket → Audio Chunks (μ-law, 8kHz)
                                        ↓
                              Buffer Accumulation
                                        ↓
                              Silence Detection (1.5s)
                                        ↓
                              Trigger Processing
```

**Code Location**: [`exotelVoice.handler.ts:206-229`](backend/src/websocket/handlers/exotelVoice.handler.ts#L206-L229)

**Key Configuration**:
- **Silence Threshold**: 1.5 seconds (configurable)
- **Audio Format**: Base64-encoded PCM (16-bit, 8kHz)
- **Buffering**: Chunks accumulated until silence

```typescript
private async handleMedia(client, session, message) {
  // Decode audio chunk
  const audioChunk = Buffer.from(message.media.payload, 'base64');
  session.audioBuffer.push(audioChunk);

  // Reset silence timer
  session.lastSpeechTime = Date.now();

  // Set timeout for silence detection
  session.silenceTimeout = setTimeout(async () => {
    await this.processUserSpeech(client, session);
  }, this.SILENCE_THRESHOLD); // 1500ms
}
```

---

### Step 3: Speech-to-Text (STT)

```
Audio Buffer → Audio Format Conversion
                        ↓
                 OpenAI Whisper API
                        ↓
                Transcribed Text
```

**Code Location**: [`exotelVoice.handler.ts:318-337`](backend/src/websocket/handlers/exotelVoice.handler.ts#L318-L337)

**Process**:
1. Combine buffered audio chunks
2. Convert from 8kHz to 16kHz PCM (Whisper requirement)
3. Send to Whisper API
4. Receive transcription

```typescript
// Convert audio format
const pcmAudio = await this.convertIncomingAudioToPCM(audioData);

// Transcribe with Whisper
const transcription = await openaiService.transcribeAudio(
  pcmAudio,
  session.agent.config?.language || 'en'
);

logger.info('User speech transcribed', {
  transcript: transcription.text
});
```

---

### Step 4: AI Response Generation (LLM)

```
User Transcript → Build Conversation Context
                            ↓
                   Add System Prompt
                            ↓
                   GPT-4 Chat Completion
                            ↓
                   AI Response Text
```

**Code Location**: [`exotelVoice.handler.ts:342-365`](backend/src/websocket/handlers/exotelVoice.handler.ts#L342-L365)

**Conversation Context**:
- System prompt from agent configuration
- Full conversation history
- User's latest message

```typescript
// Get conversation history from database
const conversationHistory = await this.getConversationHistoryMessages(
  session.callLogId
);

// Build messages array
const messages: ChatMessage[] = conversationHistory.length === 0
  ? [
      { role: 'system', content: session.agent.config.prompt },
      { role: 'user', content: transcript }
    ]
  : [...conversationHistory, { role: 'user', content: transcript }];

// Generate AI response
const completion = await openaiService.getChatCompletion(messages, {
  model: session.agent.config?.llm?.model || 'gpt-4',
  temperature: session.agent.config?.llm?.temperature || 0.7,
  maxTokens: session.agent.config?.llm?.maxTokens || 150
});
```

**LLM Configuration** (from Agent settings):
- **Model**: `gpt-4`, `gpt-4-turbo-preview`, or `gpt-3.5-turbo`
- **Temperature**: 0.0-2.0 (controls creativity)
- **Max Tokens**: Maximum response length (default: 150)

---

### Step 5: Text-to-Speech (TTS)

```
AI Response Text → TTS Service Selection
                            ↓
                   (OpenAI TTS or ElevenLabs)
                            ↓
                   Generate Audio Buffer
                            ↓
                   Convert to Exotel Format
```

**Code Location**: [`exotelVoice.handler.ts:368-374`](backend/src/websocket/handlers/exotelVoice.handler.ts#L368-L374)

**Supported TTS Providers**:
1. **OpenAI TTS**
   - Voices: alloy, echo, fable, onyx, nova, shimmer
   - Model: `tts-1` or `tts-1-hd`

2. **ElevenLabs**
   - Custom voice cloning
   - Configurable stability & similarity boost

```typescript
// Convert response to speech using configured provider
const audioResponse = await voicePipelineService.synthesizeText(
  response,
  session.config
);

// Convert to PCM format for Exotel
const pcmAudio = await this.convertToPCM(audioResponse);
```

---

### Step 6: Audio Playback to Caller

```
Audio Buffer → Split into Chunks (100ms each)
                        ↓
               Base64 Encode
                        ↓
               Stream to Exotel WebSocket
                        ↓
               Playback to Caller
```

**Code Location**: [`exotelVoice.handler.ts:392-446`](backend/src/websocket/handlers/exotelVoice.handler.ts#L392-L446)

**Streaming Configuration**:
- **Chunk Size**: 3200 bytes (100ms of audio)
- **Format**: 16-bit PCM, 8kHz, mono, little-endian
- **Delay**: 100ms between chunks for real-time playback

```typescript
private async sendAudioToExotel(client, audioBuffer) {
  // Convert to Linear PCM (16-bit, 8kHz)
  const pcmAudio = await this.convertToPCM(audioBuffer);

  const chunkSize = 3200; // 100ms chunks

  // Stream audio in chunks
  for (let i = 0; i < pcmAudio.length; i += chunkSize) {
    const chunk = pcmAudio.slice(i, i + chunkSize);
    const payload = chunk.toString('base64');

    const message = {
      event: 'media',
      media: {
        chunk: chunkNumber.toString(),
        timestamp: Date.now().toString(),
        payload
      }
    };

    client.send(JSON.stringify(message));

    // Real-time playback delay
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}
```

---

### Step 7: Transcript Storage

All conversation turns are automatically saved to the database:

```typescript
await this.saveTranscript(callLogId, 'user', userTranscript);
await this.saveTranscript(callLogId, 'assistant', aiResponse);
```

**Database Schema** (CallLog):
```typescript
{
  transcript: [
    {
      speaker: 'user' | 'assistant',
      text: string,
      timestamp: Date
    }
  ]
}
```

---

## Complete Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        CALL ESTABLISHED                          │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
            ┌────────────────────────┐
            │  Initialize Session    │
            │  Load Agent Config     │
            └────────┬───────────────┘
                     │
                     ▼
            ┌────────────────────────┐
            │  Play Greeting (TTS)   │
            │  "Hello! How can..."   │
            └────────┬───────────────┘
                     │
                     ▼
     ┌───────────────────────────────────────┐
     │      CONVERSATION LOOP (Repeats)      │
     └───────────────────────────────────────┘
                     │
                     ▼
     ┌──────────────────────────────┐
     │  1. User Speaks              │
     │     - Buffer audio chunks    │
     │     - Detect silence (1.5s)  │
     └──────┬───────────────────────┘
            │
            ▼
     ┌──────────────────────────────┐
     │  2. STT (Whisper)            │
     │     - Convert audio format   │
     │     - Transcribe speech      │
     │     Output: "I need help..." │
     └──────┬───────────────────────┘
            │
            ▼
     ┌──────────────────────────────┐
     │  3. Build Context            │
     │     - System prompt          │
     │     - Conversation history   │
     │     - Current message        │
     └──────┬───────────────────────┘
            │
            ▼
     ┌──────────────────────────────┐
     │  4. LLM (GPT-4)              │
     │     - Generate response      │
     │     Output: "I'd be happy..."│
     └──────┬───────────────────────┘
            │
            ▼
     ┌──────────────────────────────┐
     │  5. TTS (OpenAI/ElevenLabs)  │
     │     - Synthesize audio       │
     │     - Convert to PCM         │
     └──────┬───────────────────────┘
            │
            ▼
     ┌──────────────────────────────┐
     │  6. Stream to Caller         │
     │     - 100ms chunks           │
     │     - Real-time playback     │
     └──────┬───────────────────────┘
            │
            ▼
     ┌──────────────────────────────┐
     │  7. Save to Transcript       │
     │     - User: "I need help..." │
     │     - AI: "I'd be happy..."  │
     └──────┬───────────────────────┘
            │
            └──────► REPEAT LOOP
```

---

## Configuration

### Agent Configuration (Database)

```typescript
{
  name: "Sales Agent",
  config: {
    // AI Prompt
    prompt: "You are a helpful sales assistant...",
    firstMessage: "Hello! How can I help you today?",

    // LLM Settings
    llm: {
      model: "gpt-4",           // or "gpt-3.5-turbo"
      temperature: 0.7,         // 0-2 (higher = more creative)
      maxTokens: 150            // Max response length
    },

    // Voice Settings
    voice: {
      provider: "openai",       // or "elevenlabs"
      voiceId: "alloy",         // Voice ID
      settings: {
        stability: 0.5,         // ElevenLabs only
        similarityBoost: 0.75,  // ElevenLabs only
        modelId: "tts-1"        // OpenAI only
      }
    },

    // Language
    language: "en",             // ISO code (en, hi, es, fr)

    // End Call Detection
    endCallPhrases: ["goodbye", "bye", "thank you"]
  }
}
```

---

## Performance Metrics

Typical latency for each step:

1. **STT (Whisper)**: 500-1500ms
2. **LLM (GPT-4)**: 1000-3000ms
3. **TTS (OpenAI)**: 500-1500ms
4. **TTS (ElevenLabs)**: 800-2000ms

**Total Turn Latency**: 2-6 seconds (varies by provider and model)

---

## Monitoring & Logging

All steps are logged with Winston:

```typescript
logger.info('User speech transcribed', { transcript });
logger.info('AI response generated', { response, tokens });
logger.info('Speech synthesis completed', { audioSize });
```

Logs include:
- Transcription results
- LLM responses and token usage
- Audio generation details
- Timing information
- Error tracking

---

## Error Handling

The system gracefully handles errors at each step:

```typescript
try {
  // Process conversation turn
} catch (error) {
  logger.error('Error processing user speech', { error });
} finally {
  session.isProcessing = false; // Always release lock
}
```

Common error scenarios:
- Audio conversion failures → Use original buffer
- STT timeout → Log and skip
- LLM API errors → Retry with exponential backoff
- TTS failures → Fallback to alternative provider

---

## Testing the AI Conversation

### 1. Make a Test Call

Call your Exotel number and wait for the greeting.

### 2. Speak Clearly

After the greeting, speak clearly. The system will:
- Buffer your speech
- Wait for 1.5s silence
- Process your message

### 3. Check Logs

Monitor backend logs to see:
```
[INFO] User speech transcribed: "I need help with my order"
[INFO] AI response generated: "I'd be happy to help! Could you provide your order number?"
[INFO] Speech synthesis completed
```

### 4. View Transcript

After the call, check the call log in the database or dashboard to see the full transcript.

---

## Advanced Features

### 1. Streaming Responses (Future Enhancement)

For lower latency, implement streaming:
- Stream LLM response word-by-word
- Generate TTS in chunks
- Overlap AI thinking with audio playback

### 2. Interrupt Handling

Detect when user starts speaking during AI response:
- Monitor incoming audio during playback
- Stop current audio
- Process new user input

### 3. Emotion Detection

Analyze user sentiment:
- Detect frustration or satisfaction
- Adjust AI tone accordingly
- Route to human agent if needed

### 4. Multi-turn Planning

For complex conversations:
- Maintain conversation goals
- Track information gathered
- Execute multi-step workflows

---

## Troubleshooting

### Issue: AI not responding

**Check**:
1. OpenAI API key configured
2. Agent has valid prompt
3. WebSocket connection active
4. Check logs for errors

### Issue: Audio quality poor

**Check**:
1. Audio format conversion working
2. Sample rate correct (8kHz for Exotel)
3. Chunk size matches Exotel requirements
4. Network latency

### Issue: Slow responses

**Optimize**:
1. Reduce `maxTokens` (shorter responses)
2. Use `gpt-3.5-turbo` instead of `gpt-4`
3. Decrease silence threshold
4. Optimize audio chunk size

---

## Next Steps

The AI conversation system is fully functional! You can:

1. **Test the flow**: Make a call and have a conversation
2. **Customize prompts**: Update agent configuration for different use cases
3. **Monitor performance**: Check logs and timing metrics
4. **Scale up**: Deploy to production and handle multiple concurrent calls

**The AI is ready to talk!** 🎉
