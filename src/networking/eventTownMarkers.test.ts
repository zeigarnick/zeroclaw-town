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
            accessory: 'glasses',
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
      key: 'demo-event:attendee-a',
      markerSlug: 'attendee-a',
      displayName: 'Cedar Scout 123',
      avatarSummary: 'Hair: curly | Skin tone: tone-3 | Clothing: jacket | Accessory: glasses',
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
      fill: 0x8f563b,
      accent: 0x3a4466,
    });
    expect(marker.x).toBeGreaterThan(0);
    expect(marker.y).toBeGreaterThan(0);
    expect(JSON.stringify(marker)).not.toContain('eventAgents:1');
    expect(JSON.stringify(marker)).not.toContain('person@example.com');
  });

  test('copies only display-safe marker fields from unexpected source data', () => {
    const marker = buildEventTownMarkers({
      agents: [
        {
          source: 'event',
          eventId: 'demo-event',
          agentId: 'eventAgents:private-raw-id' as any,
          slug: 'public-marker-42',
          displayName: 'Orbit Builder 456',
          agentIdentifier: 'private-local-identifier',
          email: 'person@example.com',
          ownerSessionToken: 'event_owner_private',
          avatarConfig: {
            hair: 'waves',
            skinTone: 'tone-2',
            clothing: 'hoodie',
          },
          publicCard: {
            role: 'Operator',
            category: 'AI',
            offers: ['workflow reviews'],
            wants: ['design partners'],
            lookingFor: 'B2B founders',
            hobbies: [],
            interests: ['automation'],
            favoriteMedia: [],
          },
          privateContact: {
            email: 'person@example.com',
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
        } as NetworkingTownAgent & Record<string, unknown>,
      ],
      mapWidth: 32,
      mapHeight: 32,
      tileDim: 16,
    })[0];

    const serialized = JSON.stringify(marker);
    expect(marker.key).toBe('demo-event:public-marker-42');
    expect(marker.publicCard.offers).toEqual(['workflow reviews']);
    expect(serialized).not.toContain('eventAgents:private-raw-id');
    expect(serialized).not.toContain('private-local-identifier');
    expect(serialized).not.toContain('person@example.com');
    expect(serialized).not.toContain('event_owner_private');
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
