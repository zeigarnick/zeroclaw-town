import { ConvexError } from 'convex/values';
import {
  decideOwnerReviewHandler,
  getOwnerReviewHandler,
  listApprovedPublicCardsHandler,
  registerEventAgentHandler,
} from './eventAgents';

type TableName =
  | 'eventSpaces'
  | 'eventAgents'
  | 'eventNetworkingCards'
  | 'eventOwnerSessions';
type Row = Record<string, any> & { _id: string };

function createMockCtx() {
  const tables: Record<TableName, Row[]> = {
    eventSpaces: [],
    eventAgents: [],
    eventNetworkingCards: [],
    eventOwnerSessions: [],
  };
  const counters: Record<TableName, number> = {
    eventSpaces: 0,
    eventAgents: 0,
    eventNetworkingCards: 0,
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
    wants: ['seed investor feedback'],
    lookingFor: 'Climate operators',
    hobbies: ['cycling'],
    interests: ['energy'],
    favoriteMedia: ['The Expanse'],
  };
}

function avatarConfig() {
  return {
    hair: 'curly',
    skinTone: 'tone-3',
    clothing: 'jacket',
    hat: 'cap',
    accessory: 'glasses',
  };
}

describe('event agent handlers', () => {
  test('registers an event-scoped pseudonymous agent with pending owner review', async () => {
    const { ctx, tables } = createMockCtx();

    const registration = await registerEventAgentHandler(ctx as any, {
      eventId: ' Demo Event ',
      agentIdentifier: ' Attendee Agent ',
      publicCard: publicCard(),
      avatarConfig: avatarConfig(),
    });

    expect(registration.eventId).toBe('demo-event');
    expect(registration.agentIdentifier).toBe('attendee-agent');
    expect(registration.displayName).toMatch(/^[A-Za-z]+ [A-Za-z]+ [0-9]{3}$/);
    expect(registration.displayName.toLowerCase()).not.toContain('attendee');
    expect(registration.approvalStatus).toBe('pending_owner_review');
    expect(registration.ownerReviewPath).toMatch(/^\/event-review\/event_owner_/);
    expect(registration.ownerSessionToken).toMatch(/^event_owner_/);

    expect(tables.eventSpaces).toHaveLength(1);
    expect(tables.eventAgents).toHaveLength(1);
    expect(tables.eventNetworkingCards).toHaveLength(1);
    expect(tables.eventOwnerSessions).toHaveLength(1);
    expect(tables.eventAgents[0]).toMatchObject({
      eventId: 'demo-event',
      agentIdentifier: 'attendee-agent',
      approvalStatus: 'pending_owner_review',
      ownerSessionId: tables.eventOwnerSessions[0]._id,
    });
    expect(tables.eventNetworkingCards[0]).toMatchObject({
      eventId: 'demo-event',
      eventAgentId: tables.eventAgents[0]._id,
      status: 'pending_owner_review',
      publicCard: publicCard(),
    });
  });

  test('scopes duplicate agent identifiers by event', async () => {
    const { ctx } = createMockCtx();
    await registerEventAgentHandler(ctx as any, {
      eventId: 'event-a',
      agentIdentifier: 'same-agent',
      publicCard: publicCard(),
    });
    await expect(
      registerEventAgentHandler(ctx as any, {
        eventId: 'event-a',
        agentIdentifier: 'same-agent',
        publicCard: publicCard(),
      }),
    ).rejects.toMatchObject({
      data: { code: 'duplicate_event_agent' },
    } satisfies Partial<ConvexError<{ code: string }>>);

    await expect(
      registerEventAgentHandler(ctx as any, {
        eventId: 'event-b',
        agentIdentifier: 'same-agent',
        publicCard: publicCard(),
      }),
    ).resolves.toMatchObject({
      eventId: 'event-b',
      agentIdentifier: 'same-agent',
    });
  });

  test('rejects public contact and sensitive fields at registration', async () => {
    const { ctx } = createMockCtx();

    await expect(
      registerEventAgentHandler(ctx as any, {
        eventId: 'event-a',
        agentIdentifier: 'contact-agent',
        publicCard: { ...publicCard(), email: 'attendee@example.com' },
      }),
    ).rejects.toMatchObject({
      data: { code: 'contact_field_not_public' },
    } satisfies Partial<ConvexError<{ code: string }>>);

    await expect(
      registerEventAgentHandler(ctx as any, {
        eventId: 'event-a',
        agentIdentifier: 'sensitive-agent',
        publicCard: { ...publicCard(), ethnicity: 'not allowed' },
      }),
    ).rejects.toMatchObject({
      data: { code: 'sensitive_field_not_allowed' },
    } satisfies Partial<ConvexError<{ code: string }>>);
  });

  test('keeps pending cards out of public reads until owner approval', async () => {
    const { ctx } = createMockCtx();
    const registration = await registerEventAgentHandler(ctx as any, {
      eventId: 'event-a',
      agentIdentifier: 'approved-agent',
      publicCard: publicCard(),
      avatarConfig: avatarConfig(),
    });

    await expect(
      listApprovedPublicCardsHandler(ctx as any, { eventId: 'event-a' }),
    ).resolves.toEqual([]);

    const review = await getOwnerReviewHandler(ctx as any, {
      reviewToken: registration.ownerSessionToken,
    });
    expect(review.publicCard).toEqual(publicCard());
    expect(JSON.stringify(review)).not.toContain('email');
    expect(JSON.stringify(review)).not.toContain('company');

    const approved = await decideOwnerReviewHandler(
      ctx as any,
      {
        reviewToken: registration.ownerSessionToken,
      },
      'approved',
    );
    expect(approved.sessionStatus).toBe('approved');

    await expect(
      listApprovedPublicCardsHandler(ctx as any, { eventId: 'event-a' }),
    ).resolves.toEqual([
      expect.objectContaining({
        displayName: registration.displayName,
        publicCard: publicCard(),
        avatarConfig: avatarConfig(),
      }),
    ]);
  });
});
