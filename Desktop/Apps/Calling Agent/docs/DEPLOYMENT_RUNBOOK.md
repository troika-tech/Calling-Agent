# Deployment Runbook

## Overview

This runbook provides step-by-step instructions for deploying the AI Calling Platform to production.

---

## 📋 Pre-Deployment Checklist

### Code Quality

- [ ] All tests passing (unit, integration)
- [ ] TypeScript compilation successful
- [ ] No linting errors
- [ ] Code review completed
- [ ] Documentation updated

### Security

- [ ] No secrets in code
- [ ] Environment variables configured
- [ ] `npm audit` clean
- [ ] Security headers configured
- [ ] HTTPS certificates valid

### Infrastructure

- [ ] MongoDB cluster ready
- [ ] Redis cluster ready
- [ ] Load balancer configured
- [ ] DNS records updated
- [ ] CDN configured (if applicable)

### Dependencies

- [ ] All dependencies installed
- [ ] Versions locked in package-lock.json
- [ ] No deprecated dependencies
- [ ] License compliance verified

---

## 🚀 Deployment Steps

### 1. Environment Setup

#### Production Environment Variables

Create `.env.production`:

```env
# Server
NODE_ENV=production
PORT=3000
API_VERSION=v1

# Database
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/calling-platform?retryWrites=true&w=majority
MONGODB_MAX_POOL_SIZE=50

# Redis
REDIS_HOST=redis.production.internal
REDIS_PORT=6379
REDIS_PASSWORD=your-redis-password
REDIS_DB=0
REDIS_TLS=true

# Bull Queue
QUEUE_RETRY_ATTEMPTS=3
QUEUE_RETRY_BACKOFF_DELAY=2000

# Exotel
EXOTEL_API_KEY=your-exotel-api-key
EXOTEL_API_SECRET=your-exotel-api-secret
EXOTEL_SUBDOMAIN=your-subdomain
EXOTEL_SID=your-sid
EXOTEL_VIRTUAL_NUMBER=+91XXXXXXXXXX
EXOTEL_APP_ID=your-app-id

# AI Services
OPENAI_API_KEY=your-openai-key
ANTHROPIC_API_KEY=your-anthropic-key
DEEPGRAM_API_KEY=your-deepgram-key
ELEVENLABS_API_KEY=your-elevenlabs-key

# Application
MAX_CONCURRENT_OUTBOUND_CALLS=100
ENABLE_AUTO_RETRY=true
ENABLE_CONNECTION_PREWARMING=true

# Logging
LOG_LEVEL=info
LOG_FILE=logs/app.log

# Security
CORS_ORIGIN=https://yourdomain.com
RATE_LIMIT_WINDOW=900000
RATE_LIMIT_MAX=1000
```

### 2. Build Application

```bash
cd backend

# Install dependencies
npm ci --production

# Build TypeScript
npm run build

# Verify build
ls dist/
```

### 3. Database Migration

```bash
# Backup database first
mongodump --uri="$MONGODB_URI" --out=backup-$(date +%Y%m%d)

# Run migrations (if any)
npm run migrate

# Verify indexes
npm run verify-indexes
```

### 4. Start Services

#### Using PM2 (Recommended)

```bash
# Install PM2 globally
npm install -g pm2

# Start application
pm2 start ecosystem.config.js --env production

# Save PM2 configuration
pm2 save

# Setup PM2 startup script
pm2 startup
```

**ecosystem.config.js**:
```javascript
module.exports = {
  apps: [{
    name: 'calling-platform',
    script: './dist/server.js',
    instances: 'max',
    exec_mode: 'cluster',
    env_production: {
      NODE_ENV: 'production'
    },
    error_file: './logs/pm2-error.log',
    out_file: './logs/pm2-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    max_memory_restart: '1G',
    autorestart: true,
    watch: false
  }]
};
```

#### Using Docker

```bash
# Build image
docker build -t calling-platform:latest .

# Run container
docker run -d \
  --name calling-platform \
  --env-file .env.production \
  -p 3000:3000 \
  --restart unless-stopped \
  calling-platform:latest
```

**Dockerfile**:
```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --production

COPY dist ./dist
COPY public ./public

EXPOSE 3000

CMD ["node", "dist/server.js"]
```

#### Using Kubernetes

```bash
# Apply configurations
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/secrets.yaml
kubectl apply -f k8s/configmap.yaml
kubectl apply -f k8s/deployment.yaml
kubectl apply -f k8s/service.yaml
kubectl apply -f k8s/ingress.yaml

# Verify deployment
kubectl get pods -n calling-platform
kubectl get svc -n calling-platform
```

### 5. Health Checks

```bash
# Check application health
curl https://api.yourdomain.com/api/v1/health

# Expected response:
# {"success":true,"message":"API is running","timestamp":"2025-11-01T..."}

# Check database connection
curl https://api.yourdomain.com/api/v1/stats

# Check Redis connection
curl https://api.yourdomain.com/api/v1/scheduling/stats
```

### 6. Smoke Tests

```bash
# Run production smoke tests
npm run test:smoke:production

# Test critical endpoints
./scripts/smoke-test.sh https://api.yourdomain.com
```

### 7. Enable Monitoring

