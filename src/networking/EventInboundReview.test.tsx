import { renderToStaticMarkup } from 'react-dom/server';
import { jest } from '@jest/globals';
import { EventInboundReview } from './EventInboundReview';
import { EventInboundIntentReview, IApiAdapter } from './api';

function inboundFixture(): EventInboundIntentReview {
  return {
    intent: {
      id: 'eventConnectionIntents:1',
      eventId: 'demo-event',
      requesterAgentId: 'eventAgents:1',
      targetAgentId: 'eventAgents:2',
      status: 'pending_recipient_review',
      filterResult: {
        allowed: true,
        reasons: ['recipient_rules_allowed'],
        evaluatedAt: 1710000000000,
      },
      createdAt: 1710000000000,
      updatedAt: 1710000000000,
    },
    requester: {
      id: 'eventNetworkingCards:1',
      eventId: 'demo-event',
      eventAgentId: 'eventAgents:1',
      displayName: 'Cedar Scout 123',
      avatarConfig: {
        hair: 'curly',
        skinTone: 'tone-3',
        clothing: 'jacket',
      },
      publicCard: {
        role: 'Founder',
        category: 'Climate',
        offers: ['GTM help'],
        wants: ['seed feedback'],
        lookingFor: 'Climate operators',
        hobbies: ['cycling'],
        interests: ['energy'],
        favoriteMedia: ['The Expanse'],
      },
      updatedAt: 1710000000000,
    },
  };
}

function createApiAdapter(overrides: Partial<IApiAdapter> = {}): IApiAdapter {
  return {
    registerAgent: jest.fn<any>(),
    mockClaim: jest.fn<any>(),
    getCards: jest.fn<any>(),
    createCard: jest.fn<any>(),
    getInbox: jest.fn<any>(),
    getMeetings: jest.fn<any>(),
    requestMeeting: jest.fn<any>(),
    respondToMeeting: jest.fn<any>(),
    getConversations: jest.fn<any>(),
    getConversationMessages: jest.fn<any>(),
    sendMessage: jest.fn<any>(),
    closeConversation: jest.fn<any>(),
    getIntros: jest.fn<any>(),
    createIntro: jest.fn<any>(),
    reviewIntro: jest.fn<any>(),
    registerEventAgent: jest.fn<any>(),
    getEventOwnerReview: jest.fn<any>(),
    reviewEventOwnerCard: jest.fn<any>(),
    searchEventDirectory: jest.fn<any>(),
    createEventConnectionIntent: jest.fn<any>(),
    getEventInboundIntents: jest.fn<any>(),
    upsertEventRecipientRules: jest.fn<any>(),
    upsertEventPrivateContact: jest.fn<any>(),
    decideEventConnectionIntent: jest.fn<any>(),
    getEventContactReveal: jest.fn<any>(),
    ...overrides,
  };
}

describe('EventInboundReview', () => {
  test('renders only allowed requester public-card previews with decision controls', () => {
    const apiAdapter = createApiAdapter();
    const fixture = inboundFixture() as EventInboundIntentReview & {
      requester: EventInboundIntentReview['requester'] & {
        email?: string;
        agentIdentifier?: string;
      };
    };
    fixture.requester.email = 'person@example.com';
    fixture.requester.agentIdentifier = 'private-local-id';

    const markup = renderToStaticMarkup(
      <EventInboundReview
        apiAdapter={apiAdapter}
        eventId="demo-event"
        targetAgentId="eventAgents:2"
        ownerSessionToken="event_owner_target"
        initialIntents={[fixture]}
        onDecision={jest.fn<any>()}
      />,
    );

    expect(markup).toContain('Cedar Scout 123');
    expect(markup).toContain('Climate');
    expect(markup).toContain('GTM help');
    expect(markup).toContain('Approve reveal');
    expect(markup).toContain('Decline');
    expect(markup).not.toContain('person@example.com');
    expect(markup).not.toContain('private-local-id');
    expect(markup).not.toContain('message');
    expect(markup).not.toContain('contact');
  });
});
