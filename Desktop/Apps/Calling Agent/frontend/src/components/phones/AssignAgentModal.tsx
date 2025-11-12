import { useState } from 'react';
import { FiX, FiUser, FiCheck } from 'react-icons/fi';
import { phoneService } from '../../services/phoneService';
import type { Phone, Agent } from '../../types';

interface AssignAgentModalProps {
  phone: Phone;
  agents: Agent[];
  onClose: () => void;
  onSuccess: () => void;
}

export default function AssignAgentModal({
  phone,
  agents,
  onClose,
  onSuccess,
}: AssignAgentModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedAgentId, setSelectedAgentId] = useState<string>(
    typeof phone.agentId === 'string' ? phone.agentId : phone.agentId?._id || ''
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedAgentId) {
      setError('Please select an agent');
      return;
    }

    setError(null);
    setLoading(true);

    try {
      await phoneService.assignAgent(phone._id, selectedAgentId);
      onSuccess();
    } catch (err: any) {
      console.error('Error assigning agent:', err);
      setError(err.response?.data?.message || 'Failed to assign agent');
    } finally {
      setLoading(false);
    }
  };

  const activeAgents = agents.filter((agent) => agent.isActive);

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between rounded-t-2xl">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-500 to-primary-600 flex items-center justify-center">
              <FiUser className="text-white" size={20} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">Assign Agent</h2>
              <p className="text-sm text-gray-600">
                Assign an agent to {phone.number}
              </p>
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

          {activeAgents.length === 0 ? (
            <div className="text-center py-8">
              <div className="w-16 h-16 mx-auto rounded-full bg-gray-100 flex items-center justify-center mb-4">
                <FiUser className="text-gray-400" size={32} />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                No Active Agents
              </h3>
              <p className="text-gray-600 mb-4">
                You need to create and activate at least one agent before you can assign it to a phone number.
              </p>
              <button
                type="button"
                onClick={onClose}
                className="btn-primary"
              >
                Close
              </button>
            </div>
          ) : (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  Select Agent *
                </label>
                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {activeAgents.map((agent) => (
                    <div
                      key={agent._id}
                      onClick={() => setSelectedAgentId(agent._id)}
                      className={`
                        relative p-4 rounded-xl border-2 cursor-pointer transition-all
                        ${
                          selectedAgentId === agent._id
                            ? 'border-primary-500 bg-primary-50'
                            : 'border-gray-200 hover:border-gray-300 bg-white'
                        }
                      `}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center space-x-2 mb-1">
                            <h4 className="font-semibold text-gray-900">{agent.name}</h4>
                            {agent.isActive && (
                              <span className="px-2 py-0.5 text-xs rounded-full bg-green-100 text-green-700">
                                Active
                              </span>
                            )}
                          </div>
                          {agent.description && (
                            <p className="text-sm text-gray-600 line-clamp-2">
                              {agent.description}
                            </p>
                          )}
                          <div className="flex items-center space-x-4 mt-2 text-xs text-gray-500">
                            <span>Model: {agent.config.llm.model}</span>
                            <span>Voice: {agent.config.voice.provider}</span>
                            <span>Language: {agent.config.language}</span>
                          </div>
                        </div>
                        {selectedAgentId === agent._id && (
                          <div className="ml-4">
                            <div className="w-6 h-6 rounded-full bg-primary-500 flex items-center justify-center">
                              <FiCheck className="text-white" size={14} />
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  {activeAgents.length} active agent{activeAgents.length !== 1 ? 's' : ''} available
                </p>
              </div>

              {/* Warning if agent is already assigned */}
              {phone.agentId && (
                <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-lg text-sm">
                  <strong>Note:</strong> This phone number is already assigned to an agent.
                  Assigning a new agent will replace the current assignment.
                </div>
              )}

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
                  disabled={loading || !selectedAgentId}
                >
                  {loading ? (
                    <span className="flex items-center space-x-2">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      <span>Assigning...</span>
                    </span>
                  ) : (
                    'Assign Agent'
                  )}
                </button>
              </div>
            </>
          )}
        </form>
      </div>
    </div>
  );
}
