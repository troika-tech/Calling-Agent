# Winston Logging Implementation Summary

## Overview

Successfully implemented comprehensive Winston logging with daily file rotation for the AI Calling Agent backend.

## What Was Implemented

### 1. **Winston Logger Configuration** ([backend/src/utils/logger.ts](backend/src/utils/logger.ts))

Enhanced the existing logger with:

- ✅ **Daily log rotation** using `winston-daily-rotate-file`
- ✅ **Multiple log files** by type (combined, error, HTTP, exceptions, rejections)
- ✅ **Automatic compression** of old log files
- ✅ **Configurable retention** (7-14 days)
- ✅ **Environment-aware** logging (console in dev, files in production)
- ✅ **Structured JSON** logs for production
- ✅ **Colorized console** output for development
- ✅ **Unhandled exception** and **rejection handlers**

#### Log Levels
- `error` - Errors and exceptions
- `warn` - Warnings and 4xx HTTP errors
- `info` - General information and successful operations
- `http` - HTTP request/response logs
- `debug` - Detailed debugging (development only)

### 2. **Request Logging Middleware** ([backend/src/middlewares/requestLogger.ts](backend/src/middlewares/requestLogger.ts))

Created middleware that automatically logs:
- HTTP method and URL
- Status code
- Response time
- IP address and user agent
- Authenticated user ID
- Content length

Features:
- Color-coded by status (green=2xx, yellow=4xx, red=5xx)
- Structured metadata for easy parsing
- Non-blocking logging

### 3. **Error Logging Middleware** ([backend/src/middlewares/requestLogger.ts](backend/src/middlewares/requestLogger.ts))

Created middleware that automatically logs unhandled errors with:
- Full error details (name, message, stack trace)
- Request context (method, URL, headers, body, params)
- User information (if authenticated)
- IP address

### 4. **Helper Functions**

Added convenient logging functions:
```typescript
logError(error, context)   // Log errors with context
logInfo(message, metadata)  // Log info with metadata
logWarn(message, metadata)  // Log warnings
logDebug(message, metadata) // Log debug info
logRequest(req, message)    // Log HTTP requests
```

### 5. **Integration** ([backend/src/app.ts](backend/src/app.ts))

Integrated logging into the Express app:
- Morgan for HTTP request logging (dev/combined format)
- Custom request logger for structured logs
- Error logger before error handler
- Environment-specific configuration

## Log Files Structure

```
logs/
├── combined-2025-01-27.log        # All logs (14 days retention)
├── combined-2025-01-27.log.gz     # Compressed old logs
├── error-2025-01-27.log           # Errors only (14 days retention)
├── http-2025-01-27.log            # HTTP requests (7 days retention)
├── exceptions-2025-01-27.log      # Uncaught exceptions (14 days)
└── rejections-2025-01-27.log      # Unhandled rejections (14 days)
```

## Configuration

### Development Mode
```env
NODE_ENV=development
```
- **Output**: Console only (colorized)
- **Level**: debug (all logs)
- **Format**: Human-readable with pretty-printed JSON

### Production Mode
```env
NODE_ENV=production
```
- **Output**: Console + rotating files
- **Level**: info (no debug logs)
- **Format**: Structured JSON

### Enable File Logging in Development
```env
NODE_ENV=development
ENABLE_FILE_LOGGING=true
```

## Usage Examples

### Basic Logging

```typescript
import { logger } from '../utils/logger';

// Error
logger.error('Database connection failed', {
  error: err.message,
  host: 'mongodb://...'
});

// Warning
logger.warn('Rate limit approaching', {
  userId: user._id,
  requests: 95
});

// Info
logger.info('User logged in', {
  userId: user._id,
  email: user.email
});

// Debug
logger.debug('Cache hit', {
  key: 'user:123'
});
```

### Using Helper Functions

```typescript
import { logError, logInfo, logWarn } from '../utils/logger';

try {
  await someOperation();
} catch (error) {
  logError(error, {
    operation: 'someOperation',
    userId: user._id
  });
}

logInfo('Agent created', {
  agentId: agent._id,
  name: agent.name
});

logWarn('Low balance', {
  userId: user._id,
  balance: 5
});
```

## Automatic Logging

### HTTP Requests
All HTTP requests are automatically logged with:
```json
{
  "level": "info",
  "message": "GET /api/agents 200",
  "method": "GET",
  "url": "/api/agents",
  "statusCode": 200,
  "responseTime": "45ms",
  "ip": "127.0.0.1",
  "userId": "507f1f77bcf86cd799439011"
}
```

### Errors
All unhandled errors are automatically logged with full context:
```json
{
  "level": "error",
  "message": "Unhandled error in request",
  "error": {
    "name": "ValidationError",
    "message": "Invalid input",
    "stack": "Error: Invalid input\n    at..."
  },
  "request": {
    "method": "POST",
    "url": "/api/agents",
    "body": {...}
  }
}
```

