import { useEffect, useState } from 'react';
import { FiPhone, FiPlus, FiUser, FiTrash2, FiX } from 'react-icons/fi';
import { phoneService } from '../../services/phoneService';
import { agentService } from '../../services/agentService';
import type { Phone, Agent } from '../../types';
import ImportPhoneModal from './ImportPhoneModal';
import AssignAgentModal from './AssignAgentModal';

export default function PhoneList() {
  const [phones, setPhones] = useState<Phone[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [showImportModal, setShowImportModal] = useState(false);
  const [selectedPhone, setSelectedPhone] = useState<Phone | null>(null);
  const [showAssignModal, setShowAssignModal] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [phonesData, agentsData] = await Promise.all([
        phoneService.getPhones(),
        agentService.getAgents(),
      ]);
      setPhones(phonesData);
      setAgents(agentsData);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleImportSuccess = async () => {
    setShowImportModal(false);
    await loadData();
  };

  const handleAssignAgent = (phone: Phone) => {
    setSelectedPhone(phone);
    setShowAssignModal(true);
  };

  const handleAssignSuccess = async () => {
    setShowAssignModal(false);
    setSelectedPhone(null);
    await loadData();
  };

  const handleUnassign = async (phoneId: string) => {
    if (!confirm('Are you sure you want to unassign the agent from this phone number?')) {
      return;
    }

    try {
      await phoneService.unassignAgent(phoneId);
      await loadData();
    } catch (error) {
      console.error('Error unassigning agent:', error);
      alert('Failed to unassign agent. Please try again.');
    }
  };

  const handleDelete = async (phoneId: string) => {
    if (!confirm('Are you sure you want to delete this phone number?')) {
      return;
    }

    try {
      await phoneService.deletePhone(phoneId);
      await loadData();
    } catch (error) {
      console.error('Error deleting phone:', error);
      alert('Failed to delete phone number. Please try again.');
    }
  };

  const getAgentName = (phone: Phone): string => {
    if (!phone.agentId) return 'Not assigned';
    if (typeof phone.agentId === 'string') {
      const agent = agents.find((a) => a._id === phone.agentId);
      return agent?.name || 'Unknown';
    }
    return phone.agentId.name;
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Phone Numbers</h1>
          <p className="text-gray-600 mt-1">
            Manage your Exotel phone numbers and agent assignments
          </p>
        </div>
        <button
          onClick={() => setShowImportModal(true)}
          className="btn-primary flex items-center space-x-2"
        >
          <FiPlus size={20} />
          <span>Import Phone Number</span>
        </button>
      </div>

      {/* Phone Numbers List */}
      {phones.length === 0 ? (
        <div className="card p-12 text-center">
          <div className="flex justify-center mb-4">
            <div className="w-16 h-16 rounded-full bg-primary-100 flex items-center justify-center">
              <FiPhone className="text-primary-600" size={32} />
            </div>
          </div>
          <h3 className="text-xl font-semibold text-gray-900 mb-2">
            No Phone Numbers Yet
          </h3>
          <p className="text-gray-600 mb-6 max-w-md mx-auto">
            Import your first Exotel phone number to start receiving calls and assigning them to agents.
          </p>
          <button
            onClick={() => setShowImportModal(true)}
            className="btn-primary inline-flex items-center space-x-2"
          >
            <FiPlus size={20} />
            <span>Import Phone Number</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {phones.map((phone) => (
            <div
              key={phone._id}
              className="card p-6 hover:shadow-lg transition-shadow"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center space-x-3">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary-500 to-primary-600 flex items-center justify-center shadow-lg shadow-primary-500/30">
                    <FiPhone className="text-white" size={20} />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">
                      {phone.number}
                    </h3>
                    <span className="text-xs text-gray-500 uppercase">
                      {phone.country}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => handleDelete(phone._id)}
                  className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  title="Delete phone number"
                >
                  <FiTrash2 size={18} />
                </button>
              </div>

              {/* Agent Assignment */}
              <div className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">Assigned Agent:</span>
                  {phone.agentId ? (
                    <span className="font-medium text-gray-900">
                      {getAgentName(phone)}
                    </span>
                  ) : (
                    <span className="text-gray-400">Not assigned</span>
                  )}
                </div>

                {phone.agentId ? (
                  <div className="flex space-x-2">
                    <button
                      onClick={() => handleAssignAgent(phone)}
                      className="flex-1 btn-secondary text-sm py-2"
                    >
                      <FiUser size={16} className="inline mr-2" />
                      Change Agent
                    </button>
                    <button
                      onClick={() => handleUnassign(phone._id)}
                      className="px-3 py-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors border border-red-200"
                      title="Unassign agent"
                    >
                      <FiX size={18} />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => handleAssignAgent(phone)}
                    className="w-full btn-primary text-sm py-2"
                  >
                    <FiUser size={16} className="inline mr-2" />
                    Assign Agent
                  </button>
                )}
              </div>

              {/* Tags */}
              {phone.tags && phone.tags.length > 0 && (
                <div className="mt-4 pt-4 border-t border-gray-100">
                  <div className="flex flex-wrap gap-2">
                    {phone.tags.map((tag, index) => (
                      <span
                        key={index}
                        className="px-2 py-1 text-xs rounded-full bg-primary-100 text-primary-700"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Status */}
              <div className="mt-4 pt-4 border-t border-gray-100">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">Status:</span>
                  <span
                    className={`px-2 py-1 text-xs font-medium rounded-full ${
                      phone.status === 'active'
                        ? 'bg-green-100 text-green-700'
                        : 'bg-gray-100 text-gray-700'
                    }`}
                  >
                    {phone.status}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modals */}
      {showImportModal && (
        <ImportPhoneModal
          onClose={() => setShowImportModal(false)}
          onSuccess={handleImportSuccess}
        />
      )}

      {showAssignModal && selectedPhone && (
        <AssignAgentModal
          phone={selectedPhone}
          agents={agents}
          onClose={() => {
            setShowAssignModal(false);
            setSelectedPhone(null);
          }}
          onSuccess={handleAssignSuccess}
        />
      )}
    </div>
  );
}
