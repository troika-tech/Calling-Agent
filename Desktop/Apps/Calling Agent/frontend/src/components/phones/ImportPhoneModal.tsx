import { useState } from 'react';
import { FiX, FiPhone } from 'react-icons/fi';
import { phoneService } from '../../services/phoneService';
import type { ImportPhoneRequest } from '../../types';

interface ImportPhoneModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

export default function ImportPhoneModal({ onClose, onSuccess }: ImportPhoneModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState<ImportPhoneRequest>({
    number: '',
    country: 'IN',
    exotelConfig: {
      apiKey: '',
      apiToken: '',
      sid: '',
      subdomain: '',
      appId: '',
    },
    tags: [],
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      // Validate phone number format
      if (!formData.number.match(/^\+?[1-9]\d{1,14}$/)) {
        throw new Error('Invalid phone number format. Use E.164 format (e.g., +919876543210)');
      }

      await phoneService.importPhone(formData);
      onSuccess();
    } catch (err: any) {
      console.error('Error importing phone:', err);
      setError(err.response?.data?.message || err.message || 'Failed to import phone number');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (field: keyof ImportPhoneRequest, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleExotelConfigChange = (field: string, value: string) => {
    setFormData((prev) => ({
      ...prev,
      exotelConfig: {
        ...prev.exotelConfig,
        [field]: value,
      },
    }));
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between rounded-t-2xl">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-500 to-primary-600 flex items-center justify-center">
              <FiPhone className="text-white" size={20} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">Import Phone Number</h2>
              <p className="text-sm text-gray-600">Add Exotel phone number to your account</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <FiX size={24} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
              {error}
            </div>
          )}

          {/* Phone Number Section */}
          <div className="form-section">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Phone Number Details</h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Phone Number *
                </label>
                <input
                  type="text"
                  value={formData.number}
                  onChange={(e) => handleChange('number', e.target.value)}
                  className="input-field"
                  placeholder="+919876543210"
                  required
                />
                <p className="text-xs text-gray-500 mt-1">
                  Use E.164 format with country code (e.g., +91 for India)
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Country Code *
                </label>
                <input
                  type="text"
                  value={formData.country}
                  onChange={(e) => handleChange('country', e.target.value.toUpperCase())}
                  className="input-field uppercase"
                  placeholder="IN"
                  maxLength={2}
                  required
                />
                <p className="text-xs text-gray-500 mt-1">
                  2-letter code (e.g., IN, US)
                </p>
              </div>
            </div>
          </div>

          {/* Exotel Configuration */}
          <div className="form-section">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Exotel Credentials</h3>
            <p className="text-sm text-gray-600 mb-4">
              Enter your Exotel API credentials. You can find these in your Exotel dashboard.
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  API Key *
                </label>
                <input
                  type="text"
                  value={formData.exotelConfig.apiKey}
                  onChange={(e) => handleExotelConfigChange('apiKey', e.target.value)}
                  className="input-field"
                  placeholder="Enter your Exotel API Key"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  API Token *
                </label>
                <input
                  type="password"
                  value={formData.exotelConfig.apiToken}
                  onChange={(e) => handleExotelConfigChange('apiToken', e.target.value)}
                  className="input-field"
                  placeholder="Enter your Exotel API Token"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Account SID *
                </label>
                <input
                  type="text"
                  value={formData.exotelConfig.sid}
                  onChange={(e) => handleExotelConfigChange('sid', e.target.value)}
                  className="input-field"
                  placeholder="Enter your Exotel SID"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Subdomain *
                </label>
                <input
                  type="text"
                  value={formData.exotelConfig.subdomain}
                  onChange={(e) => handleExotelConfigChange('subdomain', e.target.value)}
                  className="input-field"
                  placeholder="e.g., api.exotel.com"
                  required
                />
                <p className="text-xs text-gray-500 mt-1">
                  Usually api.exotel.com or your custom subdomain
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  App ID (Voicebot)
                </label>
                <input
                  type="text"
                  value={formData.exotelConfig.appId || ''}
                  onChange={(e) => handleExotelConfigChange('appId', e.target.value)}
                  className="input-field"
                  placeholder="Enter your Exotel Voicebot App ID"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Required for making outbound calls. Find this in your Exotel dashboard under Applets.
                </p>
              </div>
            </div>
          </div>

          {/* Tags (Optional) */}
          <div className="form-section">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Tags (Optional)
            </label>
            <input
              type="text"
              onChange={(e) => {
                const tags = e.target.value.split(',').map(t => t.trim()).filter(Boolean);
                handleChange('tags', tags);
              }}
              className="input-field"
              placeholder="sales, support, customer-service (comma separated)"
            />
            <p className="text-xs text-gray-500 mt-1">
              Add tags to organize your phone numbers
            </p>
          </div>

          {/* Actions */}
          <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200">
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-2.5 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl font-medium transition-colors"
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn-primary px-6 py-2.5"
              disabled={loading}
            >
              {loading ? (
                <span className="flex items-center space-x-2">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  <span>Importing...</span>
                </span>
              ) : (
                'Import Phone Number'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
