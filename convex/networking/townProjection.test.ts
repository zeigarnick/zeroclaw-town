import { getTownProjectionHandler } from './townProjection';

type TableName =
  | 'networkAgents'
  | 'playerDescriptions'
  | 'matchCards'
  | 'recommendations'
  | 'meetings'
  | 'agentConversations'
  | 'introCandidates'
  | 'eventAgents'
  | 'eventNetworkingCards'
  | 'eventActivityEvents'
  | 'eventActivityAggregates';

type Row = Record<string, any> & { _id: string };

function createMockCtx(tableOverrides: Partial<Record<TableName, Row[]>>) {
  const tables: Record<TableName, Row[]> = {
    networkAgents: [],
    playerDescriptions: [],
    matchCards: [],
    recommendations: [],
    meetings: [],
    agentConversations: [],
    introCandidates: [],
    eventAgents: [],
    eventNetworkingCards: [],
    eventActivityEvents: [],
    eventActivityAggregates: [],
    ...tableOverrides,
  };
  const db = {
    query: (tableName: TableName) => ({
      withIndex: (_indexName: string, buildQuery: (q: any) => any) => {
        const filters: Array<{ field: string; value: any }> = [];
        const q = {
          eq: (field: string, value: any) => {
            filters.push({ field, value });
            return q;
          },
        };
        buildQuery(q);

        const rows = tables[tableName].filter((row) =>
          filters.every(({ field, value }) => row[field] === value),
        );

        return {
          first: async () => rows[0] ?? null,
          collect: async () => rows,
          order: (direction: 'asc' | 'desc') => ({
            take: async (limit: number) =>
              [...rows]
                .sort((left, right) =>
                  direction === 'desc'
                    ? (right.createdAt ?? 0) - (left.createdAt ?? 0)
                    : (left.createdAt ?? 0) - (right.createdAt ?? 0),
                )
                .slice(0, limit),
          }),
        };
      },
    }),
  };

  return { db };
}

