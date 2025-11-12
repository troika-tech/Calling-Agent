/**
 * Analytics Service
 * Provides comprehensive analytics and metrics for the dashboard
 */

import { CallLog } from '../models/CallLog';
import { ScheduledCall } from '../models/ScheduledCall';
import { RetryAttempt } from '../models/RetryAttempt';
import { logger } from '../utils/logger';
import moment from 'moment-timezone';

export interface AnalyticsTimeRange {
  start: Date;
  end: Date;
  timezone?: string;
}

export interface CallAnalytics {
  totalCalls: number;
  successfulCalls: number;
  failedCalls: number;
  inProgressCalls: number;
  successRate: number;
  averageDuration: number;
  totalDuration: number;
  byStatus: Record<string, number>;
  byDirection: {
    inbound: number;
    outbound: number;
  };
}

export interface RetryAnalytics {
  totalRetries: number;
  successfulRetries: number;
  failedRetries: number;
  successRate: number;
  byFailureType: Record<string, number>;
  averageAttemptsPerCall: number;
}

export interface SchedulingAnalytics {
  totalScheduled: number;
  pendingScheduled: number;
  completedScheduled: number;
  cancelledScheduled: number;
  recurringCalls: number;
}

export interface VoicemailAnalytics {
  totalVoicemails: number;
  messagesLeft: number;
  messagesFailed: number;
  detectionRate: number;
  averageConfidence: number;
  averageDetectionTime: number;  // Average time to detect voicemail (seconds)
  costSaved: number;  // Estimated cost saved by early termination
  byKeyword: Record<string, number>;  // Count of detections by keyword
  falsePositiveRate?: number;  // If tracking is enabled
}

export interface PerformanceMetrics {
  averageLatency: {
    stt: number;
    llm: number;
    tts: number;
    total: number;
  };
  p95Latency: {
    stt: number;
    llm: number;
    tts: number;
    total: number;
  };
  throughput: {
    callsPerHour: number;
    callsPerDay: number;
  };
}

export interface CostAnalytics {
  estimatedCosts: {
    telephony: number;
    stt: number;
    llm: number;
    tts: number;
    total: number;
  };
  costPerCall: number;
  costPerMinute: number;
}

export interface TimeSeriesData {
  labels: string[];
  data: number[];
}

export interface DashboardAnalytics {
  overview: CallAnalytics;
  retry: RetryAnalytics;
  scheduling: SchedulingAnalytics;
  voicemail: VoicemailAnalytics;
  performance: PerformanceMetrics;
  cost: CostAnalytics;
  trends: {
    callsOverTime: TimeSeriesData;
    successRateOverTime: TimeSeriesData;
    durationOverTime: TimeSeriesData;
  };
}

export class AnalyticsService {
  /**
   * Get comprehensive dashboard analytics
   */
  async getDashboardAnalytics(
    userId?: string,
    timeRange?: AnalyticsTimeRange
  ): Promise<DashboardAnalytics> {
    const range = timeRange || this.getDefaultTimeRange();

    logger.info('Generating dashboard analytics', {
      userId,
      timeRange: range
    });

    const [
      overview,
      retry,
      scheduling,
      voicemail,
      performance,
      cost,
      trends
    ] = await Promise.all([
      this.getCallAnalytics(userId, range),
      this.getRetryAnalytics(userId, range),
      this.getSchedulingAnalytics(userId, range),
      this.getVoicemailAnalytics(userId, range),
      this.getPerformanceMetrics(userId, range),
      this.getCostAnalytics(userId, range),
      this.getTrends(userId, range)
    ]);

    return {
      overview,
      retry,
      scheduling,
      voicemail,
      performance,
      cost,
      trends
    };
  }

