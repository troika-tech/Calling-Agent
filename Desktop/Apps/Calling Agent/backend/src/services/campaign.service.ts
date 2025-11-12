/**
 * Campaign Service
 * Handles CRUD operations and business logic for campaigns
 */

import mongoose from 'mongoose';
import { Campaign, ICampaign } from '../models/Campaign';
import { CampaignContact, ICampaignContact } from '../models/CampaignContact';
import { Agent } from '../models/Agent';
import { Phone } from '../models/Phone';
import { CallLog } from '../models/CallLog';
import logger from '../utils/logger';

export interface CreateCampaignParams {
  userId: string;
  agentId: string;
  phoneId?: string;
  name: string;
  description?: string;
  scheduledFor?: Date;
  settings?: {
    retryFailedCalls?: boolean;
    maxRetryAttempts?: number;
    retryDelayMinutes?: number;
    excludeVoicemail?: boolean;
    priorityMode?: 'fifo' | 'lifo' | 'priority';
    concurrentCallsLimit?: number;
  };
  metadata?: Record<string, any>;
}

export interface AddContactsParams {
  campaignId: string;
  userId: string;
  contacts: Array<{
    phoneNumber: string;
    name?: string;
    email?: string;
    customData?: Record<string, any>;
    priority?: number;
    scheduledFor?: Date;
  }>;
}

export interface UpdateCampaignParams {
  name?: string;
  description?: string;
  scheduledFor?: Date;
  settings?: Partial<{
    retryFailedCalls: boolean;
    maxRetryAttempts: number;
    retryDelayMinutes: number;
    excludeVoicemail: boolean;
    priorityMode: 'fifo' | 'lifo' | 'priority';
    concurrentCallsLimit: number;
  }>;
  metadata?: Record<string, any>;
}

export class CampaignService {
  /**
   * Create a new campaign
   */
  async createCampaign(params: CreateCampaignParams): Promise<ICampaign> {
    const { userId, agentId, phoneId, name, description, scheduledFor, settings, metadata } = params;

    // Validate agent exists
    const agent = await Agent.findById(agentId);
    if (!agent) {
      throw new Error('Agent not found');
    }

    // Validate agent belongs to user
    logger.debug('Checking agent ownership', {
      agentUserId: agent.userId.toString(),
      requestUserId: userId,
      agentUserIdType: typeof agent.userId,
      requestUserIdType: typeof userId,
      match: agent.userId.toString() === userId.toString()
    });

    if (agent.userId.toString() !== userId.toString()) {
      throw new Error('Agent does not belong to user');
    }

    // Validate phone if provided
    if (phoneId) {
      const phone = await Phone.findById(phoneId);
      if (!phone) {
        throw new Error('Phone not found');
      }
      if (phone.userId.toString() !== userId) {
        throw new Error('Phone does not belong to user');
      }
    }

    // Create campaign
    const campaign = await Campaign.create({
      userId,
      agentId,
      phoneId,
      name,
      description,
      status: scheduledFor && scheduledFor > new Date() ? 'scheduled' : 'draft',
      scheduledFor,
      settings: {
        retryFailedCalls: settings?.retryFailedCalls ?? true,
        maxRetryAttempts: settings?.maxRetryAttempts ?? 3,
        retryDelayMinutes: settings?.retryDelayMinutes ?? 30,
        excludeVoicemail: settings?.excludeVoicemail ?? true,
        priorityMode: settings?.priorityMode ?? 'fifo',
        concurrentCallsLimit: settings?.concurrentCallsLimit ?? 3
      },
      metadata
    });

    logger.info('Campaign created', {
      campaignId: campaign._id,
      userId,
      agentId,
      name
    });

    return campaign;
  }

  /**
   * Get campaign by ID
   */
  async getCampaign(campaignId: string, userId: string): Promise<ICampaign | null> {
    const campaign = await Campaign.findOne({ _id: campaignId, userId })
      .populate('agentId', 'name description config.voice')
      .populate('phoneId', 'number provider');

    return campaign;
  }

