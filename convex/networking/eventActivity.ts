import { v } from 'convex/values';
import { Doc } from '../_generated/dataModel';
import { MutationCtx, QueryCtx, query } from '../_generated/server';
import { networkingError } from './auth';
import { normalizeEventId } from './eventAgents';
import { EventActivityType } from './validators';

const DEFAULT_EVENT_ACTIVITY_LIMIT = 12;
const MAX_EVENT_ACTIVITY_LIMIT = 50;

type EventActivityPayload = {
  matchKind: 'recipient_approved';
};

export type EventActivityView = {
  type: EventActivityType;
  requesterDisplayName: string;
  targetDisplayName: string;
  payload: EventActivityPayload;
  createdAt: number;
  updatedAt: number;
};

export const listRecentEventActivity = query({
  args: {
    eventId: v.string(),
    limit: v.optional(v.number()),
  },
  handler: (ctx, args) => listRecentEventActivityHandler(ctx, args),
});

export async function createMatchActivityForApprovedIntent(
  ctx: MutationCtx,
  intent: Doc<'eventConnectionIntents'>,
  now: number,
) {
  if (intent.status !== 'recipient_approved') {
    return null;
  }

  const [requester, target] = await Promise.all([
    ctx.db.get(intent.requesterAgentId),
    ctx.db.get(intent.targetAgentId),
  ]);
  if (
    !requester ||
    !target ||
    requester.eventId !== intent.eventId ||
    target.eventId !== intent.eventId ||
    requester.approvalStatus !== 'approved' ||
    target.approvalStatus !== 'approved'
  ) {
    throw networkingError(
      'event_agent_not_found',
      'Approved connection intent participants could not be loaded.',
    );
  }

  const activityId = await ctx.db.insert('eventActivityEvents', {
    eventId: intent.eventId,
    type: 'match_created',
    requesterDisplayName: requester.displayName,
    targetDisplayName: target.displayName,
    sourceIntentId: intent._id,
    payload: {
      matchKind: 'recipient_approved',
    },
    createdAt: now,
    updatedAt: now,
  });
  const activity = await ctx.db.get(activityId);
  if (!activity) {
    throw networkingError('event_activity_not_found', 'The event activity could not be loaded.');
  }
  return toEventActivityView(activity);
}

export async function listRecentEventActivityHandler(
  ctx: QueryCtx,
  args: { eventId: string; limit?: number },
): Promise<EventActivityView[]> {
  const eventId = normalizeEventId(args.eventId);
  const limit = normalizeLimit(args.limit);
  const events = await ctx.db
    .query('eventActivityEvents')
    .withIndex('by_event_type_created_at', (q) =>
      q.eq('eventId', eventId).eq('type', 'match_created'),
    )
    .collect();

  return events
    .sort((left, right) => right.createdAt - left.createdAt)
    .slice(0, limit)
    .map(toEventActivityView);
}

export async function countEventMatchActivities(ctx: QueryCtx, eventId: string) {
  const normalizedEventId = normalizeEventId(eventId);
  const events = await ctx.db
    .query('eventActivityEvents')
    .withIndex('by_event_type_created_at', (q) =>
      q.eq('eventId', normalizedEventId).eq('type', 'match_created'),
    )
    .collect();
  return events.length;
}

function toEventActivityView(activity: Doc<'eventActivityEvents'>): EventActivityView {
  return {
    type: activity.type,
    requesterDisplayName: activity.requesterDisplayName,
    targetDisplayName: activity.targetDisplayName,
    payload: activity.payload,
    createdAt: activity.createdAt,
    updatedAt: activity.updatedAt,
  };
}

function normalizeLimit(limit: number | undefined) {
  if (limit === undefined) {
    return DEFAULT_EVENT_ACTIVITY_LIMIT;
  }
  if (!Number.isFinite(limit)) {
    return DEFAULT_EVENT_ACTIVITY_LIMIT;
  }
  return Math.max(1, Math.min(MAX_EVENT_ACTIVITY_LIMIT, Math.floor(limit)));
}
