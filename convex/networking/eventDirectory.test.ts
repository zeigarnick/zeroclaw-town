import { searchEventDirectoryHandler } from './eventDirectory';

type TableName = 'eventAgents' | 'eventNetworkingCards';
type Row = Record<string, any> & { _id: string };

function createMockCtx() {
  const tables: Record<TableName, Row[]> = {
    eventAgents: [],
    eventNetworkingCards: [],
  };
  const counters: Record<TableName, number> = {
    eventAgents: 0,
    eventNetworkingCards: 0,
  };

  const db = {
    insert: async (tableName: TableName, document: Record<string, any>) => {
      counters[tableName] += 1;
      const row = { _id: `${tableName}:${counters[tableName]}`, ...document };
      tables[tableName].push(row);
      return row._id;
    },
    get: async (id: string) => findById(tables, id) ?? null,
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
          first: async () => rows[0] ?? null,
        };
      },
    }),
  };

  return { ctx: { db }, tables };
}

function findById(tables: Record<TableName, Row[]>, id: string) {
  return Object.values(tables)
    .flat()
    .find((row) => row._id === id);
}

async function insertEventAgent(
  ctx: ReturnType<typeof createMockCtx>['ctx'],
  overrides: Partial<Row> = {},
) {
  const now = overrides.updatedAt ?? 1710000000000;
  const eventAgentId = await ctx.db.insert('eventAgents', {
    eventId: 'demo-event',
    agentIdentifier: 'private-local-id',
    displayName: overrides.displayName ?? 'Cedar Scout 123',
    avatarConfig: {
      hair: 'curly',
      skinTone: 'tone-3',
      clothing: 'jacket',
    },
    approvalStatus: 'approved',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  });
  await ctx.db.insert('eventNetworkingCards', {
    eventId: overrides.eventId ?? 'demo-event',
    eventAgentId,
    publicCard: {
      role: 'Founder',
      category: 'Climate software',
      offers: ['GTM lessons', 'operator intros'],
      wants: ['seed investor feedback'],
      lookingFor: 'People building climate infrastructure',
      hobbies: ['cycling'],
      interests: ['energy', 'hardware'],
      favoriteMedia: ['The Expanse'],
    },
    status: 'approved',
    createdAt: now,
    updatedAt: now,
    approvedAt: now,
  });
  return eventAgentId;
}

describe('event directory search', () => {
  test('returns only approved public card fields and pseudonymous ids for one event', async () => {
    const { ctx } = createMockCtx();
    await insertEventAgent(ctx);
    await insertEventAgent(ctx, {
      eventId: 'other-event',
      displayName: 'Other Event 456',
      agentIdentifier: 'other-private-id',
    });
    await insertEventAgent(ctx, {
      displayName: 'Pending Agent 789',
      approvalStatus: 'pending_owner_review',
      agentIdentifier: 'pending-private-id',
    });

    const results = await searchEventDirectoryHandler(ctx as any, {
      eventId: ' Demo Event ',
    });

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      eventId: 'demo-event',
      displayName: 'Cedar Scout 123',
      publicCard: {
        role: 'Founder',
        category: 'Climate software',
        offers: ['GTM lessons', 'operator intros'],
      },
    });
    expect(JSON.stringify(results)).not.toContain('private-local-id');
    expect(JSON.stringify(results)).not.toContain('ownerSessionId');
    expect(JSON.stringify(results)).not.toContain('reviewToken');
    expect(JSON.stringify(results)).not.toContain('email');
  });

  test('supports text and structured public field filters without embeddings', async () => {
    const { ctx, tables } = createMockCtx();
    await insertEventAgent(ctx);
    await insertEventAgent(ctx, {
      displayName: 'Harbor Builder 456',
      agentIdentifier: 'builder-private-id',
    });
    const secondCard = tables.eventNetworkingCards[1];
    secondCard.publicCard = {
      role: 'Designer',
      category: 'Creator tools',
      offers: ['brand systems'],
      wants: ['prototype feedback'],
      lookingFor: 'Design founders',
      hobbies: ['film'],
      interests: ['interfaces'],
      favoriteMedia: ['Her'],
    };

    await expect(
      searchEventDirectoryHandler(ctx as any, {
        eventId: 'demo-event',
        filters: {
          q: 'climate hardware',
          category: 'Climate',
          offers: ['operator'],
          wants: ['investor'],
          hobbies: ['cycling'],
          interests: ['energy'],
          favoriteMedia: ['expanse'],
        },
      }),
    ).resolves.toEqual([
      expect.objectContaining({
        displayName: 'Cedar Scout 123',
      }),
    ]);

    await expect(
      searchEventDirectoryHandler(ctx as any, {
        eventId: 'demo-event',
        filters: {
          q: 'climate',
          offers: ['brand'],
        },
      }),
    ).resolves.toEqual([]);
  });
});
