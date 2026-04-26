import { HttpApiAdapter, isError } from './api';
import { jest } from '@jest/globals';

type MockResponseSpec = {
  status?: number;
  body: unknown;
};

function createFetchMock(...responses: MockResponseSpec[]) {
  let callIndex = 0;
  return jest.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => {
    const response = responses[callIndex];
    callIndex += 1;
    if (!response) {
      throw new Error('Unexpected fetch call');
    }
    return new Response(JSON.stringify(response.body), {
      status: response.status ?? 200,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  });
}

function getRequestInit(fetchMock: any, call = 0) {
  const init = fetchMock.mock.calls[call]?.[1];
  if (!init) {
    throw new Error(`Missing request init for call ${call}`);
  }
  return init;
}

function getRequestBody(fetchMock: any, call = 0) {
  const init = getRequestInit(fetchMock, call);
  if (typeof init.body !== 'string') {
    throw new Error(`Expected string body for call ${call}`);
  }
  return JSON.parse(init.body) as Record<string, unknown>;
}

describe('OwnerDashboard HttpApiAdapter', () => {
  test('uses Packet 6 registration envelope and request shape', async () => {
    const fetchMock = createFetchMock({
      body: {
        success: true,
        data: {
          agentId: 'networkAgents:1',
          agentSlug: 'capital-scout',
          apiKey: 'town_demo_capital_scout_2026',
          claimUrl: 'https://town.example/claim/town_claim_demo_capital_scout_2026',
          verificationCode: 'town-DEMO1',
          status: 'pending_claim',
        },
      },
    });
    const adapter = new HttpApiAdapter('/api/v1', fetchMock as typeof fetch);

    const response = await adapter.registerAgent({
      slug: 'capital-scout',
      displayName: 'Capital Scout',
      description: 'Finds high-fit fundraising matches.',
    });

    expect(isError(response)).toBe(false);
    if (!isError(response)) {
      expect(response.data.status).toBe('pending_claim');
      expect(response.data.apiKey).toBe('town_demo_capital_scout_2026');
    }

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/v1/agents/register');

    const init = getRequestInit(fetchMock);
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
    expect(getRequestBody(fetchMock)).toEqual({
      slug: 'capital-scout',
      displayName: 'Capital Scout',
      description: 'Finds high-fit fundraising matches.',
    });
  });

  test('sends mock claim with xHandle and optional owner metadata', async () => {
    const fetchMock = createFetchMock({
      body: {
        success: true,
        data: {
          agentId: 'networkAgents:1',
          agentSlug: 'capital-scout',
          status: 'active',
          ownerClaimId: 'ownerClaims:1',
        },
      },
    });
    const adapter = new HttpApiAdapter('/api/v1', fetchMock as typeof fetch);

    const response = await adapter.mockClaim({
      claimToken: 'town_claim_demo_capital_scout_2026',
      verificationCode: 'town-DEMO1',
      xHandle: 'capital_scout_ai',
      owner: {
        displayName: 'Capital Scout Owner',
      },
    });

    expect(isError(response)).toBe(false);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/v1/agents/mock-claim');
    expect(getRequestBody(fetchMock)).toEqual({
      claimToken: 'town_claim_demo_capital_scout_2026',
      verificationCode: 'town-DEMO1',
      xHandle: 'capital_scout_ai',
      owner: {
        displayName: 'Capital Scout Owner',
      },
    });
  });

  test('creates cards using bearer auth and Packet 6 card shape', async () => {
    const fetchMock = createFetchMock({
      body: {
        success: true,
        data: {
          _id: 'matchCards:1',
          agentId: 'networkAgents:1',
          type: 'need',
          title: 'Need warm intros',
          summary: 'Looking for relevant investor intros',
          detailsForMatching: 'Seed fintech team raising now',
          desiredOutcome: 'Book three investor calls',
          status: 'active',
          tags: ['fundraising', 'fintech'],
          domains: ['fintech'],
          createdAt: 1710000000000,
          updatedAt: 1710000000000,
        },
      },
    });
    const adapter = new HttpApiAdapter('/api/v1', fetchMock as typeof fetch);

    const response = await adapter.createCard({
      apiKey: 'town_demo_capital_scout_2026',
      type: 'need',
      title: 'Need warm intros',
      summary: 'Looking for relevant investor intros',
      detailsForMatching: 'Seed fintech team raising now',
      desiredOutcome: 'Book three investor calls',
      tags: ['fundraising', 'fintech'],
      domains: ['fintech'],
      status: 'active',
    });

    expect(isError(response)).toBe(false);

    expect(fetchMock.mock.calls[0][0]).toBe('/api/v1/cards');
    const init = getRequestInit(fetchMock);
    expect((init.headers as Record<string, string>).Authorization).toBe(
      'Bearer town_demo_capital_scout_2026',
    );
    expect(getRequestBody(fetchMock)).toEqual({
      type: 'need',
      title: 'Need warm intros',
      summary: 'Looking for relevant investor intros',
      detailsForMatching: 'Seed fintech team raising now',
      desiredOutcome: 'Book three investor calls',
      tags: ['fundraising', 'fintech'],
      domains: ['fintech'],
      status: 'active',
    });
  });

  test('maps meeting request/action routes to recommendationId and meetingId endpoints', async () => {
    const fetchMock = createFetchMock(
      {
        body: {
          success: true,
          data: {
            _id: 'meetings:1',
            recommendationId: 'recommendations:1',
            requesterAgentId: 'networkAgents:1',
            responderAgentId: 'networkAgents:2',
            requesterCardId: 'matchCards:1',
            responderCardId: 'matchCards:2',
            status: 'pending',
            createdAt: 1710000000000,
            updatedAt: 1710000000000,
          },
        },
      },
      {
        body: {
          success: true,
          data: {
            meeting: {
              _id: 'meetings:1',
              recommendationId: 'recommendations:1',
              requesterAgentId: 'networkAgents:1',
              responderAgentId: 'networkAgents:2',
              requesterCardId: 'matchCards:1',
              responderCardId: 'matchCards:2',
              status: 'accepted',
              conversationId: 'agentConversations:1',
              createdAt: 1710000000000,
              updatedAt: 1710000003000,
              respondedAt: 1710000003000,
            },
            conversation: {
              _id: 'agentConversations:1',
              meetingId: 'meetings:1',
              participantOneAgentId: 'networkAgents:1',
              participantTwoAgentId: 'networkAgents:2',
              status: 'open',
              createdAt: 1710000003000,
              updatedAt: 1710000003000,
            },
          },
        },
      },
      {
        body: {
          success: true,
          data: {
            _id: 'meetings:1',
            recommendationId: 'recommendations:1',
            requesterAgentId: 'networkAgents:1',
            responderAgentId: 'networkAgents:2',
            requesterCardId: 'matchCards:1',
            responderCardId: 'matchCards:2',
            status: 'declined',
            createdAt: 1710000000000,
            updatedAt: 1710000004000,
          },
        },
      },
    );

    const adapter = new HttpApiAdapter('/api/v1', fetchMock as typeof fetch);

    const requestResponse = await adapter.requestMeeting({
      apiKey: 'town_demo_capital_scout_2026',
      recommendationId: 'recommendations:1',
      requestMessage: 'Can we compare notes this week?',
    });
    expect(isError(requestResponse)).toBe(false);

    const acceptResponse = await adapter.respondToMeeting({
      apiKey: 'town_demo_growth_operator_2026',
      meetingId: 'meetings:1',
      accept: true,
    });
    expect(isError(acceptResponse)).toBe(false);
    if (!isError(acceptResponse)) {
      expect(acceptResponse.data.meeting.status).toBe('accepted');
      expect(acceptResponse.data.conversation?.id).toBe('agentConversations:1');
    }

    const declineResponse = await adapter.respondToMeeting({
      apiKey: 'town_demo_growth_operator_2026',
      meetingId: 'meetings:1',
      accept: false,
    });
    expect(isError(declineResponse)).toBe(false);
    if (!isError(declineResponse)) {
      expect(declineResponse.data.meeting.status).toBe('declined');
    }

    expect(fetchMock.mock.calls[0][0]).toBe('/api/v1/recommendations/recommendations:1/request-meeting');
    expect(fetchMock.mock.calls[1][0]).toBe('/api/v1/meetings/meetings:1/accept');
    expect(fetchMock.mock.calls[2][0]).toBe('/api/v1/meetings/meetings:1/decline');
  });

  test('maps conversation message/close requests to Packet 6 routes', async () => {
    const fetchMock = createFetchMock(
      {
        body: {
          success: true,
          data: {
            _id: 'agentMessages:1',
            conversationId: 'agentConversations:1',
            authorAgentId: 'networkAgents:1',
            recipientAgentId: 'networkAgents:2',
            clientMessageId: 'client_123',
            body: 'Ready to connect founders.',
            createdAt: 1710000000000,
          },
        },
      },
      {
        body: {
          success: true,
          data: {
            _id: 'agentConversations:1',
            meetingId: 'meetings:1',
            participantOneAgentId: 'networkAgents:1',
            participantTwoAgentId: 'networkAgents:2',
            status: 'closed',
            createdAt: 1710000000000,
            updatedAt: 1710000005000,
            closedAt: 1710000005000,
          },
        },
      },
    );

    const adapter = new HttpApiAdapter('/api/v1', fetchMock as typeof fetch);

    const sendResponse = await adapter.sendMessage({
      apiKey: 'town_demo_capital_scout_2026',
      conversationId: 'agentConversations:1',
      clientMessageId: 'client_123',
      body: 'Ready to connect founders.',
    });
    expect(isError(sendResponse)).toBe(false);

    const closeResponse = await adapter.closeConversation({
      apiKey: 'town_demo_capital_scout_2026',
      conversationId: 'agentConversations:1',
    });
    expect(isError(closeResponse)).toBe(false);

    expect(fetchMock.mock.calls[0][0]).toBe('/api/v1/conversations/agentConversations:1/messages');
    expect(getRequestBody(fetchMock, 0)).toEqual({
      clientMessageId: 'client_123',
      body: 'Ready to connect founders.',
    });

    expect(fetchMock.mock.calls[1][0]).toBe('/api/v1/conversations/agentConversations:1/close');
    expect(getRequestInit(fetchMock, 1).method).toBe('POST');
  });

  test('supports intro creation and approve/defer/dismiss review actions', async () => {
    const fetchMock = createFetchMock(
      {
        body: {
          success: true,
          data: {
            _id: 'introCandidates:1',
            meetingId: 'meetings:1',
            conversationId: 'agentConversations:1',
            requesterAgentId: 'networkAgents:1',
            responderAgentId: 'networkAgents:2',
            createdByAgentId: 'networkAgents:2',
            summary: 'Strong fit for an intro this week.',
            recommendedNextStep: 'Schedule a 20-minute founder call.',
            status: 'pending_review',
            createdAt: 1710000000000,
            updatedAt: 1710000000000,
          },
        },
      },
      {
        body: {
          success: true,
          data: {
            _id: 'introCandidates:1',
            meetingId: 'meetings:1',
            conversationId: 'agentConversations:1',
            requesterAgentId: 'networkAgents:1',
            responderAgentId: 'networkAgents:2',
            createdByAgentId: 'networkAgents:2',
            summary: 'Strong fit for an intro this week.',
            recommendedNextStep: 'Schedule a 20-minute founder call.',
            status: 'approved',
            createdAt: 1710000000000,
            updatedAt: 1710000002000,
          },
        },
      },
      {
        body: {
          success: true,
          data: {
            _id: 'introCandidates:1',
            meetingId: 'meetings:1',
            conversationId: 'agentConversations:1',
            requesterAgentId: 'networkAgents:1',
            responderAgentId: 'networkAgents:2',
            createdByAgentId: 'networkAgents:2',
            summary: 'Strong fit for an intro this week.',
            recommendedNextStep: 'Schedule a 20-minute founder call.',
            status: 'deferred',
            createdAt: 1710000000000,
            updatedAt: 1710000003000,
          },
        },
      },
      {
        body: {
          success: true,
          data: {
            _id: 'introCandidates:1',
            meetingId: 'meetings:1',
            conversationId: 'agentConversations:1',
            requesterAgentId: 'networkAgents:1',
            responderAgentId: 'networkAgents:2',
            createdByAgentId: 'networkAgents:2',
            summary: 'Strong fit for an intro this week.',
            recommendedNextStep: 'Schedule a 20-minute founder call.',
            status: 'dismissed',
            createdAt: 1710000000000,
            updatedAt: 1710000004000,
          },
        },
      },
    );

    const adapter = new HttpApiAdapter('/api/v1', fetchMock as typeof fetch);

    await adapter.createIntro({
      apiKey: 'town_demo_capital_scout_2026',
      conversationId: 'agentConversations:1',
      summary: 'Strong fit for an intro this week.',
      recommendedNextStep: 'Schedule a 20-minute founder call.',
      explicitlyQualified: true,
    });

    await adapter.reviewIntro({
      apiKey: 'town_demo_capital_scout_2026',
      introCandidateId: 'introCandidates:1',
      action: 'approve',
    });

    await adapter.reviewIntro({
      apiKey: 'town_demo_capital_scout_2026',
      introCandidateId: 'introCandidates:1',
      action: 'defer',
    });

    await adapter.reviewIntro({
      apiKey: 'town_demo_capital_scout_2026',
      introCandidateId: 'introCandidates:1',
      action: 'dismiss',
    });

    expect(fetchMock.mock.calls[0][0]).toBe('/api/v1/intros');
    expect(getRequestBody(fetchMock, 0)).toEqual({
      conversationId: 'agentConversations:1',
      summary: 'Strong fit for an intro this week.',
      recommendedNextStep: 'Schedule a 20-minute founder call.',
      explicitlyQualified: true,
    });

    expect(fetchMock.mock.calls[1][0]).toBe('/api/v1/intros/introCandidates:1/approve');
    expect(fetchMock.mock.calls[2][0]).toBe('/api/v1/intros/introCandidates:1/defer');
    expect(fetchMock.mock.calls[3][0]).toBe('/api/v1/intros/introCandidates:1/dismiss');
  });

  test('normalizes inbox events and surfaces envelope errors', async () => {
    const fetchMock = createFetchMock(
      {
        body: {
          success: true,
          data: [
            {
              _id: 'inboxEvents:1',
              type: 'meeting_request',
              status: 'unread',
              recommendationId: 'recommendations:1',
              meetingId: 'meetings:1',
              conversationId: 'agentConversations:1',
              introCandidateId: 'introCandidates:1',
              payload: {
                outreachContext: {
                  requestedOutcome: 'Book investor calls',
                },
              },
              createdAt: 1710000000000,
              updatedAt: 1710000000000,
            },
          ],
        },
      },
      {
        body: {
          success: false,
          error: {
            code: 'invalid_api_key',
            message: 'Authorization header is required. Expected Bearer town_*.',
          },
        },
      },
    );

    const adapter = new HttpApiAdapter('/api/v1', fetchMock as typeof fetch);

    const inboxResponse = await adapter.getInbox('town_demo_capital_scout_2026');
    expect(isError(inboxResponse)).toBe(false);
    if (!isError(inboxResponse)) {
      expect(inboxResponse.data[0].id).toBe('inboxEvents:1');
      expect(inboxResponse.data[0].meetingId).toBe('meetings:1');
      expect(inboxResponse.data[0].introCandidateId).toBe('introCandidates:1');
    }

    const cardsResponse = await adapter.getCards('town_demo_capital_scout_2026');
    expect(isError(cardsResponse)).toBe(true);
    if (isError(cardsResponse)) {
      expect(cardsResponse.error.code).toBe('invalid_api_key');
    }
  });
});
