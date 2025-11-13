import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { FiArrowLeft, FiPlay, FiPause, FiRefreshCw, FiX, FiPhone, FiUsers } from 'react-icons/fi';
import { useCampaignStore } from '../../store/campaignStore';
import { campaignApi } from '../../services/campaignApi';
import type { CallLog } from '../../types';
import { formatDuration, formatDate, formatPhoneNumber, calculateDuration } from '../../utils/format';

export default function CampaignDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const {
    currentCampaign,
    currentProgress,
    loading,
    error,
    fetchCampaign,
    fetchProgress,
    startCampaign,
    pauseCampaign,
    resumeCampaign,
    cancelCampaign
  } = useCampaignStore();

  const [autoRefresh, setAutoRefresh] = useState(true);
  const [callLogs, setCallLogs] = useState<CallLog[]>([]);
  const [callLogsLoading, setCallLogsLoading] = useState(false);
  const [callLogsPage, setCallLogsPage] = useState(1);
  const [callLogsTotal, setCallLogsTotal] = useState(0);

  useEffect(() => {
    if (id) {
      loadCampaignData();
    }
  }, [id]);

  useEffect(() => {
    if (!autoRefresh || !id) return;

    const interval = setInterval(() => {
      fetchProgress(id);
      loadCallLogs();
    }, 5000); // Refresh every 5 seconds

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRefresh, id]);

  const loadCampaignData = async () => {
    if (!id) return;
    await fetchCampaign(id);
    await fetchProgress(id);
    await loadCallLogs();
  };

  const loadCallLogs = async () => {
    if (!id) return;
    try {
      setCallLogsLoading(true);
      const response = await campaignApi.getCallLogs(id, { page: callLogsPage, limit: 50 });
      if (response.success && response.data) {
        setCallLogs(response.data.callLogs || []);
        setCallLogsTotal(response.data.total || 0);
      }
    } catch (error) {
      console.error('Error loading call logs:', error);
    } finally {
      setCallLogsLoading(false);
    }
  };

  const handleStart = async () => {
    if (!id) return;
    try {
      await startCampaign(id);
      await loadCampaignData();
    } catch (error) {
      console.error('Error starting campaign:', error);
    }
  };

  const handlePause = async () => {
    if (!id) return;
    try {
      await pauseCampaign(id);
      await loadCampaignData();
    } catch (error) {
      console.error('Error pausing campaign:', error);
    }
  };

  const handleResume = async () => {
    if (!id) return;
    try {
      await resumeCampaign(id);
      await loadCampaignData();
    } catch (error) {
      console.error('Error resuming campaign:', error);
    }
  };

  const handleCancel = async () => {
    if (!id || !confirm('Are you sure you want to cancel this campaign?')) return;
    try {
      await cancelCampaign(id);
      await loadCampaignData();
    } catch (error) {
      console.error('Error cancelling campaign:', error);
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
      <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${badge.bg} ${badge.text}`}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    );
  };

  if (loading && !currentCampaign) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading campaign...</div>
      </div>
    );
  }

  if (!currentCampaign) {
    return (
      <div className="max-w-7xl mx-auto p-6">
        <div className="bg-white shadow rounded-lg p-12 text-center">
          <p className="text-gray-500 mb-4">Campaign not found</p>
          <button
            onClick={() => navigate('/campaigns')}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            Back to Campaigns
          </button>
        </div>
      </div>
    );
  }

  const campaign = currentCampaign;
  const progress = currentProgress?.campaign || campaign;

  return (
    <div className="max-w-7xl mx-auto p-6">
      {/* Header */}
      <div className="mb-6">
        <button
          onClick={() => navigate('/campaigns')}
          className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4"
        >
          <FiArrowLeft />
          Back to Campaigns
        </button>

        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-2xl font-bold text-gray-900">{campaign.name}</h1>
              {getStatusBadge(campaign.status)}
            </div>
            {campaign.description && (
              <p className="text-gray-600">{campaign.description}</p>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2">
            <button
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={`px-4 py-2 rounded-md flex items-center gap-2 ${
                autoRefresh
                  ? 'bg-green-100 text-green-700'
                  : 'bg-gray-100 text-gray-700'
              }`}
            >
              <FiRefreshCw className={autoRefresh ? 'animate-spin' : ''} />
              {autoRefresh ? 'Auto Refresh On' : 'Auto Refresh Off'}
            </button>

            {campaign.status === 'draft' || campaign.status === 'scheduled' ? (
              <button
                onClick={handleStart}
                disabled={loading}
                className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 flex items-center gap-2"
              >
                <FiPlay />
                Start Campaign
              </button>
            ) : campaign.status === 'active' ? (
              <>
                <button
                  onClick={handlePause}
                  disabled={loading}
                  className="px-4 py-2 bg-yellow-600 text-white rounded-md hover:bg-yellow-700 disabled:opacity-50 flex items-center gap-2"
                >
                  <FiPause />
                  Pause
                </button>
                <button
                  onClick={handleCancel}
                  disabled={loading}
                  className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50 flex items-center gap-2"
                >
                  <FiX />
                  Cancel
                </button>
              </>
            ) : campaign.status === 'paused' ? (
              <>
                <button
                  onClick={handleResume}
                  disabled={loading}
                  className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 flex items-center gap-2"
                >
                  <FiPlay />
                  Resume
                </button>
                <button
                  onClick={handleCancel}
                  disabled={loading}
                  className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50 flex items-center gap-2"
                >
                  <FiX />
                  Cancel
                </button>
              </>
            ) : null}
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}

      {/* Overview Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
        <div className="bg-white shadow rounded-lg p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Total Contacts</p>
              <p className="text-3xl font-bold text-gray-900 mt-1">{progress.totalContacts}</p>
            </div>
            <div className="p-3 bg-blue-100 rounded-full">
              <FiUsers className="text-2xl text-blue-600" />
            </div>
          </div>
        </div>

        <div className="bg-white shadow rounded-lg p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Active Calls</p>
              <p className="text-3xl font-bold text-blue-600 mt-1">{progress.activeCalls}</p>
              <p className="text-xs text-gray-500 mt-1">
                Limit: {campaign.settings.concurrentCallsLimit}
              </p>
            </div>
            <div className="p-3 bg-blue-100 rounded-full">
              <FiPhone className="text-2xl text-blue-600" />
            </div>
          </div>
        </div>

        <div className="bg-white shadow rounded-lg p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Completed</p>
              <p className="text-3xl font-bold text-green-600 mt-1">{progress.completedCalls}</p>
              <p className="text-xs text-gray-500 mt-1">
                Success Rate: {progress.successRate}%
              </p>
            </div>
            <div className="p-3 bg-green-100 rounded-full">
              <FiPhone className="text-2xl text-green-600" />
            </div>
          </div>
        </div>

        <div className="bg-white shadow rounded-lg p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Failed</p>
              <p className="text-3xl font-bold text-red-600 mt-1">{progress.failedCalls}</p>
              <p className="text-xs text-gray-500 mt-1">
                Voicemail: {progress.voicemailCalls}
              </p>
            </div>
            <div className="p-3 bg-red-100 rounded-full">
              <FiPhone className="text-2xl text-red-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Progress Section */}
      <div className="bg-white shadow rounded-lg p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Campaign Progress</h2>

        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-600">Overall Progress</span>
            <span className="text-sm font-semibold text-gray-900">{progress.progress ?? 0}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-4">
            <div
              className="bg-blue-600 h-4 rounded-full transition-all duration-300 flex items-center justify-end pr-2"
              style={{ width: `${progress.progress ?? 0}%` }}
            >
              {(progress.progress ?? 0) > 10 && (
                <span className="text-xs text-white font-medium">{progress.progress}%</span>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
          <div className="text-center p-4 bg-gray-50 rounded-lg">
            <p className="text-2xl font-bold text-gray-700">{progress.queuedCalls}</p>
            <p className="text-xs text-gray-500 mt-1">Queued</p>
          </div>
          <div className="text-center p-4 bg-blue-50 rounded-lg">
            <p className="text-2xl font-bold text-blue-600">{progress.activeCalls}</p>
            <p className="text-xs text-gray-500 mt-1">Active</p>
          </div>
          <div className="text-center p-4 bg-green-50 rounded-lg">
            <p className="text-2xl font-bold text-green-600">{progress.completedCalls}</p>
            <p className="text-xs text-gray-500 mt-1">Completed</p>
          </div>
          <div className="text-center p-4 bg-red-50 rounded-lg">
            <p className="text-2xl font-bold text-red-600">{progress.failedCalls}</p>
            <p className="text-xs text-gray-500 mt-1">Failed</p>
          </div>
        </div>
      </div>

      {/* Queue Status */}
      {currentProgress?.queue && (
        <div className="bg-white shadow rounded-lg p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Queue Status</h2>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="text-center p-4 bg-gray-50 rounded-lg">
              <p className="text-2xl font-bold text-gray-700">{currentProgress.queue.waiting}</p>
              <p className="text-xs text-gray-500 mt-1">Waiting</p>
            </div>
            <div className="text-center p-4 bg-blue-50 rounded-lg">
              <p className="text-2xl font-bold text-blue-600">{currentProgress.queue.active}</p>
              <p className="text-xs text-gray-500 mt-1">Active</p>
            </div>
            <div className="text-center p-4 bg-green-50 rounded-lg">
              <p className="text-2xl font-bold text-green-600">{currentProgress.queue.completed}</p>
              <p className="text-xs text-gray-500 mt-1">Completed</p>
            </div>
            <div className="text-center p-4 bg-red-50 rounded-lg">
              <p className="text-2xl font-bold text-red-600">{currentProgress.queue.failed}</p>
              <p className="text-xs text-gray-500 mt-1">Failed</p>
            </div>
            <div className="text-center p-4 bg-yellow-50 rounded-lg">
              <p className="text-2xl font-bold text-yellow-600">{currentProgress.queue.delayed}</p>
              <p className="text-xs text-gray-500 mt-1">Delayed</p>
            </div>
          </div>
        </div>
      )}

      {/* Campaign Settings */}
      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Campaign Settings</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h3 className="text-sm font-medium text-gray-700 mb-2">Call Configuration</h3>
            <dl className="space-y-2">
              <div className="flex justify-between">
                <dt className="text-sm text-gray-500">Concurrent Calls Limit</dt>
                <dd className="text-sm font-medium text-gray-900">{campaign.settings.concurrentCallsLimit}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-sm text-gray-500">Priority Mode</dt>
                <dd className="text-sm font-medium text-gray-900">{campaign.settings.priorityMode.toUpperCase()}</dd>
              </div>
            </dl>
          </div>

          <div>
            <h3 className="text-sm font-medium text-gray-700 mb-2">Retry Configuration</h3>
            <dl className="space-y-2">
              <div className="flex justify-between">
                <dt className="text-sm text-gray-500">Retry Failed Calls</dt>
                <dd className="text-sm font-medium text-gray-900">
                  {campaign.settings.retryFailedCalls ? 'Yes' : 'No'}
                </dd>
              </div>
              {campaign.settings.retryFailedCalls && (
                <>
                  <div className="flex justify-between">
                    <dt className="text-sm text-gray-500">Max Retry Attempts</dt>
                    <dd className="text-sm font-medium text-gray-900">{campaign.settings.maxRetryAttempts}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-sm text-gray-500">Retry Delay</dt>
                    <dd className="text-sm font-medium text-gray-900">{campaign.settings.retryDelayMinutes} min</dd>
                  </div>
                </>
              )}
              <div className="flex justify-between">
                <dt className="text-sm text-gray-500">Exclude Voicemail</dt>
                <dd className="text-sm font-medium text-gray-900">
                  {campaign.settings.excludeVoicemail ? 'Yes' : 'No'}
                </dd>
              </div>
            </dl>
          </div>
        </div>

        {/* Timestamps */}
        <div className="mt-6 pt-6 border-t border-gray-200">
          <h3 className="text-sm font-medium text-gray-700 mb-2">Timeline</h3>
          <dl className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <dt className="text-xs text-gray-500">Created</dt>
              <dd className="text-sm font-medium text-gray-900 mt-1">
                {new Date(campaign.createdAt).toLocaleString()}
              </dd>
            </div>
            {campaign.startedAt && (
              <div>
                <dt className="text-xs text-gray-500">Started</dt>
                <dd className="text-sm font-medium text-gray-900 mt-1">
                  {new Date(campaign.startedAt).toLocaleString()}
                </dd>
              </div>
            )}
            {campaign.completedAt && (
              <div>
                <dt className="text-xs text-gray-500">Completed</dt>
                <dd className="text-sm font-medium text-gray-900 mt-1">
                  {new Date(campaign.completedAt).toLocaleString()}
                </dd>
              </div>
            )}
          </dl>
        </div>
      </div>

      {/* Call Logs Section */}
      <div className="bg-white shadow rounded-lg p-6 mt-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Call Logs</h2>
          {callLogsTotal > 0 && (
            <span className="text-sm text-gray-500">
              {callLogsTotal} {callLogsTotal === 1 ? 'call' : 'calls'}
            </span>
          )}
        </div>

        {callLogsLoading ? (
          <div className="text-center py-8 text-gray-500">Loading call logs...</div>
        ) : callLogs.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <FiPhone className="mx-auto mb-2 text-gray-400" size={32} />
            <p>No call logs yet</p>
            <p className="text-sm mt-1">Calls made in this campaign will appear here</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Agent
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Phone Number
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Duration
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Date
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {callLogs.map((call) => {
                  const getStatusColor = (status: string) => {
                    const colors: Record<string, string> = {
                      completed: 'bg-success-100 text-success-700',
                      failed: 'bg-red-100 text-red-700',
                      'in-progress': 'bg-primary-100 text-primary-700',
                      'no-answer': 'bg-yellow-100 text-yellow-700',
                      ringing: 'bg-blue-100 text-blue-700',
                      initiated: 'bg-gray-100 text-gray-700'
                    };
                    return colors[status] || 'bg-gray-100 text-gray-700';
                  };

                  return (
                    <tr key={call._id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">
                          {typeof call.agentId === 'object' && call.agentId?.name
                            ? call.agentId.name
                            : 'N/A'}
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="text-sm text-gray-700 font-medium">
                          {formatPhoneNumber(call.direction === 'inbound' ? call.fromPhone : call.toPhone)}
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={`px-3 py-1 text-xs font-medium rounded-full ${getStatusColor(call.status)}`}>
                          {call.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">
                        {(() => {
                          const duration = call.duration || call.durationSec;
                          if (duration && duration > 0) {
                            return formatDuration(duration);
                          }
                          const calculated = calculateDuration(call.startedAt, call.endedAt);
                          return calculated && calculated > 0 ? formatDuration(calculated) : 'N/A';
                        })()}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                        {formatDate(call.createdAt)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm">
                        <Link
                          to={`/calls/${call._id}`}
                          className="text-blue-600 hover:text-blue-700 font-semibold hover:underline transition-colors"
                        >
                          View Details →
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
