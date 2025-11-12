import express from 'express';
import { settingsController } from '../controllers/settings.controller';
import { authenticate, requireAdmin } from '../middlewares/auth.middleware';

const router = express.Router();

// All routes require authentication and admin role
router.use(authenticate);
router.use(requireAdmin);

// GET /api/v1/settings - Get admin settings
router.get('/', settingsController.getSettings.bind(settingsController));

// PUT /api/v1/settings - Update admin settings
router.put('/', settingsController.updateSettings.bind(settingsController));

// POST /api/v1/settings/test-tts - Test TTS provider
router.post('/test-tts', settingsController.testTts.bind(settingsController));

// GET /api/v1/settings/voices/:provider - Get available voices
router.get('/voices/:provider', settingsController.getVoices.bind(settingsController));

export default router;
