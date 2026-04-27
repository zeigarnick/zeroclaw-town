import { v } from 'convex/values';
import { Doc, Id } from '../_generated/dataModel';
import { MutationCtx, QueryCtx, mutation, query } from '../_generated/server';
import { assertClaimedAgent, networkingError } from './auth';
import { writeConversationMessageInboxEvent } from './inbox';
import {
  MAX_CLIENT_MESSAGE_ID_LENGTH,
  MAX_MESSAGE_LENGTH,
  conversationStatuses,
  isConversationStatus,
  ConversationStatus,
} from './validators';

export const getConversation = query({
  args: {
    apiKey: v.string(),
    conversationId: v.id('agentConversations'),
  },
  handler: (ctx, args) => getConversationHandler(ctx, args),
});

export async function getConversationHandler(
  ctx: QueryCtx,
  args: { apiKey: string; conversationId: Id<'agentConversations'> },
) {
  const { agent } = await assertClaimedAgent(ctx, args.apiKey);
  return await getConversationForParticipantOrThrow(ctx, args.conversationId, agent._id);
}

export const listConversations = query({
  args: {
    apiKey: v.string(),
    status: v.optional(v.string()),
  },
  handler: (ctx, args) => listConversationsHandler(ctx, args),
});

export async function listConversationsHandler(
  ctx: QueryCtx,
  args: {
    apiKey: string;
    status?: string;
  },
) {
  const { agent } = await assertClaimedAgent(ctx, args.apiKey);
  const statuses = args.status ? [parseConversationStatus(args.status)] : [...conversationStatuses];
  const byId = new Map<Id<'agentConversations'>, Doc<'agentConversations'>>();

  for (const status of statuses) {
    const participantOneRows = await ctx.db
      .query('agentConversations')
      .withIndex('by_participant_one_status_updated_at', (q) =>
        q.eq('participantOneAgentId', agent._id).eq('status', status),
      )
      .collect();
    const participantTwoRows = await ctx.db
      .query('agentConversations')
      .withIndex('by_participant_two_status_updated_at', (q) =>
        q.eq('participantTwoAgentId', agent._id).eq('status', status),
      )
      .collect();

    for (const row of participantOneRows) {
      byId.set(row._id, row);
    }
    for (const row of participantTwoRows) {
      byId.set(row._id, row);
    }
  }

  return Array.from(byId.values()).sort((left, right) => right.updatedAt - left.updatedAt);
}

export const listMessages = query({
  args: {
    apiKey: v.string(),
    conversationId: v.id('agentConversations'),
  },
  handler: (ctx, args) => listMessagesHandler(ctx, args),
});

export async function listMessagesHandler(
  ctx: QueryCtx,
  args: { apiKey: string; conversationId: Id<'agentConversations'> },
) {
  const { agent } = await assertClaimedAgent(ctx, args.apiKey);
  await getConversationForParticipantOrThrow(ctx, args.conversationId, agent._id);

  return await ctx.db
    .query('agentMessages')
    .withIndex('by_conversation_created_at', (q) => q.eq('conversationId', args.conversationId))
    .collect();
}

export type TownConversationThread = Awaited<ReturnType<typeof listTownConversationsHandler>>[number];

export const listTownConversations = query({
  args: {
    agentId: v.id('networkAgents'),
  },
  handler: (ctx, args) => listTownConversationsHandler(ctx, args),
});

