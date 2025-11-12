# Logging Guide

## Overview

The backend uses **Winston** for structured logging with daily file rotation. Logs are formatted differently for console (development) and files (production).

## Log Levels

The application uses five log levels (in order of priority):

1. **error** - Error messages (e.g., exceptions, failed operations)
2. **warn** - Warning messages (e.g., deprecated features, 4xx HTTP errors)
3. **info** - Informational messages (e.g., startup messages, successful operations)
4. **http** - HTTP request/response logs
5. **debug** - Detailed debugging information (development only)

## Log Output

### Development Mode

In development (`NODE_ENV=development`):
- **Console only** - Colorized output for easy reading
- **Debug level** - All logs including debug messages
- **Human-readable format** - Pretty-printed with timestamps

Example console output:
```
2025-01-27 15:30:45 [info]: Server started successfully
{
  "port": 5000,
  "env": "development",
  "url": "http://localhost:5000"
}
```

### Production Mode

In production (`NODE_ENV=production`):
- **Console + Files** - Both console and rotating log files
- **Info level** - Production logs (no debug messages)
- **JSON format** - Structured logs for parsing

#### Log Files

All log files are stored in the `logs/` directory with daily rotation:

1. **combined-YYYY-MM-DD.log**
   - All log levels
   - Rotates daily
   - Keeps 14 days
   - Max 20MB per file
   - Compressed archives

2. **error-YYYY-MM-DD.log**
   - Error level only
   - Rotates daily
   - Keeps 14 days
   - Max 20MB per file
   - Compressed archives

3. **http-YYYY-MM-DD.log**
   - HTTP requests only
   - Rotates daily
   - Keeps 7 days
   - Max 20MB per file
   - Compressed archives

4. **exceptions-YYYY-MM-DD.log**
   - Uncaught exceptions
   - Rotates daily
   - Keeps 14 days

5. **rejections-YYYY-MM-DD.log**
   - Unhandled promise rejections
   - Rotates daily
   - Keeps 14 days

## Usage in Code

### Basic Logging

```typescript
import { logger } from '../utils/logger';

// Error logging
logger.error('Database connection failed', {
  error: err.message,
  host: 'mongodb://...'
});

// Warning
logger.warn('Deprecated API used', {
  endpoint: '/api/old',
  userId: user._id
});

// Info
logger.info('User logged in', {
  userId: user._id,
  email: user.email
});

// HTTP (usually handled by middleware)
logger.http('GET /api/agents 200', {
  method: 'GET',
  url: '/api/agents',
  statusCode: 200
});

// Debug (development only)
logger.debug('Cache hit', {
  key: 'user:123',
  ttl: 3600
});
```

### Helper Functions

Use the helper functions for common logging patterns:

```typescript
import { logError, logInfo, logWarn, logDebug } from '../utils/logger';

// Log errors with context
try {
  await someOperation();
} catch (error) {
  logError(error, {
    operation: 'someOperation',
    userId: user._id
  });
}

// Log info with metadata
logInfo('Agent created', {
  agentId: agent._id,
  name: agent.name,
  createdBy: user._id
});

// Log warnings
logWarn('Rate limit approaching', {
  userId: user._id,
  requests: 95,
  limit: 100
});

// Log debug info
logDebug('Cache configuration', {
  ttl: 3600,
  maxSize: 1000
});
```

### HTTP Request Logging

HTTP requests are automatically logged by the `requestLogger` middleware:

```typescript
// Automatically logged:
// - Method (GET, POST, etc.)
// - URL
// - Status code
// - Response time
// - IP address
// - User agent
// - User ID (if authenticated)
```

Example log entry:
```json
{
  "level": "info",
  "message": "GET /api/agents 200",
  "timestamp": "2025-01-27 15:30:45",
  "method": "GET",
  "url": "/api/agents",
  "statusCode": 200,
  "responseTime": "45ms",
  "ip": "127.0.0.1",
  "userId": "507f1f77bcf86cd799439011"
}
```

### Error Logging

Errors are automatically logged by the `errorLogger` middleware:

```typescript
// Automatically logged:
// - Error name and message
// - Stack trace
// - Request details (method, URL, headers, body)
// - User ID (if authenticated)
```

## Configuration

### Environment Variables

Enable file logging in development:
```env
NODE_ENV=development
ENABLE_FILE_LOGGING=true
```

### Log Rotation Settings

Edit `src/utils/logger.ts` to change rotation settings:

```typescript
new DailyRotateFile({
  filename: path.join(logDir, 'combined-%DATE%.log'),
  datePattern: 'YYYY-MM-DD',  // Daily rotation
  maxSize: '20m',              // Max 20MB per file
  maxFiles: '14d',             // Keep 14 days
  zippedArchive: true,         // Compress old files
})
```

## Best Practices

### 1. Use Appropriate Log Levels

```typescript
// ✅ Good
logger.error('Payment failed', { orderId, error: err.message });
logger.warn('Low inventory', { productId, stock: 5 });
logger.info('Order placed', { orderId, userId });
logger.debug('Cache lookup', { key, hit: true });

// ❌ Bad
logger.info('Error occurred');  // Should be error level
logger.error('User logged in'); // Should be info level
```

### 2. Include Context

```typescript
// ✅ Good - Includes relevant context
logger.error('Failed to send email', {
  userId: user._id,
  email: user.email,
  template: 'welcome',
  error: err.message
});

// ❌ Bad - No context
logger.error('Email failed');
```

### 3. Don't Log Sensitive Data

```typescript
// ✅ Good
logger.info('User authenticated', {
  userId: user._id,
  email: user.email
});

// ❌ Bad - Logs password
logger.info('User login attempt', {
  email: user.email,
  password: password  // Never log passwords!
});
```

### 4. Use Structured Logging

