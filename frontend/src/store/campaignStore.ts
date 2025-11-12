import { create } from 'zustand';
import type { Campaign, CampaignProgress } from '../types';
import { campaignApi } from '../services/campaignApi';

interface CampaignState {
  campaigns: Campaign[];
  currentCampaign: Campaign | null;
  currentProgress: CampaignProgress | null;
  loading: boolean;
  error: string | null;

  // Actions
  fetchCampaigns: (filters?: {
    status?: string[];
    agentId?: string;
    search?: string;
  }) => Promise<void>;
  fetchCampaign: (id: string) => Promise<void>;
  createCampaign: (data: any) => Promise<Campaign>;
  updateCampaign: (id: string, data: any) => Promise<void>;
  deleteCampaign: (id: string) => Promise<void>;
  startCampaign: (id: string) => Promise<void>;
  pauseCampaign: (id: string) => Promise<void>;
  resumeCampaign: (id: string) => Promise<void>;
  cancelCampaign: (id: string) => Promise<void>;
  fetchProgress: (id: string) => Promise<void>;
  addContacts: (id: string, contacts: any[]) => Promise<void>;
  clearError: () => void;
  setCurrentCampaign: (campaign: Campaign | null) => void;
}

export const useCampaignStore = create<CampaignState>((set, get) => ({
  campaigns: [],
  currentCampaign: null,
  currentProgress: null,
  loading: false,
  error: null,

  fetchCampaigns: async (filters) => {
    set({ loading: true, error: null });
    try {
      const response = await campaignApi.getCampaigns(filters);
      set({ campaigns: response.data.campaigns, loading: false });
    } catch (error: any) {
      set({ error: error.response?.data?.error || 'Failed to fetch campaigns', loading: false });
    }
  },

  fetchCampaign: async (id: string) => {
    set({ loading: true, error: null });
    try {
      const response = await campaignApi.getCampaign(id);
      set({ currentCampaign: response.data, loading: false });
    } catch (error: any) {
      set({ error: error.response?.data?.error || 'Failed to fetch campaign', loading: false });
    }
  },

  createCampaign: async (data: any) => {
    set({ loading: true, error: null });
    try {
      const response = await campaignApi.createCampaign(data);
      set((state) => ({
        campaigns: [response.data, ...state.campaigns],
        currentCampaign: response.data,
        loading: false
      }));
      return response.data;
    } catch (error: any) {
      set({ error: error.response?.data?.error || 'Failed to create campaign', loading: false });
      throw error;
    }
  },

  updateCampaign: async (id: string, data: any) => {
    set({ loading: true, error: null });
    try {
      const response = await campaignApi.updateCampaign(id, data);
      set((state) => ({
        campaigns: state.campaigns.map((c) => (c._id === id ? response.data : c)),
        currentCampaign: state.currentCampaign?._id === id ? response.data : state.currentCampaign,
        loading: false
      }));
    } catch (error: any) {
      set({ error: error.response?.data?.error || 'Failed to update campaign', loading: false });
      throw error;
    }
  },

  deleteCampaign: async (id: string) => {
    set({ loading: true, error: null });
    try {
      await campaignApi.deleteCampaign(id);
      set((state) => ({
        campaigns: state.campaigns.filter((c) => c._id !== id),
        currentCampaign: state.currentCampaign?._id === id ? null : state.currentCampaign,
        loading: false
      }));
    } catch (error: any) {
      set({ error: error.response?.data?.error || 'Failed to delete campaign', loading: false });
      throw error;
    }
  },

  startCampaign: async (id: string) => {
    set({ loading: true, error: null });
    try {
      await campaignApi.startCampaign(id);
      // Refresh campaign data
      await get().fetchCampaign(id);
      set({ loading: false });
    } catch (error: any) {
      set({ error: error.response?.data?.error || 'Failed to start campaign', loading: false });
      throw error;
    }
  },

  pauseCampaign: async (id: string) => {
    set({ loading: true, error: null });
    try {
      await campaignApi.pauseCampaign(id);
      await get().fetchCampaign(id);
      set({ loading: false });
    } catch (error: any) {
      set({ error: error.response?.data?.error || 'Failed to pause campaign', loading: false });
      throw error;
    }
  },

  resumeCampaign: async (id: string) => {
    set({ loading: true, error: null });
    try {
      await campaignApi.resumeCampaign(id);
      await get().fetchCampaign(id);
      set({ loading: false });
    } catch (error: any) {
      set({ error: error.response?.data?.error || 'Failed to resume campaign', loading: false });
      throw error;
    }
  },

  cancelCampaign: async (id: string) => {
    set({ loading: true, error: null });
    try {
      await campaignApi.cancelCampaign(id);
      await get().fetchCampaign(id);
      set({ loading: false });
    } catch (error: any) {
      set({ error: error.response?.data?.error || 'Failed to cancel campaign', loading: false });
      throw error;
    }
  },

  fetchProgress: async (id: string) => {
    try {
      const response = await campaignApi.getProgress(id);
      set({ currentProgress: response.data });
    } catch (error: any) {
      console.error('Failed to fetch progress:', error);
    }
  },

  addContacts: async (id: string, contacts: any[]) => {
    set({ loading: true, error: null });
    try {
      await campaignApi.addContacts(id, { contacts });
      await get().fetchCampaign(id);
      set({ loading: false });
    } catch (error: any) {
      set({ error: error.response?.data?.error || 'Failed to add contacts', loading: false });
      throw error;
    }
  },

  clearError: () => set({ error: null }),

  setCurrentCampaign: (campaign: Campaign | null) => set({ currentCampaign: campaign })
}));
