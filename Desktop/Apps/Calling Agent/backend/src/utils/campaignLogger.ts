/**
 * Focused logging utility for campaign concurrency monitoring
 * Only logs essential metrics for tracking bulk campaign performance
 */

import { logger } from './logger';

export interface ConcurrencyMetrics {
  campaignId: string;
  activeSlots: number;
  limit: number;
  waitlistSize?: number;
  queuedJobs?: number;
}

export interface SlotEvent {
  campaignId: string;
  callId: string;
  action: 'acquired' | 'released' | 'upgraded' | 'expired';
  slotType?: 'pre-dial' | 'active';
  duration?: number;
}

export interface QueueEvent {
  campaignId: string;
  jobId: string;
  action: 'promoted' | 'delayed' | 'completed' | 'failed';
  waitTime?: number;
}

class CampaignLogger {
  /**
   * Log concurrency snapshot - call this periodically to track campaign health
   */
  logConcurrencySnapshot(metrics: ConcurrencyMetrics) {
    const utilization = (metrics.activeSlots / metrics.limit) * 100;
    logger.info(`📊 [Campaign ${metrics.campaignId}] Concurrency: ${metrics.activeSlots}/${metrics.limit} (${utilization.toFixed(1)}%)`, {
      ...metrics,
      utilization: utilization.toFixed(1)
    });
  }

  /**
   * Log slot lifecycle events
   */
  logSlotEvent(event: SlotEvent) {
    const emoji = {
      acquired: '🔒',
      released: '🔓',
      upgraded: '⬆️',
      expired: '⏱️'
    }[event.action];

    logger.info(`${emoji} [Campaign ${event.campaignId}] Slot ${event.action}: ${event.callId}`, {
      ...event,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Log queue flow events
   */
  logQueueEvent(event: QueueEvent) {
    const emoji = {
      promoted: '🚀',
      delayed: '⏸️',
      completed: '✅',
      failed: '❌'
    }[event.action];

    logger.info(`${emoji} [Campaign ${event.campaignId}] Job ${event.action}: ${event.jobId}`, {
      ...event,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Log campaign summary - call this periodically or on demand
   */
  async logCampaignSummary(
    campaignId: string,
    stats: {
      totalCalls: number;
      completedCalls: number;
      failedCalls: number;
      avgCallDuration: number;
      currentActive: number;
      currentWaiting: number;
    }
  ) {
    const successRate = stats.totalCalls > 0
      ? ((stats.completedCalls / stats.totalCalls) * 100).toFixed(1)
      : '0.0';

    logger.info(`
📈 Campaign Summary [${campaignId}]
━━━━━━━━━━━━━━━━━━━━━━━━━━
• Total Calls: ${stats.totalCalls}
• Completed: ${stats.completedCalls} (${successRate}%)
• Failed: ${stats.failedCalls}
• Active Now: ${stats.currentActive}
• In Queue: ${stats.currentWaiting}
• Avg Duration: ${stats.avgCallDuration}s
━━━━━━━━━━━━━━━━━━━━━━━━━━`, stats);
  }

  /**
   * Log critical errors only
   */
  logError(campaignId: string, error: string, details?: any) {
    logger.error(`🚨 [Campaign ${campaignId}] ${error}`, details);
  }

  /**
   * Log rate limiting or throttling events
   */
  logThrottleEvent(campaignId: string, reason: string, details?: any) {
    logger.warn(`⚠️ [Campaign ${campaignId}] Throttled: ${reason}`, details);
  }
}

export const campaignLogger = new CampaignLogger();