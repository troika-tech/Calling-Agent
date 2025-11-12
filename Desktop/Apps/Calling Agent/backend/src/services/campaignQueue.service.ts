/**
 * Campaign Queue Service
 * Handles queue operations for campaigns
 */

import { Campaign } from '../models/Campaign';
import { CampaignContact } from '../models/CampaignContact';
import { Agent } from '../models/Agent';
import {
  addCampaignCallJob,
  addBulkCampaignCallJobs,
  pauseCampaign,
  resumeCampaign,
  cancelCampaignJobs,
  getCampaignStats as getQueueCampaignStats
} from '../queues/campaignCalls.queue';
import logger from '../utils/logger';

export class CampaignQueueService {
  /**
   * Start a campaign by queuing all pending contacts
   */
  async startCampaign(campaignId: string, userId: string): Promise<void> {
    const campaign = await Campaign.findOne({ _id: campaignId, userId });

    if (!campaign) {
      throw new Error('Campaign not found');
    }

    // Check campaign status
    if (campaign.status === 'active') {
      throw new Error('Campaign is already active');
    }

    if (campaign.status === 'completed') {
      throw new Error('Cannot start completed campaign');
    }

    if (campaign.status === 'cancelled') {
      throw new Error('Cannot start cancelled campaign');
    }

    // Check if campaign has contacts
    if (campaign.totalContacts === 0) {
      throw new Error('Campaign has no contacts');
    }

    // Get agent
    const agent = await Agent.findById(campaign.agentId);
    if (!agent) {
      throw new Error('Agent not found');
    }

    // Get all pending contacts
    const contacts = await CampaignContact.find({
      campaignId,
      status: 'pending'
    }).sort({
      priority: -1,  // Higher priority first
      createdAt: 1   // FIFO for same priority
    });

    if (contacts.length === 0) {
      throw new Error('No pending contacts to process');
    }

    logger.info('Starting campaign', {
      campaignId,
      totalContacts: contacts.length,
      agentId: campaign.agentId
    });

    // Update campaign status
    campaign.status = 'active';
    campaign.startedAt = new Date();
    await campaign.save();

    // Initialize Redis concurrent limit for the campaign
    const { redis: redisClient } = await import('../config/redis');
    const limitKey = `campaign:{${campaignId}}:limit`;
    const concurrentLimit = campaign.settings.concurrentCallsLimit || 5;
    await redisClient.set(limitKey, concurrentLimit.toString());

    logger.info('Initialized campaign concurrent limit', {
      campaignId,
      concurrentLimit
    });

    // Queue all contacts in bulk
    const jobs = contacts.map(contact => ({
      data: {
        campaignId: campaignId,
        campaignContactId: contact._id.toString(),
        agentId: campaign.agentId.toString(),
        phoneNumber: contact.phoneNumber,
        phoneId: campaign.phoneId?.toString(),
        userId: userId,
        name: contact.name,
        email: contact.email,
        customData: contact.customData,
        retryCount: contact.retryCount,
        isRetry: contact.retryCount > 0,
        priority: contact.priority,
        metadata: campaign.metadata
      },
      options: {
        priority: contact.priority
        // No delay specified - let addCampaignCallJob use default 24h delay
        // Jobs will be promoted by waitlist service when slots are available
      }
    }));

    // Add jobs in batches to avoid overwhelming the queue
    const batchSize = 100;
    for (let i = 0; i < jobs.length; i += batchSize) {
      const batch = jobs.slice(i, i + batchSize);
      await addBulkCampaignCallJobs(batch);
      logger.debug('Queued batch of contacts', {
        campaignId,
        batchNumber: Math.floor(i / batchSize) + 1,
        batchSize: batch.length
      });
    }

    // Update contact statuses
    await CampaignContact.updateMany(
      { campaignId, status: 'pending' },
      { status: 'queued' }
    );

    logger.info('Campaign started successfully', {
      campaignId,
      queuedContacts: contacts.length
    });
  }

  /**
   * Pause a campaign
   */
  async pauseCampaign(campaignId: string, userId: string): Promise<void> {
    const campaign = await Campaign.findOne({ _id: campaignId, userId });

    if (!campaign) {
      throw new Error('Campaign not found');
    }

    if (campaign.status !== 'active') {
      throw new Error('Campaign is not active');
    }

    logger.info('Pausing campaign', { campaignId });

    // Pause jobs in queue
    await pauseCampaign(campaignId);

    // Update campaign status
    campaign.status = 'paused';
    campaign.pausedAt = new Date();
    await campaign.save();

    logger.info('Campaign paused', { campaignId });
  }

  /**
   * Resume a paused campaign
   */
  async resumeCampaign(campaignId: string, userId: string): Promise<void> {
    const campaign = await Campaign.findOne({ _id: campaignId, userId });

    if (!campaign) {
      throw new Error('Campaign not found');
    }

    if (campaign.status !== 'paused') {
      throw new Error('Campaign is not paused');
    }

    logger.info('Resuming campaign', { campaignId });

    // Resume jobs in queue
    await resumeCampaign(campaignId);

    // Update campaign status
    campaign.status = 'active';
    await campaign.save();

    logger.info('Campaign resumed', { campaignId });
  }

