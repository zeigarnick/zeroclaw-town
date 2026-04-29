import { ConvexError } from 'convex/values';
import { createEventConnectionIntentHandler } from './eventConnectionIntents';
import {
  decideEventConnectionIntentHandler,
  getEventContactRevealHandler,
  upsertEventPrivateContactHandler,
} from './eventContactReveal';

type TableName =
  | 'eventAgents'
  | 'eventNetworkingCards'
  | 'eventConnectionIntents'
  | 'eventRecipientRules'
  | 'eventPrivateContacts'
  | 'eventContactReveals';
type Row = Record<string, any> & { _id: string };

function createMockCtx() {
  const tables: Record<TableName, Row[]> = {
    eventAgents: [],
    eventNetworkingCards: [],
    eventConnectionIntents: [],
    eventRecipientRules: [],
    eventPrivateContacts: [],
    eventContactReveals: [],
  };
  const counters: Record<TableName, number> = {
    eventAgents: 0,
    eventNetworkingCards: 0,
    eventConnectionIntents: 0,
    eventRecipientRules: 0,
    eventPrivateContacts: 0,
    eventContactReveals: 0,
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
    status: 'approved',
    createdAt: now,
    updatedAt: now,
    approvedAt: now,
  });
  await ctx.db.patch(agentId, { activeCardId: cardId });
  return { agentId, cardId };
}

describe('event contact reveal', () => {
  test('reveals private contacts only after recipient approval and only to participants', async () => {
    const { ctx } = createMockCtx();
    const requester = await insertAgentWithCard(ctx, 'requester');
    const target = await insertAgentWithCard(ctx, 'target');

    const intent = await createEventConnectionIntentHandler(ctx as any, {
      eventId: 'demo-event',
      requesterAgentId: requester.agentId as any,
      targetAgentId: target.agentId as any,
    });

    await expect(
      getEventContactRevealHandler(ctx as any, {
        eventId: 'demo-event',
        intentId: intent.id as any,
        viewerAgentId: requester.agentId as any,
      }),
    ).rejects.toMatchObject({
      data: { code: 'event_contact_reveal_not_found' },
    } satisfies Partial<ConvexError<{ code: string }>>);

    await upsertEventPrivateContactHandler(ctx as any, {
      eventId: 'demo-event',
      eventAgentId: requester.agentId as any,
      contact: {
        email: 'requester@example.com',
        linkedin: 'https://linkedin.com/in/requester',
      },
    });
    await upsertEventPrivateContactHandler(ctx as any, {
      eventId: 'demo-event',
      eventAgentId: target.agentId as any,
      contact: {
        email: 'target@example.com',
        website: 'https://target.example',
      },
    });

    const decision = await decideEventConnectionIntentHandler(ctx as any, {
      eventId: 'demo-event',
      intentId: intent.id as any,
      recipientAgentId: target.agentId as any,
      decision: 'approve',
    });

    expect(decision.intent.status).toBe('recipient_approved');
    expect(decision.reveal).toMatchObject({
      requesterContact: {
        email: 'requester@example.com',
      },
      targetContact: {
        email: 'target@example.com',
      },
    });

    await expect(
      getEventContactRevealHandler(ctx as any, {
        eventId: 'demo-event',
        intentId: intent.id as any,
        viewerAgentId: requester.agentId as any,
      }),
    ).resolves.toMatchObject({
      requesterContact: {
        email: 'requester@example.com',
      },
      targetContact: {
        website: 'https://target.example',
      },
    });

    const outsider = await insertAgentWithCard(ctx, 'outsider');
    await expect(
      getEventContactRevealHandler(ctx as any, {
        eventId: 'demo-event',
        intentId: intent.id as any,
        viewerAgentId: outsider.agentId as any,
      }),
    ).rejects.toMatchObject({
      data: { code: 'event_connection_intent_access_denied' },
    } satisfies Partial<ConvexError<{ code: string }>>);
  });

  test('declines pending intents without creating a reveal', async () => {
    const { ctx, tables } = createMockCtx();
    const requester = await insertAgentWithCard(ctx, 'requester');
    const target = await insertAgentWithCard(ctx, 'target');
    const intent = await createEventConnectionIntentHandler(ctx as any, {
      eventId: 'demo-event',
      requesterAgentId: requester.agentId as any,
      targetAgentId: target.agentId as any,
    });

    const decision = await decideEventConnectionIntentHandler(ctx as any, {
      eventId: 'demo-event',
      intentId: intent.id as any,
      recipientAgentId: target.agentId as any,
      decision: 'decline',
    });

    expect(decision.intent.status).toBe('recipient_declined');
    expect(decision.reveal).toBeNull();
    expect(tables.eventContactReveals).toHaveLength(0);
  });
});
