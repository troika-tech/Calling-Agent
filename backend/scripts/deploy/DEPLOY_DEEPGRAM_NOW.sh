#!/bin/bash

# Deepgram Deployment Script
# Run this on your AWS EC2 server

echo "=========================================="
echo "Deploying Deepgram Integration"
echo "=========================================="
echo ""

# Navigate to project directory
cd ~/calling-agent || exit 1

echo "✓ Current directory: $(pwd)"
echo ""

# Pull latest code
echo "1. Pulling latest code from GitHub..."
git pull origin main

if [ $? -ne 0 ]; then
    echo "❌ Failed to pull code"
    exit 1
fi
echo "✓ Code pulled successfully"
echo ""

# Check if Deepgram API key exists in .env
echo "2. Checking Deepgram API key in .env..."
if grep -q "DEEPGRAM_API_KEY=48babbf80459d5ce6db3bfccaa9b7c20bfb7981a" backend/.env; then
    echo "✓ Deepgram API key found in .env"
else
    echo "⚠️  Deepgram API key not found or different in server .env"
    echo "Please add: DEEPGRAM_API_KEY=48babbf80459d5ce6db3bfccaa9b7c20bfb7981a"
    echo ""
    read -p "Press Enter after updating .env file..."
fi
echo ""

# Build TypeScript
echo "3. Building TypeScript..."
cd backend || exit 1
npm run build

if [ $? -ne 0 ]; then
    echo "❌ Build failed"
    exit 1
fi
echo "✓ Build completed successfully"
echo ""

# Restart PM2
echo "4. Restarting PM2..."
pm2 restart calling-agent

if [ $? -ne 0 ]; then
    echo "❌ PM2 restart failed"
    exit 1
fi
echo "✓ PM2 restarted successfully"
echo ""

# Wait a moment for initialization
echo "5. Waiting for service to initialize..."
sleep 3
echo ""

# Check logs for Deepgram initialization
echo "6. Checking logs for Deepgram initialization..."
echo "=========================================="
pm2 logs calling-agent --lines 30 --nostream | grep -i "deepgram\|initialized"
echo "=========================================="
echo ""

# Display instructions
echo "✓ Deployment Complete!"
echo ""
echo "Look for these messages in logs above:"
echo "  ✅ [info]: Deepgram service initialized"
echo "  ✅ [info]: Using Deepgram for fast transcription"
echo ""
echo "If you see:"
echo "  ❌ [warn]: Deepgram API key not configured"
echo "Then check your .env file and restart again."
echo ""
echo "To watch live logs:"
echo "  pm2 logs calling-agent"
echo ""
echo "To test: Make a call and check transcription time in logs"
echo "  Should see: \"duration\": \"734ms\" (not 7834ms)"
echo ""
