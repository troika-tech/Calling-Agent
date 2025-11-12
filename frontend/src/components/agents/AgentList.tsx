import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FiPlus, FiEdit, FiTrash2, FiPhone } from 'react-icons/fi';
import { agentService } from '../../services/agentService';
import type { Agent } from '../../types';

export default function AgentList() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  useEffect(() => {
    loadAgents();
  }, []);

  const loadAgents = async () => {
    try {
      setLoading(true);
      const data = await agentService.getAgents();
      setAgents(data);
    } catch (error) {
      console.error('Error loading agents:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this agent?')) return;

    try {
      setDeleteId(id);
      await agentService.deleteAgent(id);
      setAgents(agents.filter((a) => a._id !== id));
    } catch (error) {
      console.error('Error deleting agent:', error);
      alert('Failed to delete agent');
    } finally {
      setDeleteId(null);
    }
  };

  const handleToggleActive = async (agent: Agent) => {
    try {
      const updated = await agentService.updateAgent(agent._id, {
        isActive: !agent.isActive,
      });
      setAgents(agents.map((a) => (a._id === agent._id ? updated : a)));
    } catch (error) {
      console.error('Error updating agent:', error);
      alert('Failed to update agent');
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
          <h1 className="text-3xl font-bold bg-gradient-to-r from-neutral-900 to-neutral-700 bg-clip-text text-transparent">AI Agents</h1>
          <p className="text-neutral-600 mt-2 text-base">Manage your calling agents</p>
        </div>
        <Link to="/agents/new" className="btn-primary">
          <FiPlus className="mr-2" size={18} />
          Create Agent
        </Link>
      </div>

      {/* Agents Grid */}
      {agents.length === 0 ? (
        <div className="card p-16 text-center">
          <div className="max-w-md mx-auto">
            <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-primary-100 to-primary-200 flex items-center justify-center shadow-lg shadow-primary-500/20">
              <FiPhone className="text-primary-600" size={40} />
            </div>
            <h3 className="text-2xl font-bold text-neutral-900 mb-3">No agents yet</h3>
            <p className="text-neutral-600 mb-8 text-base leading-relaxed">
              Create your first AI calling agent to get started with automated phone calls.
            </p>
            <Link to="/agents/new" className="btn-primary">
              <FiPlus className="mr-2" size={18} />
              Create Your First Agent
            </Link>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {agents.map((agent) => (
            <div key={agent._id} className="card p-6 hover:shadow-lg hover:scale-[1.02] transition-all duration-200 group">
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <h3 className="text-lg font-bold text-neutral-900 mb-2 group-hover:text-primary-600 transition-colors">{agent.name}</h3>
                  {agent.description && (
                    <p className="text-sm text-neutral-600 line-clamp-2 leading-relaxed">{agent.description}</p>
                  )}
                </div>
                <button
                  onClick={() => handleToggleActive(agent)}
                  className={`ml-3 px-3 py-1.5 text-xs rounded-full font-medium transition-all duration-200 flex items-center ${
                    agent.isActive
                      ? 'bg-success-100 text-success-700 hover:bg-success-200'
                      : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${agent.isActive ? 'bg-success-600' : 'bg-neutral-400'}`}></span>
                  {agent.isActive ? 'Active' : 'Inactive'}
                </button>
              </div>

              <div className="space-y-2.5 mb-5 p-3 bg-neutral-50/50 rounded-lg border border-neutral-100">
                <div className="flex items-center text-sm">
                  <span className="font-semibold text-neutral-700 mr-2 min-w-[70px]">Voice:</span>
                  <span className="text-neutral-600 truncate">{agent.config.voice.voiceId.slice(0, 25)}...</span>
                </div>
                <div className="flex items-center text-sm">
                  <span className="font-semibold text-neutral-700 mr-2 min-w-[70px]">Model:</span>
                  <span className="text-neutral-600">{agent.config.llm.model}</span>
                </div>
                <div className="flex items-center text-sm">
                  <span className="font-semibold text-neutral-700 mr-2 min-w-[70px]">Language:</span>
                  <span className="text-neutral-600 uppercase">{agent.config.language}</span>
                </div>
              </div>

              <div className="flex items-center space-x-2 pt-4 border-t border-neutral-200">
                <Link
                  to={`/agents/${agent._id}/edit`}
                  className="flex-1 flex items-center justify-center px-4 py-2.5 bg-primary-50 text-primary-700 rounded-xl hover:bg-primary-100 hover:shadow-md transition-all duration-200 text-sm font-semibold group/edit"
                >
                  <FiEdit className="mr-2 group-hover/edit:rotate-12 transition-transform" size={16} />
                  Edit
                </Link>
                <button
                  onClick={() => handleDelete(agent._id)}
                  disabled={deleteId === agent._id}
                  className="flex-1 flex items-center justify-center px-4 py-2.5 bg-red-50 text-red-700 rounded-xl hover:bg-red-100 hover:shadow-md transition-all duration-200 text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed group/delete"
                >
                  <FiTrash2 className="mr-2 group-hover/delete:scale-110 transition-transform" size={16} />
                  {deleteId === agent._id ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
