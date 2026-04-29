import { renderToStaticMarkup } from 'react-dom/server';
import { jest } from '@jest/globals';
import { EventOwnerReview, submitEventOwnerReviewAction } from './EventOwnerReview';
import { EventOwnerReviewData, IApiAdapter } from './api';

function reviewFixture(): EventOwnerReviewData {
  return {
    eventId: 'demo-event',
    eventAgentId: 'eventAgents:1',
    cardId: 'eventNetworkingCards:1',
    sessionStatus: 'pending',
    agentStatus: 'pending_owner_review',
    displayName: 'Cedar Scout 123',
    avatarConfig: {
      hair: 'curly',
      skinTone: 'tone-3',
      clothing: 'jacket',
      accessory: 'glasses',
    },
    publicCard: {
      role: 'Founder',
      category: 'Climate',
      offers: ['GTM help'],
      wants: ['seed investor feedback'],
      lookingFor: 'Climate operators',
      hobbies: ['cycling'],
      interests: ['energy'],
      favoriteMedia: ['The Expanse'],
    },
    createdAt: 1710000000000,
    updatedAt: 1710000000000,
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
    ...overrides,
  };
}

describe('EventOwnerReview', () => {
  test('renders pending public card fields and avatar summary', () => {
    const apiAdapter = createApiAdapter();
    const markup = renderToStaticMarkup(
      <EventOwnerReview
        apiAdapter={apiAdapter}
        eventId="demo-event"
        reviewToken="event_owner_token"
        initialReview={reviewFixture()}
      />,
    );

    expect(markup).toContain('Cedar Scout 123');
    expect(markup).toContain('Founder');
    expect(markup).toContain('Climate');
    expect(markup).toContain('GTM help');
    expect(markup).toContain('The Expanse');
    expect(markup).toContain('Hair: curly');
    expect(markup).toContain('Approve');
  });

  test('does not render private or contact fields even if unexpected data is present', () => {
    const apiAdapter = createApiAdapter();
    const review = reviewFixture() as EventOwnerReviewData & {
      email?: string;
      company?: string;
      publicCard: EventOwnerReviewData['publicCard'] & { linkedin?: string };
    };
    review.email = 'person@example.com';
    review.company = 'Private Co';
    review.publicCard.linkedin = 'https://linkedin.com/in/private';

    const markup = renderToStaticMarkup(
      <EventOwnerReview
        apiAdapter={apiAdapter}
        eventId="demo-event"
        reviewToken="event_owner_token"
        initialReview={review}
      />,
    );

    expect(markup).not.toContain('person@example.com');
    expect(markup).not.toContain('Private Co');
    expect(markup).not.toContain('linkedin');
  });

  test('submits approval through the event review adapter method', async () => {
    const updatedReview = { ...reviewFixture(), sessionStatus: 'approved' as const };
    const reviewEventOwnerCard = jest.fn(async () => ({
      success: true as const,
      data: updatedReview,
    }));
    const apiAdapter = createApiAdapter({ reviewEventOwnerCard });

    await expect(
      submitEventOwnerReviewAction(apiAdapter, {
        eventId: 'demo-event',
        reviewToken: 'event_owner_token',
        action: 'approve',
      }),
    ).resolves.toEqual({
      success: true,
      data: updatedReview,
    });

    expect(reviewEventOwnerCard).toHaveBeenCalledWith({
      eventId: 'demo-event',
      reviewToken: 'event_owner_token',
      action: 'approve',
      reviewNote: undefined,
    });
  });
});
