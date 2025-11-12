/**
 * Call Scheduler Service
 * Handles scheduling of outbound calls with business hours and timezone support
 */

import moment from 'moment-timezone';
import { ScheduledCall } from '../models/ScheduledCall';
import { addScheduledCallJob, cancelScheduledCallJob } from '../queues/scheduledCalls.queue';
import logger from '../utils/logger';

export interface ScheduleCallParams {
  phoneNumber: string;
  phoneId: string;      // User's phone record (contains Exotel credentials & appId)
  agentId: string;
  userId: string;
  scheduledFor: Date;
  timezone?: string;
  respectBusinessHours?: boolean;
  businessHours?: {
    start: string;  // HH:mm format (e.g., "09:00")
    end: string;    // HH:mm format (e.g., "18:00")
    timezone?: string;
    daysOfWeek?: number[]; // 0 = Sunday, 6 = Saturday
  };
  recurring?: {
    frequency: 'daily' | 'weekly' | 'monthly';
    interval: number;
    endDate?: Date;
    maxOccurrences?: number;
  };
  metadata?: Record<string, any>;
  priority?: 'low' | 'medium' | 'high';
}

export class CallSchedulerService {
  private readonly DEFAULT_TIMEZONE = process.env.DEFAULT_TIMEZONE || 'Asia/Kolkata';
  private readonly DEFAULT_BUSINESS_HOURS_START = process.env.DEFAULT_BUSINESS_HOURS_START || '09:00';
  private readonly DEFAULT_BUSINESS_HOURS_END = process.env.DEFAULT_BUSINESS_HOURS_END || '18:00';

  /**
   * Schedule a call
   */
  async scheduleCall(params: ScheduleCallParams): Promise<string> {
    logger.info('Scheduling call', {
      phoneNumber: params.phoneNumber,
      scheduledFor: params.scheduledFor,
      timezone: params.timezone,
      recurring: params.recurring
    });

    // Validate timezone
    const timezone = params.timezone || this.DEFAULT_TIMEZONE;
    if (!this.isValidTimezone(timezone)) {
      throw new Error(`Invalid timezone: ${timezone}`);
    }

    // Get business hours (use params or defaults)
    const businessHours = params.respectBusinessHours !== false ? {
      start: params.businessHours?.start || this.DEFAULT_BUSINESS_HOURS_START,
      end: params.businessHours?.end || this.DEFAULT_BUSINESS_HOURS_END,
      timezone: params.businessHours?.timezone || timezone,
      daysOfWeek: params.businessHours?.daysOfWeek || [1, 2, 3, 4, 5] // Mon-Fri by default
    } : undefined;

    // Adjust scheduled time if respecting business hours
    let finalScheduledTime = params.scheduledFor;
    if (params.respectBusinessHours !== false && businessHours) {
      finalScheduledTime = this.adjustToBusinessHours(
        params.scheduledFor,
        businessHours
      );
    }

    // Validate scheduled time is in the future
    if (finalScheduledTime <= new Date()) {
      throw new Error('Scheduled time must be in the future');
    }

    // Create scheduled call record
    const scheduledCall = await ScheduledCall.create({
      phoneNumber: params.phoneNumber,
      phoneId: params.phoneId,
      agentId: params.agentId,
      userId: params.userId,
      scheduledFor: finalScheduledTime,
      timezone,
      status: 'pending',
      respectBusinessHours: params.respectBusinessHours !== false,
      businessHours,
      recurring: params.recurring ? {
        frequency: params.recurring.frequency,
        interval: params.recurring.interval,
        endDate: params.recurring.endDate,
        maxOccurrences: params.recurring.maxOccurrences,
        currentOccurrence: 1
      } : undefined,
      metadata: params.metadata || {}
    });

    const scheduledCallId = scheduledCall._id.toString();

    // Add job to queue
    const priority = this.getPriorityNumber(params.priority);

    try {
      const job = await addScheduledCallJob(
        {
          scheduledCallId,
          phoneNumber: params.phoneNumber,
          phoneId: params.phoneId,
          agentId: params.agentId,
          userId: params.userId,
          metadata: params.metadata,
          priority: params.priority,
          isRecurring: !!params.recurring
        },
        finalScheduledTime,
        {
          priority,
          jobId: scheduledCallId
        }
      );

      // Update scheduled call with job ID
      scheduledCall.metadata = {
        ...scheduledCall.metadata,
        jobId: job.id
      };
      await scheduledCall.save();

      logger.info('Call scheduled successfully', {
        scheduledCallId,
        jobId: job.id,
        scheduledFor: finalScheduledTime,
        isRecurring: !!params.recurring
      });

      return scheduledCallId;
    } catch (error: any) {
      // Clean up scheduled call if queue job creation failed
      await ScheduledCall.findByIdAndDelete(scheduledCallId);

      logger.error('Failed to add job to queue', {
        scheduledCallId,
        error: error.message
      });

      throw error;
    }
  }

