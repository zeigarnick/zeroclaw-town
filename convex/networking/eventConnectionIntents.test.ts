import { ConvexError } from 'convex/values';
import { createEventConnectionIntentHandler } from './eventConnectionIntents';

type TableName = 'eventAgents' | 'eventNetworkingCards' | 'eventConnectionIntents';
type Row = Record<string, any> & { _id: string };

function createMockCtx() {
  const tables: Record<TableName, Row[]> = {
    eventAgents: [],
    eventNetworkingCards: [],
    eventConnectionIntents: [],
  };
  const counters: Record<TableName, number> = {
    eventAgents: 0,
    eventNetworkingCards: 0,
    eventConnectionIntents: 0,
  };

  const db = {
    insert: async (tableName: TableName, document: Record<string, any>) => {
      counters[tableName] += 1;
      const row = { _id: `${tableName}:${counters[tableName]}`, ...document };
      tables[tableName].push(row);
      return row._id;
    },
    patch: async (id: string, patch: Record<string, any>) => {
      const row = findById(tables, id);
      if (!row) {
        throw new Error(`Missing row ${id}`);
      }
      Object.assign(row, patch);
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
          first: async () => rows[0] ?? null,
          collect: async () => rows,
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

async function insertAgentWithCard(
  ctx: ReturnType<typeof createMockCtx>['ctx'],
  overrides: Partial<Row> = {},
) {
  const now = overrides.updatedAt ?? 1710000000000;
  const eventId = overrides.eventId ?? 'demo-event';
  const agentId = await ctx.db.insert('eventAgents', {
    eventId,
    agentIdentifier: overrides.agentIdentifier ?? `agent-${now}`,
    displayName: overrides.displayName ?? `Cedar Scout ${now}`,
    avatarConfig: {
      hair: 'curly',
      skinTone: 'tone-3',
      clothing: 'jacket',
    },
    approvalStatus: overrides.approvalStatus ?? 'approved',
    createdAt: now,
    updatedAt: now,
  });
  const cardId = await ctx.db.insert('eventNetworkingCards', {
    eventId,
    eventAgentId: agentId,
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
    status: overrides.cardStatus ?? 'approved',
    createdAt: now,
    updatedAt: now,
    approvedAt: now,
  });
  await ctx.db.patch(agentId, { activeCardId: cardId });
  return { agentId, cardId };
}

describe('event connection intents', () => {
  test('creates a minimal pending intent for approved agents in one event', async () => {
    const { ctx, tables } = createMockCtx();
    const requester = await insertAgentWithCard(ctx, { agentIdentifier: 'requester' });
    const target = await insertAgentWithCard(ctx, { agentIdentifier: 'target' });

    const intent = await createEventConnectionIntentHandler(ctx as any, {
      eventId: ' Demo Event ',
      requesterAgentId: requester.agentId as any,
      targetAgentId: target.agentId as any,
    });

    expect(intent).toMatchObject({
      eventId: 'demo-event',
      requesterAgentId: requester.agentId,
      targetAgentId: target.agentId,
      status: 'pending_recipient_review',
      filterResult: {
        allowed: true,
        reasons: ['no_recipient_rules_configured'],
      },
    });
    expect(tables.eventConnectionIntents[0]).toMatchObject({
      requesterCardId: requester.cardId,
      targetCardId: target.cardId,
      auditMetadata: {
        source: 'event_connection_intent_api',
        requesterOwnerApprovalExternal: true,
      },
    });
    expect(JSON.stringify(intent)).not.toContain('message');
    expect(JSON.stringify(intent)).not.toContain('contact');
  });

  test('rejects cross-event targets and pending agents', async () => {
    const { ctx } = createMockCtx();
    const requester = await insertAgentWithCard(ctx, { agentIdentifier: 'requester' });
    const otherEventTarget = await insertAgentWithCard(ctx, {
      eventId: 'other-event',
      agentIdentifier: 'other-target',
    });
    const pendingTarget = await insertAgentWithCard(ctx, {
      agentIdentifier: 'pending-target',
      approvalStatus: 'pending_owner_review',
    });

    await expect(
      createEventConnectionIntentHandler(ctx as any, {
        eventId: 'demo-event',
        requesterAgentId: requester.agentId as any,
        targetAgentId: otherEventTarget.agentId as any,
      }),
    ).rejects.toMatchObject({
      data: { code: 'event_agent_not_found' },
    } satisfies Partial<ConvexError<{ code: string }>>);

    await expect(
      createEventConnectionIntentHandler(ctx as any, {
        eventId: 'demo-event',
        requesterAgentId: requester.agentId as any,
        targetAgentId: pendingTarget.agentId as any,
      }),
    ).rejects.toMatchObject({
      data: { code: 'event_agent_not_approved' },
    } satisfies Partial<ConvexError<{ code: string }>>);
  });

  test('rejects self requests and duplicate active intents', async () => {
    const { ctx } = createMockCtx();
    const requester = await insertAgentWithCard(ctx, { agentIdentifier: 'requester' });
    const target = await insertAgentWithCard(ctx, { agentIdentifier: 'target' });

    await expect(
      createEventConnectionIntentHandler(ctx as any, {
        eventId: 'demo-event',
        requesterAgentId: requester.agentId as any,
        targetAgentId: requester.agentId as any,
      }),
    ).rejects.toMatchObject({
      data: { code: 'invalid_event_connection_intent' },
    } satisfies Partial<ConvexError<{ code: string }>>);

    await createEventConnectionIntentHandler(ctx as any, {
      eventId: 'demo-event',
      requesterAgentId: requester.agentId as any,
      targetAgentId: target.agentId as any,
    });

    await expect(
      createEventConnectionIntentHandler(ctx as any, {
        eventId: 'demo-event',
        requesterAgentId: requester.agentId as any,
        targetAgentId: target.agentId as any,
      }),
    ).rejects.toMatchObject({
      data: { code: 'duplicate_event_connection_intent' },
    } satisfies Partial<ConvexError<{ code: string }>>);
  });
});
