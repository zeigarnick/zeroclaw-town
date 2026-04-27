import { claimAgentForTestingHandler, registerAgentForTestingHandler } from './agents';
import { createCardHandler } from './cards';
import { closeConversationHandler, sendMessageHandler } from './conversations';
import { listInboxHandler } from './inbox';
import { createIntroCandidateHandler, listIntroCandidatesHandler } from './intros';
import { acceptMeetingHandler, requestMeetingHandler } from './meetings';

type TableName =
  | 'networkAgents'
  | 'networkAgentApiKeys'
  | 'ownerClaims'
  | 'worldStatus'
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
    worldStatus: [],
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
    worldStatus: 0,
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
  if (indexName === 'by_agent' || indexName === 'by_status_updated_at') {
    return (left.updatedAt ?? 0) - (right.updatedAt ?? 0);
  }
  return 0;
}

function tokenFromClaimUrl(claimUrl: string) {
  return claimUrl.split('/').at(-1) ?? '';
}

async function registerClaimedAgent(ctx: any, slug: string) {
  const registration = await registerAgentForTestingHandler(ctx, {
    slug,
    displayName: slug,
  });
  const claimed = await claimAgentForTestingHandler(ctx, {
    claimToken: tokenFromClaimUrl(registration.claimUrl),
    verificationCode: registration.verificationCode,
    xHandle: `@${slug}`,
    xProfileUrl: `https://x.com/${slug}`,
  });
  return { ...registration, apiKey: claimed.apiKey };
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

describe('networking product loop', () => {
  test('covers register -> claim -> cards -> matching -> meeting -> conversation -> intro candidate', async () => {
    const { ctx, tables } = createMockCtx();
    const needAgent = await registerClaimedAgent(ctx as any, 'loop-need');
    const offerAgent = await registerClaimedAgent(ctx as any, 'loop-offer');

    const needCard = await createActiveCard(ctx as any, {
      apiKey: needAgent.apiKey,
      type: 'need',
      title: 'Need GTM analytics support',
      summary: 'Need tracking and reporting support for launch.',
      detailsForMatching: 'Need event taxonomy, dashboards, and conversion tracking.',
      tags: ['analytics', 'gtm'],
      domains: ['saas'],
      desiredOutcome: 'Find implementation partner',
    });
    const offerCard = await createActiveCard(ctx as any, {
      apiKey: offerAgent.apiKey,
      type: 'offer',
      title: 'Offer GTM analytics implementation',
      summary: 'Deliver instrumentation and reporting setup.',
      detailsForMatching: 'Can deliver event specs, setup, QA, and launch reporting.',
      tags: ['analytics', 'gtm'],
      domains: ['saas'],
      desiredOutcome: 'Ship implementation quickly',
    });

    expect(needCard.status).toBe('active');
    expect(offerCard.status).toBe('active');
    expect(tables.recommendations).toHaveLength(1);
    const recommendation = tables.recommendations[0];
    expect(recommendation.recipientAgentId).toBe(tables.networkAgents[0]._id);

    const meeting = await requestMeetingHandler(ctx as any, {
      apiKey: needAgent.apiKey,
      recommendationId: recommendation._id as any,
      requestMessage: 'Can we coordinate this week?',
    });
    expect(meeting.status).toBe('pending');

    const accepted = await acceptMeetingHandler(ctx as any, {
      apiKey: offerAgent.apiKey,
      meetingId: meeting._id as any,
    });
    expect(accepted.meeting.status).toBe('accepted');
    expect(accepted.conversation.status).toBe('open');

    await sendMessageHandler(ctx as any, {
      apiKey: needAgent.apiKey,
      conversationId: accepted.conversation._id as any,
      clientMessageId: 'loop-msg-1',
      body: 'Sharing context and expected timeline.',
    });
    await sendMessageHandler(ctx as any, {
      apiKey: offerAgent.apiKey,
      conversationId: accepted.conversation._id as any,
      clientMessageId: 'loop-msg-2',
      body: 'Looks aligned. We can start next week.',
    });

    const closedConversation = await closeConversationHandler(ctx as any, {
      apiKey: needAgent.apiKey,
      conversationId: accepted.conversation._id as any,
    });
    expect(closedConversation.status).toBe('closed');

    const introCandidate = await createIntroCandidateHandler(ctx as any, {
      apiKey: needAgent.apiKey,
      conversationId: closedConversation._id as any,
      summary: 'Strong fit on timeline and scope for analytics launch.',
      recommendedNextStep: 'Owner should approve an intro email between both participants.',
    });
    expect(introCandidate.status).toBe('pending_review');
    expect(introCandidate.meetingId).toBe(meeting._id);
    expect(introCandidate.conversationId).toBe(closedConversation._id);
    expect(introCandidate.requesterCardId).toBe(meeting.requesterCardId);
    expect(introCandidate.responderCardId).toBe(meeting.responderCardId);

    const deduped = await createIntroCandidateHandler(ctx as any, {
      apiKey: offerAgent.apiKey,
      conversationId: closedConversation._id as any,
      summary: 'Duplicate create should return the same active candidate.',
      recommendedNextStep: 'No-op',
    });
    expect(deduped._id).toBe(introCandidate._id);
    expect(tables.introCandidates).toHaveLength(1);

    const needIntros = await listIntroCandidatesHandler(ctx as any, {
      apiKey: needAgent.apiKey,
    });
    const offerIntros = await listIntroCandidatesHandler(ctx as any, {
      apiKey: offerAgent.apiKey,
    });
    expect(needIntros).toHaveLength(1);
    expect(offerIntros).toHaveLength(1);

    const needInbox = await listInboxHandler(ctx as any, { apiKey: needAgent.apiKey });
    const offerInbox = await listInboxHandler(ctx as any, { apiKey: offerAgent.apiKey });
    expect(
      needInbox.some(
        (event) =>
          event.type === 'intro_candidate' && event.introCandidateId === introCandidate._id,
      ),
    ).toBe(true);
    expect(
      offerInbox.some(
        (event) =>
          event.type === 'intro_candidate' && event.introCandidateId === introCandidate._id,
      ),
    ).toBe(true);
  });
});
