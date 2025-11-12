# Setup Guide - Outbound Calls Development Environment

**Version**: 1.0  
**Last Updated**: 2025-11-01

---

## Quick Start Checklist

- [ ] Redis installed and running
- [ ] All dependencies installed (`npm install`)
- [ ] `.env` file configured
- [ ] Exotel credentials added
- [ ] Test server starts successfully

---

## Step 1: Install Redis

### Windows (WSL2 Recommended)
```bash
sudo apt update && sudo apt install redis-server
sudo service redis-server start
redis-cli ping  # Should return "PONG"
```

### macOS
```bash
brew install redis
brew services start redis
redis-cli ping
```

---

## Step 2: Install Dependencies

```bash
cd backend
npm install
```

New packages added:
- `bull` - Job queue (already installed)
- `redis` - Redis client (already installed)
- `bottleneck` - Rate limiting ✅
- `moment-timezone` - Timezone handling ✅
- `joi` - Validation ✅
- `csv-parse` - CSV import ✅

---

## Step 3: Configure .env

Copy `.env.example` to `.env` and update:

```env
# Exotel
EXOTEL_VIRTUAL_NUMBER=+91xxxxxxxxxx
EXOTEL_APP_ID=your-app-id

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# Limits
MAX_CONCURRENT_OUTBOUND_CALLS=10
DEEPGRAM_MAX_CONNECTIONS=20
```

---

## Step 4: Verify Setup

```bash
# Start server
npm run dev

# Test Redis
redis-cli ping

# Test API
curl http://localhost:5000/health
```

---

**Status**: Environment ready for Phase 1 development!
