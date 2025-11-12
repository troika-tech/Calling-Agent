import bcrypt from 'bcrypt';
import mongoose from 'mongoose';
import { User, IUser } from '../models/User';
import { jwtService } from '../utils/jwt';
import {
  ConflictError,
  UnauthorizedError,
  NotFoundError
} from '../utils/errors';
import { logger } from '../utils/logger';
import { cacheService } from '../config/redis';

export interface SignupData {
  email: string;
  password: string;
  name: string;
}

export interface LoginData {
  email: string;
  password: string;
}

export interface AuthResponse {
  user: IUser;
  token: string;
  refreshToken: string;
}

export class AuthService {
  /**
   * Hash password using bcrypt
   */
  private async hashPassword(password: string): Promise<string> {
    const saltRounds = 10;
    return await bcrypt.hash(password, saltRounds);
  }

  /**
   * Compare password with hash
   */
  private async comparePassword(
    password: string,
    hash: string
  ): Promise<boolean> {
    return await bcrypt.compare(password, hash);
  }

  /**
   * Generate auth tokens
   */
  private generateTokens(userId: string, role: string) {
    const payload = { userId, role };

    return {
      access: jwtService.generateAccessToken(payload),
      refresh: jwtService.generateRefreshToken(payload)
    };
  }

  /**
   * Register new user
   */
  async signup(data: SignupData): Promise<AuthResponse> {
    try {
      // Check if user already exists
      const existingUser = await User.findOne({
        email: data.email.toLowerCase()
      });

      if (existingUser) {
        throw new ConflictError('Email already registered');
      }

      // Hash password
      const hashedPassword = await this.hashPassword(data.password);

      // Create user
      const user = await User.create({
        email: data.email.toLowerCase(),
        password: hashedPassword,
        name: data.name,
        role: 'user',
        credits: 0,
        isActive: true
      });

      const userId = (user._id as mongoose.Types.ObjectId).toString();

      logger.info('User registered successfully', {
        userId,
        email: user.email
      });

      // Generate tokens
      const tokens = this.generateTokens(userId, user.role);

      // Cache user session
      await cacheService.set(
        `user:token:${userId}`,
        tokens.access,
        604800 // 7 days
      );

      // Remove password from response
      const userObject = user.toJSON();
      delete (userObject as any).password;

      return {
        user: userObject as unknown as IUser,
        token: tokens.access,
        refreshToken: tokens.refresh
      };

    } catch (error) {
      if (error instanceof ConflictError) {
        throw error;
      }
      logger.error('Signup error', { error });
      throw new Error('Failed to create user');
    }
  }

  /**
   * Login user
   */
  async login(data: LoginData): Promise<AuthResponse> {
    try {
      // Find user
      const user = await User.findOne({
        email: data.email.toLowerCase()
      }).select('+password');

      if (!user) {
        throw new UnauthorizedError('Invalid credentials');
      }

      // Check if user is active
      if (!user.isActive) {
        throw new UnauthorizedError('Account is inactive');
      }

      // Verify password
      const isPasswordValid = await this.comparePassword(
        data.password,
        user.password
      );

      if (!isPasswordValid) {
        throw new UnauthorizedError('Invalid credentials');
      }

      // Update last login
      user.lastLoginAt = new Date();
      await user.save();

      const userId = (user._id as mongoose.Types.ObjectId).toString();

      logger.info('User logged in successfully', {
        userId,
        email: user.email
      });

      // Generate tokens
      const tokens = this.generateTokens(userId, user.role);

      // Cache user session
      await cacheService.set(
        `user:token:${userId}`,
        tokens.access,
        604800 // 7 days
      );

      // Remove password from response
      const userObject = user.toJSON();
      delete (userObject as any).password;

      return {
        user: userObject as unknown as IUser,
        token: tokens.access,
        refreshToken: tokens.refresh
      };

    } catch (error) {
      if (error instanceof UnauthorizedError) {
        throw error;
      }
      logger.error('Login error', { error });
      throw new Error('Failed to login');
    }
  }

  /**
   * Refresh access token
   */
  async refreshToken(refreshToken: string): Promise<{ token: string }> {
    try {
      // Verify refresh token
      const decoded = jwtService.verifyToken(refreshToken);

      // Check if user exists
      const user = await User.findById(decoded.userId);

      if (!user) {
        throw new UnauthorizedError('User not found');
      }

      if (!user.isActive) {
        throw new UnauthorizedError('Account is inactive');
      }

      const userId = (user._id as mongoose.Types.ObjectId).toString();

      // Generate new access token
      const accessToken = jwtService.generateAccessToken({
        userId,
        role: user.role
      });

      // Update cache
      await cacheService.set(
        `user:token:${userId}`,
        accessToken,
        604800 // 7 days
      );

      logger.info('Token refreshed', { userId });

      return { token: accessToken };

    } catch (error) {
      if (error instanceof UnauthorizedError) {
        throw error;
      }
      logger.error('Token refresh error', { error });
      throw new UnauthorizedError('Invalid or expired refresh token');
    }
  }

  /**
   * Logout user (invalidate token)
   */
  async logout(userId: string): Promise<void> {
    try {
      // Remove token from cache
      await cacheService.del(`user:token:${userId}`);

      logger.info('User logged out', { userId });
    } catch (error) {
      logger.error('Logout error', { error, userId });
    }
  }

  /**
   * Get current user
   */
  async getCurrentUser(userId: string): Promise<IUser> {
    const user = await User.findById(userId).select('-password');

    if (!user) {
      throw new NotFoundError('User not found');
    }

    if (!user.isActive) {
      throw new UnauthorizedError('Account is inactive');
    }

    return user;
  }

  /**
   * Change password
   */
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string
  ): Promise<void> {
    try {
      const user = await User.findById(userId).select('+password');

      if (!user) {
        throw new NotFoundError('User not found');
      }

      // Verify current password
      const isValid = await this.comparePassword(
        currentPassword,
        user.password
      );

      if (!isValid) {
        throw new UnauthorizedError('Current password is incorrect');
      }

      // Hash new password
      user.password = await this.hashPassword(newPassword);
      await user.save();

      // Invalidate all existing tokens
      await cacheService.del(`user:token:${userId}`);

      logger.info('Password changed', { userId });
    } catch (error) {
      if (
        error instanceof NotFoundError ||
        error instanceof UnauthorizedError
      ) {
        throw error;
      }
      logger.error('Change password error', { error, userId });
      throw new Error('Failed to change password');
    }
  }
}

export const authService = new AuthService();
