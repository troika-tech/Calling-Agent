# WebSocket Voice Pipeline Flow

## Architecture Overview

```
┌─────────────┐         WebSocket          ┌──────────────┐
│   Browser   │ ◄──────────────────────► │    Server    │
│  (Client)   │    ws://localhost:5000/ws  │   (Backend)  │
└─────────────┘                            └──────────────┘
      │                                            │
      │                                            │
   ┌──▼──┐                                    ┌───▼────┐
   │ Mic │                                    │ Voice  │
   │ 🎤  │                                    │Pipeline│
   └─────┘                                    └────┬───┘
                                                   │
                                        ┌──────────┼──────────┐
                                        │          │          │
                                    ┌───▼──┐  ┌───▼──┐  ┌───▼───┐
                                    │ STT  │  │ LLM  │  │  TTS  │
                                    │Whisper│ │ GPT  │  │Eleven │
                                    │      │  │      │  │ Labs  │
                                    └──────┘  └──────┘  └───────┘
```

## Message Flow Sequence

### 1. Connection & Initialization

```
Client                          Server
  │                               │
  ├──── Connect WebSocket ───────►│
  │◄──── Connection Accepted ─────┤
  │                               │
  ├──── { type: "init" } ────────►│
  │                               ├─── Get Agent Config
  │                               ├─── Get Call Log
  │                               ├─── Initialize Pipeline
  │                               │
  │◄─ { type: "init_success" } ───┤
  │◄─ { type: "audio_response" }──┤ (First message)
  │                               │
```

### 2. Text Message Flow (Simple)

```
Client                          Server
  │                               │
  ├─ { type: "text", ...} ───────►│
  │                               ├─── OpenAI GPT
  │                               │    (LLM Processing)
  │◄─ { type: "llm_start" } ──────┤
  │◄─ { type: "llm_chunk" } ──────┤ (Stream chunks)
  │◄─ { type: "llm_chunk" } ──────┤
  │◄─ { type: "llm_complete" } ───┤
  │◄─ { type: "text_response" } ──┤
  │                               │
```

### 3. Audio Message Flow (Full Pipeline)

```
Client                                    Server
  │                                         │
  ├─ Start Recording ──►[Mic]               │
  │                                         │
  ├─ Stop Recording ───►[Audio Blob]        │
  │                                         │
  ├─ { type: "audio", base64 } ────────────►│
  │                                         │
  │◄── { type: "processing_started" } ──────┤
  │                                         │
  │                                    ┌────┴─────┐
  │                                    │   STT    │
  │                                    │ (Whisper)│
  │◄── { type: "stt_start" } ───────────┤          │
  │                                    │ Audio→Text│
  │◄── { type: "stt_complete" } ────────┤          │
  │     data: { text: "..." }          └────┬─────┘
  │                                         │
  │                                    ┌────▼─────┐
  │                                    │   LLM    │
  │                                    │  (GPT)   │
  │◄── { type: "llm_start" } ───────────┤          │
  │                                    │ Thinking │
  │◄── { type: "llm_chunk" } ───────────┤ Streaming│
  │◄── { type: "llm_chunk" } ───────────┤          │
  │◄── { type: "llm_complete" } ────────┤          │
  │     data: { text: "..." }          └────┬─────┘
  │                                         │
  │                                    ┌────▼─────┐
  │                                    │   TTS    │
  │                                    │(ElevenLabs)│
  │◄── { type: "tts_start" } ───────────┤          │
  │                                    │ Text→Audio│
  │◄── { type: "tts_complete" } ────────┤          │
  │     data: { audio: base64 }        └────┬─────┘
  │                                         │
  │◄── { type: "audio_response" } ──────────┤
  │     data: { audio: base64 }             │
  │                                         │
  │◄── { type: "processing_complete" } ─────┤
  │                                         │
  ├─ Play Audio ──►[Speaker 🔊]             │
  │                                         │
```

### 4. Session End

```
Client                          Server
  │                               │
  ├─ { type: "end" } ────────────►│
  │                               ├─── Save Transcript
  │                               ├─── Update Call Log
  │                               ├─── Clear Session
  │                               │
  │◄─ { type: "session_ended" } ──┤
  │                               │
  ├─ Disconnect WebSocket ───────►│
  │                               │
```

## Message Types Reference

### Client → Server

| Type | Description | Data |
|------|-------------|------|
| `init` | Initialize session | `{ agentId, callLogId }` |
| `audio` | Send audio data | `{ audio: base64 }` |
| `text` | Send text message | `{ text: string }` |
| `end` | End session | `{}` |

### Server → Client