### Unhandled Exceptions and Rejections
Automatically logged to separate files in production.

## Benefits

### 1. **Better Debugging**
- Structured logs with full context
- Stack traces for errors
- Request/response correlation
- User activity tracking

### 2. **Production Monitoring**
- Rotating log files prevent disk space issues
- Compressed archives save storage
- Separate error logs for quick debugging
- HTTP logs for performance monitoring

### 3. **Compliance & Auditing**
- Complete audit trail of all operations
- User activity logs
- Error tracking and reporting
- Configurable retention periods

### 4. **Performance**
- Async logging doesn't block requests
- Automatic log rotation
- Configurable log levels
- Environment-aware logging

## Monitoring

### View Real-time Logs

**Development:**
```bash
npm run dev  # Shows colorized logs in terminal
```

**Production (PM2):**
```bash
pm2 logs calling-agent
pm2 logs calling-agent --err  # Errors only
pm2 logs calling-agent --lines 100
```

### Search Logs

```bash
# Search for errors
grep "error" logs/combined-2025-01-27.log

# Search for specific user
grep "userId\":\"507f1f77bcf86cd799439011" logs/combined-2025-01-27.log

# Pretty print JSON logs
cat logs/combined-2025-01-27.log | jq '.'

# Filter by level
cat logs/combined-2025-01-27.log | jq 'select(.level == "error")'
```

## Log Rotation Details

### Combined Logs
- **Pattern**: `combined-YYYY-MM-DD.log`
- **Retention**: 14 days
- **Max Size**: 20MB per file
- **Compression**: Yes (gzip)

### Error Logs
- **Pattern**: `error-YYYY-MM-DD.log`
- **Retention**: 14 days
- **Max Size**: 20MB per file
- **Compression**: Yes (gzip)

### HTTP Logs
- **Pattern**: `http-YYYY-MM-DD.log`
- **Retention**: 7 days
- **Max Size**: 20MB per file
- **Compression**: Yes (gzip)

## Best Practices

### ✅ DO
```typescript
// Include context
logger.error('Payment failed', { orderId, error: err.message });

// Use appropriate levels
logger.info('Order placed', { orderId });
logger.warn('Low inventory', { productId });
logger.error('Database error', { error });

// Structure your logs
logger.info('User action', {
  action: 'create_agent',
  userId: user._id,
  agentId: agent._id
});
```

### ❌ DON'T
```typescript
// No context
logger.error('Error occurred');

// Wrong level
logger.error('User logged in');  // Should be info

// Sensitive data
logger.info('User login', { password: pass });  // Never log passwords!

// String concatenation
logger.info(`User ${user._id} created agent ${agent._id}`);  // Use metadata
```

## Documentation

Comprehensive logging guide available at:
- **[backend/LOGGING.md](backend/LOGGING.md)** - Complete logging documentation

Includes:
- Detailed usage examples
- Monitoring and searching logs
- Integration with external services (Loggly, Papertrail, ELK)
- Troubleshooting guide
- Log maintenance tips

## Files Modified/Created

### Created
1. `backend/src/middlewares/requestLogger.ts` - Request/error logging middleware
2. `backend/LOGGING.md` - Comprehensive logging documentation
3. `WINSTON_LOGGING_SUMMARY.md` - This file

### Modified
1. `backend/src/utils/logger.ts` - Enhanced with daily rotation and helpers
2. `backend/src/app.ts` - Integrated logging middleware

### No Changes Required
- `backend/.gitignore` - Already excludes `logs/`
- `backend/src/server.ts` - Already uses logger
- All other files already use the logger import

## Testing

Build successful:
```bash
npm run build  # ✅ No errors
```

## Next Steps (Optional)

1. **Monitor logs in production**
   ```bash
   pm2 logs calling-agent
   ```

2. **Set up log aggregation** (optional)
   - Loggly, Papertrail, or ELK stack
   - Real-time alerting
   - Log analytics

3. **Configure log shipping** (optional)
   - AWS CloudWatch
   - Datadog
   - Splunk

4. **Set up alerts** (optional)
   - Error rate thresholds
   - Response time alerts
   - Exception notifications

## Summary

✅ Winston logging is fully implemented with:
- Daily rotating log files
- Automatic compression
- Structured JSON logs
- Request/error logging middleware
- Helper functions for easy use
- Comprehensive documentation

The backend now has **production-ready logging** that will help with:
- Debugging issues
- Monitoring performance
- Tracking user activity
- Compliance and auditing

All logs are automatically rotated, compressed, and cleaned up to prevent disk space issues!