  /**
   * Get all campaigns for a user
   */
  async getCampaigns(
    userId: string,
    filters?: {
      status?: string[];
      agentId?: string;
      search?: string;
    },
    pagination?: {
      page: number;
      limit: number;
    }
  ): Promise<{ campaigns: ICampaign[]; total: number; page: number; pages: number }> {
    const query: any = { userId };

    if (filters?.status && filters.status.length > 0) {
      query.status = { $in: filters.status };
    }

    if (filters?.agentId) {
      query.agentId = filters.agentId;
    }

    if (filters?.search) {
      query.$or = [
        { name: { $regex: filters.search, $options: 'i' } },
        { description: { $regex: filters.search, $options: 'i' } }
      ];
    }

    const page = pagination?.page || 1;
    const limit = pagination?.limit || 20;
    const skip = (page - 1) * limit;

    const [campaigns, total] = await Promise.all([
      Campaign.find(query)
        .populate('agentId', 'name')
        .populate('phoneId', 'number')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Campaign.countDocuments(query)
    ]);

    return {
      campaigns: campaigns as unknown as ICampaign[],
      total,
      page,
      pages: Math.ceil(total / limit)
    };
  }

  /**
   * Update campaign
   */
  async updateCampaign(
    campaignId: string,
    userId: string,
    updates: UpdateCampaignParams
  ): Promise<ICampaign | null> {
    const campaign = await Campaign.findOne({ _id: campaignId, userId });

    if (!campaign) {
      throw new Error('Campaign not found');
    }

    // Can't update active or completed campaigns' core settings
    if (campaign.status === 'active' || campaign.status === 'completed') {
      throw new Error('Cannot update active or completed campaign');
    }

    if (updates.name) campaign.name = updates.name;
    if (updates.description !== undefined) campaign.description = updates.description;
    if (updates.scheduledFor) campaign.scheduledFor = updates.scheduledFor;
    if (updates.metadata) campaign.metadata = { ...campaign.metadata, ...updates.metadata };

    if (updates.settings) {
      campaign.settings = { ...campaign.settings, ...updates.settings };
    }

    await campaign.save();

    logger.info('Campaign updated', { campaignId, userId });

    return campaign;
  }

  /**
   * Delete campaign
   */
  async deleteCampaign(campaignId: string, userId: string): Promise<void> {
    const campaign = await Campaign.findOne({ _id: campaignId, userId });

    if (!campaign) {
      throw new Error('Campaign not found');
    }

    // Can't delete active campaigns
    if (campaign.status === 'active') {
      throw new Error('Cannot delete active campaign. Pause or cancel it first.');
    }

    // Delete all contacts
    await CampaignContact.deleteMany({ campaignId });

    // Delete campaign
    await campaign.deleteOne();

    logger.info('Campaign deleted', { campaignId, userId });
  }

  /**
   * Add contacts to campaign
   */
  async addContacts(params: AddContactsParams): Promise<{
    added: number;
    duplicates: number;
    errors: number;
  }> {
    const { campaignId, userId, contacts } = params;

    const campaign = await Campaign.findOne({ _id: campaignId, userId });

    if (!campaign) {
      throw new Error('Campaign not found');
    }

    // Can't add contacts to completed or cancelled campaigns
    if (campaign.status === 'completed' || campaign.status === 'cancelled') {
      throw new Error('Cannot add contacts to completed or cancelled campaign');
    }

    let added = 0;
    let duplicates = 0;
    let errors = 0;

    for (const contact of contacts) {
      try {
        // Check for duplicate
        const existing = await CampaignContact.findOne({
          campaignId,
          phoneNumber: contact.phoneNumber
        });

        if (existing) {
          duplicates++;
          continue;
        }

        // Create contact
        await CampaignContact.create({
          campaignId,
          userId,
          phoneNumber: contact.phoneNumber,
          name: contact.name,
          email: contact.email,
          customData: contact.customData,
          priority: contact.priority || 0,
          scheduledFor: contact.scheduledFor,
          status: 'pending'
        });

        added++;
      } catch (error: any) {
        logger.error('Error adding contact to campaign', {
          campaignId,
          phoneNumber: contact.phoneNumber,
          error: error.message
        });
        errors++;
      }
    }

    // Update campaign total contacts
    await Campaign.findByIdAndUpdate(campaignId, {
      $inc: { totalContacts: added, queuedCalls: added }
    });

    logger.info('Contacts added to campaign', {
      campaignId,
      added,
      duplicates,
      errors
    });

    return { added, duplicates, errors };
  }

