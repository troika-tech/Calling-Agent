import { Request, Response, NextFunction } from 'express';
import { jwtService } from '../utils/jwt';
import { User } from '../models/User';
import { UnauthorizedError, ForbiddenError } from '../utils/errors';
import { logger } from '../utils/logger';

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      user?: any;
    }
  }
}

/**
 * Authenticate user using JWT
 */
export const authenticate = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // Get token from header
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedError('No token provided');
    }

    const token = authHeader.split(' ')[1];

    // Verify token
    const decoded = jwtService.verifyToken(token);

    // Get user from database
    const user = await User.findById(decoded.userId).select('-password');

    if (!user) {
      throw new UnauthorizedError('User not found');
    }

    if (!user.isActive) {
      throw new UnauthorizedError('User account is inactive');
    }

    // Attach user to request
    req.user = user;

    next();
  } catch (error: any) {
    if (error instanceof UnauthorizedError) {
      next(error);
    } else {
      logger.error('Authentication error', { error });
      next(new UnauthorizedError('Invalid or expired token'));
    }
  }
};

/**
 * Check if user has admin or super_admin role
 */
export const requireAdmin = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  if (!req.user) {
    return next(new UnauthorizedError('Not authenticated'));
  }

  if (req.user.role !== 'admin' && req.user.role !== 'super_admin') {
    return next(new ForbiddenError('Admin access required'));
  }

  next();
};

/**
 * Check if user has super_admin role only
 */
export const requireSuperAdmin = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  if (!req.user) {
    return next(new UnauthorizedError('Not authenticated'));
  }

  if (req.user.role !== 'super_admin') {
    return next(new ForbiddenError('Super admin access required'));
  }

  next();
};

/**
 * Optional authentication (doesn't fail if no token)
 */
export const optionalAuth = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      const decoded = jwtService.verifyToken(token);
      const user = await User.findById(decoded.userId).select('-password');

      if (user && user.isActive) {
        req.user = user;
      }
    }

    next();
  } catch (error) {
    // Silently fail for optional auth
    next();
  }
};
