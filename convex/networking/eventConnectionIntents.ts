import { v } from 'convex/values';
import { Doc, Id } from '../_generated/dataModel';
import { MutationCtx, QueryCtx, mutation, query } from '../_generated/server';
import { networkingError } from './auth';
import { authenticateApprovedEventOwnerSession, normalizeEventId } from './eventAgents';
import { EventPublicCardView, toEventPublicCardView } from './eventCards';
import { enforceEventRateLimit } from './eventRateLimits';
import { evaluateRecipientRules } from './eventRecipientRules';
import { EventConnectionIntentStatus } from './validators';

export type EventConnectionIntentView = {
  id: Id<'eventConnectionIntents'>;
  eventId: string;
  requesterAgentId: Id<'eventAgents'>;
  targetAgentId: Id<'eventAgents'>;
  status: EventConnectionIntentStatus;
  filterResult: {
    allowed: boolean;
    reasons: string[];
    evaluatedAt: number;
  };
  createdAt: number;
  updatedAt: number;
};

export type EventInboundIntentReview = {
  intent: EventConnectionIntentView;
  requester: EventPublicCardView;
};

type CreateEventConnectionIntentArgs = {
  eventId: string;
  requesterAgentId: string;
  targetAgentId: string;
  requesterOwnerSessionToken: string;
};

const ACTIVE_INTENT_STATUSES = ['pending_recipient_review', 'recipient_approved'] as const;

export const createEventConnectionIntent = mutation({
  args: {
    eventId: v.string(),
    requesterAgentId: v.string(),
    targetAgentId: v.string(),
    requesterOwnerSessionToken: v.string(),
  },
  handler: (ctx, args) => createEventConnectionIntentHandler(ctx, args),
});

export const listEventInboundIntents = query({
  args: {
    eventId: v.string(),
    targetAgentId: v.string(),
    ownerSessionToken: v.string(),
  },
  handler: (ctx, args) => listEventInboundIntentsHandler(ctx, args),
});

export async function createEventConnectionIntentHandler(
  ctx: MutationCtx,
  args: CreateEventConnectionIntentArgs,
): Promise<EventConnectionIntentView> {
  const eventId = normalizeEventId(args.eventId);
  const requesterAgentId = normalizeEventAgentId(ctx, args.requesterAgentId, 'requesterAgentId');
  const targetAgentId = normalizeEventAgentId(ctx, args.targetAgentId, 'targetAgentId');
  if (requesterAgentId === targetAgentId) {
    throw networkingError(
      'invalid_event_connection_intent',
      'requesterAgentId and targetAgentId must be different event agents.',
    );
  }
  await enforceEventRateLimit(ctx, 'eventConnectionIntent', [
    eventId,
    requesterAgentId,
    targetAgentId,
  ]);

  const [requester, target] = await Promise.all([
    ctx.db.get(requesterAgentId),
    ctx.db.get(targetAgentId),
  ]);
  assertApprovedEventAgent(requester, eventId, 'requesterAgentId');
  assertApprovedEventAgent(target, eventId, 'targetAgentId');
  await authenticateApprovedEventOwnerSession(ctx, {
    eventId,
    eventAgentId: requester._id,
    ownerSessionToken: args.requesterOwnerSessionToken,
  });

  const [requesterCard, targetCard] = await Promise.all([
    getApprovedActiveCard(ctx, requester),
    getApprovedActiveCard(ctx, target),
  ]);
  const filterResult = await evaluateRecipientRules(ctx, {
    eventId,
    requesterAgent: requester,
    requesterCard,
    recipientAgent: target,
  });
  const dedupeKey = getIntentDedupeKey(eventId, requester._id, target._id);
  const existing = await ctx.db
    .query('eventConnectionIntents')
    .withIndex('by_dedupe_key', (q) => q.eq('dedupeKey', dedupeKey))
    .first();
  if (existing && ACTIVE_INTENT_STATUSES.includes(existing.status as any)) {
    throw networkingError(
      'duplicate_event_connection_intent',
      'An active connection intent already exists for these event agents.',
    );
  }

  const now = Date.now();
  const intentId = await ctx.db.insert('eventConnectionIntents', {
    eventId,
    requesterAgentId: requester._id,
    targetAgentId: target._id,
    requesterCardId: requesterCard._id,
    targetCardId: targetCard._id,
    status: filterResult.allowed ? 'pending_recipient_review' : 'auto_rejected',
    dedupeKey,
    filterResult,
    auditMetadata: {
      source: 'event_connection_intent_api',
      requesterOwnerApprovalExternal: true,
    },
    createdAt: now,
    updatedAt: now,
  });
  const intent = await ctx.db.get(intentId);
  if (!intent) {
    throw networkingError(
      'event_connection_intent_not_found',
      'The connection intent could not be loaded.',
    );
  }
  return toEventConnectionIntentView(intent);
}

