import { evaluateRecipientRules, upsertEventRecipientRulesHandler } from './eventRecipientRules';
import { hashSecret } from './auth';

type TableName = 'eventAgents' | 'eventNetworkingCards' | 'eventRecipientRules' | 'eventOwnerSessions';
type Row = Record<string, any> & { _id: string };

function createMockCtx() {
  const tables: Record<TableName, Row[]> = {
    eventAgents: [],
    eventNetworkingCards: [],
    eventRecipientRules: [],
    eventOwnerSessions: [],
  };
  const counters: Record<TableName, number> = {
    eventAgents: 0,
    eventNetworkingCards: 0,
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

async function insertApprovedAgent(ctx: ReturnType<typeof createMockCtx>['ctx'], label: string) {
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
      category: label === 'requester' ? 'Climate software' : 'Creator tools',
      offers: ['GTM help'],
      wants: ['seed feedback'],
      lookingFor: 'Climate operators',
      hobbies: ['cycling'],
      interests: ['energy'],
      favoriteMedia: ['The Expanse'],
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

describe('event recipient rules', () => {
  test('evaluates allow/block rules against requester approved public card only', async () => {
    const { ctx, tables } = createMockCtx();
    const requesterRef = await insertApprovedAgent(ctx, 'requester');
    const recipientRef = await insertApprovedAgent(ctx, 'recipient');
    const requester = findById(tables, requesterRef.agentId);
    const recipient = findById(tables, recipientRef.agentId);
    const requesterCard = findById(tables, requesterRef.cardId);
    if (!requester || !recipient || !requesterCard) {
      throw new Error('Missing fixture rows');
    }

    await upsertEventRecipientRulesHandler(ctx as any, {
      eventId: 'demo-event',
      eventAgentId: recipientRef.agentId as any,
      ownerSessionToken: recipientRef.ownerSessionToken,
      rules: {
        allowedCategories: ['climate'],
        requiredKeywords: ['operator'],
        blockedKeywords: ['crypto'],
      },
    });

    await expect(
      evaluateRecipientRules(ctx as any, {
        eventId: 'demo-event',
        requesterAgent: requester as any,
        requesterCard: requesterCard as any,
        recipientAgent: recipient as any,
      }),
    ).resolves.toMatchObject({
      allowed: true,
      reasons: ['recipient_rules_allowed'],
    });

    requesterCard.publicCard.category = 'Consumer crypto';
    await expect(
      evaluateRecipientRules(ctx as any, {
        eventId: 'demo-event',
        requesterAgent: requester as any,
        requesterCard: requesterCard as any,
        recipientAgent: recipient as any,
      }),
    ).resolves.toMatchObject({
      allowed: false,
      reasons: [
        'requester_category_not_allowed_by_recipient_rule',
        'requester_public_card_blocked_by_recipient_keyword_rule',
      ],
    });

    expect(JSON.stringify(tables.eventRecipientRules)).not.toContain('email');
    expect(JSON.stringify(tables.eventRecipientRules)).not.toContain('company');
  });

  test('rejects recipient rule mutation with the wrong owner token', async () => {
    const { ctx } = createMockCtx();
    const requesterRef = await insertApprovedAgent(ctx, 'requester');
    const recipientRef = await insertApprovedAgent(ctx, 'recipient');

    await expect(
      upsertEventRecipientRulesHandler(ctx as any, {
        eventId: 'demo-event',
        eventAgentId: recipientRef.agentId as any,
        ownerSessionToken: requesterRef.ownerSessionToken,
        rules: {
          requiredKeywords: ['climate'],
        },
      }),
    ).rejects.toMatchObject({
      data: { code: 'invalid_event_owner_token' },
    });
  });
});
