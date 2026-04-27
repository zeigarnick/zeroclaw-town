import { ConvexError } from 'convex/values';
import { claimAgentForTestingHandler, registerAgentHandler } from './agents';
import { createCardHandler } from './cards';
import {
  closeConversationHandler,
  getConversationHandler,
  listTownConversationsHandler,
  listMessagesHandler,
  sendMessageHandler,
} from './conversations';
import { listInboxHandler } from './inbox';
import {
  acceptMeetingHandler,
  declineMeetingHandler,
  getMeetingHandler,
  requestMeetingHandler,
} from './meetings';
import { runMatchingForCard } from './matching';
import { MAX_MESSAGE_LENGTH } from './validators';

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

async function setupRecommendation(ctx: any) {
  const needAgent = await registerClaimedAgent(ctx, 'need-side');
  const offerAgent = await registerClaimedAgent(ctx, 'offer-side');

  const needCard = await createActiveCard(ctx, {
    apiKey: needAgent.apiKey,
    type: 'need',
    title: 'Need partner for analytics launch',
    summary: 'Need event tracking and launch analytics support.',
    detailsForMatching: 'Need setup and validation for product analytics instrumentation.',
    tags: ['analytics', 'events'],
    domains: ['saas'],
    desiredOutcome: 'Find implementation partner',
  });

  const offerCard = await createActiveCard(ctx, {
    apiKey: offerAgent.apiKey,
    type: 'offer',
    title: 'Offer analytics implementation',
    summary: 'We implement event tracking and launch dashboards.',
    detailsForMatching: 'Can deliver instrumentation standards and reporting setup.',
    tags: ['analytics', 'events'],
    domains: ['saas'],
    desiredOutcome: 'Deliver implementation support',
  });

  return {
    needAgent,
    offerAgent,
    needCard,
    offerCard,
  };
}

async function setupAcceptedConversation(ctx: any, tables: Record<TableName, Row[]>) {
  const { needAgent, offerAgent, needCard } = await setupRecommendation(ctx);
  const recommendation = tables.recommendations[0];
  const meeting = await requestMeetingHandler(ctx, {
    apiKey: needAgent.apiKey,
    recommendationId: recommendation._id as any,
    requestMessage: 'Can we chat this week?',
  });
  const accepted = await acceptMeetingHandler(ctx, {
    apiKey: offerAgent.apiKey,
    meetingId: meeting._id as any,
  });

  return {
    needAgent,
    offerAgent,
    needCard,
    recommendation,
    meeting: accepted.meeting,
    conversation: accepted.conversation,
  };
}

function expectErrorCode(error: unknown, code: string) {
  expect((error as ConvexError<{ code: string }>).data.code).toBe(code);
}

