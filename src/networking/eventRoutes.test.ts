import { parseInitialRoute } from './eventRoutes';

describe('event route parsing', () => {
  test('keeps event owner review routes reachable', () => {
    expect(parseInitialRoute('/event-review/demo-event/event_owner_abc', '')).toEqual({
      claimToken: '',
      eventReview: {
        eventId: 'demo-event',
        reviewToken: 'event_owner_abc',
      },
    });
  });

  test('adds an event-specific inbound review route without dashboard state', () => {
    expect(
      parseInitialRoute(
        '/event-inbound/demo-event/eventAgents%3A2/event_owner_target',
        '',
      ),
    ).toEqual({
      claimToken: '',
      inboundReview: {
        eventId: 'demo-event',
        targetAgentId: 'eventAgents:2',
        ownerSessionToken: 'event_owner_target',
      },
    });
  });
});
