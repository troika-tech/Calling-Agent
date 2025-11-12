import { WebSocketClient, wsManager } from '../websocket.server';
import { voicePipelineService, VoicePipelineConfig } from '../../services/voicePipeline.service';
import { Agent } from '../../models/Agent';
import { CallLog } from '../../models/CallLog';
import { logger } from '../../utils/logger';

export class VoicePipelineHandler {
  /**
   * Initialize voice pipeline session
   */
  async handleInit(client: WebSocketClient, data: any): Promise<void> {
    try {
      const { callLogId, agentId } = data;

      logger.info('🔌 INIT CONNECTION (v2)', {
        clientId: client.id,
        callLogId,
        agentId
      });

      // Get agent configuration
      const agent = await Agent.findById(agentId);
      if (!agent) {
        logger.error('❌ Agent not found (v2)', { agentId });
        throw new Error('Agent not found');
      }

      // Get call log
      const callLog = await CallLog.findById(callLogId);
      if (!callLog) {
        logger.error('❌ Call log not found (v2)', { callLogId });
        throw new Error('Call log not found');
      }

      logger.info('✅ AGENT LOADED (v2)', { agentName: agent.name });

      // Store session info on client
      client.callLogId = callLogId;
      client.agentId = agentId;

      // Initialize voice pipeline
      const config: VoicePipelineConfig = {
        agentId,
        callLogId,
        systemPrompt: agent.config.prompt,
        voiceProvider: agent.config.voice.provider || 'openai',
        voiceId: agent.config.voice.voiceId,
        language: agent.config.language,
        voiceSettings: {
          stability: agent.config.voice.settings?.stability ?? 0.5,
          similarityBoost: agent.config.voice.settings?.similarityBoost ?? 0.75
        },
        llmConfig: {
          model: agent.config.llm?.model,
          temperature: agent.config.llm?.temperature,
          maxTokens: agent.config.llm?.maxTokens
        }
      };

      await voicePipelineService.initializeSession(config, {
        existingTranscript: (callLog as any)?.transcript
      });

      // Send first message if configured
      if (agent.config.firstMessage) {
        logger.info('🎤 GENERATING GREETING (v2)', {
          greeting: agent.config.firstMessage,
          provider: config.voiceProvider,
          voiceId: config.voiceId
        });

        const firstAudio = await voicePipelineService.generateFirstMessage(
          agent.config.firstMessage,
          config
        );

        logger.info('✅ GREETING AUDIO READY (v2)', {
          audioSize: firstAudio.length
        });

        wsManager.sendMessage(client, {
          type: 'audio_response',
          data: {
            audio: firstAudio.toString('base64'),
            text: agent.config.firstMessage
          }
        });

        logger.info('✅ GREETING SENT (v2)');
      }

      wsManager.sendMessage(client, {
        type: 'init_success',
        data: {
          callLogId,
          agentName: agent.name,
          message: 'Voice pipeline initialized'
        }
      });

      logger.info('✅ INIT COMPLETE (v2)', {
        clientId: client.id,
        callLogId
      });
    } catch (error: any) {
      logger.error('❌ INIT FAILED (v2)', {
        clientId: client.id,
        error: error.message,
        stack: error.stack
      });

      wsManager.sendMessage(client, {
        type: 'error',
        data: { error: error.message }
      });
    }
  }

  /**
   * Handle incoming audio data
   */
  async handleAudio(client: WebSocketClient, audioData: Buffer): Promise<void> {
    try {
      if (!client.callLogId || !client.agentId) {
        throw new Error('Session not initialized');
      }

      logger.info('Processing audio input', {
        clientId: client.id,
        audioSize: audioData.length
      });

      // Send processing started event
      wsManager.sendMessage(client, {
        type: 'processing_started',
        data: {}
      });

      // Get agent for config
      const agent = await Agent.findById(client.agentId);
      if (!agent) {
        throw new Error('Agent not found');
      }

      const config: VoicePipelineConfig = {
        agentId: client.agentId,
        callLogId: client.callLogId,
        systemPrompt: agent.config.prompt,
        voiceProvider: agent.config.voice.provider || 'openai',
        voiceId: agent.config.voice.voiceId,
        language: agent.config.language,
        voiceSettings: {
          stability: agent.config.voice.settings?.stability ?? 0.5,
          similarityBoost: agent.config.voice.settings?.similarityBoost ?? 0.75
        },
        llmConfig: {
          model: agent.config.llm?.model,
          temperature: agent.config.llm?.temperature,
          maxTokens: agent.config.llm?.maxTokens
        }
      };

      // Process with streaming for real-time feedback
      for await (const event of voicePipelineService.processStreamingTurn(
        client.callLogId,
        audioData,
        config
      )) {
        wsManager.sendMessage(client, {
          type: event.type,
          data: event.data
        });

        // Send audio response when TTS is complete
        if (event.type === 'tts_complete') {
          wsManager.sendMessage(client, {
            type: 'audio_response',
            data: {
              audio: event.data.audio.toString('base64')
            }
          });
        }
      }

      wsManager.sendMessage(client, {
        type: 'processing_complete',
        data: {}
      });

      logger.info('Audio processing completed', {
        clientId: client.id
      });
    } catch (error: any) {
      logger.error('Failed to process audio', {
        clientId: client.id,
        error: error.message
      });

      wsManager.sendMessage(client, {
        type: 'error',
        data: { error: error.message }
      });
    }
  }

  /**
   * Handle text input (for testing without audio)
   */
  async handleText(client: WebSocketClient, data: any): Promise<void> {
    try {
      if (!client.callLogId || !client.agentId) {
        throw new Error('Session not initialized');
      }

      const { text } = data;

      logger.info('Processing text input', {
        clientId: client.id,
        text
      });

      // Get agent
      const agent = await Agent.findById(client.agentId);
      if (!agent) {
        throw new Error('Agent not found');
      }

      // Get conversation history
      const history = voicePipelineService.getConversationHistory(client.callLogId);

      // Add user message
      history.push({
        role: 'user',
        content: text
      });

      // Send to LLM
      const { openaiService } = await import('../../services/openai.service');
      const completion = await openaiService.getChatCompletion(history, {
        model: agent.config.llm?.model,
        temperature: agent.config.llm?.temperature,
        maxTokens: agent.config.llm?.maxTokens
      });

      // Add assistant response
      history.push({
        role: 'assistant',
        content: completion.text
      });

      // Send text response
      wsManager.sendMessage(client, {
        type: 'text_response',
        data: {
          text: completion.text
        }
      });

      logger.info('Text processing completed', {
        clientId: client.id
      });
    } catch (error: any) {
      logger.error('Failed to process text', {
        clientId: client.id,
        error: error.message
      });

      wsManager.sendMessage(client, {
        type: 'error',
        data: { error: error.message }
      });
    }
  }

  /**
   * Handle session end
   */
  async handleEnd(client: WebSocketClient): Promise<void> {
    try {
      if (!client.callLogId) {
        return;
      }

      logger.info('Ending voice pipeline session', {
        clientId: client.id,
        callLogId: client.callLogId
      });

      await voicePipelineService.endSession(client.callLogId);

      wsManager.sendMessage(client, {
        type: 'session_ended',
        data: { callLogId: client.callLogId }
      });

      logger.info('Voice pipeline session ended', {
        clientId: client.id
      });
    } catch (error: any) {
      logger.error('Failed to end session', {
        clientId: client.id,
        error: error.message
      });
    }
  }
}

export const voicePipelineHandler = new VoicePipelineHandler();
