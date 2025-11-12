import { Router } from 'express';
import { exotelVoiceController } from '../controllers/exotelVoice.controller';

const router = Router();

/**
 * Exotel Voice Webhook Routes
 * These endpoints are called by Exotel during active voice calls
 * No authentication required (Exotel callbacks)
 */

// Unified entry point for both incoming and outgoing calls
// Works with Voicebot applet for both directions:
// - Incoming calls: Voicebot applet configured on phone number with this webhook URL
// - Outbound calls: Voicebot applet configured in applet settings with this webhook URL
// Automatically detects call direction:
//   - Outbound: Uses CustomField (callLogId) to find existing CallLog
//   - Incoming: Creates new CallLog when no CustomField found
// Returns WebSocket URL in JSON format: { "url": "wss://..." }
router.get('/connect', exotelVoiceController.handleIncomingCall.bind(exotelVoiceController));
router.post('/connect', exotelVoiceController.handleIncomingCall.bind(exotelVoiceController));

// Greeting webhook - plays first message
router.get('/greeting', exotelVoiceController.handleGreeting.bind(exotelVoiceController));
router.post('/greeting', exotelVoiceController.handleGreeting.bind(exotelVoiceController));

// User input webhook - processes recorded audio
router.post('/input', exotelVoiceController.handleUserInput.bind(exotelVoiceController));

// Continuation webhook - continues conversation loop
router.get('/continue', exotelVoiceController.handleContinuation.bind(exotelVoiceController));
router.post('/continue', exotelVoiceController.handleContinuation.bind(exotelVoiceController));

// Call end webhook - cleanup and save transcript
router.post('/end', exotelVoiceController.handleCallEnd.bind(exotelVoiceController));

export default router;
