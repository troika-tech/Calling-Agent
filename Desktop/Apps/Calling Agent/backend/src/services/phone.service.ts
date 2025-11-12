import mongoose from 'mongoose';
import { Phone, IPhone } from '../models/Phone';
import { Agent } from '../models/Agent';
import {
  NotFoundError,
  ForbiddenError,
  ValidationError,
  ConflictError
} from '../utils/errors';
import { logger } from '../utils/logger';
import { encrypt, decrypt } from '../utils/encryption';

export interface ImportPhoneData {
  number: string;
  country: string;
  exotelConfig?: {
    apiKey: string;
    apiToken: string;
    sid: string;
    subdomain: string;
    appId?: string;      // Voicebot App ID for outbound calls
  };
  tags?: string[];
}

export interface UpdatePhoneData {
  tags?: string[];
  isActive?: boolean;
}

export class PhoneService {
  /**
   * Import a phone number
   */
  async importPhone(userId: string, data: ImportPhoneData): Promise<IPhone> {
    try {
      // Check if phone number already exists (globally - one phone can only be used once)
      const existingPhone = await Phone.findOne({
        number: data.number
      });

      if (existingPhone) {
        throw new ConflictError('Phone number already exists in the system');
      }

      const phone = await Phone.create({
        userId,
        number: data.number,
        country: data.country,
        provider: 'exotel',
        status: 'active',
        exotelData: data.exotelConfig ? {
          apiKey: encrypt(data.exotelConfig.apiKey),
          apiToken: encrypt(data.exotelConfig.apiToken),
          sid: data.exotelConfig.sid,
          subdomain: data.exotelConfig.subdomain,
          appId: data.exotelConfig.appId
        } : undefined,
        tags: data.tags || []
      });

      logger.info('Phone imported successfully', {
        userId,
        phoneId: (phone._id as mongoose.Types.ObjectId).toString(),
        number: phone.number
      });

      return phone;
    } catch (error) {
      if (error instanceof ConflictError) {
        throw error;
      }
      logger.error('Import phone error', { error, userId });
      throw new Error('Failed to import phone number');
    }
  }

  /**
   * Get all phones for a user
   */
  async getPhones(
    userId: string,
    options: {
      page?: number;
      limit?: number;
      search?: string;
      isActive?: boolean;
      hasAgent?: boolean;
    } = {}
  ): Promise<{
    phones: IPhone[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    try {
      const page = options.page || 1;
      const limit = options.limit || 10;
      const skip = (page - 1) * limit;

      // Build query
      const query: any = { userId };

      if (options.search) {
        query.number = { $regex: options.search, $options: 'i' };
      }

      if (options.isActive !== undefined) {
        query.status = options.isActive ? 'active' : 'inactive';
      }

      if (options.hasAgent !== undefined) {
        if (options.hasAgent) {
          query.agentId = { $ne: null };
        } else {
          query.agentId = null;
        }
      }

      // Execute query
      const [phones, total] = await Promise.all([
        Phone.find(query)
          .populate('agentId', 'name config.prompt')
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit),
        Phone.countDocuments(query)
      ]);

      return {
        phones,
        total,
        page,
        totalPages: Math.ceil(total / limit)
      };
    } catch (error) {
      logger.error('Get phones error', { error, userId });
      throw new Error('Failed to get phone numbers');
    }
  }

  /**
   * Get phone by ID
   */
  async getPhoneById(phoneId: string, userId: string): Promise<IPhone> {
    const phone = await Phone.findById(phoneId).populate(
      'agentId',
      'name config.prompt config.voice config.llm'
    );

    if (!phone) {
      throw new NotFoundError('Phone number not found');
    }

    // Check ownership
    if (phone.userId.toString() !== userId) {
      throw new ForbiddenError('Not authorized to access this phone number');
    }

    return phone;
  }