export async function listEventInboundIntentsHandler(
  ctx: QueryCtx,
  args: { eventId: string; targetAgentId: string; ownerSessionToken: string },
): Promise<EventInboundIntentReview[]> {
  const eventId = normalizeEventId(args.eventId);
  const targetAgentId = normalizeEventAgentId(ctx, args.targetAgentId, 'targetAgentId');
  const target = await ctx.db.get(targetAgentId);
  assertApprovedEventAgent(target, eventId, 'targetAgentId');
  await authenticateApprovedEventOwnerSession(ctx, {
    eventId,
    eventAgentId: target._id,
    ownerSessionToken: args.ownerSessionToken,
  });

  const intents = await ctx.db
    .query('eventConnectionIntents')
    .withIndex('by_target_and_status', (q) =>
      q.eq('targetAgentId', targetAgentId).eq('status', 'pending_recipient_review'),
    )
    .collect();

  const reviews: EventInboundIntentReview[] = [];
  for (const intent of intents) {
    if (intent.eventId !== eventId) {
      continue;
    }
    const [requesterAgent, requesterCard] = await Promise.all([
      ctx.db.get(intent.requesterAgentId),
      ctx.db.get(intent.requesterCardId),
    ]);
    if (
      !requesterAgent ||
      !requesterCard ||
      requesterAgent.approvalStatus !== 'approved' ||
      requesterCard.status !== 'approved' ||
      requesterAgent.eventId !== eventId ||
      requesterCard.eventId !== eventId
    ) {
      continue;
    }
    reviews.push({
      intent: toEventConnectionIntentView(intent),
      requester: toEventPublicCardView(requesterAgent, requesterCard),
    });
  }

  return reviews.sort((left, right) => right.intent.createdAt - left.intent.createdAt);
}

export function toEventConnectionIntentView(
  intent: Doc<'eventConnectionIntents'>,
): EventConnectionIntentView {
  return {
    id: intent._id,
    eventId: intent.eventId,
    requesterAgentId: intent.requesterAgentId,
    targetAgentId: intent.targetAgentId,
    status: intent.status,
    filterResult: intent.filterResult,
    createdAt: intent.createdAt,
    updatedAt: intent.updatedAt,
  };
}

function assertApprovedEventAgent(
  agent: Doc<'eventAgents'> | null,
  eventId: string,
  fieldName: string,
): asserts agent is Doc<'eventAgents'> {
  if (!agent || agent.eventId !== eventId) {
    throw networkingError(
      'event_agent_not_found',
      `${fieldName} must reference an event agent in this event.`,
    );
  }
  if (agent.approvalStatus !== 'approved' || !agent.activeCardId) {
    throw networkingError(
      'event_agent_not_approved',
      `${fieldName} must reference an approved event agent with an approved public card.`,
    );
  }
}

async function getApprovedActiveCard(ctx: MutationCtx, agent: Doc<'eventAgents'>) {
  if (!agent.activeCardId) {
    throw networkingError(
      'event_card_not_found',
      'Approved event agents must have an approved active public card.',
    );
  }
  const card = await ctx.db.get(agent.activeCardId);
  if (!card || card.eventId !== agent.eventId || card.status !== 'approved') {
    throw networkingError(
      'event_card_not_found',
      'Approved event agents must have an approved active public card.',
    );
  }
  return card;
}

function getIntentDedupeKey(
  eventId: string,
  requesterAgentId: Id<'eventAgents'>,
  targetAgentId: Id<'eventAgents'>,
) {
  return `${eventId}:${requesterAgentId}->${targetAgentId}`;
}

function normalizeEventAgentId(
  ctx: QueryCtx | MutationCtx,
  value: string,
  fieldName: string,
): Id<'eventAgents'> {
  const normalizeId = (ctx.db as { normalizeId?: QueryCtx['db']['normalizeId'] }).normalizeId;
  const eventAgentId = normalizeId
    ? normalizeId('eventAgents', value)
    : (value as Id<'eventAgents'>);
  if (!eventAgentId) {
    throw networkingError(
      'event_agent_not_found',
      `${fieldName} must reference an event agent in this event.`,
    );
  }
  return eventAgentId;
}
