import { getTownProjectionHandler } from './townProjection';

type TableName =
  | 'networkAgents'
  | 'playerDescriptions'
  | 'matchCards'
  | 'recommendations'
  | 'meetings'
  | 'agentConversations'
  | 'introCandidates';

type Row = Record<string, any> & { _id: string };

function createMockCtx(tables: Record<TableName, Row[]>) {
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
          collect: async () => rows,
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
