/**
 * MVP Owner Dashboard for Packet 7.
 *
 * Provides a compact, operational control surface for the agentic networking loop:
 * - Mock claim agents without real X/Twitter auth
 * - Create and manage recommendation cards
 * - View inbox of received recommendations
 * - Request and respond to meetings
 * - Participate in conversations
 * - Manage intro candidates
 *
 * All data flows through the LocalApiAdapter (mocked for Packet 7).
 * When Packet 6 HTTP routes are ready, swap the adapter to call /api/v1/* endpoints.
 */

import React, { useState, useEffect } from 'react';
import {
  IApiAdapter,
  Agent,
  Card,
  InboxResponse,
  Meeting,
  Conversation,
  IntroCandidateCard,
  ApiError,
} from './api';

function isError(response: unknown): response is ApiError {
  return typeof response === 'object' && response !== null && 'error' in response;
}

interface OwnerDashboardProps {
  apiAdapter: IApiAdapter;
}

export function OwnerDashboard({ apiAdapter }: OwnerDashboardProps) {
  const [currentAgent, setCurrentAgent] = useState<Agent | null>(null);
  const [agentName, setAgentName] = useState('');
  const [claimToken, setClaimToken] = useState('');
  const [verificationCode, setVerificationCode] = useState('');

  const [cards, setCards] = useState<Card[]>([]);
  const [inbox, setInbox] = useState<InboxResponse | null>(null);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [intros, setIntros] = useState<IntroCandidateCard[]>([]);

  const [targetAgentId, setTargetAgentId] = useState('');
  const [cardReason, setCardReason] = useState('');
  const [messageText, setMessageText] = useState('');
  const [selectedConversationId, setSelectedConversationId] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const clearMessages = () => {
    setError('');
    setSuccess('');
  };

  const showError = (msg: string) => {
    clearMessages();
    setError(msg);
  };

  const showSuccess = (msg: string) => {
    clearMessages();
    setSuccess(msg);
  };

  // ========================================================================
  // AGENT REGISTRATION & CLAIM
  // ========================================================================

  const handleRegisterAgent = async () => {
    if (!agentName.trim()) {
      showError('Agent name required');
      return;
    }
    setLoading(true);
    try {
      const response = await apiAdapter.registerAgent({ name: agentName });
      if (isError(response)) {
        showError(response.error);
      } else {
        const agent = response.data;
        setCurrentAgent(agent);
        setAgentName('');
        showSuccess(`Agent "${agent.name}" registered. API key: ${agent.apiKey}`);
      }
    } catch (e) {
      showError(`Registration failed: ${String(e)}`);
    } finally {
      setLoading(false);
    }
  };

  const handleMockClaim = async () => {
    if (!currentAgent?.apiKey) {
      showError('No agent selected');
      return;
    }
    if (!claimToken.trim() || !verificationCode.trim()) {
      showError('Claim token and verification code required');
      return;
    }
    setLoading(true);
    try {
      const response = await apiAdapter.mockClaim({
        apiKey: currentAgent.apiKey,
        claimToken,
        verificationCode,
      });
      if (isError(response)) {
        showError(response.error);
      } else {
        setCurrentAgent(response.data);
        setClaimToken('');
        setVerificationCode('');
        showSuccess('Mock claim successful');
        await refreshDashboard();
      }
    } catch (e) {
      showError(`Mock claim failed: ${String(e)}`);
    } finally {
      setLoading(false);
    }
  };

  // ========================================================================
  // CARDS
  // ========================================================================

  const refreshCards = async () => {
    if (!currentAgent?.apiKey) return;
    try {
      const response = await apiAdapter.getCards(currentAgent.apiKey);
      if (!isError(response)) {
        setCards(response.data);
      }
    } catch (e) {
      console.error('Failed to fetch cards:', e);
    }
  };

  const handleCreateCard = async () => {
    if (!currentAgent?.apiKey || !targetAgentId) {
      showError('Agent and target agent required');
      return;
    }
    setLoading(true);
    try {
      const response = await apiAdapter.createCard({
        apiKey: currentAgent.apiKey,
        targetAgentId,
        reason: cardReason || undefined,
      });
      if (isError(response)) {
        showError(response.error);
      } else {
        setTargetAgentId('');
        setCardReason('');
        showSuccess('Card created');
        await refreshCards();
        await refreshInbox();
      }
    } catch (e) {
      showError(`Failed to create card: ${String(e)}`);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateCard = async (cardId: string, status: 'active' | 'matched' | 'closed') => {
    if (!currentAgent?.apiKey) {
      showError('No agent selected');
      return;
    }
    setLoading(true);
    try {
      const response = await apiAdapter.updateCard({
        apiKey: currentAgent.apiKey,
        cardId,
        status,
      });
      if (isError(response)) {
        showError(response.error);
      } else {
        showSuccess('Card updated');
        await refreshCards();
      }
    } catch (e) {
      showError(`Failed to update card: ${String(e)}`);
    } finally {
      setLoading(false);
    }
  };

  // ========================================================================
  // INBOX
  // ========================================================================

  const refreshInbox = async () => {
    if (!currentAgent?.apiKey) return;
    try {
      const response = await apiAdapter.getInbox(currentAgent.apiKey);
      if (!isError(response)) {
        setInbox(response.data);
      }
    } catch (e) {
      console.error('Failed to fetch inbox:', e);
    }
  };

  // ========================================================================
  // MEETINGS
  // ========================================================================

  const refreshMeetings = async () => {
    if (!currentAgent?.apiKey) return;
    try {
      const response = await apiAdapter.getMeetings(currentAgent.apiKey);
      if (!isError(response)) {
        setMeetings(response.data);
      }
    } catch (e) {
      console.error('Failed to fetch meetings:', e);
    }
  };

  const handleRequestMeeting = async () => {
    if (!currentAgent?.apiKey || !targetAgentId) {
      showError('Agent and target agent required');
      return;
    }
    setLoading(true);
    try {
      const response = await apiAdapter.requestMeeting({
        apiKey: currentAgent.apiKey,
        targetAgentId,
      });
      if (isError(response)) {
        showError(response.error);
      } else {
        setTargetAgentId('');
        showSuccess('Meeting request sent');
        await refreshMeetings();
      }
    } catch (e) {
      showError(`Failed to request meeting: ${String(e)}`);
    } finally {
      setLoading(false);
    }
  };

  const handleRespondMeeting = async (meetingId: string, accept: boolean) => {
    if (!currentAgent?.apiKey) {
      showError('No agent selected');
      return;
    }
    setLoading(true);
    try {
      const response = await apiAdapter.respondToMeeting({
        apiKey: currentAgent.apiKey,
        meetingId,
        accept,
      });
      if (isError(response)) {
        showError(response.error);
      } else {
        showSuccess(accept ? 'Meeting accepted' : 'Meeting rejected');
        await refreshMeetings();
        if (accept) {
          await refreshConversations();
        }
      }
    } catch (e) {
      showError(`Failed to respond to meeting: ${String(e)}`);
    } finally {
      setLoading(false);
    }
  };

  // ========================================================================
  // CONVERSATIONS
  // ========================================================================

  const refreshConversations = async () => {
    if (!currentAgent?.apiKey) return;
    try {
      const response = await apiAdapter.getConversations(currentAgent.apiKey);
      if (!isError(response)) {
        setConversations(response.data);
      }
    } catch (e) {
      console.error('Failed to fetch conversations:', e);
    }
  };

  const handleSendMessage = async () => {
    if (!currentAgent?.apiKey || !selectedConversationId || !messageText.trim()) {
      showError('Conversation and message text required');
      return;
    }
    setLoading(true);
    try {
      const response = await apiAdapter.sendMessage({
        apiKey: currentAgent.apiKey,
        conversationId: selectedConversationId,
        text: messageText,
      });
      if (isError(response)) {
        showError(response.error);
      } else {
        setMessageText('');
        showSuccess('Message sent');
        await refreshConversations();
      }
    } catch (e) {
      showError(`Failed to send message: ${String(e)}`);
    } finally {
      setLoading(false);
    }
  };

  const handleCloseConversation = async (conversationId: string) => {
    if (!currentAgent?.apiKey) {
      showError('No agent selected');
      return;
    }
    setLoading(true);
    try {
      const response = await apiAdapter.closeConversation({
        apiKey: currentAgent.apiKey,
        conversationId,
      });
      if (isError(response)) {
        showError(response.error);
      } else {
        showSuccess('Conversation closed');
        if (selectedConversationId === conversationId) {
          setSelectedConversationId('');
        }
        await refreshConversations();
      }
    } catch (e) {
      showError(`Failed to close conversation: ${String(e)}`);
    } finally {
      setLoading(false);
    }
  };

  // ========================================================================
  // INTROS
  // ========================================================================

  const refreshIntros = async () => {
    if (!currentAgent?.apiKey) return;
    try {
      const response = await apiAdapter.getIntros(currentAgent.apiKey);
      if (!isError(response)) {
        setIntros(response.data);
      }
    } catch (e) {
      console.error('Failed to fetch intros:', e);
    }
  };

  const handleCreateIntro = async () => {
    if (!currentAgent?.apiKey || !targetAgentId) {
      showError('Agent and target agent required');
      return;
    }
    setLoading(true);
    try {
      const response = await apiAdapter.createIntro({
        apiKey: currentAgent.apiKey,
        targetAgentId,
      });
      if (isError(response)) {
        showError(response.error);
      } else {
        setTargetAgentId('');
        showSuccess('Intro candidate created');
        await refreshIntros();
      }
    } catch (e) {
      showError(`Failed to create intro: ${String(e)}`);
    } finally {
      setLoading(false);
    }
  };

  // ========================================================================
  // REFRESH & INITIALIZATION
  // ========================================================================

  const refreshDashboard = async () => {
    await Promise.all([refreshCards(), refreshInbox(), refreshMeetings(), refreshConversations(), refreshIntros()]);
  };

  useEffect(() => {
    if (currentAgent?.apiKey) {
      refreshDashboard();
    }
  }, [currentAgent?.apiKey]);

  // ========================================================================
  // RENDER
  // ========================================================================

  return (
    <div className="w-full h-full bg-gray-900 text-white p-4 overflow-y-auto">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">Owner Dashboard</h1>

        {error && (
          <div className="bg-red-900 border border-red-600 text-red-100 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}
        {success && (
          <div className="bg-green-900 border border-green-600 text-green-100 px-4 py-3 rounded mb-4">
            {success}
          </div>
        )}

        {!currentAgent ? (
          // REGISTRATION SECTION
          <div className="bg-gray-800 border border-gray-700 p-4 rounded mb-6">
            <h2 className="text-xl font-bold mb-4">Register Agent</h2>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Agent name"
                value={agentName}
                onChange={e => setAgentName(e.target.value)}
                className="flex-1 bg-gray-700 border border-gray-600 px-3 py-2 rounded text-white"
              />
              <button
                onClick={handleRegisterAgent}
                disabled={loading}
                className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 px-6 py-2 rounded font-bold"
              >
                Register
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* AGENT STATUS */}
            <div className="bg-gray-800 border border-gray-700 p-4 rounded mb-6">
              <div className="flex justify-between items-start">
                <div>
                  <h2 className="text-xl font-bold">{currentAgent.name}</h2>
                  <p className="text-sm text-gray-400">Status: {currentAgent.status}</p>
                  <p className="text-xs text-gray-500 mt-2 break-all">API Key: {currentAgent.apiKey}</p>
                </div>
                <button
                  onClick={() => setCurrentAgent(null)}
                  className="bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded text-sm"
                >
                  Switch Agent
                </button>
              </div>
            </div>

            {/* MOCK CLAIM SECTION */}
            {currentAgent.status === 'pending' && (
              <div className="bg-gray-800 border border-gray-700 p-4 rounded mb-6">
                <h2 className="text-xl font-bold mb-4">Mock Claim (Demo)</h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mb-4">
                  <input
                    type="text"
                    placeholder="Claim token"
                    value={claimToken}
                    onChange={e => setClaimToken(e.target.value)}
                    className="bg-gray-700 border border-gray-600 px-3 py-2 rounded text-white text-sm"
                  />
                  <input
                    type="text"
                    placeholder="Verification code"
                    value={verificationCode}
                    onChange={e => setVerificationCode(e.target.value)}
                    className="bg-gray-700 border border-gray-600 px-3 py-2 rounded text-white text-sm"
                  />
                  <button
                    onClick={handleMockClaim}
                    disabled={loading}
                    className="bg-yellow-600 hover:bg-yellow-700 disabled:bg-gray-600 px-4 py-2 rounded font-bold text-sm"
                  >
                    Claim
                  </button>
                </div>
              </div>
            )}

            {currentAgent.status === 'claimed' && (
              <>
                {/* CARDS SECTION */}
                <div className="bg-gray-800 border border-gray-700 p-4 rounded mb-6">
                  <h2 className="text-xl font-bold mb-4">Cards (Recommendations)</h2>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-4">
                    <input
                      type="text"
                      placeholder="Target agent ID"
                      value={targetAgentId}
                      onChange={e => setTargetAgentId(e.target.value)}
                      className="bg-gray-700 border border-gray-600 px-3 py-2 rounded text-white text-sm"
                    />
                    <input
                      type="text"
                      placeholder="Reason (optional)"
                      value={cardReason}
                      onChange={e => setCardReason(e.target.value)}
                      className="bg-gray-700 border border-gray-600 px-3 py-2 rounded text-white text-sm"
                    />
                  </div>
                  <button
                    onClick={handleCreateCard}
                    disabled={loading}
                    className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 px-4 py-2 rounded font-bold text-sm mb-4"
                  >
                    Create Card
                  </button>

                  <div className="overflow-x-auto">
                    <table className="w-full text-sm border border-gray-700">
                      <thead className="bg-gray-700">
                        <tr>
                          <th className="border border-gray-600 px-2 py-1 text-left">To</th>
                          <th className="border border-gray-600 px-2 py-1 text-left">Reason</th>
                          <th className="border border-gray-600 px-2 py-1">Status</th>
                          <th className="border border-gray-600 px-2 py-1">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {cards.map(card => (
                          <tr key={card.id} className="hover:bg-gray-700">
                            <td className="border border-gray-600 px-2 py-1">{card.targetAgentName}</td>
                            <td className="border border-gray-600 px-2 py-1 text-xs">{card.reason}</td>
                            <td className="border border-gray-600 px-2 py-1 text-center text-xs">{card.status}</td>
                            <td className="border border-gray-600 px-2 py-1 text-center">
                              <select
                                value={card.status}
                                onChange={e =>
                                  handleUpdateCard(card.id, e.target.value as 'active' | 'matched' | 'closed')
                                }
                                className="bg-gray-600 border border-gray-500 px-2 py-1 rounded text-xs"
                              >
                                <option value="active">Active</option>
                                <option value="matched">Matched</option>
                                <option value="closed">Closed</option>
                              </select>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {cards.length === 0 && <p className="text-gray-400 mt-4 text-sm">No cards created yet</p>}
                </div>

                {/* INBOX SECTION */}
                <div className="bg-gray-800 border border-gray-700 p-4 rounded mb-6">
                  <h2 className="text-xl font-bold mb-4">Inbox ({inbox?.total || 0})</h2>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm border border-gray-700">
                      <thead className="bg-gray-700">
                        <tr>
                          <th className="border border-gray-600 px-2 py-1 text-left">From</th>
                          <th className="border border-gray-600 px-2 py-1 text-left">Recommendation</th>
                          <th className="border border-gray-600 px-2 py-1">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {inbox?.items.map(item => (
                          <tr key={item.id} className="hover:bg-gray-700">
                            <td className="border border-gray-600 px-2 py-1">{item.fromAgentName}</td>
                            <td className="border border-gray-600 px-2 py-1 text-xs">{item.recommendation}</td>
                            <td className="border border-gray-600 px-2 py-1 text-center text-xs">{item.status}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {(!inbox || inbox.items.length === 0) && (
                    <p className="text-gray-400 mt-4 text-sm">No recommendations in inbox</p>
                  )}
                </div>

                {/* MEETINGS SECTION */}
                <div className="bg-gray-800 border border-gray-700 p-4 rounded mb-6">
                  <h2 className="text-xl font-bold mb-4">Meetings</h2>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-4">
                    <input
                      type="text"
                      placeholder="Target agent ID for meeting"
                      value={targetAgentId}
                      onChange={e => setTargetAgentId(e.target.value)}
                      className="bg-gray-700 border border-gray-600 px-3 py-2 rounded text-white text-sm"
                    />
                    <button
                      onClick={handleRequestMeeting}
                      disabled={loading}
                      className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 px-4 py-2 rounded font-bold text-sm"
                    >
                      Request Meeting
                    </button>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-sm border border-gray-700">
                      <thead className="bg-gray-700">
                        <tr>
                          <th className="border border-gray-600 px-2 py-1 text-left">With</th>
                          <th className="border border-gray-600 px-2 py-1">Status</th>
                          <th className="border border-gray-600 px-2 py-1">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {meetings.map(meeting => (
                          <tr key={meeting.id} className="hover:bg-gray-700">
                            <td className="border border-gray-600 px-2 py-1">
                              {meeting.initiatorAgentId === currentAgent.id
                                ? meeting.targetAgentName
                                : meeting.initiatorAgentName}
                            </td>
                            <td className="border border-gray-600 px-2 py-1 text-center text-xs">{meeting.status}</td>
                            <td className="border border-gray-600 px-2 py-1 text-center">
                              {meeting.status === 'pending' && meeting.targetAgentId === currentAgent.id && (
                                <>
                                  <button
                                    onClick={() => handleRespondMeeting(meeting.id, true)}
                                    disabled={loading}
                                    className="bg-green-600 hover:bg-green-700 disabled:bg-gray-600 px-2 py-1 rounded text-xs mr-1"
                                  >
                                    Accept
                                  </button>
                                  <button
                                    onClick={() => handleRespondMeeting(meeting.id, false)}
                                    disabled={loading}
                                    className="bg-red-600 hover:bg-red-700 disabled:bg-gray-600 px-2 py-1 rounded text-xs"
                                  >
                                    Decline
                                  </button>
                                </>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {meetings.length === 0 && <p className="text-gray-400 mt-4 text-sm">No meetings</p>}
                </div>

                {/* CONVERSATIONS SECTION */}
                <div className="bg-gray-800 border border-gray-700 p-4 rounded mb-6">
                  <h2 className="text-xl font-bold mb-4">Conversations</h2>

                  <div className="mb-4">
                    <select
                      value={selectedConversationId}
                      onChange={e => setSelectedConversationId(e.target.value)}
                      className="bg-gray-700 border border-gray-600 px-3 py-2 rounded text-white w-full"
                    >
                      <option value="">Select a conversation</option>
                      {conversations.map(conv => (
                        <option key={conv.id} value={conv.id}>
                          {conv.agentNames.join(', ')} ({conv.messages.length} messages)
                        </option>
                      ))}
                    </select>
                  </div>

                  {selectedConversationId && (
                    <>
                      <div className="bg-gray-700 border border-gray-600 rounded p-3 h-64 overflow-y-auto mb-4">
                        <div className="space-y-2">
                          {conversations
                            .find(c => c.id === selectedConversationId)
                            ?.messages.map(msg => (
                              <div key={msg.id} className="text-sm">
                                <strong>{msg.senderAgentName}:</strong> {msg.text}
                              </div>
                            ))}
                        </div>
                      </div>

                      <div className="flex gap-2 mb-4">
                        <textarea
                          value={messageText}
                          onChange={e => setMessageText(e.target.value)}
                          placeholder="Type message..."
                          className="flex-1 bg-gray-700 border border-gray-600 px-3 py-2 rounded text-white text-sm"
                          rows={2}
                        />
                        <button
                          onClick={handleSendMessage}
                          disabled={loading}
                          className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 px-4 py-2 rounded font-bold text-sm h-fit"
                        >
                          Send
                        </button>
                      </div>

                      <button
                        onClick={() => handleCloseConversation(selectedConversationId)}
                        disabled={loading}
                        className="bg-red-600 hover:bg-red-700 disabled:bg-gray-600 px-4 py-2 rounded text-sm"
                      >
                        Close Conversation
                      </button>
                    </>
                  )}

                  {conversations.length === 0 && <p className="text-gray-400 text-sm">No conversations yet</p>}
                </div>

                {/* INTROS SECTION */}
                <div className="bg-gray-800 border border-gray-700 p-4 rounded mb-6">
                  <h2 className="text-xl font-bold mb-4">Intro Candidates</h2>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-4">
                    <input
                      type="text"
                      placeholder="Target agent ID for intro"
                      value={targetAgentId}
                      onChange={e => setTargetAgentId(e.target.value)}
                      className="bg-gray-700 border border-gray-600 px-3 py-2 rounded text-white text-sm"
                    />
                    <button
                      onClick={handleCreateIntro}
                      disabled={loading}
                      className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 px-4 py-2 rounded font-bold text-sm"
                    >
                      Create Intro
                    </button>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-sm border border-gray-700">
                      <thead className="bg-gray-700">
                        <tr>
                          <th className="border border-gray-600 px-2 py-1 text-left">Recommended</th>
                          <th className="border border-gray-600 px-2 py-1 text-left">Reason</th>
                          <th className="border border-gray-600 px-2 py-1">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {intros.map(intro => (
                          <tr key={intro.id} className="hover:bg-gray-700">
                            <td className="border border-gray-600 px-2 py-1">{intro.recommendedAgentName}</td>
                            <td className="border border-gray-600 px-2 py-1 text-xs">{intro.reason}</td>
                            <td className="border border-gray-600 px-2 py-1 text-center text-xs">{intro.status}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {intros.length === 0 && <p className="text-gray-400 mt-4 text-sm">No intro candidates</p>}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
