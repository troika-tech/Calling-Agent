import axios, { AxiosInstance } from 'axios';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import { ExternalServiceError, ValidationError } from '../utils/errors';

export interface ExotelCallRequest {
  from: string; // Exotel verified number
  to: string; // Customer number
  callerId?: string; // Display caller ID
  callType?: 'trans' | 'promo';
  statusCallback?: string; // Webhook URL for call status
}

export interface ExotelCallResponse {
  sid: string;
  status: string;
  from: string;
  to: string;
  direction: 'outbound-api' | 'inbound';
  dateCreated: string;
  dateUpdated: string;
  duration?: number;
  price?: string;
}

export interface ExotelWebhookPayload {
  CallSid: string;
  CallFrom: string;
  CallTo: string;
  Direction: string;
  Status: string;
  Duration?: string;
  RecordingUrl?: string;
  Digits?: string;
  CurrentTime: string;
  DialWhomNumber?: string;
  StartTime?: string;
  EndTime?: string;
  CallType?: string;
  CustomField?: string; // For outbound calls, contains callLogId
}

export class ExotelService {
  private client: AxiosInstance;
  private apiKey: string;
  private apiToken: string;
  private sid: string;
  private subdomain: string;
  private baseUrl: string;

  constructor() {
    this.apiKey = env.EXOTEL_API_KEY;
    this.apiToken = env.EXOTEL_API_TOKEN;
    this.sid = env.EXOTEL_SID;
    this.subdomain = env.EXOTEL_SUBDOMAIN;
    // Use v1 API instead of v2
    this.baseUrl = `https://${this.apiKey}:${this.apiToken}@${this.subdomain}/v1/Accounts/${this.sid}`;

    // Create axios instance with basic auth
    this.client = axios.create({
      baseURL: this.baseUrl,
      auth: {
        username: this.apiKey,
        password: this.apiToken
      },
      headers: {
        'Content-Type': 'application/json'
      }
    });

    logger.info('Exotel service initialized', {
      subdomain: this.subdomain,
      sid: this.sid
    });
  }

  /**
   * Make an outbound call via Exotel
   */
  async makeCall(data: ExotelCallRequest): Promise<ExotelCallResponse> {
    try {
      logger.info('Initiating Exotel call', {
        from: data.from,
        to: data.to
      });

      const payload = {
        From: data.from,
        To: data.to,
        CallerId: data.callerId || data.from,
        CallType: data.callType || 'trans',
        StatusCallback: data.statusCallback || `${env.WEBHOOK_BASE_URL}/api/v1/exotel/webhook/status`
      };

      const response = await this.client.post('/Calls/connect', payload);

      logger.info('Exotel call initiated successfully', {
        callSid: response.data.Call?.Sid,
        status: response.data.Call?.Status
      });

      return {
        sid: response.data.Call?.Sid,
        status: response.data.Call?.Status,
        from: response.data.Call?.From,
        to: response.data.Call?.To,
        direction: response.data.Call?.Direction,
        dateCreated: response.data.Call?.DateCreated,
        dateUpdated: response.data.Call?.DateUpdated
      };
    } catch (error: any) {
      logger.error('Failed to make Exotel call', {
        error: error.message,
        response: error.response?.data
      });

      if (error.response?.status === 400) {
        throw new ValidationError(
          error.response.data?.message || 'Invalid call parameters'
        );
      }

      throw new ExternalServiceError('Failed to initiate call');
    }
  }

  /**
   * Make an outbound call with custom Exotel credentials (per-phone)
   */
  async makeCallWithCredentials(
    data: ExotelCallRequest,
    credentials: {
      apiKey: string;
      apiToken: string;
      sid: string;
      subdomain: string;
    }
  ): Promise<ExotelCallResponse> {
    try {
      logger.info('Initiating Exotel call with custom credentials', {
        from: data.from,
        to: data.to,
        sid: credentials.sid
      });

      // Create custom client with provided credentials
      const baseUrl = `https://${credentials.apiKey}:${credentials.apiToken}@${credentials.subdomain}/v1/Accounts/${credentials.sid}`;

      const customClient = axios.create({
        baseURL: baseUrl,
        auth: {
          username: credentials.apiKey,
          password: credentials.apiToken
        },
        headers: {
          'Content-Type': 'application/json'
        }
      });

      const payload = {
        From: data.from,
        To: data.to,
        CallerId: data.callerId || data.from,
        CallType: data.callType || 'trans',
        StatusCallback: data.statusCallback || `${env.WEBHOOK_BASE_URL}/api/v1/exotel/webhook/status`
      };

      const response = await customClient.post('/Calls/connect', payload);

      logger.info('Exotel call initiated successfully with custom credentials', {
        callSid: response.data.Call?.Sid,
        status: response.data.Call?.Status
      });

      return {
        sid: response.data.Call?.Sid,
        status: response.data.Call?.Status,
        from: response.data.Call?.From,
        to: response.data.Call?.To,
        direction: response.data.Call?.Direction,
        dateCreated: response.data.Call?.DateCreated,
        dateUpdated: response.data.Call?.DateUpdated
      };
    } catch (error: any) {
      logger.error('Failed to make Exotel call with custom credentials', {
        error: error.message,
        response: error.response?.data
      });

      if (error.response?.status === 400) {
        throw new ValidationError(
          error.response.data?.message || 'Invalid call parameters'
        );
      }

      if (error.response?.status === 401 || error.response?.status === 403) {
        throw new ValidationError('Invalid Exotel credentials');
      }

      throw new ExternalServiceError('Failed to initiate call');
    }
  }

