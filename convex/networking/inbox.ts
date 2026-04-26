import { v } from 'convex/values';
import { Id } from '../_generated/dataModel';
import { MutationCtx, QueryCtx, query } from '../_generated/server';
import { authenticateAgent, networkingError } from './auth';
import {
  InboxEventStatus,
  InboxItemType,
  isInboxEventStatus,
} from './validators';

type InboxPayload = Record<string, unknown>;

type WriteInboxEventArgs = {
  recipientAgentId: Id<'networkAgents'>;
  actorAgentId?: Id<'networkAgents'>;
  type: InboxItemType;
  status?: InboxEventStatus;
  dedupeKey?: string;
  recommendationId?: Id<'recommendations'>;
  meetingId?: Id<'meetings'>;
  conversationId?: Id<'agentConversations'>;
  messageId?: Id<'agentMessages'>;
  introCandidateId?: Id<'introCandidates'>;
  payload?: InboxPayload;
  now?: number;
};

export const listInbox = query({
  args: {
    apiKey: v.string(),
    status: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: (ctx, args) => listInboxHandler(ctx, args),
});

export async function listInboxHandler(
  ctx: QueryCtx,
  args: {
    apiKey: string;
    status?: string;
    limit?: number;
  },
) {
  const { agent } = await authenticateAgent(ctx, args.apiKey);
  const status = args.status === undefined ? undefined : parseInboxEventStatus(args.status);
  const limit = normalizeLimit(args.limit);

  return status
    ? await ctx.db
        .query('inboxEvents')
        .withIndex('by_recipient_status_created_at', (q) =>
          q.eq('recipientAgentId', agent._id).eq('status', status),
        )
        .order('desc')
        .take(limit)
    : await ctx.db
        .query('inboxEvents')
        .withIndex('by_recipient_created_at', (q) => q.eq('recipientAgentId', agent._id))
        .order('desc')
        .take(limit);
}

export async function writeInboxEvent(ctx: MutationCtx, args: WriteInboxEventArgs) {
  const now = args.now ?? Date.now();
  if (args.dedupeKey) {
    const existing = await ctx.db
      .query('inboxEvents')
      .withIndex('by_recipient_dedupe_key', (q) =>
        q.eq('recipientAgentId', args.recipientAgentId).eq('dedupeKey', args.dedupeKey),
      )
      .first();
    if (existing) {
      return existing._id;
    }
  }

  return await ctx.db.insert('inboxEvents', {
    recipientAgentId: args.recipientAgentId,
    actorAgentId: args.actorAgentId,
    type: args.type,
    status: args.status ?? 'unread',
    dedupeKey: args.dedupeKey,
    recommendationId: args.recommendationId,
    meetingId: args.meetingId,
    conversationId: args.conversationId,
    messageId: args.messageId,
    introCandidateId: args.introCandidateId,
    payload: args.payload,
    createdAt: now,
    updatedAt: now,
  });
}

export async function writeRecommendationInboxEvent(
  ctx: MutationCtx,
  args: {
    recommendationId: Id<'recommendations'>;
    recipientAgentId: Id<'networkAgents'>;
    providerAgentId: Id<'networkAgents'>;
    recipientCardId: Id<'matchCards'>;
    providerCardId: Id<'matchCards'>;
    cardPairKey: string;
    score: number;
    now?: number;
  },
) {
  return await writeInboxEvent(ctx, {
    recipientAgentId: args.recipientAgentId,
    actorAgentId: args.providerAgentId,
    type: 'match_recommendation',
    dedupeKey: `recommendation:${args.recommendationId}`,
    recommendationId: args.recommendationId,
    payload: {
      recipientCardId: args.recipientCardId,
      providerCardId: args.providerCardId,
      cardPairKey: args.cardPairKey,
      score: args.score,
    },
    now: args.now,
  });
}

export async function writeMeetingRequestInboxEvent(
  ctx: MutationCtx,
  args: {
    meetingId: Id<'meetings'>;
    recommendationId: Id<'recommendations'>;
    requesterAgentId: Id<'networkAgents'>;
    responderAgentId: Id<'networkAgents'>;
    requestMessage?: string;
    outreachContext: {
      requesterCardSummary: string;
      responderCardTitle: string;
      requestedOutcome: string;
    };
    now?: number;
  },
) {
  return await writeInboxEvent(ctx, {
    recipientAgentId: args.responderAgentId,
    actorAgentId: args.requesterAgentId,
    type: 'meeting_request',
    dedupeKey: `meeting-request:${args.meetingId}`,
    recommendationId: args.recommendationId,
    meetingId: args.meetingId,
    payload: {
      requestMessage: args.requestMessage,
      outreachContext: args.outreachContext,
    },
    now: args.now,
  });
}

export async function writeMeetingStatusInboxEvents(
  ctx: MutationCtx,
  args: {
    meetingId: Id<'meetings'>;
    recommendationId: Id<'recommendations'>;
    requesterAgentId: Id<'networkAgents'>;
    responderAgentId: Id<'networkAgents'>;
    actorAgentId: Id<'networkAgents'>;
    status: 'accepted' | 'declined' | 'expired';
    conversationId?: Id<'agentConversations'>;
    now?: number;
  },
) {
  const type = args.status === 'accepted' ? 'meeting_accepted' : 'meeting_declined';
  const basePayload = {
    status: args.status,
    conversationId: args.conversationId,
  };

  await writeInboxEvent(ctx, {
    recipientAgentId: args.requesterAgentId,
    actorAgentId: args.actorAgentId,
    type,
    dedupeKey: `meeting-status:${args.meetingId}:${args.status}:${args.requesterAgentId}`,
    recommendationId: args.recommendationId,
    meetingId: args.meetingId,
    conversationId: args.conversationId,
    payload: basePayload,
    now: args.now,
  });

  await writeInboxEvent(ctx, {
    recipientAgentId: args.responderAgentId,
    actorAgentId: args.actorAgentId,
    type,
    dedupeKey: `meeting-status:${args.meetingId}:${args.status}:${args.responderAgentId}`,
    recommendationId: args.recommendationId,
    meetingId: args.meetingId,
    conversationId: args.conversationId,
    payload: basePayload,
    now: args.now,
  });
}

export async function writeConversationMessageInboxEvent(
  ctx: MutationCtx,
  args: {
    recipientAgentId: Id<'networkAgents'>;
    authorAgentId: Id<'networkAgents'>;
    conversationId: Id<'agentConversations'>;
    messageId: Id<'agentMessages'>;
    clientMessageId: string;
    now?: number;
  },
) {
  return await writeInboxEvent(ctx, {
    recipientAgentId: args.recipientAgentId,
    actorAgentId: args.authorAgentId,
    type: 'conversation_message',
    dedupeKey: `conversation-message:${args.messageId}`,
    conversationId: args.conversationId,
    messageId: args.messageId,
    payload: {
      clientMessageId: args.clientMessageId,
    },
    now: args.now,
  });
}

export async function writeIntroCandidateInboxEvent(
  ctx: MutationCtx,
  args: {
    recipientAgentId: Id<'networkAgents'>;
    actorAgentId?: Id<'networkAgents'>;
    introCandidateId: Id<'introCandidates'>;
    meetingId?: Id<'meetings'>;
    conversationId?: Id<'agentConversations'>;
    payload?: InboxPayload;
    now?: number;
  },
) {
  return await writeInboxEvent(ctx, {
    recipientAgentId: args.recipientAgentId,
    actorAgentId: args.actorAgentId,
    type: 'intro_candidate',
    dedupeKey: `intro-candidate:${args.introCandidateId}:${args.recipientAgentId}`,
    introCandidateId: args.introCandidateId,
    meetingId: args.meetingId,
    conversationId: args.conversationId,
    payload: args.payload,
    now: args.now,
  });
}

function parseInboxEventStatus(value: string): InboxEventStatus {
  if (!isInboxEventStatus(value)) {
    throw networkingError('invalid_inbox_event_status', `Unsupported inbox event status: ${value}`);
  }
  return value;
}

function normalizeLimit(limit: number | undefined) {
  if (limit === undefined) {
    return 50;
  }
  if (!Number.isFinite(limit) || limit <= 0) {
    throw networkingError('invalid_inbox_event_status', 'Inbox limit must be a positive number.');
  }
  return Math.min(200, Math.floor(limit));
}
