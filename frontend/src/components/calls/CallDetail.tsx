import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { FiArrowLeft, FiDownload, FiPhone, FiClock, FiUser, FiRefreshCw, FiCheckCircle, FiAlertCircle, FiSmile, FiMeh, FiFrown } from 'react-icons/fi';
import { callService } from '../../services/callService';
import type { CallLog } from '../../types';
import { formatDuration, formatDate, formatPhoneNumber, calculateDuration } from '../../utils/format';

export default function CallDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [call, setCall] = useState<CallLog | null>(null);
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(false);

  useEffect(() => {
    if (id) {
      loadCall(id);
    }
  }, [id]);

  const loadCall = async (callId: string) => {
    try {
      setLoading(true);
      const data = await callService.getCall(callId);
      setCall(data);
    } catch (error) {
      console.error('Error loading call:', error);
      alert('Failed to load call details');
      navigate('/calls');
    } finally {
      setLoading(false);
    }
  };

  const handleRegenerateTranscript = async () => {
    if (!id) return;

    try {
      setRegenerating(true);
      await callService.regenerateTranscript(id);
      await loadCall(id); // Reload the call data
      alert('Transcript regenerated successfully!');
    } catch (error) {
      console.error('Error regenerating transcript:', error);
      alert('Failed to regenerate transcript');
    } finally {
      setRegenerating(false);
    }
  };

  const getSentimentIcon = (sentiment?: 'positive' | 'neutral' | 'negative') => {
    switch (sentiment) {
      case 'positive':
        return <FiSmile className="text-green-600" size={20} />;
      case 'negative':
        return <FiFrown className="text-red-600" size={20} />;
      default:
        return <FiMeh className="text-gray-600" size={20} />;
    }
  };

  const getSentimentColor = (sentiment?: 'positive' | 'neutral' | 'negative') => {
    switch (sentiment) {
      case 'positive':
        return 'bg-green-100 text-green-700';
      case 'negative':
        return 'bg-red-100 text-red-700';
      default:
        return 'bg-gray-100 text-gray-700';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (!call) {
    return null;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center">
          <button
            onClick={() => navigate('/calls')}
            className="mr-4 p-2 text-gray-600 hover:text-gray-900 rounded-lg hover:bg-gray-100"
          >
            <FiArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Call Details</h1>
            <p className="text-gray-600 mt-1">
              {formatDate(call.createdAt)}
            </p>
          </div>
        </div>
        {call.recordingUrl && (
          <a
            href={call.recordingUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-secondary flex items-center"
          >
            <FiDownload className="mr-2" />
            Download Recording
          </a>
        )}
      </div>

      {/* Call Info */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="card p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 mb-1">Agent</p>
              <p className="text-lg font-semibold text-gray-900">
                {call.agentId?.name || 'N/A'}
              </p>
            </div>
            <FiUser className="text-primary-600" size={24} />
          </div>
        </div>

        <div className="card p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 mb-1">Phone Number</p>
              <p className="text-lg font-semibold text-gray-900">
                {formatPhoneNumber(call.direction === 'inbound' ? call.fromPhone : call.toPhone)}
              </p>
            </div>
            <FiPhone className="text-green-600" size={24} />
          </div>
        </div>

        <div className="card p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 mb-1">Duration</p>
              <p className="text-lg font-semibold text-gray-900">
                {(() => {
                  const duration = call.duration || call.durationSec;
                  if (duration && duration > 0) {
                    return formatDuration(duration);
                  }
                  // Fallback: calculate from startedAt and endedAt
                  const calculated = calculateDuration(call.startedAt, call.endedAt);
                  return calculated && calculated > 0 ? formatDuration(calculated) : 'N/A';
                })()}
              </p>
            </div>
            <FiClock className="text-orange-600" size={24} />
          </div>
        </div>

        <div className="card p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 mb-1">Status</p>
              <span
                className={`inline-block px-3 py-1 text-sm rounded-full font-medium ${
                  call.status === 'completed'
                    ? 'bg-green-100 text-green-700'
                    : call.status === 'failed'
                    ? 'bg-red-100 text-red-700'
                    : 'bg-yellow-100 text-yellow-700'
                }`}
              >
                {call.status}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Summary Section */}
      {call.summary && (
        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Call Summary</h2>
            {call.metadata?.sentiment && (
              <div className="flex items-center gap-2">
                {getSentimentIcon(call.metadata.sentiment)}
                <span className={`px-3 py-1 rounded-full text-sm font-medium ${getSentimentColor(call.metadata.sentiment)}`}>
                  {call.metadata.sentiment}
                </span>
              </div>
            )}
          </div>
          <p className="text-gray-700 leading-relaxed">{call.summary}</p>
        </div>
      )}

      {/* Key Points */}
      {call.metadata?.keyPoints && call.metadata.keyPoints.length > 0 && (
        <div className="card p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
            <FiCheckCircle className="mr-2 text-blue-600" />
            Key Points
          </h2>
          <ul className="space-y-2">
            {call.metadata.keyPoints.map((point, index) => (
              <li key={index} className="flex items-start">
                <span className="inline-block w-6 h-6 rounded-full bg-blue-100 text-blue-600 text-sm flex items-center justify-center mr-3 mt-0.5 flex-shrink-0">
                  {index + 1}
                </span>
                <span className="text-gray-700">{point}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Action Items */}
      {call.metadata?.actionItems && call.metadata.actionItems.length > 0 && (
        <div className="card p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
            <FiAlertCircle className="mr-2 text-orange-600" />
            Action Items
          </h2>
          <ul className="space-y-2">
            {call.metadata.actionItems.map((item, index) => (
              <li key={index} className="flex items-start">
                <input
                  type="checkbox"
                  className="mt-1 mr-3 h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  disabled
                />
                <span className="text-gray-700">{item}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Transcript */}
      <div className="card">
        <div className="p-6 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Call Transcript</h2>
          {call.transcript && call.transcript.length > 0 && (
            <button
              onClick={handleRegenerateTranscript}
              disabled={regenerating}
              className="btn-secondary flex items-center text-sm"
            >
              <FiRefreshCw className={`mr-2 ${regenerating ? 'animate-spin' : ''}`} />
              {regenerating ? 'Regenerating...' : 'Regenerate Summary'}
            </button>
          )}
        </div>
        <div className="p-6">
          {!call.transcript || call.transcript.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No transcript available for this call
            </div>
          ) : (
            <div className="space-y-4">
              {call.transcript.map((entry, index) => (
                <div
                  key={index}
                  className={`flex ${
                    entry.speaker === 'assistant' ? 'justify-start' : 'justify-end'
                  }`}
                >
                  <div
                    className={`max-w-[70%] rounded-lg px-4 py-3 ${
                      entry.speaker === 'assistant'
                        ? 'bg-gray-100 text-gray-900'
                        : 'bg-primary-600 text-white'
                    }`}
                  >
                    <div className="flex items-center mb-1">
                      <span className="text-xs font-medium opacity-75">
                        {entry.speaker === 'assistant' ? 'AI Agent' : 'Caller'}
                      </span>
                      <span className="text-xs opacity-50 ml-2">
                        {new Date(entry.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                    <p className="text-sm">{entry.text}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Metadata */}
      {call.metadata && Object.keys(call.metadata).length > 0 && (
        <div className="card p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Call Metadata</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {call.metadata.exotelCallSid && (
              <div>
                <p className="text-sm text-gray-600">Exotel Call SID</p>
                <p className="text-sm font-mono text-gray-900">{call.metadata.exotelCallSid}</p>
              </div>
            )}
            {call.metadata.streamSid && (
              <div>
                <p className="text-sm text-gray-600">Stream SID</p>
                <p className="text-sm font-mono text-gray-900">{call.metadata.streamSid}</p>
              </div>
            )}
            {call.metadata.endReason && (
              <div>
                <p className="text-sm text-gray-600">End Reason</p>
                <p className="text-sm text-gray-900">{call.metadata.endReason}</p>
              </div>
            )}
            {call.metadata.transcriptGeneratedAt && (
              <div>
                <p className="text-sm text-gray-600">Transcript Generated</p>
                <p className="text-sm text-gray-900">{formatDate(call.metadata.transcriptGeneratedAt)}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
