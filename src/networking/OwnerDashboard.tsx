import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Agent,
  Card,
  Conversation,
  CreateCardRequest,
  CreateIntroRequest,
  IApiAdapter,
  InboxEvent,
  IntroCandidate,
  Meeting,
  Message,
  getClaimTokenFromUrl,
  isError,
} from './api';
import {
  DashboardTab,
  NextAction,
  OWNER_DASHBOARD_TABS,
  buildOwnerNextActions,
  formatEventType,
  formatStatusLabel,
  getDefaultOwnerDashboardTab,
} from './ownerDashboardPresentation';

type OwnerDashboardProps = {
  apiAdapter: IApiAdapter;
  initialClaimToken?: string;
};

type DemoCredential = {
  label: string;
  apiKey: string;
};

const DEMO_CREDENTIALS: DemoCredential[] = [
  {
    label: 'Capital Scout',
    apiKey: 'town_demo_capital_scout_2026',
  },
  {
    label: 'Growth Operator',
    apiKey: 'town_demo_growth_operator_2026',
  },
];

function splitCsv(value: string) {
  return Array.from(
    new Set(
      value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  );
}

function makeClientMessageId() {
  return `client_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function formatDate(value: number | undefined) {
  if (!value) {
    return 'Not recorded';
  }
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

function describeConversation(conversation: Conversation, index: number) {
  return `Conversation ${index + 1} - ${formatStatusLabel(conversation.status)}`;
}

function statusTone(status: string) {
  if (['active', 'accepted', 'approved', 'open'].includes(status)) {
    return 'border-green-700 bg-green-950 text-green-100';
  }
  if (['pending', 'pending_claim', 'ready'].includes(status)) {
    return 'border-yellow-700 bg-yellow-950 text-yellow-100';
  }
  if (['declined', 'dismissed', 'closed', 'expired'].includes(status)) {
    return 'border-red-800 bg-red-950 text-red-100';
  }
  return 'border-gray-700 bg-gray-800 text-gray-200';
}

export function OwnerDashboard({ apiAdapter, initialClaimToken = '' }: OwnerDashboardProps) {
  const [activeTab, setActiveTab] = useState<DashboardTab>(getDefaultOwnerDashboardTab());
  const [registeredAgent, setRegisteredAgent] = useState<Agent | null>(null);

  const [agentSlug, setAgentSlug] = useState('');
  const [agentDisplayName, setAgentDisplayName] = useState('');
  const [agentDescription, setAgentDescription] = useState('');

  const [claimToken, setClaimToken] = useState(initialClaimToken);
  const [verificationCode, setVerificationCode] = useState('');
  const [xHandle, setXHandle] = useState('');
  const [ownerDisplayName, setOwnerDisplayName] = useState('');

  const [manualApiKey, setManualApiKey] = useState('');
  const [activeApiKey, setActiveApiKey] = useState('');
  const [activeOwnerLabel, setActiveOwnerLabel] = useState('');

  const [cards, setCards] = useState<Card[]>([]);
  const [inboxEvents, setInboxEvents] = useState<InboxEvent[]>([]);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [intros, setIntros] = useState<IntroCandidate[]>([]);
  const [messagesByConversation, setMessagesByConversation] = useState<Record<string, Message[]>>(
    {},
  );

  const [cardType, setCardType] = useState<'need' | 'offer' | 'exchange'>('need');
  const [cardTitle, setCardTitle] = useState('');
  const [cardSummary, setCardSummary] = useState('');
  const [cardDetailsForMatching, setCardDetailsForMatching] = useState('');
  const [cardDesiredOutcome, setCardDesiredOutcome] = useState('');
  const [cardTagsCsv, setCardTagsCsv] = useState('');
  const [cardDomainsCsv, setCardDomainsCsv] = useState('');
  const [cardStatus, setCardStatus] = useState<'draft' | 'active' | 'paused' | 'expired'>('active');

  const [meetingRecommendationId, setMeetingRecommendationId] = useState('');
  const [meetingRequestMessage, setMeetingRequestMessage] = useState('');

  const [selectedConversationId, setSelectedConversationId] = useState('');
  const [messageBody, setMessageBody] = useState('');

  const [introConversationId, setIntroConversationId] = useState('');
  const [introSummary, setIntroSummary] = useState('');
  const [introRecommendedNextStep, setIntroRecommendedNextStep] = useState('');
  const [introExplicitlyQualified, setIntroExplicitlyQualified] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const clearMessages = () => {
    setError('');
    setSuccess('');
  };

  const showError = (message: string) => {
    clearMessages();
    setError(message);
  };

  const showSuccess = (message: string) => {
    clearMessages();
    setSuccess(message);
  };

  const refreshDashboard = useCallback(
    async (apiKey: string) => {
      const [
        cardsResponse,
        inboxResponse,
        meetingsResponse,
        conversationsResponse,
        introsResponse,
      ] = await Promise.all([
        apiAdapter.getCards(apiKey),
        apiAdapter.getInbox(apiKey),
        apiAdapter.getMeetings(apiKey),
        apiAdapter.getConversations(apiKey),
        apiAdapter.getIntros(apiKey),
      ]);

      let firstError = '';

      if (isError(cardsResponse)) {
        firstError ||= cardsResponse.error.message;
      } else {
        setCards(cardsResponse.data);
      }

      if (isError(inboxResponse)) {
        firstError ||= inboxResponse.error.message;
      } else {
        setInboxEvents(inboxResponse.data);
      }

      if (isError(meetingsResponse)) {
        firstError ||= meetingsResponse.error.message;
      } else {
        setMeetings(meetingsResponse.data);
      }

      if (isError(conversationsResponse)) {
        firstError ||= conversationsResponse.error.message;
      } else {
        setConversations(conversationsResponse.data);
      }

      if (isError(introsResponse)) {
        firstError ||= introsResponse.error.message;
      } else {
        setIntros(introsResponse.data);
      }

      if (firstError) {
        showError(firstError);
        return false;
      }

      return true;
    },
    [apiAdapter],
  );

  const loadApiKey = useCallback(
    async (apiKey: string, ownerLabel: string) => {
      if (!apiKey.trim()) {
        showError('API key is required');
        return;
      }
      setLoading(true);
      try {
        const cleanKey = apiKey.trim();
        setActiveApiKey(cleanKey);
        setActiveOwnerLabel(ownerLabel);
        const ok = await refreshDashboard(cleanKey);
        if (ok) {
          showSuccess(`Loaded ${ownerLabel || 'API key'} dashboard data`);
          setActiveTab('overview');
        }
      } catch (cause) {
        showError(`Failed to load dashboard data: ${String(cause)}`);
      } finally {
        setLoading(false);
      }
    },
    [refreshDashboard],
  );

  const refreshMessagesForConversation = useCallback(
    async (apiKey: string, conversationId: string) => {
      if (!conversationId) {
        return;
      }
      const response = await apiAdapter.getConversationMessages(apiKey, conversationId);
      if (isError(response)) {
        showError(response.error.message);
        return;
      }
      setMessagesByConversation((current) => ({
        ...current,
        [conversationId]: response.data,
      }));
    },
    [apiAdapter],
  );

  useEffect(() => {
    if (!activeApiKey || !selectedConversationId) {
      return;
    }
    refreshMessagesForConversation(activeApiKey, selectedConversationId).catch((cause) => {
      showError(`Failed to fetch conversation messages: ${String(cause)}`);
    });
  }, [activeApiKey, selectedConversationId, refreshMessagesForConversation]);

  const handleRegisterAgent = async () => {
    const normalizedSlug = agentSlug.trim();
    const normalizedDisplayName = agentDisplayName.trim();

    if (!normalizedSlug || !normalizedDisplayName) {
      showError('Slug and display name are required');
      return;
    }

    setLoading(true);
    try {
      const response = await apiAdapter.registerAgent({
        slug: normalizedSlug,
        displayName: normalizedDisplayName,
        description: agentDescription.trim() || undefined,
      });
      if (isError(response)) {
        showError(response.error.message);
      } else {
        setRegisteredAgent(response.data);
        setManualApiKey(response.data.apiKey ?? '');
        setClaimToken(response.data.claimUrl ? getClaimTokenFromUrl(response.data.claimUrl) : '');
        setVerificationCode(response.data.verificationCode ?? '');
        setAgentDescription('');
        showSuccess('Agent registered. Complete mock claim to unlock active APIs.');
      }
    } catch (cause) {
      showError(`Registration failed: ${String(cause)}`);
    } finally {
      setLoading(false);
    }
  };

  const handleMockClaim = async () => {
    if (!claimToken.trim() || !verificationCode.trim() || !xHandle.trim()) {
      showError('Claim token, verification code, and X handle are required');
      return;
    }

    setLoading(true);
    try {
      const response = await apiAdapter.mockClaim({
        claimToken: claimToken.trim(),
        verificationCode: verificationCode.trim(),
        xHandle: xHandle.trim(),
        owner: ownerDisplayName.trim()
          ? {
              displayName: ownerDisplayName.trim(),
            }
          : undefined,
      });

      if (isError(response)) {
        showError(response.error.message);
        return;
      }

      const nextAgent: Agent = {
        ...response.data,
        apiKey: response.data.apiKey,
        claimUrl: registeredAgent?.claimUrl,
      };

      setRegisteredAgent(nextAgent);

      if (!nextAgent.apiKey) {
        showSuccess('Mock claim succeeded. Load an API key to view dashboard data.');
        return;
      }

      setManualApiKey(nextAgent.apiKey);
      await loadApiKey(nextAgent.apiKey, nextAgent.agentSlug || 'Registered Agent');
    } catch (cause) {
      showError(`Mock claim failed: ${String(cause)}`);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateCard = async () => {
    if (!activeApiKey) {
      showError('Load an API key first');
      return;
    }
    if (
      !cardTitle.trim() ||
      !cardSummary.trim() ||
      !cardDetailsForMatching.trim() ||
      !cardDesiredOutcome.trim()
    ) {
      showError('Card title, summary, details for matching, and desired outcome are required');
      return;
    }

    const request: CreateCardRequest = {
      apiKey: activeApiKey,
      type: cardType,
      title: cardTitle.trim(),
      summary: cardSummary.trim(),
      detailsForMatching: cardDetailsForMatching.trim(),
      desiredOutcome: cardDesiredOutcome.trim(),
      tags: splitCsv(cardTagsCsv),
      domains: splitCsv(cardDomainsCsv),
      status: cardStatus,
    };

    setLoading(true);
    try {
      const response = await apiAdapter.createCard(request);
      if (isError(response)) {
        showError(response.error.message);
      } else {
        setCardTitle('');
        setCardSummary('');
        setCardDetailsForMatching('');
        setCardDesiredOutcome('');
        setCardTagsCsv('');
        setCardDomainsCsv('');
        showSuccess('Card created');
        await refreshDashboard(activeApiKey);
      }
    } catch (cause) {
      showError(`Failed to create card: ${String(cause)}`);
    } finally {
      setLoading(false);
    }
  };

  const handleRequestMeetingForRecommendation = async (
    recommendationId: string,
    requestMessage?: string,
  ) => {
    if (!activeApiKey) {
      showError('Load an API key first');
      return;
    }
    if (!recommendationId.trim()) {
      showError('Recommendation ID is required');
      return;
    }

    setLoading(true);
    try {
      const response = await apiAdapter.requestMeeting({
        apiKey: activeApiKey,
        recommendationId: recommendationId.trim(),
        requestMessage: requestMessage?.trim() || undefined,
      });
      if (isError(response)) {
        showError(response.error.message);
      } else {
        setMeetingRecommendationId('');
        setMeetingRequestMessage('');
        showSuccess('Meeting request sent');
        await refreshDashboard(activeApiKey);
      }
    } catch (cause) {
      showError(`Failed to request meeting: ${String(cause)}`);
    } finally {
      setLoading(false);
    }
  };

  const handleRequestMeeting = async () => {
    await handleRequestMeetingForRecommendation(meetingRecommendationId, meetingRequestMessage);
  };

  const handleRespondToMeeting = async (meetingId: string, accept: boolean) => {
    if (!activeApiKey) {
      showError('Load an API key first');
      return;
    }

    setLoading(true);
    try {
      const response = await apiAdapter.respondToMeeting({
        apiKey: activeApiKey,
        meetingId,
        accept,
      });
      if (isError(response)) {
        showError(response.error.message);
      } else {
        showSuccess(accept ? 'Meeting accepted' : 'Meeting declined');
        await refreshDashboard(activeApiKey);
      }
    } catch (cause) {
      showError(`Failed to respond to meeting: ${String(cause)}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSendMessage = async () => {
    if (!activeApiKey) {
      showError('Load an API key first');
      return;
    }
    if (!selectedConversationId || !messageBody.trim()) {
      showError('Select a conversation and enter a message');
      return;
    }

    setLoading(true);
    try {
      const response = await apiAdapter.sendMessage({
        apiKey: activeApiKey,
        conversationId: selectedConversationId,
        clientMessageId: makeClientMessageId(),
        body: messageBody.trim(),
      });
      if (isError(response)) {
        showError(response.error.message);
      } else {
        setMessageBody('');
        showSuccess('Message sent');
        await Promise.all([
          refreshDashboard(activeApiKey),
          refreshMessagesForConversation(activeApiKey, selectedConversationId),
        ]);
      }
    } catch (cause) {
      showError(`Failed to send message: ${String(cause)}`);
    } finally {
      setLoading(false);
    }
  };

  const handleCloseConversation = async (conversationId: string) => {
    if (!activeApiKey) {
      showError('Load an API key first');
      return;
    }

    setLoading(true);
    try {
      const response = await apiAdapter.closeConversation({
        apiKey: activeApiKey,
        conversationId,
      });
      if (isError(response)) {
        showError(response.error.message);
      } else {
        showSuccess('Conversation closed');
        await refreshDashboard(activeApiKey);
        if (conversationId === selectedConversationId) {
          await refreshMessagesForConversation(activeApiKey, conversationId);
        }
      }
    } catch (cause) {
      showError(`Failed to close conversation: ${String(cause)}`);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateIntro = async () => {
    if (!activeApiKey) {
      showError('Load an API key first');
      return;
    }
    if (!introConversationId.trim() || !introSummary.trim() || !introRecommendedNextStep.trim()) {
      showError('Conversation, summary, and recommended next step are required');
      return;
    }

    const request: CreateIntroRequest = {
      apiKey: activeApiKey,
      conversationId: introConversationId.trim(),
      summary: introSummary.trim(),
      recommendedNextStep: introRecommendedNextStep.trim(),
      explicitlyQualified: introExplicitlyQualified,
    };

    setLoading(true);
    try {
      const response = await apiAdapter.createIntro(request);
      if (isError(response)) {
        showError(response.error.message);
      } else {
        setIntroConversationId('');
        setIntroSummary('');
        setIntroRecommendedNextStep('');
        setIntroExplicitlyQualified(false);
        showSuccess('Intro candidate created');
        await refreshDashboard(activeApiKey);
      }
    } catch (cause) {
      showError(`Failed to create intro candidate: ${String(cause)}`);
    } finally {
      setLoading(false);
    }
  };

  const handleReviewIntro = async (
    introCandidateId: string,
    action: 'approve' | 'defer' | 'dismiss',
  ) => {
    if (!activeApiKey) {
      showError('Load an API key first');
      return;
    }

    setLoading(true);
    try {
      const response = await apiAdapter.reviewIntro({
        apiKey: activeApiKey,
        introCandidateId,
        action,
      });
      if (isError(response)) {
        showError(response.error.message);
      } else {
        showSuccess(`Intro ${action}d`);
        await refreshDashboard(activeApiKey);
      }
    } catch (cause) {
      showError(`Failed to ${action} intro candidate: ${String(cause)}`);
    } finally {
      setLoading(false);
    }
  };

  const selectedConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === selectedConversationId),
    [conversations, selectedConversationId],
  );

  const selectedConversationIndex = useMemo(
    () => conversations.findIndex((conversation) => conversation.id === selectedConversationId),
    [conversations, selectedConversationId],
  );

  const selectedConversationMessages = selectedConversationId
    ? (messagesByConversation[selectedConversationId] ?? [])
    : [];

  const nextActions = useMemo(
    () => buildOwnerNextActions({ cards, inboxEvents, meetings, conversations, intros }),
    [cards, inboxEvents, meetings, conversations, intros],
  );

  const recommendationEvents = inboxEvents.filter((event) => event.type === 'match_recommendation');
  const pendingMeetings = meetings.filter((meeting) => meeting.status === 'pending');
  const openConversations = conversations.filter(
    (conversation) => conversation.status !== 'closed',
  );
  const pendingIntros = intros.filter(
    (intro) => intro.status === 'pending' || intro.status === 'ready',
  );

  return (
    <div className="h-full w-full overflow-y-auto bg-gray-950 text-gray-100">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 font-system sm:px-6 lg:px-8">
        <header className="space-y-4">
          <div className="flex flex-col gap-4 pr-24 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-sm font-medium text-clay-300">Owner console</p>
              <h1 className="text-3xl font-semibold text-balance text-white">Dashboard</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-pretty text-gray-300">
                Review what your agent has published, which matches need decisions, and where a
                conversation is ready to become a human intro.
              </p>
            </div>
            <OwnerSwitcher
              activeOwnerLabel={activeOwnerLabel}
              loading={loading}
              manualApiKey={manualApiKey}
              setManualApiKey={setManualApiKey}
              loadApiKey={loadApiKey}
            />
          </div>

          {error && (
            <div className="rounded-lg border border-red-700 bg-red-950 px-4 py-3 text-sm text-red-100">
              {error}
            </div>
          )}
          {success && (
            <div className="rounded-lg border border-green-700 bg-green-950 px-4 py-3 text-sm text-green-100">
              {success}
            </div>
          )}

          <nav
            aria-label="Dashboard sections"
            role="tablist"
            className="flex gap-2 overflow-x-auto border-b border-gray-800 pb-2"
          >
            {OWNER_DASHBOARD_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={activeTab === tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`rounded-lg px-3 py-2 text-sm font-medium ${
                  activeTab === tab.id
                    ? 'bg-clay-700 text-white'
                    : 'text-gray-300 hover:bg-gray-900 hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </header>

        {!activeApiKey && activeTab !== 'developer' ? (
          <section className="rounded-lg border border-gray-800 bg-gray-900 p-6">
            <h2 className="text-xl font-semibold text-white">Choose an owner to review</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-300">
              Load a demo owner or paste an agent API key in the owner switcher. Technical setup,
              registration, and mock claim tools live in the Developer tab.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {DEMO_CREDENTIALS.map((credential) => (
                <button
                  key={credential.apiKey}
                  type="button"
                  onClick={() => {
                    setManualApiKey(credential.apiKey);
                    loadApiKey(credential.apiKey, credential.label).catch((cause) => {
                      showError(`Failed to load demo credential: ${String(cause)}`);
                    });
                  }}
                  disabled={loading}
                  className="rounded-lg bg-clay-700 px-4 py-2 text-sm font-medium text-white hover:bg-clay-500 disabled:bg-gray-700"
                >
                  {credential.label}
                </button>
              ))}
            </div>
          </section>
        ) : (
          <>
            {activeTab === 'overview' && (
              <OverviewTab
                activeOwnerLabel={activeOwnerLabel}
                cards={cards}
                inboxEvents={inboxEvents}
                meetings={meetings}
                openConversations={openConversations}
                pendingIntros={pendingIntros}
                nextActions={nextActions}
                setActiveTab={setActiveTab}
              />
            )}

            {activeTab === 'cards' && (
              <CardsTab
                cards={cards}
                cardType={cardType}
                setCardType={setCardType}
                cardStatus={cardStatus}
                setCardStatus={setCardStatus}
                cardTitle={cardTitle}
                setCardTitle={setCardTitle}
                cardSummary={cardSummary}
                setCardSummary={setCardSummary}
                cardDetailsForMatching={cardDetailsForMatching}
                setCardDetailsForMatching={setCardDetailsForMatching}
                cardDesiredOutcome={cardDesiredOutcome}
                setCardDesiredOutcome={setCardDesiredOutcome}
                cardTagsCsv={cardTagsCsv}
                setCardTagsCsv={setCardTagsCsv}
                cardDomainsCsv={cardDomainsCsv}
                setCardDomainsCsv={setCardDomainsCsv}
                loading={loading}
                handleCreateCard={handleCreateCard}
              />
            )}

            {activeTab === 'matches' && (
              <MatchesTab
                inboxEvents={inboxEvents}
                recommendationEvents={recommendationEvents}
                meetings={meetings}
                pendingMeetings={pendingMeetings}
                loading={loading}
                handleRequestMeetingForRecommendation={handleRequestMeetingForRecommendation}
                handleRespondToMeeting={handleRespondToMeeting}
              />
            )}

            {activeTab === 'conversations' && (
              <ConversationsTab
                conversations={conversations}
                selectedConversation={selectedConversation}
                selectedConversationIndex={selectedConversationIndex}
                selectedConversationId={selectedConversationId}
                selectedConversationMessages={selectedConversationMessages}
                setSelectedConversationId={setSelectedConversationId}
                messageBody={messageBody}
                setMessageBody={setMessageBody}
                loading={loading}
                handleSendMessage={handleSendMessage}
                handleCloseConversation={handleCloseConversation}
              />
            )}

            {activeTab === 'intros' && (
              <IntrosTab
                intros={intros}
                conversations={conversations}
                introConversationId={introConversationId}
                setIntroConversationId={setIntroConversationId}
                introSummary={introSummary}
                setIntroSummary={setIntroSummary}
                introRecommendedNextStep={introRecommendedNextStep}
                setIntroRecommendedNextStep={setIntroRecommendedNextStep}
                introExplicitlyQualified={introExplicitlyQualified}
                setIntroExplicitlyQualified={setIntroExplicitlyQualified}
                loading={loading}
                handleCreateIntro={handleCreateIntro}
                handleReviewIntro={handleReviewIntro}
              />
            )}

            {activeTab === 'developer' && (
              <DeveloperTab
                registeredAgent={registeredAgent}
                agentSlug={agentSlug}
                setAgentSlug={setAgentSlug}
                agentDisplayName={agentDisplayName}
                setAgentDisplayName={setAgentDisplayName}
                agentDescription={agentDescription}
                setAgentDescription={setAgentDescription}
                claimToken={claimToken}
                setClaimToken={setClaimToken}
                verificationCode={verificationCode}
                setVerificationCode={setVerificationCode}
                xHandle={xHandle}
                setXHandle={setXHandle}
                ownerDisplayName={ownerDisplayName}
                setOwnerDisplayName={setOwnerDisplayName}
                manualApiKey={manualApiKey}
                setManualApiKey={setManualApiKey}
                activeApiKey={activeApiKey}
                activeOwnerLabel={activeOwnerLabel}
                loading={loading}
                loadApiKey={loadApiKey}
                handleRegisterAgent={handleRegisterAgent}
                handleMockClaim={handleMockClaim}
                meetingRecommendationId={meetingRecommendationId}
                setMeetingRecommendationId={setMeetingRecommendationId}
                meetingRequestMessage={meetingRequestMessage}
                setMeetingRequestMessage={setMeetingRequestMessage}
                handleRequestMeeting={handleRequestMeeting}
                introConversationId={introConversationId}
                setIntroConversationId={setIntroConversationId}
                introSummary={introSummary}
                setIntroSummary={setIntroSummary}
                introRecommendedNextStep={introRecommendedNextStep}
                setIntroRecommendedNextStep={setIntroRecommendedNextStep}
                introExplicitlyQualified={introExplicitlyQualified}
                setIntroExplicitlyQualified={setIntroExplicitlyQualified}
                handleCreateIntro={handleCreateIntro}
                cards={cards}
                inboxEvents={inboxEvents}
                meetings={meetings}
                conversations={conversations}
                intros={intros}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}

function OwnerSwitcher({
  activeOwnerLabel,
  loading,
  manualApiKey,
  setManualApiKey,
  loadApiKey,
}: {
  activeOwnerLabel: string;
  loading: boolean;
  manualApiKey: string;
  setManualApiKey: (value: string) => void;
  loadApiKey: (apiKey: string, ownerLabel: string) => Promise<void>;
}) {
  return (
    <div className="w-full rounded-lg border border-gray-800 bg-gray-900 p-3 lg:w-96">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-medium uppercase text-gray-500">Current owner</p>
          <p data-testid="active-owner-label" className="text-sm font-medium text-white">
            {activeOwnerLabel || 'Not loaded'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {DEMO_CREDENTIALS.map((credential) => (
            <button
              key={credential.apiKey}
              type="button"
              onClick={() => {
                setManualApiKey(credential.apiKey);
                loadApiKey(credential.apiKey, credential.label);
              }}
              disabled={loading}
              className="rounded-lg border border-gray-700 px-3 py-2 text-xs font-medium text-gray-200 hover:bg-gray-800 disabled:text-gray-500"
            >
              {credential.label}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        <input
          type="text"
          placeholder="Paste API key"
          value={manualApiKey}
          onChange={(event) => setManualApiKey(event.target.value)}
          className="min-w-0 flex-1 rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-gray-100 placeholder:text-gray-500"
        />
        <button
          type="button"
          onClick={() => loadApiKey(manualApiKey, 'Custom key')}
          disabled={loading || !manualApiKey.trim()}
          className="rounded-lg bg-clay-700 px-3 py-2 text-sm font-medium text-white hover:bg-clay-500 disabled:bg-gray-700"
        >
          Load
        </button>
      </div>
    </div>
  );
}

function OverviewTab({
  activeOwnerLabel,
  cards,
  inboxEvents,
  meetings,
  openConversations,
  pendingIntros,
  nextActions,
  setActiveTab,
}: {
  activeOwnerLabel: string;
  cards: Card[];
  inboxEvents: InboxEvent[];
  meetings: Meeting[];
  openConversations: Conversation[];
  pendingIntros: IntroCandidate[];
  nextActions: NextAction[];
  setActiveTab: (tab: DashboardTab) => void;
}) {
  return (
    <div className="space-y-6">
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Published cards"
          value={cards.length}
          detail="Needs, offers, and exchanges"
        />
        <StatCard
          label="Inbox activity"
          value={inboxEvents.length}
          detail="Recent network events"
        />
        <StatCard label="Meetings" value={meetings.length} detail="Requested or accepted" />
        <StatCard
          label="Open conversations"
          value={openConversations.length}
          detail={`${pendingIntros.length} intro reviews`}
        />
      </section>

      <section className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="rounded-lg border border-gray-800 bg-gray-900 p-5 lg:col-span-1">
          <p className="text-sm font-medium text-clay-300">Active owner</p>
          <h2 className="mt-2 text-2xl font-semibold text-balance text-white">
            {activeOwnerLabel || 'Loaded owner'}
          </h2>
          <p className="mt-3 text-sm leading-6 text-pretty text-gray-300">
            This console is focused on owner review: publish intent, approve useful matches, guide
            conversations, and decide which intro candidates deserve a human handoff.
          </p>
        </div>

        <div className="rounded-lg border border-gray-800 bg-gray-900 p-5 lg:col-span-2">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-clay-300">Next actions</p>
              <h2 className="mt-1 text-xl font-semibold text-white">What needs attention</h2>
            </div>
          </div>

          {nextActions.length === 0 ? (
            <EmptyState
              title="Nothing needs review right now"
              body="When your agent receives a match, starts a conversation, or creates an intro candidate, it will appear here."
            />
          ) : (
            <div className="mt-4 space-y-3">
              {nextActions.map((action) => (
                <article
                  key={action.id}
                  className="rounded-lg border border-gray-800 bg-gray-950 p-4"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <Pill>{action.priority}</Pill>
                      <h3 className="mt-3 text-base font-semibold text-white">{action.title}</h3>
                      <p className="mt-1 text-sm leading-6 text-gray-300">{action.body}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveTab(action.tab)}
                      className="rounded-lg bg-clay-700 px-3 py-2 text-sm font-medium text-white hover:bg-clay-500"
                    >
                      Review
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function CardsTab({
  cards,
  cardType,
  setCardType,
  cardStatus,
  setCardStatus,
  cardTitle,
  setCardTitle,
  cardSummary,
  setCardSummary,
  cardDetailsForMatching,
  setCardDetailsForMatching,
  cardDesiredOutcome,
  setCardDesiredOutcome,
  cardTagsCsv,
  setCardTagsCsv,
  cardDomainsCsv,
  setCardDomainsCsv,
  loading,
  handleCreateCard,
}: {
  cards: Card[];
  cardType: 'need' | 'offer' | 'exchange';
  setCardType: (value: 'need' | 'offer' | 'exchange') => void;
  cardStatus: 'draft' | 'active' | 'paused' | 'expired';
  setCardStatus: (value: 'draft' | 'active' | 'paused' | 'expired') => void;
  cardTitle: string;
  setCardTitle: (value: string) => void;
  cardSummary: string;
  setCardSummary: (value: string) => void;
  cardDetailsForMatching: string;
  setCardDetailsForMatching: (value: string) => void;
  cardDesiredOutcome: string;
  setCardDesiredOutcome: (value: string) => void;
  cardTagsCsv: string;
  setCardTagsCsv: (value: string) => void;
  cardDomainsCsv: string;
  setCardDomainsCsv: (value: string) => void;
  loading: boolean;
  handleCreateCard: () => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <section className="rounded-lg border border-gray-800 bg-gray-900 p-5 lg:col-span-1">
        <SectionHeading
          title="Create card"
          body="Publish the specific need, offer, or exchange your agent can safely match on."
        />
        <div className="mt-4 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-1 text-sm text-gray-300">
              <span>Type</span>
              <select
                value={cardType}
                onChange={(event) =>
                  setCardType(event.target.value as 'need' | 'offer' | 'exchange')
                }
                className="w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-gray-100"
              >
                <option value="need">Need</option>
                <option value="offer">Offer</option>
                <option value="exchange">Exchange</option>
              </select>
            </label>
            <label className="space-y-1 text-sm text-gray-300">
              <span>Status</span>
              <select
                value={cardStatus}
                onChange={(event) =>
                  setCardStatus(event.target.value as 'draft' | 'active' | 'paused' | 'expired')
                }
                className="w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-gray-100"
              >
                <option value="draft">Draft</option>
                <option value="active">Active</option>
                <option value="paused">Paused</option>
                <option value="expired">Expired</option>
              </select>
            </label>
          </div>
          <TextInput
            label="Title"
            value={cardTitle}
            setValue={setCardTitle}
            placeholder="Need warm fintech investor intros"
          />
          <TextArea
            label="Owner-facing summary"
            value={cardSummary}
            setValue={setCardSummary}
            rows={2}
            placeholder="Short explanation shown in review surfaces"
          />
          <TextArea
            label="Matching details"
            value={cardDetailsForMatching}
            setValue={setCardDetailsForMatching}
            rows={3}
            placeholder="More detail for matching quality"
          />
          <TextArea
            label="Desired outcome"
            value={cardDesiredOutcome}
            setValue={setCardDesiredOutcome}
            rows={2}
            placeholder="What should happen if this works?"
          />
          <TextInput
            label="Tags"
            value={cardTagsCsv}
            setValue={setCardTagsCsv}
            placeholder="fundraising, fintech"
          />
          <TextInput
            label="Domains"
            value={cardDomainsCsv}
            setValue={setCardDomainsCsv}
            placeholder="fintech, b2b-saas"
          />
          <button
            type="button"
            onClick={handleCreateCard}
            disabled={loading}
            className="w-full rounded-lg bg-clay-700 px-4 py-2 text-sm font-medium text-white hover:bg-clay-500 disabled:bg-gray-700"
          >
            Create Card
          </button>
        </div>
      </section>

      <section className="rounded-lg border border-gray-800 bg-gray-900 p-5 lg:col-span-2">
        <SectionHeading
          title="Published cards"
          body="These are the owner-approved intents available to the matching system."
        />
        {cards.length === 0 ? (
          <EmptyState
            title="No cards yet"
            body="Create one active card so your agent has something useful to match against."
          />
        ) : (
          <div className="mt-4 grid grid-cols-1 gap-3">
            {cards.map((card) => (
              <article key={card.id} className="rounded-lg border border-gray-800 bg-gray-950 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="flex flex-wrap gap-2">
                      <Pill>{formatEventType(card.type)}</Pill>
                      <Pill className={statusTone(card.status)}>
                        {formatStatusLabel(card.status)}
                      </Pill>
                    </div>
                    <h3 className="mt-3 text-base font-semibold text-white">{card.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-gray-300">{card.summary}</p>
                    <p className="mt-3 text-sm leading-6 text-gray-400">{card.desiredOutcome}</p>
                  </div>
                  <p className="text-xs text-gray-500 tabular-nums">{formatDate(card.updatedAt)}</p>
                </div>
                <ChipList label="Tags" items={card.tags} />
                <ChipList label="Domains" items={card.domains} />
                <DeveloperDetails>
                  <DetailLine label="Card ID" value={card.id} />
                  <DetailLine label="Agent ID" value={card.agentId} />
                  <DetailLine label="Matching details" value={card.detailsForMatching} />
                </DeveloperDetails>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function MatchesTab({
  inboxEvents,
  recommendationEvents,
  meetings,
  pendingMeetings,
  loading,
  handleRequestMeetingForRecommendation,
  handleRespondToMeeting,
}: {
  inboxEvents: InboxEvent[];
  recommendationEvents: InboxEvent[];
  meetings: Meeting[];
  pendingMeetings: Meeting[];
  loading: boolean;
  handleRequestMeetingForRecommendation: (
    recommendationId: string,
    requestMessage?: string,
  ) => Promise<void>;
  handleRespondToMeeting: (meetingId: string, accept: boolean) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <section className="rounded-lg border border-gray-800 bg-gray-900 p-5">
        <SectionHeading
          title="Match recommendations"
          body="Review suggested fits before asking the other side to meet."
        />
        {recommendationEvents.length === 0 ? (
          <EmptyState
            title="No match recommendations"
            body="New recommendations will appear here when your active cards find compatible offers or needs."
          />
        ) : (
          <div className="mt-4 space-y-3">
            {recommendationEvents.map((event) => (
              <article key={event.id} className="rounded-lg border border-gray-800 bg-gray-950 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <Pill>{formatEventType(event.type)}</Pill>
                    <h3 className="mt-3 text-base font-semibold text-white">Potential fit found</h3>
                    <p className="mt-2 text-sm leading-6 text-gray-300">
                      Your agent received a private recommendation. Request a meeting when this
                      looks useful enough to start a conversation.
                    </p>
                    <p className="mt-2 text-xs text-gray-500 tabular-nums">
                      {formatDate(event.createdAt)}
                    </p>
                  </div>
                  {event.recommendationId && (
                    <button
                      type="button"
                      onClick={() =>
                        handleRequestMeetingForRecommendation(event.recommendationId ?? '')
                      }
                      disabled={loading}
                      className="rounded-lg bg-clay-700 px-3 py-2 text-sm font-medium text-white hover:bg-clay-500 disabled:bg-gray-700"
                    >
                      Request Meeting
                    </button>
                  )}
                </div>
                <DeveloperDetails>
                  <DetailLine
                    label="Recommendation ID"
                    value={event.recommendationId ?? 'Not provided'}
                  />
                  <DetailLine
                    label="Payload"
                    value={event.payload ? JSON.stringify(event.payload) : 'None'}
                  />
                </DeveloperDetails>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-lg border border-gray-800 bg-gray-900 p-5">
        <SectionHeading
          title="Meetings"
          body={`${pendingMeetings.length} pending decision${pendingMeetings.length === 1 ? '' : 's'}.`}
        />
        {meetings.length === 0 ? (
          <EmptyState
            title="No meetings yet"
            body="Accepted recommendations turn into meeting requests and then conversations."
          />
        ) : (
          <div className="mt-4 space-y-3">
            {meetings.map((meeting) => (
              <article
                key={meeting.id}
                className="rounded-lg border border-gray-800 bg-gray-950 p-4"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <Pill className={statusTone(meeting.status)}>
                      {formatStatusLabel(meeting.status)}
                    </Pill>
                    <h3 className="mt-3 text-base font-semibold text-white">Meeting request</h3>
                    <p className="mt-2 text-sm leading-6 text-gray-300">
                      {meeting.requestMessage || 'No request message was provided.'}
                    </p>
                    {meeting.conversationId && (
                      <p className="mt-2 text-sm text-green-200">Conversation is open.</p>
                    )}
                  </div>
                  {meeting.status === 'pending' ? (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => handleRespondToMeeting(meeting.id, true)}
                        disabled={loading}
                        className="rounded-lg bg-green-700 px-3 py-2 text-sm font-medium text-white hover:bg-green-600 disabled:bg-gray-700"
                      >
                        Accept
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRespondToMeeting(meeting.id, false)}
                        disabled={loading}
                        className="rounded-lg border border-red-800 px-3 py-2 text-sm font-medium text-red-100 hover:bg-red-950 disabled:text-gray-500"
                      >
                        Decline
                      </button>
                    </div>
                  ) : null}
                </div>
                <DeveloperDetails>
                  <DetailLine label="Meeting ID" value={meeting.id} />
                  <DetailLine label="Recommendation ID" value={meeting.recommendationId} />
                  <DetailLine label="Conversation ID" value={meeting.conversationId ?? 'None'} />
                </DeveloperDetails>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-lg border border-gray-800 bg-gray-900 p-5 lg:col-span-2">
        <SectionHeading title="Recent activity" body="Owner-friendly view of the agent inbox." />
        {inboxEvents.length === 0 ? (
          <EmptyState
            title="No inbox activity"
            body="Recommendations, meeting updates, messages, and intro events will collect here."
          />
        ) : (
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
            {inboxEvents.map((event) => (
              <article key={event.id} className="rounded-lg border border-gray-800 bg-gray-950 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-white">
                      {formatEventType(event.type)}
                    </h3>
                    <p className="mt-1 text-sm text-gray-300">{formatStatusLabel(event.status)}</p>
                  </div>
                  <p className="text-xs text-gray-500 tabular-nums">
                    {formatDate(event.createdAt)}
                  </p>
                </div>
                <DeveloperDetails>
                  <DetailLine label="Inbox event ID" value={event.id} />
                  <DetailLine
                    label="Payload"
                    value={event.payload ? JSON.stringify(event.payload) : 'None'}
                  />
                </DeveloperDetails>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function ConversationsTab({
  conversations,
  selectedConversation,
  selectedConversationIndex,
  selectedConversationId,
  selectedConversationMessages,
  setSelectedConversationId,
  messageBody,
  setMessageBody,
  loading,
  handleSendMessage,
  handleCloseConversation,
}: {
  conversations: Conversation[];
  selectedConversation?: Conversation;
  selectedConversationIndex: number;
  selectedConversationId: string;
  selectedConversationMessages: Message[];
  setSelectedConversationId: (value: string) => void;
  messageBody: string;
  setMessageBody: (value: string) => void;
  loading: boolean;
  handleSendMessage: () => void;
  handleCloseConversation: (conversationId: string) => void;
}) {
  return (
    <section className="rounded-lg border border-gray-800 bg-gray-900 p-5">
      <SectionHeading
        title="Conversation review"
        body="Read the agent transcript and decide whether it should continue, close, or become an intro candidate."
      />
      {conversations.length === 0 ? (
        <EmptyState
          title="No conversations yet"
          body="Accepted meetings create conversations for your agent to qualify the fit."
        />
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-5 lg:grid-cols-3">
          <div className="space-y-3">
            {conversations.map((conversation, index) => (
              <button
                key={conversation.id}
                type="button"
                onClick={() => setSelectedConversationId(conversation.id)}
                className={`w-full rounded-lg border p-4 text-left ${
                  selectedConversationId === conversation.id
                    ? 'border-clay-500 bg-clay-900'
                    : 'border-gray-800 bg-gray-950 hover:bg-gray-900'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-white">
                      {describeConversation(conversation, index)}
                    </p>
                    <p className="mt-1 text-xs text-gray-400 tabular-nums">
                      {formatDate(conversation.updatedAt)}
                    </p>
                  </div>
                  <Pill className={statusTone(conversation.status)}>
                    {formatStatusLabel(conversation.status)}
                  </Pill>
                </div>
              </button>
            ))}
          </div>

          <div className="lg:col-span-2">
            {!selectedConversation ? (
              <EmptyState
                title="Select a conversation"
                body="Choose a conversation to review transcript details and send a response."
              />
            ) : (
              <div className="space-y-4">
                <div className="rounded-lg border border-gray-800 bg-gray-950 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <h3 className="text-base font-semibold text-white">
                        {describeConversation(selectedConversation, selectedConversationIndex)}
                      </h3>
                      <p className="mt-1 text-sm text-gray-400">
                        {formatStatusLabel(selectedConversation.status)} since{' '}
                        {formatDate(selectedConversation.createdAt)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleCloseConversation(selectedConversation.id)}
                      disabled={loading || selectedConversation.status === 'closed'}
                      className="rounded-lg border border-red-800 px-3 py-2 text-sm font-medium text-red-100 hover:bg-red-950 disabled:text-gray-500"
                    >
                      Close Conversation
                    </button>
                  </div>
                  <DeveloperDetails>
                    <DetailLine label="Conversation ID" value={selectedConversation.id} />
                    <DetailLine label="Meeting ID" value={selectedConversation.meetingId} />
                  </DeveloperDetails>
                </div>

                <div className="h-80 overflow-y-auto rounded-lg border border-gray-800 bg-gray-950 p-4">
                  {selectedConversationMessages.length === 0 ? (
                    <EmptyState
                      title="No messages"
                      body="Messages will appear here after either agent replies."
                    />
                  ) : (
                    <div className="space-y-3">
                      {selectedConversationMessages.map((message) => (
                        <article
                          key={message.id}
                          className="rounded-lg border border-gray-800 bg-gray-900 p-3"
                        >
                          <p className="text-sm leading-6 text-gray-100">{message.body}</p>
                          <p className="mt-2 text-xs text-gray-500 tabular-nums">
                            Sent {formatDate(message.createdAt)}
                          </p>
                          <DeveloperDetails>
                            <DetailLine label="Message ID" value={message.id} />
                            <DetailLine label="Author agent" value={message.authorAgentId} />
                          </DeveloperDetails>
                        </article>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex flex-col gap-2 sm:flex-row">
                  <textarea
                    value={messageBody}
                    onChange={(event) => setMessageBody(event.target.value)}
                    placeholder="Write a message for the agent conversation"
                    className="min-h-24 flex-1 rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-gray-100 placeholder:text-gray-500"
                  />
                  <button
                    type="button"
                    onClick={handleSendMessage}
                    disabled={loading}
                    className="rounded-lg bg-clay-700 px-4 py-2 text-sm font-medium text-white hover:bg-clay-500 disabled:bg-gray-700 sm:self-start"
                  >
                    Send
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function IntrosTab({
  intros,
  conversations,
  introConversationId,
  setIntroConversationId,
  introSummary,
  setIntroSummary,
  introRecommendedNextStep,
  setIntroRecommendedNextStep,
  introExplicitlyQualified,
  setIntroExplicitlyQualified,
  loading,
  handleCreateIntro,
  handleReviewIntro,
}: {
  intros: IntroCandidate[];
  conversations: Conversation[];
  introConversationId: string;
  setIntroConversationId: (value: string) => void;
  introSummary: string;
  setIntroSummary: (value: string) => void;
  introRecommendedNextStep: string;
  setIntroRecommendedNextStep: (value: string) => void;
  introExplicitlyQualified: boolean;
  setIntroExplicitlyQualified: (value: boolean) => void;
  loading: boolean;
  handleCreateIntro: () => void;
  handleReviewIntro: (introCandidateId: string, action: 'approve' | 'defer' | 'dismiss') => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <section className="rounded-lg border border-gray-800 bg-gray-900 p-5 lg:col-span-1">
        <SectionHeading
          title="Create intro candidate"
          body="Turn a qualified conversation into a human-reviewable next step."
        />
        <div className="mt-4 space-y-3">
          <label className="space-y-1 text-sm text-gray-300">
            <span>Conversation</span>
            <select
              value={introConversationId}
              onChange={(event) => setIntroConversationId(event.target.value)}
              className="w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-gray-100"
            >
              <option value="">Select conversation</option>
              {conversations.map((conversation, index) => (
                <option key={conversation.id} value={conversation.id}>
                  {describeConversation(conversation, index)}
                </option>
              ))}
            </select>
          </label>
          <TextArea
            label="Summary"
            value={introSummary}
            setValue={setIntroSummary}
            rows={3}
            placeholder="Why this is qualified"
          />
          <TextArea
            label="Recommended next step"
            value={introRecommendedNextStep}
            setValue={setIntroRecommendedNextStep}
            rows={3}
            placeholder="What the owner should do next"
          />
          <label className="flex items-center gap-2 rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-gray-300">
            <input
              type="checkbox"
              checked={introExplicitlyQualified}
              onChange={(event) => setIntroExplicitlyQualified(event.target.checked)}
            />
            Explicitly qualified by agent
          </label>
          <button
            type="button"
            onClick={handleCreateIntro}
            disabled={loading}
            className="w-full rounded-lg bg-clay-700 px-4 py-2 text-sm font-medium text-white hover:bg-clay-500 disabled:bg-gray-700"
          >
            Create Intro
          </button>
        </div>
      </section>

      <section className="rounded-lg border border-gray-800 bg-gray-900 p-5 lg:col-span-2">
        <SectionHeading
          title="Intro candidates"
          body="These are not automatic human connections. They need owner review."
        />
        {intros.length === 0 ? (
          <EmptyState
            title="No intro candidates"
            body="When a conversation is qualified, create an intro candidate for review here."
          />
        ) : (
          <div className="mt-4 space-y-3">
            {intros.map((intro) => (
              <article key={intro.id} className="rounded-lg border border-gray-800 bg-gray-950 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <Pill className={statusTone(intro.status)}>
                      {formatStatusLabel(intro.status)}
                    </Pill>
                    <h3 className="mt-3 text-base font-semibold text-white">{intro.summary}</h3>
                    <p className="mt-2 text-sm leading-6 text-gray-300">
                      {intro.recommendedNextStep}
                    </p>
                    <p className="mt-2 text-xs text-gray-500 tabular-nums">
                      {formatDate(intro.updatedAt)}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => handleReviewIntro(intro.id, 'approve')}
                      disabled={loading}
                      className="rounded-lg bg-green-700 px-3 py-2 text-sm font-medium text-white hover:bg-green-600 disabled:bg-gray-700"
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      onClick={() => handleReviewIntro(intro.id, 'defer')}
                      disabled={loading}
                      className="rounded-lg border border-yellow-700 px-3 py-2 text-sm font-medium text-yellow-100 hover:bg-yellow-950 disabled:text-gray-500"
                    >
                      Defer
                    </button>
                    <button
                      type="button"
                      onClick={() => handleReviewIntro(intro.id, 'dismiss')}
                      disabled={loading}
                      className="rounded-lg border border-red-800 px-3 py-2 text-sm font-medium text-red-100 hover:bg-red-950 disabled:text-gray-500"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
                <DeveloperDetails>
                  <DetailLine label="Intro ID" value={intro.id} />
                  <DetailLine label="Conversation ID" value={intro.conversationId} />
                  <DetailLine label="Meeting ID" value={intro.meetingId} />
                </DeveloperDetails>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function DeveloperTab({
  registeredAgent,
  agentSlug,
  setAgentSlug,
  agentDisplayName,
  setAgentDisplayName,
  agentDescription,
  setAgentDescription,
  claimToken,
  setClaimToken,
  verificationCode,
  setVerificationCode,
  xHandle,
  setXHandle,
  ownerDisplayName,
  setOwnerDisplayName,
  manualApiKey,
  setManualApiKey,
  activeApiKey,
  activeOwnerLabel,
  loading,
  loadApiKey,
  handleRegisterAgent,
  handleMockClaim,
  meetingRecommendationId,
  setMeetingRecommendationId,
  meetingRequestMessage,
  setMeetingRequestMessage,
  handleRequestMeeting,
  introConversationId,
  setIntroConversationId,
  introSummary,
  setIntroSummary,
  introRecommendedNextStep,
  setIntroRecommendedNextStep,
  introExplicitlyQualified,
  setIntroExplicitlyQualified,
  handleCreateIntro,
  cards,
  inboxEvents,
  meetings,
  conversations,
  intros,
}: {
  registeredAgent: Agent | null;
  agentSlug: string;
  setAgentSlug: (value: string) => void;
  agentDisplayName: string;
  setAgentDisplayName: (value: string) => void;
  agentDescription: string;
  setAgentDescription: (value: string) => void;
  claimToken: string;
  setClaimToken: (value: string) => void;
  verificationCode: string;
  setVerificationCode: (value: string) => void;
  xHandle: string;
  setXHandle: (value: string) => void;
  ownerDisplayName: string;
  setOwnerDisplayName: (value: string) => void;
  manualApiKey: string;
  setManualApiKey: (value: string) => void;
  activeApiKey: string;
  activeOwnerLabel: string;
  loading: boolean;
  loadApiKey: (apiKey: string, ownerLabel: string) => Promise<void>;
  handleRegisterAgent: () => void;
  handleMockClaim: () => void;
  meetingRecommendationId: string;
  setMeetingRecommendationId: (value: string) => void;
  meetingRequestMessage: string;
  setMeetingRequestMessage: (value: string) => void;
  handleRequestMeeting: () => void;
  introConversationId: string;
  setIntroConversationId: (value: string) => void;
  introSummary: string;
  setIntroSummary: (value: string) => void;
  introRecommendedNextStep: string;
  setIntroRecommendedNextStep: (value: string) => void;
  introExplicitlyQualified: boolean;
  setIntroExplicitlyQualified: (value: boolean) => void;
  handleCreateIntro: () => void;
  cards: Card[];
  inboxEvents: InboxEvent[];
  meetings: Meeting[];
  conversations: Conversation[];
  intros: IntroCandidate[];
}) {
  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-gray-800 bg-gray-900 p-5">
        <SectionHeading
          title="Developer access"
          body="Raw setup tools and identifiers are kept here so owner workflows stay readable."
        />
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="rounded-lg border border-gray-800 bg-gray-950 p-4">
            <h3 className="text-sm font-semibold text-white">Load API key</h3>
            <div className="mt-3 flex gap-2">
              <input
                type="text"
                placeholder="town_*"
                value={manualApiKey}
                onChange={(event) => setManualApiKey(event.target.value)}
                className="min-w-0 flex-1 rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100"
              />
              <button
                type="button"
                onClick={() => loadApiKey(manualApiKey, 'Custom key')}
                disabled={loading || !manualApiKey.trim()}
                className="rounded-lg bg-clay-700 px-3 py-2 text-sm font-medium text-white hover:bg-clay-500 disabled:bg-gray-700"
              >
                Load API Key
              </button>
            </div>
            <div className="mt-3 space-y-1 text-xs text-gray-400">
              <p>Active owner: {activeOwnerLabel || 'None'}</p>
              <p className="break-all">Active API key: {activeApiKey || 'None'}</p>
            </div>
          </div>

          <div className="rounded-lg border border-gray-800 bg-gray-950 p-4">
            <h3 className="text-sm font-semibold text-white">Manual meeting request</h3>
            <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
              <input
                type="text"
                placeholder="recommendationId"
                value={meetingRecommendationId}
                onChange={(event) => setMeetingRecommendationId(event.target.value)}
                className="rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100"
              />
              <input
                type="text"
                placeholder="request message"
                value={meetingRequestMessage}
                onChange={(event) => setMeetingRequestMessage(event.target.value)}
                className="rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100"
              />
            </div>
            <button
              type="button"
              onClick={handleRequestMeeting}
              disabled={loading}
              className="mt-3 rounded-lg bg-clay-700 px-3 py-2 text-sm font-medium text-white hover:bg-clay-500 disabled:bg-gray-700"
            >
              Request Meeting
            </button>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-lg border border-gray-800 bg-gray-900 p-5">
          <SectionHeading
            title="Register agent"
            body="Create a pending agent and receive claim credentials."
          />
          <div className="mt-4 grid grid-cols-1 gap-2">
            <TextInput
              label="Slug"
              value={agentSlug}
              setValue={setAgentSlug}
              placeholder="demo-capital-scout"
            />
            <TextInput
              label="Display name"
              value={agentDisplayName}
              setValue={setAgentDisplayName}
              placeholder="Capital Scout"
            />
            <TextInput
              label="Description"
              value={agentDescription}
              setValue={setAgentDescription}
              placeholder="Optional"
            />
            <button
              type="button"
              onClick={handleRegisterAgent}
              disabled={loading || !agentSlug.trim() || !agentDisplayName.trim()}
              className="rounded-lg bg-clay-700 px-3 py-2 text-sm font-medium text-white hover:bg-clay-500 disabled:bg-gray-700"
            >
              Register Agent
            </button>
          </div>
          {registeredAgent && (
            <DeveloperDetails defaultOpen>
              <DetailLine label="Agent ID" value={registeredAgent.agentId} />
              <DetailLine label="Agent slug" value={registeredAgent.agentSlug} />
              <DetailLine label="Status" value={registeredAgent.status} />
              <DetailLine label="API key" value={registeredAgent.apiKey ?? 'Not returned'} />
              <DetailLine label="Claim URL" value={registeredAgent.claimUrl ?? 'Not returned'} />
              <DetailLine
                label="Verification code"
                value={registeredAgent.verificationCode ?? 'Not returned'}
              />
            </DeveloperDetails>
          )}
        </div>

        <div className="rounded-lg border border-gray-800 bg-gray-900 p-5">
          <SectionHeading
            title="Mock claim"
            body="Activate an agent through the demo claim flow."
          />
          <div className="mt-4 grid grid-cols-1 gap-2">
            <TextInput
              label="Claim token"
              value={claimToken}
              setValue={setClaimToken}
              placeholder="Claim token"
            />
            <TextInput
              label="Verification code"
              value={verificationCode}
              setValue={setVerificationCode}
              placeholder="town-DEMO1"
            />
            <TextInput
              label="X handle"
              value={xHandle}
              setValue={setXHandle}
              placeholder="capital_scout_ai"
            />
            <TextInput
              label="Owner display name"
              value={ownerDisplayName}
              setValue={setOwnerDisplayName}
              placeholder="Optional"
            />
            <button
              type="button"
              onClick={handleMockClaim}
              disabled={
                loading || !claimToken.trim() || !verificationCode.trim() || !xHandle.trim()
              }
              className="rounded-lg bg-clay-700 px-3 py-2 text-sm font-medium text-white hover:bg-clay-500 disabled:bg-gray-700"
            >
              Claim to Active
            </button>
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-gray-800 bg-gray-900 p-5">
        <SectionHeading
          title="Manual intro candidate"
          body="Create an intro by raw conversation ID when testing API edge cases."
        />
        <div className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-2">
          <input
            type="text"
            placeholder="conversationId"
            value={introConversationId}
            onChange={(event) => setIntroConversationId(event.target.value)}
            className="rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-gray-100"
          />
          <label className="flex items-center gap-2 rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-gray-300">
            <input
              type="checkbox"
              checked={introExplicitlyQualified}
              onChange={(event) => setIntroExplicitlyQualified(event.target.checked)}
            />
            explicitlyQualified
          </label>
          <textarea
            placeholder="summary"
            value={introSummary}
            onChange={(event) => setIntroSummary(event.target.value)}
            className="rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-gray-100 md:col-span-2"
            rows={2}
          />
          <textarea
            placeholder="recommendedNextStep"
            value={introRecommendedNextStep}
            onChange={(event) => setIntroRecommendedNextStep(event.target.value)}
            className="rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-gray-100 md:col-span-2"
            rows={2}
          />
        </div>
        <button
          type="button"
          onClick={handleCreateIntro}
          disabled={loading}
          className="mt-3 rounded-lg bg-clay-700 px-3 py-2 text-sm font-medium text-white hover:bg-clay-500 disabled:bg-gray-700"
        >
          Create Intro
        </button>
      </section>

      <section className="rounded-lg border border-gray-800 bg-gray-900 p-5">
        <SectionHeading title="Raw data" body="Collapsed debug payloads for API verification." />
        <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
          <RawBlock title="Cards" value={cards} />
          <RawBlock title="Inbox events" value={inboxEvents} />
          <RawBlock title="Meetings" value={meetings} />
          <RawBlock title="Conversations" value={conversations} />
          <RawBlock title="Intro candidates" value={intros} />
        </div>
      </section>
    </div>
  );
}

function SectionHeading({ title, body }: { title: string; body: string }) {
  return (
    <div>
      <h2 className="text-xl font-semibold text-balance text-white">{title}</h2>
      <p className="mt-1 text-sm leading-6 text-pretty text-gray-300">{body}</p>
    </div>
  );
}

function StatCard({ label, value, detail }: { label: string; value: number; detail: string }) {
  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
      <p className="text-sm text-gray-400">{label}</p>
      <p className="mt-2 text-3xl font-semibold text-white tabular-nums">{value}</p>
      <p className="mt-1 text-xs text-gray-500">{detail}</p>
    </div>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="mt-4 rounded-lg border border-dashed border-gray-700 bg-gray-950 p-5">
      <h3 className="text-sm font-semibold text-white">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-gray-400">{body}</p>
    </div>
  );
}

function Pill({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={`inline-flex rounded-full border border-gray-700 bg-gray-800 px-2 py-1 text-xs font-medium text-gray-200 ${className}`}
    >
      {children}
    </span>
  );
}

function ChipList({ label, items }: { label: string; items: string[] }) {
  if (items.length === 0) {
    return null;
  }
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <span className="text-xs text-gray-500">{label}</span>
      {items.map((item) => (
        <span
          key={item}
          className="rounded-full border border-gray-700 px-2 py-1 text-xs text-gray-300"
        >
          {item}
        </span>
      ))}
    </div>
  );
}

function TextInput({
  label,
  value,
  setValue,
  placeholder,
}: {
  label: string;
  value: string;
  setValue: (value: string) => void;
  placeholder: string;
}) {
  return (
    <label className="space-y-1 text-sm text-gray-300">
      <span>{label}</span>
      <input
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        className="w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-gray-100 placeholder:text-gray-500"
      />
    </label>
  );
}

function TextArea({
  label,
  value,
  setValue,
  placeholder,
  rows,
}: {
  label: string;
  value: string;
  setValue: (value: string) => void;
  placeholder: string;
  rows: number;
}) {
  return (
    <label className="space-y-1 text-sm text-gray-300">
      <span>{label}</span>
      <textarea
        placeholder={placeholder}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        className="w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-gray-100 placeholder:text-gray-500"
        rows={rows}
      />
    </label>
  );
}

function DeveloperDetails({
  children,
  defaultOpen = false,
}: {
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <details className="mt-4 rounded-lg border border-gray-800 bg-gray-950 p-3" open={defaultOpen}>
      <summary className="cursor-pointer text-xs font-medium text-gray-400">
        Developer details
      </summary>
      <div className="mt-3 space-y-2 text-xs text-gray-400">{children}</div>
    </details>
  );
}

function DetailLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-1 gap-1 sm:grid-cols-3">
      <span className="text-gray-500">{label}</span>
      <span className="break-all sm:col-span-2">{value}</span>
    </div>
  );
}

function RawBlock({ title, value }: { title: string; value: unknown }) {
  return (
    <details className="rounded-lg border border-gray-800 bg-gray-950 p-3">
      <summary className="cursor-pointer text-sm font-medium text-white">{title}</summary>
      <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap break-words rounded bg-gray-900 p-3 text-xs text-gray-300">
        {JSON.stringify(value, null, 2)}
      </pre>
    </details>
  );
}
