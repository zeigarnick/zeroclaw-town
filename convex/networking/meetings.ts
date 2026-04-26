import { v } from 'convex/values';
import { Doc, Id } from '../_generated/dataModel';
import { MutationCtx, QueryCtx, mutation, query } from '../_generated/server';
import { assertClaimedAgent, networkingError } from './auth';
import { writeMeetingRequestInboxEvent, writeMeetingStatusInboxEvents } from './inbox';
import {
  MAX_MEETING_REQUEST_MESSAGE_LENGTH,
  MeetingStatus,
  isMeetingStatus,
  meetingStatuses,
} from './validators';

const DAY_MS = 24 * 60 * 60 * 1000;
const MEETING_REQUEST_EXPIRY_MS = 7 * DAY_MS;

export const requestMeeting = mutation({
  args: {
    apiKey: v.string(),
    recommendationId: v.id('recommendations'),
    requestMessage: v.optional(v.string()),
  },
  handler: (ctx, args) => requestMeetingHandler(ctx, args),
});

export async function requestMeetingHandler(
  ctx: MutationCtx,
  args: {
    apiKey: string;
    recommendationId: Id<'recommendations'>;
    requestMessage?: string;
  },
) {
  const { agent } = await assertClaimedAgent(ctx, args.apiKey);
  const recommendation = await ctx.db.get(args.recommendationId);
  if (!recommendation) {
    throw networkingError('recommendation_not_found', 'The recommendation does not exist.');
  }
  if (recommendation.recipientAgentId !== agent._id) {
    throw networkingError(
      'recommendation_access_denied',
      'Only the recommendation recipient can request a meeting.',
    );
  }
  if (recommendation.status !== 'active') {
    throw networkingError(
      'recommendation_not_actionable',
      'A meeting can only be requested from an active recommendation.',
    );
  }

  const existing = await ctx.db
    .query('meetings')
    .withIndex('by_recommendation', (q) => q.eq('recommendationId', recommendation._id))
    .first();
  if (existing) {
    return existing;
  }

  const requesterCard = await ctx.db.get(recommendation.recipientCardId);
  const responderCard = await ctx.db.get(recommendation.providerCardId);
  if (!requesterCard || !responderCard) {
    throw networkingError(
      'recommendation_not_actionable',
      'Recommendation cards are no longer available for meeting requests.',
    );
  }
  if (requesterCard.status !== 'active' || responderCard.status !== 'active') {
    throw networkingError(
      'recommendation_not_actionable',
      'Meeting requests require active matched cards.',
    );
  }

  const requestMessage = normalizeRequestMessage(args.requestMessage);
  const now = Date.now();
  const meetingId = await ctx.db.insert('meetings', {
    recommendationId: recommendation._id,
    requesterAgentId: recommendation.recipientAgentId,
    requesterCardId: recommendation.recipientCardId,
    responderAgentId: recommendation.providerAgentId,
    responderCardId: recommendation.providerCardId,
    cardPairKey: recommendation.cardPairKey,
    status: 'pending',
    requestMessage,
    outreachContext: {
      requesterCardSummary: requesterCard.summary,
      responderCardTitle: responderCard.title,
      requestedOutcome: requesterCard.desiredOutcome,
    },
    expiresAt: now + MEETING_REQUEST_EXPIRY_MS,
    createdAt: now,
    updatedAt: now,
  });

  const meeting = await ctx.db.get(meetingId);
  if (!meeting) {
    throw networkingError('meeting_not_found', 'The created meeting could not be loaded.');
  }

  await writeMeetingRequestInboxEvent(ctx, {
    meetingId: meeting._id,
    recommendationId: recommendation._id,
    requesterAgentId: meeting.requesterAgentId,
    responderAgentId: meeting.responderAgentId,
    requestMessage: meeting.requestMessage,
    outreachContext: meeting.outreachContext,
    now,
  });

  return meeting;
}

export const acceptMeeting = mutation({
  args: {
    apiKey: v.string(),
    meetingId: v.id('meetings'),
  },
  handler: (ctx, args) => acceptMeetingHandler(ctx, args),
});

export async function acceptMeetingHandler(
  ctx: MutationCtx,
  args: { apiKey: string; meetingId: Id<'meetings'> },
) {
  const { agent } = await assertClaimedAgent(ctx, args.apiKey);
  const meeting = await getMeetingForResponder(ctx, args.meetingId, agent._id);

  if (meeting.status === 'accepted') {
    const existingConversation = await findConversationForMeeting(ctx, meeting._id);
    if (existingConversation) {
      return {
        meeting,
        conversation: existingConversation,
      };
    }
  }

  assertPendingMeeting(meeting);
  const now = Date.now();
  const conversation =
    (await findConversationForMeeting(ctx, meeting._id)) ??
    (await createConversationForMeeting(ctx, meeting, now));

  await ctx.db.patch(meeting._id, {
    status: 'accepted',
    conversationId: conversation._id,
    respondedAt: now,
    updatedAt: now,
  });

  const recommendation = await ctx.db.get(meeting.recommendationId);
  if (recommendation) {
    await ctx.db.patch(recommendation._id, {
      status: 'consumed',
      updatedAt: now,
    });
  }

  await writeMeetingStatusInboxEvents(ctx, {
    meetingId: meeting._id,
    recommendationId: meeting.recommendationId,
    requesterAgentId: meeting.requesterAgentId,
    responderAgentId: meeting.responderAgentId,
    actorAgentId: agent._id,
    status: 'accepted',
    conversationId: conversation._id,
    now,
  });

  const updatedMeeting = await ctx.db.get(meeting._id);
  if (!updatedMeeting) {
    throw networkingError('meeting_not_found', 'The accepted meeting could not be loaded.');
  }

  return {
    meeting: updatedMeeting,
    conversation,
  };
}

