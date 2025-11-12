import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FiPhone, FiFilter, FiDownload } from 'react-icons/fi';
import { callService } from '../../services/callService';
import type { CallLog } from '../../types';
import { formatDuration, formatDate, formatPhoneNumber, calculateDuration } from '../../utils/format';

export default function CallList() {
  const [calls, setCalls] = useState<CallLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    status: '',
    agentId: '',
  });

  useEffect(() => {
    loadCalls();
  }, [filters]);

  const loadCalls = async () => {
    try {
      setLoading(true);
      const data = await callService.getCalls(filters);
      setCalls(data);
    } catch (error: any) {
      console.error('Error loading calls:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-success-100 text-success-700';
      case 'failed':
        return 'bg-red-100 text-red-700';
      case 'in-progress':
        return 'bg-primary-100 text-primary-700';
      case 'no-answer':
        return 'bg-yellow-100 text-yellow-700';
      default:
        return 'bg-neutral-100 text-neutral-700';
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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-neutral-900 to-neutral-700 bg-clip-text text-transparent">Call Logs</h1>
          <p className="text-neutral-600 mt-2 text-base">View and manage your call history</p>
        </div>
        <button className="btn-secondary">
          <FiDownload className="mr-2" size={18} />
          Export CSV  
        </button>
      </div>

      {/* Filters */}
      <div className="card p-5">
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2 text-neutral-700">
            <FiFilter size={18} />
            <span className="font-semibold text-sm">Filter:</span>
          </div>
          <select
            value={filters.status}
            onChange={(e) => setFilters({ ...filters, status: e.target.value })}
            className="input-field max-w-xs"
          >
            <option value="">All Statuses</option>
            <option value="completed">Completed</option>
            <option value="failed">Failed</option>
            <option value="in-progress">In Progress</option>
            <option value="no-answer">No Answer</option>
          </select>
        </div>
      </div>

      {/* Calls Table */}
      <div className="card overflow-hidden">
        {calls.length === 0 ? (
          <div className="p-16 text-center">
            <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-primary-100 to-primary-200 flex items-center justify-center shadow-lg shadow-primary-500/20">
              <FiPhone className="text-primary-600" size={40} />
            </div>
            <h3 className="text-2xl font-bold text-neutral-900 mb-3">No calls yet</h3>
            <p className="text-neutral-600 text-base leading-relaxed">
              Start making calls with your agents to see them here.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gradient-to-r from-neutral-50 to-neutral-100/50 border-b border-neutral-200">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-neutral-600 uppercase tracking-wider">
                    Agent
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-neutral-600 uppercase tracking-wider">
                    Phone Number
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-neutral-600 uppercase tracking-wider">
                    Direction
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-neutral-600 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-neutral-600 uppercase tracking-wider">
                    Duration
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-neutral-600 uppercase tracking-wider">
                    Date
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-neutral-600 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 bg-white">
                {calls.map((call) => (
                  <tr key={call._id} className="hover:bg-neutral-50/50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-semibold text-neutral-900">
                        {call.agentId?.name || 'N/A'}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-neutral-700 font-medium">
                        {formatPhoneNumber(call.direction === 'inbound' ? call.fromPhone : call.toPhone)}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`px-3 py-1 text-xs font-medium rounded-full ${
                          call.direction === 'inbound'
                            ? 'bg-primary-100 text-primary-700'
                            : 'bg-secondary-100 text-secondary-700'
                        }`}
                      >
                        {call.direction}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <span className={`px-3 py-1 text-xs font-medium rounded-full ${getStatusColor(call.status)}`}>
                          {call.status}
                        </span>
                        {call.metadata?.voicemailDetected && (
                          <span
                            className="px-2 py-1 text-xs font-medium rounded-full bg-orange-100 text-orange-700 border border-orange-200"
                            title={`Voicemail detected (${Math.round((call.metadata.voicemailConfidence || 0) * 100)}% confidence)`}
                          >
                            Voicemail
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-neutral-700">
                      {(() => {
                        const duration = call.duration || call.durationSec;
                        if (duration && duration > 0) {
                          return formatDuration(duration);
                        }
                        // Fallback: calculate from startedAt and endedAt
                        const calculated = calculateDuration(call.startedAt, call.endedAt);
                        return calculated && calculated > 0 ? formatDuration(calculated) : 'N/A';
                      })()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-500">
                      {formatDate(call.createdAt)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <Link
                        to={`/calls/${call._id}`}
                        className="text-primary-600 hover:text-primary-700 font-semibold hover:underline transition-colors"
                      >
                        View Details →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
