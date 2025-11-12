import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

/**
 * Request logging middleware
 * Logs HTTP requests with method, URL, status, response time, and user info
 */
export const requestLogger = (req: Request, res: Response, next: NextFunction) => {
  const startTime = Date.now();

  // Capture original end function
  const originalEnd = res.end;

  // Override res.end to log after response is sent
  res.end = function (this: Response, ...args: any[]): Response {
    // Calculate response time
    const responseTime = Date.now() - startTime;

    // Get status code
    const statusCode = res.statusCode;

    // Determine log level based on status code
    let logLevel: 'info' | 'warn' | 'error' = 'info';
    if (statusCode >= 500) {
      logLevel = 'error';
    } else if (statusCode >= 400) {
      logLevel = 'warn';
    }

    // Prepare log metadata
    const logData = {
      method: req.method,
      url: req.originalUrl || req.url,
      statusCode,
      responseTime: `${responseTime}ms`,
      ip: req.ip || req.connection.remoteAddress,
      userAgent: req.get('user-agent'),
      userId: (req as any).user?._id?.toString(),
      contentLength: res.get('content-length'),
    };

    // Log the request
    logger[logLevel](`${req.method} ${req.originalUrl || req.url} ${statusCode}`, logData);

    // Call original end function
    return originalEnd.apply(this, args);
  };

  next();
};

/**
 * Error logging middleware
 * Should be placed after all routes and other middleware
 */
export const errorLogger = (err: Error, req: Request, res: Response, next: NextFunction) => {
  logger.error('Unhandled error in request', {
    error: {
      name: err.name,
      message: err.message,
      stack: err.stack,
    },
    request: {
      method: req.method,
      url: req.originalUrl || req.url,
      headers: req.headers,
      body: req.body,
      params: req.params,
      query: req.query,
      ip: req.ip || req.connection.remoteAddress,
      userId: (req as any).user?._id?.toString(),
    },
  });

  next(err);
};