  /**
   * Get call details by SID
   */
  async getCall(callSid: string): Promise<any> {
    try {
      logger.info('Fetching Exotel call details', { callSid });

      const response = await this.client.get(`/Calls/${callSid}.json`);

      return response.data.Call;
    } catch (error: any) {
      logger.error('Failed to fetch call details', {
        callSid,
        error: error.message
      });

      throw new ExternalServiceError('Failed to fetch call details');
    }
  }

  /**
   * Get call recordings
   */
  async getRecording(callSid: string): Promise<string | null> {
    try {
      logger.info('Fetching call recording', { callSid });

      const response = await this.client.get(
        `/Calls/${callSid}/Recordings.json`
      );

      const recordings = response.data.Recordings;
      if (!recordings || recordings.length === 0) {
        return null;
      }

      // Return the URL of the first recording
      return recordings[0].RecordingUrl;
    } catch (error: any) {
      logger.error('Failed to fetch recording', {
        callSid,
        error: error.message
      });

      return null;
    }
  }

  /**
   * End an active call
   */
  async hangupCall(callSid: string): Promise<void> {
    try {
      logger.info('Hanging up call', { callSid });

      await this.client.post(`/Calls/${callSid}.json`, {
        Status: 'completed'
      });

      logger.info('Call hung up successfully', { callSid });
    } catch (error: any) {
      logger.error('Failed to hangup call', {
        callSid,
        error: error.message
      });

      throw new ExternalServiceError('Failed to hangup call');
    }
  }

  /**
   * Verify phone number with Exotel
   */
  async verifyNumber(phoneNumber: string): Promise<boolean> {
    try {
      logger.info('Verifying phone number with Exotel', { phoneNumber });

      const response = await this.client.get('/IncomingPhoneNumbers.json');

      const numbers = response.data.IncomingPhoneNumbers || [];
      const verified = numbers.some(
        (num: any) => num.PhoneNumber === phoneNumber
      );

      logger.info('Phone number verification result', {
        phoneNumber,
        verified
      });

      return verified;
    } catch (error: any) {
      logger.error('Failed to verify phone number', {
        phoneNumber,
        error: error.message
      });

      return false;
    }
  }

  /**
   * Get list of purchased numbers
   */
  async getPhoneNumbers(): Promise<any[]> {
    try {
      logger.info('Fetching Exotel phone numbers');

      const response = await this.client.get('/IncomingPhoneNumbers.json');

      return response.data.IncomingPhoneNumbers || [];
    } catch (error: any) {
      logger.error('Failed to fetch phone numbers', {
        error: error.message
      });

      throw new ExternalServiceError('Failed to fetch phone numbers');
    }
  }

  /**
   * Download audio recording from URL
   */
  async downloadRecording(recordingUrl: string): Promise<Buffer> {
    try {
      logger.info('Downloading recording', { recordingUrl });

      const response = await axios.get(recordingUrl, {
        responseType: 'arraybuffer',
        auth: {
          username: this.apiKey,
          password: this.apiToken
        }
      });

      const audioBuffer = Buffer.from(response.data);

      logger.info('Recording downloaded successfully', {
        size: audioBuffer.length
      });

      return audioBuffer;
    } catch (error: any) {
      logger.error('Failed to download recording', {
        recordingUrl,
        error: error.message
      });

      throw new ExternalServiceError('Failed to download recording');
    }
  }

  /**
   * Parse webhook payload from Exotel
   */
  parseWebhook(payload: any): ExotelWebhookPayload {
    return {
      CallSid: payload.CallSid,
      CallFrom: payload.CallFrom,
      CallTo: payload.CallTo,
      Direction: payload.Direction,
      Status: payload.Status,
      Duration: payload.Duration,
      RecordingUrl: payload.RecordingUrl,
      Digits: payload.Digits,
      CurrentTime: payload.CurrentTime,
      DialWhomNumber: payload.DialWhomNumber,
      StartTime: payload.StartTime,
      EndTime: payload.EndTime,
      CallType: payload.CallType,
      CustomField: payload.CustomField
    };
  }
}

export const exotelService = new ExotelService();