export async function listTownConversationsHandler(
  ctx: QueryCtx,
  args: { agentId: Id<'networkAgents'> },
) {
  const agent = await ctx.db.get(args.agentId);
  if (!agent || agent.status !== 'active') {
    return [];
  }

  const byId = new Map<Id<'agentConversations'>, Doc<'agentConversations'>>();
  for (const status of conversationStatuses) {
    const participantOneRows = await ctx.db
      .query('agentConversations')
      .withIndex('by_participant_one_status_updated_at', (q) =>
        q.eq('participantOneAgentId', agent._id).eq('status', status),
      )
      .collect();
    const participantTwoRows = await ctx.db
      .query('agentConversations')
      .withIndex('by_participant_two_status_updated_at', (q) =>
        q.eq('participantTwoAgentId', agent._id).eq('status', status),
      )
      .collect();
    for (const row of [...participantOneRows, ...participantTwoRows]) {
      byId.set(row._id, row);
    }
  }

  const threads = [];
  for (const conversation of Array.from(byId.values()).sort(
    (left, right) => right.updatedAt - left.updatedAt,
  )) {
    const participantOne = await ctx.db.get(conversation.participantOneAgentId);
    const participantTwo = await ctx.db.get(conversation.participantTwoAgentId);
    if (!participantOne || !participantTwo) {
      continue;
    }
    const messages = await ctx.db
      .query('agentMessages')
      .withIndex('by_conversation_created_at', (q) => q.eq('conversationId', conversation._id))
      .collect();
    const otherAgent =
      participantOne._id === agent._id
        ? participantTwo
        : participantTwo._id === agent._id
          ? participantOne
          : null;
    if (!otherAgent) {
      continue;
    }

    threads.push({
      conversationId: conversation._id,
      meetingId: conversation.meetingId,
      status: conversation.status,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
      closedAt: conversation.closedAt,
      closedByAgentId: conversation.closedByAgentId,
      selectedAgent: {
        agentId: agent._id,
        displayName: agent.displayName,
      },
      otherAgent: {
        agentId: otherAgent._id,
        displayName: otherAgent.displayName,
      },
      participants: [
        {
          agentId: participantOne._id,
          displayName: participantOne.displayName,
        },
        {
          agentId: participantTwo._id,
          displayName: participantTwo.displayName,
        },
      ],
      messages: messages.map((message) => ({
        messageId: message._id,
        authorAgentId: message.authorAgentId,
        authorDisplayName:
          message.authorAgentId === participantOne._id
            ? participantOne.displayName
            : participantTwo.displayName,
        recipientAgentId: message.recipientAgentId,
        clientMessageId: message.clientMessageId,
        body: message.body,
        createdAt: message.createdAt,
      })),
    });
  }

  return threads;
}

export const sendMessage = mutation({
  args: {
    apiKey: v.string(),
    conversationId: v.id('agentConversations'),
    clientMessageId: v.string(),
    body: v.string(),
  },
  handler: (ctx, args) => sendMessageHandler(ctx, args),
});

export async function sendMessageHandler(
  ctx: MutationCtx,
  args: {
    apiKey: string;
    conversationId: Id<'agentConversations'>;
    clientMessageId: string;
    body: string;
  },
) {
  const { agent } = await assertClaimedAgent(ctx, args.apiKey);
  const conversation = await getConversationForParticipantOrThrow(
    ctx,
    args.conversationId,
    agent._id,
  );

  if (conversation.status !== 'open') {
    throw networkingError('conversation_closed', 'Messages cannot be sent to a closed conversation.');
  }

  const clientMessageId = normalizeClientMessageId(args.clientMessageId);
  const existing = await ctx.db
    .query('agentMessages')
    .withIndex('by_conversation_client_message_id', (q) =>
      q.eq('conversationId', conversation._id).eq('clientMessageId', clientMessageId),
    )
    .first();
  if (existing) {
    if (existing.authorAgentId === agent._id) {
      return existing;
    }
    throw networkingError(
      'duplicate_client_message_id',
      'Client message ID is already in use for this conversation.',
    );
  }

  const body = normalizeBody(args.body);
  const recipientAgentId = getOtherParticipantId(conversation, agent._id);
  const now = Date.now();

  const messageId = await ctx.db.insert('agentMessages', {
    conversationId: conversation._id,
    authorAgentId: agent._id,
    recipientAgentId,
    clientMessageId,
    body,
    createdAt: now,
  });

  await ctx.db.patch(conversation._id, {
    updatedAt: now,
  });

  await writeConversationMessageInboxEvent(ctx, {
    recipientAgentId,
    authorAgentId: agent._id,
    conversationId: conversation._id,
    messageId,
    clientMessageId,
    now,
  });

  const message = await ctx.db.get(messageId);
  if (!message) {
    throw networkingError('conversation_not_found', 'The sent message could not be loaded.');
  }
  return message;
}

