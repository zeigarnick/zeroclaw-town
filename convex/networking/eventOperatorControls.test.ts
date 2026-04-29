import { ConvexError } from 'convex/values';
import { createOrganizerInviteHandler, createOrUpdateEventHandler } from './eventOperatorControls';

type TableName =
  | 'eventSpaces'
  | 'eventOrganizerInvites'
  | 'eventOrganizerApiKeys'
  | 'eventOrganizerAuditEvents'
  | 'worlds'
  | 'worldStatus'
  | 'maps'
  | 'engines';
type Row = Record<string, any> & { _id: string };

const OPERATOR_TOKEN = 'operator-secret';

function createMockCtx() {
  const tables: Record<TableName, Row[]> = {
    eventSpaces: [],
    eventOrganizerInvites: [],
    eventOrganizerApiKeys: [],
    eventOrganizerAuditEvents: [],
    worlds: [],
    worldStatus: [],
    maps: [],
    engines: [],
  };
  const counters: Record<TableName, number> = {
    eventSpaces: 0,
    eventOrganizerInvites: 0,
    eventOrganizerApiKeys: 0,
    eventOrganizerAuditEvents: 0,
    worlds: 0,
    worldStatus: 0,
    maps: 0,
    engines: 0,
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
          unique: async () => {
            if (rows.length > 1) {
              throw new Error('Expected unique result');
            }
            return rows[0] ?? null;
          },
        };
      },
    }),
  };

  const scheduler = {
    runAfter: async () => undefined,
  };

  return { ctx: { db, scheduler }, tables };
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

describe('event operator controls', () => {
  const originalOperatorToken = process.env.OPENNETWORK_OPERATOR_TOKEN;

  beforeEach(() => {
    process.env.OPENNETWORK_OPERATOR_TOKEN = OPERATOR_TOKEN;
  });

  afterEach(() => {
    if (originalOperatorToken === undefined) {
      delete process.env.OPENNETWORK_OPERATOR_TOKEN;
    } else {
      process.env.OPENNETWORK_OPERATOR_TOKEN = originalOperatorToken;
    }
  });

  test('creates and updates an event with an isolated world', async () => {
    const { ctx, tables } = createMockCtx();

    const created = await createOrUpdateEventHandler(ctx as any, {
      operatorToken: OPERATOR_TOKEN,
      eventId: ' Demo Event ',
      title: 'Demo Event',
      registrationStatus: 'open',
      skillUrl: 'https://event.example/skill.md',
    });

    expect(created).toMatchObject({
      eventId: 'demo-event',
      title: 'Demo Event',
      registrationStatus: 'open',
      skillUrl: 'https://event.example/skill.md',
      worldTemplateId: 'clawport-terminal',
      worldId: tables.worlds[0]._id,
    });
    expect(tables.worldStatus[0]).toMatchObject({
      worldId: tables.worlds[0]._id,
      isDefault: false,
    });

    const updated = await createOrUpdateEventHandler(ctx as any, {
      operatorToken: OPERATOR_TOKEN,
      eventId: 'demo-event',
      title: 'Updated Demo Event',
      registrationStatus: 'paused',
    });

    expect(updated).toMatchObject({
      eventId: 'demo-event',
      title: 'Updated Demo Event',
      registrationStatus: 'paused',
      worldId: tables.worlds[0]._id,
    });
    expect(tables.eventSpaces).toHaveLength(1);
    expect(tables.eventOrganizerAuditEvents.map((event) => event.type)).toEqual([
      'event_created',
      'event_updated',
    ]);
  });

  test('creates organizer invites with hashed token storage', async () => {
    const { ctx, tables } = createMockCtx();
    await createOrUpdateEventHandler(ctx as any, {
      operatorToken: OPERATOR_TOKEN,
      eventId: 'demo-event',
    });

    const invite = await createOrganizerInviteHandler(ctx as any, {
      operatorToken: OPERATOR_TOKEN,
      eventId: 'demo-event',
      role: 'owner',
      label: 'Primary organizer agent',
      organizerEmail: 'Organizer@Example.com',
      organizerName: 'Event Organizer',
      inviteBaseUrl: 'https://town.example/event-admin/invite',
      expiresInMs: 60_000,
    });

    expect(invite).toMatchObject({
      eventId: 'demo-event',
      inviteId: 'eventOrganizerInvites:1',
      role: 'owner',
      inviteTokenPrefix: expect.any(String),
      expiresAt: expect.any(Number),
    });
    expect(invite.inviteToken).toMatch(/^event_org_invite_/);
    expect(invite.inviteUrl).toBe(
      `https://town.example/event-admin/invite/${encodeURIComponent(invite.inviteToken)}`,
    );
    expect(tables.eventOrganizerInvites[0]).toMatchObject({
      eventId: 'demo-event',
      inviteTokenPrefix: invite.inviteTokenPrefix,
      status: 'pending',
      organizerEmail: 'organizer@example.com',
      organizerName: 'Event Organizer',
    });
    expect(tables.eventOrganizerInvites[0].inviteTokenHash).toBeInstanceOf(ArrayBuffer);
    expect(JSON.stringify(tables.eventOrganizerInvites[0])).not.toContain(invite.inviteToken);
    expect(tables.eventOrganizerAuditEvents.map((event) => event.type)).toContain(
      'organizer_invite_created',
    );
  });

  test('rejects invalid operator tokens', async () => {
    const { ctx } = createMockCtx();

    await expect(
      createOrUpdateEventHandler(ctx as any, {
        operatorToken: 'wrong-token',
        eventId: 'demo-event',
      }),
    ).rejects.toMatchObject({
      data: { code: 'invalid_operator_token' },
    } satisfies Partial<ConvexError<{ code: string }>>);
  });
});
