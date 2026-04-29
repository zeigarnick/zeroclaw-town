import { createEventConnectionIntentHandler } from './eventConnectionIntents';
import {
  decideEventConnectionIntentHandler,
  upsertEventPrivateContactHandler,
} from './eventContactReveal';
import { listRecentEventActivityHandler } from './eventActivity';
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
  | 'eventOwnerSessions';
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
    eventOwnerSessions: [],
  };
  const counters: Record<TableName, number> = {
    eventAgents: 0,
    eventNetworkingCards: 0,
    eventConnectionIntents: 0,
    eventRecipientRules: 0,
    eventPrivateContacts: 0,
    eventContactReveals: 0,
    eventActivityEvents: 0,
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
  label: string,
  cardOverrides: Partial<Row['publicCard']> = {},
) {
  const now = 1710000000000;
  const agentId = await ctx.db.insert('eventAgents', {
    eventId: 'demo-event',
    agentIdentifier: label,
    displayName: label,
    avatarConfig: {
      hair: 'curly',
      skinTone: 'tone-3',
      clothing: 'jacket',
    },
    approvalStatus: 'approved',
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
    expect(tables.eventActivityEvents[0]).toMatchObject({
      eventId: 'demo-event',
      type: 'match_created',
      requesterDisplayName: 'Cedar Scout',
      targetDisplayName: 'Orbit Builder',
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
    expect(serialized).not.toContain('sourceIntentId');
    expect(serialized).not.toContain('GTM help');
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
    await expect(
      listRecentEventActivityHandler(ctx as any, { eventId: 'demo-event' }),
    ).resolves.toEqual([]);
  });
});
