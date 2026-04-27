import { claimAgentForTestingHandler, registerAgentHandler } from './agents';
import { createCardHandler, updateCardHandler } from './cards';
import {
  createCardPairKey,
  runMatchingForCard,
  runMatchingForVectorCandidatesHandler,
} from './matching';

type TableName =
  | 'networkAgents'
  | 'networkAgentApiKeys'
  | 'ownerClaims'
  | 'worldStatus'
  | 'matchCards'
  | 'cardEmbeddings'
  | 'recommendations'
  | 'recommendationSuppressions'
  | 'inboxEvents';
type Row = Record<string, any> & { _id: string };

function createMockCtx() {
  const tables: Record<TableName, Row[]> = {
    networkAgents: [],
    networkAgentApiKeys: [],
    ownerClaims: [],
    worldStatus: [],
    matchCards: [],
    cardEmbeddings: [],
    recommendations: [],
    recommendationSuppressions: [],
    inboxEvents: [],
  };
  const counters: Record<TableName, number> = {
    networkAgents: 0,
    networkAgentApiKeys: 0,
    ownerClaims: 0,
    worldStatus: 0,
    matchCards: 0,
    cardEmbeddings: 0,
    recommendations: 0,
    recommendationSuppressions: 0,
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
  if (indexName.includes('updated_at')) {
    return (left.updatedAt ?? 0) - (right.updatedAt ?? 0);
  }
  if (indexName.includes('created_at')) {
    return (left.createdAt ?? 0) - (right.createdAt ?? 0);
  }
  if (indexName === 'by_agent' || indexName === 'by_status_updated_at') {
    return (left.updatedAt ?? 0) - (right.updatedAt ?? 0);
  }
  return 0;
}

function tokenFromClaimUrl(claimUrl: string) {
  return claimUrl.split('/').at(-1) ?? '';
}

async function registerClaimedAgent(ctx: any, slug: string) {
  const registration = await registerAgentHandler(ctx, {
    slug,
    displayName: slug,
  });
  await claimAgentForTestingHandler(ctx, {
    claimToken: tokenFromClaimUrl(registration.claimUrl),
    verificationCode: registration.verificationCode,
    xHandle: `@${slug}`,
    xProfileUrl: `https://x.com/${slug}`,
  });
  return registration;
}

async function createActiveCard(
  ctx: any,
  args: {
    apiKey: string;
    type: 'need' | 'offer' | 'exchange';
    title: string;
    summary: string;
    detailsForMatching: string;
    tags?: string[];
    domains?: string[];
    desiredOutcome?: string;
  },
) {
  return await createCardHandler(ctx, {
    apiKey: args.apiKey,
    type: args.type,
    title: args.title,
    summary: args.summary,
    detailsForMatching: args.detailsForMatching,
    tags: args.tags ?? [],
    domains: args.domains ?? [],
    desiredOutcome: args.desiredOutcome ?? 'Book a call',
    status: 'active',
  });
}

describe('networking matching handlers', () => {
  test('creates a need-side recommendation for need->offer and never for the offer-side inbox', async () => {
    const { ctx, tables } = createMockCtx();
    const needAgent = await registerClaimedAgent(ctx as any, 'need-owner');
    const offerAgent = await registerClaimedAgent(ctx as any, 'offer-owner');

    const needCard = await createActiveCard(ctx as any, {
      apiKey: needAgent.apiKey,
      type: 'need',
      title: 'Need product analytics implementation',
      summary: 'Need instrumentation support for B2B SaaS.',
      detailsForMatching: 'Need event schema, dashboard setup, and release guidance.',
      tags: ['analytics', 'events'],
      domains: ['saas'],
      desiredOutcome: 'Find implementation partner',
    });
    const offerCard = await createActiveCard(ctx as any, {
      apiKey: offerAgent.apiKey,
      type: 'offer',
      title: 'Offer analytics implementation',
      summary: 'We implement analytics and instrumentation stacks.',
      detailsForMatching: 'Own event taxonomy, BI wiring, and data quality checks.',
      tags: ['analytics', 'events'],
      domains: ['saas'],
      desiredOutcome: 'Deliver onboarding engagement',
    });

    expect(tables.recommendations).toHaveLength(1);
    expect(tables.recommendations[0]).toMatchObject({
      recipientAgentId: needCard.agentId,
      recipientCardId: needCard._id,
      providerAgentId: offerCard.agentId,
      providerCardId: offerCard._id,
      status: 'active',
    });
    expect(
      tables.recommendations.filter(
        (recommendation) => recommendation.recipientAgentId === offerCard.agentId,
      ),
    ).toHaveLength(0);
    expect(tables.inboxEvents).toHaveLength(1);
    expect(tables.inboxEvents[0]).toMatchObject({
      recipientAgentId: needCard.agentId,
      type: 'match_recommendation',
      recommendationId: tables.recommendations[0]._id,
    });
  });

  test('creates recommendation for need->exchange pair', async () => {
    const { ctx, tables } = createMockCtx();
    const needAgent = await registerClaimedAgent(ctx as any, 'need-exchange');
    const exchangeAgent = await registerClaimedAgent(ctx as any, 'exchange-provider');

    const needCard = await createActiveCard(ctx as any, {
      apiKey: needAgent.apiKey,
      type: 'need',
      title: 'Need go-to-market playbook',
      summary: 'Need GTM support for launch.',
      detailsForMatching: 'Need distribution strategy for first 50 customers.',
      tags: ['gtm'],
      domains: ['saas'],
      desiredOutcome: 'Find partner for tactical support',
    });
    const exchangeCard = await createActiveCard(ctx as any, {
      apiKey: exchangeAgent.apiKey,
      type: 'exchange',
      title: 'Exchange launch playbooks',
      summary: 'Can swap GTM tactics and onboarding templates.',
      detailsForMatching: 'Can provide launch checklists in return for PLG retention insights.',
      tags: ['gtm'],
      domains: ['saas'],
      desiredOutcome: 'Mutual tactical exchange',
    });

    expect(tables.recommendations).toHaveLength(1);
    expect(tables.recommendations[0]).toMatchObject({
      recipientCardId: needCard._id,
      providerCardId: exchangeCard._id,
      status: 'active',
    });
  });

  test('creates recommendation for exchange->offer pair with exchange card as recipient', async () => {
    const { ctx, tables } = createMockCtx();
    const exchangeAgent = await registerClaimedAgent(ctx as any, 'exchange-need');
    const offerAgent = await registerClaimedAgent(ctx as any, 'offer-provider');

    const exchangeCard = await createActiveCard(ctx as any, {
      apiKey: exchangeAgent.apiKey,
      type: 'exchange',
      title: 'Exchange retention audits',
      summary: 'Can exchange retention frameworks.',
      detailsForMatching: 'Need analytics implementation help; can provide retention teardown.',
      tags: ['retention', 'analytics'],
      domains: ['saas'],
      desiredOutcome: 'Mutual tactical exchange',
    });
    const offerCard = await createActiveCard(ctx as any, {
      apiKey: offerAgent.apiKey,
      type: 'offer',
      title: 'Offer analytics implementation',
      summary: 'Hands-on analytics engineering support.',
      detailsForMatching: 'Implement dashboards and event QA.',
      tags: ['analytics'],
      domains: ['saas'],
      desiredOutcome: 'Ship dashboards quickly',
    });

    expect(tables.recommendations).toHaveLength(1);
    expect(tables.recommendations[0]).toMatchObject({
      recipientCardId: exchangeCard._id,
      providerCardId: offerCard._id,
      status: 'active',
    });
  });

  test('rejects incompatible direction pairs (offer->offer and need->need)', async () => {
    const offers = createMockCtx();
    const offerA = await registerClaimedAgent(offers.ctx as any, 'offer-a');
    const offerB = await registerClaimedAgent(offers.ctx as any, 'offer-b');
    await createActiveCard(offers.ctx as any, {
      apiKey: offerA.apiKey,
      type: 'offer',
      title: 'Offer A',
      summary: 'Offer A summary',
      detailsForMatching: 'Offer A details',
      tags: ['infra'],
      domains: ['devtools'],
    });
    await createActiveCard(offers.ctx as any, {
      apiKey: offerB.apiKey,
      type: 'offer',
      title: 'Offer B',
      summary: 'Offer B summary',
      detailsForMatching: 'Offer B details',
      tags: ['infra'],
      domains: ['devtools'],
    });
    expect(offers.tables.recommendations).toHaveLength(0);

    const needs = createMockCtx();
    const needA = await registerClaimedAgent(needs.ctx as any, 'need-a');
    const needB = await registerClaimedAgent(needs.ctx as any, 'need-b');
    await createActiveCard(needs.ctx as any, {
      apiKey: needA.apiKey,
      type: 'need',
      title: 'Need A',
      summary: 'Need A summary',
      detailsForMatching: 'Need A details',
      tags: ['infra'],
      domains: ['devtools'],
    });
    await createActiveCard(needs.ctx as any, {
      apiKey: needB.apiKey,
      type: 'need',
      title: 'Need B',
      summary: 'Need B summary',
      detailsForMatching: 'Need B details',
      tags: ['infra'],
      domains: ['devtools'],
    });
    expect(needs.tables.recommendations).toHaveLength(0);
  });

  test('dedupes active recommendations for the same directed card pair', async () => {
    const { ctx, tables } = createMockCtx();
    const needAgent = await registerClaimedAgent(ctx as any, 'dedupe-need');
    const offerAgent = await registerClaimedAgent(ctx as any, 'dedupe-offer');

    const needCard = await createActiveCard(ctx as any, {
      apiKey: needAgent.apiKey,
      type: 'need',
      title: 'Need analytics',
      summary: 'Need analytics implementation',
      detailsForMatching: 'Need analytics setup for launch',
      tags: ['analytics'],
      domains: ['saas'],
      desiredOutcome: 'Find implementation partner',
    });
    const offerCard = await createActiveCard(ctx as any, {
      apiKey: offerAgent.apiKey,
      type: 'offer',
      title: 'Offer analytics',
      summary: 'Offer analytics implementation',
      detailsForMatching: 'Can own analytics implementation',
      tags: ['analytics'],
      domains: ['saas'],
      desiredOutcome: 'Ship dashboards',
    });
    expect(tables.recommendations).toHaveLength(1);

    await updateCardHandler(ctx as any, {
      apiKey: offerAgent.apiKey,
      cardId: offerCard._id as any,
      ownerConfirmedAt: Date.now(),
    });

    const pairKey = createCardPairKey(needCard._id as any, offerCard._id as any);
    expect(
      tables.recommendations.filter(
        (recommendation) =>
          recommendation.cardPairKey === pairKey && recommendation.status === 'active',
      ),
    ).toHaveLength(1);
  });

  test('marks existing recommendations stale when card meaning changes', async () => {
    const { ctx, tables } = createMockCtx();
    const needAgent = await registerClaimedAgent(ctx as any, 'stale-need');
    const offerAgent = await registerClaimedAgent(ctx as any, 'stale-offer');

    const needCard = await createActiveCard(ctx as any, {
      apiKey: needAgent.apiKey,
      type: 'need',
      title: 'Need growth partner',
      summary: 'Need support for outbound',
      detailsForMatching: 'Need outbound playbook for enterprise pipeline.',
      tags: ['growth'],
      domains: ['saas'],
      desiredOutcome: 'Find partner for outbound',
    });
    await createActiveCard(ctx as any, {
      apiKey: offerAgent.apiKey,
      type: 'offer',
      title: 'Offer growth operations',
      summary: 'Offer outbound strategy support',
      detailsForMatching: 'Can run outbound and messaging experiments.',
      tags: ['growth'],
      domains: ['saas'],
      desiredOutcome: 'Book strategy call',
    });
    expect(tables.recommendations.filter((recommendation) => recommendation.status === 'active')).toHaveLength(1);

    await updateCardHandler(ctx as any, {
      apiKey: needAgent.apiKey,
      cardId: needCard._id as any,
      summary: 'Need product-led growth experiments',
      detailsForMatching: 'Need a partner for PLG activation experiments.',
    });

    expect(tables.recommendations.filter((recommendation) => recommendation.status === 'stale')).toHaveLength(1);
    expect(tables.recommendations.filter((recommendation) => recommendation.status === 'active')).toHaveLength(1);
  });

  test.each(['dismissed', 'declined'] as const)(
    'suppresses %s pairings from reappearing as active recommendations',
    async (suppressionStatus) => {
    const { ctx, tables } = createMockCtx();
    const needAgent = await registerClaimedAgent(ctx as any, 'suppress-need');
    const offerAgent = await registerClaimedAgent(ctx as any, 'suppress-offer');

    const needCard = await createActiveCard(ctx as any, {
      apiKey: needAgent.apiKey,
      type: 'need',
      title: 'Need onboarding advisor',
      summary: 'Need onboarding support',
      detailsForMatching: 'Need onboarding playbook updates for activation.',
      tags: ['onboarding'],
      domains: ['saas'],
      desiredOutcome: 'Find partner for onboarding',
    });
    const offerCard = await createActiveCard(ctx as any, {
      apiKey: offerAgent.apiKey,
      type: 'offer',
      title: 'Offer onboarding advisory',
      summary: 'Offer onboarding playbook support',
      detailsForMatching: 'Can improve onboarding copy and flow experiments.',
      tags: ['onboarding'],
      domains: ['saas'],
      desiredOutcome: 'Share activation expertise',
    });

    const pairKey = createCardPairKey(needCard._id as any, offerCard._id as any);
    const initial = tables.recommendations.find((recommendation) => recommendation.cardPairKey === pairKey);
    if (!initial) {
      throw new Error('Expected initial recommendation');
    }
    initial.status = suppressionStatus;

    await updateCardHandler(ctx as any, {
      apiKey: needAgent.apiKey,
      cardId: needCard._id as any,
      summary: 'Need onboarding growth partner',
      detailsForMatching: 'Need support with activation and onboarding lifecycle.',
    });

    expect(
      tables.recommendations.filter(
        (recommendation) =>
          recommendation.cardPairKey === pairKey && recommendation.status === 'active',
      ),
    ).toHaveLength(0);
    expect(
      tables.recommendationSuppressions.filter(
        (suppression) =>
          suppression.cardPairKey === pairKey && suppression.reason === suppressionStatus,
      ),
    ).toHaveLength(1);
    },
  );

  test('supports deterministic scoring by injecting fixed embeddings in tests', async () => {
    const { ctx, tables } = createMockCtx();
    const now = Date.now();
    const needAgentId = await ctx.db.insert('networkAgents', {
      slug: 'det-need',
      displayName: 'det-need',
      status: 'active',
      createdAt: now,
      updatedAt: now,
    });
    const offerNearAgentId = await ctx.db.insert('networkAgents', {
      slug: 'det-offer-near',
      displayName: 'det-offer-near',
      status: 'active',
      createdAt: now,
      updatedAt: now,
    });
    const offerFarAgentId = await ctx.db.insert('networkAgents', {
      slug: 'det-offer-far',
      displayName: 'det-offer-far',
      status: 'active',
      createdAt: now,
      updatedAt: now,
    });
    const needCardId = await ctx.db.insert('matchCards', {
      agentId: needAgentId,
      type: 'need',
      title: 'Need analytics support',
      summary: 'Need analytics support',
      detailsForMatching: 'Need analytics support',
      tags: ['analytics'],
      domains: ['saas'],
      desiredOutcome: 'Find analytics partner',
      status: 'active',
      agentGeneratedAt: now,
      ownerConfirmedAt: now,
      updatedAt: now,
    });
    const offerNearCardId = await ctx.db.insert('matchCards', {
      agentId: offerNearAgentId,
      type: 'offer',
      title: 'Offer analytics support',
      summary: 'Offer analytics support',
      detailsForMatching: 'Offer analytics support',
      tags: ['analytics'],
      domains: ['saas'],
      desiredOutcome: 'Help analytics teams',
      status: 'active',
      agentGeneratedAt: now,
      ownerConfirmedAt: now,
      updatedAt: now,
    });
    const offerFarCardId = await ctx.db.insert('matchCards', {
      agentId: offerFarAgentId,
      type: 'offer',
      title: 'Offer brand design support',
      summary: 'Offer brand design support',
      detailsForMatching: 'Offer brand design support',
      tags: ['branding'],
      domains: ['consumer'],
      desiredOutcome: 'Help branding teams',
      status: 'active',
      agentGeneratedAt: now,
      ownerConfirmedAt: now,
      updatedAt: now,
    });

    const needCard = await ctx.db.get(needCardId);
    if (!needCard) {
      throw new Error('Expected need card');
    }

    const result = await runMatchingForCard(ctx as any, needCard as any, {
      now,
      minScore: 0,
      embeddingLookup: async () =>
        new Map([
          [needCardId as any, [1, 0]],
          [offerNearCardId as any, [0.9, 0.1]],
          [offerFarCardId as any, [0, 1]],
        ]),
    });

    expect(result.created).toBe(2);
    const nearScore = tables.recommendations.find(
      (recommendation) => recommendation.providerCardId === offerNearCardId,
    )?.score;
    const farScore = tables.recommendations.find(
      (recommendation) => recommendation.providerCardId === offerFarCardId,
    )?.score;
    expect(nearScore).toBeDefined();
    expect(farScore).toBeDefined();
    expect(nearScore).toBeGreaterThan(farScore);
  });

  test('creates recommendations from Convex vector candidate embedding ids', async () => {
    const { ctx, tables } = createMockCtx();
    const needAgent = await registerClaimedAgent(ctx as any, 'vector-need');
    const offerAgent = await registerClaimedAgent(ctx as any, 'vector-offer');

    const needCard = await createActiveCard(ctx as any, {
      apiKey: needAgent.apiKey,
      type: 'need',
      title: 'Need fintech investor intros',
      summary: 'Need help with seed fundraising.',
      detailsForMatching: 'Looking for fintech angels and seed funds.',
      tags: ['fintech', 'fundraising'],
      domains: ['fintech'],
      desiredOutcome: 'Book investor intro calls',
    });
    const offerCard = await createActiveCard(ctx as any, {
      apiKey: offerAgent.apiKey,
      type: 'offer',
      title: 'Offer fintech fundraising network',
      summary: 'Can introduce fintech founders to investors.',
      detailsForMatching: 'Angel and seed fund network for fintech teams.',
      tags: ['fintech', 'fundraising'],
      domains: ['fintech'],
      desiredOutcome: 'Help founders meet investors',
    });

    tables.recommendations = [];
    tables.inboxEvents = [];

    const offerEmbedding = tables.cardEmbeddings.find(
      (embedding) => embedding.cardId === offerCard._id,
    );
    if (!offerEmbedding) {
      throw new Error('Expected offer embedding');
    }

    const result = await runMatchingForVectorCandidatesHandler(ctx as any, {
      triggerCardId: needCard._id as any,
      candidateEmbeddingIds: [offerEmbedding._id as any],
    });

    expect(result).toMatchObject({ evaluated: 1, created: 1 });
    expect(tables.recommendations).toHaveLength(1);
    expect(tables.recommendations[0]).toMatchObject({
      recipientCardId: needCard._id,
      providerCardId: offerCard._id,
      status: 'active',
    });
  });
});