describe('networking town projection', () => {
  test('projects claimed agent status by mapped AI Town player', async () => {
    const ctx = createMockCtx({
      networkAgents: [
        agent('networkAgents:1', 'lucky', 'Lucky', 1),
        agent('networkAgents:2', 'bob', 'Bob', 2),
        agent('networkAgents:3', 'stella', 'Stella', 3),
        agent('networkAgents:4', 'alice', 'Alice Network', 4),
        {
          ...agent('networkAgents:5', 'unclaimed', 'Unclaimed', 5),
          status: 'pending_claim',
        },
      ],
      playerDescriptions: [
        playerDescription('worlds:1', 'p:1', 'Lucky'),
        playerDescription('worlds:1', 'p:2', 'Bob'),
        playerDescription('worlds:1', 'p:3', 'Stella'),
        playerDescription('worlds:1', 'p:4', 'Alice'),
      ],
      matchCards: [
        card('matchCards:1', 'networkAgents:1', 'Need launch help', 10),
        card('matchCards:2', 'networkAgents:2', 'Offer launch help', 11),
        card('matchCards:3', 'networkAgents:3', 'Offer ops help', 12),
        card('matchCards:4', 'networkAgents:4', 'Need ops help', 13),
      ],
      recommendations: [
        recommendation(
          'recommendations:1',
          'networkAgents:1',
          'matchCards:1',
          'networkAgents:2',
          'matchCards:2',
          20,
        ),
      ],
      meetings: [
        meeting('meetings:1', 'pending', 'networkAgents:2', 'networkAgents:3', 30),
        meeting('meetings:2', 'accepted', 'networkAgents:3', 'networkAgents:4', 31),
      ],
      agentConversations: [
        conversation('agentConversations:1', 'networkAgents:3', 'networkAgents:4', 40),
      ],
      introCandidates: [
        introCandidate('introCandidates:1', 'networkAgents:4', 'networkAgents:1', 50),
      ],
      eventAgents: [],
      eventNetworkingCards: [],
    });

    const projection = await getTownProjectionHandler(ctx as any, { worldId: 'worlds:1' as any });

    expect(projection.agents).toHaveLength(4);
    expect(projection.agentsByPlayerId['p:1'].primaryStatus).toBe('intro_ready');
    expect(projection.agentsByPlayerId['p:2'].primaryStatus).toBe('pending_meeting');
    expect(projection.agentsByPlayerId['p:3'].primaryStatus).toBe('talking');
    expect(projection.agentsByPlayerId['p:4'].primaryStatus).toBe('intro_ready');
    expect(projection.agentsByPlayerId['p:4'].slug).toBe('alice');
    expect(projection.agentsByPlayerId['p:1'].matchedAgents).toEqual([
      { agentId: 'networkAgents:2', displayName: 'Bob' },
    ]);
    expect(projection.agentsByPlayerId['p:3'].pendingMeetingAgents).toEqual([
      { agentId: 'networkAgents:4', displayName: 'Alice Network' },
      { agentId: 'networkAgents:2', displayName: 'Bob' },
    ]);
    expect(projection.statusCounts).toEqual({
      matched: 0,
      pending_meeting: 1,
      talking: 1,
      intro_ready: 2,
    });
  });

  test('maps Packet 9 demo agents onto default AI Town players', async () => {
    const ctx = createMockCtx({
      networkAgents: [
        agent('networkAgents:1', 'demo-capital-scout', 'Capital Scout', 1),
        agent('networkAgents:2', 'demo-growth-operator', 'Growth Operator', 2),
      ],
      playerDescriptions: [
        playerDescription('worlds:1', 'p:1', 'Lucky'),
        playerDescription('worlds:1', 'p:2', 'Bob'),
      ],
      matchCards: [
        card('matchCards:1', 'networkAgents:1', 'Need warm fintech investor intros', 10),
        card('matchCards:2', 'networkAgents:2', 'Offer fintech GTM and investor network', 11),
      ],
      recommendations: [
        recommendation(
          'recommendations:1',
          'networkAgents:1',
          'matchCards:1',
          'networkAgents:2',
          'matchCards:2',
          20,
        ),
      ],
      meetings: [meeting('meetings:1', 'accepted', 'networkAgents:1', 'networkAgents:2', 30)],
      agentConversations: [],
      introCandidates: [
        introCandidate('introCandidates:1', 'networkAgents:1', 'networkAgents:2', 40),
      ],
      eventAgents: [],
      eventNetworkingCards: [],
    });

    const projection = await getTownProjectionHandler(ctx as any, { worldId: 'worlds:1' as any });

    expect(projection.agentsByPlayerId['p:1'].slug).toBe('demo-capital-scout');
    expect(projection.agentsByPlayerId['p:2'].slug).toBe('demo-growth-operator');
    expect(projection.agentsByPlayerId['p:1'].primaryStatus).toBe('intro_ready');
    expect(projection.agentsByPlayerId['p:2'].primaryStatus).toBe('intro_ready');
  });

  test('projects approved event agents with pseudonymous public cards and avatars', async () => {
    const ctx = createMockCtx({
      networkAgents: [agent('networkAgents:9', 'legacy-agent', 'Legacy Agent', 99)],
      playerDescriptions: [],
      matchCards: [card('matchCards:9', 'networkAgents:9', 'Legacy card', 99)],
      recommendations: [],
      meetings: [],
      agentConversations: [],
      introCandidates: [],
      eventAgents: [
        eventAgent(
          'eventAgents:1',
          'demo-event',
          'founder-example-com',
          'Cedar Scout 123',
          'approved',
          10,
          'stored-public-cedar',
        ),
        eventAgent(
          'eventAgents:2',
          'demo-event',
          'attendee-b',
          'Private Pending 456',
          'pending_owner_review',
          11,
          'stored-public-pending',
        ),
      ],
      eventNetworkingCards: [
        eventCard('eventNetworkingCards:1', 'demo-event', 'eventAgents:1', 'approved', 20),
        eventCard(
          'eventNetworkingCards:2',
          'demo-event',
          'eventAgents:2',
          'pending_owner_review',
          21,
        ),
      ],
      eventActivityEvents: [
        eventActivityEvent(
          'eventActivityEvents:1',
          'demo-event',
          'Cedar Scout 123',
          'Orbit Builder 456',
          'stored-public-cedar',
          'stored-public-orbit',
          'eventConnectionIntents:1',
          30,
        ),
        eventActivityEvent(
          'eventActivityEvents:2',
          'demo-event',
          'Cedar Scout 123',
          'Harbor Builder 789',
          'stored-public-cedar',
          'stored-public-harbor',
          'eventConnectionIntents:2',
          31,
        ),
        eventActivityEvent(
          'eventActivityEvents:3',
          'other-event',
          'Other Scout',
          'Other Builder',
          'stored-public-other-scout',
          'stored-public-other-builder',
          'eventConnectionIntents:3',
          32,
        ),
      ],
      eventActivityAggregates: [eventActivityAggregate('demo-event', 12, 33)],
    });

    const projection = await getTownProjectionHandler(ctx as any, {
      worldId: 'worlds:1' as any,
      eventId: 'demo-event',
    });

    expect(projection.agents).toEqual([
      expect.objectContaining({
        source: 'event',
        eventId: 'demo-event',
        slug: 'stored-public-cedar',
        displayName: 'Cedar Scout 123',
        avatarConfig: {
          hair: 'curly',
          skinTone: 'tone-3',
          clothing: 'jacket',
        },
        publicCard: expect.objectContaining({
          role: 'Founder',
          offers: ['GTM help'],
        }),
      }),
    ]);
    expect(JSON.stringify(projection)).not.toContain('founder-example-com');
    expect(JSON.stringify(projection)).not.toContain('founder');
    expect(JSON.stringify(projection)).not.toContain('example');
    expect(JSON.stringify(projection)).not.toContain('Private Pending');
    expect(JSON.stringify(projection.agents)).not.toContain('event-agent-');
    expect(JSON.stringify(projection.agents)).not.toContain('eventAgents:');
    expect(projection.statusCounts).toEqual({
      matched: 0,
      pending_meeting: 0,
      talking: 0,
      intro_ready: 0,
    });
    expect(projection.eventActivity).toMatchObject({
      matchCount: 12,
      recent: [
        {
          type: 'match_created',
          requesterDisplayName: 'Cedar Scout 123',
          targetDisplayName: 'Harbor Builder 789',
          requesterMarkerSlug: 'stored-public-cedar',
          targetMarkerSlug: 'stored-public-harbor',
          payload: {
            matchKind: 'recipient_approved',
          },
        },
        {
          type: 'match_created',
          requesterDisplayName: 'Cedar Scout 123',
          targetDisplayName: 'Orbit Builder 456',
          requesterMarkerSlug: 'stored-public-cedar',
          targetMarkerSlug: 'stored-public-orbit',
          payload: {
            matchKind: 'recipient_approved',
          },
        },
      ],
    });
    expect(JSON.stringify(projection.eventActivity)).not.toContain('sourceIntentId');
    expect(JSON.stringify(projection.eventActivity)).not.toContain('eventConnectionIntents');
    expect(JSON.stringify(projection.eventActivity)).not.toContain('eventAgents:');
  });

  test('keeps existing approved event agents without stored marker slugs visible', async () => {
    const ctx = createMockCtx({
      eventAgents: [
        eventAgent(
          'eventAgents:legacy',
          'demo-event',
          'legacy-private-id',
          'Legacy Scout 321',
          'approved',
          10,
        ),
      ],
      eventNetworkingCards: [
        eventCard('eventNetworkingCards:legacy', 'demo-event', 'eventAgents:legacy', 'approved', 20),
      ],
    });

    const projection = await getTownProjectionHandler(ctx as any, {
      worldId: 'worlds:1' as any,
      eventId: 'demo-event',
    });

    expect(projection.agents).toHaveLength(1);
    expect(projection.agents[0]).toMatchObject({
      source: 'event',
      eventId: 'demo-event',
      slug: expect.stringMatching(/^legacy-event-marker-[a-z0-9]+$/),
      displayName: 'Legacy Scout 321',
    });
    const serialized = JSON.stringify(projection.agents);
    expect(serialized).not.toContain('eventAgents:legacy');
    expect(serialized).not.toContain('legacy-private-id');
    expect(serialized).not.toContain('agentId');
  });
});

