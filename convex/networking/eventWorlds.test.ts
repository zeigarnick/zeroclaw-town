import {
  DEFAULT_EVENT_WORLD_TEMPLATE_ID,
} from './eventWorldTemplates';
import {
  createEventWorld,
  ensureEventSpaceWorld,
} from './eventWorlds';

type TableName = 'eventSpaces' | 'worlds' | 'worldStatus' | 'maps' | 'engines';
type Row = Record<string, any> & { _id: string };

function createMockCtx() {
  const tables: Record<TableName, Row[]> = {
    eventSpaces: [],
    worlds: [],
    worldStatus: [],
    maps: [],
    engines: [],
  };
  const counters: Record<TableName, number> = {
    eventSpaces: 0,
    worlds: 0,
    worldStatus: 0,
    maps: 0,
    engines: 0,
  };
  const scheduled: Array<{ delayMs: number; args: Record<string, any> }> = [];

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
    replace: async (id: string, replacement: Record<string, any>) => {
      const tableName = id.split(':')[0] as TableName;
      const index = tables[tableName].findIndex((row) => row._id === id);
      if (index === -1) {
        throw new Error(`Missing row ${id}`);
      }
      tables[tableName][index] = { _id: id, ...replacement };
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
          unique: async () => rows[0] ?? null,
          collect: async () => rows,
        };
      },
    }),
  };
  const scheduler = {
    runAfter: async (delayMs: number, _functionRef: unknown, args: Record<string, any>) => {
      scheduled.push({ delayMs, args });
    },
  };

  return { ctx: { db, scheduler }, tables, scheduled };
}

function findById(tables: Record<TableName, Row[]>, id: string) {
  return Object.values(tables)
    .flat()
    .find((row) => row._id === id);
}

describe('event worlds', () => {
  test('provisions a default Clawport Terminal world', async () => {
    const { ctx, tables, scheduled } = createMockCtx();

    const eventWorld = await createEventWorld(ctx as any, { now: 123 });

    expect(eventWorld.worldTemplateId).toBe(DEFAULT_EVENT_WORLD_TEMPLATE_ID);
    expect(tables.worlds).toHaveLength(1);
    expect(tables.worldStatus).toEqual([
      expect.objectContaining({
        worldId: eventWorld.worldId,
        engineId: eventWorld.engineId,
        isDefault: false,
        status: 'running',
        lastViewed: 123,
      }),
    ]);
    expect(tables.maps).toEqual([
      expect.objectContaining({
        worldId: eventWorld.worldId,
        width: 24,
        height: 18,
        tileSetUrl: '/ai-town/assets/clawport-terminal/clawport-terminal-tileset.png',
      }),
    ]);
    expect(scheduled).toEqual([
      {
        delayMs: 0,
        args: {
          worldId: eventWorld.worldId,
          generationNumber: 0,
          maxDuration: expect.any(Number),
        },
      },
    ]);
  });

  test('accepts an explicit template selection', async () => {
    const { ctx } = createMockCtx();

    const eventWorld = await createEventWorld(ctx as any, {
      worldTemplateId: 'clawport-terminal',
      now: 456,
    });

    expect(eventWorld.worldTemplateId).toBe('clawport-terminal');
    expect(eventWorld.worldTemplateRevision).toBeDefined();
  });

  test('idempotently reuses an event space world', async () => {
    const { ctx, tables } = createMockCtx();
    const eventWorld = await createEventWorld(ctx as any, { now: 123 });
    const eventSpaceId = await ctx.db.insert('eventSpaces', {
      eventId: 'demo-event',
      title: 'Demo Event',
      worldTemplateId: eventWorld.worldTemplateId,
      worldTemplateRevision: eventWorld.worldTemplateRevision,
      worldId: eventWorld.worldId,
      registrationStatus: 'open',
      createdAt: 123,
      updatedAt: 123,
    });
    const eventSpace = await ctx.db.get(eventSpaceId);

    const ensured = await ensureEventSpaceWorld(ctx as any, eventSpace as any, { now: 789 });

    expect(ensured.worldId).toBe(eventWorld.worldId);
    expect(tables.worlds).toHaveLength(1);
    expect(tables.maps).toHaveLength(1);
  });

  test('refreshes an existing event world when the template revision changes', async () => {
    const { ctx, tables } = createMockCtx();
    const eventWorld = await createEventWorld(ctx as any, { now: 123 });
    const mapId = tables.maps[0]._id;
    tables.maps[0].tileSetUrl = '/ai-town/assets/old-map.png';
    const eventSpaceId = await ctx.db.insert('eventSpaces', {
      eventId: 'demo-event',
      title: 'Demo Event',
      worldTemplateId: eventWorld.worldTemplateId,
      worldId: eventWorld.worldId,
      registrationStatus: 'open',
      createdAt: 123,
      updatedAt: 123,
    });

    const ensured = await ensureEventSpaceWorld(
      ctx as any,
      (await ctx.db.get(eventSpaceId)) as any,
      { now: 456 },
    );

    expect(ensured.worldTemplateRevision).toBe(eventWorld.worldTemplateRevision);
    expect(tables.maps).toHaveLength(1);
    expect(tables.maps[0]).toMatchObject({
      _id: mapId,
      worldId: eventWorld.worldId,
      tileSetUrl: '/ai-town/assets/clawport-terminal/clawport-terminal-tileset.png',
    });
  });

  test('provisions isolated worlds for separate events', async () => {
    const { ctx, tables } = createMockCtx();
    const firstEventSpaceId = await ctx.db.insert('eventSpaces', {
      eventId: 'first-event',
      title: 'First Event',
      registrationStatus: 'open',
      createdAt: 100,
      updatedAt: 100,
    });
    const secondEventSpaceId = await ctx.db.insert('eventSpaces', {
      eventId: 'second-event',
      title: 'Second Event',
      registrationStatus: 'open',
      createdAt: 100,
      updatedAt: 100,
    });

    const first = await ensureEventSpaceWorld(
      ctx as any,
      (await ctx.db.get(firstEventSpaceId)) as any,
      { now: 200 },
    );
    const second = await ensureEventSpaceWorld(
      ctx as any,
      (await ctx.db.get(secondEventSpaceId)) as any,
      { now: 300 },
    );

    expect(first.worldId).toBeDefined();
    expect(second.worldId).toBeDefined();
    expect(first.worldId).not.toBe(second.worldId);
    expect(tables.worlds).toHaveLength(2);
    expect(tables.maps.map((map) => map.worldId).sort()).toEqual(
      [first.worldId, second.worldId].sort(),
    );
  });
});