  /**
   * Assign agent to phone
   */
  async assignAgent(
    phoneId: string,
    userId: string,
    agentId: string
  ): Promise<IPhone> {
    try {
      const phone = await this.getPhoneById(phoneId, userId);

      // Verify agent exists and belongs to user
      const agent = await Agent.findOne({ _id: agentId, userId });

      if (!agent) {
        throw new NotFoundError('Agent not found');
      }

      if (!agent.isActive) {
        throw new ValidationError('Cannot assign inactive agent');
      }

      phone.agentId = agent._id as any;
      await phone.save();

      logger.info('Agent assigned to phone', {
        userId,
        phoneId,
        agentId,
        phoneNumber: phone.number
      });

      // Reload with populated agent
      return await this.getPhoneById(phoneId, userId);
    } catch (error) {
      if (
        error instanceof NotFoundError ||
        error instanceof ForbiddenError ||
        error instanceof ValidationError
      ) {
        throw error;
      }
      logger.error('Assign agent error', { error, userId, phoneId, agentId });
      throw new Error('Failed to assign agent');
    }
  }

  /**
   * Unassign agent from phone
   */
  async unassignAgent(phoneId: string, userId: string): Promise<IPhone> {
    try {
      const phone = await this.getPhoneById(phoneId, userId);

      phone.agentId = undefined as any;
      await phone.save();

      logger.info('Agent unassigned from phone', {
        userId,
        phoneId,
        phoneNumber: phone.number
      });

      return phone;
    } catch (error) {
      if (
        error instanceof NotFoundError ||
        error instanceof ForbiddenError
      ) {
        throw error;
      }
      logger.error('Unassign agent error', { error, userId, phoneId });
      throw new Error('Failed to unassign agent');
    }
  }

  /**
   * Update phone tags
   */
  async updatePhone(
    phoneId: string,
    userId: string,
    data: UpdatePhoneData
  ): Promise<IPhone> {
    try {
      const phone = await this.getPhoneById(phoneId, userId);

      if (data.tags !== undefined) {
        phone.tags = data.tags;
      }

      if (data.isActive !== undefined) {
        phone.status = data.isActive ? 'active' : 'inactive';
      }

      await phone.save();

      logger.info('Phone updated successfully', {
        userId,
        phoneId,
        phoneNumber: phone.number
      });

      return phone;
    } catch (error) {
      if (
        error instanceof NotFoundError ||
        error instanceof ForbiddenError
      ) {
        throw error;
      }
      logger.error('Update phone error', { error, userId, phoneId });
      throw new Error('Failed to update phone');
    }
  }

  /**
   * Delete phone
   */
  async deletePhone(phoneId: string, userId: string): Promise<void> {
    try {
      const phone = await this.getPhoneById(phoneId, userId);

      await phone.deleteOne();

      logger.info('Phone deleted successfully', {
        userId,
        phoneId,
        phoneNumber: phone.number
      });
    } catch (error) {
      if (
        error instanceof NotFoundError ||
        error instanceof ForbiddenError
      ) {
        throw error;
      }
      logger.error('Delete phone error', { error, userId, phoneId });
      throw new Error('Failed to delete phone');
    }
  }

  /**
   * Get phone statistics
   */
  async getPhoneStats(phoneId: string, userId: string): Promise<{
    totalCalls: number;
    successfulCalls: number;
    failedCalls: number;
    totalDuration: number;
    averageDuration: number;
  }> {
    try {
      // Verify ownership
      await this.getPhoneById(phoneId, userId);

      // TODO: Implement when CallLog model is integrated
      return {
        totalCalls: 0,
        successfulCalls: 0,
        failedCalls: 0,
        totalDuration: 0,
        averageDuration: 0
      };
    } catch (error) {
      if (
        error instanceof NotFoundError ||
        error instanceof ForbiddenError
      ) {
        throw error;
      }
      logger.error('Get phone stats error', { error, userId, phoneId });
      throw new Error('Failed to get phone statistics');
    }
  }

  /**
   * Get decrypted Exotel credentials for a phone
   */
  async getExotelCredentials(phoneId: string, userId: string): Promise<{
    apiKey: string;
    apiToken: string;
    sid: string;
    subdomain: string;
    appId?: string;
  } | null> {
    try {
      const phone = await this.getPhoneById(phoneId, userId);

      if (!phone.exotelData) {
        return null;
      }

      return {
        apiKey: decrypt(phone.exotelData.apiKey),
        apiToken: decrypt(phone.exotelData.apiToken),
        sid: phone.exotelData.sid,
        subdomain: phone.exotelData.subdomain,
        appId: phone.exotelData.appId
      };
    } catch (error) {
      logger.error('Get Exotel credentials error', { error, userId, phoneId });
      throw error;
    }
  }
}

export const phoneService = new PhoneService();