```bash
# Start monitoring services
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 100M
pm2 set pm2-logrotate:retain 30

# Configure alerts
pm2 install pm2-slack
pm2 set pm2-slack:webhook_url https://hooks.slack.com/services/YOUR/WEBHOOK
```

---

## 🔄 Rollback Procedure

### Quick Rollback

```bash
# Stop current version
pm2 stop calling-platform

# Checkout previous version
git checkout <previous-commit>

# Rebuild
npm ci
npm run build

# Restart
pm2 restart calling-platform

# Verify
curl http://localhost:3000/api/v1/health
```

### Database Rollback

```bash
# Restore from backup
mongorestore --uri="$MONGODB_URI" --drop backup-YYYYMMDD/

# Verify
mongosh $MONGODB_URI --eval "db.stats()"
```

### Zero-Downtime Rollback (Blue-Green)

```bash
# Switch load balancer to old version
./scripts/switch-to-blue.sh

# Verify traffic switched
curl https://api.yourdomain.com/api/v1 | jq .version
```

---

## 📊 Post-Deployment Validation

### Functional Tests

- [ ] Schedule a test call
- [ ] Import test CSV (10 calls)
- [ ] Check analytics dashboard
- [ ] Trigger manual retry
- [ ] Verify voicemail detection

### Performance Tests

- [ ] Response time < 200ms (health)
- [ ] CPU usage < 70%
- [ ] Memory usage stable
- [ ] No memory leaks
- [ ] Queue processing normal

### Monitoring

- [ ] Logs flowing to aggregator
- [ ] Metrics being collected
- [ ] Alerts configured
- [ ] Dashboards accessible
- [ ] Error tracking active

---

## 🔧 Troubleshooting

### Application Won't Start

```bash
# Check logs
pm2 logs calling-platform --lines 100

# Common issues:
# 1. Port already in use
sudo lsof -i :3000

# 2. Missing environment variables
pm2 env 0

# 3. Database connection
mongosh $MONGODB_URI --eval "db.runCommand({ping:1})"

# 4. Redis connection
redis-cli -h $REDIS_HOST ping
```

### High CPU Usage

```bash
# Check process
top -p $(pgrep -f "node.*server.js")

# Profile application
node --prof dist/server.js
node --prof-process isolate-*.log > processed.txt

# Check for infinite loops
pm2 monit
```

### High Memory Usage

```bash
# Check memory
pm2 monit

# Generate heap snapshot
kill -USR2 $(pgrep -f "node.*server.js")
ls heapsnapshot-*.heapsnapshot

# Analyze with Chrome DevTools
chrome://inspect
```

### Database Connection Errors

```bash
# Check connection string
echo $MONGODB_URI

# Test connection
mongosh $MONGODB_URI --eval "db.runCommand({ping:1})"

# Check connection pool
curl http://localhost:3000/api/v1/stats | jq .database
```

### Queue Not Processing

```bash
# Check Redis
redis-cli -h $REDIS_HOST ping

# Check queue stats
curl http://localhost:3000/api/v1/scheduling/stats | jq .queue

# Clear stuck jobs (careful!)
redis-cli KEYS "bull:scheduled-calls:*" | xargs redis-cli DEL
```

---

## 📈 Scaling Guidelines

### Horizontal Scaling

```bash
# Add more instances (PM2)
pm2 scale calling-platform +2

# Or update ecosystem.config.js:
instances: 8  # Fixed number
instances: 'max'  # One per CPU core
```

### Vertical Scaling

```bash
# Increase memory limit
pm2 start ecosystem.config.js --max-memory-restart 2G

# Increase worker threads
export UV_THREADPOOL_SIZE=16
```

### Database Scaling

```bash
# Enable read replicas
MONGODB_URI_READ=mongodb+srv://...?readPreference=secondaryPreferred

# Increase connection pool
MONGODB_MAX_POOL_SIZE=100
```

### Queue Scaling

```bash
# Add more queue workers
pm2 start queue-worker.js -i 4

# Increase concurrency
export MAX_CONCURRENT_JOBS=10
```

---

## 🛡️ Security Hardening

### Firewall Rules

```bash
# Allow only necessary ports
ufw allow 22/tcp    # SSH
ufw allow 80/tcp    # HTTP
ufw allow 443/tcp   # HTTPS
ufw deny 3000/tcp   # Block direct app access
ufw enable
```

### SSL/TLS Configuration

```bash
# Install certificate (Let's Encrypt)
certbot --nginx -d api.yourdomain.com

# Auto-renewal
certbot renew --dry-run

# Add to crontab:
0 0 1 * * certbot renew --quiet
```

### Security Headers (Nginx)

```nginx
add_header X-Frame-Options "SAMEORIGIN" always;
add_header X-Content-Type-Options "nosniff" always;
add_header X-XSS-Protection "1; mode=block" always;
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
add_header Content-Security-Policy "default-src 'self'" always;
```

---

## 📚 Additional Resources

- [PM2 Documentation](https://pm2.keymetrics.io/docs/)
- [MongoDB Production Notes](https://docs.mongodb.com/manual/administration/production-notes/)
- [Redis Production Deployment](https://redis.io/topics/admin)
- [Node.js Production Best Practices](https://nodejs.org/en/docs/guides/simple-profiling/)
