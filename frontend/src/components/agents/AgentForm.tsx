import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { FiSave, FiX, FiUpload, FiFile, FiTrash2, FiCheckCircle, FiClock, FiXCircle, FiPlay, FiPhone } from 'react-icons/fi';
import { agentService } from '../../services/agentService';
import { knowledgeBaseService } from '../../services/knowledgeBaseService';
import { settingsService } from '../../services/settingsService';
import { callService } from '../../services/callService';
import { phoneService } from '../../services/phoneService';
import { useAuthStore } from '../../store/authStore';
import type { AgentConfig, KnowledgeBaseDocument, TTSVoice, Phone } from '../../types';

interface AgentFormData {
  name: string;
  description: string;
  persona: string;
  greetingMessage: string;
  voiceProvider: string;
  voiceId: string;
  model: string;
  temperature: number;
  maxTokens: number;
  language: string;
  enableAutoLanguageDetection?: boolean;
  sttProvider: string;
  endCallPhrases: string;
}

export default function AgentForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [characterCount, setCharacterCount] = useState(0);
  const [kbDocuments, setKbDocuments] = useState<KnowledgeBaseDocument[]>([]);
  const [kbLoading, setKbLoading] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [playingVoice, setPlayingVoice] = useState<string | null>(null);
  const [availableVoices, setAvailableVoices] = useState<TTSVoice[]>([]);
  const [loadingVoices, setLoadingVoices] = useState(false);

  // Outbound call state
  const [phones, setPhones] = useState<Phone[]>([]);
  const [selectedPhone, setSelectedPhone] = useState<string>('');
  const [callPhoneNumber, setCallPhoneNumber] = useState('');
  const [initiatingCall, setInitiatingCall] = useState(false);
  const [callStatus, setCallStatus] = useState<{ success?: boolean; message?: string } | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
    watch,
  } = useForm<AgentFormData>({
    defaultValues: {
      name: '',
      description: '',
      persona: 'You are a helpful AI assistant.\n\nYour role:\n- Assist callers with their inquiries\n- Be professional and friendly\n- Provide accurate information',
      greetingMessage: 'Hello! How can I help you today?',
      voiceProvider: 'deepgram',
      voiceId: 'aura-asteria-en',
      model: 'gpt-4o-mini',
      temperature: 0.7,
      maxTokens: 300,
      language: 'en',
      enableAutoLanguageDetection: false,
      sttProvider: 'auto',
      endCallPhrases: 'goodbye, bye, end call, thank you goodbye, talk to you later',
    },
  });

  const persona = watch('persona');
  const voiceProvider = watch('voiceProvider');
  const voiceId = watch('voiceId');

  useEffect(() => {
    setCharacterCount(persona?.length || 0);
  }, [persona]);

  // Load voices when provider changes
  useEffect(() => {
    if (voiceProvider) {
      loadVoices(voiceProvider);
    }
  }, [voiceProvider]);

  const loadVoices = async (provider: string) => {
    try {
      setLoadingVoices(true);

      let voices: any[] = [];

      // Fetch voices from API for providers that support it
      if (provider === 'deepgram' || provider === 'elevenlabs' || provider === 'sarvam') {
        voices = await settingsService.getVoices(provider as 'deepgram' | 'elevenlabs' | 'sarvam');
      } else if (provider === 'openai') {
        // Hardcoded OpenAI voices
        voices = [
          { id: 'alloy', name: 'Alloy', gender: 'neutral', description: 'Neutral, balanced voice' },
          { id: 'echo', name: 'Echo', gender: 'male', description: 'Clear male voice' },
          { id: 'fable', name: 'Fable', gender: 'male', description: 'Expressive male voice' },
          { id: 'onyx', name: 'Onyx', gender: 'male', description: 'Deep male voice' },
          { id: 'nova', name: 'Nova', gender: 'female', description: 'Energetic female voice' },
          { id: 'shimmer', name: 'Shimmer', gender: 'female', description: 'Warm female voice' }
        ];
      } else if (provider === 'cartesia') {
        // Hardcoded Cartesia voices
        voices = [
          { id: 'a0e99841-438c-4a64-b679-ae501e7d6091', name: 'Barbershop Man', gender: 'male', description: 'Conversational male voice' },
          { id: '79a125e8-cd45-4c13-8a67-188112f4dd22', name: 'British Lady', gender: 'female', description: 'British English female' },
          { id: '694f9389-aac1-45b6-b726-9d9369183238', name: 'Calm Lady', gender: 'female', description: 'Calm, soothing female voice' },
          { id: 'fb26447f-308b-471e-8b00-8e9f04284eb5', name: 'Commercial Man', gender: 'male', description: 'Professional male voice' },
          { id: '2ee87190-8f84-4925-97da-e52547f9462c', name: 'Newsman', gender: 'male', description: 'News anchor style male voice' }
        ];
      }

      setAvailableVoices(voices);

      // Set first voice as default if no voice selected
      if (voices.length > 0 && !voiceId) {
        setValue('voiceId', voices[0].id);
      }
    } catch (error) {
      console.error('Error loading voices:', error);
      setAvailableVoices([]);
    } finally {
      setLoadingVoices(false);
    }
  };

  // Helper function to convert base64 to blob
  const base64ToBlob = (base64: string, contentType: string = ''): Blob => {
    const byteCharacters = atob(base64);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    return new Blob([byteArray], { type: contentType });
  };

  const handlePlayVoice = async (selectedVoiceId: string) => {
    if (!selectedVoiceId || playingVoice === selectedVoiceId) return;

    try {
      setPlayingVoice(selectedVoiceId);
      const result = await settingsService.testTts(
        voiceProvider as 'deepgram' | 'elevenlabs',
        selectedVoiceId
      );

      if (result.success && result.audioBase64) {
        // Play the audio
        const audioBlob = base64ToBlob(result.audioBase64, 'audio/mpeg');
        const audioUrl = URL.createObjectURL(audioBlob);
        const audio = new Audio(audioUrl);

        audio.play().catch(err => {
          console.error('Error playing audio:', err);
          alert('Audio received but failed to play. Please check browser settings.');
        });

        // Clean up URL after playing
        audio.onended = () => {
          URL.revokeObjectURL(audioUrl);
          setPlayingVoice(null);
        };
      } else {
        alert(`Failed to play voice: ${result.message}`);
        setPlayingVoice(null);
      }
    } catch (error: any) {
      console.error('Error playing voice:', error);
      alert(error.response?.data?.message || 'Failed to play voice');
      setPlayingVoice(null);
    }
  };

  useEffect(() => {
    if (id) {
      loadAgent(id);
      loadKnowledgeBase(id);
      loadPhones(); // Load phones for outbound calls
    }
  }, [id]);

  const loadAgent = async (agentId: string) => {
    try {
      setLoading(true);
      const agent = await agentService.getAgent(agentId);

      setValue('name', agent.name);
      setValue('description', agent.description || '');
      setValue('persona', agent.config.persona || agent.config.prompt);
      setValue('greetingMessage', agent.config.greetingMessage || agent.config.firstMessage || '');
      setValue('voiceProvider', agent.config.voice.provider || 'deepgram');
      setValue('voiceId', agent.config.voice.voiceId);
      setValue('model', agent.config.llm.model);
      setValue('temperature', agent.config.llm.temperature);
      setValue('maxTokens', agent.config.llm.maxTokens || 300);
      setValue('language', agent.config.language);
      setValue('enableAutoLanguageDetection', agent.config.enableAutoLanguageDetection || false);
      setValue('sttProvider', agent.config.sttProvider || 'auto');
      setValue('endCallPhrases', agent.config.endCallPhrases?.join(', ') || 'goodbye, bye, end call');
    } catch (error) {
      console.error('Error loading agent:', error);
      alert('Failed to load agent');
      navigate('/agents');
    } finally {
      setLoading(false);
    }
  };

  const loadKnowledgeBase = async (agentId: string) => {
    try {
      setKbLoading(true);
      const { documents } = await knowledgeBaseService.listDocuments(agentId);
      setKbDocuments(documents);
    } catch (error) {
      console.error('Error loading knowledge base:', error);
    } finally {
      setKbLoading(false);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !id) return;

    // Validate file type
    const allowedTypes = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain'];
    if (!allowedTypes.includes(file.type)) {
      alert('Invalid file type. Only PDF, DOCX, and TXT files are allowed.');
      return;
    }

    // Validate file size (max 100MB)
    const maxSize = 100 * 1024 * 1024; // 100MB
    if (file.size > maxSize) {
      alert('File size exceeds 100MB limit.');
      return;
    }

    try {
      setUploadingFile(true);
      await knowledgeBaseService.uploadDocument(id, file);
      alert('Document uploaded successfully! Processing in background...');
      // Reload KB documents
      await loadKnowledgeBase(id);
      // Reset file input
      event.target.value = '';
    } catch (error: any) {
      console.error('Error uploading document:', error);
      alert(error.response?.data?.message || 'Failed to upload document');
    } finally {
      setUploadingFile(false);
    }
  };

  const handleDeleteDocument = async (documentId: string) => {
    if (!confirm('Are you sure you want to delete this document?')) return;

    try {
      await knowledgeBaseService.deleteDocument(documentId);
      alert('Document deleted successfully');
      // Reload KB documents
      if (id) {
        await loadKnowledgeBase(id);
      }
    } catch (error: any) {
      console.error('Error deleting document:', error);
      alert(error.response?.data?.message || 'Failed to delete document');
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'ready':
        return <FiCheckCircle className="text-green-500" />;
      case 'processing':
        return <FiClock className="text-yellow-500 animate-spin" />;
      case 'failed':
        return <FiXCircle className="text-red-500" />;
      default:
        return null;
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  };

  const onSubmit = async (data: AgentFormData) => {
    try {
      setLoading(true);

      const config: AgentConfig = {
        prompt: data.persona, // For backward compatibility
        persona: data.persona,
        greetingMessage: data.greetingMessage,
        voice: {
          provider: data.voiceProvider as any,
          voiceId: data.voiceId,
        },
        llm: {
          model: data.model as any,
          temperature: data.temperature,
          maxTokens: data.maxTokens || undefined,
        },
        language: data.language,
        enableAutoLanguageDetection: data.enableAutoLanguageDetection ?? false,
        sttProvider: data.sttProvider as any,
        endCallPhrases: data.endCallPhrases
          .split(',')
          .map((p) => p.trim())
          .filter((p) => p.length > 0),
      };

      if (id) {
        await agentService.updateAgent(id, {
          name: data.name,
          description: data.description,
          config,
        });
      } else {
        await agentService.createAgent({
          name: data.name,
          description: data.description,
          config,
        });
      }

      navigate('/agents');
    } catch (error: any) {
      console.error('Error saving agent:', error);
      alert(error.response?.data?.message || 'Failed to save agent');
    } finally {
      setLoading(false);
    }
  };

  const loadPhones = async () => {
    try {
      const phoneList = await phoneService.getPhones();
      setPhones(phoneList);
      if (phoneList.length > 0) {
        setSelectedPhone(phoneList[0]._id);
      }
    } catch (error) {
      console.error('Error loading phones:', error);
    }
  };

  const handleInitiateCall = async () => {
    if (!callPhoneNumber || !selectedPhone || !id || !user) {
      alert('Please enter a phone number and select a phone');
      return;
    }

    // Validate phone number format (basic E.164 validation)
    const phoneRegex = /^\+[1-9]\d{1,14}$/;
    if (!phoneRegex.test(callPhoneNumber)) {
      alert('Please enter a valid phone number in E.164 format (e.g., +919876543210)');
      return;
    }

    try {
      setInitiatingCall(true);
      setCallStatus(null);

      const result = await callService.initiateOutboundCall({
        phoneNumber: callPhoneNumber,
        phoneId: selectedPhone,
        agentId: id,
        userId: user._id,
        metadata: {
          initiatedFrom: 'agent-form'
        }
      });

      setCallStatus({
        success: true,
        message: `Call initiated successfully! Call Log ID: ${result.callLogId}`
      });

      // Clear the phone number after successful call
      setCallPhoneNumber('');
    } catch (error: any) {
      console.error('Error initiating call:', error);
      const errorMessage = error.response?.data?.error?.message
        || error.response?.data?.message
        || error.message
        || 'Failed to initiate call';

      setCallStatus({
        success: false,
        message: errorMessage
      });
    } finally {
      setInitiatingCall(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold bg-gradient-to-r from-neutral-900 to-neutral-700 bg-clip-text text-transparent">
          {id ? 'Edit Agent' : 'Create New Agent'}
        </h1>
        <p className="text-neutral-600 mt-2 text-base">
          Configure your AI calling agent with custom settings
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Basic Info */}
        <div className="form-section">
          <h2 className="text-xl font-bold text-neutral-900 mb-6 flex items-center">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary-500 to-primary-600 flex items-center justify-center mr-3 shadow-md">
              <span className="text-white text-sm font-bold">1</span>
            </div>
            Basic Information
          </h2>
          <div className="space-y-5">
            <div>
              <label className="block text-sm font-semibold text-neutral-700 mb-2">
                Agent Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                {...register('name', { required: 'Agent name is required' })}
                className="input-field"
                placeholder="e.g., Sales Agent, Support Bot"
              />
              {errors.name && (
                <p className="text-red-600 text-sm mt-2 flex items-center">
                  <span className="mr-1">⚠</span> {errors.name.message}
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-semibold text-neutral-700 mb-2">
                Description
              </label>
              <textarea
                {...register('description', { maxLength: 500 })}
                className="input-field resize-none"
                rows={2}
                placeholder="Brief description of the agent's purpose (optional)"
                maxLength={500}
              />
              <p className="text-xs text-neutral-500 mt-2">Optional: Max 500 characters</p>
            </div>
          </div>
        </div>

        {/* Persona Configuration */}
        <div className="form-section">
          <h2 className="text-xl font-bold text-neutral-900 mb-6 flex items-center">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-secondary-500 to-secondary-600 flex items-center justify-center mr-3 shadow-md">
              <span className="text-white text-sm font-bold">2</span>
            </div>
            Persona & Greeting
          </h2>
          <div className="space-y-5">
            <div>
              <label className="block text-sm font-semibold text-neutral-700 mb-2">
                Agent Persona <span className="text-red-500">*</span>
              </label>
              <textarea
                {...register('persona', {
                  required: 'Persona is required',
                  minLength: { value: 10, message: 'Persona must be at least 10 characters' },
                  maxLength: { value: 20000, message: 'Persona must be less than 20000 characters' }
                })}
                className="input-field resize-none font-mono text-sm"
                rows={10}
                placeholder="You are a helpful AI assistant.

Your role:
- Assist callers with their inquiries
- Be professional and friendly
- Provide accurate information

Company context:
- Include relevant business information here"
                maxLength={20000}
              />
              {errors.persona && (
                <p className="text-red-600 text-sm mt-2 flex items-center">
                  <span className="mr-1">⚠</span> {errors.persona.message}
                </p>
              )}
              <div className="flex justify-between items-center mt-2">
                <p className="text-xs text-neutral-500">
                  Define the agent's character, role, personality, and business context
                </p>
                <p className="text-xs text-neutral-500">
                  {characterCount} / 20000
                </p>
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-neutral-700 mb-2">
                Greeting Message <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                {...register('greetingMessage', {
                  required: 'Greeting message is required',
                  minLength: { value: 5, message: 'Greeting must be at least 5 characters' },
                  maxLength: { value: 500, message: 'Greeting must be less than 500 characters' }
                })}
                className="input-field"
                placeholder="Hi! I'm Sarah. How can I help you today?"
                maxLength={500}
              />
              {errors.greetingMessage && (
                <p className="text-red-600 text-sm mt-2 flex items-center">
                  <span className="mr-1">⚠</span> {errors.greetingMessage.message}
                </p>
              )}
              <p className="text-xs text-neutral-500 mt-2">
                First message when the call starts (keep it brief, 1-2 sentences)
              </p>
            </div>
          </div>
        </div>

        {/* AI Model Configuration */}
        <div className="form-section">
          <h2 className="text-xl font-bold text-neutral-900 mb-6 flex items-center">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-accent-500 to-accent-600 flex items-center justify-center mr-3 shadow-md">
              <span className="text-white text-sm font-bold">3</span>
            </div>
            AI Model Settings
          </h2>
          <div className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-semibold text-neutral-700 mb-2">
                  LLM Model <span className="text-red-500">*</span>
                </label>
                <select {...register('model')} className="input-field">
                  <option value="gpt-4o-mini">GPT-4o Mini (Fastest, Recommended)</option>
                  <option value="claude-3-5-haiku-20241022">Claude 3.5 Haiku (Very Fast)</option>
                  <option value="gpt-4o">GPT-4o (Better Quality)</option>
                  <option value="claude-3-5-sonnet-20241022">Claude 3.5 Sonnet (Best Quality)</option>
                  <option value="gpt-4-turbo">GPT-4 Turbo</option>
                  <option value="gpt-4">GPT-4</option>
                </select>
                <p className="text-xs text-neutral-500 mt-1">AI model for conversation</p>
              </div>

              <div>
                <label className="block text-sm font-semibold text-neutral-700 mb-2">
                  Temperature
                </label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="2"
                  {...register('temperature', { valueAsNumber: true })}
                  className="input-field"
                  placeholder="0.7"
                />
                <p className="text-xs text-neutral-500 mt-1">0-2 (higher = more creative)</p>
              </div>

              <div>
                <label className="block text-sm font-semibold text-neutral-700 mb-2">
                  Max Tokens
                </label>
                <input
                  type="number"
                  {...register('maxTokens', { valueAsNumber: true })}
                  className="input-field"
                  placeholder="300"
                />
                <p className="text-xs text-neutral-500 mt-1">Leave empty for auto</p>
              </div>
            </div>
          </div>
        </div>

        {/* Voice Configuration */}
        <div className="form-section">
          <h2 className="text-xl font-bold text-neutral-900 mb-6 flex items-center">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-purple-600 flex items-center justify-center mr-3 shadow-md">
              <span className="text-white text-sm font-bold">4</span>
            </div>
            Voice Settings
          </h2>
          <div className="space-y-5">
            <div>
              <label className="block text-sm font-semibold text-neutral-700 mb-2">
                Voice Provider <span className="text-red-500">*</span>
              </label>
              <select {...register('voiceProvider')} className="input-field">
                <option value="deepgram">Deepgram (Fastest, Recommended)</option>
                <option value="openai">OpenAI</option>
                <option value="elevenlabs">ElevenLabs</option>
                <option value="cartesia">Cartesia</option>
                <option value="sarvam">Sarvam (Indian Languages)</option>
              </select>
              <p className="text-xs text-neutral-500 mt-2">Text-to-speech provider</p>
            </div>

            <div>
              <label className="block text-sm font-semibold text-neutral-700 mb-2">
                Select Voice <span className="text-red-500">*</span>
              </label>
              <p className="text-xs text-neutral-600 mb-4">
                Click on a voice card to select it, then click the play button to hear a demo
              </p>

              {loadingVoices ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
                  <span className="ml-3 text-neutral-600">Loading voices...</span>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {availableVoices.map((voice) => (
                    <div
                      key={voice.id}
                      className={`border-2 rounded-lg p-4 cursor-pointer transition-all ${
                        voiceId === voice.id
                          ? 'border-purple-500 bg-purple-50'
                          : 'border-neutral-200 hover:border-purple-300'
                      }`}
                      onClick={() => setValue('voiceId', voice.id)}
                    >
                      <input
                        type="radio"
                        {...register('voiceId')}
                        value={voice.id}
                        className="hidden"
                      />
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h3 className="font-semibold text-neutral-900 text-sm">{voice.name}</h3>
                          <p className="text-xs text-neutral-600 mt-1">
                            {voice.gender && <span className="capitalize">{voice.gender}</span>}
                            {voice.description && ` • ${voice.description}`}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handlePlayVoice(voice.id);
                          }}
                          disabled={playingVoice === voice.id}
                          className="ml-2 p-2 text-purple-600 hover:bg-purple-100 rounded-lg transition-colors disabled:opacity-50"
                          title="Play voice demo"
                        >
                          {playingVoice === voice.id ? (
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-purple-600"></div>
                          ) : (
                            <FiPlay size={16} />
                          )}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {!loadingVoices && availableVoices.length === 0 && (
                <div className="text-center py-8 bg-neutral-50 rounded-lg border-2 border-dashed border-neutral-300">
                  <p className="text-neutral-600">No voices available for this provider</p>
                </div>
              )}
            </div>

            {/* Multilingual TTS Compatibility Warning */}
            {(() => {
              const selectedLanguage = watch('language');
              const enableAutoDetect = watch('enableAutoLanguageDetection');
              const voiceProvider = watch('voiceProvider');

              const isMultilingual = enableAutoDetect ||
                                    selectedLanguage === 'multilingual-indian' ||
                                    selectedLanguage === 'multilingual-intl';

              const incompatibleProviders = ['elevenlabs', 'cartesia'];
              const isIncompatible = isMultilingual && incompatibleProviders.includes(voiceProvider);

              if (isIncompatible) {
                return (
                  <div className="mt-4 p-4 bg-red-50 border-2 border-red-400 rounded-lg">
                    <div className="flex items-start">
                      <div className="flex-shrink-0">
                        <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                      </div>
                      <div className="ml-3 flex-1">
                        <h3 className="text-sm font-semibold text-red-800">
                          ⚠️ Incompatible Configuration Detected
                        </h3>
                        <p className="mt-2 text-sm text-red-700">
                          You have selected <strong>multilingual mode</strong> but <strong>{voiceProvider === 'elevenlabs' ? 'ElevenLabs' : 'Cartesia'}</strong> does not support automatic language switching for most voices.
                        </p>
                        <p className="mt-2 text-sm text-red-700">
                          <strong>Please either:</strong>
                        </p>
                        <ul className="mt-2 text-sm text-red-700 list-disc list-inside space-y-1">
                          <li>Switch to <strong>OpenAI TTS</strong>, <strong>Deepgram TTS</strong>, or <strong>Sarvam TTS</strong> (all support multilingual)</li>
                          <li>Or disable multilingual mode and select a specific language</li>
                        </ul>
                        <p className="mt-3 text-xs text-red-600 font-medium">
                          This form will not allow you to save until this configuration is fixed.
                        </p>
                      </div>
                    </div>
                  </div>
                );
              }

              if (isMultilingual) {
                return (
                  <div className="mt-4 p-4 bg-green-50 border-2 border-green-400 rounded-lg">
                    <div className="flex items-start">
                      <div className="flex-shrink-0">
                        <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                      <div className="ml-3">
                        <h3 className="text-sm font-semibold text-green-800">
                          ✅ Multilingual Configuration Valid
                        </h3>
                        <p className="mt-1 text-sm text-green-700">
                          <strong>{voiceProvider === 'openai' ? 'OpenAI TTS' : voiceProvider === 'sarvam' ? 'Sarvam TTS' : 'Deepgram TTS'}</strong> supports automatic language switching. Your multilingual agent will work correctly.
                        </p>
                      </div>
                    </div>
                  </div>
                );
              }

              return null;
            })()}
          </div>
        </div>

        {/* Call Settings */}
        <div className="form-section">
          <h2 className="text-xl font-bold text-neutral-900 mb-6 flex items-center">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-success-500 to-success-600 flex items-center justify-center mr-3 shadow-md">
              <span className="text-white text-sm font-bold">5</span>
            </div>
            Call Settings
          </h2>
          <div className="space-y-5">
            {/* Auto Language Detection Toggle */}
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-4">
              <label className="flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  {...register('enableAutoLanguageDetection')}
                  className="w-5 h-5 text-blue-600 bg-white border-gray-300 rounded focus:ring-blue-500 focus:ring-2"
                />
                <span className="ml-3 text-sm font-semibold text-neutral-800">
                  🌍 Enable Automatic Language Detection
                </span>
              </label>
              <p className="text-xs text-neutral-600 mt-2 ml-8">
                When enabled, the agent will automatically detect the caller's language and respond in that language.
                The language selected below will be used as a fallback if detection fails.
              </p>
            </div>

            <div className="space-y-5">
              <div>
                <label className="block text-sm font-semibold text-neutral-700 mb-2">
                  Language <span className="text-red-500">*</span>
                </label>
                <select {...register('language')} className="input-field">
                  <optgroup label="🌍 International Languages (Deepgram Recommended)">
                    <option value="en">English</option>
                    <option value="es">Spanish (Español)</option>
                    <option value="fr">French (Français)</option>
                    <option value="de">German (Deutsch)</option>
                    <option value="it">Italian (Italiano)</option>
                    <option value="pt">Portuguese (Português)</option>
                    <option value="nl">Dutch (Nederlands)</option>
                    <option value="pl">Polish (Polski)</option>
                    <option value="tr">Turkish (Türkçe)</option>
                    <option value="sv">Swedish (Svenska)</option>
                    <option value="cs">Czech (Čeština)</option>
                    <option value="fi">Finnish (Suomi)</option>
                    <option value="da">Danish (Dansk)</option>
                    <option value="uk">Ukrainian (Українська)</option>
                    <option value="multilingual-intl">🌐 Multilingual International (English, Spanish, German, French, etc.)</option>
                  </optgroup>
                  <optgroup label="🇮🇳 Indian Languages (Sarvam Recommended)">
                    <option value="hi">Hindi (हिन्दी)</option>
                    <option value="bn">Bengali (বাংলা)</option>
                    <option value="ta">Tamil (தமிழ்)</option>
                    <option value="te">Telugu (తెలుగు)</option>
                    <option value="kn">Kannada (ಕನ್ನಡ)</option>
                    <option value="ml">Malayalam (മലയാളം)</option>
                    <option value="mr">Marathi (मराठी)</option>
                    <option value="gu">Gujarati (ગુજરાતી)</option>
                    <option value="pa">Punjabi (ਪੰਜਾਬੀ)</option>
                    <option value="or">Odia (ଓଡ଼ିଆ)</option>
                    <option value="multilingual-indian">🇮🇳 Multilingual Indian (Hindi, Marathi, Bengali, Tamil, etc.)</option>
                  </optgroup>
                  <optgroup label="🌏 Other Languages">
                    <option value="zh">Chinese (中文)</option>
                    <option value="ja">Japanese (日本語)</option>
                    <option value="ko">Korean (한국어)</option>
                    <option value="id">Indonesian (Bahasa Indonesia)</option>
                    <option value="ar">Arabic (العربية)</option>
                  </optgroup>
                </select>
                <p className="text-xs text-neutral-500 mt-2">
                  {/* @ts-ignore */}
                  {watch('enableAutoLanguageDetection')
                    ? 'This language will be used as a fallback if auto-detection fails'
                    : 'Primary language for speech recognition and conversation'}
                </p>
              </div>

              <div>
                <label className="block text-sm font-semibold text-neutral-700 mb-2">
                  Speech-to-Text Provider <span className="text-red-500">*</span>
                </label>
                <select {...register('sttProvider')} className="input-field">
                  <option value="deepgram">Deepgram (Best for English & International)</option>
                  <option value="sarvam">Sarvam (Best for Indian Languages)</option>
                </select>

                {/* Dynamic recommendation based on selected language */}
                {(() => {
                  const selectedLanguage = watch('language');
                  const indianLanguages = ['hi', 'bn', 'ta', 'te', 'kn', 'ml', 'mr', 'gu', 'pa', 'or', 'multilingual-indian'];
                  const isIndianLanguage = indianLanguages.includes(selectedLanguage);
                  const selectedSTT = watch('sttProvider');

                  if (isIndianLanguage && selectedSTT !== 'sarvam') {
                    return (
                      <div className="mt-3 p-3 bg-orange-50 border-l-4 border-orange-400 rounded">
                        <p className="text-sm text-orange-700">
                          <strong>⚠️ Recommendation:</strong> You selected an Indian language. Please select <strong>Sarvam</strong> as the STT provider for the best accuracy with Indian languages.
                        </p>
                      </div>
                    );
                  }

                  if (!isIndianLanguage && selectedSTT !== 'deepgram') {
                    return (
                      <div className="mt-3 p-3 bg-blue-50 border-l-4 border-blue-400 rounded">
                        <p className="text-sm text-blue-700">
                          <strong>💡 Recommendation:</strong> You selected an international language. Please select <strong>Deepgram</strong> as the STT provider for the best accuracy.
                        </p>
                      </div>
                    );
                  }

                  return (
                    <div className="mt-3 p-3 bg-green-50 border-l-4 border-green-400 rounded">
                      <p className="text-sm text-green-700">
                        <strong>✅ Perfect Match:</strong> Your language and STT provider selection is optimized for best performance.
                      </p>
                    </div>
                  );
                })()}

                <div className="mt-3 text-xs text-neutral-600 space-y-1">
                  <p><strong>Deepgram:</strong> Optimized for English, Spanish, German, French, and 30+ international languages</p>
                  <p><strong>Sarvam:</strong> Specialized in 10 Indian languages - Hindi, Bengali, Tamil, Telugu, Kannada, Malayalam, Marathi, Gujarati, Punjabi, Odia</p>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-neutral-700 mb-2">
                End Call Phrases
              </label>
              <input
                type="text"
                {...register('endCallPhrases')}
                className="input-field"
                placeholder="goodbye, bye, end call, thank you goodbye"
              />
              <p className="text-xs text-neutral-500 mt-2">
                Comma-separated phrases that will automatically end the call. Agent will say goodbye and hang up.
              </p>
              <div className="bg-blue-50 border-l-4 border-blue-400 p-3 mt-3 rounded">
                <p className="text-sm text-blue-700">
                  <strong>Example:</strong> If user says "goodbye" or "bye", the agent will politely end the call
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Test Outbound Call - Only show when editing existing agent */}
        {id && (
          <div className="form-section">
            <div className="flex items-center mb-6">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-green-500 to-green-600 flex items-center justify-center mr-4 shadow-lg shadow-green-500/30">
                <FiPhone className="text-white" size={20} />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-neutral-900">Test Call</h3>
                <p className="text-sm text-neutral-600">Initiate an outbound call to test this agent</p>
              </div>
            </div>

            <div className="space-y-4">
              {/* Phone Selector */}
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-2">
                  Select Phone Number
                </label>
                <select
                  value={selectedPhone}
                  onChange={(e) => setSelectedPhone(e.target.value)}
                  className="input-field"
                  disabled={phones.length === 0}
                >
                  {phones.length === 0 ? (
                    <option value="">No phone numbers available</option>
                  ) : (
                    phones.map((phone) => (
                      <option key={phone._id} value={phone._id}>
                        {phone.number} ({phone.provider})
                      </option>
                    ))
                  )}
                </select>
              </div>

              {/* Phone Number Input */}
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-2">
                  Recipient Phone Number
                </label>
                <input
                  type="text"
                  value={callPhoneNumber}
                  onChange={(e) => setCallPhoneNumber(e.target.value)}
                  placeholder="+919876543210"
                  className="input-field"
                  disabled={initiatingCall || phones.length === 0}
                />
                <p className="text-xs text-neutral-500 mt-2">
                  Enter phone number in E.164 format (e.g., +919876543210)
                </p>
              </div>

              {/* Initiate Call Button */}
              <div>
                <button
                  type="button"
                  onClick={handleInitiateCall}
                  disabled={initiatingCall || !callPhoneNumber || !selectedPhone || phones.length === 0}
                  className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {initiatingCall ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      Initiating Call...
                    </>
                  ) : (
                    <>
                      <FiPhone className="mr-2" size={18} />
                      Initiate Call
                    </>
                  )}
                </button>
              </div>

              {/* Call Status Display */}
              {callStatus && (
                <div
                  className={`p-4 rounded-lg border-l-4 ${
                    callStatus.success
                      ? 'bg-green-50 border-green-500'
                      : 'bg-red-50 border-red-500'
                  }`}
                >
                  <p
                    className={`text-sm ${
                      callStatus.success ? 'text-green-700' : 'text-red-700'
                    }`}
                  >
                    {callStatus.message}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-end space-x-4 pt-4">
          <button
            type="button"
            onClick={() => navigate('/agents')}
            className="btn-secondary"
          >
            <FiX className="mr-2" size={18} />
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading || (() => {
              const selectedLanguage = watch('language');
              const enableAutoDetect = watch('enableAutoLanguageDetection');
              const voiceProvider = watch('voiceProvider');

              const isMultilingual = enableAutoDetect ||
                                    selectedLanguage === 'multilingual-indian' ||
                                    selectedLanguage === 'multilingual-intl';

              const incompatibleProviders = ['elevenlabs', 'cartesia'];
              return isMultilingual && incompatibleProviders.includes(voiceProvider);
            })()}
            className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed min-w-[160px]"
            title={(() => {
              const selectedLanguage = watch('language');
              const enableAutoDetect = watch('enableAutoLanguageDetection');
              const voiceProvider = watch('voiceProvider');

              const isMultilingual = enableAutoDetect ||
                                    selectedLanguage === 'multilingual-indian' ||
                                    selectedLanguage === 'multilingual-intl';

              const incompatibleProviders = ['elevenlabs', 'cartesia'];
              const isIncompatible = isMultilingual && incompatibleProviders.includes(voiceProvider);

              return isIncompatible ? 'Cannot save: Multilingual mode requires OpenAI TTS, Deepgram TTS, or Sarvam TTS' : '';
            })()}
          >
            {loading ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                Saving...
              </>
            ) : (
              <>
                <FiSave className="mr-2" size={18} />
                {id ? 'Update Agent' : 'Create Agent'}
              </>
            )}
          </button>
        </div>
      </form>

      {/* Knowledge Base Section - Only show when editing existing agent */}
      {id && (
        <div className="mt-8">
          <div className="form-section">
            <h2 className="text-xl font-bold text-neutral-900 mb-6 flex items-center">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center mr-3 shadow-md">
                <span className="text-white text-sm font-bold">6</span>
              </div>
              Knowledge Base
            </h2>

            <div className="space-y-4">
              <div className="bg-blue-50 border-l-4 border-blue-400 p-4 rounded">
                <p className="text-sm text-blue-700">
                  <strong>Upload documents</strong> to provide your agent with specific knowledge. Supports PDF, DOCX, and TXT files (max 100MB).
                </p>
              </div>

              {/* File Upload */}
              <div className="flex items-center gap-4">
                <label className="btn-primary cursor-pointer flex items-center">
                  <FiUpload className="mr-2" size={18} />
                  {uploadingFile ? 'Uploading...' : 'Upload Document'}
                  <input
                    type="file"
                    accept=".pdf,.docx,.txt"
                    onChange={handleFileUpload}
                    disabled={uploadingFile}
                    className="hidden"
                  />
                </label>
                <p className="text-sm text-neutral-500">
                  PDF, DOCX, or TXT (max 100MB)
                </p>
              </div>

              {/* Document List */}
              <div className="mt-6">
                <h3 className="text-lg font-semibold text-neutral-900 mb-4">
                  Uploaded Documents ({kbDocuments.length})
                </h3>

                {kbLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
                  </div>
                ) : kbDocuments.length === 0 ? (
                  <div className="text-center py-8 bg-neutral-50 rounded-lg border-2 border-dashed border-neutral-300">
                    <FiFile className="mx-auto text-neutral-400 mb-2" size={48} />
                    <p className="text-neutral-600">No documents uploaded yet</p>
                    <p className="text-sm text-neutral-500 mt-1">
                      Upload documents to enhance your agent's knowledge
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {kbDocuments.map((doc) => (
                      <div
                        key={doc.id}
                        className="flex items-center justify-between p-4 bg-white border border-neutral-200 rounded-lg hover:shadow-md transition-shadow"
                      >
                        <div className="flex items-center space-x-4 flex-1">
                          <div className="flex-shrink-0">
                            <FiFile className="text-neutral-400" size={24} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-neutral-900 truncate">
                              {doc.fileName}
                            </p>
                            <div className="flex items-center space-x-4 mt-1 text-xs text-neutral-500">
                              <span className="uppercase">{doc.fileType}</span>
                              <span>{formatFileSize(doc.fileSize)}</span>
                              {doc.totalChunks > 0 && (
                                <span>{doc.totalChunks} chunks</span>
                              )}
                              {doc.processedAt && (
                                <span>
                                  {new Date(doc.processedAt).toLocaleDateString()}
                                </span>
                              )}
                            </div>
                            {doc.error && (
                              <p className="text-xs text-red-600 mt-1">
                                Error: {doc.error}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center space-x-3">
                          <div className="flex items-center space-x-2">
                            {getStatusIcon(doc.status)}
                            <span className={`text-xs font-medium ${
                              doc.status === 'ready' ? 'text-green-600' :
                              doc.status === 'processing' ? 'text-yellow-600' :
                              'text-red-600'
                            }`}>
                              {doc.status === 'ready' ? 'Ready' :
                               doc.status === 'processing' ? 'Processing...' :
                               'Failed'}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleDeleteDocument(doc.id)}
                            className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title="Delete document"
                          >
                            <FiTrash2 size={18} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
