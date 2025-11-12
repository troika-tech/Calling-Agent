export interface User {
  _id: string;
  email: string;
  name: string;
  role: 'admin' | 'user' | 'super_admin';
  createdAt: string;
}

export interface AuthResponse {
  success: boolean;
  data: {
    user: User;
    token: string;
    refreshToken: string;
  };
  message?: string;
}

export interface Agent {
  _id: string;
  userId: string;
  name: string;
  description?: string;
  phoneNumber?: string;
  config: AgentConfig;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AgentConfig {
  prompt: string;  // Backward compatibility
  persona?: string;  // New: Agent-specific persona
  firstMessage?: string;  // Deprecated: use greetingMessage
  greetingMessage: string;  // New: First message when call starts
  voice: {
    provider: 'openai' | 'elevenlabs' | 'cartesia' | 'deepgram' | 'sarvam';
    voiceId: string;
    model?: string;
    settings?: {
      stability?: number;
      similarityBoost?: number;
      [key: string]: any;
    };
  };
  llm: {
    model: 'gpt-4' | 'gpt-3.5-turbo' | 'gpt-4-turbo' | 'gpt-4o' | 'gpt-4o-mini' | 'claude-3-5-haiku-20241022' | 'claude-3-5-sonnet-20241022';
    temperature: number;
    maxTokens?: number;
  };
  language: string;
  enableAutoLanguageDetection?: boolean;  // Enable automatic language detection
  sttProvider?: 'auto' | 'deepgram' | 'sarvam' | 'whisper';  // STT provider selection
  endCallPhrases: string[];
  voicemailDetection?: {
    enabled: boolean;
    confidenceThreshold: number;
    minDetectionTime: number;
    keywords?: string[];
    enableAudioAMD?: boolean;
    audioAMDPriority?: 'audio_first' | 'keyword_first' | 'both';
  };
}

export interface CallLog {
  _id: string;
  userId: string;
  agentId: Agent;
  fromPhone: string;
  toPhone: string;
  phoneNumber?: string; // Deprecated: Use fromPhone/toPhone instead
  direction: 'inbound' | 'outbound';
  status: 'initiated' | 'ringing' | 'in-progress' | 'completed' | 'failed' | 'no-answer' | 'busy' | 'canceled' | 'user-ended' | 'agent-ended';
  duration?: number;
  durationSec?: number;
  recordingUrl?: string;
  transcript: TranscriptEntry[];
  summary?: string;
  metadata: {
    exotelCallSid?: string;
    streamSid?: string;
    endReason?: string;
    keyPoints?: string[];
    sentiment?: 'positive' | 'neutral' | 'negative';
    actionItems?: string[];
    transcriptGenerated?: boolean;
    transcriptGeneratedAt?: string;
    // Voicemail detection fields
    voicemailDetected?: boolean;
    voicemailConfidence?: number;
    voicemailKeywords?: string[];
    detectionTimestamp?: string;
    detectionTimeSeconds?: number;
    callDurationAtDetection?: number;
    markedAsFalsePositive?: boolean;
    falsePositiveMarkedAt?: string;
  };
  createdAt: string;
  endedAt?: string;
  startedAt?: string;
}

export interface TranscriptEntry {
  speaker: 'user' | 'assistant';
  text: string;
  timestamp: string;
}

export interface FormattedTranscript {
  markdown: string;
  plainText: string;
  summary: string;
  keyPoints: string[];
  sentiment?: 'positive' | 'neutral' | 'negative';
  actionItems?: string[];
  duration?: string;
}

export interface CallStats {
  totalCalls: number;
  completedCalls: number;
  averageDuration: number;
  totalDuration: number;
}

export interface VoiceOption {
  voice_id: string;
  name: string;
  category?: string;
}

export interface KnowledgeBaseDocument {
  id: string;
  fileName: string;
  fileType: 'pdf' | 'docx' | 'txt';
  fileSize: number;
  status: 'processing' | 'ready' | 'failed';
  totalChunks: number;
  totalTokens: number;
  totalCharacters: number;
  uploadedAt: string;
  processedAt?: string;
  error?: string;
  processingMetadata?: {
    duration: number;
    cost: number;
    chunkingMethod: string;
    embeddingModel: string;
  };
}

export interface KnowledgeBaseStats {
  totalDocuments: number;
  totalChunks: number;
  totalTokens: number;
  totalCharacters: number;
  processingCount: number;
  readyCount: number;
  failedCount: number;
}

export interface Phone {
  _id: string;
  userId: string;
  number: string;
  country: string;
  provider: 'exotel';
  agentId?: Agent | string;
  tags: string[];
  status: 'active' | 'inactive';
  exotelData?: {
    sid: string;
    appId?: string;
  };
  createdAt: string;
  updatedAt: string;
}

export interface ExotelConfig {
  apiKey: string;
  apiToken: string;
  sid: string;
  subdomain: string;
  appId?: string;  // Voicebot App ID for outbound calls
}

export interface ImportPhoneRequest {
  number: string;
  country: string;
  exotelConfig: ExotelConfig;
  tags?: string[];
}

export interface PhoneStats {
  totalCalls: number;
  completedCalls: number;
  failedCalls: number;
  averageDuration: number;
}

export interface AdminSettings {
  _id?: string;
  userId: string;
  defaultTtsProvider: 'deepgram' | 'elevenlabs';
  ttsProviders: {
    deepgram?: {
      enabled: boolean;
      defaultVoiceId: string;
      apiKey?: string;
    };
    elevenlabs?: {
      enabled: boolean;
      defaultVoiceId: string;
      model?: string;
      apiKey?: string;
      settings?: {
        stability?: number;
        similarityBoost?: number;
      };
    };
  };
  createdAt?: string;
  updatedAt?: string;
}

export interface TTSVoice {
  id: string;
  name: string;
  provider: 'deepgram' | 'elevenlabs' | 'sarvam';
  category?: string;
  gender?: 'male' | 'female' | 'neutral';
  description?: string;
  previewUrl?: string;
  languages?: string[];  // For Sarvam voices
}

// Campaign types
export interface Campaign {
  _id: string;
  userId: string;
  agentId: string | Agent;
  phoneId?: string;
  name: string;
  description?: string;
  status: 'draft' | 'scheduled' | 'active' | 'paused' | 'completed' | 'cancelled' | 'failed';
  totalContacts: number;
  queuedCalls: number;
  activeCalls: number;
  completedCalls: number;
  failedCalls: number;
  voicemailCalls: number;
  settings: {
    retryFailedCalls: boolean;
    maxRetryAttempts: number;
    retryDelayMinutes: number;
    excludeVoicemail: boolean;
    priorityMode: 'fifo' | 'lifo' | 'priority';
    concurrentCallsLimit: number;
  };
  scheduledFor?: string;
  startedAt?: string;
  completedAt?: string;
  pausedAt?: string;
  metadata?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
  progress?: number;
  successRate?: number;
}

export interface CampaignContact {
  _id: string;
  campaignId: string;
  userId: string;
  phoneNumber: string;
  name?: string;
  email?: string;
  customData?: Record<string, any>;
  status: 'pending' | 'queued' | 'calling' | 'completed' | 'failed' | 'voicemail' | 'skipped';
  callLogId?: string | CallLog;
  retryCount: number;
  lastAttemptAt?: string;
  nextRetryAt?: string;
  failureReason?: string;
  priority: number;
  scheduledFor?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CampaignStats {
  campaign: {
    id: string;
    name: string;
    status: string;
    totalContacts: number;
    queuedCalls: number;
    activeCalls: number;
    completedCalls: number;
    failedCalls: number;
    voicemailCalls: number;
    progress: number;
    successRate: number;
    scheduledFor?: string;
    startedAt?: string;
    completedAt?: string;
  };
  contactStatus: Record<string, number>;
  callStatus: Record<string, number>;
  totalCallDuration: number;
  avgCallDuration: number;
}

export interface CampaignProgress {
  campaign: {
    id: string;
    name: string;
    status: string;
    totalContacts: number;
    queuedCalls: number;
    activeCalls: number;
    completedCalls: number;
    failedCalls: number;
    voicemailCalls: number;
    progress: number;
    successRate: number;
  };
  queue: {
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
  };
}

export interface CreateCampaignRequest {
  name: string;
  agentId: string;
  phoneId?: string;
  description?: string;
  scheduledFor?: string;
  settings?: {
    retryFailedCalls?: boolean;
    maxRetryAttempts?: number;
    retryDelayMinutes?: number;
    excludeVoicemail?: boolean;
    priorityMode?: 'fifo' | 'lifo' | 'priority';
    concurrentCallsLimit?: number;
  };
  metadata?: Record<string, any>;
}

export interface AddContactsRequest {
  contacts: Array<{
    phoneNumber: string;
    name?: string;
    email?: string;
    customData?: Record<string, any>;
    priority?: number;
    scheduledFor?: string;
  }>;
}
