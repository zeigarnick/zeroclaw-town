import { buildEventMatchChoreography } from './eventMatchChoreography';
import type { NetworkingTownProjection } from '../../convex/networking/townProjection';
import type { EventTownMarker } from './eventTownMarkers';

function marker(overrides: Partial<EventTownMarker>): EventTownMarker {
  return {
    key: 'demo-event:stored-public-a',
    markerSlug: 'stored-public-a',
    displayName: 'Cedar Scout',
    avatarConfig: {
      hair: 'curly',
      skinTone: 'tone-3',
      clothing: 'jacket',
    },
    avatarSummary: 'Hair: curly | Skin tone: tone-3 | Clothing: jacket',
    characterName: 'f1',
    publicCard: {
      role: 'Founder',
      offers: [],
      wants: [],
      hobbies: [],
      interests: [],
      favoriteMedia: [],
    },
    x: 0,
    y: 0,
    fill: 0x8f563b,
    accent: 0x3a4466,
    ...overrides,
  };
}

function activity(createdAt: number): NonNullable<NetworkingTownProjection['eventActivity']> {
  return {
    matchCount: 1,
    updatedAt: createdAt,
    recent: [
      {
        type: 'match_created',
        requesterDisplayName: 'Cedar Scout',
        targetDisplayName: 'Orbit Builder',
        requesterMarkerSlug: 'stored-public-a',
        targetMarkerSlug: 'stored-public-b',
        payload: {
          matchKind: 'recipient_approved',
        },
        createdAt,
        updatedAt: createdAt,
      },
    ],
  };
}

describe('event match choreography', () => {
  test('moves matched markers toward each other and leaves unmatched markers alone', () => {
    const markers = [
      marker({ key: 'demo-event:stored-public-a', markerSlug: 'stored-public-a', x: 0, y: 0 }),
      marker({ key: 'demo-event:stored-public-b', markerSlug: 'stored-public-b', x: 120, y: 0 }),
      marker({ key: 'demo-event:stored-public-c', markerSlug: 'stored-public-c', x: 40, y: 80 }),
    ];

    const result = buildEventMatchChoreography({
      markers,
      activity: activity(1710000000000),
      nowMs: 1710000000900,
      tileDim: 16,
    });

    expect(result.markers[0].x).toBeGreaterThan(markers[0].x);
    expect(result.markers[1].x).toBeLessThan(markers[1].x);
    expect(result.markers[2]).toBe(markers[2]);
  });

  test('creates only a display-safe Match bubble near the pair', () => {
    const markers = [
      marker({ key: 'demo-event:stored-public-a', markerSlug: 'stored-public-a', x: 0, y: 0 }),
      marker({ key: 'demo-event:stored-public-b', markerSlug: 'stored-public-b', x: 120, y: 0 }),
    ];

    const result = buildEventMatchChoreography({
      markers,
      activity: activity(1710000000000),
      nowMs: 1710000001600,
      tileDim: 16,
    });

    expect(result.bubble).toMatchObject({
      text: 'Match',
      x: 60,
    });
    expect(result.bubble?.y).toBeLessThan(0);
    expect(JSON.stringify(result.bubble)).not.toContain('Cedar Scout');
    expect(JSON.stringify(result.bubble)).not.toContain('Orbit Builder');
    expect(JSON.stringify(result.bubble)).not.toContain('eventAgents:');
  });

  test('uses deterministic marker positions when no recent match applies', () => {
    const markers = [
      marker({ key: 'demo-event:stored-public-a', markerSlug: 'stored-public-a', x: 0, y: 0 }),
      marker({ key: 'demo-event:stored-public-b', markerSlug: 'stored-public-b', x: 120, y: 0 }),
    ];

    const result = buildEventMatchChoreography({
      markers,
      activity: activity(1710000000000),
      nowMs: 1710000010000,
      tileDim: 16,
    });

    expect(result.markers).toBe(markers);
    expect(result.bubble).toBeNull();
  });
});