describe('networking mailbox meetings and conversations handlers', () => {
  test('covers recommendation -> meeting request -> accept -> conversation and inbox flow', async () => {
    const { ctx, tables } = createMockCtx();
    const { needAgent, offerAgent } = await setupRecommendation(ctx as any);
    const recommendation = tables.recommendations[0];

    const meeting = await requestMeetingHandler(ctx as any, {
      apiKey: needAgent.apiKey,
      recommendationId: recommendation._id as any,
      requestMessage: 'Would love to compare implementation approach.',
    });

    expect(meeting.status).toBe('pending');
    expect(meeting.requesterAgentId).toBe(recommendation.recipientAgentId);
    expect(meeting.responderAgentId).toBe(recommendation.providerAgentId);

    const offerInboxAfterRequest = await listInboxHandler(ctx as any, {
      apiKey: offerAgent.apiKey,
    });
    expect(offerInboxAfterRequest.some((event) => event.type === 'meeting_request')).toBe(true);

    const accepted = await acceptMeetingHandler(ctx as any, {
      apiKey: offerAgent.apiKey,
      meetingId: meeting._id as any,
    });

    expect(accepted.meeting.status).toBe('accepted');
    expect(accepted.conversation.status).toBe('open');

    const needInboxAfterAccept = await listInboxHandler(ctx as any, {
      apiKey: needAgent.apiKey,
    });
    expect(needInboxAfterAccept.some((event) => event.type === 'match_recommendation')).toBe(true);
    expect(needInboxAfterAccept.some((event) => event.type === 'meeting_accepted')).toBe(true);

    await sendMessageHandler(ctx as any, {
      apiKey: needAgent.apiKey,
      conversationId: accepted.conversation._id as any,
      clientMessageId: 'msg-1',
      body: 'Great to connect. We can start next week.',
    });

    const messages = await listMessagesHandler(ctx as any, {
      apiKey: offerAgent.apiKey,
      conversationId: accepted.conversation._id as any,
    });
    expect(messages).toHaveLength(1);
    expect(messages[0].body).toContain('Great to connect');

    const offerInboxAfterMessage = await listInboxHandler(ctx as any, {
      apiKey: offerAgent.apiKey,
    });
    expect(offerInboxAfterMessage.some((event) => event.type === 'conversation_message')).toBe(true);

    expect(tables.agentConversations).toHaveLength(1);
    expect(tables.agentMessages).toHaveLength(1);
  });

  test('lists selected town agent conversations with realtime-ready messages', async () => {
    const { ctx, tables } = createMockCtx();
    const { needAgent, offerAgent, conversation } = await setupAcceptedConversation(
      ctx as any,
      tables,
    );

    await sendMessageHandler(ctx as any, {
      apiKey: needAgent.apiKey,
      conversationId: conversation._id as any,
      clientMessageId: 'town-msg-1',
      body: 'Can you review the investor target list?',
    });
    await sendMessageHandler(ctx as any, {
      apiKey: offerAgent.apiKey,
      conversationId: conversation._id as any,
      clientMessageId: 'town-msg-2',
      body: 'Yes. Send the top ten and I will prioritize warm paths.',
    });

    const townConversations = await listTownConversationsHandler(ctx as any, {
      agentId: needAgent.agentId as any,
    });

    expect(townConversations).toHaveLength(1);
    expect(townConversations[0]).toMatchObject({
      conversationId: conversation._id,
      status: 'open',
      selectedAgent: {
        agentId: needAgent.agentId,
        displayName: 'need-side',
      },
      otherAgent: {
        agentId: offerAgent.agentId,
        displayName: 'offer-side',
      },
    });
    expect(townConversations[0].messages.map((message) => message.body)).toEqual([
      'Can you review the investor target list?',
      'Yes. Send the top ten and I will prioritize warm paths.',
    ]);
  });

  test('decline creates recommendation suppression and prevents repeat recommendations', async () => {
    const { ctx, tables } = createMockCtx();
    const { needAgent, offerAgent, needCard } = await setupRecommendation(ctx as any);
    const recommendation = tables.recommendations[0];

    const meeting = await requestMeetingHandler(ctx as any, {
      apiKey: needAgent.apiKey,
      recommendationId: recommendation._id as any,
    });

    const declined = await declineMeetingHandler(ctx as any, {
      apiKey: offerAgent.apiKey,
      meetingId: meeting._id as any,
    });

    expect(declined.status).toBe('declined');

    expect(tables.recommendationSuppressions).toHaveLength(1);
    expect(tables.recommendationSuppressions[0]).toMatchObject({
      cardPairKey: recommendation.cardPairKey,
      reason: 'declined',
      sourceRecommendationId: recommendation._id,
    });

    const matchingResult = await runMatchingForCard(ctx as any, needCard as any);
    expect(matchingResult.created).toBe(0);
    expect(matchingResult.skippedSuppressed).toBeGreaterThanOrEqual(1);
    expect(
      tables.recommendations.filter(
        (row) => row.cardPairKey === recommendation.cardPairKey && row.status === 'active',
      ),
    ).toHaveLength(0);
  });

  test('enforces participant-only access for inbox, meetings, conversations, and messages', async () => {
    const { ctx, tables } = createMockCtx();
    const { needAgent, meeting, conversation } = await setupAcceptedConversation(
      ctx as any,
      tables,
    );
    const thirdAgent = await registerClaimedAgent(ctx as any, 'third-party');

    const thirdInbox = await listInboxHandler(ctx as any, {
      apiKey: thirdAgent.apiKey,
    });
    expect(thirdInbox).toHaveLength(0);

    await expect(
      getMeetingHandler(ctx as any, {
        apiKey: thirdAgent.apiKey,
        meetingId: meeting._id as any,
      }),
    ).rejects.toThrow(
      expect.objectContaining({
        data: expect.objectContaining({ code: 'meeting_access_denied' }),
      }),
    );

    await expect(
      getConversationHandler(ctx as any, {
        apiKey: thirdAgent.apiKey,
        conversationId: conversation._id as any,
      }),
    ).rejects.toThrow(
      expect.objectContaining({
        data: expect.objectContaining({ code: 'conversation_access_denied' }),
      }),
    );

    await expect(
      listMessagesHandler(ctx as any, {
        apiKey: thirdAgent.apiKey,
        conversationId: conversation._id as any,
      }),
    ).rejects.toThrow(
      expect.objectContaining({
        data: expect.objectContaining({ code: 'conversation_access_denied' }),
      }),
    );

    await expect(
      sendMessageHandler(ctx as any, {
        apiKey: thirdAgent.apiKey,
        conversationId: conversation._id as any,
        clientMessageId: 'x-1',
        body: 'hi',
      }),
    ).rejects.toThrow(
      expect.objectContaining({
        data: expect.objectContaining({ code: 'conversation_access_denied' }),
      }),
    );

    const needInbox = await listInboxHandler(ctx as any, {
      apiKey: needAgent.apiKey,
    });
    expect(needInbox.every((event) => event.recipientAgentId === meeting.requesterAgentId)).toBe(
      true,
    );
  });

  test('rejects duplicate client message IDs across participants and dedupes sender retries', async () => {
    const { ctx, tables } = createMockCtx();
    const { needAgent, offerAgent, conversation } = await setupAcceptedConversation(
      ctx as any,
      tables,
    );

    const first = await sendMessageHandler(ctx as any, {
      apiKey: needAgent.apiKey,
      conversationId: conversation._id as any,
      clientMessageId: 'dup-1',
      body: 'Initial message body',
    });

    const retry = await sendMessageHandler(ctx as any, {
      apiKey: needAgent.apiKey,
      conversationId: conversation._id as any,
      clientMessageId: 'dup-1',
      body: 'Retried message body should not create duplicate',
    });

    expect(retry._id).toBe(first._id);
    expect(tables.agentMessages).toHaveLength(1);

    await expect(
      sendMessageHandler(ctx as any, {
        apiKey: offerAgent.apiKey,
        conversationId: conversation._id as any,
        clientMessageId: 'dup-1',
        body: 'Conflicting client id',
      }),
    ).rejects.toThrow(
      expect.objectContaining({
        data: expect.objectContaining({ code: 'duplicate_client_message_id' }),
      }),
    );

    const closed = await closeConversationHandler(ctx as any, {
      apiKey: needAgent.apiKey,
      conversationId: conversation._id as any,
    });
    expect(closed.status).toBe('closed');

    await expect(
      sendMessageHandler(ctx as any, {
        apiKey: offerAgent.apiKey,
        conversationId: conversation._id as any,
        clientMessageId: 'after-close',
        body: 'This should fail after close',
      }),
    ).rejects.toThrow(
      expect.objectContaining({
        data: expect.objectContaining({ code: 'conversation_closed' }),
      }),
    );
  });

  test('rejects oversized messages', async () => {
    const { ctx, tables } = createMockCtx();
    const { needAgent, conversation } = await setupAcceptedConversation(ctx as any, tables);

    await expect(
      sendMessageHandler(ctx as any, {
        apiKey: needAgent.apiKey,
        conversationId: conversation._id as any,
        clientMessageId: 'too-long',
        body: 'x'.repeat(MAX_MESSAGE_LENGTH + 1),
      }),
    ).rejects.toThrow(
      expect.objectContaining({
        data: expect.objectContaining({ code: 'message_too_long' }),
      }),
    );
  });

  test('returns explicit error code for unauthorized meeting read', async () => {
    const { ctx, tables } = createMockCtx();
    const { meeting } = await setupAcceptedConversation(ctx as any, tables);
    const thirdAgent = await registerClaimedAgent(ctx as any, 'meeting-reader');

    try {
      await getMeetingHandler(ctx as any, {
        apiKey: thirdAgent.apiKey,
        meetingId: meeting._id as any,
      });
      throw new Error('Expected meeting_access_denied');
    } catch (error) {
      expectErrorCode(error, 'meeting_access_denied');
    }
  });
});