  /**
   * Get call analytics
   */
  async getCallAnalytics(
    userId?: string,
    timeRange?: AnalyticsTimeRange
  ): Promise<CallAnalytics> {
    const range = timeRange || this.getDefaultTimeRange();
    const filter = this.buildFilter(userId, range);

    const calls = await CallLog.find(filter);

    const totalCalls = calls.length;
    const successfulCalls = calls.filter(c => c.status === 'completed').length;
    const failedCalls = calls.filter(c => c.status === 'failed').length;
    const inProgressCalls = calls.filter(c => ['initiated', 'ringing', 'in_progress'].includes(c.status)).length;

    const successRate = totalCalls > 0 ? (successfulCalls / totalCalls) * 100 : 0;

    const durations = calls
      .filter(c => c.durationSec)
      .map(c => c.durationSec || 0);

    const averageDuration = durations.length > 0
      ? durations.reduce((a, b) => a + b, 0) / durations.length
      : 0;

    const totalDuration = durations.reduce((a, b) => a + b, 0);

    // Group by status
    const byStatus: Record<string, number> = {};
    calls.forEach(call => {
      byStatus[call.status] = (byStatus[call.status] || 0) + 1;
    });

    // Group by direction
    const inbound = calls.filter(c => c.direction === 'inbound').length;
    const outbound = calls.filter(c => c.direction === 'outbound').length;

    return {
      totalCalls,
      successfulCalls,
      failedCalls,
      inProgressCalls,
      successRate,
      averageDuration,
      totalDuration,
      byStatus,
      byDirection: {
        inbound,
        outbound
      }
    };
  }

  /**
   * Get retry analytics
   */
  async getRetryAnalytics(
    userId?: string,
    timeRange?: AnalyticsTimeRange
  ): Promise<RetryAnalytics> {
    const range = timeRange || this.getDefaultTimeRange();
    const filter: any = {
      createdAt: { $gte: range.start, $lte: range.end }
    };

    if (userId) {
      const userCallLogs = await CallLog.distinct('_id', { userId });
      filter.originalCallLogId = { $in: userCallLogs };
    }

    const retries = await RetryAttempt.find(filter);

    const totalRetries = retries.length;
    const successfulRetries = retries.filter(r => r.status === 'completed').length;
    const failedRetries = retries.filter(r => r.status === 'failed').length;
    const successRate = totalRetries > 0 ? (successfulRetries / totalRetries) * 100 : 0;

    // Group by failure type
    const byFailureType: Record<string, number> = {};
    retries.forEach(retry => {
      byFailureType[retry.failureReason] = (byFailureType[retry.failureReason] || 0) + 1;
    });

    // Calculate average attempts per call
    const uniqueCalls = new Set(retries.map(r => r.originalCallLogId.toString()));
    const averageAttemptsPerCall = uniqueCalls.size > 0
      ? totalRetries / uniqueCalls.size
      : 0;

    return {
      totalRetries,
      successfulRetries,
      failedRetries,
      successRate,
      byFailureType,
      averageAttemptsPerCall
    };
  }

  /**
   * Get scheduling analytics
   */
  async getSchedulingAnalytics(
    userId?: string,
    timeRange?: AnalyticsTimeRange
  ): Promise<SchedulingAnalytics> {
    const range = timeRange || this.getDefaultTimeRange();
    const filter: any = {
      createdAt: { $gte: range.start, $lte: range.end }
    };

    if (userId) {
      filter.userId = userId;
    }

    const scheduled = await ScheduledCall.find(filter);

    const totalScheduled = scheduled.length;
    const pendingScheduled = scheduled.filter(s => s.status === 'pending').length;
    const completedScheduled = scheduled.filter(s => s.status === 'completed').length;
    const cancelledScheduled = scheduled.filter(s => s.status === 'cancelled').length;
    const recurringCalls = scheduled.filter(s => s.recurring != null).length;

    return {
      totalScheduled,
      pendingScheduled,
      completedScheduled,
      cancelledScheduled,
      recurringCalls
    };
  }

