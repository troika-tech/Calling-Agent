# PowerShell script to clean up verbose logs and keep only performance timing logs

$filePath = "c:\Users\USER\Desktop\Apps\Calling Agent\backend\src\websocket\handlers\exotelVoice.handler.ts"
$content = Get-Content $filePath -Raw

# Remove specific verbose log lines but keep performance logs
$patterns = @(
    "logger\.info\('✅ AGENT LOADED \(v3\)',.*?\);",
    "logger\.info\('📞 CALL STARTED \(v4 - Streaming STT\)',.*?\);",
    "logger\.info\('🎤 Creating Deepgram streaming connection with VAD'\);",
    "logger\.info\('✅ Deepgram FINAL transcript',.*?\);",
    "logger\.debug\('⏳ Deepgram PARTIAL',.*?\);",
    "logger\.info\('⚡ EARLY LLM START \(v5 - Parallel\)',[\s\S]*?\}\s*\);",
    "logger\.info\('🔇 VAD: Speech ended - processing transcript'\);",
    "logger\.warn\('⚠️ VAD: Speech ended but no transcript available'\);",
    "logger\.info\('✅ Deepgram streaming STT initialized'\);",
    "logger\.warn\('⚠️ Deepgram not available - using batch STT \(higher latency\)'\);",
    "logger\.info\('✅ INIT COMPLETE \(v4\)'\);",
    "logger\.info\('Exotel event',[\s\S]*?\}\s*\);",
    "logger\.warn\('Unknown Exotel event',[\s\S]*?\}\s*\);",
    "logger\.info\('Exotel stream started',[\s\S]*?\}\s*\);",
    "logger\.warn\('Media event received but no media data',[\s\S]*?\}\s*\);",
    "logger\.info\('Captured stream_sid from media event',[\s\S]*?\}\s*\);",
    "logger\.debug\('Ignoring outbound media track',[\s\S]*?\}\s*\);",
    "logger\.info\('🎤 SPEECH START \(v3\)',[\s\S]*?\}\s*\);",
    "logger\.info\('🔔 SILENCE \(v4\) - Deepgram ready',[\s\S]*?\}\s*\);",
    "logger\.info\('🛑 STOP \(v3\)',.*?\);",
    "logger\.info\('⚡ PROCESSING \(v3\)',.*?\);",
    "logger\.warn\('❌ SKIP \(v3\)',[\s\S]*?\}\s*\);",
    "logger\.info\('⏸️ STOP HANDLED \(v3\) - waiting for AI response'\);",
    "logger\.info\('✅ MARK RECEIVED from Exotel \(v13\)',[\s\S]*?\}\s*\);",
    "logger\.info\('🎤 GENERATING GREETING \(v13\)',[\s\S]*?\}\s*\);",
    "logger\.info\('✅ GREETING AUDIO READY \(v13\)',[\s\S]*?\}\s*\);",
    "logger\.info\('✅ GREETING SENT \(v13\)'\);",
    "logger\.info\('✅ MARK SENT after greeting \(v13\).*?\);",
    "logger\.warn\('Failed to send mark message after greeting',[\s\S]*?\}\s*\);",
    "logger\.info\('🚀 EARLY LLM PROCESSING \(v5\)',[\s\S]*?\}\s*\);",
    "logger\.info\('⚡ LLM streaming started \(while user still speaking\)'\);",
    "logger\.info\('⚡ Early LLM sentence ready',.*?\);",
    "logger\.info\('✅ Early LLM complete',[\s\S]*?\}\s*\);",
    "logger\.warn\('Failed to send mark message',.*?\);",
    "logger\.info\('⚡ PROCESS FROM TRANSCRIPT \(v5 - Parallel\)',[\s\S]*?\}\s*\);",
    "logger\.warn\('❌ PROCESS ABORT \(v5\) - no transcript'\);",
    "logger\.info\('✅ Early LLM already processed \(v5\)',[\s\S]*?\}\s*\);",
    "logger\.info\('⚡ PARALLEL PROCESSING COMPLETE - Response already sent!'\);",
    "logger\.info\('👤 USER \(v4 - Streaming\):',.*?\);",
    "logger\.info\('🔚 END CALL PHRASE DETECTED',[\s\S]*?\}\s*\);",
    "logger\.info\('🤖 Building LLM prompt',[\s\S]*?\}\s*\);",
    "logger\.info\('🔍 RAG: Query is relevant, searching knowledge base'\);",
    "logger\.info\('✅ RAG: Found relevant context',[\s\S]*?\}\s*\);",
    "logger\.info\('⚠️ RAG: No relevant context found'\);",
    "logger\.debug\('RAG: Query not relevant for KB \(conversational/greeting\)'\);",
    "logger\.debug\('System prompt built',[\s\S]*?\}\s*\);",
    "logger\.info\('🤖 AI \(v4 - Streaming\):',.*?\);",
    "logger\.info\('✅ MARK SENT after response \(v4\).*?\);",
    "logger\.warn\('Failed to send mark message',[\s\S]*?\}\s*\);"
)

foreach ($pattern in $patterns) {
    $content = $content -replace $pattern, ""
}

# Write back
Set-Content -Path $filePath -Value $content -NoNewline

Write-Host "Cleaned up logs successfully!"