  /**
   * Get campaign contacts
   */
  async getCampaignContacts(
    campaignId: string,
    userId: string,
    filters?: {
      status?: string[];
    },
    pagination?: {
      page: number;
      limit: number;
    }
  ): Promise<{ contacts: ICampaignContact[]; total: number; page: number; pages: number }> {
    const campaign = await Campaign.findOne({ _id: campaignId, userId });

    if (!campaign) {
      throw new Error('Campaign not found');
    }

    const query: any = { campaignId };

    if (filters?.status && filters.status.length > 0) {
      query.status = { $in: filters.status };
    }

    const page = pagination?.page || 1;
    const limit = pagination?.limit || 50;
    const skip = (page - 1) * limit;

    const [contacts, total] = await Promise.all([
      CampaignContact.find(query)
        .populate('callLogId')
        .sort({ priority: -1, createdAt: 1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      CampaignContact.countDocuments(query)
    ]);

    return {
      contacts: contacts as unknown as ICampaignContact[],
      total,
      page,
      pages: Math.ceil(total / limit)
    };
  }

  /**
   * Get campaign call logs
   */
  async getCampaignCallLogs(
    campaignId: string,
    userId: string,
    pagination?: {
      page: number;
      limit: number;
    }
  ) {
    const campaign = await Campaign.findOne({ _id: campaignId, userId });

    if (!campaign) {
      throw new Error('Campaign not found');
    }

    const page = pagination?.page || 1;
    const limit = pagination?.limit || 50;
    const skip = (page - 1) * limit;

    const [callLogs, total] = await Promise.all([
      CallLog.find({ 'metadata.campaignId': campaignId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      CallLog.countDocuments({ 'metadata.campaignId': campaignId })
    ]);

    return {
      callLogs,
      total,
      page,
      pages: Math.ceil(total / limit)
    };
  }

  /**
   * Get campaign statistics
   */
  async getCampaignStats(campaignId: string, userId: string) {
    const campaign = await Campaign.findOne({ _id: campaignId, userId });

    if (!campaign) {
      throw new Error('Campaign not found');
    }

    // Get contact status breakdown
    const contactStats = await CampaignContact.aggregate([
      { $match: { campaignId: new mongoose.Types.ObjectId(campaignId) } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    const statusCounts: Record<string, number> = {};
    contactStats.forEach(stat => {
      statusCounts[stat._id] = stat.count;
    });

    // Get call outcome stats
    const callStats = await CallLog.aggregate([
      { $match: { 'metadata.campaignId': campaignId } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          totalDuration: { $sum: '$duration' }
        }
      }
    ]);

    const callStatusCounts: Record<string, number> = {};
    let totalCallDuration = 0;
    callStats.forEach(stat => {
      callStatusCounts[stat._id] = stat.count;
      totalCallDuration += stat.totalDuration || 0;
    });

    return {
      campaign: {
        id: campaign._id,
        name: campaign.name,
        status: campaign.status,
        totalContacts: campaign.totalContacts,
        queuedCalls: campaign.queuedCalls,
        activeCalls: campaign.activeCalls,
        completedCalls: campaign.completedCalls,
        failedCalls: campaign.failedCalls,
        voicemailCalls: campaign.voicemailCalls,
        progress: campaign.progress,
        successRate: campaign.successRate,
        scheduledFor: campaign.scheduledFor,
        startedAt: campaign.startedAt,
        completedAt: campaign.completedAt
      },
      contactStatus: statusCounts,
      callStatus: callStatusCounts,
      totalCallDuration,
      avgCallDuration: campaign.completedCalls > 0 ? Math.round(totalCallDuration / campaign.completedCalls) : 0
    };
  }
}

export const campaignService = new CampaignService();
