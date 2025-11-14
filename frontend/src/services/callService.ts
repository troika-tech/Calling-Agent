import api from './api';
import type { CallLog, CallStats } from '../types';

export const callService = {
  async getCalls(filters?: {
    agentId?: string;
    status?: string;
    startDate?: string;
    endDate?: string;
    page?: number;
    limit?: number;
  }): Promise<{ calls: CallLog[]; total: number; page: number; totalPages: number }> {
    // Remove empty string values from filters
    const cleanFilters = filters
      ? Object.fromEntries(
          Object.entries(filters).filter(([_, value]) => value !== '' && value !== undefined)
        )
      : {};
    
    const response = await api.get('/exotel/calls', { params: cleanFilters });
    const data = response.data?.data ?? {};
    return {
      calls: (data.calls ?? []) as CallLog[],
      total: data.total ?? 0,
      page: data.page ?? 1,
      totalPages: data.totalPages ?? 1
    };
  },

  async getCall(id: string): Promise<CallLog> {
    const response = await api.get(`/exotel/calls/${id}`);
    return response.data?.data?.call as CallLog;
  },

  async initiateCall(data: {
    phoneId: string;
    to: string;
  }): Promise<CallLog> {
    const response = await api.post('/exotel/calls', data);
    return response.data?.data?.callLog as CallLog;
  },

  async getCallStats(filters?: {
    agentId?: string;
    startDate?: string;
    endDate?: string;
  }): Promise<CallStats> {
    // Remove empty string values from filters
    const cleanFilters = filters
      ? Object.fromEntries(
          Object.entries(filters).filter(([_, value]) => value !== '' && value !== undefined)
        )
      : {};
    
    const response = await api.get('/exotel/calls/stats', { params: cleanFilters });
    const rawStats = response.data?.data?.stats || {};
    return {
      totalCalls: rawStats.totalCalls ?? 0,
      completedCalls: rawStats.completedCalls ?? 0,
      averageDuration: rawStats.avgDuration ?? rawStats.averageDuration ?? 0,
      totalDuration: rawStats.totalDuration ?? 0,
    };
  },

  async regenerateTranscript(callId: string): Promise<void> {
    await api.post(`/exotel/calls/${callId}/transcript/regenerate`);
  },

  async getFormattedTranscript(callId: string, format: 'json' | 'markdown' | 'plaintext' = 'json'): Promise<any> {
    const response = await api.get(`/exotel/calls/${callId}/transcript`, {
      params: { format }
    });
    return response.data?.data;
  },

  async fetchRecording(callId: string): Promise<{ success: boolean; recordingUrl: string | null; message: string }> {
    const response = await api.get(`/exotel/calls/${callId}/recording`);
    return {
      success: response.data.success,
      recordingUrl: response.data.data?.recordingUrl || null,
      message: response.data.data?.message || ''
    };
  },

  async initiateOutboundCall(data: {
    phoneNumber: string;
    phoneId: string;
    agentId: string;
    userId: string;
    metadata?: any;
  }): Promise<{ success: boolean; callLogId: string; message: string }> {
    const response = await api.post('/calls/outbound', data);
    return {
      success: response.data.success,
      callLogId: response.data.data.callLogId,
      message: response.data.data.message
    };
  },
};
