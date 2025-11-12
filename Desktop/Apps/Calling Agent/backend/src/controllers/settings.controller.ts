import { Request, Response } from 'express';
import { settingsService } from '../services/settings.service';

export class SettingsController {
  /**
   * GET /api/v1/settings
   * Get admin settings for the logged-in user
   */
  async getSettings(req: Request, res: Response) {
    try {
      const userId = (req as any).user.id;
      const settings = await settingsService.getSettings(userId);

      return res.json({
        success: true,
        data: settings
      });
    } catch (error: any) {
      console.error('Error getting settings:', error);
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to get settings'
      });
    }
  }

  /**
   * PUT /api/v1/settings
   * Update admin settings
   */
  async updateSettings(req: Request, res: Response) {
    try {
      const userId = (req as any).user.id;
      const updateData = req.body;

      // Validate required fields
      if (updateData.defaultTtsProvider && !['deepgram', 'elevenlabs', 'sarvam'].includes(updateData.defaultTtsProvider)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid TTS provider'
        });
      }

      const settings = await settingsService.updateSettings(userId, updateData);

      return res.json({
        success: true,
        data: settings,
        message: 'Settings updated successfully'
      });
    } catch (error: any) {
      console.error('Error updating settings:', error);
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to update settings'
      });
    }
  }

  /**
   * POST /api/v1/settings/test-tts
   * Test TTS provider with sample text
   */
  async testTts(req: Request, res: Response) {
    try {
      const { provider, voiceId, apiKey } = req.body;

      if (!provider || !voiceId) {
        return res.status(400).json({
          success: false,
          message: 'Provider and voiceId are required'
        });
      }

      if (!['deepgram', 'elevenlabs', 'sarvam'].includes(provider)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid TTS provider'
        });
      }

      const result = await settingsService.testTtsProvider(provider as 'deepgram' | 'elevenlabs' | 'sarvam', voiceId, apiKey);

      return res.json(result);
    } catch (error: any) {
      console.error('Error testing TTS:', error);
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to test TTS'
      });
    }
  }

  /**
   * GET /api/v1/settings/voices/:provider
   * Get available voices for a TTS provider
   */
  async getVoices(req: Request, res: Response) {
    try {
      const { provider } = req.params;
      const { apiKey } = req.query;

      if (!['deepgram', 'elevenlabs', 'sarvam'].includes(provider)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid TTS provider'
        });
      }

      const voices = await settingsService.getAvailableVoices(
        provider as 'deepgram' | 'elevenlabs' | 'sarvam',
        apiKey as string | undefined
      );

      return res.json({
        success: true,
        data: voices
      });
    } catch (error: any) {
      console.error('Error getting voices:', error);
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to get voices'
      });
    }
  }
}

export const settingsController = new SettingsController();