  /**
   * Cancel a campaign
   */
  async cancelCampaign(campaignId: string, userId: string): Promise<void> {
    const campaign = await Campaign.findOne({ _id: campaignId, userId });

    if (!campaign) {
      throw new Error('Campaign not found');
    }

    if (campaign.status === 'completed') {
      throw new Error('Cannot cancel completed campaign');
    }

    if (campaign.status === 'cancelled') {
      throw new Error('Campaign is already cancelled');
    }

    logger.info('Cancelling campaign', { campaignId });

    // Cancel all jobs in queue
    const removedCount = await cancelCampaignJobs(campaignId);

    // Update campaign status
    campaign.status = 'cancelled';
    campaign.completedAt = new Date();
    await campaign.save();

    // Update pending/queued contacts to skipped
    await CampaignContact.updateMany(
      { campaignId, status: { $in: ['pending', 'queued'] } },
      { status: 'skipped' }
    );

    logger.info('Campaign cancelled', {
      campaignId,
      removedJobs: removedCount
    });
  }

  /**
   * Add more contacts to an active campaign
   */
  async addContactsToCampaign(
    campaignId: string,
    userId: string,
    contactIds: string[]
  ): Promise<void> {
    const campaign = await Campaign.findOne({ _id: campaignId, userId });

    if (!campaign) {
      throw new Error('Campaign not found');
    }

    if (campaign.status !== 'active') {
      throw new Error('Can only add contacts to active campaigns');
    }

    // Get contacts
    const contacts = await CampaignContact.find({
      _id: { $in: contactIds },
      campaignId,
      status: 'pending'
    });

    if (contacts.length === 0) {
      throw new Error('No pending contacts found');
    }

    logger.info('Adding contacts to active campaign', {
      campaignId,
      contactCount: contacts.length
    });

    // Queue contacts
    const jobs = contacts.map(contact => ({
      data: {
        campaignId: campaignId,
        campaignContactId: contact._id.toString(),
        agentId: campaign.agentId.toString(),
        phoneNumber: contact.phoneNumber,
        phoneId: campaign.phoneId?.toString(),
        userId: userId,
        name: contact.name,
        email: contact.email,
        customData: contact.customData,
        retryCount: contact.retryCount,
        isRetry: contact.retryCount > 0,
        priority: contact.priority,
        metadata: campaign.metadata
      },
      options: {
        priority: contact.priority
      }
    }));

    await addBulkCampaignCallJobs(jobs);

    // Update contact statuses
    await CampaignContact.updateMany(
      { _id: { $in: contactIds } },
      { status: 'queued' }
    );

    logger.info('Contacts added to campaign', {
      campaignId,
      addedCount: contacts.length
    });
  }

  /**
   * Retry failed contacts in a campaign
   */
  async retryFailedContacts(campaignId: string, userId: string): Promise<number> {
    const campaign = await Campaign.findOne({ _id: campaignId, userId });

    if (!campaign) {
      throw new Error('Campaign not found');
    }

    if (campaign.status !== 'active') {
      throw new Error('Campaign must be active to retry contacts');
    }

    // Get failed contacts that haven't exceeded retry limit
    const failedContacts = await CampaignContact.find({
      campaignId,
      status: 'failed',
      retryCount: { $lt: campaign.settings.maxRetryAttempts }
    });

    if (failedContacts.length === 0) {
      logger.info('No failed contacts to retry', { campaignId });
      return 0;
    }

    logger.info('Retrying failed contacts', {
      campaignId,
      count: failedContacts.length
    });

    // Queue contacts for retry
    const jobs = failedContacts.map(contact => ({
      data: {
        campaignId: campaignId,
        campaignContactId: contact._id.toString(),
        agentId: campaign.agentId.toString(),
        phoneNumber: contact.phoneNumber,
        phoneId: campaign.phoneId?.toString(),
        userId: userId,
        name: contact.name,
        email: contact.email,
        customData: contact.customData,
        retryCount: contact.retryCount + 1,
        isRetry: true,
        priority: contact.priority,
        metadata: campaign.metadata
      },
      options: {
        priority: contact.priority,
        delay: campaign.settings.retryDelayMinutes * 60 * 1000
      }
    }));

    await addBulkCampaignCallJobs(jobs);

    // Update contact statuses and retry count
    await CampaignContact.updateMany(
      { _id: { $in: failedContacts.map(c => c._id) } },
      {
        status: 'queued',
        $inc: { retryCount: 1 },
        nextRetryAt: new Date(Date.now() + campaign.settings.retryDelayMinutes * 60 * 1000)
      }
    );

    // Update campaign stats
    await Campaign.findByIdAndUpdate(campaignId, {
      $inc: {
        queuedCalls: failedContacts.length,
        failedCalls: -failedContacts.length
      }
    });

    logger.info('Failed contacts queued for retry', {
      campaignId,
      retriedCount: failedContacts.length
    });

    return failedContacts.length;
  }

  /**
   * Get real-time campaign progress from queue
   */
  async getCampaignProgress(campaignId: string, userId: string) {
    const campaign = await Campaign.findOne({ _id: campaignId, userId });

    if (!campaign) {
      throw new Error('Campaign not found');
    }

    // Get queue stats for this campaign
    const queueStats = await getQueueCampaignStats(campaignId);

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
        successRate: campaign.successRate
      },
      queue: queueStats
    };
  }
}

export const campaignQueueService = new CampaignQueueService();
