import { createEventConnectionIntentHandler } from './eventConnectionIntents';
import {
  decideEventConnectionIntentHandler,
  upsertEventPrivateContactHandler,
} from './eventContactReveal';
import {
  getEventMatchActivityCount,
  listRecentEventActivityHandler,
  repairEventActivityMarkerSlugsHandler,
} from './eventActivity';
import { upsertEventRecipientRulesHandler } from './eventRecipientRules';
import { hashSecret } from './auth';

type TableName =
  | 'eventAgents'
  | 'eventNetworkingCards'
  | 'eventConnectionIntents'
  | 'eventRecipientRules'
  | 'eventPrivateContacts'
  | 'eventContactReveals'
  | 'eventActivityEvents'
  | 'eventActivityAggregates'
  | 'eventOwnerSessions'
  | 'eventSpaces'
  | 'worldStatus'
  | 'inputs';
type Row = Record<string, any> & { _id: string };

function createMockCtx() {
  const tables: Record<TableName, Row[]> = {
    eventAgents: [],
    eventNetworkingCards: [],
    eventConnectionIntents: [],
    eventRecipientRules: [],
    eventPrivateContacts: [],
    eventContactReveals: [],
    eventActivityEvents: [],
    eventActivityAggregates: [],
    eventOwnerSessions: [],
    eventSpaces: [],
    worldStatus: [],
    inputs: [],
  };
  const counters: Record<TableName, number> = {
    eventAgents: 0,
    eventNetworkingCards: 0,
    eventConnectionIntents: 0,
    eventRecipientRules: 0,
    eventPrivateContacts: 0,
    eventContactReveals: 0,
    eventActivityEvents: 0,
    eventActivityAggregates: 0,
    eventOwnerSessions: 0,
    eventSpaces: 0,
    worldStatus: 0,
    inputs: 0,
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
          unique: async () => rows[0] ?? null,
          collect: async () => rows,
          order: (direction: 'asc' | 'desc') => ({
            first: async () =>
              [...rows].sort((left, right) =>
                direction === 'desc'
                  ? (right.number ?? right.createdAt ?? 0) - (left.number ?? left.createdAt ?? 0)
                  : (left.number ?? left.createdAt ?? 0) - (right.number ?? right.createdAt ?? 0),
              )[0] ?? null,
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
  label: string,
  cardOverrides: Partial<Row['publicCard']> = {},
  options: { omitPublicMarkerSlug?: boolean; townPlayerId?: string } = {},
) {
  const now = 1710000000000;
  const agentId = await ctx.db.insert('eventAgents', {
    eventId: 'demo-event',
    agentIdentifier: label,
    ...(options.omitPublicMarkerSlug
      ? {}
      : {
          publicMarkerSlug: `public-marker-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
        }),
    displayName: label,
    avatarConfig: {
      hair: 'curly',
      skinTone: 'tone-3',
      clothing: 'jacket',
    },
    approvalStatus: 'approved',
    ...(options.townPlayerId ? { townPlayerId: options.townPlayerId } : {}),
    createdAt: now,
    updatedAt: now,
  });
  const cardId = await ctx.db.insert('eventNetworkingCards', {
    eventId: 'demo-event',
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
      ...cardOverrides,
    },
    status: 'approved',
    createdAt: now,
    updatedAt: now,
    approvedAt: now,
  });
  await ctx.db.patch(agentId, { activeCardId: cardId });
  const ownerSessionToken = `event_owner_${label}`;
  const ownerSessionId = await ctx.db.insert('eventOwnerSessions', {
    eventId: 'demo-event',
    eventAgentId: agentId,
    cardId,
    sessionTokenHash: await hashSecret(ownerSessionToken),
    status: 'approved',
    createdAt: now,
    updatedAt: now,
    decidedAt: now,
  });
  await ctx.db.patch(agentId, { ownerSessionId });
  return { agentId, cardId, ownerSessionToken };
}

describe('event activity', () => {
  test('creates and lists display-safe match activity on recipient approval only', async () => {
    const { ctx, tables } = createMockCtx();
    const requester = await insertAgentWithCard(ctx, 'Cedar Scout');
    const target = await insertAgentWithCard(ctx, 'Orbit Builder');
    const intent = await createEventConnectionIntentHandler(ctx as any, {
      eventId: 'demo-event',
      requesterAgentId: requester.agentId as any,
      targetAgentId: target.agentId as any,
      requesterOwnerSessionToken: requester.ownerSessionToken,
    });
    await upsertEventPrivateContactHandler(ctx as any, {
      eventId: 'demo-event',
      eventAgentId: requester.agentId as any,
      ownerSessionToken: requester.ownerSessionToken,
      contact: {
        email: 'requester@example.com',
        linkedin: 'https://linkedin.com/in/requester',
      },
    });
    await upsertEventPrivateContactHandler(ctx as any, {
      eventId: 'demo-event',
      eventAgentId: target.agentId as any,
      ownerSessionToken: target.ownerSessionToken,
      contact: {
        email: 'target@example.com',
        company: 'Private Co',
      },
    });

    await decideEventConnectionIntentHandler(ctx as any, {
      eventId: 'demo-event',
      intentId: intent.id as any,
      ownerSessionToken: target.ownerSessionToken,
      decision: 'approve',
    });

    expect(tables.eventActivityEvents).toHaveLength(1);
    expect(tables.eventActivityAggregates).toEqual([
      expect.objectContaining({
        eventId: 'demo-event',
        matchCount: 1,
      }),
    ]);
    await expect(getEventMatchActivityCount(ctx as any, 'demo-event')).resolves.toBe(1);
    expect(tables.eventActivityEvents[0]).toMatchObject({
      eventId: 'demo-event',
      type: 'match_created',
      requesterDisplayName: 'Cedar Scout',
      targetDisplayName: 'Orbit Builder',
      requesterMarkerSlug: 'public-marker-cedar-scout',
      targetMarkerSlug: 'public-marker-orbit-builder',
      sourceIntentId: intent.id,
      payload: {
        matchKind: 'recipient_approved',
      },
    });

    const activity = await listRecentEventActivityHandler(ctx as any, {
      eventId: 'demo-event',
    });
    expect(activity).toEqual([
      {
        type: 'match_created',
        requesterDisplayName: 'Cedar Scout',
        targetDisplayName: 'Orbit Builder',
        requesterMarkerSlug: 'public-marker-cedar-scout',
        targetMarkerSlug: 'public-marker-orbit-builder',
        payload: {
          matchKind: 'recipient_approved',
        },
        createdAt: expect.any(Number),
        updatedAt: expect.any(Number),
      },
    ]);
    const serialized = JSON.stringify(activity);
    expect(serialized).not.toContain('requester@example.com');
    expect(serialized).not.toContain('target@example.com');
    expect(serialized).not.toContain('Private Co');
    expect(serialized).not.toContain('event_owner_');
    expect(serialized).not.toContain('eventAgents:');
    expect(serialized).not.toContain('event-agent-');
    expect(serialized).not.toContain('sourceIntentId');
    expect(serialized).not.toContain('GTM help');
  });

  test('repairs missing public marker slugs before creating match activity', async () => {
    const { ctx, tables } = createMockCtx();
    const requester = await insertAgentWithCard(ctx, 'Legacy Scout', {}, { omitPublicMarkerSlug: true });
    const target = await insertAgentWithCard(ctx, 'Legacy Builder', {}, { omitPublicMarkerSlug: true });
    const intent = await createEventConnectionIntentHandler(ctx as any, {
      eventId: 'demo-event',
      requesterAgentId: requester.agentId as any,
      targetAgentId: target.agentId as any,
      requesterOwnerSessionToken: requester.ownerSessionToken,
    });

    await decideEventConnectionIntentHandler(ctx as any, {
      eventId: 'demo-event',
      intentId: intent.id as any,
      ownerSessionToken: target.ownerSessionToken,
      decision: 'approve',
    });

    const requesterRow = tables.eventAgents.find((row) => row._id === requester.agentId);
    const targetRow = tables.eventAgents.find((row) => row._id === target.agentId);
    expect(requesterRow?.publicMarkerSlug).toMatch(/^event-marker-[a-z0-9_-]+$/);
    expect(targetRow?.publicMarkerSlug).toMatch(/^event-marker-[a-z0-9_-]+$/);
    expect(tables.eventActivityEvents[0]).toMatchObject({
      requesterMarkerSlug: requesterRow?.publicMarkerSlug,
      targetMarkerSlug: targetRow?.publicMarkerSlug,
    });
    const serialized = JSON.stringify(
      await listRecentEventActivityHandler(ctx as any, { eventId: 'demo-event' }),
    );
    expect(serialized).not.toContain('eventAgents:');
    expect(serialized).not.toContain('eventConnectionIntents');
    expect(serialized).not.toContain('event_owner_');
  });

  test('queues pathfinding movement for matched event town players', async () => {
    const { ctx, tables } = createMockCtx();
    await ctx.db.insert('eventSpaces', {
      eventId: 'demo-event',
      title: 'Demo Event',
      worldId: 'worlds:event',
      registrationStatus: 'open',
      createdAt: 1710000000000,
      updatedAt: 1710000000000,
    });
    await ctx.db.insert('worldStatus', {
      worldId: 'worlds:event',
      engineId: 'engines:event',
      isDefault: false,
      lastViewed: 1710000000000,
      status: 'running',
    });
    const requester = await insertAgentWithCard(ctx, 'Cedar Scout', {}, { townPlayerId: 'p:1' });
    const target = await insertAgentWithCard(ctx, 'Orbit Builder', {}, { townPlayerId: 'p:2' });
    const intent = await createEventConnectionIntentHandler(ctx as any, {
      eventId: 'demo-event',
      requesterAgentId: requester.agentId as any,
      targetAgentId: target.agentId as any,
      requesterOwnerSessionToken: requester.ownerSessionToken,
    });

    await decideEventConnectionIntentHandler(ctx as any, {
      eventId: 'demo-event',
      intentId: intent.id as any,
      ownerSessionToken: target.ownerSessionToken,
      decision: 'approve',
    });

    expect(tables.inputs).toEqual([
      expect.objectContaining({
        engineId: 'engines:event',
        number: 0,
        name: 'moveEventMatchPair',
        args: {
          requesterPlayerId: 'p:1',
          targetPlayerId: 'p:2',
        },
      }),
    ]);
    expect(tables.eventActivityEvents[0]).toMatchObject({
      movementInputId: tables.inputs[0]._id,
      movementQueuedAt: expect.any(Number),
    });
    expect(JSON.stringify(tables.inputs)).not.toContain('eventAgents:');
    expect(JSON.stringify(tables.inputs)).not.toContain('event_owner_');
  });

  test('omits legacy hash-derived marker slugs from activity views until repaired', async () => {
    const { ctx } = createMockCtx();
    await ctx.db.insert('eventActivityEvents', {
      eventId: 'demo-event',
      type: 'match_created',
      requesterDisplayName: 'Cedar Scout',
      targetDisplayName: 'Orbit Builder',
      requesterMarkerSlug: 'event-agent-abc123',
      targetMarkerSlug: 'event-agent-def456',
      sourceIntentId: 'eventConnectionIntents:missing',
      payload: {
        matchKind: 'recipient_approved',
      },
      createdAt: 1710000000000,
      updatedAt: 1710000000000,
    });

    const activity = await listRecentEventActivityHandler(ctx as any, {
      eventId: 'demo-event',
    });

    expect(activity).toEqual([
      expect.not.objectContaining({
        requesterMarkerSlug: expect.any(String),
        targetMarkerSlug: expect.any(String),
      }),
    ]);
    expect(JSON.stringify(activity)).not.toContain('event-agent-');
    expect(JSON.stringify(activity)).not.toContain('eventConnectionIntents');
  });

  test('repairs legacy hash-derived activity marker slugs from source intent participants', async () => {
    const { ctx, tables } = createMockCtx();
    const requester = await insertAgentWithCard(ctx, 'Cedar Scout');
    const target = await insertAgentWithCard(ctx, 'Orbit Builder');
    const intent = await createEventConnectionIntentHandler(ctx as any, {
      eventId: 'demo-event',
      requesterAgentId: requester.agentId as any,
      targetAgentId: target.agentId as any,
      requesterOwnerSessionToken: requester.ownerSessionToken,
    });
    await ctx.db.insert('eventActivityEvents', {
      eventId: 'demo-event',
      type: 'match_created',
      requesterDisplayName: 'Cedar Scout',
      targetDisplayName: 'Orbit Builder',
      requesterMarkerSlug: 'event-agent-abc123',
      targetMarkerSlug: 'event-agent-def456',
      sourceIntentId: intent.id,
      payload: {
        matchKind: 'recipient_approved',
      },
      createdAt: 1710000000000,
      updatedAt: 1710000000000,
    });

    await expect(
      repairEventActivityMarkerSlugsHandler(ctx as any, { eventId: 'demo-event' }),
    ).resolves.toEqual({
      eventId: 'demo-event',
      repairedCount: 1,
      skippedCount: 0,
    });

    expect(tables.eventActivityEvents[0]).toMatchObject({
      requesterMarkerSlug: 'public-marker-cedar-scout',
      targetMarkerSlug: 'public-marker-orbit-builder',
    });
    const serialized = JSON.stringify(
      await listRecentEventActivityHandler(ctx as any, { eventId: 'demo-event' }),
    );
    expect(serialized).toContain('public-marker-cedar-scout');
    expect(serialized).toContain('public-marker-orbit-builder');
    expect(serialized).not.toContain('event-agent-');
    expect(serialized).not.toContain('eventConnectionIntents');
  });

  test('does not create activity for declined or auto-rejected intents', async () => {
    const { ctx, tables } = createMockCtx();
    const requester = await insertAgentWithCard(ctx, 'Cedar Scout');
    const blockedRequester = await insertAgentWithCard(ctx, 'Blocked Scout');
    const target = await insertAgentWithCard(ctx, 'Orbit Builder');

    const pendingIntent = await createEventConnectionIntentHandler(ctx as any, {
      eventId: 'demo-event',
      requesterAgentId: requester.agentId as any,
      targetAgentId: target.agentId as any,
      requesterOwnerSessionToken: requester.ownerSessionToken,
    });
    await decideEventConnectionIntentHandler(ctx as any, {
      eventId: 'demo-event',
      intentId: pendingIntent.id as any,
      ownerSessionToken: target.ownerSessionToken,
      decision: 'decline',
    });

    await upsertEventRecipientRulesHandler(ctx as any, {
      eventId: 'demo-event',
      eventAgentId: target.agentId as any,
      ownerSessionToken: target.ownerSessionToken,
      rules: {
        blockedAgentIds: [blockedRequester.agentId as any],
        allowedCategories: [],
        blockedCategories: [],
        requiredKeywords: [],
        blockedKeywords: [],
      },
    });
    const rejected = await createEventConnectionIntentHandler(ctx as any, {
      eventId: 'demo-event',
      requesterAgentId: blockedRequester.agentId as any,
      targetAgentId: target.agentId as any,
      requesterOwnerSessionToken: blockedRequester.ownerSessionToken,
    });

    expect(rejected.status).toBe('auto_rejected');
    expect(tables.eventActivityEvents).toHaveLength(0);
    expect(tables.eventActivityAggregates).toHaveLength(0);
    await expect(
      listRecentEventActivityHandler(ctx as any, { eventId: 'demo-event' }),
    ).resolves.toEqual([]);
  });

  test('uses bounded recent activity reads while count comes from aggregate rows', async () => {
    const { ctx, tables } = createMockCtx();
    await ctx.db.insert('eventActivityAggregates', {
      eventId: 'demo-event',
      matchCount: 42,
      createdAt: 1710000000000,
      updatedAt: 1710000000042,
    });
    for (let index = 0; index < 8; index += 1) {
      await ctx.db.insert('eventActivityEvents', {
        eventId: 'demo-event',
        type: 'match_created',
        requesterDisplayName: `Scout ${index}`,
        targetDisplayName: `Builder ${index}`,
        sourceIntentId: `eventConnectionIntents:${index}`,
        payload: {
          matchKind: 'recipient_approved',
        },
        createdAt: 1710000000000 + index,
        updatedAt: 1710000000000 + index,
      });
    }

    await expect(getEventMatchActivityCount(ctx as any, 'demo-event')).resolves.toBe(42);
    const recent = await listRecentEventActivityHandler(ctx as any, {
      eventId: 'demo-event',
      limit: 3,
    });

    expect(recent).toHaveLength(3);
    expect(recent.map((activity) => activity.requesterDisplayName)).toEqual([
      'Scout 7',
      'Scout 6',
      'Scout 5',
    ]);
    expect(JSON.stringify(recent)).not.toContain('sourceIntentId');
    expect(JSON.stringify(tables.eventActivityAggregates)).not.toContain('eventConnectionIntents');
  });
});
