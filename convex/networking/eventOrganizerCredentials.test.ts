import { ConvexError } from 'convex/values';
import {
  generateEventOrganizerApiKey,
  generateEventOrganizerInviteToken,
  getKeyPrefix,
  hashSecret,
} from './auth';
import {
  createOrganizerApiKeyHandler,
  listOrganizerApiKeysHandler,
  operatorListOrganizerApiKeysHandler,
  operatorRevokeOrganizerApiKeyHandler,
  redeemOrganizerInviteHandler,
  revokeOrganizerApiKeyHandler,
} from './eventOrganizerCredentials';

type TableName =
  | 'eventOrganizerInvites'
  | 'eventOrganizerApiKeys'
  | 'eventOrganizerAuditEvents';
type Row = Record<string, any> & { _id: string };

function createMockCtx() {
  const tables: Record<TableName, Row[]> = {
    eventOrganizerInvites: [],
    eventOrganizerApiKeys: [],
    eventOrganizerAuditEvents: [],
  };
  const counters: Record<TableName, number> = {
    eventOrganizerInvites: 0,
    eventOrganizerApiKeys: 0,
    eventOrganizerAuditEvents: 0,
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

async function insertInvite(
  ctx: ReturnType<typeof createMockCtx>['ctx'],
  inviteToken: string,
  overrides: Record<string, any> = {},
) {
  const now = Date.now();
  return await ctx.db.insert('eventOrganizerInvites', {
    eventId: 'demo-event',
    inviteTokenHash: await hashSecret(inviteToken),
    inviteTokenPrefix: getKeyPrefix(inviteToken),
    status: 'pending',
    role: 'owner',
    label: 'Primary organizer',
    createdByActorKey: 'configured-platform-operator',
    createdAt: now,
    updatedAt: now,
    expiresAt: now + 60_000,
    ...overrides,
  });
}

async function insertKey(
  ctx: ReturnType<typeof createMockCtx>['ctx'],
  apiKey: string,
  overrides: Record<string, any> = {},
) {
  const now = 1777484980000;
  return await ctx.db.insert('eventOrganizerApiKeys', {
    eventId: 'demo-event',
    keyHash: await hashSecret(apiKey),
    keyPrefix: getKeyPrefix(apiKey),
    status: 'active',
    role: 'owner',
    label: 'Organizer key',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  });
}

describe('event organizer credentials', () => {
  const originalOperatorToken = process.env.OPENNETWORK_OPERATOR_TOKEN;

  beforeEach(() => {
    process.env.OPENNETWORK_OPERATOR_TOKEN = 'operator-secret';
  });

  afterEach(() => {
    if (originalOperatorToken === undefined) {
      delete process.env.OPENNETWORK_OPERATOR_TOKEN;
    } else {
      process.env.OPENNETWORK_OPERATOR_TOKEN = originalOperatorToken;
    }
  });

  test('redeems an invite into a long-lived organizer API key once', async () => {
    const { ctx, tables } = createMockCtx();
    const inviteToken = generateEventOrganizerInviteToken();
    await insertInvite(ctx, inviteToken);

    const redeemed = await redeemOrganizerInviteHandler(ctx as any, {
      inviteToken,
      label: 'Organizer agent key',
    });

    expect(redeemed).toMatchObject({
      eventId: 'demo-event',
      keyId: 'eventOrganizerApiKeys:1',
      keyPrefix: expect.any(String),
      role: 'owner',
    });
    expect(redeemed.organizerApiKey).toMatch(/^event_org_/);
    expect(tables.eventOrganizerInvites[0]).toMatchObject({
      status: 'redeemed',
      redeemedByKeyId: 'eventOrganizerApiKeys:1',
    });
    expect(tables.eventOrganizerApiKeys[0]).toMatchObject({
      eventId: 'demo-event',
      status: 'active',
      label: 'Organizer agent key',
    });
    expect(JSON.stringify(tables.eventOrganizerApiKeys[0])).not.toContain(
      redeemed.organizerApiKey,
    );
    expect(tables.eventOrganizerAuditEvents[0].type).toBe('organizer_invite_redeemed');
  });

  test('rejects already redeemed invites', async () => {
    const { ctx } = createMockCtx();
    const inviteToken = generateEventOrganizerInviteToken();
    await insertInvite(ctx, inviteToken, { status: 'redeemed' });

    await expect(
      redeemOrganizerInviteHandler(ctx as any, { inviteToken }),
    ).rejects.toMatchObject({
      data: { code: 'organizer_invite_already_redeemed' },
    } satisfies Partial<ConvexError<{ code: string }>>);
  });

  test('lists and creates redacted organizer keys', async () => {
    const { ctx } = createMockCtx();
    const apiKey = generateEventOrganizerApiKey();
    await insertKey(ctx, apiKey);

    const created = await createOrganizerApiKeyHandler(ctx as any, {
      eventId: 'demo-event',
      organizerApiKey: apiKey,
      label: 'Secondary automation key',
    });
    const listed = await listOrganizerApiKeysHandler(ctx as any, {
      eventId: 'demo-event',
      organizerApiKey: apiKey,
    });

    expect(created.organizerApiKey).toMatch(/^event_org_/);
    expect(created).toMatchObject({
      eventId: 'demo-event',
      keyPrefix: expect.any(String),
      label: 'Secondary automation key',
      status: 'active',
    });
    expect(listed).toHaveLength(2);
    expect(JSON.stringify(listed)).not.toContain(apiKey);
    expect(JSON.stringify(listed)).not.toContain(created.organizerApiKey);
  });

  test('blocks viewer keys from listing organizer key inventory', async () => {
    const { ctx } = createMockCtx();
    const viewerKey = generateEventOrganizerApiKey();
    await insertKey(ctx, viewerKey, { role: 'viewer' });

    await expect(
      listOrganizerApiKeysHandler(ctx as any, {
        eventId: 'demo-event',
        organizerApiKey: viewerKey,
      }),
    ).rejects.toMatchObject({
      data: { code: 'event_scope_mismatch' },
    } satisfies Partial<ConvexError<{ code: string }>>);
  });

  test('revokes organizer keys without allowing the last active key to be revoked', async () => {
    const { ctx, tables } = createMockCtx();
    const primaryKey = generateEventOrganizerApiKey();
    const secondaryKey = generateEventOrganizerApiKey();
    await insertKey(ctx, primaryKey);
    const secondaryKeyId = await insertKey(ctx, secondaryKey, { label: 'Secondary' });

    const revoked = await revokeOrganizerApiKeyHandler(ctx as any, {
      eventId: 'demo-event',
      organizerApiKey: primaryKey,
      keyId: secondaryKeyId as any,
    });

    expect(revoked).toMatchObject({
      keyId: secondaryKeyId,
      status: 'revoked',
      revokedAt: expect.any(Number),
    });
    expect(tables.eventOrganizerApiKeys[1].status).toBe('revoked');

    await expect(
      revokeOrganizerApiKeyHandler(ctx as any, {
        eventId: 'demo-event',
        organizerApiKey: primaryKey,
        keyId: tables.eventOrganizerApiKeys[0]._id as any,
      }),
    ).rejects.toMatchObject({
      data: { code: 'invalid_public_field' },
    } satisfies Partial<ConvexError<{ code: string }>>);
  });

  test('lets platform operators list and revoke even the last active organizer key', async () => {
    const { ctx, tables } = createMockCtx();
    const primaryKey = generateEventOrganizerApiKey();
    const primaryKeyId = await insertKey(ctx, primaryKey);

    const listed = await operatorListOrganizerApiKeysHandler(ctx as any, {
      eventId: 'demo-event',
      operatorToken: 'operator-secret',
    });
    const revoked = await operatorRevokeOrganizerApiKeyHandler(ctx as any, {
      eventId: 'demo-event',
      operatorToken: 'operator-secret',
      keyId: primaryKeyId as any,
    });

    expect(listed).toHaveLength(1);
    expect(JSON.stringify(listed)).not.toContain(primaryKey);
    expect(revoked).toMatchObject({
      keyId: primaryKeyId,
      status: 'revoked',
      revokedAt: expect.any(Number),
    });
    expect(tables.eventOrganizerApiKeys[0].status).toBe('revoked');
    expect(tables.eventOrganizerAuditEvents[0]).toMatchObject({
      type: 'organizer_api_key_revoked',
      actorKind: 'platform_operator',
      actorKey: 'configured-platform-operator',
    });
  });
});
