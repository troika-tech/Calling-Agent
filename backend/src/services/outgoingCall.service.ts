import { v4 as uuidv4 } from 'uuid';
import { CallLog } from '../models/CallLog';
import { Phone } from '../models/Phone';
import { Campaign } from '../models/Campaign';
import { exotelOutboundService, ExotelCallParams } from './exotelOutbound.service';
import { phoneService } from './phone.service';
import { redisConcurrencyTracker } from '../utils/redisConcurrency.util';
import { redis as redisClient } from '../config/redis';
import logger from '../utils/logger';
import mongoose from 'mongoose';

export interface OutgoingCallParams {
  phoneNumber: string;  // Destination number to call
  phoneId: string;      // User's phone record (contains Exotel credentials and appId)
  agentId: string;
  userId: string;
  campaignId?: string;  // Optional campaign ID for concurrent limit enforcement
  skipSlotAcquisition?: boolean;  // Skip slot acquisition if already acquired by caller
  metadata?: Record<string, any>;
  priority?: 'low' | 'medium' | 'high';
  callLogId?: string;  // For retries
}

export interface CallStatus {
  callLogId: string;
  status: string;
  outboundStatus?: string;
  phoneNumber: string;
  startedAt?: Date;
  duration?: number;
}

/**
 * Outgoing Call Service
 * Handles initiating and managing outbound calls
 */
export class OutgoingCallService {
  private readonly maxConcurrentCalls: number;
  private activeCalls: Map<string, Date>; // Kept for backward compatibility
  private readonly GLOBAL_ACTIVE_CALLS_KEY = 'system:outbound:active';

  constructor() {
    this.maxConcurrentCalls = parseInt(process.env.MAX_CONCURRENT_OUTBOUND_CALLS || '10');
    this.activeCalls = new Map();

    logger.info('OutgoingCallService initialized', {
      maxConcurrentCalls: this.maxConcurrentCalls
    });
  }

  /**
   * Validate phone number (E.164 format)
   */
  private validatePhoneNumber(phoneNumber: string): boolean {
    const e164Regex = /^\+[1-9]\d{1,14}$/;
    return e164Regex.test(phoneNumber);
  }

  /**
   * Check if can initiate new call (cluster-wide concurrency limit)
   * Uses Redis SET to track active calls across all instances
   */
  async canInitiateCall(): Promise<boolean> {
    // Clean up stale entries (calls older than 1 hour) from Redis
    const oneHourAgo = Date.now() - 3600000;
    const allMembers = await redisClient.sMembers(this.GLOBAL_ACTIVE_CALLS_KEY);

    for (const member of allMembers) {
      const [callId, timestamp] = member.split(':');
      if (parseInt(timestamp) < oneHourAgo) {
        await redisClient.sRem(this.GLOBAL_ACTIVE_CALLS_KEY, member);
      }
    }

    // Get current cluster-wide count
    const activeCount = await redisClient.sCard(this.GLOBAL_ACTIVE_CALLS_KEY);
    return activeCount < this.maxConcurrentCalls;
  }

  /**
   * Get active calls count (cluster-wide)
   */
  async getActiveCalls(): Promise<number> {
    return await redisClient.sCard(this.GLOBAL_ACTIVE_CALLS_KEY);
  }

