import { v } from 'convex/values';
import { Doc, Id } from '../_generated/dataModel';
import { MutationCtx, QueryCtx, mutation, query } from '../_generated/server';
import { assertClaimedAgent, networkingError } from './auth';
import { getConversationForParticipantOrThrow } from './conversations';
import { writeIntroCandidateInboxEvent } from './inbox';
import {
  IntroCandidateStatus,
  MAX_RECOMMENDED_NEXT_STEP_LENGTH,
  MAX_SUMMARY_LENGTH,
  introCandidateStatuses,
  isIntroCandidateStatus,
} from './validators';

const ACTIVE_INTRO_CANDIDATE_STATUSES: IntroCandidateStatus[] = ['pending_review', 'deferred'];

export const createIntroCandidate = mutation({
  args: {
    apiKey: v.string(),
    conversationId: v.id('agentConversations'),
    summary: v.string(),
    recommendedNextStep: v.string(),
    explicitlyQualified: v.optional(v.boolean()),
  },
  handler: (ctx, args) => createIntroCandidateHandler(ctx, args),
});

export async function createIntroCandidateHandler(
  ctx: MutationCtx,
  args: {
    apiKey: string;
    conversationId: Id<'agentConversations'>;
    summary: string;
    recommendedNextStep: string;
    explicitlyQualified?: boolean;
  },
) {
  const { agent } = await assertClaimedAgent(ctx, args.apiKey);
  const conversation = await getConversationForParticipantOrThrow(ctx, args.conversationId, agent._id);
  if (conversation.status !== 'closed' && !args.explicitlyQualified) {
    throw networkingError(
      'conversation_not_qualified',
      'Intro candidates require a closed conversation or explicit qualification.',
    );
  }

  const existingActive = await findExistingActiveIntroCandidate(ctx, conversation._id);
  if (existingActive) {
    return existingActive;
  }

  const meeting = await ctx.db.get(conversation.meetingId);
  if (!meeting) {
    throw networkingError('meeting_not_found', 'The source meeting does not exist.');
  }

  const summary = normalizeSummary(args.summary);
  const recommendedNextStep = normalizeRecommendedNextStep(args.recommendedNextStep);
  const now = Date.now();
  const introCandidateId = await ctx.db.insert('introCandidates', {
    meetingId: meeting._id,
    conversationId: conversation._id,
    requesterAgentId: meeting.requesterAgentId,
    requesterCardId: meeting.requesterCardId,
    responderAgentId: meeting.responderAgentId,
    responderCardId: meeting.responderCardId,
    summary,
    recommendedNextStep,
    status: 'pending_review',
    createdByAgentId: agent._id,
    qualificationMode:
      conversation.status === 'closed' ? 'conversation_closed' : 'explicit_qualification',
    createdAt: now,
    updatedAt: now,
  });

  await writeIntroCandidateInboxEvent(ctx, {
    recipientAgentId: meeting.requesterAgentId,
    actorAgentId: agent._id,
    introCandidateId,
    meetingId: meeting._id,
    conversationId: conversation._id,
    payload: { status: 'pending_review' as const },
    now,
  });
  await writeIntroCandidateInboxEvent(ctx, {
    recipientAgentId: meeting.responderAgentId,
    actorAgentId: agent._id,
    introCandidateId,
    meetingId: meeting._id,
    conversationId: conversation._id,
    payload: { status: 'pending_review' as const },
    now,
  });

  const introCandidate = await ctx.db.get(introCandidateId);
  if (!introCandidate) {
    throw networkingError('intro_candidate_not_found', 'The created intro candidate could not be loaded.');
  }
  return introCandidate;
}

export const approveIntroCandidate = mutation({
  args: {
    apiKey: v.string(),
    introCandidateId: v.id('introCandidates'),
  },
  handler: (ctx, args) => approveIntroCandidateHandler(ctx, args),
});

export const deferIntroCandidate = mutation({
  args: {
    apiKey: v.string(),
    introCandidateId: v.id('introCandidates'),
  },
  handler: (ctx, args) => deferIntroCandidateHandler(ctx, args),
});

export const dismissIntroCandidate = mutation({
  args: {
    apiKey: v.string(),
    introCandidateId: v.id('introCandidates'),
  },
  handler: (ctx, args) => dismissIntroCandidateHandler(ctx, args),
});

export const listIntroCandidates = query({
  args: {
    apiKey: v.string(),
    status: v.optional(v.string()),
  },
  handler: (ctx, args) => listIntroCandidatesHandler(ctx, args),
});

export async function listIntroCandidatesHandler(
  ctx: QueryCtx,
  args: {
    apiKey: string;
    status?: string;
  },
) {
  const { agent } = await assertClaimedAgent(ctx, args.apiKey);
  const statuses = args.status ? [parseIntroCandidateStatus(args.status)] : [...introCandidateStatuses];
  const byId = new Map<Id<'introCandidates'>, Doc<'introCandidates'>>();

  for (const status of statuses) {
    const requesterRows = await ctx.db
      .query('introCandidates')
      .withIndex('by_requester_status_created_at', (q) =>
        q.eq('requesterAgentId', agent._id).eq('status', status),
      )
      .collect();
    const responderRows = await ctx.db
      .query('introCandidates')
      .withIndex('by_responder_status_created_at', (q) =>
        q.eq('responderAgentId', agent._id).eq('status', status),
      )
      .collect();

    for (const row of requesterRows) {
      byId.set(row._id, row);
    }
    for (const row of responderRows) {
      byId.set(row._id, row);
    }
  }

  return Array.from(byId.values()).sort((left, right) => right.updatedAt - left.updatedAt);
}

