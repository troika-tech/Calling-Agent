import axios from 'axios';
import type { AdminSettings, TTSVoice } from '../types';
import { API_BASE_URL } from '../config/api.config';

const API_URL = API_BASE_URL;

class SettingsService {
  private getAuthHeaders() {
    const token = localStorage.getItem('token');
    return {
      headers: {
        Authorization: `Bearer ${token}`
      }
    };
  }

  /**
   * Get admin settings
   */
  async getSettings(): Promise<AdminSettings> {
    const response = await axios.get(
      `${API_URL}/settings`,
      this.getAuthHeaders()
    );
    return response.data.data;
  }

  /**
   * Update admin settings
   */
  async updateSettings(settings: Partial<AdminSettings>): Promise<AdminSettings> {
    const response = await axios.put(
      `${API_URL}/settings`,
      settings,
      this.getAuthHeaders()
    );
    return response.data.data;
  }

  /**
   * Test TTS provider and return audio data
   */
  async testTts(provider: 'deepgram' | 'elevenlabs' | 'sarvam', voiceId: string, apiKey?: string): Promise<{
    success: boolean;
    message: string;
    audioBase64?: string;
  }> {
    const response = await axios.post(
      `${API_URL}/settings/test-tts`,
      { provider, voiceId, apiKey },
      this.getAuthHeaders()
    );
    return response.data;
  }

  /**
   * Get available voices for a provider
   */
  async getVoices(provider: 'deepgram' | 'elevenlabs' | 'sarvam', apiKey?: string): Promise<TTSVoice[]> {
    const params = apiKey ? { apiKey } : {};
    const response = await axios.get(
      `${API_URL}/settings/voices/${provider}`,
      {
        ...this.getAuthHeaders(),
        params
      }
    );
    return response.data.data;
  }
}

export const settingsService = new SettingsService();
