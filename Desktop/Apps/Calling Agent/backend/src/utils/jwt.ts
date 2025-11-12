import jwt from 'jsonwebtoken';
import { env } from '../config/env';

export interface JWTPayload {
  userId: string;
  role: string;
}

export class JWTService {
  /**
   * Generate access token
   */
  generateAccessToken(payload: JWTPayload): string {
    return (jwt.sign as any)(payload, env.JWT_SECRET, {
      expiresIn: env.JWT_EXPIRE
    });
  }

  /**
   * Generate refresh token
   */
  generateRefreshToken(payload: JWTPayload): string {
    return (jwt.sign as any)(payload, env.JWT_SECRET, {
      expiresIn: env.JWT_REFRESH_EXPIRE
    });
  }

  /**
   * Verify token
   */
  verifyToken(token: string): JWTPayload {
    try {
      const decoded = jwt.verify(token, env.JWT_SECRET) as JWTPayload;
      return decoded;
    } catch (error) {
      throw new Error('Invalid or expired token');
    }
  }

  /**
   * Decode token without verification (useful for expired tokens)
   */
  decodeToken(token: string): JWTPayload | null {
    try {
      return jwt.decode(token) as JWTPayload;
    } catch (error) {
      return null;
    }
  }
}

export const jwtService = new JWTService();
