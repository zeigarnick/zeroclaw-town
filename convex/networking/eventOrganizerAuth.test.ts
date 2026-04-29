import { ConvexError } from 'convex/values';
import { generateEventOrganizerApiKey, generateEventOrganizerInviteToken, hashSecret } from './auth';
import {
  assertPlatformOperatorCapability,
  assertRedeemableEventOrganizerInvite,
  authenticateEventOrganizerApiKey,
  getSecretPrefix,
} from './eventOrganizerAuth';

type TableName = 'eventOrganizerApiKeys' | 'eventOrganizerInvites';
type Row = Record<string, any> & { _id: string };

function createMockCtx() {
  const tables: Record<TableName, Row[]> = {
    eventOrganizerApiKeys: [],
    eventOrganizerInvites: [],
  };
  const counters: Record<TableName, number> = {
    eventOrganizerApiKeys: 0,
    eventOrganizerInvites: 0,
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

async function insertOrganizerKey(
  ctx: ReturnType<typeof createMockCtx>['ctx'],
  apiKey: string,
  overrides: Record<string, any> = {},
) {
  const now = 1777484980000;
  return await ctx.db.insert('eventOrganizerApiKeys', {
    eventId: 'demo-event',
    keyHash: await hashSecret(apiKey),
    keyPrefix: getSecretPrefix(apiKey),
    status: 'active',
    role: 'owner',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  });
}

async function insertOrganizerInvite(
  ctx: ReturnType<typeof createMockCtx>['ctx'],
  inviteToken: string,
  overrides: Record<string, any> = {},
) {
  const now = 1777484980000;
  return await ctx.db.insert('eventOrganizerInvites', {
    eventId: 'demo-event',
    inviteTokenHash: await hashSecret(inviteToken),
    inviteTokenPrefix: getSecretPrefix(inviteToken),
    status: 'pending',
    role: 'owner',
    createdByActorKey: 'configured-platform-operator',
    createdAt: now,
    updatedAt: now,
    expiresAt: now + 60_000,
    ...overrides,
  });
}

describe('event organizer auth', () => {
  const originalOperatorToken = process.env.OPENNETWORK_OPERATOR_TOKEN;

  afterEach(() => {
    if (originalOperatorToken === undefined) {
      delete process.env.OPENNETWORK_OPERATOR_TOKEN;
    } else {
      process.env.OPENNETWORK_OPERATOR_TOKEN = originalOperatorToken;
    }
  });

  test('asserts the configured platform operator token', () => {
    process.env.OPENNETWORK_OPERATOR_TOKEN = 'operator-secret';

    expect(assertPlatformOperatorCapability('operator-secret')).toEqual({
      kind: 'platform_operator',
      actorKey: 'configured-platform-operator',
    });
    expect(() => assertPlatformOperatorCapability('wrong-secret')).toThrow(
      'A configured platform operator bearer token is required.',
    );
  });

  test('authenticates active event-scoped organizer API keys and updates last-used', async () => {
    const { ctx, tables } = createMockCtx();
    const apiKey = generateEventOrganizerApiKey();
    await insertOrganizerKey(ctx, apiKey);

    const actor = await authenticateEventOrganizerApiKey(ctx as any, {
      eventId: 'demo-event',
      organizerApiKey: apiKey,
      now: 1777484990000,
    });

    expect(actor).toMatchObject({
      kind: 'organizer',
      eventId: 'demo-event',
      keyId: 'eventOrganizerApiKeys:1',
      keyPrefix: getSecretPrefix(apiKey),
      role: 'owner',
    });
    expect(tables.eventOrganizerApiKeys[0].lastUsedAt).toBe(1777484990000);
  });

  test('rejects revoked and cross-event organizer API keys', async () => {
    const { ctx } = createMockCtx();
    const revokedKey = generateEventOrganizerApiKey();
    const otherEventKey = generateEventOrganizerApiKey();
    await insertOrganizerKey(ctx, revokedKey, { status: 'revoked' });
    await insertOrganizerKey(ctx, otherEventKey, { eventId: 'other-event' });

    await expect(
      authenticateEventOrganizerApiKey(ctx as any, {
        eventId: 'demo-event',
        organizerApiKey: revokedKey,
      }),
    ).rejects.toMatchObject({
      data: { code: 'event_organizer_key_revoked' },
    } satisfies Partial<ConvexError<{ code: string }>>);

    await expect(
      authenticateEventOrganizerApiKey(ctx as any, {
        eventId: 'demo-event',
        organizerApiKey: otherEventKey,
      }),
    ).rejects.toMatchObject({
      data: { code: 'event_scope_mismatch' },
    } satisfies Partial<ConvexError<{ code: string }>>);
  });

  test('validates redeemable organizer invites', async () => {
    const { ctx } = createMockCtx();
    const inviteToken = generateEventOrganizerInviteToken();
    await insertOrganizerInvite(ctx, inviteToken);

    await expect(
      assertRedeemableEventOrganizerInvite(ctx as any, {
        inviteToken,
        now: 1777484990000,
      }),
    ).resolves.toMatchObject({
      eventId: 'demo-event',
      status: 'pending',
    });
  });

  test('rejects redeemed and expired organizer invites', async () => {
    const { ctx } = createMockCtx();
    const redeemedToken = generateEventOrganizerInviteToken();
    const expiredToken = generateEventOrganizerInviteToken();
    await insertOrganizerInvite(ctx, redeemedToken, { status: 'redeemed' });
    await insertOrganizerInvite(ctx, expiredToken, { expiresAt: 1777484970000 });

    await expect(
      assertRedeemableEventOrganizerInvite(ctx as any, { inviteToken: redeemedToken }),
    ).rejects.toMatchObject({
      data: { code: 'organizer_invite_already_redeemed' },
    } satisfies Partial<ConvexError<{ code: string }>>);

    await expect(
      assertRedeemableEventOrganizerInvite(ctx as any, {
        inviteToken: expiredToken,
        now: 1777484980000,
      }),
    ).rejects.toMatchObject({
      data: { code: 'organizer_invite_expired' },
    } satisfies Partial<ConvexError<{ code: string }>>);
  });
});
