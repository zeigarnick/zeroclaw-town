import { v } from 'convex/values';
import { Doc } from '../_generated/dataModel';
import { MutationCtx, QueryCtx, mutation, query } from '../_generated/server';
import { insertInput } from '../aiTown/insertInput';
import { networkingError } from './auth';
import { normalizeEventId } from './eventAgents';
import { ensurePublicEventMarkerSlug } from './eventMarkerIdentity';
import { ensureEventWorldAvatars } from './eventWorlds';
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
  requesterMarkerSlug?: string;
  targetMarkerSlug?: string;
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

export const repairEventActivityMarkerSlugs = mutation({
  args: {
    eventId: v.string(),
    limit: v.optional(v.number()),
  },
  handler: (ctx, args) => repairEventActivityMarkerSlugsHandler(ctx, args),
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
  const [requesterMarkerSlug, targetMarkerSlug] = await Promise.all([
    ensurePublicEventMarkerSlug(ctx, requester, now),
    ensurePublicEventMarkerSlug(ctx, target, now),
  ]);

  const activityId = await ctx.db.insert('eventActivityEvents', {
    eventId: intent.eventId,
    type: 'match_created',
    requesterDisplayName: requester.displayName,
    targetDisplayName: target.displayName,
    requesterMarkerSlug,
    targetMarkerSlug,
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
  await incrementEventMatchActivityAggregate(ctx, intent.eventId, now);
  await queueEventMatchMovementForActivity(ctx, activity, now);
  return toEventActivityView(activity);
}

export async function queuePendingEventMatchMovements(
  ctx: MutationCtx,
  eventSpace: Doc<'eventSpaces'>,
  selection: { now?: number } = {},
) {
  const now = selection.now ?? Date.now();
  const events = await ctx.db
    .query('eventActivityEvents')
    .withIndex('by_event_type_created_at', (q) =>
      q.eq('eventId', eventSpace.eventId).eq('type', 'match_created'),
    )
    .order('desc')
    .take(20);
  let enqueued = 0;
  let skipped = 0;
  for (const event of events) {
    if (event.movementQueuedAt) {
      skipped += 1;
      continue;
    }
    const queued = await queueEventMatchMovementForActivity(ctx, event, now);
    if (queued) {
      enqueued += 1;
    } else {
      skipped += 1;
    }
  }
  return { enqueued, skipped };
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
    .order('desc')
    .take(limit);

  return events.map(toEventActivityView);
}

export async function getEventMatchActivityCount(ctx: QueryCtx, eventId: string) {
  const normalizedEventId = normalizeEventId(eventId);
  const aggregate = await ctx.db
    .query('eventActivityAggregates')
    .withIndex('by_event_id', (q) => q.eq('eventId', normalizedEventId))
    .first();
  return aggregate?.matchCount ?? 0;
}

export async function repairEventActivityMarkerSlugsHandler(
  ctx: MutationCtx,
  args: { eventId: string; limit?: number },
) {
  const eventId = normalizeEventId(args.eventId);
  const limit = normalizeLimit(args.limit);
  const events = await ctx.db
    .query('eventActivityEvents')
    .withIndex('by_event_type_created_at', (q) =>
      q.eq('eventId', eventId).eq('type', 'match_created'),
    )
    .order('desc')
    .take(limit);
  const now = Date.now();
  let repairedCount = 0;
  let skippedCount = 0;

  for (const activity of events) {
    if (
      isPublicEventMarkerSlug(activity.requesterMarkerSlug) &&
      isPublicEventMarkerSlug(activity.targetMarkerSlug)
    ) {
      continue;
    }

    const intent = await ctx.db.get(activity.sourceIntentId);
    if (!intent || intent.eventId !== eventId) {
      skippedCount += 1;
      continue;
    }
    const [requester, target] = await Promise.all([
      ctx.db.get(intent.requesterAgentId),
      ctx.db.get(intent.targetAgentId),
    ]);
    if (
      !requester ||
      !target ||
      requester.eventId !== eventId ||
      target.eventId !== eventId
    ) {
      skippedCount += 1;
      continue;
    }
    const [requesterMarkerSlug, targetMarkerSlug] = await Promise.all([
      ensurePublicEventMarkerSlug(ctx, requester, now),
      ensurePublicEventMarkerSlug(ctx, target, now),
    ]);
    await ctx.db.patch(activity._id, {
      requesterMarkerSlug,
      targetMarkerSlug,
      updatedAt: now,
    });
    repairedCount += 1;
  }

  return { eventId, repairedCount, skippedCount };
}

function toEventActivityView(activity: Doc<'eventActivityEvents'>): EventActivityView {
  return {
    type: activity.type,
    requesterDisplayName: activity.requesterDisplayName,
    targetDisplayName: activity.targetDisplayName,
    requesterMarkerSlug: sanitizePublicEventMarkerSlug(activity.requesterMarkerSlug),
    targetMarkerSlug: sanitizePublicEventMarkerSlug(activity.targetMarkerSlug),
    payload: activity.payload,
    createdAt: activity.createdAt,
    updatedAt: activity.updatedAt,
  };
}

async function queueEventMatchMovementForActivity(
  ctx: MutationCtx,
  activity: Doc<'eventActivityEvents'>,
  now: number,
) {
  if (activity.type !== 'match_created' || activity.movementQueuedAt) {
    return false;
  }
  const [eventSpace, intent] = await Promise.all([
    ctx.db
      .query('eventSpaces')
      .withIndex('by_event_id', (q) => q.eq('eventId', activity.eventId))
      .first(),
    ctx.db.get(activity.sourceIntentId),
  ]);
  if (!eventSpace || !intent || intent.eventId !== activity.eventId) {
    return false;
  }
  await ensureEventWorldAvatars(ctx, eventSpace, { now });
  const refreshedEventSpace = await ctx.db.get(eventSpace._id);
  if (!refreshedEventSpace?.worldId) {
    return false;
  }
  const [requester, target] = await Promise.all([
    ctx.db.get(intent.requesterAgentId),
    ctx.db.get(intent.targetAgentId),
  ]);
  if (
    !requester?.townPlayerId ||
    !target?.townPlayerId ||
    requester.eventId !== activity.eventId ||
    target.eventId !== activity.eventId
  ) {
    return false;
  }
  const inputId = await insertInput(ctx, refreshedEventSpace.worldId, 'moveEventMatchPair', {
    requesterPlayerId: requester.townPlayerId,
    targetPlayerId: target.townPlayerId,
  });
  await ctx.db.patch(activity._id, {
    movementInputId: inputId,
    movementQueuedAt: now,
    updatedAt: now,
  });
  return true;
}

function sanitizePublicEventMarkerSlug(markerSlug: string | undefined) {
  return isPublicEventMarkerSlug(markerSlug) ? markerSlug : undefined;
}

function isPublicEventMarkerSlug(markerSlug: string | undefined) {
  return markerSlug !== undefined && !markerSlug.startsWith('event-agent-');
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

async function incrementEventMatchActivityAggregate(
  ctx: MutationCtx,
  eventId: string,
  now: number,
) {
  const existing = await ctx.db
    .query('eventActivityAggregates')
    .withIndex('by_event_id', (q) => q.eq('eventId', eventId))
    .first();
  if (existing) {
    await ctx.db.patch(existing._id, {
      matchCount: existing.matchCount + 1,
      updatedAt: now,
    });
    return;
  }
  await ctx.db.insert('eventActivityAggregates', {
    eventId,
    matchCount: 1,
    createdAt: now,
    updatedAt: now,
  });
}
