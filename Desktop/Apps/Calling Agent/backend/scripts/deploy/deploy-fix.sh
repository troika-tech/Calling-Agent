#!/bin/bash

# Deploy multi-turn conversation fix to production
# Run this script from your local machine

echo "🚀 Deploying multi-turn conversation fix..."
echo ""

# Configuration
SERVER="ubuntu@api.0804.in"
REMOTE_DIR="/var/www/ai-calling-backend"

echo "📦 Step 1: Building locally..."
cd backend
npm run build
if [ $? -ne 0 ]; then
    echo "❌ Build failed!"
    exit 1
fi
cd ..
echo "✅ Build complete"
echo ""

echo "📤 Step 2: Uploading files to server..."

# Upload the fixed files
echo "  - Uploading deepgramTTS.service.js..."
scp backend/dist/services/deepgramTTS.service.js $SERVER:$REMOTE_DIR/dist/services/

echo "  - Uploading deepgramTTS.service.d.ts..."
scp backend/dist/services/deepgramTTS.service.d.ts $SERVER:$REMOTE_DIR/dist/services/

echo "  - Uploading exotelVoice.handler.js..."
scp backend/dist/websocket/handlers/exotelVoice.handler.js $SERVER:$REMOTE_DIR/dist/websocket/handlers/

echo "  - Uploading exotelVoice.handler.d.ts..."
scp backend/dist/websocket/handlers/exotelVoice.handler.d.ts $SERVER:$REMOTE_DIR/dist/websocket/handlers/

echo "✅ Files uploaded"
echo ""

echo "🔄 Step 3: Restarting PM2..."
ssh $SERVER "cd $REMOTE_DIR && pm2 restart calling-agent"
echo "✅ PM2 restarted"
echo ""

echo "📋 Step 4: Checking logs..."
ssh $SERVER "pm2 logs calling-agent --lines 20 --nostream"
echo ""

echo "✅ Deployment complete!"
echo ""
echo "🧪 Test by calling: 07948516111"
echo ""
echo "Expected logs to see:"
echo "  ✅ CLEAR SENT after greeting - ready for input"
echo "  🎵 TTS flushed - synthesis complete (v2)"
echo "  ✅ CLEAR SENT (v3) - ready for next input"