function agent(_id: string, slug: string, displayName: string, updatedAt: number) {
  return {
    _id,
    slug,
    displayName,
    description: `${displayName} networking profile`,
    status: 'active',
    createdAt: updatedAt,
    updatedAt,
  };
}

function playerDescription(worldId: string, playerId: string, name: string) {
  return {
    _id: `playerDescriptions:${playerId}`,
    worldId,
    playerId,
    name,
    description: `${name} town agent`,
    character: 'f1',
  };
}

function card(_id: string, agentId: string, title: string, updatedAt: number) {
  return {
    _id,
    agentId,
    type: 'need',
    title,
    summary: `${title} summary`,
    detailsForMatching: `${title} details`,
    tags: [],
    domains: [],
    desiredOutcome: 'Meet',
    status: 'active',
    agentGeneratedAt: updatedAt,
    updatedAt,
  };
}

function recommendation(
  _id: string,
  recipientAgentId: string,
  recipientCardId: string,
  providerAgentId: string,
  providerCardId: string,
  updatedAt: number,
) {
  return {
    _id,
    recipientAgentId,
    recipientCardId,
    providerAgentId,
    providerCardId,
    cardPairKey: `${recipientCardId}:${providerCardId}`,
    status: 'active',
    score: 0.9,
    scoreBreakdown: {},
    createdAt: updatedAt,
    updatedAt,
  };
}

