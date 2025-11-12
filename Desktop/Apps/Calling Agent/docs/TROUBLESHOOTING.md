# Troubleshooting Guide

## Table of Contents
- [Common Issues](#common-issues)
- [Database Issues](#database-issues)
- [API Issues](#api-issues)
- [Integration Issues](#integration-issues)
- [Performance Issues](#performance-issues)
- [Debugging Tips](#debugging-tips)

---

## Common Issues

### Application Won't Start

**Issue:** Backend server fails to start

**Symptoms:**
```
Error: Cannot find module 'express'
Error: Connection refused to MongoDB
```

**Solutions:**

1. **Missing dependencies**
   ```bash
   cd backend
   rm -rf node_modules package-lock.json
   npm install
   ```

2. **MongoDB not running**
   ```bash
   # Check if MongoDB is running
   ps aux | grep mongod

   # Start MongoDB
   mongod --dbpath /path/to/data

   # Or with Docker
   docker-compose up -d mongodb
   ```

3. **Environment variables not set**
   ```bash
   # Check if .env exists
   ls -la backend/.env

   # Copy from example if missing
   cp backend/.env.example backend/.env
   ```

4. **Port already in use**
   ```bash
   # Find process using port 5000
   lsof -i :5000

   # Kill process
   kill -9 <PID>

   # Or change port in .env
   PORT=5001
   ```

---

### Frontend Won't Connect to Backend

**Issue:** API requests failing from frontend

**Symptoms:**
```
Network Error
CORS policy blocked
404 Not Found
```

**Solutions:**

1. **Check API URL configuration**
   ```bash
   # frontend/.env
   VITE_API_URL=http://localhost:5000/api/v1

   # Ensure no trailing slash
   ```

2. **CORS Configuration**
   ```typescript
   // backend/src/app.ts
   import cors from 'cors';

   app.use(cors({
     origin: process.env.FRONTEND_URL || 'http://localhost:5173',
     credentials: true
   }));
   ```

3. **Backend not running**
   ```bash
   cd backend
   npm run dev

   # Check if it's listening
   curl http://localhost:5000/api/v1/health
   ```

---

### WebSocket Connection Failing

**Issue:** Real-time updates not working

**Symptoms:**
```
WebSocket connection failed
Socket.io connection error
```

**Solutions:**

1. **Check Socket.io URL**
   ```typescript
   // Frontend
   const socket = io(process.env.VITE_SOCKET_URL, {
     transports: ['websocket', 'polling']
   });
   ```

2. **Nginx configuration (if using proxy)**
   ```nginx
   location /socket.io/ {
     proxy_pass http://backend:5000;
     proxy_http_version 1.1;
     proxy_set_header Upgrade $http_upgrade;
     proxy_set_header Connection "upgrade";
   }
   ```

3. **Firewall blocking**
   ```bash
   # Check if port is accessible
   telnet localhost 5000

   # Allow port in firewall
   sudo ufw allow 5000
   ```

---

## Database Issues

### MongoDB Connection Error

**Issue:** Cannot connect to MongoDB

**Symptoms:**
```
MongoNetworkError: connect ECONNREFUSED 127.0.0.1:27017
MongoServerSelectionError: Server selection timed out
```

**Solutions:**

1. **Check MongoDB is running**
   ```bash
   # Status check
   sudo systemctl status mongod

   # Start MongoDB
   sudo systemctl start mongod

   # Enable on boot
   sudo systemctl enable mongod
   ```

2. **Check connection string**
   ```bash
   # Local development
   MONGODB_URI=mongodb://localhost:27017/ai-calling-platform

   # With authentication
   MONGODB_URI=mongodb://username:password@localhost:27017/ai-calling-platform?authSource=admin

   # Docker
   MONGODB_URI=mongodb://mongodb:27017/ai-calling-platform
   ```

3. **Check MongoDB logs**
   ```bash
   # View logs
   sudo tail -f /var/log/mongodb/mongod.log

   # Docker logs
   docker logs mongodb
   ```

4. **Network issues**
   ```bash
   # Test connection
   mongosh --host localhost --port 27017

   # Check if port is listening
   netstat -tuln | grep 27017
   ```

---

### Redis Connection Error

**Issue:** Cannot connect to Redis

**Symptoms:**
```
Error: Redis connection failed
ECONNREFUSED 127.0.0.1:6379
```

**Solutions:**

1. **Check Redis is running**
   ```bash
   # Check status
   redis-cli ping
   # Should return: PONG

   # Start Redis
   redis-server

   # Or with systemd
   sudo systemctl start redis
   ```

2. **Check connection URL**
   ```bash
   # Without password
   REDIS_URL=redis://localhost:6379

   # With password
   REDIS_URL=redis://:password@localhost:6379

   # Docker
   REDIS_URL=redis://redis:6379
   ```

3. **Redis configuration**
   ```bash
   # Check config
   redis-cli CONFIG GET bind

   # Should include 127.0.0.1 or 0.0.0.0
   # Edit /etc/redis/redis.conf if needed
   bind 127.0.0.1
   ```

---

### Database Query Slow

**Issue:** Queries taking too long

**Solutions:**

1. **Create indexes**
   ```javascript
   // Check query performance
   db.calllogs.find({ userId: ObjectId('...') }).explain('executionStats')

   // Create missing indexes
   db.calllogs.createIndex({ userId: 1, createdAt: -1 })
   ```

2. **Analyze slow queries**
   ```javascript
   // Enable profiling
   db.setProfilingLevel(2)

   // View slow queries
   db.system.profile.find({ millis: { $gt: 100 } })
   ```

3. **Optimize queries**
   ```typescript
   // Use projection to limit fields
   const users = await User.find({}, 'email name')
     .lean()  // Return plain objects
     .limit(20);

   // Use indexes
   const calls = await CallLog.find({ userId })
     .sort({ createdAt: -1 })
     .limit(50);
   ```

---

## API Issues

### 401 Unauthorized Errors

**Issue:** All API requests returning 401

**Solutions:**

1. **Check JWT token**
   ```typescript
   // Verify token is being sent
   console.log(localStorage.getItem('accessToken'));

   // Check Authorization header
   api.interceptors.request.use(config => {
     const token = localStorage.getItem('accessToken');
     if (token) {
       config.headers.Authorization = `Bearer ${token}`;
     }
     return config;
   });
   ```

2. **Check token expiration**
   ```typescript
   // Decode JWT to check expiry
   import jwt_decode from 'jwt-decode';

   const decoded = jwt_decode(token);
   console.log('Token expires:', new Date(decoded.exp * 1000));

   // Implement token refresh
   if (Date.now() >= decoded.exp * 1000) {
     await refreshToken();
   }
   ```

3. **Check JWT secret**
   ```bash
   # Ensure JWT_SECRET is set in backend
   JWT_SECRET=your-secret-key-min-32-chars
   ```

---

### 429 Rate Limit Exceeded

**Issue:** Too many requests

**Solutions:**

1. **Check rate limit settings**
   ```typescript
   // backend/src/middlewares/rateLimit.middleware.ts
   export const apiLimiter = rateLimit({
     windowMs: 15 * 60 * 1000, // 15 minutes
     max: 100, // Increase if needed
     message: 'Too many requests'
   });
   ```

2. **Implement request queuing in frontend**
   ```typescript
   // Use debounce for search
   const debouncedSearch = debounce((query) => {
     searchAPI(query);
   }, 300);
   ```

3. **Use caching**
   ```typescript
   // Cache API responses
   const getCachedData = async (key: string) => {
     const cached = localStorage.getItem(key);
     if (cached) {
       const { data, timestamp } = JSON.parse(cached);
       if (Date.now() - timestamp < 5 * 60 * 1000) {
         return data;
       }
     }
     const data = await fetchData();
     localStorage.setItem(key, JSON.stringify({
       data,
       timestamp: Date.now()
     }));
     return data;
   };
   ```

---

### 500 Internal Server Error

**Issue:** Server throwing errors

**Solutions:**

1. **Check server logs**
   ```bash
   # Backend logs
   tail -f backend/logs/error.log

   # PM2 logs
   pm2 logs backend

   # Docker logs
   docker logs ai-calling-backend
   ```

2. **Enable detailed error logging**
   ```typescript
   // backend/src/middlewares/error.middleware.ts
   export const errorHandler = (err: any, req: Request, res: Response, next: NextFunction) => {
     logger.error('Error:', {
       error: err.message,
       stack: err.stack,
       url: req.url,
       method: req.method,
       body: req.body
     });

     res.status(500).json({
       success: false,
       error: {
         message: process.env.NODE_ENV === 'development'
           ? err.message
           : 'Internal server error',
         stack: process.env.NODE_ENV === 'development'
           ? err.stack
           : undefined
       }
     });
   };
   ```

3. **Common fixes**
   ```typescript
   // Wrap async routes in try-catch
   export const getUsers = async (req: Request, res: Response) => {
     try {
       const users = await User.find();
       res.json({ success: true, data: users });
     } catch (error) {
       logger.error('Get users error', { error });
       res.status(500).json({
         success: false,
         error: 'Failed to fetch users'
       });
     }
   };
   ```

---

## Integration Issues

### Exotel Webhooks Not Receiving

**Issue:** Webhooks not being called

**Solutions:**

1. **Check webhook URL**
   ```bash
   # Ensure WEBHOOK_BASE_URL is set correctly
   WEBHOOK_BASE_URL=https://api.yourdomain.com

   # For development with ngrok
   WEBHOOK_BASE_URL=https://abc123.ngrok.io
   ```

2. **Verify Exotel configuration**
   - Login to Exotel dashboard
   - Check webhook URLs are correct
   - Ensure HTTP POST method is selected

3. **Test webhook locally**
   ```bash
   # Start ngrok
   ngrok http 5000

   # Update Exotel webhooks with ngrok URL
   # Test with curl
   curl -X POST https://your-ngrok-url/api/v1/webhooks/exotel/incoming \
     -H "Content-Type: application/json" \
     -d '{"From":"+919876543210","To":"+919123456789","CallSid":"TEST123"}'
   ```

4. **Check webhook logs**
   ```typescript
   // Add logging to webhook handlers
   app.post('/api/v1/webhooks/exotel/incoming', (req, res) => {
     logger.info('Webhook received', { body: req.body, headers: req.headers });
     // ... rest of handler
   });
   ```

---

### OpenAI API Errors

**Issue:** OpenAI requests failing

**Symptoms:**
```
Error: Invalid API key
Error: Rate limit exceeded
Error: Model not found
```

**Solutions:**

1. **Verify API key**
   ```bash
   # Check if key is set
   echo $OPENAI_API_KEY

   # Test key
   curl https://api.openai.com/v1/models \
     -H "Authorization: Bearer $OPENAI_API_KEY"
   ```

2. **Handle rate limits**
   ```typescript
   async function retryWithBackoff(fn: () => Promise<any>, retries = 3) {
     for (let i = 0; i < retries; i++) {
       try {
         return await fn();
       } catch (error: any) {
         if (error.status === 429 && i < retries - 1) {
           const delay = Math.pow(2, i) * 1000;
           await new Promise(resolve => setTimeout(resolve, delay));
         } else {
           throw error;
         }
       }
     }
   }

   const response = await retryWithBackoff(() =>
     openai.chat.completions.create({ /* ... */ })
   );
   ```

3. **Check model availability**
   ```typescript
   // Use correct model names
   const models = ['gpt-4', 'gpt-4-turbo', 'gpt-3.5-turbo'];

   // Not: 'gpt-4.0', 'gpt4', etc.
   ```

---

### Deepgram Transcription Issues

**Issue:** Poor transcription quality

**Solutions:**

1. **Check audio quality**
   ```typescript
   // Ensure audio format is supported
   const connection = deepgram.listen.live({
     model: 'nova-2',
     language: 'en',
     encoding: 'linear16',
     sample_rate: 16000,
     channels: 1
   });
   ```

2. **Use appropriate model**
   ```typescript
   // For phone calls
   model: 'nova-2-phonecall'

   // For general audio
   model: 'nova-2-general'

   // For specific languages
   language: 'en-IN'  // Indian English
   ```

3. **Add custom vocabulary**
   ```typescript
   const connection = deepgram.listen.live({
     model: 'nova-2',
     keywords: ['your-brand:2', 'product-name:2']
   });
   ```

---

## Performance Issues

### High Memory Usage

**Issue:** Application consuming too much memory

**Solutions:**

1. **Check for memory leaks**
   ```bash
   # Monitor memory
   node --inspect backend/dist/server.js

   # Open Chrome DevTools
   chrome://inspect

   # Take heap snapshot
   ```

2. **Optimize MongoDB queries**
   ```typescript
   // Use .lean() for read-only queries
   const users = await User.find().lean();

   // Stream large datasets
   const cursor = User.find().cursor();
   for (let doc = await cursor.next(); doc != null; doc = await cursor.next()) {
     // Process doc
   }
   ```

3. **Clear event listeners**
   ```typescript
   // Remove listeners when done
   socket.off('call:transcript');

   // In React
   useEffect(() => {
     const handler = () => { /* ... */ };
     socket.on('event', handler);

     return () => {
       socket.off('event', handler);
     };
   }, []);
   ```

---

### High CPU Usage

**Issue:** Server using too much CPU

**Solutions:**

1. **Profile code**
   ```bash
   # Use Node.js profiler
   node --prof backend/dist/server.js

   # Process output
   node --prof-process isolate-*.log > profile.txt
   ```

2. **Optimize hot paths**
   ```typescript
   // Cache expensive computations
   const memoized = memoize((userId) => {
     return expensiveCalculation(userId);
   });
   ```

3. **Use worker threads**
   ```typescript
   import { Worker } from 'worker_threads';

   const worker = new Worker('./worker.js', {
     workerData: { task: 'heavy-processing' }
   });
   ```

---

## Debugging Tips

### Enable Debug Logging

```bash
# Backend
DEBUG=* npm run dev

# Specific modules
DEBUG=express:*,mongoose:* npm run dev
```

### Use VSCode Debugger

```json
// .vscode/launch.json
{
  "configurations": [
    {
      "type": "node",
      "request": "launch",
      "name": "Debug Backend",
      "program": "${workspaceFolder}/backend/src/server.ts",
      "runtimeArgs": ["-r", "ts-node/register"],
      "env": {
        "NODE_ENV": "development"
      }
    }
  ]
}
```

### Monitor with PM2

```bash
# Real-time monitoring
pm2 monit

# Check logs
pm2 logs backend

# Restart on high memory
pm2 start ecosystem.config.js --max-memory-restart 1G
```

### Database Query Profiling

```javascript
// Enable slow query log
db.setProfilingLevel(1, { slowms: 100 });

// View slow queries
db.system.profile.find().limit(10).sort({ ts: -1 });
```

---

## Getting Help

If you can't resolve your issue:

1. **Check logs** - Most issues show up in logs
2. **Search GitHub Issues** - Someone may have faced the same issue
3. **Create Issue** - Provide:
   - Error message
   - Steps to reproduce
   - Environment details (OS, Node version, etc.)
   - Relevant logs

---

**Need more help?** Join our [Discord community](https://discord.gg/example) or email support@example.com
