import { ConvexError } from 'convex/values';
import { registerEventAgentHandler } from './eventAgents';
import { createEventConnectionIntentHandler } from './eventConnectionIntents';
import { searchEventDirectoryHandler } from './eventDirectory';
import {
  resetEventRateLimitTestState,
  setEventRateLimitTestOverride,
} from './eventRateLimits';
import { hashSecret } from './auth';

type TableName =
  | 'eventSpaces'
  | 'eventAgents'
  | 'eventNetworkingCards'
  | 'eventOwnerSessions'
  | 'eventOrganizerAuditEvents'
  | 'eventConnectionIntents'
  | 'eventRecipientRules';
type Row = Record<string, any> & { _id: string };

function createMockCtx() {
  const tables: Record<TableName, Row[]> = {
    eventSpaces: [],
    eventAgents: [],
    eventNetworkingCards: [],
    eventOwnerSessions: [],
    eventOrganizerAuditEvents: [],
    eventConnectionIntents: [],
    eventRecipientRules: [],
  };
  const counters: Record<TableName, number> = {
    eventSpaces: 0,
    eventAgents: 0,
    eventNetworkingCards: 0,
    eventOwnerSessions: 0,
    eventOrganizerAuditEvents: 0,
    eventConnectionIntents: 0,
    eventRecipientRules: 0,
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

function findById(tables: Record<TableName, Row[]>, id: string) {
  return Object.values(tables)
    .flat()
    .find((row) => row._id === id);
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

function publicCard() {
  return {
    role: 'Founder',
    category: 'Climate',
    offers: ['GTM help'],
    wants: ['seed feedback'],
    lookingFor: 'Climate operators',
    hobbies: ['cycling'],
    interests: ['energy'],
    favoriteMedia: ['The Expanse'],
  };
}

async function insertApprovedAgent(
  ctx: ReturnType<typeof createMockCtx>['ctx'],
  label: string,
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
    publicCard: publicCard(),
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

describe('event rate limits', () => {
  beforeEach(() => {
    resetEventRateLimitTestState();
  });

  afterEach(() => {
    resetEventRateLimitTestState();
  });

  test('allows event registrations under the configured limit and blocks stable excess', async () => {
    const { ctx } = createMockCtx();
    setEventRateLimitTestOverride('eventRegistrationPerRequester', {
      kind: 'fixed window',
      rate: 1,
      period: 60_000,
    });

    await expect(
      registerEventAgentHandler(ctx as any, {
        eventId: 'demo-event',
        agentIdentifier: 'attendee-agent',
        publicCard: publicCard(),
      }),
    ).resolves.toMatchObject({ agentIdentifier: 'attendee-agent' });

    await expect(
      registerEventAgentHandler(ctx as any, {
        eventId: 'demo-event',
        agentIdentifier: 'attendee-agent',
        publicCard: publicCard(),
      }),
    ).rejects.toMatchObject({
      data: { code: 'event_rate_limited' },
    } satisfies Partial<ConvexError<{ code: string }>>);
  });

  test('limits directory search by event and filter signature', async () => {
    const { ctx } = createMockCtx();
    await insertApprovedAgent(ctx, 'requester');
    setEventRateLimitTestOverride('eventDirectorySearch', {
      kind: 'fixed window',
      rate: 1,
      period: 60_000,
    });

    await expect(
      searchEventDirectoryHandler(ctx as any, {
        eventId: 'demo-event',
        filters: { q: 'climate' },
      }),
    ).resolves.toHaveLength(1);

    await expect(
      searchEventDirectoryHandler(ctx as any, {
        eventId: 'demo-event',
        filters: { q: 'climate' },
      }),
    ).rejects.toMatchObject({
      data: { code: 'event_rate_limited' },
    } satisfies Partial<ConvexError<{ code: string }>>);
  });

  test('limits connection intent creation before duplicate checks', async () => {
    const { ctx } = createMockCtx();
    const requester = await insertApprovedAgent(ctx, 'requester');
    const target = await insertApprovedAgent(ctx, 'target');
    setEventRateLimitTestOverride('eventConnectionIntent', {
      kind: 'fixed window',
      rate: 1,
      period: 60_000,
    });

    await expect(
      createEventConnectionIntentHandler(ctx as any, {
        eventId: 'demo-event',
        requesterAgentId: requester.agentId as any,
        targetAgentId: target.agentId as any,
        requesterOwnerSessionToken: requester.ownerSessionToken,
      }),
    ).resolves.toMatchObject({ status: 'pending_recipient_review' });

    await expect(
      createEventConnectionIntentHandler(ctx as any, {
        eventId: 'demo-event',
        requesterAgentId: requester.agentId as any,
        targetAgentId: target.agentId as any,
        requesterOwnerSessionToken: requester.ownerSessionToken,
      }),
    ).rejects.toMatchObject({
      data: { code: 'event_rate_limited' },
    } satisfies Partial<ConvexError<{ code: string }>>);
  });
});
