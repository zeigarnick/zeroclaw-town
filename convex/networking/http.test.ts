import { ConvexError } from 'convex/values';
import { registerAgentHandler, mockClaimAgentHandler } from './agents';
import { handleNetworkingHttpRequest, parseBearerAuthorizationHeader } from './http';

type TableName = 'networkAgents' | 'networkAgentApiKeys' | 'ownerClaims';
type Row = Record<string, any> & { _id: string };

function createMockCtx() {
  const tables: Record<TableName, Row[]> = {
    networkAgents: [],
    networkAgentApiKeys: [],
    ownerClaims: [],
  };
  const counters: Record<TableName, number> = {
    networkAgents: 0,
    networkAgentApiKeys: 0,
    ownerClaims: 0,
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
  return leftBytes.every((byte, index) => byte === new Uint8Array(right)[index]);
}

function tokenFromClaimUrl(claimUrl: string) {
  return claimUrl.split('/').at(-1) ?? '';
}

async function readJson(response: Response) {
  return (await response.json()) as any;
}

describe('networking HTTP helpers', () => {
  test('parses bearer API keys with the required town prefix', () => {
    expect(parseBearerAuthorizationHeader('Bearer town_abc123')).toBe('town_abc123');
    expect(() => parseBearerAuthorizationHeader(null)).toThrow('Authorization header is required');
    expect(() => parseBearerAuthorizationHeader('Bearer other_abc123')).toThrow(
      'Authorization header must be in the form: Bearer town_*.',
    );
  });

  test('mock claim activates a registered agent and verifies the owner claim', async () => {
    const { ctx, tables } = createMockCtx();
    const registration = await registerAgentHandler(ctx as any, {
      slug: 'Mock Owner Agent',
      displayName: 'Mock Owner Agent',
    });

    const result = await mockClaimAgentHandler(ctx as any, {
      claimToken: tokenFromClaimUrl(registration.claimUrl),
      verificationCode: registration.verificationCode,
      xHandle: '@mock_owner',
      owner: { displayName: 'Mock Owner' },
    });

    expect(result.status).toBe('active');
    expect(tables.networkAgents[0].status).toBe('active');
    expect(tables.ownerClaims[0].status).toBe('verified');
    expect(tables.ownerClaims[0].xHandle).toBe('mock_owner');
    expect(tables.ownerClaims[0].xProfileUrl).toBe('https://x.com/mock_owner');
  });

  test('mock claim rejects an invalid verification code with a stable error code', async () => {
    const { ctx } = createMockCtx();
    const registration = await registerAgentHandler(ctx as any, {
      slug: 'bad-code-agent',
      displayName: 'Bad Code Agent',
    });

    await expect(
      mockClaimAgentHandler(ctx as any, {
        claimToken: tokenFromClaimUrl(registration.claimUrl),
        verificationCode: 'town-WRONG1',
        xHandle: '@bad_code',
      }),
    ).rejects.toMatchObject({
      data: { code: 'invalid_verification_code' },
    } satisfies Partial<ConvexError<{ code: string }>>);
  });

  test('wraps representative route successes in JSON envelopes', async () => {
    const calls: Array<{ kind: string; args: any }> = [];
    const response = await handleNetworkingHttpRequest(
      {
        runMutation: async (_funcRef, args) => {
          calls.push({ kind: 'mutation', args });
          return { agentSlug: args.slug, status: 'pending_claim' };
        },
        runQuery: async () => {
          throw new Error('unexpected query');
        },
      },
      new Request('https://town.example/api/v1/agents/register', {
        method: 'POST',
        body: JSON.stringify({ slug: 'route-agent', displayName: 'Route Agent' }),
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(await readJson(response)).toEqual({
      success: true,
      data: { agentSlug: 'route-agent', status: 'pending_claim' },
    });
    expect(calls[0]).toMatchObject({
      kind: 'mutation',
      args: { slug: 'route-agent', displayName: 'Route Agent' },
    });
  });

  test('wraps representative route errors in stable JSON envelopes', async () => {
    const response = await handleNetworkingHttpRequest(
      {
        runMutation: async () => {
          throw new Error('unexpected mutation');
        },
        runQuery: async () => {
          throw new Error('unexpected query');
        },
      },
      new Request('https://town.example/api/v1/cards', {
        method: 'GET',
      }),
    );

    expect(response.status).toBe(401);
    expect(await readJson(response)).toEqual({
      success: false,
      error: {
        code: 'invalid_api_key',
        message: 'Authorization header is required. Expected Bearer town_*.',
      },
    });
  });
});
