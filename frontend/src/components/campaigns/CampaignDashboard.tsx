import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiPlus, FiPlay, FiPause, FiRefreshCw, FiTrash2, FiEye, FiX } from 'react-icons/fi';
import { useCampaignStore } from '../../store/campaignStore';
import type { Campaign } from '../../types';

export default function CampaignDashboard() {
  const navigate = useNavigate();
  const { campaigns, loading, error, fetchCampaigns, startCampaign, pauseCampaign, resumeCampaign, cancelCampaign, deleteCampaign } = useCampaignStore();

  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadCampaigns();
  }, [statusFilter, searchQuery]);

  const loadCampaigns = () => {
    fetchCampaigns({
      status: statusFilter.length > 0 ? statusFilter : undefined,
      search: searchQuery || undefined
    });
  };

  const handleStatusFilterToggle = (status: string) => {
    setStatusFilter(prev =>
      prev.includes(status)
        ? prev.filter(s => s !== status)
        : [...prev, status]
    );
  };

  const handleStartCampaign = async (id: string) => {
    try {
      await startCampaign(id);
      loadCampaigns();
    } catch (error) {
      console.error('Error starting campaign:', error);
    }
  };

  const handlePauseCampaign = async (id: string) => {
    try {
      await pauseCampaign(id);
      loadCampaigns();
    } catch (error) {
      console.error('Error pausing campaign:', error);
    }
  };

  const handleResumeCampaign = async (id: string) => {
    try {
      await resumeCampaign(id);
      loadCampaigns();
    } catch (error) {
      console.error('Error resuming campaign:', error);
    }
  };

  const handleCancelCampaign = async (id: string) => {
    if (!confirm('Are you sure you want to cancel this campaign?')) return;

    try {
      await cancelCampaign(id);
      loadCampaigns();
    } catch (error) {
      console.error('Error cancelling campaign:', error);
    }
  };

  const handleDeleteCampaign = async (id: string) => {
    if (!confirm('Are you sure you want to delete this campaign? This action cannot be undone.')) return;

    try {
      await deleteCampaign(id);
    } catch (error) {
      console.error('Error deleting campaign:', error);
    }
  };

  const getStatusBadge = (status: string) => {
    const badges: Record<string, { bg: string; text: string }> = {
      draft: { bg: 'bg-gray-100', text: 'text-gray-700' },
      scheduled: { bg: 'bg-blue-100', text: 'text-blue-700' },
      active: { bg: 'bg-green-100', text: 'text-green-700' },
      paused: { bg: 'bg-yellow-100', text: 'text-yellow-700' },
      completed: { bg: 'bg-purple-100', text: 'text-purple-700' },
      cancelled: { bg: 'bg-red-100', text: 'text-red-700' }
    };

    const badge = badges[status] || { bg: 'bg-gray-100', text: 'text-gray-700' };

    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${badge.bg} ${badge.text}`}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    );
  };

  const renderCampaignActions = (campaign: Campaign) => {
    switch (campaign.status) {
      case 'draft':
      case 'scheduled':
        return (
          <>
            <button
              onClick={() => handleStartCampaign(campaign._id)}
              className="p-2 text-green-600 hover:bg-green-50 rounded-md"
              title="Start campaign"
            >
              <FiPlay />
            </button>
            <button
              onClick={() => handleDeleteCampaign(campaign._id)}
              className="p-2 text-red-600 hover:bg-red-50 rounded-md"
              title="Delete campaign"
            >
              <FiTrash2 />
            </button>
          </>
        );
      case 'active':
        return (
          <>
            <button
              onClick={() => handlePauseCampaign(campaign._id)}
              className="p-2 text-yellow-600 hover:bg-yellow-50 rounded-md"
              title="Pause campaign"
            >
              <FiPause />
            </button>
            <button
              onClick={() => handleCancelCampaign(campaign._id)}
              className="p-2 text-red-600 hover:bg-red-50 rounded-md"
              title="Cancel campaign"
            >
              <FiX />
            </button>
          </>
        );
      case 'paused':
        return (
          <>
            <button
              onClick={() => handleResumeCampaign(campaign._id)}
              className="p-2 text-green-600 hover:bg-green-50 rounded-md"
              title="Resume campaign"
            >
              <FiPlay />
            </button>
            <button
              onClick={() => handleCancelCampaign(campaign._id)}
              className="p-2 text-red-600 hover:bg-red-50 rounded-md"
              title="Cancel campaign"
            >
              <FiX />
            </button>
          </>
        );
      case 'completed':
      case 'cancelled':
        return (
          <button
            onClick={() => handleDeleteCampaign(campaign._id)}
            className="p-2 text-red-600 hover:bg-red-50 rounded-md"
            title="Delete campaign"
          >
            <FiTrash2 />
          </button>
        );
      default:
        return null;
    }
  };

  if (loading && campaigns.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading campaigns...</div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Campaigns</h1>
          <p className="text-gray-600 mt-1">Manage your bulk call campaigns</p>
        </div>
        <button
          onClick={() => navigate('/campaigns/new')}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 flex items-center gap-2"
        >
          <FiPlus />
          New Campaign
        </button>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white shadow rounded-lg p-4 mb-6">
        <div className="flex flex-col md:flex-row gap-4">
          {/* Search */}
          <div className="flex-1">
            <input
              type="text"
              placeholder="Search campaigns..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Status Filters */}
          <div className="flex gap-2 flex-wrap">
            {['draft', 'scheduled', 'active', 'paused', 'completed', 'cancelled'].map(status => (
              <button
                key={status}
                onClick={() => handleStatusFilterToggle(status)}
                className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  statusFilter.includes(status)
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {status.charAt(0).toUpperCase() + status.slice(1)}
              </button>
            ))}
          </div>

          {/* Refresh */}
          <button
            onClick={loadCampaigns}
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 flex items-center gap-2"
          >
            <FiRefreshCw />
            Refresh
          </button>
        </div>
      </div>

      {/* Campaigns List */}
      {campaigns.length === 0 ? (
        <div className="bg-white shadow rounded-lg p-12 text-center">
          <p className="text-gray-500 mb-4">No campaigns found</p>
          <button
            onClick={() => navigate('/campaigns/new')}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            Create Your First Campaign
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {campaigns.map(campaign => (
            <div key={campaign._id} className="bg-white shadow rounded-lg p-6">
              <div className="flex items-start justify-between">
                {/* Campaign Info */}
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-lg font-semibold text-gray-900">{campaign.name}</h3>
                    {getStatusBadge(campaign.status)}
                  </div>

                  {campaign.description && (
                    <p className="text-sm text-gray-600 mb-3">{campaign.description}</p>
                  )}

                  {/* Stats */}
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mt-4">
                    <div>
                      <p className="text-xs text-gray-500">Total Contacts</p>
                      <p className="text-lg font-semibold text-gray-900">{campaign.totalContacts}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Active</p>
                      <p className="text-lg font-semibold text-blue-600">{campaign.activeCalls}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Completed</p>
                      <p className="text-lg font-semibold text-green-600">{campaign.completedCalls}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Failed</p>
                      <p className="text-lg font-semibold text-red-600">{campaign.failedCalls}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Progress</p>
                      <p className="text-lg font-semibold text-purple-600">{campaign.progress}%</p>
                    </div>
                  </div>

                  {/* Progress Bar */}
                  {campaign.status === 'active' && (
                    <div className="mt-4">
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                          className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                          style={{ width: `${campaign.progress}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Settings Info */}
                  <div className="mt-3 flex items-center gap-4 text-xs text-gray-500">
                    <span>Concurrent Limit: {campaign.settings.concurrentCallsLimit}</span>
                    <span>Priority: {campaign.settings.priorityMode.toUpperCase()}</span>
                    {campaign.settings.retryFailedCalls && (
                      <span>Retry: {campaign.settings.maxRetryAttempts}x</span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 ml-4">
                  <button
                    onClick={() => navigate(`/campaigns/${campaign._id}`)}
                    className="p-2 text-blue-600 hover:bg-blue-50 rounded-md"
                    title="View details"
                  >
                    <FiEye />
                  </button>
                  {renderCampaignActions(campaign)}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