  /**
   * Cancel a scheduled call
   */
  async cancelScheduledCall(scheduledCallId: string, userId: string): Promise<void> {
    const scheduledCall = await ScheduledCall.findOne({
      _id: scheduledCallId,
      userId
    });

    if (!scheduledCall) {
      throw new Error('Scheduled call not found');
    }

    if (!scheduledCall.canCancel) {
      throw new Error(`Cannot cancel call with status: ${scheduledCall.status}`);
    }

    // Cancel the queue job
    const jobId = scheduledCall.metadata?.jobId || scheduledCallId;
    try {
      await cancelScheduledCallJob(jobId);
    } catch (error: any) {
      logger.warn('Failed to cancel queue job', {
        scheduledCallId,
        jobId,
        error: error.message
      });
    }

    // Update scheduled call status
    scheduledCall.status = 'cancelled';
    scheduledCall.processedAt = new Date();
    await scheduledCall.save();

    logger.info('Scheduled call cancelled', {
      scheduledCallId,
      jobId
    });
  }

  /**
   * Reschedule a call
   */
  async rescheduleCall(
    scheduledCallId: string,
    userId: string,
    newScheduledTime: Date
  ): Promise<void> {
    const scheduledCall = await ScheduledCall.findOne({
      _id: scheduledCallId,
      userId
    });

    if (!scheduledCall) {
      throw new Error('Scheduled call not found');
    }

    if (!scheduledCall.canCancel) {
      throw new Error(`Cannot reschedule call with status: ${scheduledCall.status}`);
    }

    // Adjust to business hours if needed
    let finalScheduledTime = newScheduledTime;
    if (scheduledCall.respectBusinessHours && scheduledCall.businessHours) {
      finalScheduledTime = this.adjustToBusinessHours(
        newScheduledTime,
        scheduledCall.businessHours
      );
    }

    // Validate new time is in the future
    if (finalScheduledTime <= new Date()) {
      throw new Error('New scheduled time must be in the future');
    }

    // Cancel old job
    const oldJobId = scheduledCall.metadata?.jobId || scheduledCallId;
    try {
      await cancelScheduledCallJob(oldJobId);
    } catch (error) {
      logger.warn('Failed to cancel old queue job', { oldJobId });
    }

    // Create new job
    const priority = this.getPriorityNumber(scheduledCall.metadata?.priority);
    const newJob = await addScheduledCallJob(
      {
        scheduledCallId,
        phoneNumber: scheduledCall.phoneNumber,
        phoneId: scheduledCall.phoneId?.toString() || '',
        agentId: scheduledCall.agentId.toString(),
        userId: scheduledCall.userId.toString(),
        metadata: scheduledCall.metadata,
        isRecurring: !!scheduledCall.recurring
      },
      finalScheduledTime,
      { priority }
    );

    // Update scheduled call
    scheduledCall.scheduledFor = finalScheduledTime;
    scheduledCall.metadata = {
      ...scheduledCall.metadata,
      jobId: newJob.id,
      rescheduledAt: new Date()
    };
    await scheduledCall.save();

    logger.info('Scheduled call rescheduled', {
      scheduledCallId,
      oldTime: scheduledCall.scheduledFor,
      newTime: finalScheduledTime,
      newJobId: newJob.id
    });
  }

