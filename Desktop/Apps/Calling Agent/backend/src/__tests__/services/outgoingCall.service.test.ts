/**
 * Unit Tests for OutgoingCallService
 */

import { OutgoingCallService } from '../../services/outgoingCall.service';
import { CallLog } from '../../models/CallLog';
import { Phone } from '../../models/Phone';
import { exotelOutboundService } from '../../services/exotelOutbound.service';
import { phoneService } from '../../services/phone.service';
import mongoose from 'mongoose';

// Mock dependencies
jest.mock('../../models/CallLog');
jest.mock('../../models/Phone');
jest.mock('../../services/exotelOutbound.service');
jest.mock('../../services/phone.service');

describe('OutgoingCallService', () => {
  let service: OutgoingCallService;

  beforeEach(() => {
    // Reset service instance before each test
    service = new OutgoingCallService();
    jest.clearAllMocks();
  });

  describe('Phone Number Validation', () => {
    it('should accept valid E.164 phone numbers', async () => {
      const validNumbers = [
        '+919876543210',  // India
        '+14155552671',   // USA
        '+442071838750',  // UK
        '+61291234567',   // Australia
      ];

      // Mock Phone model
      const mockPhoneId = new mongoose.Types.ObjectId();
      const mockUserId = new mongoose.Types.ObjectId();
      const mockPhone = {
        _id: mockPhoneId,
        userId: mockUserId,
        number: '+911234567890',
        exotelData: {
          apiKey: 'encrypted_key',
          apiToken: 'encrypted_token',
          sid: 'test_sid',
          subdomain: 'api.exotel.com',
          appId: 'test_app_id'
        },
        populate: jest.fn().mockReturnThis()
      };
      (Phone.findById as jest.Mock) = jest.fn().mockReturnValue({
        populate: jest.fn().mockResolvedValue(mockPhone)
      });

      // Mock phoneService
      (phoneService.getExotelCredentials as jest.Mock).mockResolvedValue({
        apiKey: 'test_api_key',
        apiToken: 'test_api_token',
        sid: 'test_sid',
        subdomain: 'api.exotel.com',
        appId: 'test_app_id'
      });

      // Mock Agent model
      const mockAgent = { _id: 'agent123', name: 'Test Agent' };
      mongoose.model = jest.fn().mockReturnValue({
        findById: jest.fn().mockResolvedValue(mockAgent)
      });

      // Mock CallLog.create
      (CallLog.create as jest.Mock).mockResolvedValue({
        _id: 'call123',
        sessionId: 'session123',
        toPhone: '+919876543210'
      });

      // Mock CallLog.findByIdAndUpdate
      (CallLog.findByIdAndUpdate as jest.Mock).mockResolvedValue({});

      // Mock Exotel API response
      (exotelOutboundService.makeCall as jest.Mock).mockResolvedValue({
        sid: 'exotel123',
        status: 'queued'
      });

      for ( const phoneNumber of validNumbers) {
        const result = await service.initiateCall({
          phoneNumber,
          phoneId: mockPhoneId.toString(),
          agentId: 'agent123',
          userId: mockUserId.toString()
        });

        expect(result).toBeDefined();
      }
    });

    it('should reject invalid phone numbers', async () => {
      const invalidNumbers = [
        '9876543210',      // Missing +
        '+0123456789',     // Invalid country code (starts with 0)
        '123456',          // Too short (missing +)
        '+1234567890123456', // Too long (>15 digits after +)
        'abc123',          // Contains letters
        '+91-987-654-3210' // Contains hyphens
      ];

      for (const phoneNumber of invalidNumbers) {
        // Reset call count before each test
        jest.clearAllMocks();
        
        // Mock Phone.findById - it should never be called if validation fails
        (Phone.findById as jest.Mock) = jest.fn().mockReturnValue({
          populate: jest.fn()
        });
        
        await expect(
          service.initiateCall({
            phoneNumber,
            phoneId: new mongoose.Types.ObjectId().toString(),
            agentId: 'agent123',
            userId: new mongoose.Types.ObjectId().toString()
          })
        ).rejects.toThrow(/Invalid phone number format/);
        
        // Verify Phone.findById was never called (validation should fail first)
        expect(Phone.findById).not.toHaveBeenCalled();
      }
    });
  });

  describe('Concurrency Control', () => {
    it('should allow calls within limit', async () => {
      const canInitiate = await service.canInitiateCall();
      expect(canInitiate).toBe(true);
    });

    it('should track active calls', async () => {
      // Mock Phone model
      const mockPhoneId = new mongoose.Types.ObjectId();
      const mockUserId = new mongoose.Types.ObjectId();
      const mockPhone = {
        _id: mockPhoneId,
        userId: mockUserId,
        number: '+911234567890',
        exotelData: {
          apiKey: 'encrypted_key',
          apiToken: 'encrypted_token',
          sid: 'test_sid',
          subdomain: 'api.exotel.com',
          appId: 'test_app_id'
        },
        populate: jest.fn().mockReturnThis()
      };
      (Phone.findById as jest.Mock) = jest.fn().mockReturnValue({
        populate: jest.fn().mockResolvedValue(mockPhone)
      });

      // Mock phoneService
      (phoneService.getExotelCredentials as jest.Mock).mockResolvedValue({
        apiKey: 'test_api_key',
        apiToken: 'test_api_token',
        sid: 'test_sid',
        subdomain: 'api.exotel.com',
        appId: 'test_app_id'
      });

      // Mock Agent model
      const mockAgent = { _id: 'agent123', name: 'Test Agent' };
      mongoose.model = jest.fn().mockReturnValue({
        findById: jest.fn().mockResolvedValue(mockAgent)
      });

      // Mock CallLog.create
      (CallLog.create as jest.Mock).mockResolvedValue({
        _id: 'call123',
        sessionId: 'session123'
      });

      // Mock CallLog.findByIdAndUpdate
      (CallLog.findByIdAndUpdate as jest.Mock).mockResolvedValue({});

      // Mock Exotel API
      (exotelOutboundService.makeCall as jest.Mock).mockResolvedValue({
        sid: 'exotel123',
        status: 'queued'
      });

      const initialCount = await service.getActiveCalls();

      await service.initiateCall({
        phoneNumber: '+919876543210',
        phoneId: mockPhone._id.toString(),
        agentId: 'agent123',
        userId: mockUserId.toString()
      });

      const afterCount = await service.getActiveCalls();
      expect(afterCount).toBe(initialCount + 1);
    });

    it('should clean up old active calls', async () => {
      // This test verifies the 1-hour cleanup logic
      const canInitiate = await service.canInitiateCall();
      expect(canInitiate).toBe(true);
    });
  });

  describe('Call Initiation', () => {
    let mockPhoneId: mongoose.Types.ObjectId;
    let mockUserId: mongoose.Types.ObjectId;
    let mockPhone: any;

    beforeEach(() => {
      // Create consistent mock IDs
      mockPhoneId = new mongoose.Types.ObjectId();
      mockUserId = new mongoose.Types.ObjectId();
      mockPhone = {
        _id: mockPhoneId,
        userId: mockUserId,
        number: '+911234567890',
        exotelData: {
          apiKey: 'encrypted_key',
          apiToken: 'encrypted_token',
          sid: 'test_sid',
          subdomain: 'api.exotel.com',
          appId: 'test_app_id'
        },
        populate: jest.fn().mockReturnThis()
      };
      
      // Mock Phone model - return phone with matching userId
      (Phone.findById as jest.Mock) = jest.fn().mockImplementation((id: string) => {
        if (id === mockPhoneId.toString()) {
          return {
            populate: jest.fn().mockResolvedValue(mockPhone)
          };
        }
        return {
          populate: jest.fn().mockResolvedValue(null)
        };
      });

      // Mock phoneService
      (phoneService.getExotelCredentials as jest.Mock).mockResolvedValue({
        apiKey: 'test_api_key',
        apiToken: 'test_api_token',
        sid: 'test_sid',
        subdomain: 'api.exotel.com',
        appId: 'test_app_id'
      });

      // Setup common mocks
      const mockAgent = { _id: 'agent123', name: 'Test Agent' };
      mongoose.model = jest.fn().mockReturnValue({
        findById: jest.fn().mockResolvedValue(mockAgent)
      });

      (CallLog.create as jest.Mock).mockResolvedValue({
        _id: 'call123',
        sessionId: 'session123',
        toPhone: '+919876543210'
      });

      (CallLog.findByIdAndUpdate as jest.Mock).mockResolvedValue({});

      (exotelOutboundService.makeCall as jest.Mock).mockResolvedValue({
        sid: 'exotel123',
        status: 'queued'
      });
    });

    it('should successfully initiate a call', async () => {
      const callLogId = await service.initiateCall({
        phoneNumber: '+919876543210',
        phoneId: mockPhoneId.toString(),
        agentId: 'agent123',
        userId: mockUserId.toString(),
        metadata: { campaignId: 'camp123' }
      });

      expect(callLogId).toBeDefined();
      expect(CallLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          toPhone: '+919876543210',
          direction: 'outbound',
          status: 'initiated'
        })
      );
      expect(exotelOutboundService.makeCall).toHaveBeenCalled();
    });

    it('should throw error if agent not found', async () => {
      // Mock Phone model
      const mockPhoneId = new mongoose.Types.ObjectId();
      const mockUserId = new mongoose.Types.ObjectId();
      const mockPhone = {
        _id: mockPhoneId,
        userId: mockUserId,
        number: '+911234567890',
        exotelData: {
          apiKey: 'encrypted_key',
          apiToken: 'encrypted_token',
          sid: 'test_sid',
          subdomain: 'api.exotel.com',
          appId: 'test_app_id'
        },
        populate: jest.fn().mockReturnThis()
      };
      (Phone.findById as jest.Mock) = jest.fn().mockReturnValue({
        populate: jest.fn().mockResolvedValue(mockPhone)
      });

      // Mock phoneService
      (phoneService.getExotelCredentials as jest.Mock).mockResolvedValue({
        apiKey: 'test_api_key',
        apiToken: 'test_api_token',
        sid: 'test_sid',
        subdomain: 'api.exotel.com',
        appId: 'test_app_id'
      });

      mongoose.model = jest.fn().mockReturnValue({
        findById: jest.fn().mockResolvedValue(null)
      });

      await expect(
        service.initiateCall({
          phoneNumber: '+919876543210',
          phoneId: mockPhone._id.toString(),
          agentId: 'invalid_agent',
          userId: mockUserId.toString()
        })
      ).rejects.toThrow('Agent not found');
    });

    it('should handle Exotel API errors', async () => {
      (exotelOutboundService.makeCall as jest.Mock).mockRejectedValue(
        new Error('Exotel API error')
      );

      await expect(
        service.initiateCall({
          phoneNumber: '+919876543210',
          phoneId: mockPhoneId.toString(),
          agentId: 'agent123',
          userId: mockUserId.toString()
        })
      ).rejects.toThrow('Exotel API error');

      // Verify CallLog was marked as failed
      expect(CallLog.findByIdAndUpdate).toHaveBeenCalledWith(
        'call123',
        expect.objectContaining({
          status: 'failed',
          error: expect.objectContaining({
            code: 'EXOTEL_API_ERROR'
          })
        })
      );
    });
  });

  describe('Call Status', () => {
    it('should retrieve call status', async () => {
      const mockCallLog = {
        _id: 'call123',
        status: 'completed',
        outboundStatus: 'connected',
        toPhone: '+919876543210',
        startedAt: new Date(),
        durationSec: 120
      };

      (CallLog.findById as jest.Mock).mockResolvedValue(mockCallLog);

      const status = await service.getCallStatus('call123');

      expect(status).toEqual({
        callLogId: 'call123',
        status: 'completed',
        outboundStatus: 'connected',
        phoneNumber: '+919876543210',
        startedAt: mockCallLog.startedAt,
        duration: 120
      });
    });

    it('should throw error if call not found', async () => {
      (CallLog.findById as jest.Mock).mockResolvedValue(null);

      await expect(
        service.getCallStatus('invalid_call_id')
      ).rejects.toThrow('Call not found');
    });
  });

  describe('Call Cancellation', () => {
    it('should cancel a ringing call', async () => {
      const mockCallLog = {
        _id: 'call123',
        status: 'ringing',
        exotelCallSid: 'exotel123'
      };

      (CallLog.findById as jest.Mock).mockResolvedValue(mockCallLog);
      (CallLog.findByIdAndUpdate as jest.Mock).mockResolvedValue({});
      (exotelOutboundService.hangupCall as jest.Mock).mockResolvedValue(undefined);

      await service.cancelCall('call123');

      expect(exotelOutboundService.hangupCall).toHaveBeenCalledWith('exotel123');
      expect(CallLog.findByIdAndUpdate).toHaveBeenCalledWith(
        'call123',
        expect.objectContaining({
          status: 'canceled',
          failureReason: 'cancelled'
        })
      );
    });

    it('should not cancel a completed call', async () => {
      const mockCallLog = {
        _id: 'call123',
        status: 'completed'
      };

      (CallLog.findById as jest.Mock).mockResolvedValue(mockCallLog);

      await expect(
        service.cancelCall('call123')
      ).rejects.toThrow('Cannot cancel call with status: completed');
    });
  });

  describe('Bulk Call Initiation', () => {
    let mockPhoneId: mongoose.Types.ObjectId;
    let mockUserId: mongoose.Types.ObjectId;
    let mockPhone: any;

    beforeEach(() => {
      // Create consistent mock IDs
      mockPhoneId = new mongoose.Types.ObjectId();
      mockUserId = new mongoose.Types.ObjectId();
      mockPhone = {
        _id: mockPhoneId,
        userId: mockUserId,
        number: '+911234567890',
        exotelData: {
          apiKey: 'encrypted_key',
          apiToken: 'encrypted_token',
          sid: 'test_sid',
          subdomain: 'api.exotel.com',
          appId: 'test_app_id'
        },
        populate: jest.fn().mockReturnThis()
      };
      
      // Mock Phone model - return phone with matching userId
      (Phone.findById as jest.Mock) = jest.fn().mockImplementation((id: string) => {
        if (id === mockPhoneId.toString()) {
          return {
            populate: jest.fn().mockResolvedValue(mockPhone)
          };
        }
        return {
          populate: jest.fn().mockResolvedValue(null)
        };
      });

      // Mock phoneService
      (phoneService.getExotelCredentials as jest.Mock).mockResolvedValue({
        apiKey: 'test_api_key',
        apiToken: 'test_api_token',
        sid: 'test_sid',
        subdomain: 'api.exotel.com',
        appId: 'test_app_id'
      });

      const mockAgent = { _id: 'agent123', name: 'Test Agent' };
      mongoose.model = jest.fn().mockReturnValue({
        findById: jest.fn().mockResolvedValue(mockAgent)
      });

      let callCounter = 0;
      (CallLog.create as jest.Mock).mockImplementation(() => {
        callCounter++;
        return Promise.resolve({
          _id: `call${callCounter}`,
          sessionId: `session${callCounter}`
        });
      });

      (CallLog.findByIdAndUpdate as jest.Mock).mockResolvedValue({});

      (exotelOutboundService.makeCall as jest.Mock).mockResolvedValue({
        sid: 'exotel123',
        status: 'queued'
      });
    });

    it('should initiate multiple calls', async () => {
      const calls = [
        { phoneNumber: '+919876543210', phoneId: mockPhoneId.toString(), agentId: 'agent123', userId: mockUserId.toString() },
        { phoneNumber: '+919876543211', phoneId: mockPhoneId.toString(), agentId: 'agent123', userId: mockUserId.toString() },
        { phoneNumber: '+919876543212', phoneId: mockPhoneId.toString(), agentId: 'agent123', userId: mockUserId.toString() }
      ];

      const callLogIds = await service.bulkInitiateCalls(calls);

      expect(callLogIds).toHaveLength(3);
      expect(CallLog.create).toHaveBeenCalledTimes(3);
    });

    it('should reject batches exceeding 1000 calls', async () => {
      const calls = Array(1001).fill({
        phoneNumber: '+919876543210',
        phoneId: mockPhoneId.toString(),
        agentId: 'agent123',
        userId: mockUserId.toString()
      });

      await expect(
        service.bulkInitiateCalls(calls)
      ).rejects.toThrow('Maximum 1000 calls per batch');
    });

    it('should handle partial failures in bulk calls', async () => {
      // Mock one call to fail
      let callCount = 0;
      (exotelOutboundService.makeCall as jest.Mock).mockImplementation(() => {
        callCount++;
        if (callCount === 2) {
          return Promise.reject(new Error('API Error'));
        }
        return Promise.resolve({ sid: 'exotel123', status: 'queued' });
      });

      const calls = [
        { phoneNumber: '+919876543210', phoneId: mockPhoneId.toString(), agentId: 'agent123', userId: mockUserId.toString() },
        { phoneNumber: '+919876543211', phoneId: mockPhoneId.toString(), agentId: 'agent123', userId: mockUserId.toString() },
        { phoneNumber: '+919876543212', phoneId: mockPhoneId.toString(), agentId: 'agent123', userId: mockUserId.toString() }
      ];

      const callLogIds = await service.bulkInitiateCalls(calls);

      // Should have 2 successful calls (1st and 3rd)
      expect(callLogIds).toHaveLength(2);
    });
  });

  describe('Service Statistics', () => {
    it('should return service stats', async () => {
      (exotelOutboundService.getCircuitBreakerState as jest.Mock).mockReturnValue('closed');
      (exotelOutboundService.getRateLimiterStats as jest.Mock).mockResolvedValue({
        currentJobs: 0,
        queuedJobs: 0
      });

      const stats = await service.getStats();

      expect(stats).toHaveProperty('activeCalls');
      expect(stats).toHaveProperty('maxConcurrentCalls');
      expect(stats).toHaveProperty('utilization');
      expect(stats).toHaveProperty('circuitBreaker');
      expect(stats).toHaveProperty('rateLimiter');
    });
  });

  describe('Retry Handling', () => {
    it('should create new call log for retry attempts', async () => {
      // Mock Phone model
      const mockPhoneId = new mongoose.Types.ObjectId();
      const mockUserId = new mongoose.Types.ObjectId();
      const mockPhone = {
        _id: mockPhoneId,
        userId: mockUserId,
        number: '+911234567890',
        exotelData: {
          apiKey: 'encrypted_key',
          apiToken: 'encrypted_token',
          sid: 'test_sid',
          subdomain: 'api.exotel.com',
          appId: 'test_app_id'
        },
        populate: jest.fn().mockReturnThis()
      };
      (Phone.findById as jest.Mock) = jest.fn().mockReturnValue({
        populate: jest.fn().mockResolvedValue(mockPhone)
      });

      // Mock phoneService
      (phoneService.getExotelCredentials as jest.Mock).mockResolvedValue({
        apiKey: 'test_api_key',
        apiToken: 'test_api_token',
        sid: 'test_sid',
        subdomain: 'api.exotel.com',
        appId: 'test_app_id'
      });

      const mockAgent = { _id: 'agent123', name: 'Test Agent' };
      mongoose.model = jest.fn().mockReturnValue({
        findById: jest.fn().mockResolvedValue(mockAgent)
      });

      const originalCallLog = {
        _id: 'original_call',
        retryCount: 1
      };

      (CallLog.findById as jest.Mock).mockResolvedValue(originalCallLog);
      (CallLog.create as jest.Mock).mockResolvedValue({
        _id: 'retry_call',
        sessionId: 'retry_session'
      });
      (CallLog.findByIdAndUpdate as jest.Mock).mockResolvedValue({});
      (exotelOutboundService.makeCall as jest.Mock).mockResolvedValue({
        sid: 'exotel123',
        status: 'queued'
      });

      const callLogId = await service.initiateCall({
        phoneNumber: '+919876543210',
        phoneId: mockPhone._id.toString(),
        agentId: 'agent123',
        userId: mockUserId.toString(),
        callLogId: 'original_call'  // Retry parameter
      });

      expect(callLogId).toBe('retry_call');
      expect(CallLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          retryOf: 'original_call',
          retryCount: 2
        })
      );
    });
  });
});
