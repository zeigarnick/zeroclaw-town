import { ConvexError } from 'convex/values';
import { claimAgentForTestingHandler, registerAgentHandler } from './agents';
import { createCardHandler } from './cards';
import { closeConversationHandler } from './conversations';
import { listInboxHandler } from './inbox';
import {
  approveIntroCandidateHandler,
  createIntroCandidateHandler,
  deferIntroCandidateHandler,
  dismissIntroCandidateHandler,
  listIntroCandidatesHandler,
} from './intros';
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

function expectErrorCode(error: unknown, code: string) {
  expect((error as ConvexError<{ code: string }>).data.code).toBe(code);
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

async function setupAcceptedConversation(ctx: any) {
  const needAgent = await registerClaimedAgent(ctx, 'intro-need');
  const offerAgent = await registerClaimedAgent(ctx, 'intro-offer');

  await createActiveCard(ctx, {
    apiKey: needAgent.apiKey,
    type: 'need',
    title: 'Need design partner',
    summary: 'Need a design partner for onboarding flow.',
    detailsForMatching: 'Need UX support for conversion-focused onboarding.',
    tags: ['design', 'ux'],
    domains: ['saas'],
    desiredOutcome: 'Find design partner',
  });
  await createActiveCard(ctx, {
    apiKey: offerAgent.apiKey,
    type: 'offer',
    title: 'Offer UX design support',
    summary: 'Offer onboarding UX and conversion optimization support.',
    detailsForMatching: 'Can deliver research and Figma prototypes quickly.',
    tags: ['design', 'ux'],
    domains: ['saas'],
    desiredOutcome: 'Deliver UX support',
  });

  const rec = (await (ctx as any).db.query('recommendations').withIndex('by_status_created_at', (q: any) =>
    q.eq('status', 'active'),
  ).collect())[0];
  const meeting = await requestMeetingHandler(ctx, {
    apiKey: needAgent.apiKey,
    recommendationId: rec._id as any,
  });
  const accepted = await acceptMeetingHandler(ctx, {
    apiKey: offerAgent.apiKey,
    meetingId: meeting._id as any,
  });

  return {
    needAgent,
    offerAgent,
    meeting: accepted.meeting,
    conversation: accepted.conversation,
  };
}

describe('networking intro candidates handlers', () => {
  test('requires closed or explicitly qualified conversation and emits participant inbox events', async () => {
    const { ctx } = createMockCtx();
    const { needAgent, offerAgent, conversation } = await setupAcceptedConversation(ctx as any);

    await expect(
      createIntroCandidateHandler(ctx as any, {
        apiKey: needAgent.apiKey,
        conversationId: conversation._id as any,
        summary: 'Not yet closed.',
        recommendedNextStep: 'Close first or explicitly qualify.',
      }),
    ).rejects.toThrow(expect.objectContaining({ data: expect.objectContaining({ code: 'conversation_not_qualified' }) }));

    const created = await createIntroCandidateHandler(ctx as any, {
      apiKey: needAgent.apiKey,
      conversationId: conversation._id as any,
      explicitlyQualified: true,
      summary: 'Explicitly qualified while conversation is still open.',
      recommendedNextStep: 'Owner should review and decide on external intro.',
    });
    expect(created.status).toBe('pending_review');
    expect(created.qualificationMode).toBe('explicit_qualification');

    const needInbox = await listInboxHandler(ctx as any, { apiKey: needAgent.apiKey });
    const offerInbox = await listInboxHandler(ctx as any, { apiKey: offerAgent.apiKey });
    expect(
      needInbox.some(
        (event) => event.type === 'intro_candidate' && event.introCandidateId === created._id,
      ),
    ).toBe(true);
    expect(
      offerInbox.some(
        (event) => event.type === 'intro_candidate' && event.introCandidateId === created._id,
      ),
    ).toBe(true);
  });

  test('supports defer, approve, dismiss transitions and list filters', async () => {
    const { ctx } = createMockCtx();
    const { needAgent, offerAgent, conversation } = await setupAcceptedConversation(ctx as any);
    await closeConversationHandler(ctx as any, {
      apiKey: needAgent.apiKey,
      conversationId: conversation._id as any,
    });

    const created = await createIntroCandidateHandler(ctx as any, {
      apiKey: needAgent.apiKey,
      conversationId: conversation._id as any,
      summary: 'Conversation closed with clear fit.',
      recommendedNextStep: 'Approve intro email draft.',
    });

    const deferred = await deferIntroCandidateHandler(ctx as any, {
      apiKey: needAgent.apiKey,
      introCandidateId: created._id as any,
    });
    expect(deferred.status).toBe('deferred');
    expect(deferred.requesterReviewedAt).toBeDefined();

    const needDeferred = await listIntroCandidatesHandler(ctx as any, {
      apiKey: needAgent.apiKey,
      status: 'deferred',
    });
    expect(needDeferred).toHaveLength(1);

    const approved = await approveIntroCandidateHandler(ctx as any, {
      apiKey: offerAgent.apiKey,
      introCandidateId: created._id as any,
    });
    expect(approved.status).toBe('approved');
    expect(approved.responderReviewedAt).toBeDefined();

    const offerApproved = await listIntroCandidatesHandler(ctx as any, {
      apiKey: offerAgent.apiKey,
      status: 'approved',
    });
    expect(offerApproved).toHaveLength(1);
  });

  test('enforces participant-only access and blocks status transitions after dismissal', async () => {
    const { ctx } = createMockCtx();
    const { needAgent, offerAgent, conversation } = await setupAcceptedConversation(ctx as any);
    const thirdAgent = await registerClaimedAgent(ctx as any, 'intro-third');
    await closeConversationHandler(ctx as any, {
      apiKey: needAgent.apiKey,
      conversationId: conversation._id as any,
    });

    const created = await createIntroCandidateHandler(ctx as any, {
      apiKey: needAgent.apiKey,
      conversationId: conversation._id as any,
      summary: 'Ready for owner review.',
      recommendedNextStep: 'Decide whether to send intro.',
    });

    try {
      await dismissIntroCandidateHandler(ctx as any, {
        apiKey: thirdAgent.apiKey,
        introCandidateId: created._id as any,
      });
      throw new Error('Expected intro_candidate_access_denied');
    } catch (error) {
      expectErrorCode(error, 'intro_candidate_access_denied');
    }

    const dismissed = await dismissIntroCandidateHandler(ctx as any, {
      apiKey: needAgent.apiKey,
      introCandidateId: created._id as any,
    });
    expect(dismissed.status).toBe('dismissed');

    try {
      await approveIntroCandidateHandler(ctx as any, {
        apiKey: offerAgent.apiKey,
        introCandidateId: created._id as any,
      });
      throw new Error('Expected invalid_intro_candidate_status');
    } catch (error) {
      expectErrorCode(error, 'invalid_intro_candidate_status');
    }
  });
});
