/**
 * Unit Tests for Retry Manager Service
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { retryManagerService, RETRY_CONFIG } from '../../services/retryManager.service';
import { CallLog } from '../../models/CallLog';
import { RetryAttempt } from '../../models/RetryAttempt';

describe('RetryManagerService', () => {
  describe('categorizeFailure', () => {
    it('should categorize no_answer correctly', () => {
      const callLog = {
        _id: '123',
        failureReason: 'no answer',
        status: 'failed'
      };

      const result = retryManagerService.categorizeFailure(callLog);

      expect(result.failureType).toBe('no_answer');
      expect(result.isRetryable).toBe(true);
      expect(result.config.maxAttempts).toBe(3);
    });

    it('should categorize busy correctly', () => {
      const callLog = {
        _id: '123',
        failureReason: 'user busy',
        status: 'failed'
      };

      const result = retryManagerService.categorizeFailure(callLog);

      expect(result.failureType).toBe('busy');
      expect(result.isRetryable).toBe(true);
    });

    it('should categorize invalid_number as non-retryable', () => {
      const callLog = {
        _id: '123',
        failureReason: 'invalid number',
        status: 'failed'
      };

      const result = retryManagerService.categorizeFailure(callLog);

      expect(result.failureType).toBe('invalid_number');
      expect(result.isRetryable).toBe(false);
      expect(result.config.maxAttempts).toBe(0);
    });

    it('should categorize network_error correctly', () => {
      const callLog = {
        _id: '123',
        failureReason: 'network timeout',
        status: 'failed'
      };

      const result = retryManagerService.categorizeFailure(callLog);

      expect(result.failureType).toBe('network_error');
      expect(result.isRetryable).toBe(true);
      expect(result.config.maxAttempts).toBe(5);
    });
  });

  describe('calculateRetryTime', () => {
    it('should calculate exponential backoff for no_answer', () => {
      const attempt1 = retryManagerService.calculateRetryTime(1, 'no_answer', {
        respectOffPeakHours: false
      });
      const attempt2 = retryManagerService.calculateRetryTime(2, 'no_answer', {
        respectOffPeakHours: false
      });
      const attempt3 = retryManagerService.calculateRetryTime(3, 'no_answer', {
        respectOffPeakHours: false
      });

      const now = new Date();

      // Attempt 1: ~5 minutes
      expect(attempt1.getTime() - now.getTime()).toBeGreaterThan(250000); // ~4.5 min (with jitter)
      expect(attempt1.getTime() - now.getTime()).toBeLessThan(350000); // ~6 min (with jitter)

      // Attempt 2: ~10 minutes
      expect(attempt2.getTime() - now.getTime()).toBeGreaterThan(550000); // ~9 min
      expect(attempt2.getTime() - now.getTime()).toBeLessThan(650000); // ~11 min

      // Attempt 3: ~20 minutes
      expect(attempt3.getTime() - now.getTime()).toBeGreaterThan(1100000); // ~18 min
      expect(attempt3.getTime() - now.getTime()).toBeLessThan(1300000); // ~22 min
    });

    it('should use provided scheduledFor if specified', () => {
      const targetTime = new Date(Date.now() + 1000000);

      const result = retryManagerService.calculateRetryTime(1, 'no_answer', {
        scheduledFor: targetTime,
        respectOffPeakHours: false
      });

      expect(result.getTime()).toBe(targetTime.getTime());
    });

    it('should add jitter to prevent thundering herd', () => {
      const times = [];
      for (let i = 0; i < 10; i++) {
        const time = retryManagerService.calculateRetryTime(1, 'no_answer', {
          respectOffPeakHours: false
        });
        times.push(time.getTime());
      }

      // All times should be different due to jitter
      const uniqueTimes = new Set(times);
      expect(uniqueTimes.size).toBeGreaterThan(5);
    });
  });

  describe('RETRY_CONFIG', () => {
    it('should have valid configuration for all failure types', () => {
      const failureTypes = [
        'no_answer',
        'busy',
        'voicemail',
        'network_error',
        'call_rejected',
        'invalid_number',
        'blocked',
        'compliance_block'
      ];

      failureTypes.forEach(type => {
        const config = RETRY_CONFIG[type as keyof typeof RETRY_CONFIG];

        expect(config).toBeDefined();
        expect(typeof config.maxAttempts).toBe('number');
        expect(typeof config.baseDelay).toBe('number');
        expect(typeof config.backoffMultiplier).toBe('number');
        expect(typeof config.retryable).toBe('boolean');

        // Non-retryable should have 0 max attempts
        if (!config.retryable) {
          expect(config.maxAttempts).toBe(0);
        }
      });
    });

    it('should have exponential backoff multiplier >= 1', () => {
      Object.values(RETRY_CONFIG).forEach(config => {
        expect(config.backoffMultiplier).toBeGreaterThanOrEqual(1);
      });
    });
  });
});
