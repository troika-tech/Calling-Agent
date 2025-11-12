import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FiUsers, FiPhone, FiClock, FiTrendingUp, FiPhoneCall, FiX } from 'react-icons/fi';
import { agentService } from '../../services/agentService';
import { callService } from '../../services/callService';
import { phoneService } from '../../services/phoneService';
import { useAuthStore } from '../../store/authStore';
import type { Agent, CallLog, CallStats, Phone } from '../../types';
import { formatDuration, formatDate } from '../../utils/format';

export default function Dashboard() {
  const { user } = useAuthStore();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [recentCalls, setRecentCalls] = useState<CallLog[]>([]);
  const [stats, setStats] = useState<CallStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [callModalOpen, setCallModalOpen] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [agentPhone, setAgentPhone] = useState<Phone | null>(null);
  const [initiatingCall, setInitiatingCall] = useState(false);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      const [agentsData, callsData, statsData] = await Promise.all([
        agentService.getAgents(),
        callService.getCalls(),
        callService.getCallStats(),
      ]);

      setAgents(agentsData);
      setRecentCalls(callsData.slice(0, 5));
      setStats(statsData);
    } catch (error) {
      console.error('Error loading dashboard:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleStartCall = async (agent: Agent, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    setSelectedAgent(agent);

    try {
      // Get phone associated with this agent
      const phones = await phoneService.getPhones();
      const phone = phones.find(p =>
        typeof p.agentId === 'object' ? p.agentId._id === agent._id : p.agentId === agent._id
      );

      if (!phone) {
        alert('No phone number is assigned to this agent. Please assign a phone number first.');
        return;
      }

      setAgentPhone(phone);
      setCallModalOpen(true);
    } catch (error) {
      console.error('Error fetching agent phone:', error);
      alert('Failed to fetch agent phone number');
    }
  };

  const handleInitiateCall = async () => {
    if (!agentPhone || !phoneNumber.trim() || !selectedAgent || !user) {
      return;
    }

    // Validate E.164 format
    const phoneRegex = /^\+[1-9]\d{1,14}$/;
    if (!phoneRegex.test(phoneNumber.trim())) {
      alert('Please enter a valid phone number in E.164 format (e.g., +919876543210)');
      return;
    }

    try {
      setInitiatingCall(true);
      await callService.initiateOutboundCall({
        phoneNumber: phoneNumber.trim(),
        phoneId: agentPhone._id,
        agentId: selectedAgent._id,
        userId: user._id,
        metadata: {
          initiatedFrom: 'dashboard'
        }
      });

      alert(`Call initiated successfully to ${phoneNumber}`);
      setCallModalOpen(false);
      setPhoneNumber('');
      setSelectedAgent(null);
      setAgentPhone(null);

      // Reload dashboard to show new call
      loadDashboardData();
    } catch (error: any) {
      console.error('Error initiating call:', error);
      const errorMessage = error.response?.data?.error?.message
        || error.response?.data?.message
        || error.message
        || 'Failed to initiate call. Please try again.';
      alert(errorMessage);
    } finally {
      setInitiatingCall(false);
    }
  };

  const handleCloseModal = () => {
    setCallModalOpen(false);
    setPhoneNumber('');
    setSelectedAgent(null);
    setAgentPhone(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  const statCards = [
    {
      title: 'Total Agents',
      value: agents.length,
      icon: FiUsers,
      gradient: 'from-primary-500 to-primary-600',
      bgGradient: 'from-primary-50 to-primary-100/50',
    },
    {
      title: 'Total Calls',
      value: stats?.totalCalls || 0,
      icon: FiPhone,
      gradient: 'from-success-500 to-success-600',
      bgGradient: 'from-success-50 to-success-100/50',
    },
    {
      title: 'Completed Calls',
      value: stats?.completedCalls || 0,
      icon: FiTrendingUp,
      gradient: 'from-secondary-500 to-secondary-600',
      bgGradient: 'from-secondary-50 to-secondary-100/50',
    },
    {
      title: 'Avg Duration',
      value: formatDuration(stats?.averageDuration || 0),
      icon: FiClock,
      gradient: 'from-accent-500 to-accent-600',
      bgGradient: 'from-accent-50 to-accent-100/50',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Admin Dashboard</h1>
        <p className="text-gray-600">Manage your AI calling agents, view analytics, and monitor call activity</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {statCards.map((stat) => {
          const Icon = stat.icon;
          return (
            <div key={stat.title} className={`card p-6 bg-gradient-to-br ${stat.bgGradient} border-none hover:shadow-lg group`}>
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <p className="text-sm font-medium text-neutral-600 mb-2">{stat.title}</p>
                  <p className="text-3xl font-bold text-neutral-900">{stat.value}</p>
                </div>
                <div className={`p-4 rounded-xl bg-gradient-to-br ${stat.gradient} shadow-lg shadow-primary-500/20 group-hover:scale-110 transition-transform duration-200`}>
                  <Icon className="text-white" size={24} />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Agents Overview */}
      <div className="card">
        <div className="p-6 border-b border-neutral-100">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-neutral-900">Active Agents</h2>
            <Link to="/agents" className="text-sm text-primary-600 hover:text-primary-700 font-semibold transition-colors">
              View All →
            </Link>
          </div>
        </div>
        <div className="p-6">
          {agents.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-neutral-100 to-neutral-200 flex items-center justify-center">
                <FiUsers className="text-neutral-400" size={32} />
              </div>
              <p className="text-neutral-600 mb-6 text-lg">No agents created yet</p>
              <Link to="/agents" className="btn-primary">
                Create Your First Agent
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {agents.slice(0, 6).map((agent) => (
                <div
                  key={agent._id}
                  className="p-5 border border-neutral-200 rounded-xl hover:border-primary-400 hover:shadow-md transition-all duration-200 bg-white group relative"
                >
                  <Link to={`/agents/${agent._id}`} className="block">
                    <div className="flex items-start justify-between mb-3">
                      <h3 className="font-semibold text-neutral-900 group-hover:text-primary-600 transition-colors">{agent.name}</h3>
                      <span
                        className={`px-2.5 py-1 text-xs font-medium rounded-full flex items-center ${
                          agent.isActive
                            ? 'bg-success-100 text-success-700'
                            : 'bg-neutral-100 text-neutral-600'
                        }`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${agent.isActive ? 'bg-success-600' : 'bg-neutral-400'}`}></span>
                        {agent.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                    {agent.description && (
                      <p className="text-sm text-neutral-600 line-clamp-2 mb-3">{agent.description}</p>
                    )}
                  </Link>
                  {agent.isActive && (
                    <button
                      onClick={(e) => handleStartCall(agent, e)}
                      className="w-full mt-3 px-4 py-2 bg-gradient-to-r from-primary-500 to-primary-600 text-white text-sm font-medium rounded-lg hover:from-primary-600 hover:to-primary-700 transition-all duration-200 flex items-center justify-center gap-2 shadow-sm hover:shadow-md"
                    >
                      <FiPhoneCall size={16} />
                      Start Outgoing Call
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Recent Calls */}
      <div className="card">
        <div className="p-6 border-b border-neutral-100">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-neutral-900">Recent Calls</h2>
            <Link to="/calls" className="text-sm text-primary-600 hover:text-primary-700 font-semibold transition-colors">
              View All →
            </Link>
          </div>
        </div>
        <div className="overflow-x-auto">
          {recentCalls.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-neutral-100 to-neutral-200 flex items-center justify-center">
                <FiPhone className="text-neutral-400" size={32} />
              </div>
              <p className="text-neutral-600 text-lg">No calls yet</p>
            </div>
          ) : (
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
                    Status
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-neutral-600 uppercase tracking-wider">
                    Duration
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-neutral-600 uppercase tracking-wider">
                    Date
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 bg-white">
                {recentCalls.map((call) => (
                  <tr key={call._id} className="hover:bg-neutral-50/50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-semibold text-neutral-900">
                        {call.agentId?.name || 'N/A'}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-neutral-700 font-medium">{call.phoneNumber}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`px-3 py-1 text-xs font-medium rounded-full ${
                          call.status === 'completed'
                            ? 'bg-success-100 text-success-700'
                            : call.status === 'failed'
                            ? 'bg-red-100 text-red-700'
                            : 'bg-yellow-100 text-yellow-700'
                        }`}
                      >
                        {call.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-neutral-700">
                      {call.duration ? formatDuration(call.duration) : 'N/A'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-500">
                      {formatDate(call.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Outgoing Call Modal */}
      {callModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 relative">
            <button
              onClick={handleCloseModal}
              className="absolute top-4 right-4 text-neutral-400 hover:text-neutral-600 transition-colors"
            >
              <FiX size={24} />
            </button>

            <div className="mb-6">
              <div className="w-12 h-12 bg-gradient-to-br from-primary-500 to-primary-600 rounded-xl flex items-center justify-center mb-4">
                <FiPhoneCall className="text-white" size={24} />
              </div>
              <h2 className="text-2xl font-bold text-neutral-900 mb-2">Start Outgoing Call</h2>
              <p className="text-neutral-600">
                Initiate a call from <span className="font-semibold">{selectedAgent?.name}</span>
              </p>
            </div>

            <div className="mb-6">
              <label className="block text-sm font-medium text-neutral-700 mb-2">
                Calling From
              </label>
              <div className="px-4 py-3 bg-neutral-50 rounded-lg border border-neutral-200">
                <p className="text-sm font-medium text-neutral-900">{agentPhone?.number || 'N/A'}</p>
              </div>
            </div>

            <div className="mb-6">
              <label htmlFor="phone-number" className="block text-sm font-medium text-neutral-700 mb-2">
                Recipient Phone Number
              </label>
              <input
                id="phone-number"
                type="tel"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                placeholder="e.g., +1234567890"
                className="w-full px-4 py-3 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all"
                autoFocus
              />
              <p className="mt-2 text-xs text-neutral-500">
                Enter the phone number with country code (e.g., +1 for US)
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleCloseModal}
                className="flex-1 px-4 py-3 border border-neutral-300 text-neutral-700 font-medium rounded-lg hover:bg-neutral-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleInitiateCall}
                disabled={!phoneNumber.trim() || initiatingCall}
                className="flex-1 px-4 py-3 bg-gradient-to-r from-primary-500 to-primary-600 text-white font-medium rounded-lg hover:from-primary-600 hover:to-primary-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {initiatingCall ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                    Initiating...
                  </>
                ) : (
                  <>
                    <FiPhoneCall size={16} />
                    Start Call
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