```typescript
// ✅ Good - Structured with metadata
logger.info('Payment processed', {
  orderId: order._id,
  amount: order.total,
  currency: 'USD',
  gateway: 'stripe'
});

// ❌ Bad - String concatenation
logger.info(`Payment of ${order.total} USD for order ${order._id} processed via stripe`);
```

### 5. Log Async Errors

```typescript
// ✅ Good
async function processOrder(orderId: string) {
  try {
    const order = await Order.findById(orderId);
    await order.process();
    logger.info('Order processed', { orderId });
  } catch (error) {
    logError(error, { operation: 'processOrder', orderId });
    throw error;
  }
}

// ❌ Bad - Silent failure
async function processOrder(orderId: string) {
  try {
    await Order.findById(orderId).process();
  } catch (error) {
    // No logging!
  }
}
```

## Monitoring Logs

### View Real-time Logs

#### Development
```bash
# Terminal output shows all logs in real-time
npm run dev
```

#### Production (PM2)
```bash
# View logs
pm2 logs calling-agent

# View error logs only
pm2 logs calling-agent --err

# View specific number of lines
pm2 logs calling-agent --lines 100
```

### Search Log Files

```bash
# Search for errors
grep "error" logs/combined-2025-01-27.log

# Search for specific user
grep "userId\":\"507f1f77bcf86cd799439011" logs/combined-2025-01-27.log

# Search for HTTP 500 errors
grep "statusCode\":500" logs/http-2025-01-27.log

# Count errors by type
grep "error" logs/error-2025-01-27.log | jq '.error.name' | sort | uniq -c
```

### Parse JSON Logs

```bash
# Pretty print a log file
cat logs/combined-2025-01-27.log | jq '.'

# Filter by log level
cat logs/combined-2025-01-27.log | jq 'select(.level == "error")'

# Extract specific fields
cat logs/combined-2025-01-27.log | jq '{timestamp, level, message, userId}'

# Count logs by level
cat logs/combined-2025-01-27.log | jq -r '.level' | sort | uniq -c
```

## Integration with Monitoring Tools

### Loggly

```typescript
import { Loggly } from 'winston-loggly-bulk';

transports.push(
  new Loggly({
    token: process.env.LOGGLY_TOKEN,
    subdomain: process.env.LOGGLY_SUBDOMAIN,
    tags: ['calling-agent', env.NODE_ENV],
    json: true,
  })
);
```

### Papertrail

```typescript
import { Papertrail } from 'winston-papertrail';

transports.push(
  new Papertrail({
    host: process.env.PAPERTRAIL_HOST,
    port: process.env.PAPERTRAIL_PORT,
    hostname: 'calling-agent',
    program: env.NODE_ENV,
  })
);
```

### Elasticsearch (ELK Stack)

```typescript
import { ElasticsearchTransport } from 'winston-elasticsearch';

transports.push(
  new ElasticsearchTransport({
    level: 'info',
    clientOpts: { node: process.env.ELASTICSEARCH_URL },
    index: 'calling-agent-logs',
  })
);
```

## Troubleshooting

### Logs not appearing

1. **Check log level**: Ensure you're using the right level
   ```typescript
   logger.debug('Test'); // Won't show in production
   logger.info('Test');  // Will show
   ```

2. **Check file permissions**: Ensure logs directory is writable
   ```bash
   mkdir logs
   chmod 755 logs
   ```

3. **Check disk space**: Ensure enough disk space for logs
   ```bash
   df -h
   ```

### Too many log files

1. **Reduce retention period**:
   ```typescript
   maxFiles: '7d'  // Instead of '14d'
   ```

2. **Enable compression**:
   ```typescript
   zippedArchive: true
   ```

3. **Reduce max size**:
   ```typescript
   maxSize: '10m'  // Instead of '20m'
   ```

### Performance impact

1. **Use appropriate log levels**:
   - Production: `info` or `warn`
   - Development: `debug`

2. **Avoid excessive logging in loops**:
   ```typescript
   // ❌ Bad - Logs every iteration
   for (const user of users) {
     logger.debug('Processing user', { userId: user._id });
   }

   // ✅ Good - Logs summary
   logger.debug('Processing users', { count: users.length });
   ```

3. **Use async transports** (already configured)

## Log Maintenance

### Clean old logs

```bash
# Delete logs older than 30 days
find logs/ -name "*.log*" -mtime +30 -delete

# Delete compressed logs only
find logs/ -name "*.gz" -mtime +30 -delete
```

### Archive logs

```bash
# Archive logs to S3
aws s3 sync logs/ s3://my-bucket/calling-agent-logs/$(date +%Y-%m-%d)/
```

### Rotate logs manually

```bash
# PM2 will handle this automatically
pm2 flush calling-agent
```

## Example Log Entries

### Successful Request
```json
{
  "level": "info",
  "message": "GET /api/agents 200",
  "timestamp": "2025-01-27 15:30:45",
  "method": "GET",
  "url": "/api/agents",
  "statusCode": 200,
  "responseTime": "45ms",
  "userId": "507f1f77bcf86cd799439011"
}
```

### Error with Stack Trace
```json
{
  "level": "error",
  "message": "Database query failed",
  "timestamp": "2025-01-27 15:31:12",
  "error": {
    "name": "MongoError",
    "message": "Connection timeout",
    "stack": "Error: Connection timeout\n    at..."
  },
  "operation": "findUser",
  "userId": "507f1f77bcf86cd799439011"
}
```

### Call Processing
```json
{
  "level": "info",
  "message": "Call completed successfully",
  "timestamp": "2025-01-27 15:32:00",
  "callId": "608f1f77bcf86cd799439012",
  "agentId": "508f1f77bcf86cd799439013",
  "duration": 180,
  "transcriptLength": 1250
}
```