  /**
   * Initiate an outbound call
   */
  async initiateCall(params: OutgoingCallParams): Promise<string> {
    logger.info('Initiating outbound call', {
      phoneNumber: params.phoneNumber,
      phoneId: params.phoneId,
      agentId: params.agentId
    });

    // Validate phone number
    if (!this.validatePhoneNumber(params.phoneNumber)) {
      throw new Error('Invalid phone number format. Please use E.164 format (e.g., +919876543210)');
    }

    // Get phone configuration (contains Exotel credentials and appId)
    const phone = await Phone.findById(params.phoneId).populate('agentId');
    if (!phone) {
      throw new Error('Phone not found');
    }

    // Verify phone belongs to user
    if (phone.userId.toString() !== params.userId) {
      throw new Error('Unauthorized: Phone does not belong to user');
    }

    // Check if phone has Exotel configuration
    if (!phone.exotelData) {
      throw new Error('Phone does not have Exotel configuration. Please configure Exotel credentials for this phone.');
    }

    // Verify appId is configured
    if (!phone.exotelData.appId) {
      throw new Error('Phone does not have Exotel App ID configured. Please add App ID to this phone.');
    }

    // Get decrypted credentials
    const exotelCreds = await phoneService.getExotelCredentials(params.phoneId, params.userId);
    if (!exotelCreds) {
      throw new Error('Failed to retrieve Exotel credentials');
    }

    // Verify agent exists
    const Agent = mongoose.model('Agent');
    const agent = await Agent.findById(params.agentId);
    if (!agent) {
      throw new Error('Agent not found');
    }

    // Check concurrent limit based on campaign settings
    let concurrentLimit = this.maxConcurrentCalls; // Default to system-wide limit
    let trackingKey = 'system'; // Default tracking key

    // Skip slot acquisition if already acquired by caller (e.g., campaign processor)
    if (!params.skipSlotAcquisition) {
      if (params.campaignId) {
        // If campaignId is provided, use campaign's concurrent limit
        const campaign = await Campaign.findById(params.campaignId);
        if (campaign) {
          concurrentLimit = campaign.settings.concurrentCallsLimit;
          trackingKey = params.campaignId;

          logger.info('📊 Campaign concurrent limit check', {
            campaignId: params.campaignId,
            concurrentLimit,
            activeCalls: await redisConcurrencyTracker.getActiveCalls(trackingKey),
            phoneNumber: params.phoneNumber
          });

          // Try to acquire slot using Redis-based concurrency tracker
          const slotAcquired = await redisConcurrencyTracker.acquireSlot(trackingKey, concurrentLimit);
          if (!slotAcquired) {
            const activeCalls = await redisConcurrencyTracker.getActiveCalls(trackingKey);
            logger.warn('❌ Campaign concurrent limit reached', {
              campaignId: params.campaignId,
              activeCalls,
              concurrentLimit,
              phoneNumber: params.phoneNumber
            });
            throw new Error(`Campaign concurrent call limit reached (${activeCalls}/${concurrentLimit}). Please wait for active calls to complete.`);
          }

          logger.info('✅ Slot acquired for campaign call', {
            campaignId: params.campaignId,
            activeCalls: await redisConcurrencyTracker.getActiveCalls(trackingKey),
            concurrentLimit
          });
        } else {
          logger.warn('Campaign not found, using system-wide limit', { campaignId: params.campaignId });
          // Fallback to system-wide check
          if (!await this.canInitiateCall()) {
            throw new Error('Maximum concurrent calls reached. Please try again in a few minutes.');
          }
        }
      } else {
        // No campaign specified, use system-wide limit
        if (!await this.canInitiateCall()) {
          throw new Error('Maximum concurrent calls reached. Please try again in a few minutes.');
        }
      }
    } else {
      // Slot already acquired by caller, just set the tracking key
      if (params.campaignId) {
        trackingKey = params.campaignId;
        logger.info('🔄 Using pre-acquired slot for campaign call', {
          campaignId: params.campaignId,
          phoneNumber: params.phoneNumber
        });
      }
    }

    // Check if this is a retry
    let callLog;
    if (params.callLogId) {
      // Retry: Update existing CallLog
      callLog = await CallLog.findById(params.callLogId);
      if (!callLog) {
        throw new Error('Original call log not found for retry');
      }

      // Check if call should NOT be retried (voicemail detected)
      if (callLog.failureReason === 'voicemail' || callLog.outboundStatus === 'voicemail') {
        throw new Error('Cannot retry voicemail-detected calls. The call reached a voicemail system.');
      }

      // Check metadata for voicemail detection
      if (callLog.metadata?.voicemailDetected === true) {
        throw new Error('Cannot retry voicemail-detected calls. Voicemail was detected with ' +
          (callLog.metadata.voicemailConfidence * 100).toFixed(0) + '% confidence.');
      }

      // Create new CallLog for retry attempt
      callLog = await CallLog.create({
        sessionId: uuidv4(),
        userId: params.userId,
        phoneId: params.phoneId,
        agentId: params.agentId,
        fromPhone: phone.number,
        toPhone: params.phoneNumber,
        direction: 'outbound',
        status: 'initiated',
        retryOf: params.callLogId,
        retryCount: (callLog.retryCount || 0) + 1,
        initiatedAt: new Date(),
        metadata: params.metadata || {}
      });
    } else {
      // New call: Create CallLog
      callLog = await CallLog.create({
        sessionId: uuidv4(),
        userId: params.userId,
        phoneId: params.phoneId,
        agentId: params.agentId,
        campaignId: params.campaignId || undefined,  // Store campaignId if provided
        fromPhone: phone.number,
        toPhone: params.phoneNumber,
        direction: 'outbound',
        status: 'initiated',
        retryCount: 0,
        initiatedAt: new Date(),
        metadata: {
          ...(params.metadata || {}),
          concurrencyTrackingKey: trackingKey  // Store tracking key for slot release
        }
      });
    }

    const callLogId = callLog._id.toString();

    try {
      // Prepare Exotel API parameters using phone-specific configuration
      const exotelParams: ExotelCallParams = {
        from: phone.number,
        to: params.phoneNumber,
        callerId: phone.number,
        appId: exotelCreds.appId!,  // Use phone-specific App ID
        customField: callLogId,  // Pass callLogId for webhook
        credentials: {  // Pass phone-specific credentials
          apiKey: exotelCreds.apiKey,
          apiToken: exotelCreds.apiToken,
          sid: exotelCreds.sid,
          subdomain: exotelCreds.subdomain
        }
      };

      // Call Exotel API with phone-specific credentials
      const response = await exotelOutboundService.makeCall(exotelParams);

      // Update CallLog with Exotel SID
      await CallLog.findByIdAndUpdate(callLogId, {
        exotelCallSid: response.sid,
        outboundStatus: 'queued',
        status: 'ringing'
      });

      // Track active call (cluster-wide via Redis + local for backward compat)
      this.activeCalls.set(callLogId, new Date());

      // Add to cluster-wide tracking
      const member = `${callLogId}:${Date.now()}`;
      await redisClient.sAdd(this.GLOBAL_ACTIVE_CALLS_KEY, member);
      await redisClient.expire(this.GLOBAL_ACTIVE_CALLS_KEY, 3600); // 1 hour TTL

      logger.info('Outbound call initiated successfully', {
        callLogId,
        exotelCallSid: response.sid,
        phoneNumber: params.phoneNumber,
        phoneId: params.phoneId
      });

      return callLogId;
    } catch (error: any) {
      // Release the slot if call initiation failed (only if we acquired it)
      // TODO: Update to new two-phase API: releaseSlot(campaignId, callId, token)
      // Commenting out for now - campaign calls now use campaignCallsProcessor
      // if (!params.skipSlotAcquisition && params.campaignId && trackingKey !== 'system') {
      //   await redisConcurrencyTracker.releaseSlot(trackingKey);
      //   logger.info('🔓 Released concurrent slot due to call initiation failure', {
      //     campaignId: params.campaignId,
      //     trackingKey,
      //     error: error.message
      //   });
      // }

      // Update CallLog as failed
      await CallLog.findByIdAndUpdate(callLogId, {
        status: 'failed',
        error: {
          code: 'EXOTEL_API_ERROR',
          message: error.message
        }
      });

      logger.error('Failed to initiate outbound call', {
        callLogId,
        error: error.message
      });

      throw error;
    }
  }