  /**
   * Get scheduled calls for a user
   */
  async getScheduledCalls(
    userId: string,
    filters?: {
      status?: string;
      startDate?: Date;
      endDate?: Date;
      agentId?: string;
    }
  ) {
    const query: any = { userId };

    if (filters?.status) {
      query.status = filters.status;
    }

    if (filters?.agentId) {
      query.agentId = filters.agentId;
    }

    if (filters?.startDate || filters?.endDate) {
      query.scheduledFor = {};
      if (filters.startDate) {
        query.scheduledFor.$gte = filters.startDate;
      }
      if (filters.endDate) {
        query.scheduledFor.$lte = filters.endDate;
      }
    }

    const scheduledCalls = await ScheduledCall.find(query)
      .populate('agentId', 'name config.greetingMessage')
      .sort({ scheduledFor: 1 });

    return scheduledCalls;
  }

  /**
   * Adjust scheduled time to fall within business hours
   */
  private adjustToBusinessHours(
    scheduledTime: Date,
    businessHours: {
      start: string;
      end: string;
      timezone?: string;
      daysOfWeek?: number[];
    }
  ): Date {
    const timezone = businessHours.timezone || this.DEFAULT_TIMEZONE;
    let adjustedTime = moment.tz(scheduledTime, timezone);

    // Parse business hours
    const [startHour, startMinute] = businessHours.start.split(':').map(Number);
    const [endHour, endMinute] = businessHours.end.split(':').map(Number);

    // Check if it's a valid business day
    const allowedDays = businessHours.daysOfWeek || [1, 2, 3, 4, 5]; // Mon-Fri
    while (!allowedDays.includes(adjustedTime.day())) {
      // Move to next day
      adjustedTime.add(1, 'day').startOf('day');
    }

    // Check if time is before business hours
    const dayStart = adjustedTime.clone().hour(startHour).minute(startMinute).second(0);
    if (adjustedTime.isBefore(dayStart)) {
      adjustedTime = dayStart;
    }

    // Check if time is after business hours
    const dayEnd = adjustedTime.clone().hour(endHour).minute(endMinute).second(0);
    if (adjustedTime.isAfter(dayEnd)) {
      // Move to next business day start
      adjustedTime.add(1, 'day').hour(startHour).minute(startMinute).second(0);

      // Ensure next day is also a business day
      while (!allowedDays.includes(adjustedTime.day())) {
        adjustedTime.add(1, 'day');
      }
    }

    return adjustedTime.toDate();
  }

  /**
   * Validate timezone string
   */
  private isValidTimezone(timezone: string): boolean {
    return moment.tz.zone(timezone) !== null;
  }

  /**
   * Convert priority string to number for Bull queue
   */
  private getPriorityNumber(priority?: 'low' | 'medium' | 'high'): number {
    const priorityMap = {
      'low': 10,
      'medium': 5,
      'high': 1
    };

    return priorityMap[priority || 'medium'];
  }

  /**
   * Get service statistics
   */
  async getStats() {
    const [total, pending, processing, completed, failed, cancelled] = await Promise.all([
      ScheduledCall.countDocuments(),
      ScheduledCall.countDocuments({ status: 'pending' }),
      ScheduledCall.countDocuments({ status: 'processing' }),
      ScheduledCall.countDocuments({ status: 'completed' }),
      ScheduledCall.countDocuments({ status: 'failed' }),
      ScheduledCall.countDocuments({ status: 'cancelled' })
    ]);

    const upcomingCalls = await ScheduledCall.countDocuments({
      status: 'pending',
      scheduledFor: { $gte: new Date() }
    });

    return {
      total,
      pending,
      processing,
      completed,
      failed,
      cancelled,
      upcomingCalls
    };
  }
}

// Export singleton instance
export const callSchedulerService = new CallSchedulerService();