export const declineMeeting = mutation({
  args: {
    apiKey: v.string(),
    meetingId: v.id('meetings'),
  },
  handler: (ctx, args) => declineMeetingHandler(ctx, args),
});

export async function declineMeetingHandler(
  ctx: MutationCtx,
  args: { apiKey: string; meetingId: Id<'meetings'> },
) {
  const { agent } = await assertClaimedAgent(ctx, args.apiKey);
  const meeting = await getMeetingForResponder(ctx, args.meetingId, agent._id);

  if (meeting.status === 'declined') {
    return meeting;
  }

  assertPendingMeeting(meeting);
  const now = Date.now();
  await ctx.db.patch(meeting._id, {
    status: 'declined',
    declinedByAgentId: agent._id,
    respondedAt: now,
    updatedAt: now,
  });

  const recommendation = await ctx.db.get(meeting.recommendationId);
  if (recommendation) {
    await ctx.db.patch(recommendation._id, {
      status: 'declined',
      updatedAt: now,
    });

    await ensureDeclineSuppression(ctx, {
      recommendation,
      now,
    });
  }

  await writeMeetingStatusInboxEvents(ctx, {
    meetingId: meeting._id,
    recommendationId: meeting.recommendationId,
    requesterAgentId: meeting.requesterAgentId,
    responderAgentId: meeting.responderAgentId,
    actorAgentId: agent._id,
    status: 'declined',
    now,
  });

  const updatedMeeting = await ctx.db.get(meeting._id);
  if (!updatedMeeting) {
    throw networkingError('meeting_not_found', 'The declined meeting could not be loaded.');
  }
  return updatedMeeting;
}

export const expireMeeting = mutation({
  args: {
    apiKey: v.string(),
    meetingId: v.id('meetings'),
  },
  handler: (ctx, args) => expireMeetingHandler(ctx, args),
});

export async function expireMeetingHandler(
  ctx: MutationCtx,
  args: { apiKey: string; meetingId: Id<'meetings'> },
) {
  const { agent } = await assertClaimedAgent(ctx, args.apiKey);
  const meeting = await getMeetingForParticipant(ctx, args.meetingId, agent._id);

  if (meeting.status === 'expired') {
    return meeting;
  }

  assertPendingMeeting(meeting);
  const now = Date.now();
  await ctx.db.patch(meeting._id, {
    status: 'expired',
    respondedAt: now,
    updatedAt: now,
  });

  const recommendation = await ctx.db.get(meeting.recommendationId);
  if (recommendation && recommendation.status === 'active') {
    await ctx.db.patch(recommendation._id, {
      status: 'stale',
      staleReason: 'meeting_expired',
      updatedAt: now,
    });
  }

  await writeMeetingStatusInboxEvents(ctx, {
    meetingId: meeting._id,
    recommendationId: meeting.recommendationId,
    requesterAgentId: meeting.requesterAgentId,
    responderAgentId: meeting.responderAgentId,
    actorAgentId: agent._id,
    status: 'expired',
    now,
  });

  const updatedMeeting = await ctx.db.get(meeting._id);
  if (!updatedMeeting) {
    throw networkingError('meeting_not_found', 'The expired meeting could not be loaded.');
  }
  return updatedMeeting;
}

export const getMeeting = query({
  args: {
    apiKey: v.string(),
    meetingId: v.id('meetings'),
  },
  handler: (ctx, args) => getMeetingHandler(ctx, args),
});

export async function getMeetingHandler(
  ctx: QueryCtx,
  args: { apiKey: string; meetingId: Id<'meetings'> },
) {
  const { agent } = await assertClaimedAgent(ctx, args.apiKey);
  return await getMeetingForParticipant(ctx, args.meetingId, agent._id);
}

export const listMeetings = query({
  args: {
    apiKey: v.string(),
    status: v.optional(v.string()),
  },
  handler: (ctx, args) => listMeetingsHandler(ctx, args),
});

