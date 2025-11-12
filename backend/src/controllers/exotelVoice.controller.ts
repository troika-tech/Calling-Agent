import { Request, Response, NextFunction } from 'express';
import { Phone } from '../models/Phone';
import { CallLog } from '../models/CallLog';
import { Agent } from '../models/Agent';
import { logger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';
import { voicePipelineService, VoicePipelineConfig } from '../services/voicePipeline.service';
import { exotelService } from '../services/exotel.service';

/**
 * Exotel Voice Controller
 * Handles voice call flows with AI agent integration
 */
export class ExotelVoiceController {
  /**
   * Handle call - Unified entry point for both incoming and outgoing calls
   * Works with Voicebot applet for both directions:
   * - Incoming: Voicebot applet configured on phone number
   * - Outbound: Voicebot applet configured in applet settings
   * 
   * Detection logic:
   * 1. Check CustomField (outbound calls include callLogId)
   * 2. Check CallSid (fallback for existing calls)
   * 3. Create new CallLog (incoming calls without CustomField)
   * 
   * Returns WebSocket URL to connect call to agent
   */
  async handleIncomingCall(req: Request, res: Response, _next: NextFunction) {
    try {
      // Log raw webhook data first for debugging
      logger.info('==== INCOMING WEBHOOK REQUEST ====', {
        method: req.method,
        url: req.url,
        query: JSON.stringify(req.query),
        body: JSON.stringify(req.body),
        headers: JSON.stringify(req.headers)
      });

      // Exotel sends GET/POST request with query params or body
      const webhookData = exotelService.parseWebhook(req.method === 'GET' ? req.query : req.body);

      logger.info('Call webhook received (parsed)', {
        callSid: webhookData.CallSid,
        from: webhookData.CallFrom,
        to: webhookData.CallTo,
        customField: webhookData.CustomField,
        direction: webhookData.Direction
      });

      let callLog;

      // STEP 1: Check if this is an outbound call (CallLog already exists)
      // Outbound calls pass callLogId in CustomField when making the call
      if (webhookData.CustomField) {
        callLog = await CallLog.findById(webhookData.CustomField)
          .populate('agentId')
          .populate('userId');

        if (callLog) {
          logger.info('Found existing CallLog for outbound call', {
            callLogId: callLog._id,
            callSid: webhookData.CallSid,
            direction: callLog.direction
          });

          // Update Exotel CallSid if not already set
          if (!callLog.exotelCallSid && webhookData.CallSid) {
            callLog.exotelCallSid = webhookData.CallSid;
            await callLog.save();
          }
        }
      }

      // STEP 2: If not found by CustomField, try finding by CallSid
      if (!callLog && webhookData.CallSid) {
        callLog = await CallLog.findOne({ exotelCallSid: webhookData.CallSid })
          .populate('agentId')
          .populate('userId');

        if (callLog) {
          logger.info('Found existing CallLog by CallSid', {
            callLogId: callLog._id,
            callSid: webhookData.CallSid,
            direction: callLog.direction
          });
        }
      }

      // STEP 3: If still not found, treat as incoming call and create CallLog
      if (!callLog) {
        logger.info('No existing CallLog found, treating as incoming call', {
          callSid: webhookData.CallSid,
          to: webhookData.CallTo,
          from: webhookData.CallFrom,
          direction: webhookData.Direction,
          fullWebhookData: JSON.stringify(webhookData)
        });

        // Find phone configuration (required for incoming calls)
        // Try to find phone by exact match first
        let phone = await Phone.findOne({ number: webhookData.CallTo })
          .populate('agentId')
          .populate('userId');

        // If not found, try normalizing the number (remove + prefix if present)
        if (!phone && webhookData.CallTo) {
          const normalizedNumber = webhookData.CallTo.replace(/^\+/, '');
          logger.info('Trying to find phone with normalized number', {
            original: webhookData.CallTo,
            normalized: normalizedNumber
          });

          phone = await Phone.findOne({
            $or: [
              { number: normalizedNumber },
              { number: `+${normalizedNumber}` }
            ]
          })
            .populate('agentId')
            .populate('userId');
        }

        if (!phone) {
          logger.error('Phone not found in database', {
            number: webhookData.CallTo,
            availablePhones: await Phone.find({}).select('number').limit(10)
          });
        }

        if (!phone || !phone.agentId) {
          logger.warn('Phone not configured or no agent assigned', {
            number: webhookData.CallTo,
            phoneFound: !!phone,
            agentAssigned: !!(phone?.agentId)
          });

          // Return error response
          res.set('Content-Type', 'application/json');
          res.status(404).json({
            error: 'Phone not configured',
            message: 'This number is not configured for AI calls'
          });
          return;
        }

        const agent = phone.agentId as any;

        // Create call log for incoming call
        const sessionId = uuidv4();
        callLog = await CallLog.create({
          sessionId,
          userId: phone.userId,
          phoneId: phone._id,
          agentId: agent._id,
          fromPhone: webhookData.CallFrom,
          toPhone: webhookData.CallTo,
          direction: 'inbound',
          status: 'ringing',
          exotelCallSid: webhookData.CallSid,
          startedAt: new Date(),
          transcript: [],
          metadata: {
            agentName: agent.name,
            agentPrompt: agent.config?.prompt
          }
        });

        logger.info('Call log created for incoming call', {
          callSid: webhookData.CallSid,
          sessionId,
          callLogId: callLog._id
        });
      }

      // STEP 4: Verify CallLog has required data
      if (!callLog.agentId) {
        logger.error('CallLog missing agentId', {
          callLogId: callLog._id
        });

        res.set('Content-Type', 'application/json');
        res.status(500).json({
          error: 'Agent not found',
          message: 'CallLog is missing agent configuration'
        });
        return;
      }

      // STEP 5: Return WebSocket URL (works for both incoming and outgoing)
      const baseUrl = process.env.WEBHOOK_BASE_URL || 'http://localhost:5000';
      const wsProtocol = baseUrl.startsWith('https') ? 'wss' : 'ws';
      const wsHost = baseUrl.replace('https://', '').replace('http://', '');
      const websocketUrl = `${wsProtocol}://${wsHost}/ws/exotel/voice/${callLog._id}`;

      const responsePayload = {
        url: websocketUrl
      };

      logger.info('Returning WebSocket URL to Exotel', {
        callLogId: callLog._id,
        direction: callLog.direction,
        websocketUrl,
        baseUrl
      });

      // Return WebSocket URL in JSON format as per Exotel documentation
      // Reference: https://support.exotel.com/support/solutions/articles/3000108630
      // For dynamic HTTP endpoints, Exotel expects JSON with "url" key
      res.set('Content-Type', 'application/json');
      res.status(200).json(responsePayload);
    } catch (error: any) {
      logger.error('Error handling call webhook', { 
        error: error.message,
        stack: error.stack 
      });

      // Return error response
      res.set('Content-Type', 'application/json');
      res.status(500).json({
        error: 'Internal server error',
        message: 'An error occurred while processing the call'
      });
    }
  }

  /**
   * Handle greeting - Play first message to caller
   */
  async handleGreeting(req: Request, res: Response, _next: NextFunction) {
    try {
      const { callLogId } = req.query;

      logger.info('Greeting webhook called', { callLogId });

      if (!callLogId) {
        res.status(400).json({ error: 'Missing callLogId' });
        return;
      }

      // Get call log and agent
      const callLog = await CallLog.findById(callLogId).populate('agentId');
      if (!callLog || !callLog.agentId) {
        res.status(404).json({ error: 'Call log or agent not found' });
        return;
      }

      const agent = callLog.agentId as any;

      // Update call status
      callLog.status = 'in-progress';
      await callLog.save();

      const config: VoicePipelineConfig = {
        agentId: agent._id.toString(),
        callLogId: callLog._id.toString(),
        systemPrompt: agent.config.prompt,
        voiceProvider: agent.config.voice.provider || 'openai',
        voiceId: agent.config.voice.voiceId,
        language: agent.config.language || 'en',
        voiceSettings: {
          stability: agent.config.voice.settings?.stability ?? 0.5,
          similarityBoost: agent.config.voice.settings?.similarityBoost ?? 0.75,
          modelId: agent.config.voice.settings?.modelId
        },
        llmConfig: {
          model: agent.config.llm?.model,
          temperature: agent.config.llm?.temperature,
          maxTokens: agent.config.llm?.maxTokens
        }
      };

      // Initialize conversation (noop if already initialized)
      await voicePipelineService.initializeSession(config, {
        existingTranscript: (callLog as any)?.transcript
      });

      // Check if agent has first message
      const firstMessage =
        agent.config?.firstMessage || 'Hello! How can I help you today?';

      // Generate greeting audio using voice pipeline
      const audioBuffer = await voicePipelineService.generateFirstMessage(
        firstMessage,
        config
      );

      // Save transcript
      if (!callLog.transcript) {
        callLog.transcript = [];
      }
      callLog.transcript.push({
        speaker: 'assistant',
        text: firstMessage,
        timestamp: new Date()
      });
      await callLog.save();

      logger.info('Greeting audio generated', {
        callLogId,
        messageLength: firstMessage.length,
        audioSize: audioBuffer.length
      });

      // Return audio
      res.set('Content-Type', 'audio/mpeg');
      res.status(200).send(audioBuffer);
    } catch (error: any) {
      logger.error('Error in greeting handler', { error: error.message });
      res.status(500).json({ error: 'Failed to generate greeting' });
    }
  }

  /**
   * Handle user input - Process recorded audio from user
   */
  async handleUserInput(req: Request, res: Response, _next: NextFunction) {
    try {
      const { callLogId } = req.query;
      const webhookData = exotelService.parseWebhook(req.body);

      logger.info('User input webhook called', {
        callLogId,
        recordingUrl: webhookData.RecordingUrl
      });

      if (!callLogId || !webhookData.RecordingUrl) {
        res.status(400).json({ error: 'Missing callLogId or recording URL' });
        return;
      }

      // Get call log and agent
      const callLog = await CallLog.findById(callLogId).populate('agentId');
      if (!callLog || !callLog.agentId) {
        res.status(404).json({ error: 'Call log or agent not found' });
        return;
      }

      const agent = callLog.agentId as any;

      // Download audio from Exotel
      const audioBuffer = await exotelService.downloadRecording(webhookData.RecordingUrl);

      logger.info('Audio downloaded from Exotel', {
        callLogId,
        audioSize: audioBuffer.length
      });

      // Process through voice pipeline
      const config: VoicePipelineConfig = {
        agentId: agent._id.toString(),
        callLogId: callLog._id.toString(),
        systemPrompt: agent.config.prompt,
        voiceProvider: agent.config.voice.provider || 'openai',
        voiceId: agent.config.voice.voiceId,
        language: agent.config.language || 'en',
        voiceSettings: {
          stability: agent.config.voice.settings?.stability ?? 0.5,
          similarityBoost: agent.config.voice.settings?.similarityBoost ?? 0.75,
          modelId: agent.config.voice.settings?.modelId
        },
        llmConfig: {
          model: agent.config.llm?.model,
          temperature: agent.config.llm?.temperature,
          maxTokens: agent.config.llm?.maxTokens
        }
      };

      // Initialize session if not already done
      await voicePipelineService.initializeSession(config, {
        existingTranscript: (callLog as any)?.transcript
      });

      // Process conversation turn
      const turn = await voicePipelineService.processConversationTurn(
        callLog._id.toString(),
        audioBuffer,
        config
      );

      logger.info('Voice pipeline processing complete', {
        callLogId,
        userText: turn.userText,
        assistantText: turn.assistantText
      });

      // Return assistant's voice response
      res.set('Content-Type', 'audio/mpeg');
      res.status(200).send(turn.assistantAudio);
    } catch (error: any) {
      logger.error('Error in user input handler', { error: error.message });

      // Return error message as audio
      const errorMessage = 'I apologize, but I encountered an error. Please try again.';
      res.status(500).json({ error: errorMessage });
    }
  }

  /**
   * Handle call end - Cleanup and save final transcript
   */
  async handleCallEnd(req: Request, res: Response, _next: NextFunction) {
    try {
      const { callLogId } = req.query;
      const webhookData = exotelService.parseWebhook(req.body);

      logger.info('Call end webhook called', {
        callLogId,
        callSid: webhookData.CallSid,
        duration: webhookData.Duration
      });

      if (!callLogId) {
        res.status(200).json({ success: true });
        return;
      }

      // Get call log
      const callLog = await CallLog.findById(callLogId);
      if (!callLog) {
        res.status(200).json({ success: true });
        return;
      }

      // Update call log with final details
      callLog.status = 'completed';
      callLog.endedAt = new Date();

      if (webhookData.Duration) {
        callLog.durationSec = parseInt(webhookData.Duration, 10);
      }

      if (webhookData.RecordingUrl) {
        callLog.recordingUrl = webhookData.RecordingUrl;
      }

      // Generate call summary from transcript
      if (callLog.transcript && Array.isArray(callLog.transcript) && callLog.transcript.length > 0) {
        const transcriptText = callLog.transcript
          .map(t => `${t.speaker}: ${t.text}`)
          .join('\n');

        callLog.summary = `Call with ${callLog.fromPhone}. ${callLog.transcript.length} exchanges.`;
        callLog.metadata = {
          ...callLog.metadata,
          transcriptText
        };
      }

      await callLog.save();

      // Clean up voice pipeline session
      await voicePipelineService.endSession(callLog._id.toString());

      logger.info('Call ended and logged', {
        callLogId,
        duration: callLog.durationSec,
        transcriptLength: callLog.transcript.length
      });

      res.status(200).json({ success: true });
    } catch (error: any) {
      logger.error('Error in call end handler', { error: error.message });
      res.status(200).json({ success: true }); // Still return success to Exotel
    }
  }

  /**
   * Generate Exotel Flow XML for voice interaction
   */
  private generateVoiceFlow(callLogId: string, agent: any): string {
    const baseUrl = process.env.WEBHOOK_BASE_URL || 'http://localhost:5000';
    const greetingUrl = `${baseUrl}/api/v1/exotel/voice/greeting?callLogId=${callLogId}`;
    const inputUrl = `${baseUrl}/api/v1/exotel/voice/input?callLogId=${callLogId}`;
    const endUrl = `${baseUrl}/api/v1/exotel/voice/end?callLogId=${callLogId}`;

    // Exotel Flow XML with conversational loop
    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="woman" language="en-IN">Connecting you to ${agent.name}</Say>

  <!-- Play greeting -->
  <Play>${greetingUrl}</Play>

  <!-- Conversation loop -->
  <Gather action="${inputUrl}" method="POST" timeout="10" finishOnKey="#" maxLength="1">
    <Record maxLength="60" playBeep="true" />
  </Gather>

  <!-- If timeout or no input, say goodbye -->
  <Say voice="woman" language="en-IN">Thank you for calling. Goodbye!</Say>

  <!-- Call end callback -->
  <Hangup statusCallback="${endUrl}" />
</Response>`;
  }


  /**
   * Generate continuation flow for multi-turn conversation
   */
  async handleContinuation(req: Request, res: Response, _next: NextFunction) {
    try {
      const { callLogId } = req.query;

      const baseUrl = process.env.WEBHOOK_BASE_URL || 'http://localhost:5000';
      const inputUrl = `${baseUrl}/api/v1/exotel/voice/input?callLogId=${callLogId}`;
      const endUrl = `${baseUrl}/api/v1/exotel/voice/end?callLogId=${callLogId}`;

      // Continue conversation loop
      const continuationFlow = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <!-- Continue gathering user input -->
  <Gather action="${inputUrl}" method="POST" timeout="10" finishOnKey="#" maxLength="1">
    <Record maxLength="60" playBeep="true" />
  </Gather>

  <!-- If no more input, end call -->
  <Say voice="woman" language="en-IN">Thank you for calling. Goodbye!</Say>
  <Hangup statusCallback="${endUrl}" />
</Response>`;

      res.set('Content-Type', 'application/xml');
      res.status(200).send(continuationFlow);
    } catch (error: any) {
      logger.error('Error in continuation handler', { error: error.message });
      res.status(500).json({ error: 'Failed to generate continuation flow' });
    }
  }
}

export const exotelVoiceController = new ExotelVoiceController();
