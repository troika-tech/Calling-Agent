/**
 * Unit Tests for Outgoing Calls Routes
 */

import express from 'express';
import request from 'supertest';
import outgoingCallsRoutes from '../../routes/outgoingCalls.routes';
import { outgoingCallService } from '../../services/outgoingCall.service';

// Mock the service
jest.mock('../../services/outgoingCall.service');

describe('Outgoing Calls Routes', () => {
  let app: express.Application;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api/v1/calls', outgoingCallsRoutes);
    jest.clearAllMocks();
  });

  describe('POST /api/v1/calls/outbound', () => {
    it('should initiate an outbound call successfully', async () => {
      (outgoingCallService.initiateCall as jest.Mock).mockResolvedValue('call123');

      const response = await request(app)
        .post('/api/v1/calls/outbound')
        .send({
          phoneNumber: '+919876543210',
          phoneId: 'phone123',
          agentId: 'agent123',
          userId: 'user123',
          metadata: { campaignId: 'camp123' }
        });

      expect(response.status).toBe(201);
      expect(response.body).toEqual({
        success: true,
        data: {
          callLogId: 'call123',
          status: 'initiated',
          message: 'Outbound call initiated successfully'
        }
      });
    });

    it('should validate phone number format', async () => {
      const response = await request(app)
        .post('/api/v1/calls/outbound')
        .send({
          phoneNumber: 'invalid',
          phoneId: 'phone123',
          agentId: 'agent123',
          userId: 'user123'
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should require all mandatory fields', async () => {
      const response = await request(app)
        .post('/api/v1/calls/outbound')
        .send({
          phoneNumber: '+919876543210'
          // Missing phoneId, agentId and userId
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should handle invalid phone number error', async () => {
      (outgoingCallService.initiateCall as jest.Mock).mockRejectedValue(
        new Error('Invalid phone number format. Please use E.164 format')
      );

      const response = await request(app)
        .post('/api/v1/calls/outbound')
        .send({
          phoneNumber: '+919876543210',
          phoneId: 'phone123',
          agentId: 'agent123',
          userId: 'user123'
        });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('INVALID_PHONE_NUMBER');
    });

    it('should handle agent not found error', async () => {
      (outgoingCallService.initiateCall as jest.Mock).mockRejectedValue(
        new Error('Agent not found')
      );

      const response = await request(app)
        .post('/api/v1/calls/outbound')
        .send({
          phoneNumber: '+919876543210',
          phoneId: 'phone123',
          agentId: 'invalid_agent',
          userId: 'user123'
        });

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe('AGENT_NOT_FOUND');
    });

    it('should handle concurrent limit error', async () => {
      (outgoingCallService.initiateCall as jest.Mock).mockRejectedValue(
        new Error('Maximum concurrent calls reached. Please try again in a few minutes.')
      );

      const response = await request(app)
        .post('/api/v1/calls/outbound')
        .send({
          phoneNumber: '+919876543210',
          phoneId: 'phone123',
          agentId: 'agent123',
          userId: 'user123'
        });

      expect(response.status).toBe(429);
      expect(response.body.error.code).toBe('CONCURRENT_LIMIT_REACHED');
    });

    it('should handle circuit breaker open error', async () => {
      (outgoingCallService.initiateCall as jest.Mock).mockRejectedValue(
        new Error('Circuit breaker is OPEN - Exotel API unavailable')
      );

      const response = await request(app)
        .post('/api/v1/calls/outbound')
        .send({
          phoneNumber: '+919876543210',
          phoneId: 'phone123',
          agentId: 'agent123',
          userId: 'user123'
        });

      expect(response.status).toBe(503);
      expect(response.body.error.code).toBe('API_UNAVAILABLE');
    });
  });

  describe('POST /api/v1/calls/outbound/bulk', () => {
    it('should initiate bulk calls successfully', async () => {
      (outgoingCallService.bulkInitiateCalls as jest.Mock).mockResolvedValue([
        'call1',
        'call2',
        'call3'
      ]);

      const response = await request(app)
        .post('/api/v1/calls/outbound/bulk')
        .send({
          calls: [
            { phoneNumber: '+919876543210', phoneId: 'phone123', agentId: 'agent123', userId: 'user123' },
            { phoneNumber: '+919876543211', phoneId: 'phone123', agentId: 'agent123', userId: 'user123' },
            { phoneNumber: '+919876543212', phoneId: 'phone123', agentId: 'agent123', userId: 'user123' }
          ]
        });

      expect(response.status).toBe(201);
      expect(response.body.data.successful).toBe(3);
      expect(response.body.data.callLogIds).toHaveLength(3);
    });

    it('should validate bulk call array', async () => {
      const response = await request(app)
        .post('/api/v1/calls/outbound/bulk')
        .send({
          calls: 'invalid'  // Should be an array
        });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should handle batch size exceeded error', async () => {
      // Note: Validation happens before service call, so Joi catches this first
      const response = await request(app)
        .post('/api/v1/calls/outbound/bulk')
        .send({
          calls: Array(1001).fill({
            phoneNumber: '+919876543210',
            phoneId: 'phone123',
            agentId: 'agent123',
            userId: 'user123'
          })
        });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('GET /api/v1/calls/:callLogId', () => {
    it('should get call status successfully', async () => {
      const mockStatus = {
        callLogId: 'call123',
        status: 'completed',
        outboundStatus: 'connected',
        phoneNumber: '+919876543210',
        startedAt: new Date(),
        duration: 120
      };

      (outgoingCallService.getCallStatus as jest.Mock).mockResolvedValue(mockStatus);

      const response = await request(app)
        .get('/api/v1/calls/call123');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.callLogId).toBe('call123');
    });

    it('should handle call not found', async () => {
      (outgoingCallService.getCallStatus as jest.Mock).mockRejectedValue(
        new Error('Call not found')
      );

      const response = await request(app)
        .get('/api/v1/calls/invalid_call');

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe('CALL_NOT_FOUND');
    });
  });

  describe('POST /api/v1/calls/:callLogId/cancel', () => {
    it('should cancel a call successfully', async () => {
      (outgoingCallService.cancelCall as jest.Mock).mockResolvedValue(undefined);

      const response = await request(app)
        .post('/api/v1/calls/call123/cancel');

      expect(response.status).toBe(200);
      expect(response.body.data.status).toBe('canceled');
    });

    it('should handle call not found', async () => {
      (outgoingCallService.cancelCall as jest.Mock).mockRejectedValue(
        new Error('Call not found')
      );

      const response = await request(app)
        .post('/api/v1/calls/invalid_call/cancel');

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe('CALL_NOT_FOUND');
    });

    it('should handle invalid cancellation', async () => {
      (outgoingCallService.cancelCall as jest.Mock).mockRejectedValue(
        new Error('Cannot cancel call with status: completed')
      );

      const response = await request(app)
        .post('/api/v1/calls/call123/cancel');

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('INVALID_OPERATION');
    });
  });

  describe('GET /api/v1/calls/outbound/stats', () => {
    it('should get service statistics', async () => {
      const mockStats = {
        activeCalls: 5,
        maxConcurrentCalls: 10,
        utilization: 50,
        circuitBreaker: 'closed',
        rateLimiter: {
          currentJobs: 2,
          queuedJobs: 0
        }
      };

      (outgoingCallService.getStats as jest.Mock).mockResolvedValue(mockStats);

      const response = await request(app)
        .get('/api/v1/calls/outbound/stats');

      expect(response.status).toBe(200);
      expect(response.body.data.activeCalls).toBe(5);
      expect(response.body.data.utilization).toBe(50);
    });

    it('should handle stats retrieval errors', async () => {
      (outgoingCallService.getStats as jest.Mock).mockRejectedValue(
        new Error('Stats unavailable')
      );

      const response = await request(app)
        .get('/api/v1/calls/outbound/stats');

      expect(response.status).toBe(500);
      expect(response.body.error.code).toBe('INTERNAL_ERROR');
    });
  });

  describe('Input Validation', () => {
    it('should strip unknown fields', async () => {
      (outgoingCallService.initiateCall as jest.Mock).mockResolvedValue('call123');

      const response = await request(app)
        .post('/api/v1/calls/outbound')
        .send({
          phoneNumber: '+919876543210',
          phoneId: 'phone123',
          agentId: 'agent123',
          userId: 'user123',
          unknownField: 'should be stripped'
        });

      expect(response.status).toBe(201);
      // Service should only receive validated fields
      expect(outgoingCallService.initiateCall).toHaveBeenCalledWith(
        expect.not.objectContaining({
          unknownField: expect.anything()
        })
      );
    });

    it('should validate priority enum values', async () => {
      const response = await request(app)
        .post('/api/v1/calls/outbound')
        .send({
          phoneNumber: '+919876543210',
          phoneId: 'phone123',
          agentId: 'agent123',
          userId: 'user123',
          priority: 'invalid_priority'
        });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should accept valid priority values', async () => {
      (outgoingCallService.initiateCall as jest.Mock).mockResolvedValue('call123');

      const priorities = ['low', 'medium', 'high'];

      for (const priority of priorities) {
        const response = await request(app)
          .post('/api/v1/calls/outbound')
          .send({
            phoneNumber: '+919876543210',
            phoneId: 'phone123',
            agentId: 'agent123',
            userId: 'user123',
            priority
          });

        expect(response.status).toBe(201);
      }
    });
  });
});
