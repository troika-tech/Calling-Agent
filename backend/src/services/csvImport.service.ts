/**
 * CSV Import Service
 * Imports bulk call data from CSV files
 * Supports validation, deduplication, and batch processing
 */

import { parse } from 'csv-parse/sync';
import { logger } from '../utils/logger';
import { validatePhoneNumber } from '../utils/phoneValidator';
import mongoose from 'mongoose';

export interface CSVCallRecord {
  phoneNumber: string;  // Destination phone number to call
  phoneId: string;      // User's phone record ID (contains Exotel credentials & appId)
  agentId: string;
  userId: string;
  scheduledFor?: string | Date;
  timezone?: string;
  metadata?: Record<string, any>;
  priority?: 'low' | 'medium' | 'high';
}

export interface CSVImportResult {
  success: boolean;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  duplicateRows: number;
  imported: CSVCallRecord[];
  errors: Array<{
    row: number;
    error: string;
    data: any;
  }>;
  duplicates: Array<{
    row: number;
    phoneNumber: string;
  }>;
}

export interface CSVImportOptions {
  /**
   * Skip header row
   */
  skipHeader?: boolean;

  /**
   * Delimiter character
   */
  delimiter?: string;

  /**
   * Column mapping (if columns are not in standard order)
   */
  columnMapping?: {
    phoneNumber?: number | string;
    phoneId?: number | string;
    agentId?: number | string;
    userId?: number | string;
    scheduledFor?: number | string;
    timezone?: number | string;
    metadata?: number | string;
    priority?: number | string;
  };

  /**
   * Validate phone numbers
   */
  validatePhoneNumbers?: boolean;

  /**
   * Check for duplicates within the CSV
   */
  checkDuplicates?: boolean;

  /**
   * Maximum rows to import (safety limit)
   */
  maxRows?: number;

  /**
   * Default values for missing fields
   */
  defaults?: {
    agentId?: string;
    userId?: string;
    timezone?: string;
    priority?: 'low' | 'medium' | 'high';
  };
}

export class CSVImportService {
  /**
   * Parse and validate CSV file
   */
  async parseCSV(
    csvContent: string | Buffer,
    options: CSVImportOptions = {}
  ): Promise<CSVImportResult> {
    const {
      skipHeader = true,
      delimiter = ',',
      validatePhoneNumbers = true,
      checkDuplicates = true,
      maxRows = 10000,
      defaults = {}
    } = options;

    const result: CSVImportResult = {
      success: false,
      totalRows: 0,
      validRows: 0,
      invalidRows: 0,
      duplicateRows: 0,
      imported: [],
      errors: [],
      duplicates: []
    };

    try {
      // Parse CSV
      const records = parse(csvContent, {
        delimiter,
        skip_empty_lines: true,
        trim: true,
        relax_column_count: true
      });

      result.totalRows = records.length - (skipHeader ? 1 : 0);

      if (result.totalRows > maxRows) {
        throw new Error(`CSV contains ${result.totalRows} rows, maximum allowed is ${maxRows}`);
      }

      logger.info('Parsing CSV', {
        totalRows: result.totalRows,
        skipHeader
      });

      // Track phone numbers for duplicate detection
      const seenPhoneNumbers = new Set<string>();

      // Start from row 1 if skipping header, 0 otherwise
      const startRow = skipHeader ? 1 : 0;

      for (let i = startRow; i < records.length; i++) {
        const row = records[i];
        const rowNumber = i + 1; // 1-based row number

        try {
          // Parse record
          const record = this.parseRow(row, options);

          // Validate phone number
          if (validatePhoneNumbers && !this.validatePhoneNumber(record.phoneNumber)) {
            result.errors.push({
              row: rowNumber,
              error: `Invalid phone number: ${record.phoneNumber}`,
              data: row
            });
            result.invalidRows++;
            continue;
          }

          // Check for duplicates within CSV
          if (checkDuplicates) {
            if (seenPhoneNumbers.has(record.phoneNumber)) {
              result.duplicates.push({
                row: rowNumber,
                phoneNumber: record.phoneNumber
              });
              result.duplicateRows++;
              continue;
            }
            seenPhoneNumbers.add(record.phoneNumber);
          }

          // Apply defaults
          if (defaults.agentId && !record.agentId) {
            record.agentId = defaults.agentId;
          }
          if (defaults.userId && !record.userId) {
            record.userId = defaults.userId;
          }
          if (defaults.timezone && !record.timezone) {
            record.timezone = defaults.timezone;
          }
          if (defaults.priority && !record.priority) {
            record.priority = defaults.priority;
          }

          // Validate required fields
          if (!record.phoneNumber || !record.agentId || !record.userId) {
            result.errors.push({
              row: rowNumber,
              error: 'Missing required fields (phoneNumber, agentId, userId)',
              data: row
            });
            result.invalidRows++;
            continue;
          }

          // Valid record
          result.imported.push(record);
          result.validRows++;
        } catch (error: any) {
          result.errors.push({
            row: rowNumber,
            error: error.message,
            data: row
          });
          result.invalidRows++;
        }
      }

      result.success = result.validRows > 0;

      logger.info('CSV parsing complete', {
        totalRows: result.totalRows,
        validRows: result.validRows,
        invalidRows: result.invalidRows,
        duplicateRows: result.duplicateRows
      });

      return result;
    } catch (error: any) {
      logger.error('CSV parsing failed', {
        error: error.message,
        stack: error.stack
      });

      result.errors.push({
        row: 0,
        error: `CSV parsing failed: ${error.message}`,
        data: null
      });

      return result;
    }
  }