  /**
   * Get voicemail analytics
   */
  async getVoicemailAnalytics(
    userId?: string,
    timeRange?: AnalyticsTimeRange
  ): Promise<VoicemailAnalytics> {
    const range = timeRange || this.getDefaultTimeRange();
    const filter: any = {
      'metadata.voicemailDetected': true,
      createdAt: { $gte: range.start, $lte: range.end }
    };

    if (userId) {
      filter.userId = userId;
    }

    const voicemails = await CallLog.find(filter);

    const totalVoicemails = voicemails.length;
    const messagesLeft = voicemails.filter(v => v.metadata?.voicemailMessageLeft === true).length;
    const messagesFailed = totalVoicemails - messagesLeft;

    // Calculate detection rate (voicemails / total outbound calls)
    const totalOutboundCalls = await CallLog.countDocuments({
      ...this.buildFilter(userId, range),
      direction: 'outbound'
    });
    const detectionRate = totalOutboundCalls > 0 ? (totalVoicemails / totalOutboundCalls) * 100 : 0;

    // Calculate average confidence
    const confidences = voicemails
      .map(v => v.metadata?.voicemailConfidence || 0)
      .filter(c => c > 0);

    const averageConfidence = confidences.length > 0
      ? confidences.reduce((a, b) => a + b, 0) / confidences.length
      : 0;

    // Calculate average detection time
    const detectionTimes = voicemails
      .map(v => v.metadata?.detectionTimeSeconds || v.metadata?.callDurationAtDetection || 0)
      .filter(t => t > 0);

    const averageDetectionTime = detectionTimes.length > 0
      ? detectionTimes.reduce((a, b) => a + b, 0) / detectionTimes.length
      : 0;

    // Calculate cost saved by early termination
    // Estimate: Average call would be 60 seconds without detection
    // Cost rates: $0.02/min telephony + $0.006/min STT + $0.003/1K tokens (~$0.01/min) + $0.015/1K chars TTS (~$0.01/min)
    // Total: ~$0.04/min = $0.0007/sec
    const avgCallDuration = 60; // seconds
    const costPerSecond = 0.0007; // $0.04/min
    let totalCostSaved = 0;

    voicemails.forEach(v => {
      const detectionTime = v.metadata?.callDurationAtDetection || v.metadata?.detectionTimeSeconds || 10;
      const savedSeconds = Math.max(0, avgCallDuration - detectionTime);
      totalCostSaved += savedSeconds * costPerSecond;
    });

    // Count detections by keyword
    const byKeyword: Record<string, number> = {};
    voicemails.forEach(v => {
      const keywords = v.metadata?.voicemailKeywords || [];
      keywords.forEach((keyword: string) => {
        byKeyword[keyword] = (byKeyword[keyword] || 0) + 1;
      });
    });

    // Calculate false positive rate if tracking is enabled
    const falsePositives = voicemails.filter(v => v.metadata?.markedAsFalsePositive === true).length;
    const falsePositiveRate = totalVoicemails > 0 ? (falsePositives / totalVoicemails) * 100 : undefined;

    return {
      totalVoicemails,
      messagesLeft,
      messagesFailed,
      detectionRate,
      averageConfidence,
      averageDetectionTime,
      costSaved: totalCostSaved,
      byKeyword,
      falsePositiveRate
    };
  }

