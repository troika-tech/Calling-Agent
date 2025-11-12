import { Server as HTTPServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { IncomingMessage } from 'http';
import { logger } from '../utils/logger';
import { voicePipelineHandler } from './handlers/voicePipeline.handler';
import { exotelVoiceHandler } from './handlers/exotelVoice.handler';

export interface WebSocketClient extends WebSocket {
  id: string;
  callLogId?: string;
  agentId?: string;
  isAlive: boolean;
  connectionType?: 'frontend' | 'exotel';
}

export class WebSocketManager {
  private wss: WebSocketServer;
  private clients: Map<string, WebSocketClient>;
  private heartbeatInterval: NodeJS.Timeout | null;

  constructor(server: HTTPServer) {
    this.wss = new WebSocketServer({
      noServer: true // We'll handle routing manually
    });

    this.clients = new Map();
    this.heartbeatInterval = null;

    this.initialize(server);

    logger.info('WebSocket server initialized', {
      paths: ['/ws', '/ws/exotel/voice/:callLogId']
    });
  }

  private initialize(server: HTTPServer): void {
    // Handle upgrade requests manually for path-based routing
    server.on('upgrade', (request: IncomingMessage, socket, head) => {
      const pathname = request.url || '';

      logger.debug('WebSocket upgrade request', { pathname });

      // Route to appropriate handler
      if (pathname.startsWith('/ws/exotel/voice/')) {
        // Exotel voice streaming
        this.wss.handleUpgrade(request, socket, head, (ws) => {
          this.handleExotelConnection(ws, request);
        });
      } else if (pathname === '/ws' || pathname.startsWith('/ws?')) {
        // Frontend voice pipeline
        this.wss.handleUpgrade(request, socket, head, (ws) => {
          this.handleFrontendConnection(ws, request);
        });
      } else {
        // Unknown path
        socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
        socket.destroy();
      }
    });

    this.startHeartbeat();
  }

  private handleExotelConnection(ws: WebSocket, request: IncomingMessage): void {
    const client = ws as WebSocketClient;
    client.id = this.generateClientId();
    client.isAlive = true;
    client.connectionType = 'exotel';

    this.clients.set(client.id, client);

    // Extract callLogId from URL: /ws/exotel/voice/:callLogId
    const pathname = request.url || '';
    const match = pathname.match(/\/ws\/exotel\/voice\/([^/?]+)/);
    const callLogId = match ? match[1] : null;

    logger.info('Exotel WebSocket connected', {
      clientId: client.id,
      callLogId,
      totalClients: this.clients.size
    });

    if (!callLogId) {
      logger.error('No callLogId in Exotel WebSocket URL');
      client.close(1008, 'Missing callLogId');
      return;
    }

    // Initialize Exotel voice session
    exotelVoiceHandler.handleConnection(client, callLogId).catch((error) => {
      logger.error('Failed to initialize Exotel session', {
        clientId: client.id,
        error: error.message
      });
      client.close(1011, 'Session initialization failed');
    });

    // Handle pong for heartbeat
    client.on('pong', () => {
      client.isAlive = true;
    });

    // Handle incoming messages from Exotel
    client.on('message', async (data: Buffer) => {
      try {
        await exotelVoiceHandler.handleMessage(client, data);
      } catch (error: any) {
        logger.error('Error handling Exotel message', {
          clientId: client.id,
          error: error.message
        });
      }
    });

    // Handle disconnect
    client.on('close', () => {
      logger.info('Exotel WebSocket disconnected', {
        clientId: client.id,
        callLogId: client.callLogId
      });

      exotelVoiceHandler.handleDisconnect(client).catch((error) => {
        logger.error('Error cleaning up Exotel session', {
          clientId: client.id,
          error: error.message
        });
      });

      this.clients.delete(client.id);
    });

    // Handle errors
    client.on('error', (error) => {
      logger.error('Exotel WebSocket error', {
        clientId: client.id,
        error: error.message
      });
    });
  }

  private handleFrontendConnection(ws: WebSocket, request: IncomingMessage): void {
    const client = ws as WebSocketClient;
    client.id = this.generateClientId();
    client.isAlive = true;
    client.connectionType = 'frontend';

    this.clients.set(client.id, client);

    logger.info('WebSocket client connected', {
      clientId: client.id,
      totalClients: this.clients.size
    });

    // Send welcome message
    this.sendMessage(client, {
      type: 'connected',
      data: { clientId: client.id }
    });

    // Handle pong response for heartbeat
    client.on('pong', () => {
      client.isAlive = true;
    });

    // Handle incoming messages
    client.on('message', async (data: Buffer) => {
      try {
        await this.handleMessage(client, data);
      } catch (error: any) {
        logger.error('Error handling WebSocket message', {
          clientId: client.id,
          error: error.message
        });

        this.sendMessage(client, {
          type: 'error',
          data: { error: error.message }
        });
      }
    });

    // Handle client disconnect
    client.on('close', () => {
      this.handleDisconnect(client);
    });

    // Handle errors
    client.on('error', (error) => {
      logger.error('WebSocket error', {
        clientId: client.id,
        error: error.message
      });
    });
  }

  private async handleMessage(client: WebSocketClient, data: Buffer): Promise<void> {
    try {
      // Try to parse as JSON first
      const message = JSON.parse(data.toString());

      logger.debug('Received WebSocket message', {
        clientId: client.id,
        type: message.type
      });

      // Route message to appropriate handler
      switch (message.type) {
        case 'init':
          await voicePipelineHandler.handleInit(client, message.data);
          break;

        case 'audio':
          // Audio data will be in base64 or binary
          await voicePipelineHandler.handleAudio(
            client,
            Buffer.from(message.data.audio, 'base64')
          );
          break;

        case 'text':
          await voicePipelineHandler.handleText(client, message.data);
          break;

        case 'end':
          await voicePipelineHandler.handleEnd(client);
          break;

        case 'ping':
          this.sendMessage(client, { type: 'pong', data: {} });
          break;

        default:
          logger.warn('Unknown message type', {
            clientId: client.id,
            type: message.type
          });
      }
    } catch (error: any) {
      // If not JSON, treat as binary audio data
      if (error instanceof SyntaxError) {
        await voicePipelineHandler.handleAudio(client, data);
      } else {
        throw error;
      }
    }
  }

  private handleDisconnect(client: WebSocketClient): void {
    logger.info('WebSocket client disconnected', {
      clientId: client.id,
      callLogId: client.callLogId
    });

    // Clean up voice pipeline session if exists
    if (client.callLogId) {
      voicePipelineHandler.handleEnd(client).catch((error) => {
        logger.error('Error cleaning up on disconnect', {
          clientId: client.id,
          error: error.message
        });
      });
    }

    this.clients.delete(client.id);

    logger.info('Client removed', {
      totalClients: this.clients.size
    });
  }

  private startHeartbeat(): void {
    // Send ping to all clients every 30 seconds
    this.heartbeatInterval = setInterval(() => {
      this.wss.clients.forEach((ws) => {
        const client = ws as WebSocketClient;

        if (client.isAlive === false) {
          logger.warn('Client not responding to heartbeat, terminating', {
            clientId: client.id
          });
          return client.terminate();
        }

        client.isAlive = false;
        client.ping();
      });
    }, 30000);

    logger.info('WebSocket heartbeat started', {
      interval: '30s'
    });
  }

  public sendMessage(client: WebSocketClient, message: any): void {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(message));
    }
  }

  public sendBinary(client: WebSocketClient, data: Buffer): void {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  }

  public broadcast(message: any): void {
    this.clients.forEach((client) => {
      this.sendMessage(client, message);
    });
  }

  public getClient(clientId: string): WebSocketClient | undefined {
    return this.clients.get(clientId);
  }

  public getClientsByCallLog(callLogId: string): WebSocketClient[] {
    return Array.from(this.clients.values()).filter(
      (client) => client.callLogId === callLogId
    );
  }

  public getClientCount(): number {
    return this.clients.size;
  }

  private generateClientId(): string {
    return `ws_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  public shutdown(): void {
    logger.info('Shutting down WebSocket server');

    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    this.wss.clients.forEach((client) => {
      client.close();
    });

    this.wss.close();
    this.clients.clear();

    logger.info('WebSocket server shut down');
  }
}

export let wsManager: WebSocketManager;

export function initializeWebSocket(server: HTTPServer): void {
  wsManager = new WebSocketManager(server);
}
