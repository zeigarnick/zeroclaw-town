import { seedDemoHandler } from './demoSeed';

type TableName =
  | 'networkAgents'
  | 'networkAgentApiKeys'
  | 'ownerClaims'
  | 'matchCards'
  | 'cardEmbeddings'
  | 'recommendations'
  | 'recommendationSuppressions'
  | 'meetings'
  | 'agentConversations'
  | 'agentMessages'
  | 'introCandidates'
  | 'inboxEvents';

type Row = Record<string, any> & { _id: string };

function createMockCtx() {
  const tables: Record<TableName, Row[]> = {
    networkAgents: [],
    networkAgentApiKeys: [],
    ownerClaims: [],
    matchCards: [],
    cardEmbeddings: [],
    recommendations: [],
    recommendationSuppressions: [],
    meetings: [],
    agentConversations: [],
    agentMessages: [],
    introCandidates: [],
    inboxEvents: [],
  };
  const counters: Record<TableName, number> = {
    networkAgents: 0,
    networkAgentApiKeys: 0,
    ownerClaims: 0,
    matchCards: 0,
    cardEmbeddings: 0,
    recommendations: 0,
    recommendationSuppressions: 0,
    meetings: 0,
    agentConversations: 0,
    agentMessages: 0,
    introCandidates: 0,
    inboxEvents: 0,
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
    delete: async (id: string) => {
      const row = findById(tables, id);
      if (!row) {
        throw new Error(`Missing row ${id}`);
      }
      const tableName = id.split(':')[0] as TableName;
      tables[tableName] = tables[tableName].filter((current) => current._id !== id);
    },
    get: async (id: string) => findById(tables, id) ?? null,
    query: (tableName: TableName) => ({
      withIndex: (indexName: string, buildQuery: (q: any) => any) => {
        const filters: Array<{ field: string; value: any }> = [];
        const q = {
          eq: (field: string, value: any) => {
            filters.push({ field, value });
            return q;
          },
        };
        buildQuery(q);

        let rows = tables[tableName]
          .filter((row) => filters.every(({ field, value }) => valuesEqual(row[field], value)))
          .sort((left, right) => compareRowsByIndex(indexName, left, right));

        return {
          first: async () => rows[0] ?? null,
          collect: async () => rows,
          order: (direction: 'asc' | 'desc') => {
            if (direction === 'desc') {
              rows = [...rows].reverse();
            }
            return {
              take: async (limit: number) => rows.slice(0, limit),
              collect: async () => rows,
            };
          },
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

function compareRowsByIndex(indexName: string, left: Row, right: Row) {
  if (indexName.includes('updated_at')) {
    return (left.updatedAt ?? 0) - (right.updatedAt ?? 0);
  }
  if (indexName.includes('created_at')) {
    return (left.createdAt ?? 0) - (right.createdAt ?? 0);
  }
  return 0;
}

function tableCounts(tables: Record<TableName, Row[]>) {
  return Object.fromEntries(
    Object.entries(tables).map(([tableName, rows]) => [tableName, rows.length]),
  );
}

describe('networking demo seed', () => {
  test('creates the demo loop and is rerunnable without duplicate records', async () => {
    const { ctx, tables } = createMockCtx();

    const first = await seedDemoHandler(ctx as any, {});
    const firstCounts = tableCounts(tables);
    const second = await seedDemoHandler(ctx as any, {});
    const secondCounts = tableCounts(tables);

    expect(secondCounts).toEqual(firstCounts);
    expect(tables.networkAgents).toHaveLength(2);
    expect(tables.networkAgentApiKeys).toHaveLength(2);
    expect(tables.ownerClaims).toHaveLength(2);
    expect(tables.matchCards).toHaveLength(2);
    expect(tables.recommendations).toHaveLength(1);
    expect(tables.meetings).toHaveLength(1);
    expect(tables.agentConversations).toHaveLength(1);
    expect(tables.agentMessages).toHaveLength(2);
    expect(tables.introCandidates).toHaveLength(1);
    expect(tables.inboxEvents).toHaveLength(8);

    expect(tables.networkAgents.map((agent) => agent.slug).sort()).toEqual([
      'demo-capital-scout',
      'demo-growth-operator',
    ]);
    expect(tables.networkAgents.every((agent) => agent.status === 'active')).toBe(true);
    expect(tables.matchCards.every((card) => card.status === 'active')).toBe(true);
    expect(tables.recommendations[0].status).toBe('consumed');
    expect(tables.meetings[0].status).toBe('accepted');
    expect(tables.agentConversations[0].status).toBe('closed');
    expect(tables.introCandidates[0].status).toBe('pending_review');
    expect(first.agents[0].apiKey).toBe(second.agents[0].apiKey);
  });
});
