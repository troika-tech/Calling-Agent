# Deploy Backend to Production (AWS EC2)

## Quick Deploy Commands

### SSH into your EC2 server:
```bash
ssh -i "your-key.pem" ubuntu@calling-api.0804.in
```

### Once connected, run these commands:

```bash
# Navigate to project directory
cd ~/calling-agent  # or wherever your project is located

# Pull latest changes
git pull origin main

# Navigate to backend
cd backend

# Install dependencies (if new packages added)
npm install

# Build TypeScript
npm run build

# Restart PM2 process
pm2 restart calling-agent

# Check status
pm2 status

# View logs
pm2 logs calling-agent --lines 50
```

---

## Full Deployment Steps

### 1. Connect to EC2
```bash
ssh -i "your-key.pem" ubuntu@calling-api.0804.in
```

### 2. Pull Latest Code
```bash
cd ~/calling-agent  # Adjust path as needed
git pull origin main
```

### 3. Install Dependencies
```bash
cd backend
npm install
```

### 4. Build TypeScript
```bash
npm run build
```

### 5. Check Environment Variables
```bash
# Verify .env file has all required variables
cat .env

# Required variables:
# - NODE_ENV=production
# - PORT=5000
# - MONGODB_URI=your_mongodb_connection
# - JWT_SECRET=your_jwt_secret
# - OPENAI_API_KEY=your_openai_key
# - ELEVENLABS_API_KEY=your_elevenlabs_key (if using ElevenLabs)
```

### 6. Restart Application

#### If using PM2:
```bash
pm2 restart calling-agent
pm2 status
pm2 logs calling-agent --lines 100
```

#### If using systemd:
```bash
sudo systemctl restart calling-agent
sudo systemctl status calling-agent
sudo journalctl -u calling-agent -f
```

#### If running directly:
```bash
# Kill existing process
pkill -f "node dist/server.js"

# Start in background
nohup npm start > output.log 2>&1 &

# Or use screen/tmux
screen -S calling-agent
npm start
# Ctrl+A, D to detach
```

### 7. Verify Deployment
```bash
# Check if server is running
curl http://localhost:5000/api/v1/health

# Check WebSocket
curl -i -N \
  -H "Connection: Upgrade" \
  -H "Upgrade: websocket" \
  -H "Sec-WebSocket-Version: 13" \
  -H "Sec-WebSocket-Key: test" \
  http://localhost:5000/ws

# Check from external
curl https://calling-api.0804.in/api/v1/health
```

### 8. Monitor Logs
```bash
# PM2 logs
pm2 logs calling-agent

# Winston logs (if configured with file output)
tail -f logs/combined-*.log
tail -f logs/error-*.log

# System logs
sudo journalctl -f -u calling-agent
```

---

## Rollback (If Something Goes Wrong)

```bash
# Check git history
git log --oneline -5

# Rollback to previous commit
git checkout <previous-commit-hash>

# Rebuild
npm run build

# Restart
pm2 restart calling-agent
```

---

## New Features Deployed

### 1. Winston Logging
- Daily rotating log files
- Separate error logs
- HTTP request logging
- Structured JSON logs

**Log Locations:**
- `logs/combined-YYYY-MM-DD.log` - All logs
- `logs/error-YYYY-MM-DD.log` - Errors only
- `logs/http-YYYY-MM-DD.log` - HTTP requests
- `logs/exceptions-YYYY-MM-DD.log` - Uncaught exceptions

**Check Logs:**
```bash
# View recent logs
tail -f logs/combined-*.log

# View errors
tail -f logs/error-*.log

# Search logs
grep "User speech transcribed" logs/combined-*.log
```

### 2. AI Conversation Flow
The AI now handles conversations after the greeting:
- User speaks → Whisper (STT)
- AI thinks → GPT-4 (LLM)
- AI responds → OpenAI TTS/ElevenLabs
- Audio streams back to caller

**Test:**
1. Call your Exotel number
2. Listen to greeting
3. Say something (e.g., "I need help")
4. Wait 1.5 seconds
5. AI will respond!

