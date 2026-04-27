import { ConvexError } from 'convex/values';
import {
  claimAgentForTestingHandler,
  getClaimStatusHandler,
  registerAgentForTestingHandler,
  registerAgentHandler,
} from './agents';
import { getKeyPrefix, hashSecret } from './auth';

type TableName = 'networkAgents' | 'networkAgentApiKeys' | 'ownerClaims' | 'worldStatus';
type Row = Record<string, any> & { _id: string };

function createMockCtx() {
  const tables: Record<TableName, Row[]> = {
    networkAgents: [],
    networkAgentApiKeys: [],
    ownerClaims: [],
    worldStatus: [],
  };
  const counters: Record<TableName, number> = {
    networkAgents: 0,
    networkAgentApiKeys: 0,
    ownerClaims: 0,
    worldStatus: 0,
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
        return {
          first: async () =>
            tables[tableName].find((row) =>
              filters.every(({ field, value }) => valuesEqual(row[field], value)),
            ) ?? null,
          collect: async () =>
            tables[tableName].filter((row) =>
              filters.every(({ field, value }) => valuesEqual(row[field], value)),
            ),
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

function tokenFromClaimUrl(claimUrl: string) {
  return claimUrl.split('/').at(-1) ?? '';
}

describe('networking agent handlers', () => {
  test('public registration creates a pending claim without exposing active credentials', async () => {
    const { ctx, tables } = createMockCtx();

    const result = await registerAgentHandler(ctx as any, {
      slug: ' Zero Claw ',
      displayName: ' ZeroClaw ',
      description: ' autonomous networking agent ',
    });

    expect(result).toMatchObject({
      agentSlug: 'zero-claw',
      status: 'pending_claim',
    });
    expect((result as any).apiKey).toBeUndefined();
    expect((result as any).verificationCode).toBeUndefined();
    expect(result.claimUrl).toMatch(/^https:\/\/agora\.vercel\.app\/claim\/town_claim_/);

    expect(tables.networkAgents).toHaveLength(1);
    expect(tables.networkAgentApiKeys).toHaveLength(0);
    expect(tables.ownerClaims).toHaveLength(1);
    expect(tables.networkAgents[0]).toMatchObject({
      slug: 'zero-claw',
      displayName: 'ZeroClaw',
      description: 'autonomous networking agent',
      status: 'pending_claim',
      ownerClaimId: tables.ownerClaims[0]._id,
    });
    expect(tables.ownerClaims[0]).toMatchObject({
      agentId: tables.networkAgents[0]._id,
      status: 'pending',
    });
  });

  test('testing registration exposes one-time claim code for controlled flows', async () => {
    const { ctx, tables } = createMockCtx();

    const result = await registerAgentForTestingHandler(
      ctx as any,
      {
        slug: ' Zero Claw ',
        displayName: ' ZeroClaw ',
        description: ' autonomous networking agent ',
        claimBaseUrl: 'https://evil.example/claim',
      } as any,
    );

    expect(result.agentSlug).toBe('zero-claw');
    expect(result.claimUrl).toMatch(/^https:\/\/agora\.vercel\.app\/claim\/town_claim_/);
    expect(result.claimUrl).not.toContain('evil.example');
    expect(result.verificationCode).toMatch(/^town-[A-Z2-9]{6}$/);

    expect(tables.networkAgents).toHaveLength(1);
    expect(tables.networkAgentApiKeys).toHaveLength(0);
    expect(tables.ownerClaims).toHaveLength(1);

    const agent = tables.networkAgents[0];
    const claim = tables.ownerClaims[0];
    const claimToken = tokenFromClaimUrl(result.claimUrl);

    expect(agent).toMatchObject({
      slug: 'zero-claw',
      displayName: 'ZeroClaw',
      description: 'autonomous networking agent',
      status: 'pending_claim',
      ownerClaimId: claim._id,
    });
    expect(buffersEqual(claim.claimTokenHash, await hashSecret(claimToken))).toBe(true);
    expect(
      buffersEqual(claim.verificationCodeHash, await hashSecret(result.verificationCode)),
    ).toBe(true);
    expect(claim).toMatchObject({
      agentId: agent._id,
      status: 'pending',
    });
    expect(JSON.stringify(tables)).not.toContain(claimToken);
    expect(JSON.stringify(tables)).not.toContain(result.verificationCode);
  });

  test('reports pending claim status and activates with a one-time API key', async () => {
    const { ctx, tables } = createMockCtx();
    const registration = await registerAgentForTestingHandler(ctx as any, {
      slug: 'zeroclaw',
      displayName: 'ZeroClaw',
    });
    const claimToken = tokenFromClaimUrl(registration.claimUrl);

    await expect(getClaimStatusHandler(ctx as any, { claimToken })).resolves.toMatchObject({
      agentSlug: 'zeroclaw',
      agentDisplayName: 'ZeroClaw',
      agentStatus: 'pending_claim',
      claimStatus: 'pending',
    });

    await expect(
      claimAgentForTestingHandler(ctx as any, {
        claimToken,
        verificationCode: 'town-222222',
        xHandle: '@wrong',
        xProfileUrl: 'https://x.com/wrong',
      }),
    ).rejects.toMatchObject({
      data: { code: 'invalid_verification_code' },
    } satisfies Partial<ConvexError<{ code: string }>>);

    const claimed = await claimAgentForTestingHandler(ctx as any, {
      claimToken,
      verificationCode: registration.verificationCode,
      xHandle: '@zeroclaw',
      xProfileUrl: 'https://x.com/zeroclaw',
      verificationMethod: 'tweet',
    });

    expect(claimed).toMatchObject({
      agentId: registration.agentId,
      agentSlug: 'zeroclaw',
      apiKey: expect.stringMatching(/^town_/),
      status: 'active',
    });
    expect(tables.networkAgentApiKeys).toHaveLength(1);
    expect(tables.networkAgentApiKeys[0]).toMatchObject({
      agentId: registration.agentId,
      keyPrefix: getKeyPrefix(claimed.apiKey),
      status: 'active',
    });
    expect(
      buffersEqual(tables.networkAgentApiKeys[0].keyHash, await hashSecret(claimed.apiKey)),
    ).toBe(true);
    expect(tables.networkAgents[0]).toMatchObject({
      status: 'active',
      ownerClaimId: claimed.ownerClaimId,
    });
    expect(tables.ownerClaims[0]).toMatchObject({
      status: 'verified',
      xHandle: 'zeroclaw',
      xProfileUrl: 'https://x.com/zeroclaw',
      verificationMethod: 'tweet',
    });

    await expect(
      claimAgentForTestingHandler(ctx as any, {
        claimToken,
        verificationCode: registration.verificationCode,
        xHandle: '@zeroclaw-again',
        xProfileUrl: 'https://x.com/zeroclaw-again',
      }),
    ).rejects.toMatchObject({
      data: { code: 'invalid_claim_status' },
    } satisfies Partial<ConvexError<{ code: string }>>);

    await expect(getClaimStatusHandler(ctx as any, { claimToken })).resolves.toMatchObject({
      agentStatus: 'active',
      claimStatus: 'verified',
      xHandle: 'zeroclaw',
      xProfileUrl: 'https://x.com/zeroclaw',
      verificationMethod: 'tweet',
    });
  });
});
