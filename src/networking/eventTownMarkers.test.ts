import { buildEventTownMarkers } from './eventTownMarkers';
import type { NetworkingTownAgent } from '../../convex/networking/townProjection';

describe('event town markers', () => {
  test('builds deterministic visible markers for event agents without player ids', () => {
    const marker = buildEventTownMarkers({
      agents: [
        {
          source: 'event',
          eventId: 'demo-event',
          agentId: 'eventAgents:1' as any,
          slug: 'attendee-a',
          displayName: 'Cedar Scout 123',
          avatarConfig: {
            hair: 'curly',
            skinTone: 'tone-3',
            clothing: 'jacket',
          },
          cards: [],
          matchedAgents: [],
          pendingMeetingAgents: [],
          talkingAgents: [],
          introReadyAgents: [],
          counts: {
            matched: 0,
            pending_meeting: 0,
            talking: 0,
            intro_ready: 0,
          },
          updatedAt: 1,
        } satisfies NetworkingTownAgent,
      ],
      mapWidth: 32,
      mapHeight: 32,
      tileDim: 16,
    })[0];

    expect(marker).toMatchObject({
      key: 'demo-event:eventAgents:1',
      displayName: 'Cedar Scout 123',
      fill: 0x8f563b,
      accent: 0x3a4466,
    });
    expect(marker.x).toBeGreaterThan(0);
    expect(marker.y).toBeGreaterThan(0);
  });

  test('ignores legacy and player-bound projections', () => {
    expect(
      buildEventTownMarkers({
        agents: [
          {
            source: 'legacy',
            agentId: 'networkAgents:1' as any,
            slug: 'legacy',
            displayName: 'Legacy',
            cards: [],
            matchedAgents: [],
            pendingMeetingAgents: [],
            talkingAgents: [],
            introReadyAgents: [],
            counts: {
              matched: 0,
              pending_meeting: 0,
              talking: 0,
              intro_ready: 0,
            },
            updatedAt: 1,
          } satisfies NetworkingTownAgent,
          {
            source: 'event',
            eventId: 'demo-event',
            agentId: 'eventAgents:1' as any,
            slug: 'bound',
            displayName: 'Bound',
            playerId: 'players:1' as any,
            cards: [],
            matchedAgents: [],
            pendingMeetingAgents: [],
            talkingAgents: [],
            introReadyAgents: [],
            counts: {
              matched: 0,
              pending_meeting: 0,
              talking: 0,
              intro_ready: 0,
            },
            updatedAt: 1,
          } satisfies NetworkingTownAgent,
        ],
        mapWidth: 32,
        mapHeight: 32,
        tileDim: 16,
      }),
    ).toEqual([]);
  });
});