  /**
   * Get call status
   */
  async getCallStatus(callLogId: string): Promise<CallStatus> {
    const callLog = await CallLog.findById(callLogId);

    if (!callLog) {
      throw new Error('Call not found');
    }

    return {
      callLogId: callLog._id.toString(),
      status: callLog.status,
      outboundStatus: callLog.outboundStatus,
      phoneNumber: callLog.toPhone,
      startedAt: callLog.startedAt,
      duration: callLog.durationSec
    };
  }

  /**
   * Cancel a call (scheduled or in-progress)
   */
  async cancelCall(callLogId: string): Promise<void> {
    const callLog = await CallLog.findById(callLogId);

    if (!callLog) {
      throw new Error('Call not found');
    }

    // Check if can be cancelled
    if (!['initiated', 'ringing'].includes(callLog.status)) {
      throw new Error(`Cannot cancel call with status: ${callLog.status}`);
    }

    // If call has Exotel SID, try to hangup
    if (callLog.exotelCallSid) {
      try {
        await exotelOutboundService.hangupCall(callLog.exotelCallSid);
      } catch (error) {
        logger.error('Failed to hangup call via Exotel', {
          callLogId,
          error
        });
      }
    }

    // Update CallLog
    await CallLog.findByIdAndUpdate(callLogId, {
      status: 'canceled',
      failureReason: 'cancelled',
      endedAt: new Date()
    });

    // Remove from active calls
    this.activeCalls.delete(callLogId);

    logger.info('Call cancelled', { callLogId });
  }