export async function approveIntroCandidateHandler(
  ctx: MutationCtx,
  args: { apiKey: string; introCandidateId: Id<'introCandidates'> },
) {
  return await transitionIntroCandidateStatusHandler(ctx, args, 'approved');
}

export async function deferIntroCandidateHandler(
  ctx: MutationCtx,
  args: { apiKey: string; introCandidateId: Id<'introCandidates'> },
) {
  return await transitionIntroCandidateStatusHandler(ctx, args, 'deferred');
}

export async function dismissIntroCandidateHandler(
  ctx: MutationCtx,
  args: { apiKey: string; introCandidateId: Id<'introCandidates'> },
) {
  return await transitionIntroCandidateStatusHandler(ctx, args, 'dismissed');
}

async function transitionIntroCandidateStatusHandler(
  ctx: MutationCtx,
  args: { apiKey: string; introCandidateId: Id<'introCandidates'> },
  nextStatus: 'approved' | 'deferred' | 'dismissed',
) {
  const { agent } = await assertClaimedAgent(ctx, args.apiKey);
  const introCandidate = await getIntroCandidateForParticipantOrThrow(ctx, args.introCandidateId, agent._id);
  if (introCandidate.status === nextStatus) {
    return introCandidate;
  }
  if (
    (introCandidate.status === 'approved' || introCandidate.status === 'dismissed') &&
    introCandidate.status !== nextStatus
  ) {
    throw networkingError(
      'invalid_intro_candidate_status',
      'Finalized intro candidates cannot transition to another status.',
    );
  }

  const now = Date.now();
  await ctx.db.patch(introCandidate._id, {
    status: nextStatus,
    requesterReviewedAt:
      introCandidate.requesterAgentId === agent._id ? now : introCandidate.requesterReviewedAt,
    responderReviewedAt:
      introCandidate.responderAgentId === agent._id ? now : introCandidate.responderReviewedAt,
    updatedAt: now,
  });

  const updated = await ctx.db.get(introCandidate._id);
  if (!updated) {
    throw networkingError(
      'intro_candidate_not_found',
      'The updated intro candidate could not be loaded.',
    );
  }
  return updated;
}

async function getIntroCandidateForParticipantOrThrow(
  ctx: MutationCtx | QueryCtx,
  introCandidateId: Id<'introCandidates'>,
  participantAgentId: Id<'networkAgents'>,
) {
  const introCandidate = await ctx.db.get(introCandidateId);
  if (!introCandidate) {
    throw networkingError('intro_candidate_not_found', 'The intro candidate does not exist.');
  }
  if (
    introCandidate.requesterAgentId !== participantAgentId &&
    introCandidate.responderAgentId !== participantAgentId
  ) {
    throw networkingError(
      'intro_candidate_access_denied',
      'The authenticated agent is not a participant of this intro candidate.',
    );
  }
  return introCandidate;
}

async function findExistingActiveIntroCandidate(
  ctx: MutationCtx,
  conversationId: Id<'agentConversations'>,
) {
  const candidates: Array<Doc<'introCandidates'>> = [];
  for (const status of ACTIVE_INTRO_CANDIDATE_STATUSES) {
    const rows = await ctx.db
      .query('introCandidates')
      .withIndex('by_conversation_status_created_at', (q) =>
        q.eq('conversationId', conversationId).eq('status', status),
      )
      .collect();
    candidates.push(...rows);
  }
  if (candidates.length === 0) {
    return null;
  }
  return candidates.sort((left, right) => right.updatedAt - left.updatedAt)[0];
}

function parseIntroCandidateStatus(value: string): IntroCandidateStatus {
  if (!isIntroCandidateStatus(value)) {
    throw networkingError(
      'invalid_intro_candidate_status',
      `Unsupported intro candidate status: ${value}`,
    );
  }
  return value;
}

function normalizeSummary(value: string) {
  const normalized = value.trim();
  if (!normalized) {
    throw networkingError('invalid_intro_candidate_text', 'Intro candidate summary is required.');
  }
  if (normalized.length > MAX_SUMMARY_LENGTH) {
    throw networkingError(
      'summary_too_long',
      `Intro candidate summary must be ${MAX_SUMMARY_LENGTH} characters or less.`,
    );
  }
  return normalized;
}

function normalizeRecommendedNextStep(value: string) {
  const normalized = value.trim();
  if (!normalized) {
    throw networkingError('invalid_intro_candidate_text', 'Intro candidate next step is required.');
  }
  if (normalized.length > MAX_RECOMMENDED_NEXT_STEP_LENGTH) {
    throw networkingError(
      'details_too_long',
      `Intro candidate next step must be ${MAX_RECOMMENDED_NEXT_STEP_LENGTH} characters or less.`,
    );
  }
  return normalized;
}