  /**
   * Get performance metrics
   */
  async getPerformanceMetrics(
    userId?: string,
    timeRange?: AnalyticsTimeRange
  ): Promise<PerformanceMetrics> {
    const range = timeRange || this.getDefaultTimeRange();
    const filter = this.buildFilter(userId, range);

    const calls = await CallLog.find({
      ...filter,
      'metadata.performanceMetrics': { $exists: true }
    });

    // Extract latencies
    const sttLatencies: number[] = [];
    const llmLatencies: number[] = [];
    const ttsLatencies: number[] = [];
    const totalLatencies: number[] = [];

    calls.forEach(call => {
      const metrics = call.metadata?.performanceMetrics;
      if (metrics) {
        if (metrics.sttLatency) sttLatencies.push(metrics.sttLatency);
        if (metrics.llmLatency) llmLatencies.push(metrics.llmLatency);
        if (metrics.ttsLatency) ttsLatencies.push(metrics.ttsLatency);
        if (metrics.totalLatency) totalLatencies.push(metrics.totalLatency);
      }
    });

    // Calculate averages
    const avgStt = this.average(sttLatencies);
    const avgLlm = this.average(llmLatencies);
    const avgTts = this.average(ttsLatencies);
    const avgTotal = this.average(totalLatencies);

    // Calculate p95
    const p95Stt = this.percentile(sttLatencies, 95);
    const p95Llm = this.percentile(llmLatencies, 95);
    const p95Tts = this.percentile(ttsLatencies, 95);
    const p95Total = this.percentile(totalLatencies, 95);

    // Calculate throughput
    const hoursDiff = (range.end.getTime() - range.start.getTime()) / (1000 * 3600);
    const callsPerHour = hoursDiff > 0 ? calls.length / hoursDiff : 0;
    const callsPerDay = callsPerHour * 24;

    return {
      averageLatency: {
        stt: avgStt,
        llm: avgLlm,
        tts: avgTts,
        total: avgTotal
      },
      p95Latency: {
        stt: p95Stt,
        llm: p95Llm,
        tts: p95Tts,
        total: p95Total
      },
      throughput: {
        callsPerHour,
        callsPerDay
      }
    };
  }

  /**
   * Get cost analytics
   */
  async getCostAnalytics(
    userId?: string,
    timeRange?: AnalyticsTimeRange
  ): Promise<CostAnalytics> {
    const range = timeRange || this.getDefaultTimeRange();
    const filter = this.buildFilter(userId, range);

    const calls = await CallLog.find(filter);

    // Cost per minute (approximate)
    const TELEPHONY_COST_PER_MIN = 0.02; // $0.02/min
    const STT_COST_PER_MIN = 0.006; // $0.006/min (Deepgram)
    const LLM_COST_PER_1K_TOKENS = 0.003; // $0.003/1K tokens (GPT-4)
    const TTS_COST_PER_1K_CHARS = 0.015; // $0.015/1K chars (ElevenLabs)

    let totalTelephony = 0;
    let totalStt = 0;
    let totalLlm = 0;
    let totalTts = 0;

    calls.forEach(call => {
      const durationMin = (call.durationSec || 0) / 60;

      // Telephony cost
      totalTelephony += durationMin * TELEPHONY_COST_PER_MIN;

      // STT cost
      totalStt += durationMin * STT_COST_PER_MIN;

      // LLM cost (estimate based on transcript length)
      const transcriptTokens = (call.transcript?.length || 0) / 4; // ~4 chars per token
      totalLlm += (transcriptTokens / 1000) * LLM_COST_PER_1K_TOKENS;

      // TTS cost (estimate based on transcript length)
      const ttsChars = call.transcript?.length || 0;
      totalTts += (ttsChars / 1000) * TTS_COST_PER_1K_CHARS;
    });

    const total = totalTelephony + totalStt + totalLlm + totalTts;
    const costPerCall = calls.length > 0 ? total / calls.length : 0;

    const totalDurationMin = calls.reduce((sum, c) => sum + ((c.durationSec || 0) / 60), 0);
    const costPerMinute = totalDurationMin > 0 ? total / totalDurationMin : 0;

    return {
      estimatedCosts: {
        telephony: totalTelephony,
        stt: totalStt,
        llm: totalLlm,
        tts: totalTts,
        total
      },
      costPerCall,
      costPerMinute
    };
  }

