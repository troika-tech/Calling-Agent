/**
 * Unit Tests for CSV Import Service
 */

import { describe, it, expect } from 'vitest';
import { csvImportService } from '../../services/csvImport.service';

describe('CSVImportService', () => {
  describe('parseCSV', () => {
    it('should parse valid CSV with header', async () => {
      const csv = `phoneNumber,agentId,userId,scheduledFor,timezone,priority
+919876543210,agent123,user123,2025-11-02T10:00:00Z,Asia/Kolkata,high
+919876543211,agent123,user123,2025-11-02T11:00:00Z,Asia/Kolkata,medium`;

      const result = await csvImportService.parseCSV(csv, {
        skipHeader: true,
        validatePhoneNumbers: true
      });

      expect(result.success).toBe(true);
      expect(result.totalRows).toBe(2);
      expect(result.validRows).toBe(2);
      expect(result.invalidRows).toBe(0);
      expect(result.imported).toHaveLength(2);
      expect(result.imported[0].phoneNumber).toBe('+919876543210');
      expect(result.imported[0].priority).toBe('high');
    });

    it('should detect invalid phone numbers', async () => {
      const csv = `phoneNumber,agentId,userId
123456789,agent123,user123
+919876543210,agent123,user123`;

      const result = await csvImportService.parseCSV(csv, {
        skipHeader: true,
        validatePhoneNumbers: true
      });

      expect(result.totalRows).toBe(2);
      expect(result.validRows).toBe(1);
      expect(result.invalidRows).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].error).toContain('Invalid phone number');
    });

    it('should detect duplicate phone numbers', async () => {
      const csv = `phoneNumber,agentId,userId
+919876543210,agent123,user123
+919876543210,agent123,user123
+919876543211,agent123,user123`;

      const result = await csvImportService.parseCSV(csv, {
        skipHeader: true,
        checkDuplicates: true
      });

      expect(result.totalRows).toBe(3);
      expect(result.validRows).toBe(2);
      expect(result.duplicateRows).toBe(1);
      expect(result.duplicates).toHaveLength(1);
      expect(result.duplicates[0].phoneNumber).toBe('+919876543210');
    });

    it('should apply default values', async () => {
      const csv = `phoneNumber
+919876543210`;

      const result = await csvImportService.parseCSV(csv, {
        skipHeader: true,
        validatePhoneNumbers: true,
        defaults: {
          agentId: 'default-agent',
          userId: 'default-user',
          timezone: 'Asia/Kolkata',
          priority: 'medium'
        }
      });

      expect(result.validRows).toBe(1);
      expect(result.imported[0].agentId).toBe('default-agent');
      expect(result.imported[0].userId).toBe('default-user');
      expect(result.imported[0].timezone).toBe('Asia/Kolkata');
      expect(result.imported[0].priority).toBe('medium');
    });

    it('should enforce max rows limit', async () => {
      const rows = Array(11).fill('+919876543210,agent123,user123').join('\n');
      const csv = `phoneNumber,agentId,userId\n${rows}`;

      await expect(
        csvImportService.parseCSV(csv, {
          skipHeader: true,
          maxRows: 10
        })
      ).rejects.toThrow('maximum allowed is 10');
    });

    it('should handle missing required fields', async () => {
      const csv = `phoneNumber,agentId
+919876543210,agent123`;

      const result = await csvImportService.parseCSV(csv, {
        skipHeader: true
      });

      expect(result.validRows).toBe(0);
      expect(result.invalidRows).toBe(1);
      expect(result.errors[0].error).toContain('Missing required fields');
    });

    it('should handle empty CSV', async () => {
      const csv = `phoneNumber,agentId,userId`;

      const result = await csvImportService.parseCSV(csv, {
        skipHeader: true
      });

      expect(result.totalRows).toBe(0);
      expect(result.validRows).toBe(0);
    });
  });

  describe('validateCSV', () => {
    it('should validate correct CSV structure', async () => {
      const csv = `phoneNumber,agentId,userId
+919876543210,agent123,user123`;

      const result = await csvImportService.validateCSV(csv);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.rowCount).toBe(1);
    });

    it('should warn about large CSV files', async () => {
      const rows = Array(1500).fill('+919876543210,agent123,user123').join('\n');
      const csv = `phoneNumber,agentId,userId\n${rows}`;

      const result = await csvImportService.validateCSV(csv);

      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain('Large CSV file');
    });

    it('should detect empty CSV', async () => {
      const csv = '';

      const result = await csvImportService.validateCSV(csv);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('CSV file is empty');
    });

    it('should detect too many rows', async () => {
      const rows = Array(10001).fill('+919876543210,agent123,user123').join('\n');
      const csv = `phoneNumber,agentId,userId\n${rows}`;

      const result = await csvImportService.validateCSV(csv, {
        maxRows: 10000
      });

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('Too many rows'))).toBe(true);
    });
  });

  describe('generateTemplate', () => {
    it('should generate valid CSV template', () => {
      const template = csvImportService.generateTemplate();

      expect(template).toContain('phoneNumber');
      expect(template).toContain('agentId');
      expect(template).toContain('userId');
      expect(template).toContain('+919876543210');
    });
  });

  describe('getImportStats', () => {
    it('should calculate stats correctly', () => {
      const result = {
        success: true,
        totalRows: 100,
        validRows: 80,
        invalidRows: 15,
        duplicateRows: 5,
        imported: [],
        errors: [],
        duplicates: []
      };

      const stats = csvImportService.getImportStats(result);

      expect(stats.successRate).toBe(80);
      expect(stats.duplicateRate).toBe(5);
      expect(stats.errorRate).toBe(15);
    });

    it('should handle zero rows', () => {
      const result = {
        success: false,
        totalRows: 0,
        validRows: 0,
        invalidRows: 0,
        duplicateRows: 0,
        imported: [],
        errors: [],
        duplicates: []
      };

      const stats = csvImportService.getImportStats(result);

      expect(stats.successRate).toBe(0);
      expect(stats.duplicateRate).toBe(0);
      expect(stats.errorRate).toBe(0);
    });
  });
});
