import axios from 'axios';
import type { KnowledgeBaseDocument, KnowledgeBaseStats } from '../types';
import { API_BASE_URL } from '../config/api.config';

const API_URL = API_BASE_URL;

// Create axios instance with auth token
const api = axios.create({
  baseURL: API_URL,
});

// Add auth token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export const knowledgeBaseService = {
  /**
   * Upload a knowledge base document for an agent
   */
  async uploadDocument(agentId: string, file: File): Promise<{ documentId: string; fileName: string; status: string }> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('agentId', agentId);

    const response = await api.post('/knowledge-base/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });

    return response.data.data;
  },

  /**
   * List all knowledge base documents for an agent
   */
  async listDocuments(agentId: string, status?: 'processing' | 'ready' | 'failed'): Promise<{ documents: KnowledgeBaseDocument[]; stats: KnowledgeBaseStats }> {
    const params = status ? { status } : {};
    const response = await api.get(`/knowledge-base/${agentId}`, { params });
    return response.data.data;
  },

  /**
   * Get a single knowledge base document
   */
  async getDocument(documentId: string): Promise<KnowledgeBaseDocument> {
    const response = await api.get(`/knowledge-base/document/${documentId}`);
    return response.data.data;
  },

  /**
   * Delete a knowledge base document
   */
  async deleteDocument(documentId: string): Promise<void> {
    await api.delete(`/knowledge-base/${documentId}`);
  },

  /**
   * Get knowledge base statistics for an agent
   */
  async getStats(agentId: string): Promise<KnowledgeBaseStats> {
    const response = await api.get(`/knowledge-base/stats/${agentId}`);
    return response.data.data;
  },

  /**
   * Query knowledge base (for testing RAG)
   */
  async queryKnowledgeBase(
    agentId: string,
    query: string,
    options?: { topK?: number; minScore?: number }
  ): Promise<any> {
    const response = await api.post('/knowledge-base/query', {
      agentId,
      query,
      ...options,
    });
    return response.data.data;
  },
};
