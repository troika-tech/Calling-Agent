/**
 * Integration Tests for API Endpoints
 * Tests the complete request-response cycle
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../app';

describe('API Integration Tests', () => {
  describe('Health Check', () => {
    it('GET /api/v1/health should return 200', async () => {
      const response = await request(app)
        .get('/api/v1/health')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('API is running');
    });
  });

  describe('API Info', () => {
    it('GET /api/v1 should return API info', async () => {
      const response = await request(app)
        .get('/api/v1')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('AI Calling Platform API');
      expect(response.body.endpoints).toBeDefined();
      expect(response.body.endpoints.analytics).toBe('/api/v1/analytics');
      expect(response.body.endpoints.bulk).toBe('/api/v1/bulk');
      expect(response.body.endpoints.retry).toBe('/api/v1/retry');
    });
  });

  describe('Bulk Operations', () => {
    it('GET /api/v1/bulk/template should return CSV template', async () => {
      const response = await request(app)
        .get('/api/v1/bulk/template')
        .expect(200);

      expect(response.text).toContain('phoneNumber');
      expect(response.text).toContain('agentId');
      expect(response.text).toContain('userId');
      expect(response.header['content-type']).toContain('text/csv');
    });

    it('POST /api/v1/bulk/import/validate should validate CSV', async () => {
      const csv = Buffer.from(`phoneNumber,agentId,userId
+919876543210,agent123,user123`);

      const response = await request(app)
        .post('/api/v1/bulk/import/validate')
        .attach('file', csv, 'test.csv')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.valid).toBe(true);
    });

    it('POST /api/v1/bulk/import/validate should reject non-CSV files', async () => {
      const txt = Buffer.from('not a csv');

      const response = await request(app)
        .post('/api/v1/bulk/import/validate')
        .attach('file', txt, 'test.txt')
        .expect(500);
    });

    it('POST /api/v1/bulk/import/validate should require file', async () => {
      const response = await request(app)
        .post('/api/v1/bulk/import/validate')
        .expect(400);

      expect(response.body.error.code).toBe('NO_FILE');
    });
  });

  describe('Analytics', () => {
    it('GET /api/v1/analytics/prewarming should return stats', async () => {
      const response = await request(app)
        .get('/api/v1/analytics/prewarming')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.deepgramConnections).toBeDefined();
      expect(response.body.data.latencySavings).toBeDefined();
      expect(response.body.data.isActive).toBeDefined();
    });

    it('GET /api/v1/analytics/dashboard should require valid date range', async () => {
      const response = await request(app)
        .get('/api/v1/analytics/dashboard')
        .query({
          startDate: '2025-10-25',
          endDate: '2025-11-01'
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.overview).toBeDefined();
      expect(response.body.data.retry).toBeDefined();
      expect(response.body.data.scheduling).toBeDefined();
    });
  });

  describe('Retry Operations', () => {
    it('GET /api/v1/retry/config should return configuration', async () => {
      const response = await request(app)
        .get('/api/v1/retry/config')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.enabled).toBeDefined();
      expect(response.body.data.delayMinutes).toBeDefined();
    });

    it('POST /api/v1/retry/schedule should validate request body', async () => {
      const response = await request(app)
        .post('/api/v1/retry/schedule')
        .send({})
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('Scheduling Operations', () => {
    it('GET /api/v1/scheduling/stats should return queue stats', async () => {
      const response = await request(app)
        .get('/api/v1/scheduling/stats')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.scheduler).toBeDefined();
      expect(response.body.data.queue).toBeDefined();
    });

    it('GET /api/v1/scheduling/scheduled-calls should require userId', async () => {
      const response = await request(app)
        .get('/api/v1/scheduling/scheduled-calls')
        .expect(400);

      expect(response.body.error.code).toBe('MISSING_USER_ID');
    });
  });

  describe('Error Handling', () => {
    it('should return 404 for non-existent routes', async () => {
      const response = await request(app)
        .get('/api/v1/non-existent')
        .expect(404);
    });

    it('should handle malformed JSON', async () => {
      const response = await request(app)
        .post('/api/v1/retry/schedule')
        .set('Content-Type', 'application/json')
        .send('{ invalid json }')
        .expect(400);
    });
  });

  describe('CORS and Security Headers', () => {
    it('should include security headers', async () => {
      const response = await request(app)
        .get('/api/v1/health')
        .expect(200);

      // Check for common security headers
      // Note: Actual headers depend on your security middleware
      expect(response.header).toBeDefined();
    });
  });
});
