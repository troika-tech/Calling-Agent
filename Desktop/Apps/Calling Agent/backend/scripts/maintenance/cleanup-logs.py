#!/usr/bin/env python3
import re

file_path = r"c:\Users\USER\Desktop\Apps\Calling Agent\backend\src\websocket\handlers\exotelVoice.handler.ts"

with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Define logs to remove (keep error logs and performance logs starting with ⏱️)
logs_to_remove = [
    # Init logs
    r"logger\.info\('🔌 INIT CONNECTION \(v3\)',.*?\);",
    r"logger\.info\('✅ STARTING SESSION \(v3\)'\);",
    r"logger\.info\('✅ AGENT LOADED \(v3\)',.*?\);",
    r"logger\.info\('✅ INIT COMPLETE \(v4\)'\);",

    # Deepgram streaming logs
    r"logger\.info\('🎤 Creating Deepgram streaming connection with VAD'\);",
    r"logger\.info\('✅ Deepgram FINAL transcript',.*?\);",
    r"logger\.debug\('⏳ Deepgram PARTIAL',.*?\);",
    r"logger\.info\('✅ Deepgram streaming STT initialized'\);",
    r"logger\.warn\('⚠️ Deepgram not available - using batch STT \(higher latency\)'\);",

    # VAD logs
    r"logger\.info\('🔇 VAD: Speech ended - processing transcript'\);",
    r"logger\.warn\('⚠️ VAD: Speech ended but no transcript available'\);",
    r"logger\.info\('🔔 SILENCE \(v4\) - Deepgram ready',[\s\S]*?\);",

    # Event handling logs
    r"logger\.info\('Exotel event',[\s\S]*?\);",
    r"logger\.warn\('Unknown Exotel event',[\s\S]*?\);",
    r"logger\.info\('Exotel stream started',[\s\S]*?\);",
    r"logger\.warn\('Media event received but no media data',[\s\S]*?\);",
    r"logger\.info\('Captured stream_sid from media event',[\s\S]*?\);",
    r"logger\.debug\('Ignoring outbound media track',[\s\S]*?\);",

    # Speech processing logs
    r"logger\.info\('🎤 SPEECH START \(v3\)',[\s\S]*?\);",
    r"logger\.info\('🛑 STOP \(v3\)',.*?\);",
    r"logger\.info\('⚡ PROCESSING \(v3\)',.*?\);",
    r"logger\.warn\('❌ SKIP \(v3\)',[\s\S]*?\);",
    r"logger\.info\('⏸️ STOP HANDLED \(v3\) - waiting for AI response'\);",

    # Mark and greeting logs
    r"logger\.info\('✅ MARK RECEIVED from Exotel \(v13\)',[\s\S]*?\);",
    r"logger\.info\('✅ MARK SENT after greeting \(v13\).*?\);",
    r"logger\.warn\('Failed to send mark message after greeting',[\s\S]*?\);",
    r"logger\.info\('✅ MARK SENT after response \(v[0-9]+\).*?\);",
    r"logger\.warn\('Failed to send mark message',[\s\S]*?\);",

    # Greeting logs
    r"logger\.info\('🎤 GENERATING GREETING \(v13\)',[\s\S]*?\);",
    r"logger\.info\('✅ GREETING AUDIO READY \(v13\)',[\s\S]*?\);",
    r"logger\.info\('✅ GREETING SENT \(v13\)'\);",

    # LLM logs
    r"logger\.info\('⚡ EARLY LLM START \(v5 - Parallel\)',[\s\S]*?\);",
    r"logger\.info\('🚀 EARLY LLM PROCESSING \(v5\)',[\s\S]*?\);",
    r"logger\.info\('⚡ LLM streaming started \(while user still speaking\)'\);",
    r"logger\.info\('⚡ Early LLM sentence ready',.*?\);",
    r"logger\.info\('✅ Early LLM complete',[\s\S]*?\);",

    # Transcript processing logs
    r"logger\.info\('⚡ PROCESS FROM TRANSCRIPT \(v5 - Parallel\)',[\s\S]*?\);",
    r"logger\.warn\('❌ PROCESS ABORT \(v5\) - no transcript'\);",
    r"logger\.info\('✅ Early LLM already processed \(v5\)',[\s\S]*?\);",
    r"logger\.info\('⚡ PARALLEL PROCESSING COMPLETE - Response already sent!'\);",
    r"logger\.info\('👤 USER \(v[0-9]+ - Streaming\):',.*?\);",
    r"logger\.info\('👤 USER \(v[0-9]+\):',.*?\);",
    r"logger\.info\('🤖 AI \(v[0-9]+ - Streaming\):',.*?\);",
    r"logger\.info\('🤖 AI \(v[0-9]+\):',.*?\);",

    # End call logs
    r"logger\.info\('🔚 END CALL PHRASE DETECTED',[\s\S]*?\);",

    # Prompt building logs
    r"logger\.info\('🤖 Building LLM prompt',[\s\S]*?\);",
    r"logger\.debug\('System prompt built',[\s\S]*?\);",

    # RAG logs
    r"logger\.info\('🔍 RAG: Query is relevant, searching knowledge base'\);",
    r"logger\.info\('✅ RAG: Found relevant context',[\s\S]*?\);",
    r"logger\.info\('⚠️ RAG: No relevant context found'\);",
    r"logger\.debug\('RAG: Query not relevant for KB \(conversational/greeting\)'\);",

    # Batch STT logs
    r"logger\.info\('🎤 PROCESS START \(v3\)',[\s\S]*?\);",
    r"logger\.warn\('❌ PROCESS ABORT \(v3\) - no audio'\);",
    r"logger\.info\('🎙️ TRANSCRIBING \(v3\)',.*?\);",
    r"logger\.info\('Using Deepgram for fast transcription'\);",
    r"logger\.warn\('⚠️ Deepgram returned empty transcript, falling back to Whisper'\);",
    r"logger\.info\('✅ Whisper fallback result',[\s\S]*?\);",
    r"logger\.info\('Deepgram not available, falling back to Whisper'\);",
    r"logger\.warn\('⚠️ No speech detected in audio \(both Deepgram and Whisper returned empty\)'\);",

    # TTS logs
    r"logger\.info\('🎤 STREAMING TTS \(v7\)',.*?\);",
    r"logger\.info\('✅ STREAMING TTS COMPLETE \(v7\)',[\s\S]*?\);",
    r"logger\.warn\('WebSocket not open, skipping chunk',[\s\S]*?\);",
    r"logger\.warn\('WebSocket not open, cannot flush buffer',[\s\S]*?\);",
    r"logger\.debug\('Flushed remaining audio',[\s\S]*?\);",
    r"logger\.warn\('WebSocket closed mid-stream, stopping audio transmission',[\s\S]*?\);",

    # Final message logs
    r"logger\.info\('🎤 SENDING FINAL MESSAGE \(v13\)',.*?\);",
    r"logger\.info\('⏳ WAITING FOR FINAL MESSAGE \(v13\)',[\s\S]*?\);",
    r"logger\.info\('✅ FINAL MESSAGE COMPLETE \(v13\)'\);",

    # Disconnect logs
    r"logger\.info\('🔌 DISCONNECTED \(v4\)',.*?\);",
    r"logger\.info\('Closing Deepgram streaming connection'\);",
    r"logger\.info\('✅ Deepgram connection closed'\);",
    r"logger\.info\('⏳ DELAY CLEANUP \(v4\) - 30s'\);",
    r"logger\.info\('🗑️ DELETE SESSION \(v4\)'\);",
]

# Remove each log pattern
for pattern in logs_to_remove:
    content = re.sub(pattern, '', content, flags=re.MULTILINE)

# Clean up multiple empty lines
content = re.sub(r'\n\n\n+', '\n\n', content)

# Write back
with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Cleaned up logs successfully!")
print("Removed verbose logs, kept only:")
print("  - Error logs (logger.error)")
print("  - Performance logs (PERFORMANCE)")
print("  - Critical operational logs")
