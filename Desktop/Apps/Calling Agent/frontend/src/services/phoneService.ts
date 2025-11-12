import api from './api';
import type { Phone, ImportPhoneRequest, PhoneStats } from '../types';

export const phoneService = {
  /**
   * Get all phones for current user
   */
  async getPhones(params?: {
    page?: number;
    limit?: number;
    search?: string;
    isActive?: boolean;
    hasAgent?: boolean;
  }): Promise<Phone[]> {
    const response = await api.get('/phones', { params });
    return response.data.data.phones || response.data.data;
  },

  /**
   * Get single phone by ID
   */
  async getPhone(id: string): Promise<Phone> {
    const response = await api.get(`/phones/${id}`);
    return response.data.data.phone;
  },

  /**
   * Import a new phone number
   */
  async importPhone(data: ImportPhoneRequest): Promise<Phone> {
    const response = await api.post('/phones', data);
    return response.data.data.phone;
  },

  /**
   * Assign agent to phone
   */
  async assignAgent(phoneId: string, agentId: string): Promise<Phone> {
    const response = await api.put(`/phones/${phoneId}/assign`, { agentId });
    return response.data.data.phone;
  },

  /**
   * Unassign agent from phone
   */
  async unassignAgent(phoneId: string): Promise<Phone> {
    const response = await api.delete(`/phones/${phoneId}/assign`);
    return response.data.data.phone;
  },

  /**
   * Update phone
   */
  async updatePhone(id: string, data: Partial<Phone>): Promise<Phone> {
    const response = await api.put(`/phones/${id}`, data);
    return response.data.data.phone;
  },

  /**
   * Delete phone
   */
  async deletePhone(id: string): Promise<void> {
    await api.delete(`/phones/${id}`);
  },

  /**
   * Get phone statistics
   */
  async getPhoneStats(id: string): Promise<PhoneStats> {
    const response = await api.get(`/phones/${id}/stats`);
    return response.data.data.stats;
  },
};