export const closeConversation = mutation({
  args: {
    apiKey: v.string(),
    conversationId: v.id('agentConversations'),
  },
  handler: (ctx, args) => closeConversationHandler(ctx, args),
});

export async function closeConversationHandler(
  ctx: MutationCtx,
  args: {
    apiKey: string;
    conversationId: Id<'agentConversations'>;
  },
) {
  const { agent } = await assertClaimedAgent(ctx, args.apiKey);
  const conversation = await getConversationForParticipantOrThrow(
    ctx,
    args.conversationId,
    agent._id,
  );

  if (conversation.status === 'closed') {
    return conversation;
  }

  const now = Date.now();
  await ctx.db.patch(conversation._id, {
    status: 'closed',
    closedByAgentId: agent._id,
    closedAt: now,
    updatedAt: now,
  });

  const updated = await ctx.db.get(conversation._id);
  if (!updated) {
    throw networkingError('conversation_not_found', 'The closed conversation could not be loaded.');
  }
  return updated;
}

export async function getConversationForParticipantOrThrow(
  ctx: MutationCtx | QueryCtx,
  conversationId: Id<'agentConversations'>,
  participantAgentId: Id<'networkAgents'>,
) {
  const conversation = await ctx.db.get(conversationId);
  if (!conversation) {
    throw networkingError('conversation_not_found', 'The conversation does not exist.');
  }

  if (
    conversation.participantOneAgentId !== participantAgentId &&
    conversation.participantTwoAgentId !== participantAgentId
  ) {
    throw networkingError(
      'conversation_access_denied',
      'The authenticated agent is not a participant of this conversation.',
    );
  }

  return conversation;
}

function getOtherParticipantId(
  conversation: Pick<
    Doc<'agentConversations'>,
    'participantOneAgentId' | 'participantTwoAgentId'
  >,
  participantAgentId: Id<'networkAgents'>,
) {
  if (conversation.participantOneAgentId === participantAgentId) {
    return conversation.participantTwoAgentId;
  }
  if (conversation.participantTwoAgentId === participantAgentId) {
    return conversation.participantOneAgentId;
  }

  throw networkingError(
    'conversation_access_denied',
    'The authenticated agent is not a participant of this conversation.',
  );
}

function parseConversationStatus(value: string): ConversationStatus {
  if (!isConversationStatus(value)) {
    throw networkingError(
      'invalid_conversation_status',
      `Unsupported conversation status: ${value}`,
    );
  }
  return value;
}

function normalizeClientMessageId(value: string) {
  const normalized = value.trim();
  if (!normalized) {
    throw networkingError('invalid_message_client_id', 'Client message ID is required.');
  }
  if (normalized.length > MAX_CLIENT_MESSAGE_ID_LENGTH) {
    throw networkingError(
      'invalid_message_client_id',
      `Client message ID must be ${MAX_CLIENT_MESSAGE_ID_LENGTH} characters or less.`,
    );
  }
  return normalized;
}

function normalizeBody(value: string) {
  const normalized = value.trim();
  if (!normalized) {
    throw networkingError('invalid_message_body', 'Message body is required.');
  }
  if (normalized.length > MAX_MESSAGE_LENGTH) {
    throw networkingError(
      'message_too_long',
      `Message body must be ${MAX_MESSAGE_LENGTH} characters or less.`,
    );
  }
  return normalized;
}
