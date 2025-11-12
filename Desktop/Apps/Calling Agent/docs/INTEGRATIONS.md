# Integration Guides

## Table of Contents
- [Exotel Integration](#exotel-integration)
- [OpenAI Integration](#openai-integration)
- [Deepgram Integration](#deepgram-integration)
- [ElevenLabs Integration](#elevenlabs-integration)
- [AWS S3 Integration](#aws-s3-integration)
- [Redis Integration](#redis-integration)

---

## Exotel Integration

Exotel is the telephony provider for making and receiving calls.

### Setup

1. **Create Exotel Account**
   - Sign up at [https://exotel.com](https://exotel.com)
   - Verify your account
   - Purchase or import phone numbers

2. **Get API Credentials**
   - Login to Exotel dashboard
   - Go to Settings → API Settings
   - Note down:
     - API Key
     - API Token
     - SID (Account SID)
     - Subdomain

3. **Configure Environment**
   ```bash
   EXOTEL_API_KEY=your-api-key
   EXOTEL_API_TOKEN=your-api-token
   EXOTEL_SID=your-sid
   EXOTEL_SUBDOMAIN=your-subdomain
   EXOTEL_BASE_URL=https://api.exotel.com/v2/accounts
   ```

### Implementation

**Service Class:**
```typescript
// services/exotel.service.ts
import axios from 'axios';
import { logger } from '../utils/logger';

export class ExotelService {
  private baseUrl: string;
  private auth: { username: string; password: string };

  constructor() {
    this.baseUrl = `${process.env.EXOTEL_BASE_URL}/${process.env.EXOTEL_SID}`;
    this.auth = {
      username: process.env.EXOTEL_API_KEY!,
      password: process.env.EXOTEL_API_TOKEN!
    };
  }

  /**
   * Make an outbound call
   */
  async makeCall(
    fromPhone: string,
    toPhone: string,
    callbackUrl: string
  ): Promise<{ callSid: string }> {
    try {
      const response = await axios.post(
        `${this.baseUrl}/Calls/connect.json`,
        {
          From: fromPhone,
          To: toPhone,
          CallerId: fromPhone,
          Url: callbackUrl,
          StatusCallback: `${process.env.WEBHOOK_BASE_URL}/api/v1/webhooks/exotel/status`,
          StatusCallbackMethod: 'POST',
          StatusCallbackEvent: ['initiated', 'ringing', 'in-progress', 'completed', 'failed']
        },
        {
          auth: this.auth,
          headers: { 'Content-Type': 'application/json' }
        }
      );

      logger.info('Outbound call initiated', {
        callSid: response.data.Call.Sid,
        from: fromPhone,
        to: toPhone
      });

      return { callSid: response.data.Call.Sid };
    } catch (error) {
      logger.error('Error making call', { error, fromPhone, toPhone });
      throw new Error('Failed to initiate call');
    }
  }

  /**
   * Get call details
   */
  async getCallDetails(callSid: string) {
    try {
      const response = await axios.get(
        `${this.baseUrl}/Calls/${callSid}.json`,
        { auth: this.auth }
      );

      return response.data.Call;
    } catch (error) {
      logger.error('Error fetching call details', { error, callSid });
      throw error;
    }
  }

  /**
   * End an active call
   */
  async endCall(callSid: string) {
    try {
      await axios.post(
        `${this.baseUrl}/Calls/${callSid}`,
        { Status: 'completed' },
        { auth: this.auth }
      );

      logger.info('Call ended', { callSid });
    } catch (error) {
      logger.error('Error ending call', { error, callSid });
      throw error;
    }
  }

  /**
   * Generate Exotel XML response for incoming calls
   */
  generateIncomingCallResponse(
    agentConfig: any,
    sessionId: string
  ): string {
    const firstMessage = agentConfig.firstMessage || 'Hello';

    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="${agentConfig.voice.voiceId}" language="${agentConfig.language}">
    ${this.escapeXml(firstMessage)}
  </Say>
  <Record action="${process.env.WEBHOOK_BASE_URL}/api/v1/webhooks/exotel/recording/${sessionId}"
          method="POST"
          maxLength="3600"
          finishOnKey="#" />
</Response>`;
  }

  private escapeXml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }
}
```

### Webhook Handlers

**Incoming Call Webhook:**
```typescript
// controllers/webhook.controller.ts
export class WebhookController {
  private exotelService = new ExotelService();

  async handleIncomingCall(req: Request, res: Response) {
    try {
      const { From, To, CallSid, Direction } = req.body;

      logger.info('Incoming call received', { From, To, CallSid });

      // Find phone number and assigned agent
      const phone = await Phone.findOne({ number: To });
      if (!phone || !phone.agentId) {
        return res.status(404).send('No agent assigned');
      }

      const agent = await Agent.findById(phone.agentId);
      if (!agent) {
        return res.status(404).send('Agent not found');
      }

      // Create session and call log
      const sessionId = `sess_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      await Session.create({
        sessionId,
        userId: agent.userId,
        agentId: agent._id,
        userPhone: From,
        agentPhone: To,
        agentConfig: agent.config,
        status: 'active',
        exotelCallSid: CallSid
      });

      await CallLog.create({
        sessionId,
        userId: agent.userId,
        agentId: agent._id,
        fromPhone: From,
        toPhone: To,
        direction: 'inbound',
        status: 'initiated',
        exotelCallSid: CallSid
      });

      // Return Exotel XML
      const xml = this.exotelService.generateIncomingCallResponse(
        agent.config,
        sessionId
      );

      res.type('application/xml').send(xml);
    } catch (error) {
      logger.error('Error handling incoming call', { error });
      res.status(500).send('Internal server error');
    }
  }

  async handleCallStatus(req: Request, res: Response) {
    try {
      const { CallSid, CallStatus, CallDuration, RecordingUrl } = req.body;

      logger.info('Call status update', { CallSid, CallStatus });

      // Update call log
      const callLog = await CallLog.findOne({ exotelCallSid: CallSid });
      if (callLog) {
        callLog.status = this.mapExotelStatus(CallStatus);

        if (CallStatus === 'completed') {
          callLog.endedAt = new Date();
          callLog.durationSec = parseInt(CallDuration) || 0;
          callLog.recordingUrl = RecordingUrl;
        }

        await callLog.save();

        // Update session
        if (CallStatus === 'completed') {
          await Session.updateOne(
            { sessionId: callLog.sessionId },
            { status: 'ended' }
          );
        }

        // Emit WebSocket event
        this.socketService.emitCallStatus(callLog.sessionId, {
          status: CallStatus,
          duration: callLog.durationSec
        });
      }

      res.json({ success: true });
    } catch (error) {
      logger.error('Error handling call status', { error });
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  private mapExotelStatus(exotelStatus: string): string {
    const statusMap: Record<string, string> = {
      'initiated': 'initiated',
      'ringing': 'ringing',
      'in-progress': 'in-progress',
      'completed': 'completed',
      'busy': 'busy',
      'failed': 'failed',
      'no-answer': 'no-answer',
      'canceled': 'canceled'
    };

    return statusMap[exotelStatus] || 'unknown';
  }
}
```

### Testing Exotel Integration

```bash
# Test webhook locally with ngrok
ngrok http 5000

# Update WEBHOOK_BASE_URL in .env
WEBHOOK_BASE_URL=https://your-ngrok-url.ngrok.io

# Configure Exotel dashboard:
# - Incoming URL: https://your-ngrok-url.ngrok.io/api/v1/webhooks/exotel/incoming
# - Status Callback: https://your-ngrok-url.ngrok.io/api/v1/webhooks/exotel/status
```

---

## OpenAI Integration

OpenAI provides the LLM for conversation processing.

### Setup

1. **Get API Key**
   - Sign up at [https://platform.openai.com](https://platform.openai.com)
   - Go to API Keys section
   - Create new secret key

2. **Configure Environment**
   ```bash
   OPENAI_API_KEY=sk-your-openai-api-key
   ```

### Implementation

**Service Class:**
```typescript
// services/openai.service.ts
import OpenAI from 'openai';
import { logger } from '../utils/logger';

export class OpenAIService {
  private client: OpenAI;

  constructor() {
    this.client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
  }

  /**
   * Generate chat completion
   */
  async chat(
    messages: Array<{ role: string; content: string }>,
    agentConfig: any
  ): Promise<string> {
    try {
      const systemMessage = {
        role: 'system',
        content: agentConfig.prompt
      };

      const response = await this.client.chat.completions.create({
        model: agentConfig.llm.model || 'gpt-4',
        messages: [systemMessage, ...messages],
        temperature: agentConfig.llm.temperature || 0.7,
        max_tokens: agentConfig.llm.maxTokens || 500,
        user: messages[messages.length - 1].content
      });

      const completion = response.choices[0].message.content || '';

      logger.info('OpenAI response generated', {
        model: agentConfig.llm.model,
        tokens: response.usage
      });

      return completion;
    } catch (error) {
      logger.error('OpenAI API error', { error });
      throw new Error('Failed to generate response');
    }
  }

  /**
   * Generate streaming chat completion
   */
  async *chatStream(
    messages: Array<{ role: string; content: string }>,
    agentConfig: any
  ): AsyncGenerator<string> {
    try {
      const systemMessage = {
        role: 'system',
        content: agentConfig.prompt
      };

      const stream = await this.client.chat.completions.create({
        model: agentConfig.llm.model || 'gpt-4',
        messages: [systemMessage, ...messages],
        temperature: agentConfig.llm.temperature || 0.7,
        stream: true
      });

      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || '';
        if (content) {
          yield content;
        }
      }
    } catch (error) {
      logger.error('OpenAI streaming error', { error });
      throw error;
    }
  }

  /**
   * Calculate token count (approximate)
   */
  estimateTokens(text: string): number {
    // Rough estimation: ~4 characters per token
    return Math.ceil(text.length / 4);
  }

  /**
   * Calculate cost
   */
  calculateCost(model: string, inputTokens: number, outputTokens: number): number {
    const pricing: Record<string, { input: number; output: number }> = {
      'gpt-4': { input: 0.03 / 1000, output: 0.06 / 1000 },
      'gpt-4-turbo': { input: 0.01 / 1000, output: 0.03 / 1000 },
      'gpt-3.5-turbo': { input: 0.0005 / 1000, output: 0.0015 / 1000 }
    };

    const price = pricing[model] || pricing['gpt-4'];
    return (inputTokens * price.input) + (outputTokens * price.output);
  }
}
```

---

## Deepgram Integration

Deepgram provides Speech-to-Text services.

### Setup

1. **Get API Key**
   - Sign up at [https://deepgram.com](https://deepgram.com)
   - Get API key from console

2. **Configure Environment**
   ```bash
   DEEPGRAM_API_KEY=your-deepgram-api-key
   ```

### Implementation

```typescript
// services/deepgram.service.ts
import { createClient, LiveTranscriptionEvents } from '@deepgram/sdk';
import { logger } from '../utils/logger';

export class DeepgramService {
  private client: any;

  constructor() {
    this.client = createClient(process.env.DEEPGRAM_API_KEY!);
  }

  /**
   * Transcribe audio stream in real-time
   */
  async transcribeStream(
    audioStream: ReadableStream,
    options: {
      language?: string;
      model?: string;
    } = {}
  ): Promise<AsyncGenerator<string>> {
    try {
      const connection = this.client.listen.live({
        model: options.model || 'nova-2',
        language: options.language || 'en',
        smart_format: true,
        punctuate: true,
        interim_results: false,
        endpointing: 300 // milliseconds of silence
      });

      const transcripts: string[] = [];

      connection.on(LiveTranscriptionEvents.Open, () => {
        logger.info('Deepgram connection opened');
      });

      connection.on(LiveTranscriptionEvents.Transcript, (data: any) => {
        const transcript = data.channel.alternatives[0].transcript;
        if (transcript) {
          transcripts.push(transcript);
          logger.debug('Transcript received', { transcript });
        }
      });

      connection.on(LiveTranscriptionEvents.Error, (error: any) => {
        logger.error('Deepgram error', { error });
      });

      // Pipe audio stream to Deepgram
      audioStream.pipeTo(new WritableStream({
        write(chunk) {
          connection.send(chunk);
        },
        close() {
          connection.finish();
        }
      }));

      // Return async generator
      return (async function* () {
        for (const transcript of transcripts) {
          yield transcript;
        }
      })();
    } catch (error) {
      logger.error('Deepgram transcription error', { error });
      throw error;
    }
  }

  /**
   * Transcribe audio file
   */
  async transcribeFile(audioBuffer: Buffer): Promise<string> {
    try {
      const { result } = await this.client.listen.prerecorded.transcribeFile(
        audioBuffer,
        {
          model: 'nova-2',
          smart_format: true,
          punctuate: true
        }
      );

      const transcript = result.results.channels[0].alternatives[0].transcript;

      logger.info('File transcribed', {
        duration: result.metadata.duration,
        words: result.results.channels[0].alternatives[0].words.length
      });

      return transcript;
    } catch (error) {
      logger.error('Deepgram file transcription error', { error });
      throw error;
    }
  }

  /**
   * Calculate transcription cost
   */
  calculateCost(durationSeconds: number): number {
    // Deepgram pricing: ~$0.0043 per minute
    const minutes = durationSeconds / 60;
    return minutes * 0.0043;
  }
}
```

---

## ElevenLabs Integration

ElevenLabs provides Text-to-Speech services.

### Setup

1. **Get API Key**
   - Sign up at [https://elevenlabs.io](https://elevenlabs.io)
   - Get API key from profile

2. **Configure Environment**
   ```bash
   ELEVENLABS_API_KEY=your-elevenlabs-api-key
   ```

### Implementation

```typescript
// services/tts.service.ts
import axios from 'axios';
import { logger } from '../utils/logger';

export class TTSService {
  /**
   * Synthesize speech with ElevenLabs
   */
  async synthesizeElevenLabs(
    text: string,
    voiceId: string,
    options: {
      model?: string;
      stability?: number;
      similarity_boost?: number;
    } = {}
  ): Promise<Buffer> {
    try {
      const response = await axios.post(
        `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
        {
          text,
          model_id: options.model || 'eleven_turbo_v2',
          voice_settings: {
            stability: options.stability || 0.5,
            similarity_boost: options.similarity_boost || 0.75
          }
        },
        {
          headers: {
            'xi-api-key': process.env.ELEVENLABS_API_KEY,
            'Content-Type': 'application/json'
          },
          responseType: 'arraybuffer'
        }
      );

      logger.info('ElevenLabs TTS generated', { voiceId, textLength: text.length });

      return Buffer.from(response.data);
    } catch (error) {
      logger.error('ElevenLabs TTS error', { error });
      throw error;
    }
  }

  /**
   * Synthesize speech with OpenAI TTS
   */
  async synthesizeOpenAI(
    text: string,
    voice: string = 'alloy'
  ): Promise<Buffer> {
    try {
      const response = await axios.post(
        'https://api.openai.com/v1/audio/speech',
        {
          model: 'tts-1',
          input: text,
          voice
        },
        {
          headers: {
            'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
            'Content-Type': 'application/json'
          },
          responseType: 'arraybuffer'
        }
      );

      logger.info('OpenAI TTS generated', { voice, textLength: text.length });

      return Buffer.from(response.data);
    } catch (error) {
      logger.error('OpenAI TTS error', { error });
      throw error;
    }
  }

  /**
   * Synthesize based on provider
   */
  async synthesize(
    text: string,
    voiceConfig: {
      provider: 'openai' | 'elevenlabs';
      voiceId: string;
      model?: string;
    }
  ): Promise<Buffer> {
    if (voiceConfig.provider === 'elevenlabs') {
      return this.synthesizeElevenLabs(text, voiceConfig.voiceId, {
        model: voiceConfig.model
      });
    } else {
      return this.synthesizeOpenAI(text, voiceConfig.voiceId);
    }
  }

  /**
   * Calculate TTS cost
   */
  calculateCost(provider: string, characters: number): number {
    const pricing: Record<string, number> = {
      'elevenlabs': 0.30 / 1000000, // $0.30 per 1M characters
      'openai': 0.015 / 1000        // $0.015 per 1K characters
    };

    return characters * (pricing[provider] || pricing['elevenlabs']);
  }
}
```

---

## AWS S3 Integration

AWS S3 is used for storing call recordings.

### Setup

1. **Create S3 Bucket**
   ```bash
   aws s3 mb s3://ai-calling-recordings
   ```

2. **Configure CORS**
   ```json
   [
     {
       "AllowedHeaders": ["*"],
       "AllowedMethods": ["GET", "PUT"],
       "AllowedOrigins": ["https://yourdomain.com"],
       "ExposeHeaders": []
     }
   ]
   ```

3. **Configure Environment**
   ```bash
   AWS_ACCESS_KEY_ID=your-access-key
   AWS_SECRET_ACCESS_KEY=your-secret-key
   AWS_S3_BUCKET=ai-calling-recordings
   AWS_REGION=us-east-1
   ```

### Implementation

```typescript
// services/s3.service.ts
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { logger } from '../utils/logger';

export class S3Service {
  private client: S3Client;
  private bucket: string;

  constructor() {
    this.client = new S3Client({
      region: process.env.AWS_REGION,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!
      }
    });
    this.bucket = process.env.AWS_S3_BUCKET!;
  }

  /**
   * Upload recording
   */
  async uploadRecording(
    sessionId: string,
    audioBuffer: Buffer,
    contentType: string = 'audio/mpeg'
  ): Promise<string> {
    try {
      const key = `recordings/${sessionId}.mp3`;

      await this.client.send(new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: audioBuffer,
        ContentType: contentType
      }));

      const url = `https://${this.bucket}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;

      logger.info('Recording uploaded to S3', { sessionId, url });

      return url;
    } catch (error) {
      logger.error('S3 upload error', { error, sessionId });
      throw error;
    }
  }

  /**
   * Get presigned URL for download
   */
  async getPresignedUrl(key: string, expiresIn: number = 3600): Promise<string> {
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucket,
        Key: key
      });

      const url = await getSignedUrl(this.client, command, { expiresIn });
      return url;
    } catch (error) {
      logger.error('Error generating presigned URL', { error, key });
      throw error;
    }
  }
}
```

---

## Redis Integration

Redis is used for caching and session management.

### Setup

```bash
# Install Redis
brew install redis  # macOS
sudo apt install redis-server  # Ubuntu

# Start Redis
redis-server

# Or use Docker
docker run -d -p 6379:6379 redis:7-alpine
```

### Implementation

```typescript
// config/redis.ts
import { createClient } from 'redis';
import { logger } from '../utils/logger';

export const redis = createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379'
});

redis.on('error', (err) => logger.error('Redis error', { error: err }));
redis.on('connect', () => logger.info('Redis connected'));

export const connectRedis = async () => {
  await redis.connect();
};

// Cache helper
export class CacheService {
  async get<T>(key: string): Promise<T | null> {
    const data = await redis.get(key);
    return data ? JSON.parse(data) : null;
  }

  async set(key: string, value: any, ttl?: number): Promise<void> {
    const data = JSON.stringify(value);
    if (ttl) {
      await redis.setEx(key, ttl, data);
    } else {
      await redis.set(key, data);
    }
  }

  async del(key: string): Promise<void> {
    await redis.del(key);
  }

  async exists(key: string): Promise<boolean> {
    return (await redis.exists(key)) === 1;
  }
}
```

---

**Next:** See [TROUBLESHOOTING.md](TROUBLESHOOTING.md) for common issues and solutions.
