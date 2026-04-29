import { ConvexError } from 'convex/values';
import {
  createEventConnectionIntentHandler,
  listEventInboundIntentsHandler,
} from './eventConnectionIntents';
import { upsertEventRecipientRulesHandler } from './eventRecipientRules';
import { hashSecret } from './auth';

type TableName =
  | 'eventAgents'
  | 'eventNetworkingCards'
  | 'eventConnectionIntents'
  | 'eventRecipientRules'
  | 'eventOwnerSessions';
type Row = Record<string, any> & { _id: string };

function createMockCtx() {
  const tables: Record<TableName, Row[]> = {
    eventAgents: [],
    eventNetworkingCards: [],
    eventConnectionIntents: [],
    eventRecipientRules: [],
    eventOwnerSessions: [],
  };
  const counters: Record<TableName, number> = {
    eventAgents: 0,
    eventNetworkingCards: 0,
    eventConnectionIntents: 0,
    eventRecipientRules: 0,
    eventOwnerSessions: 0,
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
          filters.every(({ field, value }) => valuesEqual(row[field], value)),
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

function valuesEqual(left: any, right: any) {
  if (left instanceof ArrayBuffer && right instanceof ArrayBuffer) {
    return buffersEqual(left, right);
  }
  return left === right;
}

function buffersEqual(left: ArrayBuffer, right: ArrayBuffer) {
  if (left.byteLength !== right.byteLength) {
    return false;
  }
  const leftBytes = new Uint8Array(left);
  const rightBytes = new Uint8Array(right);
  return leftBytes.every((byte, index) => byte === rightBytes[index]);
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
  const ownerSessionToken = `event_owner_${overrides.agentIdentifier ?? now}`;
  const ownerSessionId = await ctx.db.insert('eventOwnerSessions', {
    eventId,
    eventAgentId: agentId,
    cardId,
    sessionTokenHash: await hashSecret(ownerSessionToken),
    status: overrides.ownerSessionStatus ?? 'approved',
    createdAt: now,
    updatedAt: now,
    decidedAt: now,
  });
  await ctx.db.patch(agentId, { ownerSessionId });
  return { agentId, cardId, ownerSessionToken };
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
      requesterOwnerSessionToken: requester.ownerSessionToken,
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
        requesterOwnerSessionToken: requester.ownerSessionToken,
      }),
    ).rejects.toMatchObject({
      data: { code: 'event_agent_not_found' },
    } satisfies Partial<ConvexError<{ code: string }>>);

    await expect(
      createEventConnectionIntentHandler(ctx as any, {
        eventId: 'demo-event',
        requesterAgentId: requester.agentId as any,
        targetAgentId: pendingTarget.agentId as any,
        requesterOwnerSessionToken: requester.ownerSessionToken,
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
        requesterOwnerSessionToken: requester.ownerSessionToken,
      }),
    ).rejects.toMatchObject({
      data: { code: 'invalid_event_connection_intent' },
    } satisfies Partial<ConvexError<{ code: string }>>);

    await createEventConnectionIntentHandler(ctx as any, {
      eventId: 'demo-event',
      requesterAgentId: requester.agentId as any,
      targetAgentId: target.agentId as any,
      requesterOwnerSessionToken: requester.ownerSessionToken,
    });

    await expect(
      createEventConnectionIntentHandler(ctx as any, {
        eventId: 'demo-event',
        requesterAgentId: requester.agentId as any,
        targetAgentId: target.agentId as any,
        requesterOwnerSessionToken: requester.ownerSessionToken,
      }),
    ).rejects.toMatchObject({
      data: { code: 'duplicate_event_connection_intent' },
    } satisfies Partial<ConvexError<{ code: string }>>);
  });

  test('applies recipient rules and excludes auto-rejected intents from inbound review', async () => {
    const { ctx, tables } = createMockCtx();
    const requester = await insertAgentWithCard(ctx, { agentIdentifier: 'requester' });
    const blockedRequester = await insertAgentWithCard(ctx, { agentIdentifier: 'blocked' });
    const target = await insertAgentWithCard(ctx, { agentIdentifier: 'target' });

    await upsertEventRecipientRulesHandler(ctx as any, {
      eventId: 'demo-event',
      eventAgentId: target.agentId as any,
      ownerSessionToken: target.ownerSessionToken,
      rules: {
        blockedAgentIds: [blockedRequester.agentId as any],
        requiredKeywords: ['climate'],
      },
    });

    const allowed = await createEventConnectionIntentHandler(ctx as any, {
      eventId: 'demo-event',
      requesterAgentId: requester.agentId as any,
      targetAgentId: target.agentId as any,
      requesterOwnerSessionToken: requester.ownerSessionToken,
    });
    const rejected = await createEventConnectionIntentHandler(ctx as any, {
      eventId: 'demo-event',
      requesterAgentId: blockedRequester.agentId as any,
      targetAgentId: target.agentId as any,
      requesterOwnerSessionToken: blockedRequester.ownerSessionToken,
    });

    expect(allowed.status).toBe('pending_recipient_review');
    expect(allowed.filterResult.reasons).toEqual(['recipient_rules_allowed']);
    expect(rejected.status).toBe('auto_rejected');
    expect(rejected.filterResult.reasons).toEqual(['requester_blocked_by_recipient_rule']);

    const inbound = await listEventInboundIntentsHandler(ctx as any, {
      eventId: 'demo-event',
      targetAgentId: target.agentId as any,
      ownerSessionToken: target.ownerSessionToken,
    });

    expect(inbound).toHaveLength(1);
    expect(inbound[0].intent.id).toBe(tables.eventConnectionIntents[0]._id);
    expect(inbound[0].requester.displayName).toContain('Cedar Scout');
    expect(JSON.stringify(inbound)).not.toContain('agentIdentifier');
    expect(JSON.stringify(inbound)).not.toContain('contact');

    await expect(
      listEventInboundIntentsHandler(ctx as any, {
        eventId: 'demo-event',
        targetAgentId: target.agentId as any,
        ownerSessionToken: requester.ownerSessionToken,
      }),
    ).rejects.toMatchObject({
      data: { code: 'invalid_event_owner_token' },
    } satisfies Partial<ConvexError<{ code: string }>>);
  });

  test('rejects forged requester owner tokens for intent creation', async () => {
    const { ctx } = createMockCtx();
    const requester = await insertAgentWithCard(ctx, { agentIdentifier: 'requester' });
    const target = await insertAgentWithCard(ctx, { agentIdentifier: 'target' });

    await expect(
      createEventConnectionIntentHandler(ctx as any, {
        eventId: 'demo-event',
        requesterAgentId: requester.agentId as any,
        targetAgentId: target.agentId as any,
        requesterOwnerSessionToken: target.ownerSessionToken,
      }),
    ).rejects.toMatchObject({
      data: { code: 'invalid_event_owner_token' },
    } satisfies Partial<ConvexError<{ code: string }>>);
  });
});