| Type | Description | Data |
|------|-------------|------|
| `init_success` | Session ready | `{ callLogId, agentName, message }` |
| `processing_started` | Starting to process | `{}` |
| `stt_start` | Transcription started | `{}` |
| `stt_complete` | Transcription done | `{ text }` |
| `llm_start` | LLM processing started | `{}` |
| `llm_chunk` | Streaming response | `{ chunk, fullText }` |
| `llm_complete` | LLM done | `{ text }` |
| `tts_start` | Speech generation started | `{}` |
| `tts_complete` | Speech ready | `{ audio: base64 }` |
| `audio_response` | Audio to play | `{ audio: base64, text? }` |
| `text_response` | Text to display | `{ text }` |
| `processing_complete` | Processing finished | `{}` |
| `session_ended` | Session closed | `{ callLogId }` |
| `error` | Error occurred | `{ error }` |

## Pipeline Timing Example

For a typical voice interaction:

```
Action                  Duration    Total Time
────────────────────────────────────────────────
User speaks             3s          0-3s
STT (Whisper)           1s          3-4s
LLM (GPT-4)             2s          4-6s
TTS (ElevenLabs)        1.5s        6-7.5s
Audio playback          4s          7.5-11.5s
────────────────────────────────────────────────
Total Response Time:    ~8.5s processing + 4s playback
```

## WebSocket Event Handlers

### Server-Side (websocket.server.ts)

```typescript
ws.on('connection', (client) => {
  // Assign unique ID
  // Set up ping/pong heartbeat
  // Listen for messages
})

ws.on('message', (data) => {
  // Route to appropriate handler:
  // - init → voicePipelineHandler.handleInit()
  // - audio → voicePipelineHandler.handleAudio()
  // - text → voicePipelineHandler.handleText()
  // - end → voicePipelineHandler.handleEnd()
})

ws.on('close', () => {
  // Clean up session
  // Remove from client map
})
```

### Client-Side (test-websocket.html)

```javascript
ws.onopen = () => {
  // Enable UI
  // Allow session init
}

ws.onmessage = (event) => {
  // Parse JSON message
  // Route by message.type
  // Update UI accordingly
}

ws.onclose = () => {
  // Disable UI
  // Stop recording if active
}
```

## Conversation History

The voice pipeline maintains conversation context:

```
Session ID: abc123
────────────────────────────────────────────────
Turn 1:
  User:      "Hello"
  Assistant: "Hi! How can I help you?"

Turn 2:
  User:      "What's the weather?"
  Assistant: "I don't have access to weather data,
              but I can help with other questions."

Turn 3:
  User:      "Thanks anyway"
  Assistant: "You're welcome! Let me know if you
              need anything else."
────────────────────────────────────────────────
Stored in: CallLog.transcript[]
Cached in: voicePipelineService.conversationHistory
```

## WebSocket Connection States

```
┌─────────────┐
│ Disconnected│
└──────┬──────┘
       │ client.connect()
       │
┌──────▼──────┐
│ Connecting  │
└──────┬──────┘
       │ onopen
       │
┌──────▼──────┐
│  Connected  │◄───┐
└──────┬──────┘    │
       │           │ reconnect
       │           │
┌──────▼──────┐    │
│   Active    │    │
│  (Session)  │    │
└──────┬──────┘    │
       │           │
       │ onerror   │
       │ or manual │
       │           │
┌──────▼──────┐    │
│ Disconnected├────┘
└─────────────┘
```

## Error Handling Flow

```
Client                          Server
  │                               │
  ├─ Invalid Message ────────────►│
  │                               ├─ Catch Error
  │                               ├─ Log Error
  │                               │
  │◄─ { type: "error" } ──────────┤
  │   data: { error: "..." }      │
  │                               │
  ├─ Display Error to User        │
  │                               │
  ├─ Continue Session OR          │
  ├─ Reconnect if Critical        │
  │                               │
```

## Best Practices

1. **Always initialize before sending messages**
   - Send `init` first
   - Wait for `init_success`
   - Then send audio/text

2. **Handle all event types**
   - Even if you don't display them
   - Log for debugging

3. **Implement reconnection logic**
   - Auto-reconnect on disconnect
   - Restore session state
   - Resume conversation

4. **Buffer audio properly**
   - Use appropriate codec
   - Send in chunks if large
   - Handle network delays

5. **Show processing states**
   - "Listening..."
   - "Thinking..."
   - "Speaking..."
   - Improves UX

## Integration with Exotel (Next Step)

```
Exotel Call         WebSocket           Voice Pipeline
     │                  │                     │
     ├─ Incoming ──────►│                     │
     │                  ├─ Create Session ───►│
     │                  │◄─ Init Success ─────┤
     │                  │                     │
     ├─ Audio Stream ──►│                     │
     │                  ├─ Process Audio ────►│
     │                  │◄─ Response Audio ───┤
     │◄─ Send Audio ────┤                     │
     │                  │                     │
     ├─ Call End ──────►│                     │
     │                  ├─ End Session ───────►│
     │                  │◄─ Save & Close ─────┤
     │                  │                     │
```
