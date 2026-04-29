import { ConvexError } from 'convex/values';
import { hashSecret } from './networking/auth';
import {
  assertCurrentConversationParticipant,
  assertPlayerSession,
  eventWorldStatusHandler,
} from './world';

type TableName = 'worlds' | 'playerSessions' | 'eventSpaces' | 'worldStatus';
type Row = Record<string, any> & { _id: string };

function createMockCtx() {
  const tables: Record<TableName, Row[]> = {
    worlds: [
      {
        _id: 'worlds:1',
        players: [
          { id: 'p:1', human: 'player_session_id' },
          { id: 'p:2', human: 'other_session_id' },
        ],
        conversations: [
          {
            id: 'c:1',
            participants: [{ playerId: 'p:1' }, { playerId: 'p:3' }],
          },
        ],
      },
    ],
    playerSessions: [],
    eventSpaces: [],
    worldStatus: [],
  };

  const db = {
    get: async (id: string) => findById(tables, id) ?? null,
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
        return {
          first: async () =>
            tables[tableName].find((row) =>
              filters.every(({ field, value }) => valuesEqual(row[field], value)),
            ) ?? null,
          unique: async () =>
            tables[tableName].find((row) =>
              filters.every(({ field, value }) => valuesEqual(row[field], value)),
            ) ?? null,
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

describe('world player session guards', () => {
  test('accepts only the player owned by the session token', async () => {
    const { ctx, tables } = createMockCtx();
    tables.playerSessions.push({
      _id: 'playerSessions:1',
      worldId: 'worlds:1',
      sessionId: 'player_session_id',
      tokenHash: await hashSecret('secret-token'),
      createdAt: Date.now(),
    });

    const session = await assertPlayerSession(ctx as any, {
      worldId: 'worlds:1' as any,
      playerId: 'p:1',
      sessionToken: 'secret-token',
    });

    expect(session._id).toBe('playerSessions:1');
    expect(tables.playerSessions[0].lastUsedAt).toEqual(expect.any(Number));

    await expect(
      assertPlayerSession(ctx as any, {
        worldId: 'worlds:1' as any,
        playerId: 'p:2',
        sessionToken: 'secret-token',
      }),
    ).rejects.toBeInstanceOf(ConvexError);
  });

  test('requires current conversation membership for conversation inputs', async () => {
    const { ctx } = createMockCtx();

    await expect(
      assertCurrentConversationParticipant(ctx as any, {
        worldId: 'worlds:1' as any,
        playerId: 'p:1',
        conversationId: 'c:1',
      }),
    ).resolves.toBeUndefined();

    await expect(
      assertCurrentConversationParticipant(ctx as any, {
        worldId: 'worlds:1' as any,
        playerId: 'p:2',
        conversationId: 'c:1',
      }),
    ).rejects.toBeInstanceOf(ConvexError);
  });
});

describe('event world status', () => {
  test('resolves world status from the normalized event id', async () => {
    const { ctx, tables } = createMockCtx();
    tables.eventSpaces.push({
      _id: 'eventSpaces:1',
      eventId: 'demo-event',
      title: 'Demo Event',
      worldTemplateId: 'clawport-terminal',
      worldId: 'worlds:1',
      registrationStatus: 'open',
      createdAt: 1,
      updatedAt: 1,
    });
    tables.worldStatus.push({
      _id: 'worldStatus:1',
      worldId: 'worlds:1',
      engineId: 'engines:1',
      isDefault: false,
      lastViewed: 2,
      status: 'running',
    });

    await expect(
      eventWorldStatusHandler(ctx as any, { eventId: ' Demo Event ' }),
    ).resolves.toMatchObject({
      worldId: 'worlds:1',
      engineId: 'engines:1',
      isDefault: false,
    });
  });

  test('does not fall back to the default world when event world is missing', async () => {
    const { ctx } = createMockCtx();

    await expect(
      eventWorldStatusHandler(ctx as any, { eventId: 'missing-event' }),
    ).resolves.toBeNull();
  });
});