  /**
   * Parse individual CSV row
   */
  private parseRow(
    row: any[],
    options: CSVImportOptions
  ): CSVCallRecord {
    const { columnMapping } = options;

    // Default column order: phoneNumber, agentId, userId, scheduledFor, timezone, priority
    const getColumn = (index: number, name: keyof typeof columnMapping): any => {
      if (columnMapping && columnMapping[name] !== undefined) {
        const mapping = columnMapping[name];
        if (typeof mapping === 'number') {
          return row[mapping];
        } else if (typeof mapping === 'string') {
          // Named column (requires header parsing - not implemented)
          return undefined;
        }
      }
      return row[index];
    };

    const phoneNumber = getColumn(0, 'phoneNumber')?.trim();
    const phoneId = getColumn(1, 'phoneId')?.trim();
    const agentId = getColumn(2, 'agentId')?.trim();
    const userId = getColumn(3, 'userId')?.trim();
    const scheduledFor = getColumn(4, 'scheduledFor')?.trim();
    const timezone = getColumn(5, 'timezone')?.trim();
    const priority = getColumn(6, 'priority')?.trim() as 'low' | 'medium' | 'high' | undefined;

    // Parse metadata from remaining columns (if any)
    const metadata: Record<string, any> = {};
    if (row.length > 7) {
      for (let i = 7; i < row.length; i += 2) {
        const key = row[i]?.trim();
        const value = row[i + 1]?.trim();
        if (key) {
          metadata[key] = value;
        }
      }
    }

    return {
      phoneNumber,
      phoneId,
      agentId,
      userId,
      scheduledFor: scheduledFor ? new Date(scheduledFor) : undefined,
      timezone,
      priority,
      metadata: Object.keys(metadata).length > 0 ? metadata : undefined
    };
  }

  /**
   * Validate phone number (E.164 format)
   */
  private validatePhoneNumber(phoneNumber: string): boolean {
    if (!phoneNumber) return false;

    const e164Regex = /^\+[1-9]\d{1,14}$/;
    return e164Regex.test(phoneNumber);
  }

  /**
   * Generate CSV template
   */
  generateTemplate(): string {
    const headers = [
      'phoneNumber',
      'agentId',
      'userId',
      'scheduledFor',
      'timezone',
      'priority'
    ];

    const example = [
      '+919876543210',
      '673b8f9e1234567890abcdef',
      '673b8f9d1234567890abcdef',
      '2025-11-02T10:00:00Z',
      'Asia/Kolkata',
      'high'
    ];

    return `${headers.join(',')}\n${example.join(',')}`;
  }

  /**
   * Validate CSV structure
   */
  async validateCSV(
    csvContent: string | Buffer,
    options: CSVImportOptions = {}
  ): Promise<{
    valid: boolean;
    errors: string[];
    warnings: string[];
    rowCount: number;
  }> {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      const records = parse(csvContent, {
        delimiter: options.delimiter || ',',
        skip_empty_lines: true,
        trim: true
      });

      const rowCount = records.length - (options.skipHeader !== false ? 1 : 0);

      if (rowCount === 0) {
        errors.push('CSV file is empty');
      }

      if (rowCount > (options.maxRows || 10000)) {
        errors.push(`Too many rows (${rowCount}), maximum is ${options.maxRows || 10000}`);
      }

      // Check column count
      const firstRow = records[options.skipHeader !== false ? 1 : 0];
      if (firstRow && firstRow.length < 3) {
        errors.push('CSV must have at least 3 columns (phoneNumber, agentId, userId)');
      }

      if (rowCount > 1000) {
        warnings.push(`Large CSV file (${rowCount} rows) may take several minutes to process`);
      }

      return {
        valid: errors.length === 0,
        errors,
        warnings,
        rowCount
      };
    } catch (error: any) {
      errors.push(`Invalid CSV format: ${error.message}`);

      return {
        valid: false,
        errors,
        warnings,
        rowCount: 0
      };
    }
  }

  /**
   * Get import statistics
   */
  getImportStats(result: CSVImportResult): {
    successRate: number;
    duplicateRate: number;
    errorRate: number;
  } {
    const total = result.totalRows || 1;

    return {
      successRate: (result.validRows / total) * 100,
      duplicateRate: (result.duplicateRows / total) * 100,
      errorRate: (result.invalidRows / total) * 100
    };
  }
}

// Export singleton instance
export const csvImportService = new CSVImportService();