export async function listMeetingsHandler(
  ctx: QueryCtx,
  args: {
    apiKey: string;
    status?: string;
  },
) {
  const { agent } = await assertClaimedAgent(ctx, args.apiKey);
  const statuses = args.status ? [parseMeetingStatus(args.status)] : [...meetingStatuses];

  const byId = new Map<Id<'meetings'>, Doc<'meetings'>>();
  for (const status of statuses) {
    const requesterMeetings = await ctx.db
      .query('meetings')
      .withIndex('by_requester_status_created_at', (q) =>
        q.eq('requesterAgentId', agent._id).eq('status', status),
      )
      .collect();
    const responderMeetings = await ctx.db
      .query('meetings')
      .withIndex('by_responder_status_created_at', (q) =>
        q.eq('responderAgentId', agent._id).eq('status', status),
      )
      .collect();

    for (const meeting of requesterMeetings) {
      byId.set(meeting._id, meeting);
    }
    for (const meeting of responderMeetings) {
      byId.set(meeting._id, meeting);
    }
  }

  return Array.from(byId.values()).sort((left, right) => right.createdAt - left.createdAt);
}

async function getMeetingForResponder(
  ctx: MutationCtx | QueryCtx,
  meetingId: Id<'meetings'>,
  responderAgentId: Id<'networkAgents'>,
) {
  const meeting = await ctx.db.get(meetingId);
  if (!meeting) {
    throw networkingError('meeting_not_found', 'The requested meeting does not exist.');
  }
  if (meeting.responderAgentId !== responderAgentId) {
    throw networkingError(
      'meeting_access_denied',
      'Only the offer-side agent can accept or decline this meeting request.',
    );
  }
  return meeting;
}

async function getMeetingForParticipant(
  ctx: MutationCtx | QueryCtx,
  meetingId: Id<'meetings'>,
  participantAgentId: Id<'networkAgents'>,
) {
  const meeting = await ctx.db.get(meetingId);
  if (!meeting) {
    throw networkingError('meeting_not_found', 'The requested meeting does not exist.');
  }
  if (
    meeting.requesterAgentId !== participantAgentId &&
    meeting.responderAgentId !== participantAgentId
  ) {
    throw networkingError(
      'meeting_access_denied',
      'This meeting does not belong to the authenticated agent.',
    );
  }
  return meeting;
}

function assertPendingMeeting(meeting: Pick<Doc<'meetings'>, 'status'>) {
  if (meeting.status !== 'pending') {
    throw networkingError(
      'invalid_meeting_status',
      'Only pending meetings can transition through this action.',
    );
  }
}

async function findConversationForMeeting(
  ctx: MutationCtx,
  meetingId: Id<'meetings'>,
) {
  return await ctx.db
    .query('agentConversations')
    .withIndex('by_meeting', (q) => q.eq('meetingId', meetingId))
    .first();
}

async function createConversationForMeeting(
  ctx: MutationCtx,
  meeting: Doc<'meetings'>,
  now: number,
) {
  const conversationId = await ctx.db.insert('agentConversations', {
    meetingId: meeting._id,
    participantOneAgentId: meeting.requesterAgentId,
    participantTwoAgentId: meeting.responderAgentId,
    status: 'open',
    createdAt: now,
    updatedAt: now,
  });
  const conversation = await ctx.db.get(conversationId);
  if (!conversation) {
    throw networkingError('conversation_not_found', 'The created conversation could not be loaded.');
  }
  return conversation;
}

async function ensureDeclineSuppression(
  ctx: MutationCtx,
  args: { recommendation: Doc<'recommendations'>; now: number },
) {
  const existing = await ctx.db
    .query('recommendationSuppressions')
    .withIndex('by_card_pair', (q) => q.eq('cardPairKey', args.recommendation.cardPairKey))
    .first();

  if (existing) {
    await ctx.db.patch(existing._id, {
      reason: 'declined',
      updatedAt: args.now,
      sourceRecommendationId: args.recommendation._id,
    });
    return existing._id;
  }

  return await ctx.db.insert('recommendationSuppressions', {
    recipientAgentId: args.recommendation.recipientAgentId,
    recipientCardId: args.recommendation.recipientCardId,
    providerAgentId: args.recommendation.providerAgentId,
    providerCardId: args.recommendation.providerCardId,
    cardPairKey: args.recommendation.cardPairKey,
    reason: 'declined',
    sourceRecommendationId: args.recommendation._id,
    createdAt: args.now,
    updatedAt: args.now,
  });
}

function normalizeRequestMessage(value: string | undefined) {
  if (value === undefined) {
    return undefined;
  }
  const normalized = value.trim();
  if (!normalized) {
    return undefined;
  }
  if (normalized.length > MAX_MEETING_REQUEST_MESSAGE_LENGTH) {
    throw networkingError(
      'message_too_long',
      `Meeting request messages must be ${MAX_MEETING_REQUEST_MESSAGE_LENGTH} characters or less.`,
    );
  }
  return normalized;
}

function parseMeetingStatus(value: string): MeetingStatus {
  if (!isMeetingStatus(value)) {
    throw networkingError('invalid_meeting_status', `Unsupported meeting status: ${value}`);
  }
  return value;
}
