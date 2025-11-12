import { useEffect, useState } from 'react';
import { FiSave, FiPlay, FiCheck, FiAlertCircle, FiSettings } from 'react-icons/fi';
import { settingsService } from '../../services/settingsService';
import type { AdminSettings as IAdminSettings, TTSVoice } from '../../types';

export default function AdminSettings() {
  const [, setSettings] = useState<IAdminSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testingVoice, setTestingVoice] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { success: boolean; message: string }>>({});

  // Voice lists
  const [deepgramVoices, setDeepgramVoices] = useState<TTSVoice[]>([]);
  const [elevenlabsVoices, setElevenlabsVoices] = useState<TTSVoice[]>([]);
  const [loadingElevenlabsVoices, setLoadingElevenlabsVoices] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    defaultTtsProvider: 'deepgram' as 'deepgram' | 'elevenlabs',
    deepgramEnabled: true,
    deepgramVoiceId: 'aura-asteria-en',
    deepgramApiKey: '',
    elevenlabsEnabled: false,
    elevenlabsVoiceId: '',
    elevenlabsModel: 'eleven_turbo_v2_5',
    elevenlabsApiKey: '',
    elevenlabsStability: 0.5,
    elevenlabsSimilarityBoost: 0.75,
  });

  useEffect(() => {
    loadSettings();
    loadDeepgramVoices();
  }, []);

  const loadSettings = async () => {
    try {
      setLoading(true);
      const data = await settingsService.getSettings();
      setSettings(data);

      // Populate form
      setFormData({
        defaultTtsProvider: data.defaultTtsProvider,
        deepgramEnabled: data.ttsProviders.deepgram?.enabled ?? true,
        deepgramVoiceId: data.ttsProviders.deepgram?.defaultVoiceId || 'aura-asteria-en',
        deepgramApiKey: data.ttsProviders.deepgram?.apiKey || '',
        elevenlabsEnabled: data.ttsProviders.elevenlabs?.enabled ?? false,
        elevenlabsVoiceId: data.ttsProviders.elevenlabs?.defaultVoiceId || '',
        elevenlabsModel: data.ttsProviders.elevenlabs?.model || 'eleven_turbo_v2_5',
        elevenlabsApiKey: data.ttsProviders.elevenlabs?.apiKey || '',
        elevenlabsStability: data.ttsProviders.elevenlabs?.settings?.stability ?? 0.5,
        elevenlabsSimilarityBoost: data.ttsProviders.elevenlabs?.settings?.similarityBoost ?? 0.75,
      });

      // Load ElevenLabs voices if enabled and has API key
      if (data.ttsProviders.elevenlabs?.enabled && data.ttsProviders.elevenlabs?.apiKey) {
        loadElevenlabsVoices(data.ttsProviders.elevenlabs.apiKey);
      }
    } catch (error: any) {
      console.error('Error loading settings:', error);
      alert(error.response?.data?.message || 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  };

  const loadDeepgramVoices = async () => {
    try {
      const voices = await settingsService.getVoices('deepgram');
      setDeepgramVoices(voices);
    } catch (error) {
      console.error('Error loading Deepgram voices:', error);
    }
  };

  const loadElevenlabsVoices = async (apiKey?: string) => {
    try {
      setLoadingElevenlabsVoices(true);
      const voices = await settingsService.getVoices('elevenlabs', apiKey || formData.elevenlabsApiKey);
      setElevenlabsVoices(voices);
    } catch (error: any) {
      console.error('Error loading ElevenLabs voices:', error);
      alert(error.response?.data?.message || 'Failed to load ElevenLabs voices. Please check your API key.');
    } finally {
      setLoadingElevenlabsVoices(false);
    }
  };

  const handleTestVoice = async (provider: 'deepgram' | 'elevenlabs', voiceId: string) => {
    try {
      setTestingVoice(`${provider}-${voiceId}`);
      const apiKey = provider === 'deepgram' ? formData.deepgramApiKey : formData.elevenlabsApiKey;
      const result = await settingsService.testTts(provider, voiceId, apiKey || undefined);

      setTestResults(prev => ({
        ...prev,
        [`${provider}-${voiceId}`]: result
      }));

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
        };
      } else if (!result.success) {
        alert(`Voice test failed: ${result.message}`);
      }
    } catch (error: any) {
      console.error('Error testing voice:', error);
      alert(error.response?.data?.message || 'Failed to test voice');
    } finally {
      setTestingVoice(null);
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

  const handleSave = async () => {
    try {
      setSaving(true);

      const updatedSettings: Partial<IAdminSettings> = {
        defaultTtsProvider: formData.defaultTtsProvider,
        ttsProviders: {
          deepgram: {
            enabled: formData.deepgramEnabled,
            defaultVoiceId: formData.deepgramVoiceId,
            apiKey: formData.deepgramApiKey || undefined,
          },
          elevenlabs: {
            enabled: formData.elevenlabsEnabled,
            defaultVoiceId: formData.elevenlabsVoiceId,
            model: formData.elevenlabsModel,
            apiKey: formData.elevenlabsApiKey || undefined,
            settings: {
              stability: formData.elevenlabsStability,
              similarityBoost: formData.elevenlabsSimilarityBoost,
            },
          },
        },
      };

      await settingsService.updateSettings(updatedSettings);
      alert('Settings saved successfully!');
      await loadSettings();
    } catch (error: any) {
      console.error('Error saving settings:', error);
      alert(error.response?.data?.message || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold bg-gradient-to-r from-neutral-900 to-neutral-700 bg-clip-text text-transparent flex items-center">
          <FiSettings className="mr-3 text-neutral-900" size={32} />
          TTS Provider Settings
        </h1>
        <p className="text-neutral-600 mt-2 text-base">
          Configure your Text-to-Speech providers and default voices
        </p>
      </div>

      <div className="space-y-6">
        {/* Default Provider Selection */}
        <div className="form-section">
          <h2 className="text-xl font-bold text-neutral-900 mb-6 flex items-center">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary-500 to-primary-600 flex items-center justify-center mr-3 shadow-md">
              <span className="text-white text-sm font-bold">1</span>
            </div>
            Default TTS Provider
          </h2>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-neutral-700 mb-2">
                Select Default Provider <span className="text-red-500">*</span>
              </label>
              <select
                value={formData.defaultTtsProvider}
                onChange={(e) => setFormData({ ...formData, defaultTtsProvider: e.target.value as 'deepgram' | 'elevenlabs' })}
                className="input-field"
              >
                <option value="deepgram">Deepgram (Fast & Affordable)</option>
                <option value="elevenlabs">ElevenLabs (High Quality)</option>
              </select>
              <p className="text-xs text-neutral-500 mt-2">
                This will be the default TTS provider for new agents
              </p>
            </div>
          </div>
        </div>

        {/* Deepgram Configuration */}
        <div className="form-section">
          <h2 className="text-xl font-bold text-neutral-900 mb-6 flex items-center">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center mr-3 shadow-md">
              <span className="text-white text-sm font-bold">2</span>
            </div>
            Deepgram Settings
          </h2>

          <div className="space-y-5">
            <div className="flex items-center">
              <input
                type="checkbox"
                checked={formData.deepgramEnabled}
                onChange={(e) => setFormData({ ...formData, deepgramEnabled: e.target.checked })}
                className="w-4 h-4 text-primary-600 rounded focus:ring-primary-500"
              />
              <label className="ml-2 text-sm font-medium text-neutral-700">
                Enable Deepgram TTS
              </label>
            </div>

            {formData.deepgramEnabled && (
              <>
                <div>
                  <label className="block text-sm font-semibold text-neutral-700 mb-2">
                    API Key (Optional)
                  </label>
                  <input
                    type="password"
                    value={formData.deepgramApiKey}
                    onChange={(e) => setFormData({ ...formData, deepgramApiKey: e.target.value })}
                    className="input-field"
                    placeholder="Leave empty to use environment variable"
                  />
                  <p className="text-xs text-neutral-500 mt-2">
                    If not provided, will use DEEPGRAM_API_KEY from environment
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-neutral-700 mb-2">
                    Default Voice <span className="text-red-500">*</span>
                  </label>
                  <p className="text-xs text-neutral-600 mb-4">
                    Click the play button to hear a demo of each voice
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {deepgramVoices.map((voice) => (
                      <div
                        key={voice.id}
                        className={`border-2 rounded-lg p-4 cursor-pointer transition-all ${
                          formData.deepgramVoiceId === voice.id
                            ? 'border-primary-500 bg-primary-50'
                            : 'border-neutral-200 hover:border-primary-300'
                        }`}
                        onClick={() => setFormData({ ...formData, deepgramVoiceId: voice.id })}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <h3 className="font-semibold text-neutral-900">{voice.name}</h3>
                            <p className="text-xs text-neutral-600 mt-1">
                              {voice.gender && <span className="capitalize">{voice.gender}</span>}
                              {voice.description && ` • ${voice.description}`}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleTestVoice('deepgram', voice.id);
                            }}
                            disabled={testingVoice === `deepgram-${voice.id}`}
                            className="ml-2 p-2 text-primary-600 hover:bg-primary-100 rounded-lg transition-colors disabled:opacity-50"
                            title="Play voice demo"
                          >
                            {testingVoice === `deepgram-${voice.id}` ? (
                              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary-600"></div>
                            ) : (
                              <FiPlay size={16} />
                            )}
                          </button>
                        </div>
                        {testResults[`deepgram-${voice.id}`] && (
                          <div className={`mt-2 flex items-center text-xs ${
                            testResults[`deepgram-${voice.id}`].success ? 'text-green-600' : 'text-red-600'
                          }`}>
                            {testResults[`deepgram-${voice.id}`].success ? (
                              <FiCheck className="mr-1" />
                            ) : (
                              <FiAlertCircle className="mr-1" />
                            )}
                            {testResults[`deepgram-${voice.id}`].message}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* ElevenLabs Configuration */}
        <div className="form-section">
          <h2 className="text-xl font-bold text-neutral-900 mb-6 flex items-center">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-purple-600 flex items-center justify-center mr-3 shadow-md">
              <span className="text-white text-sm font-bold">3</span>
            </div>
            ElevenLabs Settings
          </h2>

          <div className="space-y-5">
            <div className="flex items-center">
              <input
                type="checkbox"
                checked={formData.elevenlabsEnabled}
                onChange={(e) => setFormData({ ...formData, elevenlabsEnabled: e.target.checked })}
                className="w-4 h-4 text-primary-600 rounded focus:ring-primary-500"
              />
              <label className="ml-2 text-sm font-medium text-neutral-700">
                Enable ElevenLabs TTS
              </label>
            </div>

            {formData.elevenlabsEnabled && (
              <>
                <div>
                  <label className="block text-sm font-semibold text-neutral-700 mb-2">
                    API Key <span className="text-red-500">*</span>
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="password"
                      value={formData.elevenlabsApiKey}
                      onChange={(e) => setFormData({ ...formData, elevenlabsApiKey: e.target.value })}
                      className="input-field flex-1"
                      placeholder="Enter your ElevenLabs API key"
                    />
                    <button
                      type="button"
                      onClick={() => loadElevenlabsVoices()}
                      disabled={!formData.elevenlabsApiKey || loadingElevenlabsVoices}
                      className="btn-primary whitespace-nowrap disabled:opacity-50"
                    >
                      {loadingElevenlabsVoices ? 'Loading...' : 'Load Voices'}
                    </button>
                  </div>
                  <p className="text-xs text-neutral-500 mt-2">
                    Get your API key from{' '}
                    <a href="https://elevenlabs.io" target="_blank" rel="noopener noreferrer" className="text-primary-600 hover:underline">
                      elevenlabs.io
                    </a>
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-neutral-700 mb-2">
                    Model
                  </label>
                  <select
                    value={formData.elevenlabsModel}
                    onChange={(e) => setFormData({ ...formData, elevenlabsModel: e.target.value })}
                    className="input-field"
                  >
                    <option value="eleven_turbo_v2_5">Turbo v2.5 (Fastest)</option>
                    <option value="eleven_multilingual_v2">Multilingual v2</option>
                    <option value="eleven_monolingual_v1">Monolingual v1</option>
                  </select>
                </div>

                {elevenlabsVoices.length > 0 && (
                  <div>
                    <label className="block text-sm font-semibold text-neutral-700 mb-2">
                      Default Voice <span className="text-red-500">*</span>
                    </label>
                    <p className="text-xs text-neutral-600 mb-4">
                      Click the play button to hear a demo of each voice
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-96 overflow-y-auto">
                      {elevenlabsVoices.map((voice) => (
                        <div
                          key={voice.id}
                          className={`border-2 rounded-lg p-4 cursor-pointer transition-all ${
                            formData.elevenlabsVoiceId === voice.id
                              ? 'border-purple-500 bg-purple-50'
                              : 'border-neutral-200 hover:border-purple-300'
                          }`}
                          onClick={() => setFormData({ ...formData, elevenlabsVoiceId: voice.id })}
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <h3 className="font-semibold text-neutral-900">{voice.name}</h3>
                              {voice.category && (
                                <p className="text-xs text-neutral-600 mt-1 capitalize">{voice.category}</p>
                              )}
                              {voice.description && (
                                <p className="text-xs text-neutral-500 mt-1">{voice.description}</p>
                              )}
                            </div>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (voice.previewUrl) {
                                  const audio = new Audio(voice.previewUrl);
                                  audio.play();
                                } else {
                                  handleTestVoice('elevenlabs', voice.id);
                                }
                              }}
                              disabled={testingVoice === `elevenlabs-${voice.id}`}
                              className="ml-2 p-2 text-purple-600 hover:bg-purple-100 rounded-lg transition-colors disabled:opacity-50"
                              title="Play demo"
                            >
                              {testingVoice === `elevenlabs-${voice.id}` ? (
                                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-purple-600"></div>
                              ) : (
                                <FiPlay size={16} />
                              )}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-neutral-700 mb-2">
                      Stability: {formData.elevenlabsStability}
                    </label>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      value={formData.elevenlabsStability}
                      onChange={(e) => setFormData({ ...formData, elevenlabsStability: parseFloat(e.target.value) })}
                      className="w-full"
                    />
                    <p className="text-xs text-neutral-500 mt-1">
                      Higher = more consistent, lower = more expressive
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-neutral-700 mb-2">
                      Similarity Boost: {formData.elevenlabsSimilarityBoost}
                    </label>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      value={formData.elevenlabsSimilarityBoost}
                      onChange={(e) => setFormData({ ...formData, elevenlabsSimilarityBoost: parseFloat(e.target.value) })}
                      className="w-full"
                    />
                    <p className="text-xs text-neutral-500 mt-1">
                      Higher = closer to original voice
                    </p>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Save Button */}
        <div className="flex items-center justify-end space-x-4 pt-4">
          <button
            onClick={handleSave}
            disabled={saving}
            className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed min-w-[160px]"
          >
            {saving ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                Saving...
              </>
            ) : (
              <>
                <FiSave className="mr-2" size={18} />
                Save Settings
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
