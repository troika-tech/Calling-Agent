import api from './api';
import type { Agent, AgentConfig } from '../types';

export const agentService = {
  async getAgents(): Promise<Agent[]> {
    const response = await api.get('/agents');
    const { agents } = response.data?.data ?? {};
    return (agents ?? []) as Agent[];
  },

  async getAgent(id: string): Promise<Agent> {
    const response = await api.get(`/agents/${id}`);
    return response.data?.data?.agent as Agent;
  },

  async createAgent(data: {
    name: string;
    description?: string;
    config: AgentConfig;
  }): Promise<Agent> {
    const response = await api.post('/agents', data);
    return response.data?.data?.agent as Agent;
  },

  async updateAgent(
    id: string,
    data: Partial<{
      name: string;
      description?: string;
      config: AgentConfig;
      isActive: boolean;
    }>
  ): Promise<Agent> {
    const response = await api.put(`/agents/${id}`, data);
    return response.data?.data?.agent as Agent;
  },

  async deleteAgent(id: string): Promise<void> {
    await api.delete(`/agents/${id}`);
  },

  async getVoices(): Promise<any[]> {
    const response = await api.get('/agents/voices/list');
    return response.data?.data ?? [];
  },
};
