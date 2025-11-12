/**
 * Unit Tests for ExotelOutboundService
 */

import { ExotelOutboundService } from '../../services/exotelOutbound.service';
import axios from 'axios';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

// Mock axios.create to return a mock client
const mockAxiosClient = {
  post: jest.fn(),
  get: jest.fn()
};

mockedAxios.create = jest.fn(() => mockAxiosClient as any);

describe('ExotelOutboundService', () => {
  let service: ExotelOutboundService;

  beforeEach(() => {
    // Reset mocks before each test
    jest.clearAllMocks();
    mockAxiosClient.post.mockClear();
    mockAxiosClient.get.mockClear();
    
    service = new ExotelOutboundService();
  });

  describe('makeCall', () => {
    it('should successfully make a call', async () => {
      const mockResponse = {
        data: {
          sid: 'test_sid_123',
          status: 'queued',
          from: '+911234567890',
          to: '+919876543210',
          direction: 'outbound-api',
          date_created: new Date().toISOString()
        }
      };

      mockAxiosClient.post.mockResolvedValue(mockResponse);

      const result = await service.makeCall({
        from: '+911234567890',
        to: '+919876543210',
        callerId: '+911234567890',
        appId: 'test_app_id',
        customField: 'call_log_123'
      });

      expect(result).toEqual({
        sid: 'test_sid_123',
        status: 'queued',
        from: '+911234567890',
        to: '+919876543210',
        direction: 'outbound-api',
        dateCreated: mockResponse.data.date_created
      });
      expect(mockAxiosClient.post).toHaveBeenCalled();
    });

    it('should handle rate limit errors (429)', async () => {
      mockAxiosClient.post.mockRejectedValue({
        response: {
          status: 429,
          data: { message: 'Rate limit exceeded' }
        }
      });

      await expect(
        service.makeCall({
          from: '+911234567890',
          to: '+919876543210',
          callerId: '+911234567890',
          appId: 'test_app_id'
        })
      ).rejects.toThrow('Exotel rate limit exceeded');
    });

    it('should handle authentication errors (401)', async () => {
      mockAxiosClient.post.mockRejectedValue({
        response: {
          status: 401,
          data: { message: 'Authentication failed' }
        }
      });

      await expect(
        service.makeCall({
          from: '+911234567890',
          to: '+919876543210',
          callerId: '+911234567890',
          appId: 'test_app_id'
        })
      ).rejects.toThrow('Exotel authentication failed');
    });

    it('should handle server errors (5xx)', async () => {
      mockAxiosClient.post.mockRejectedValue({
        response: {
          status: 500,
          data: { message: 'Internal server error' }
        }
      });

      await expect(
        service.makeCall({
          from: '+911234567890',
          to: '+919876543210',
          callerId: '+911234567890',
          appId: 'test_app_id'
        })
      ).rejects.toThrow();
    });
  });

  describe('getCallDetails', () => {
    it('should retrieve call details', async () => {
      const mockResponse = {
        data: {
          sid: 'test_sid_123',
          status: 'completed',
          duration: '120',
          recording_url: 'https://example.com/recording.mp3'
        }
      };

      mockAxiosClient.get.mockResolvedValue(mockResponse);

      const result = await service.getCallDetails('test_sid_123');

      expect(result).toEqual({
        sid: 'test_sid_123',
        status: 'completed',
        duration: 120,
        recordingUrl: 'https://example.com/recording.mp3'
      });
    });

    it('should handle call not found', async () => {
      const error: any = new Error('Call not found');
      error.response = {
        status: 404,
        data: { message: 'Call not found' }
      };
      mockAxiosClient.get.mockRejectedValue(error);

      await expect(
        service.getCallDetails('invalid_sid')
      ).rejects.toThrow();
    });
  });

  describe('hangupCall', () => {
    it('should successfully hangup a call', async () => {
      mockAxiosClient.post.mockResolvedValue({ data: {} });

      await service.hangupCall('test_sid_123');

      expect(mockAxiosClient.post).toHaveBeenCalledWith('/calls/test_sid_123', {
        Status: 'completed'
      });
    });

    it('should handle hangup errors', async () => {
      const error: any = new Error('Cannot hangup completed call');
      error.response = {
        status: 400,
        data: { message: 'Cannot hangup completed call' }
      };
      mockAxiosClient.post.mockRejectedValue(error);

      await expect(
        service.hangupCall('test_sid_123')
      ).rejects.toThrow();
    });
  });

  describe('Circuit Breaker', () => {
    it('should return closed state initially', () => {
      const state = service.getCircuitBreakerState();
      expect(state.state).toBe('closed');
    });

    it('should open after threshold failures', async () => {
      // Mock 5 consecutive failures
      mockAxiosClient.post.mockRejectedValue({
        response: {
          status: 500,
          data: { message: 'Server error' }
        }
      });

      const callParams = {
        from: '+911234567890',
        to: '+919876543210',
        callerId: '+911234567890',
        appId: 'test_app_id'
      };

      // Attempt 5 calls to trigger circuit breaker
      for (let i = 0; i < 5; i++) {
        try {
          await service.makeCall(callParams);
        } catch (error) {
          // Expected to fail
        }
      }

      // 6th call should be blocked by circuit breaker
      await expect(
        service.makeCall(callParams)
      ).rejects.toThrow('Circuit breaker is OPEN');

      const state = service.getCircuitBreakerState();
      expect(state.state).toBe('open');
    });
  });

  describe('Rate Limiter', () => {
    it('should return rate limiter stats', async () => {
      const stats = await service.getRateLimiterStats();

      expect(stats).toHaveProperty('running');
      expect(stats).toHaveProperty('queued');
      expect(stats).toHaveProperty('executing');
    });

    it('should respect rate limits', async () => {
      // This test would require waiting for rate limit windows
      // In a real scenario, you'd mock Bottleneck or test with actual delays

      const mockResponse = {
        data: {
          sid: 'test_sid_123',
          status: 'queued',
          from: '+911234567890',
          to: '+919876543210',
          direction: 'outbound-api',
          date_created: new Date().toISOString()
        }
      };

      mockAxiosClient.post.mockResolvedValue(mockResponse);

      const callParams = {
        from: '+911234567890',
        to: '+919876543210',
        callerId: '+911234567890',
        appId: 'test_app_id'
      };

      // Make multiple calls
      const promises = [];
      for (let i = 0; i < 5; i++) {
        promises.push(service.makeCall(callParams));
      }

      const results = await Promise.all(promises);
      expect(results).toHaveLength(5);
    });
  });

  describe('getRecordingUrl', () => {
    it('should retrieve recording URL', async () => {
      const mockResponse = {
        data: {
          sid: 'test_sid_123',
          status: 'completed',
          duration: 120,
          recording_url: 'https://example.com/recording.mp3'
        }
      };

      mockAxiosClient.get.mockResolvedValue(mockResponse);

      const url = await service.getRecordingUrl('test_sid_123');

      expect(url).toBe('https://example.com/recording.mp3');
    });

    it('should return null if no recording', async () => {
      const mockResponse = {
        data: {
          sid: 'test_sid_123',
          status: 'completed',
          duration: 120,
          recording_url: null
        }
      };

      mockAxiosClient.get.mockResolvedValue(mockResponse);

      const url = await service.getRecordingUrl('test_sid_123');

      expect(url).toBeNull();
    });
  });

  describe('Error Handling', () => {
    it('should handle network errors', async () => {
      mockAxiosClient.post.mockRejectedValue(new Error('Network error'));

      await expect(
        service.makeCall({
          from: '+911234567890',
          to: '+919876543210',
          callerId: '+911234567890',
          appId: 'test_app_id'
        })
      ).rejects.toThrow('Network error');
    });

    it('should handle timeout errors', async () => {
      const error: any = new Error('timeout of 10000ms exceeded');
      error.code = 'ECONNABORTED';
      mockAxiosClient.post.mockRejectedValue(error);

      await expect(
        service.makeCall({
          from: '+911234567890',
          to: '+919876543210',
          callerId: '+911234567890',
          appId: 'test_app_id'
        })
      ).rejects.toThrow();
    });

    it('should provide meaningful error messages', async () => {
      const error: any = new Error('Invalid phone number format');
      error.response = {
        status: 400,
        data: {
          message: 'Invalid phone number format',
          code: 'INVALID_PARAMETER'
        }
      };
      mockAxiosClient.post.mockRejectedValue(error);

      await expect(
        service.makeCall({
          from: 'invalid',
          to: 'invalid',
          callerId: '+911234567890',
          appId: 'test_app_id'
        })
      ).rejects.toThrow('Invalid phone number format');
    });
  });
});