  /**
   * Get trends over time
   */
  async getTrends(
    userId?: string,
    timeRange?: AnalyticsTimeRange
  ): Promise<{
    callsOverTime: TimeSeriesData;
    successRateOverTime: TimeSeriesData;
    durationOverTime: TimeSeriesData;
  }> {
    const range = timeRange || this.getDefaultTimeRange();
    const filter = this.buildFilter(userId, range);

    // Determine bucket size based on range
    const hoursDiff = (range.end.getTime() - range.start.getTime()) / (1000 * 3600);
    const bucketSize = hoursDiff <= 24 ? 'hour' : hoursDiff <= 168 ? 'day' : 'week';

    const buckets = this.generateTimeBuckets(range, bucketSize);
    const labels = buckets.map(b => b.label);

    const calls = await CallLog.find(filter);

    // Group calls by bucket
    const callsByBucket: Record<string, any[]> = {};
    buckets.forEach(bucket => {
      callsByBucket[bucket.label] = [];
    });

    calls.forEach(call => {
      const callTime = call.createdAt;
      const bucket = buckets.find(b => callTime >= b.start && callTime < b.end);
      if (bucket) {
        callsByBucket[bucket.label].push(call);
      }
    });

    // Calculate metrics per bucket
    const callCounts = labels.map(label => callsByBucket[label].length);

    const successRates = labels.map(label => {
      const bucketCalls = callsByBucket[label];
      if (bucketCalls.length === 0) return 0;
      const successful = bucketCalls.filter(c => c.status === 'completed').length;
      return (successful / bucketCalls.length) * 100;
    });

    const avgDurations = labels.map(label => {
      const bucketCalls = callsByBucket[label];
      if (bucketCalls.length === 0) return 0;
      const durations = bucketCalls.map(c => c.durationSec || 0);
      return durations.reduce((a, b) => a + b, 0) / durations.length;
    });

    return {
      callsOverTime: {
        labels,
        data: callCounts
      },
      successRateOverTime: {
        labels,
        data: successRates
      },
      durationOverTime: {
        labels,
        data: avgDurations
      }
    };
  }

  /**
   * Build MongoDB filter
   */
  private buildFilter(userId?: string, timeRange?: AnalyticsTimeRange): any {
    const filter: any = {};

    if (userId) {
      filter.userId = userId;
    }

    if (timeRange) {
      filter.createdAt = {
        $gte: timeRange.start,
        $lte: timeRange.end
      };
    }

    return filter;
  }

  /**
   * Get default time range (last 7 days)
   */
  private getDefaultTimeRange(): AnalyticsTimeRange {
    return {
      start: moment().subtract(7, 'days').startOf('day').toDate(),
      end: moment().endOf('day').toDate(),
      timezone: 'UTC'
    };
  }

  /**
   * Calculate average
   */
  private average(numbers: number[]): number {
    if (numbers.length === 0) return 0;
    return numbers.reduce((a, b) => a + b, 0) / numbers.length;
  }

  /**
   * Calculate percentile
   */
  private percentile(numbers: number[], p: number): number {
    if (numbers.length === 0) return 0;
    const sorted = [...numbers].sort((a, b) => a - b);
    const index = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }

  /**
   * Generate time buckets
   */
  private generateTimeBuckets(
    range: AnalyticsTimeRange,
    bucketSize: 'hour' | 'day' | 'week'
  ): Array<{ label: string; start: Date; end: Date }> {
    const buckets: Array<{ label: string; start: Date; end: Date }> = [];
    let current = moment(range.start);
    const end = moment(range.end);

    while (current.isBefore(end)) {
      const bucketEnd = current.clone().add(1, bucketSize);

      buckets.push({
        label: current.format(bucketSize === 'hour' ? 'MMM D, HH:mm' : 'MMM D'),
        start: current.toDate(),
        end: bucketEnd.toDate()
      });

      current = bucketEnd;
    }

    return buckets;
  }
}

// Export singleton instance
export const analyticsService = new AnalyticsService();
