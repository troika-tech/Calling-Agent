/**
 * Campaign API Service
 * Handles all campaign-related API calls
 */

import { api } from './api';
import type {
  Campaign,
  CampaignContact,
  CampaignStats,
  CampaignProgress,
  CreateCampaignRequest,
  AddContactsRequest,
  CallLog
} from '../types';

export interface CampaignsResponse {
  success: boolean;
  data: {
    campaigns: Campaign[];
    total: number;
    page: number;
    pages: number;
  };
}

export interface CampaignResponse {
  success: boolean;
  data: Campaign;
}

export interface ContactsResponse {
  success: boolean;
  data: {
    contacts: CampaignContact[];
    total: number;
    page: number;
    pages: number;
  };
}

export interface CallLogsResponse {
  success: boolean;
  data: {
    callLogs: CallLog[];
    total: number;
    page: number;
    pages: number;
  };
}

export interface StatsResponse {
  success: boolean;
  data: CampaignStats;
}

export interface ProgressResponse {
  success: boolean;
  data: CampaignProgress;
}

export interface AddContactsResponse {
  success: boolean;
  data: {
    added: number;
    duplicates: number;
    errors: number;
  };
}

export interface RetryResponse {
  success: boolean;
  message: string;
  data: {
    retriedCount: number;
  };
}

export const campaignApi = {
  /**
   * Get all campaigns
   */
  async getCampaigns(params?: {
    status?: string[];
    agentId?: string;
    search?: string;
    page?: number;
    limit?: number;
  }): Promise<CampaignsResponse> {
    const queryParams = new URLSearchParams();

    if (params?.status && params.status.length > 0) {
      queryParams.append('status', params.status.join(','));
    }
    if (params?.agentId) {
      queryParams.append('agentId', params.agentId);
    }
    if (params?.search) {
      queryParams.append('search', params.search);
    }
    if (params?.page) {
      queryParams.append('page', params.page.toString());
    }
    if (params?.limit) {
      queryParams.append('limit', params.limit.toString());
    }

    const response = await api.get(`/campaigns?${queryParams.toString()}`);
    return response.data;
  },

  /**
   * Get campaign by ID
   */
  async getCampaign(id: string): Promise<CampaignResponse> {
    const response = await api.get(`/campaigns/${id}`);
    return response.data;
  },

  /**
   * Create a new campaign
   */
  async createCampaign(data: CreateCampaignRequest): Promise<CampaignResponse> {
    const response = await api.post('/campaigns', data);
    return response.data;
  },

  /**
   * Update campaign
   */
  async updateCampaign(
    id: string,
    data: Partial<CreateCampaignRequest>
  ): Promise<CampaignResponse> {
    const response = await api.patch(`/campaigns/${id}`, data);
    return response.data;
  },

  /**
   * Delete campaign
   */
  async deleteCampaign(id: string): Promise<{ success: boolean; message: string }> {
    const response = await api.delete(`/campaigns/${id}`);
    return response.data;
  },

  /**
   * Add contacts to campaign
   */
  async addContacts(id: string, data: AddContactsRequest): Promise<AddContactsResponse> {
    const response = await api.post(`/campaigns/${id}/contacts`, data);
    return response.data;
  },

  /**
   * Get campaign contacts
   */
  async getContacts(
    id: string,
    params?: {
      status?: string[];
      page?: number;
      limit?: number;
    }
  ): Promise<ContactsResponse> {
    const queryParams = new URLSearchParams();

    if (params?.status && params.status.length > 0) {
      queryParams.append('status', params.status.join(','));
    }
    if (params?.page) {
      queryParams.append('page', params.page.toString());
    }
    if (params?.limit) {
      queryParams.append('limit', params.limit.toString());
    }

    const response = await api.get(`/campaigns/${id}/contacts?${queryParams.toString()}`);
    return response.data;
  },

  /**
   * Get campaign call logs
   */
  async getCallLogs(
    id: string,
    params?: {
      page?: number;
      limit?: number;
    }
  ): Promise<CallLogsResponse> {
    const queryParams = new URLSearchParams();

    if (params?.page) {
      queryParams.append('page', params.page.toString());
    }
    if (params?.limit) {
      queryParams.append('limit', params.limit.toString());
    }

    const response = await api.get(`/campaigns/${id}/calls?${queryParams.toString()}`);
    return response.data;
  },

  /**
   * Get campaign statistics
   */
  async getStats(id: string): Promise<StatsResponse> {
    const response = await api.get(`/campaigns/${id}/stats`);
    return response.data;
  },

  /**
   * Get campaign progress (real-time)
   */
  async getProgress(id: string): Promise<ProgressResponse> {
    const response = await api.get(`/campaigns/${id}/progress`);
    return response.data;
  },

  /**
   * Start campaign
   */
  async startCampaign(id: string): Promise<{ success: boolean; message: string }> {
    const response = await api.post(`/campaigns/${id}/start`);
    return response.data;
  },

  /**
   * Pause campaign
   */
  async pauseCampaign(id: string): Promise<{ success: boolean; message: string }> {
    const response = await api.post(`/campaigns/${id}/pause`);
    return response.data;
  },

  /**
   * Resume campaign
   */
  async resumeCampaign(id: string): Promise<{ success: boolean; message: string }> {
    const response = await api.post(`/campaigns/${id}/resume`);
    return response.data;
  },

  /**
   * Cancel campaign
   */
  async cancelCampaign(id: string): Promise<{ success: boolean; message: string }> {
    const response = await api.post(`/campaigns/${id}/cancel`);
    return response.data;
  },

  /**
   * Retry failed contacts
   */
  async retryFailedContacts(id: string): Promise<RetryResponse> {
    const response = await api.post(`/campaigns/${id}/retry`);
    return response.data;
  }
};

export default campaignApi;
