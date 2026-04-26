import { ConvexError } from 'convex/values';
import { claimAgentForTestingHandler, registerAgentHandler } from './agents';
import {
  createCardHandler,
  deleteCardHandler,
  getCanonicalCardTextForEmbedding,
  listCardsHandler,
  pauseCardHandler,
  updateCardHandler,
} from './cards';
import { MAX_CARD_DETAILS_LENGTH, MAX_CARD_SUMMARY_LENGTH } from './validators';

type TableName = 'networkAgents' | 'networkAgentApiKeys' | 'ownerClaims' | 'matchCards';
type Row = Record<string, any> & { _id: string };

function createMockCtx() {
  const tables: Record<TableName, Row[]> = {
    networkAgents: [],
    networkAgentApiKeys: [],
    ownerClaims: [],
    matchCards: [],
  };
  const counters: Record<TableName, number> = {
    networkAgents: 0,
    networkAgentApiKeys: 0,
    ownerClaims: 0,
    matchCards: 0,
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

        const rows = tables[tableName]
          .filter((row) => filters.every(({ field, value }) => valuesEqual(row[field], value)))
          .sort((left, right) => compareRowsByIndex(indexName, left, right));

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

function compareRowsByIndex(indexName: string, left: Row, right: Row) {
  if (indexName === 'by_agent' || indexName === 'by_status_updated_at') {
    return (left.updatedAt ?? 0) - (right.updatedAt ?? 0);
  }
  return 0;
}

function tokenFromClaimUrl(claimUrl: string) {
  return claimUrl.split('/').at(-1) ?? '';
}

async function registerPendingAgent(ctx: any, slug: string) {
  return await registerAgentHandler(ctx, {
    slug,
    displayName: slug,
  });
}

async function registerClaimedAgent(ctx: any, slug: string) {
  const registration = await registerPendingAgent(ctx, slug);
  await claimAgentForTestingHandler(ctx, {
    claimToken: tokenFromClaimUrl(registration.claimUrl),
    verificationCode: registration.verificationCode,
    xHandle: `@${slug}`,
    xProfileUrl: `https://x.com/${slug}`,
  });
  return registration;
}

function expectErrorCode(error: unknown, code: string) {
  expect((error as ConvexError<{ code: string }>).data.code).toBe(code);
}

describe('networking cards handlers', () => {
  test('supports create/update/pause/list/delete lifecycle for claimed agents', async () => {
    const { ctx } = createMockCtx();
    const registration = await registerClaimedAgent(ctx, 'agent-lifecycle');

    const created = await createCardHandler(ctx as any, {
      apiKey: registration.apiKey,
      type: 'offer',
      title: ' Build analytics pipelines ',
      summary: ' We can help with ETL and observability. ',
      detailsForMatching: 'Hands-on data stack implementation and migration support.',
      tags: ['data', 'etl'],
      domains: ['saas'],
      desiredOutcome: 'Book a discovery call',
    });
    expect(created.status).toBe('draft');
    expect(created.title).toBe('Build analytics pipelines');

    const activated = await updateCardHandler(ctx as any, {
      apiKey: registration.apiKey,
      cardId: created._id as any,
      status: 'active',
      summary: 'End-to-end ETL and observability for SaaS teams.',
    });
    expect(activated.status).toBe('active');
    expect(activated.summary).toBe('End-to-end ETL and observability for SaaS teams.');

    const paused = await pauseCardHandler(ctx as any, {
      apiKey: registration.apiKey,
      cardId: created._id as any,
    });
    expect(paused.status).toBe('paused');

    const listed = await listCardsHandler(ctx as any, {
      apiKey: registration.apiKey,
    });
    expect(listed).toHaveLength(1);
    expect(listed[0]._id).toBe(created._id);

    const deleted = await deleteCardHandler(ctx as any, {
      apiKey: registration.apiKey,
      cardId: created._id as any,
    });
    expect(deleted).toEqual({
      deleted: true,
      cardId: created._id,
    });

    await expect(
      listCardsHandler(ctx as any, {
        apiKey: registration.apiKey,
      }),
    ).resolves.toHaveLength(0);
  });

  test('enforces the three-active-card limit while excluding draft and paused cards', async () => {
    const { ctx } = createMockCtx();
    const registration = await registerClaimedAgent(ctx, 'agent-limit');

    await createCardHandler(ctx as any, {
      apiKey: registration.apiKey,
      type: 'need',
      title: 'Need 1',
      summary: 'Need summary 1',
      detailsForMatching: 'Need details 1',
      tags: [],
      domains: [],
      desiredOutcome: 'Outcome',
      status: 'active',
    });
    await createCardHandler(ctx as any, {
      apiKey: registration.apiKey,
      type: 'offer',
      title: 'Offer 1',
      summary: 'Offer summary 1',
      detailsForMatching: 'Offer details 1',
      tags: [],
      domains: [],
      desiredOutcome: 'Outcome',
      status: 'active',
    });
    await createCardHandler(ctx as any, {
      apiKey: registration.apiKey,
      type: 'exchange',
      title: 'Draft exchange',
      summary: 'Draft exchange summary',
      detailsForMatching: 'Draft exchange details',
      tags: [],
      domains: [],
      desiredOutcome: 'Outcome',
      status: 'draft',
    });
    await createCardHandler(ctx as any, {
      apiKey: registration.apiKey,
      type: 'offer',
      title: 'Paused offer',
      summary: 'Paused offer summary',
      detailsForMatching: 'Paused offer details',
      tags: [],
      domains: [],
      desiredOutcome: 'Outcome',
      status: 'paused',
    });

    await expect(
      createCardHandler(ctx as any, {
        apiKey: registration.apiKey,
        type: 'exchange',
        title: 'Active 3',
        summary: 'Third active summary',
        detailsForMatching: 'Third active details',
        tags: [],
        domains: [],
        desiredOutcome: 'Outcome',
        status: 'active',
      }),
    ).resolves.toMatchObject({ status: 'active' });

    await expect(
      createCardHandler(ctx as any, {
        apiKey: registration.apiKey,
        type: 'need',
        title: 'Active 4',
        summary: 'Fourth active summary',
        detailsForMatching: 'Fourth active details',
        tags: [],
        domains: [],
        desiredOutcome: 'Outcome',
        status: 'active',
      }),
    ).rejects.toMatchObject({
      data: { code: 'active_card_limit' },
    } satisfies Partial<ConvexError<{ code: string }>>);
  });

  test('rejects invalid card type, status, and oversized or missing text with stable codes', async () => {
    const { ctx } = createMockCtx();
    const registration = await registerClaimedAgent(ctx, 'agent-validation');

    await expect(
      createCardHandler(ctx as any, {
        apiKey: registration.apiKey,
        type: 'unknown',
        title: 'Invalid type',
        summary: 'summary',
        detailsForMatching: 'details',
        tags: [],
        domains: [],
        desiredOutcome: 'outcome',
      }),
    ).rejects.toMatchObject({
      data: { code: 'invalid_card_type' },
    } satisfies Partial<ConvexError<{ code: string }>>);

    await expect(
      createCardHandler(ctx as any, {
        apiKey: registration.apiKey,
        type: 'need',
        status: 'not-a-status',
        title: 'Invalid status',
        summary: 'summary',
        detailsForMatching: 'details',
        tags: [],
        domains: [],
        desiredOutcome: 'outcome',
      }),
    ).rejects.toMatchObject({
      data: { code: 'invalid_card_status' },
    } satisfies Partial<ConvexError<{ code: string }>>);

    await expect(
      createCardHandler(ctx as any, {
        apiKey: registration.apiKey,
        type: 'need',
        title: '   ',
        summary: 'summary',
        detailsForMatching: 'details',
        tags: [],
        domains: [],
        desiredOutcome: 'outcome',
      }),
    ).rejects.toMatchObject({
      data: { code: 'empty_card_text' },
    } satisfies Partial<ConvexError<{ code: string }>>);

    await expect(
      createCardHandler(ctx as any, {
        apiKey: registration.apiKey,
        type: 'need',
        title: 'Need title',
        summary: 'x'.repeat(MAX_CARD_SUMMARY_LENGTH + 1),
        detailsForMatching: 'details',
        tags: [],
        domains: [],
        desiredOutcome: 'outcome',
      }),
    ).rejects.toMatchObject({
      data: { code: 'summary_too_long' },
    } satisfies Partial<ConvexError<{ code: string }>>);

    await expect(
      createCardHandler(ctx as any, {
        apiKey: registration.apiKey,
        type: 'need',
        title: 'Need title',
        summary: 'summary',
        detailsForMatching: 'x'.repeat(MAX_CARD_DETAILS_LENGTH + 1),
        tags: [],
        domains: [],
        desiredOutcome: 'outcome',
      }),
    ).rejects.toMatchObject({
      data: { code: 'details_too_long' },
    } satisfies Partial<ConvexError<{ code: string }>>);
  });

  test('rejects unclaimed activation and updating active cards', async () => {
    const { ctx, tables } = createMockCtx();
    const pending = await registerPendingAgent(ctx, 'agent-pending');

    await expect(
      createCardHandler(ctx as any, {
        apiKey: pending.apiKey,
        type: 'need',
        title: 'Need title',
        summary: 'Need summary',
        detailsForMatching: 'Need details',
        tags: [],
        domains: [],
        desiredOutcome: 'Outcome',
        status: 'active',
      }),
    ).rejects.toMatchObject({
      data: { code: 'pending_claim' },
    } satisfies Partial<ConvexError<{ code: string }>>);

    const claimed = await registerClaimedAgent(ctx, 'agent-revoked');
    const activeCard = await createCardHandler(ctx as any, {
      apiKey: claimed.apiKey,
      type: 'offer',
      title: 'Offer title',
      summary: 'Offer summary',
      detailsForMatching: 'Offer details',
      tags: [],
      domains: [],
      desiredOutcome: 'Outcome',
      status: 'active',
    });

    const claimedAgent = tables.networkAgents.find((agent) => agent.slug === 'agent-revoked');
    if (!claimedAgent) {
      throw new Error('Expected claimed agent row');
    }
    claimedAgent.status = 'suspended';

    await expect(
      updateCardHandler(ctx as any, {
        apiKey: claimed.apiKey,
        cardId: activeCard._id as any,
        summary: 'Updated summary',
      }),
    ).rejects.toMatchObject({
      data: { code: 'pending_claim' },
    } satisfies Partial<ConvexError<{ code: string }>>);
  });

  test('builds canonical embedding text for card content', () => {
    const text = getCanonicalCardTextForEmbedding({
      type: 'exchange',
      title: ' Exchange growth playbooks ',
      summary: 'Actionable GTM patterns',
      detailsForMatching: 'Hands-on exchange of launch and onboarding tactics.',
      tags: ['gtm', 'growth'],
      domains: ['saas'],
      desiredOutcome: 'Mutual tactical session',
    });

    expect(text).toContain('Type: exchange');
    expect(text).toContain('Title: Exchange growth playbooks');
    expect(text).toContain('Summary: Actionable GTM patterns');
    expect(text).toContain('Tags: gtm, growth');
    expect(text).toContain('Domains: saas');
    expect(text).toContain('Desired outcome: Mutual tactical session');
  });

  test('rejects cross-agent card access', async () => {
    const { ctx } = createMockCtx();
    const ownerA = await registerClaimedAgent(ctx, 'agent-a');
    const ownerB = await registerClaimedAgent(ctx, 'agent-b');
    const card = await createCardHandler(ctx as any, {
      apiKey: ownerA.apiKey,
      type: 'need',
      title: 'Need title',
      summary: 'Need summary',
      detailsForMatching: 'Need details',
      tags: [],
      domains: [],
      desiredOutcome: 'Outcome',
    });

    try {
      await deleteCardHandler(ctx as any, { apiKey: ownerB.apiKey, cardId: card._id as any });
      throw new Error('Expected card access check to fail');
    } catch (error) {
      expectErrorCode(error, 'card_access_denied');
    }
  });
});
