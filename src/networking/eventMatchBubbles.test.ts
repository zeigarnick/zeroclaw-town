import { buildEventMatchBubbles } from './eventMatchBubbles';
import type { NetworkingTownProjection } from '../../convex/networking/townProjection';
import type { Player } from '../../convex/aiTown/player';

function player(id: string, x: number, y: number): Player {
  return {
    id,
    position: { x, y },
    facing: { dx: 0, dy: 1 },
    speed: 0,
    lastInput: 1,
  } as any;
}

function projection(): Pick<NetworkingTownProjection, 'agents' | 'eventActivity'> {
  return {
    agents: [
      eventAgent('stored-public-a', 'p:1'),
      eventAgent('stored-public-b', 'p:2'),
      eventAgent('stored-public-c', undefined),
    ],
    eventActivity: {
      matchCount: 1,
      updatedAt: 1710000000000,
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
          createdAt: 1710000000000,
          updatedAt: 1710000000000,
        },
      ],
    },
  };
}

describe('event match bubbles', () => {
  test('positions a display-safe Match bubble from real player locations', () => {
    const data = projection();
    const bubbles = buildEventMatchBubbles({
      players: [player('p:1', 2, 4), player('p:2', 8, 4)],
      agents: data.agents,
      activity: data.eventActivity,
      nowMs: 1710000001000,
      tileDim: 32,
    });

    expect(bubbles).toEqual([
      expect.objectContaining({
        text: 'Match',
        x: 176,
        y: expect.any(Number),
        alpha: 1,
      }),
    ]);
    expect(JSON.stringify(bubbles)).not.toContain('Cedar Scout');
    expect(JSON.stringify(bubbles)).not.toContain('Orbit Builder');
    expect(JSON.stringify(bubbles)).not.toContain('eventAgents:');
  });

  test('does not render a bubble until both matched agents have town players', () => {
    const data = projection();
    const bubbles = buildEventMatchBubbles({
      players: [player('p:1', 2, 4)],
      agents: data.agents,
      activity: data.eventActivity,
      nowMs: 1710000001000,
      tileDim: 32,
    });

    expect(bubbles).toEqual([]);
  });
});

function eventAgent(slug: string, playerId: string | undefined): NetworkingTownProjection['agents'][number] {
  return {
    source: 'event',
    eventId: 'demo-event',
    slug,
    displayName: 'Cedar Scout 123',
    playerId: playerId as any,
    avatarConfig: {
      hair: 'curly',
      skinTone: 'tone-3',
      clothing: 'jacket',
    },
    publicCard: {
      role: 'Founder',
      offers: ['GTM help'],
      wants: [],
      hobbies: [],
      interests: [],
      favoriteMedia: [],
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
  };
}