  /**
   * Bulk initiate calls
   */
  async bulkInitiateCalls(calls: OutgoingCallParams[]): Promise<string[]> {
    logger.info('Bulk initiating calls', { count: calls.length });

    if (calls.length > 1000) {
      throw new Error('Maximum 1000 calls per batch');
    }

    const callLogIds: string[] = [];
    const errors: Array<{ index: number; error: string }> = [];

    for (let i = 0; i < calls.length; i++) {
      try {
        const callLogId = await this.initiateCall(calls[i]);
        callLogIds.push(callLogId);
      } catch (error: any) {
        errors.push({ index: i, error: error.message });
        logger.error('Failed to initiate call in batch', {
          index: i,
          phoneNumber: calls[i].phoneNumber,
          error: error.message
        });

        // Check if it's a concurrency limit error - apply exponential backoff
        if (error.message?.includes('concurrent') || error.message?.includes('limit reached')) {
          const backoffMs = Math.min(5000, 1000 * Math.pow(2, Math.min(i, 5))); // Max 5s backoff
          logger.warn('Concurrency limit hit, applying backoff', {
            index: i,
            backoffMs
          });
          await new Promise(resolve => setTimeout(resolve, backoffMs));
        }
      } finally {
        // CRITICAL: Always throttle between calls, even on error
        // This prevents hammering the carrier when limits are hit
        if (i < calls.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000)); // 1 second delay
        }
      }
    }

    if (errors.length > 0) {
      logger.warn('Bulk call initiation completed with errors', {
        total: calls.length,
        successful: callLogIds.length,
        failed: errors.length
      });
    }

    return callLogIds;
  }

  /**
   * Mark call as ended (called by webhook handler)
   */
  async markCallEnded(callLogId: string): Promise<void> {
    // Remove from local tracking
    this.activeCalls.delete(callLogId);

    // Remove from cluster-wide tracking (scan for matching member)
    const allMembers = await redisClient.sMembers(this.GLOBAL_ACTIVE_CALLS_KEY);
    for (const member of allMembers) {
      if (member.startsWith(`${callLogId}:`)) {
        await redisClient.sRem(this.GLOBAL_ACTIVE_CALLS_KEY, member);
        break;
      }
    }
  }

  /**
   * Get failed calls that can be retried (excludes voicemail)
   */
  async getRetriableCalls(userId: string, options?: {
    limit?: number;
    agentId?: string;
    phoneId?: string;
  }): Promise<any[]> {
    const query: any = {
      userId: new mongoose.Types.ObjectId(userId),
      direction: 'outbound',
      status: { $in: ['failed', 'no-answer', 'busy'] },
      // Exclude voicemail-detected calls
      failureReason: { $ne: 'voicemail' },
      outboundStatus: { $ne: 'voicemail' },
      'metadata.voicemailDetected': { $ne: true }
    };

    if (options?.agentId) {
      query.agentId = new mongoose.Types.ObjectId(options.agentId);
    }

    if (options?.phoneId) {
      query.phoneId = new mongoose.Types.ObjectId(options.phoneId);
    }

    const calls = await CallLog.find(query)
      .sort({ createdAt: -1 })
      .limit(options?.limit || 100)
      .lean();

    logger.info('Retrieved retriable calls', {
      userId,
      count: calls.length,
      filters: options
    });

    return calls;
  }

  /**
   * Get service stats
   */
  async getStats() {
    return {
      activeCalls: this.activeCalls.size,
      maxConcurrentCalls: this.maxConcurrentCalls,
      utilization: (this.activeCalls.size / this.maxConcurrentCalls) * 100,
      circuitBreaker: exotelOutboundService.getCircuitBreakerState(),
      rateLimiter: await exotelOutboundService.getRateLimiterStats()
    };
  }
}

// Export singleton instance
export const outgoingCallService = new OutgoingCallService();