**Monitor AI Processing:**
```bash
# Watch AI conversation in real-time
pm2 logs calling-agent | grep -E "transcribed|generated|synthesis"
```

---

## Troubleshooting

### Issue: Build Fails
```bash
# Check Node version
node --version  # Should be 18+

# Clean build
rm -rf dist/
npm run build
```

### Issue: PM2 Not Restarting
```bash
# Check PM2 status
pm2 status

# Stop and start
pm2 stop calling-agent
pm2 start calling-agent

# Delete and recreate
pm2 delete calling-agent
pm2 start dist/server.js --name calling-agent
pm2 save
```

### Issue: MongoDB Connection Error
```bash
# Test MongoDB connection
mongo "your_mongodb_uri"

# Check environment variable
echo $MONGODB_URI
grep MONGODB_URI .env
```

### Issue: OpenAI API Errors
```bash
# Verify API key is set
grep OPENAI_API_KEY .env

# Test API key
curl https://api.openai.com/v1/models \
  -H "Authorization: Bearer $OPENAI_API_KEY"
```

### Issue: WebSocket Not Working
```bash
# Check if port 5000 is listening
sudo netstat -tulpn | grep 5000

# Check firewall
sudo ufw status

# Check Nginx proxy (if using)
sudo nginx -t
sudo systemctl status nginx
```

---

## Performance Monitoring

### Check System Resources
```bash
# CPU and Memory
htop

# Disk space
df -h

# Check logs size
du -sh logs/
```

### Monitor Application
```bash
# PM2 monitoring
pm2 monit

# Check process
pm2 show calling-agent

# Application metrics
pm2 web  # Opens web interface on port 9615
```

---

## Security Checklist

- [ ] `.env` file is not committed to git
- [ ] JWT_SECRET is strong and unique
- [ ] MongoDB uses authentication
- [ ] Firewall allows only necessary ports (80, 443, 5000)
- [ ] SSL certificate is valid
- [ ] API keys are rotated regularly
- [ ] Logs don't contain sensitive data

---

## PM2 Setup (First Time)

If PM2 is not set up yet:

```bash
# Install PM2 globally
sudo npm install -g pm2

# Start application
cd ~/calling-agent/backend
pm2 start dist/server.js --name calling-agent

# Save PM2 configuration
pm2 save

# Setup PM2 to start on boot
pm2 startup
# Run the command it outputs

# Verify
pm2 status
```

---

## Nginx Configuration (If Using)

If you're using Nginx as reverse proxy:

```bash
# Edit Nginx config
sudo nano /etc/nginx/sites-available/calling-api

# Configuration:
server {
    listen 80;
    server_name calling-api.0804.in;

    location / {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    location /ws {
        proxy_pass http://localhost:5000/ws;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "Upgrade";
        proxy_set_header Host $host;
    }
}

# Test configuration
sudo nginx -t

# Reload Nginx
sudo systemctl reload nginx
```

---

## Quick Health Check

Run this after deployment:

```bash
# Backend API
curl https://calling-api.0804.in/api/v1/health

# Expected response:
# {"status":"ok","timestamp":"..."}

# PM2 Status
pm2 status

# Recent logs
pm2 logs calling-agent --lines 20 --nostream

# System resources
free -h
df -h
```

---

## Contact for Issues

If deployment fails:
1. Check PM2 logs: `pm2 logs calling-agent`
2. Check error logs: `tail -f logs/error-*.log`
3. Verify environment variables: `cat .env`
4. Test MongoDB connection
5. Verify OpenAI API key

---

## Deployment Checklist

- [x] Code committed and pushed to GitHub
- [ ] SSH into EC2 server
- [ ] Pull latest code
- [ ] Install dependencies
- [ ] Build TypeScript
- [ ] Verify environment variables
- [ ] Restart PM2/service
- [ ] Check logs for errors
- [ ] Test API endpoint
- [ ] Test WebSocket connection
- [ ] Make a test call to verify AI conversation

---

**Deployment Complete!** 🚀

Your backend is now running with:
- ✅ Winston logging
- ✅ AI conversation handling
- ✅ Real-time audio streaming
- ✅ Full conversation transcripts

Make a test call to see the AI in action!