function meeting(
  _id: string,
  status: 'pending' | 'accepted',
  requesterAgentId: string,
  responderAgentId: string,
  updatedAt: number,
) {
  return {
    _id,
    recommendationId: 'recommendations:1',
    requesterAgentId,
    requesterCardId: 'matchCards:1',
    responderAgentId,
    responderCardId: 'matchCards:2',
    cardPairKey: 'matchCards:1:matchCards:2',
    status,
    outreachContext: {
      requesterCardSummary: 'Summary',
      responderCardTitle: 'Title',
      requestedOutcome: 'Meet',
    },
    createdAt: updatedAt,
    updatedAt,
  };
}

function conversation(
  _id: string,
  participantOneAgentId: string,
  participantTwoAgentId: string,
  updatedAt: number,
) {
  return {
    _id,
    meetingId: 'meetings:2',
    participantOneAgentId,
    participantTwoAgentId,
    status: 'open',
    createdAt: updatedAt,
    updatedAt,
  };
}

function introCandidate(
  _id: string,
  requesterAgentId: string,
  responderAgentId: string,
  updatedAt: number,
) {
  return {
    _id,
    meetingId: 'meetings:2',
    conversationId: 'agentConversations:1',
    requesterAgentId,
    requesterCardId: 'matchCards:4',
    responderAgentId,
    responderCardId: 'matchCards:1',
    summary: 'Ready for intro',
    recommendedNextStep: 'Send intro',
    status: 'pending_review',
    createdByAgentId: requesterAgentId,
    qualificationMode: 'explicit_qualification',
    createdAt: updatedAt,
    updatedAt,
  };
}

function eventAgent(
  _id: string,
  eventId: string,
  agentIdentifier: string,
  displayName: string,
  approvalStatus: string,
  updatedAt: number,
  publicMarkerSlug?: string,
) {
  return {
    _id,
    eventId,
    agentIdentifier,
    ...(publicMarkerSlug === undefined ? {} : { publicMarkerSlug }),
    displayName,
    avatarConfig: {
      hair: 'curly',
      skinTone: 'tone-3',
      clothing: 'jacket',
    },
    approvalStatus,
    createdAt: updatedAt,
    updatedAt,
  };
}

function eventCard(
  _id: string,
  eventId: string,
  eventAgentId: string,
  status: string,
  updatedAt: number,
) {
  return {
    _id,
    eventId,
    eventAgentId,
    publicCard: {
      role: 'Founder',
      offers: ['GTM help'],
      wants: [],
      hobbies: [],
      interests: ['energy'],
      favoriteMedia: [],
    },
    status,
    createdAt: updatedAt,
    updatedAt,
  };
}

function eventActivityEvent(
  _id: string,
  eventId: string,
  requesterDisplayName: string,
  targetDisplayName: string,
  requesterMarkerSlug: string,
  targetMarkerSlug: string,
  sourceIntentId: string,
  createdAt: number,
) {
  return {
    _id,
    eventId,
    type: 'match_created',
    requesterDisplayName,
    targetDisplayName,
    requesterMarkerSlug,
    targetMarkerSlug,
    sourceIntentId,
    payload: {
      matchKind: 'recipient_approved',
    },
    createdAt,
    updatedAt: createdAt,
  };
}

function eventActivityAggregate(eventId: string, matchCount: number, updatedAt: number) {
  return {
    _id: `eventActivityAggregates:${eventId}`,
    eventId,
    matchCount,
    createdAt: updatedAt,
    updatedAt,
  };
}
