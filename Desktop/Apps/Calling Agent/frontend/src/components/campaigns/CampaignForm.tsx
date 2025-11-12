import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { FiSave, FiX, FiUpload, FiTrash2 } from 'react-icons/fi';
import { useCampaignStore } from '../../store/campaignStore';
import { agentService } from '../../services/agentService';
import { phoneService } from '../../services/phoneService';
import type { Agent, Phone } from '../../types';

interface CampaignFormData {
  name: string;
  description: string;
  agentId: string;
  phoneId: string;
  concurrentCallsLimit: number;
  retryFailedCalls: boolean;
  maxRetryAttempts: number;
  retryDelayMinutes: number;
  excludeVoicemail: boolean;
  priorityMode: 'fifo' | 'lifo' | 'priority';
}

interface ContactRow {
  phoneNumber: string;
  name: string;
  email: string;
  priority: number;
}

export default function CampaignForm() {
  const navigate = useNavigate();
  const { createCampaign, addContacts, loading, error, clearError } = useCampaignStore();

  const [agents, setAgents] = useState<Agent[]>([]);
  const [phones, setPhones] = useState<Phone[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [contacts, setContacts] = useState<ContactRow[]>([
    { phoneNumber: '', name: '', email: '', priority: 0 }
  ]);
  const [uploadingCsv, setUploadingCsv] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
    watch
  } = useForm<CampaignFormData>({
    defaultValues: {
      name: '',
      description: '',
      agentId: '',
      phoneId: '',
      concurrentCallsLimit: 3,
      retryFailedCalls: true,
      maxRetryAttempts: 3,
      retryDelayMinutes: 30,
      excludeVoicemail: true,
      priorityMode: 'fifo'
    }
  });

  useEffect(() => {
    loadInitialData();
  }, []);

  const loadInitialData = async () => {
    try {
      setLoadingData(true);
      const [agentsData, phonesData] = await Promise.all([
        agentService.getAgents(),
        phoneService.getPhones()
      ]);
      setAgents(agentsData);
      setPhones(phonesData);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoadingData(false);
    }
  };

  const addContactRow = () => {
    setContacts([...contacts, { phoneNumber: '', name: '', email: '', priority: 0 }]);
  };

  const removeContactRow = (index: number) => {
    setContacts(contacts.filter((_, i) => i !== index));
  };

  const updateContact = (index: number, field: keyof ContactRow, value: string | number) => {
    const updated = [...contacts];
    updated[index] = { ...updated[index], [field]: value };
    setContacts(updated);
  };

  const handleCsvUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploadingCsv(true);
    try {
      const text = await file.text();
      const lines = text.split('\n').filter(line => line.trim());

      // Skip header row
      const dataLines = lines.slice(1);
      const parsedContacts: ContactRow[] = dataLines.map(line => {
        const [phoneNumber, name, email, priority] = line.split(',').map(s => s.trim());
        return {
          phoneNumber: phoneNumber || '',
          name: name || '',
          email: email || '',
          priority: priority ? parseInt(priority) : 0
        };
      }).filter(c => c.phoneNumber);

      if (parsedContacts.length > 0) {
        setContacts(parsedContacts);
      }
    } catch (error) {
      console.error('Error parsing CSV:', error);
      alert('Error parsing CSV file. Please check the format.');
    } finally {
      setUploadingCsv(false);
    }
  };

  const onSubmit = async (data: CampaignFormData) => {
    try {
      clearError();

      // Validate contacts
      const validContacts = contacts.filter(c => c.phoneNumber.trim());
      if (validContacts.length === 0) {
        alert('Please add at least one contact');
        return;
      }

      // Validate phone numbers (basic E.164 check)
      const invalidNumbers = validContacts.filter(c => !c.phoneNumber.match(/^\+[1-9]\d{1,14}$/));
      if (invalidNumbers.length > 0) {
        alert('Some phone numbers are not in E.164 format (e.g., +14155551234)');
        return;
      }

      // Create campaign
      const campaign = await createCampaign({
        name: data.name,
        agentId: data.agentId,
        phoneId: data.phoneId || undefined,
        description: data.description || undefined,
        settings: {
          concurrentCallsLimit: data.concurrentCallsLimit,
          retryFailedCalls: data.retryFailedCalls,
          maxRetryAttempts: data.maxRetryAttempts,
          retryDelayMinutes: data.retryDelayMinutes,
          excludeVoicemail: data.excludeVoicemail,
          priorityMode: data.priorityMode
        }
      });

      // Add contacts
      await addContacts(campaign._id, validContacts);

      // Navigate to campaign detail
      navigate(`/campaigns/${campaign._id}`);
    } catch (error) {
      console.error('Error creating campaign:', error);
    }
  };

  if (loadingData) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Create Campaign</h1>
        <p className="text-gray-600 mt-1">Set up a new bulk call campaign</p>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Basic Information */}
        <div className="bg-white shadow rounded-lg p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Basic Information</h2>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Campaign Name *
              </label>
              <input
                type="text"
                {...register('name', { required: 'Campaign name is required' })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Q1 Sales Outreach"
              />
              {errors.name && (
                <p className="mt-1 text-sm text-red-600">{errors.name.message}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Description
              </label>
              <textarea
                {...register('description')}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Optional description"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Agent *
                </label>
                <select
                  {...register('agentId', { required: 'Agent is required' })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select agent</option>
                  {agents.map(agent => (
                    <option key={agent._id} value={agent._id}>
                      {agent.name}
                    </option>
                  ))}
                </select>
                {errors.agentId && (
                  <p className="mt-1 text-sm text-red-600">{errors.agentId.message}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Phone Number (Optional)
                </label>
                <select
                  {...register('phoneId')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Use default</option>
                  {phones.map(phone => (
                    <option key={phone._id} value={phone._id}>
                      {phone.number}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Campaign Settings */}
        <div className="bg-white shadow rounded-lg p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Campaign Settings</h2>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Concurrent Calls Limit *
              </label>
              <input
                type="number"
                {...register('concurrentCallsLimit', {
                  required: 'Required',
                  min: { value: 1, message: 'Min 1' },
                  max: { value: 50, message: 'Max 50' }
                })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="mt-1 text-xs text-gray-500">
                Maximum number of simultaneous calls for this campaign (1-50)
              </p>
              {errors.concurrentCallsLimit && (
                <p className="mt-1 text-sm text-red-600">{errors.concurrentCallsLimit.message}</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    {...register('retryFailedCalls')}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="ml-2 text-sm text-gray-700">Retry failed calls</span>
                </label>
              </div>

              <div>
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    {...register('excludeVoicemail')}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="ml-2 text-sm text-gray-700">Exclude voicemail from retry</span>
                </label>
              </div>
            </div>

            {watch('retryFailedCalls') && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Max Retry Attempts
                  </label>
                  <input
                    type="number"
                    {...register('maxRetryAttempts', { min: 0, max: 10 })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Retry Delay (minutes)
                  </label>
                  <input
                    type="number"
                    {...register('retryDelayMinutes', { min: 1 })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Priority Mode
              </label>
              <select
                {...register('priorityMode')}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="fifo">First In First Out (FIFO)</option>
                <option value="lifo">Last In First Out (LIFO)</option>
                <option value="priority">Priority Based</option>
              </select>
            </div>
          </div>
        </div>

        {/* Contacts */}
        <div className="bg-white shadow rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Contacts</h2>
            <div className="flex gap-2">
              <label className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 cursor-pointer flex items-center gap-2">
                <FiUpload />
                {uploadingCsv ? 'Uploading...' : 'Upload CSV'}
                <input
                  type="file"
                  accept=".csv"
                  onChange={handleCsvUpload}
                  className="hidden"
                  disabled={uploadingCsv}
                />
              </label>
              <button
                type="button"
                onClick={addContactRow}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
              >
                Add Contact
              </button>
            </div>
          </div>

          <p className="text-xs text-gray-500 mb-4">
            Phone numbers must be in E.164 format (e.g., +14155551234)
          </p>

          <div className="space-y-2 max-h-96 overflow-y-auto">
            {contacts.map((contact, index) => (
              <div key={index} className="flex gap-2 items-start">
                <input
                  type="text"
                  value={contact.phoneNumber}
                  onChange={(e) => updateContact(index, 'phoneNumber', e.target.value)}
                  placeholder="+14155551234"
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <input
                  type="text"
                  value={contact.name}
                  onChange={(e) => updateContact(index, 'name', e.target.value)}
                  placeholder="Name"
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <input
                  type="email"
                  value={contact.email}
                  onChange={(e) => updateContact(index, 'email', e.target.value)}
                  placeholder="Email (optional)"
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <input
                  type="number"
                  value={contact.priority}
                  onChange={(e) => updateContact(index, 'priority', parseInt(e.target.value) || 0)}
                  placeholder="0"
                  className="w-20 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  type="button"
                  onClick={() => removeContactRow(index)}
                  className="p-2 text-red-600 hover:bg-red-50 rounded-md"
                  disabled={contacts.length === 1}
                >
                  <FiTrash2 />
                </button>
              </div>
            ))}
          </div>

          <p className="mt-2 text-sm text-gray-600">
            Total contacts: {contacts.filter(c => c.phoneNumber.trim()).length}
          </p>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={() => navigate('/campaigns')}
            className="px-6 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 flex items-center gap-2"
          >
            <FiX />
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
          >
            <FiSave />
            {loading ? 'Creating...' : 'Create Campaign'}
          </button>
        </div>
      </form>
    </div>
  );
}
