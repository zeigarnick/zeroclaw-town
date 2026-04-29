import { v } from 'convex/values';
import { Doc, Id } from '../_generated/dataModel';
import { MutationCtx, QueryCtx, mutation } from '../_generated/server';
import { networkingError } from './auth';
import { createEventWorld, ensureEventSpaceWorld } from './eventWorlds';
import { enforceEventRateLimit } from './eventRateLimits';
import { EventOrganizerAuditType, MAX_EVENT_REVIEW_NOTE_LENGTH } from './validators';

const MAX_SKILL_URL_LENGTH = 2048;
const DEFAULT_REVIEW_LIMIT = 50;
const MAX_REVIEW_LIMIT = 100;
const ORGANIZER_TOKEN_ENV_KEYS = [
  'OPENNETWORK_ORGANIZER_TOKEN',
  'EVENT_ORGANIZER_TOKEN',
  'NETWORKING_ORGANIZER_TOKEN',
] as const;

export type EventOrganizerAuditActorKind =
  | 'organizer'
  | 'event_agent'
  | 'public_requester'
  | 'system';

export type EventOrganizerAuditInput = {
  eventId: string;
  type: EventOrganizerAuditType;
  actorKind: EventOrganizerAuditActorKind;
  actorKey?: string;
  eventAgentId?: Id<'eventAgents'>;
  metadata?: unknown;
  now?: number;
};

export type SuspiciousEventRegistration = {
  eventAgentId: Id<'eventAgents'>;
  displayName: string;
  status: Doc<'eventAgents'>['approvalStatus'];
  reason: 'pending_owner_review' | 'revoked';
  createdAt: number;
  updatedAt: number;
};

export type HighVolumeRequester = {
  actorKey: string;
  count: number;
  eventAgentId?: Id<'eventAgents'>;
  types: EventOrganizerAuditType[];
  firstSeenAt: number;
  lastSeenAt: number;
};

export const pauseEventRegistration = mutation({
  args: {
    eventId: v.string(),
    organizerToken: v.string(),
    reason: v.optional(v.string()),
  },
  handler: (ctx, args) => pauseEventRegistrationHandler(ctx, args),
});

export const resumeEventRegistration = mutation({
  args: {
    eventId: v.string(),
    organizerToken: v.string(),
    reason: v.optional(v.string()),
  },
  handler: (ctx, args) => resumeEventRegistrationHandler(ctx, args),
});

export const rotateEventSkillUrl = mutation({
  args: {
    eventId: v.string(),
    organizerToken: v.string(),
    skillUrl: v.string(),
  },
  handler: (ctx, args) => rotateEventSkillUrlHandler(ctx, args),
});

export const revokeEventAgent = mutation({
  args: {
    eventId: v.string(),
    eventAgentId: v.id('eventAgents'),
    organizerToken: v.string(),
    reason: v.optional(v.string()),
  },
  handler: (ctx, args) => revokeEventAgentHandler(ctx, { ...args, remove: false }),
});

export const removeEventAgent = mutation({
  args: {
    eventId: v.string(),
    eventAgentId: v.id('eventAgents'),
    organizerToken: v.string(),
    reason: v.optional(v.string()),
  },
  handler: (ctx, args) => revokeEventAgentHandler(ctx, { ...args, remove: true }),
});

export const listSuspiciousRegistrations = mutation({
  args: {
    eventId: v.string(),
    organizerToken: v.string(),
    limit: v.optional(v.number()),
  },
  handler: (ctx, args) => listSuspiciousRegistrationsHandler(ctx, args),
});

export const listHighVolumeRequesters = mutation({
  args: {
    eventId: v.string(),
    organizerToken: v.string(),
    threshold: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: (ctx, args) => listHighVolumeRequestersHandler(ctx, args),
});

export async function pauseEventRegistrationHandler(
  ctx: MutationCtx,
  args: { eventId: string; organizerToken: string; reason?: string },
) {
  assertOrganizerCapability(args.organizerToken);
  const eventId = normalizeEventId(args.eventId);
  await enforceEventRateLimit(ctx, 'eventOrganizerAction', [eventId, 'pause']);
  const now = Date.now();
  const eventSpace = await getOrCreateEventSpace(ctx, eventId, now);
  await ctx.db.patch(eventSpace._id, {
    registrationStatus: 'paused',
    registrationPausedAt: now,
    updatedAt: now,
  });
  await writeEventOrganizerAuditEvent(ctx, {
    eventId,
    type: 'registration_paused',
    actorKind: 'organizer',
    actorKey: organizerActorKey(),
    metadata: { reason: normalizeOptionalReason(args.reason) },
    now,
  });
  return await mustGetEventSpace(ctx, eventSpace._id);
}

export async function resumeEventRegistrationHandler(
  ctx: MutationCtx,
  args: { eventId: string; organizerToken: string; reason?: string },
) {
  assertOrganizerCapability(args.organizerToken);
  const eventId = normalizeEventId(args.eventId);
  await enforceEventRateLimit(ctx, 'eventOrganizerAction', [eventId, 'resume']);
  const now = Date.now();
  const eventSpace = await getOrCreateEventSpace(ctx, eventId, now);
  await ctx.db.patch(eventSpace._id, {
    registrationStatus: 'open',
    updatedAt: now,
  });
  await writeEventOrganizerAuditEvent(ctx, {
    eventId,
    type: 'registration_resumed',
    actorKind: 'organizer',
    actorKey: organizerActorKey(),
    metadata: { reason: normalizeOptionalReason(args.reason) },
    now,
  });
  return await mustGetEventSpace(ctx, eventSpace._id);
}

export async function rotateEventSkillUrlHandler(
  ctx: MutationCtx,
  args: { eventId: string; organizerToken: string; skillUrl: string },
) {
  assertOrganizerCapability(args.organizerToken);
  const eventId = normalizeEventId(args.eventId);
  await enforceEventRateLimit(ctx, 'eventOrganizerAction', [eventId, 'rotate-skill-url']);
  const skillUrl = normalizeSkillUrl(args.skillUrl);
  const now = Date.now();
  const eventSpace = await getOrCreateEventSpace(ctx, eventId, now);
  await ctx.db.patch(eventSpace._id, {
    skillUrl,
    skillUrlRotatedAt: now,
    updatedAt: now,
  });
  await writeEventOrganizerAuditEvent(ctx, {
    eventId,
    type: 'skill_url_rotated',
    actorKind: 'organizer',
    actorKey: organizerActorKey(),
    metadata: { skillUrl },
    now,
  });
  return await mustGetEventSpace(ctx, eventSpace._id);
}

export async function revokeEventAgentHandler(
  ctx: MutationCtx,
  args: {
    eventId: string;
    eventAgentId: Id<'eventAgents'>;
    organizerToken: string;
    reason?: string;
    remove?: boolean;
  },
) {
  assertOrganizerCapability(args.organizerToken);
  const eventId = normalizeEventId(args.eventId);
  await enforceEventRateLimit(ctx, 'eventOrganizerAction', [
    eventId,
    args.remove ? 'remove-agent' : 'revoke-agent',
    args.eventAgentId,
  ]);
  const reason = normalizeOptionalReason(args.reason);
  const agent = await ctx.db.get(args.eventAgentId);
  if (!agent || agent.eventId !== eventId) {
    throw networkingError(
      'event_agent_not_found',
      'eventAgentId must reference an event agent in this event.',
    );
  }

  const now = Date.now();
  await ctx.db.patch(agent._id, {
    approvalStatus: 'revoked',
    activeCardId: undefined,
    updatedAt: now,
    revokedAt: now,
    revokedReason: reason,
  });

  const cards = await ctx.db
    .query('eventNetworkingCards')
    .withIndex('by_agent_and_status', (q) => q.eq('eventAgentId', agent._id).eq('status', 'approved'))
    .collect();
  const pendingCards = await ctx.db
    .query('eventNetworkingCards')
    .withIndex('by_agent_and_status', (q) =>
      q.eq('eventAgentId', agent._id).eq('status', 'pending_owner_review'),
    )
    .collect();
  for (const card of [...cards, ...pendingCards]) {
    await ctx.db.patch(card._id, {
      status: 'revoked',
      updatedAt: now,
      revokedAt: now,
      revokedReason: reason,
    });
  }

  const sessions = await ctx.db
    .query('eventOwnerSessions')
    .withIndex('by_agent', (q) => q.eq('eventAgentId', agent._id))
    .collect();
  for (const session of sessions) {
    await ctx.db.patch(session._id, {
      status: 'revoked',
      updatedAt: now,
      revokedAt: now,
    });
  }

  await writeEventOrganizerAuditEvent(ctx, {
    eventId,
    type: args.remove ? 'event_agent_removed' : 'event_agent_revoked',
    actorKind: 'organizer',
    actorKey: organizerActorKey(),
    eventAgentId: agent._id,
    metadata: { reason },
    now,
  });

  const updated = await ctx.db.get(agent._id);
  if (!updated) {
    throw networkingError('event_agent_not_found', 'The event agent could not be loaded.');
  }
  return updated;
}

export async function listSuspiciousRegistrationsHandler(
  ctx: MutationCtx,
  args: { eventId: string; organizerToken: string; limit?: number },
): Promise<SuspiciousEventRegistration[]> {
  assertOrganizerCapability(args.organizerToken);
  const eventId = normalizeEventId(args.eventId);
  await enforceEventRateLimit(ctx, 'eventOrganizerAction', [
    eventId,
    'list-suspicious-registrations',
  ]);
  const limit = normalizeLimit(args.limit);
  const agents = await ctx.db
    .query('eventAgents')
    .withIndex('by_event_updated_at', (q) => q.eq('eventId', eventId))
    .collect();

  return agents
    .filter(
      (agent) =>
        agent.approvalStatus === 'pending_owner_review' || agent.approvalStatus === 'revoked',
    )
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .slice(0, limit)
    .map((agent) => ({
      eventAgentId: agent._id,
      displayName: agent.displayName,
      status: agent.approvalStatus,
      reason: agent.approvalStatus === 'revoked' ? 'revoked' : 'pending_owner_review',
      createdAt: agent.createdAt,
      updatedAt: agent.updatedAt,
    }));
}

export async function listHighVolumeRequestersHandler(
  ctx: MutationCtx,
  args: { eventId: string; organizerToken: string; threshold?: number; limit?: number },
): Promise<HighVolumeRequester[]> {
  assertOrganizerCapability(args.organizerToken);
  const eventId = normalizeEventId(args.eventId);
  await enforceEventRateLimit(ctx, 'eventOrganizerAction', [
    eventId,
    'list-high-volume-requesters',
  ]);
  const threshold = Math.max(1, Math.floor(args.threshold ?? 3));
  const limit = normalizeLimit(args.limit);
  const auditEvents = await ctx.db
    .query('eventOrganizerAuditEvents')
    .withIndex('by_event_created_at', (q) => q.eq('eventId', eventId))
    .collect();

  const byActor = new Map<string, HighVolumeRequester>();
  for (const event of auditEvents) {
    if (!event.actorKey) {
      continue;
    }
    const existing = byActor.get(event.actorKey);
    if (!existing) {
      byActor.set(event.actorKey, {
        actorKey: event.actorKey,
        count: 1,
        eventAgentId: event.eventAgentId,
        types: [event.type],
        firstSeenAt: event.createdAt,
        lastSeenAt: event.createdAt,
      });
      continue;
    }
    existing.count += 1;
    if (!existing.types.includes(event.type)) {
      existing.types.push(event.type);
    }
    existing.firstSeenAt = Math.min(existing.firstSeenAt, event.createdAt);
    existing.lastSeenAt = Math.max(existing.lastSeenAt, event.createdAt);
  }

  return Array.from(byActor.values())
    .filter((row) => row.count >= threshold)
    .sort((left, right) => right.count - left.count || right.lastSeenAt - left.lastSeenAt)
    .slice(0, limit);
}

export async function writeEventOrganizerAuditEvent(
  ctx: MutationCtx,
  input: EventOrganizerAuditInput,
) {
  const eventId = normalizeEventId(input.eventId);
  await ctx.db.insert('eventOrganizerAuditEvents', {
    eventId,
    type: input.type,
    actorKind: input.actorKind,
    actorKey: input.actorKey,
    eventAgentId: input.eventAgentId,
    metadata: input.metadata,
    createdAt: input.now ?? Date.now(),
  });
}

export function assertOrganizerCapability(organizerToken: string) {
  const configuredToken = getConfiguredOrganizerToken();
  if (!configuredToken || organizerToken !== configuredToken) {
    throw networkingError(
      'invalid_event_organizer_token',
      'A configured organizer bearer token is required.',
    );
  }
}

function getConfiguredOrganizerToken() {
  for (const key of ORGANIZER_TOKEN_ENV_KEYS) {
    const value = process.env[key]?.trim();
    if (value) {
      return value;
    }
  }
  return undefined;
}

function organizerActorKey() {
  return 'configured-organizer';
}

async function getOrCreateEventSpace(ctx: MutationCtx, eventId: string, now: number) {
  const existing = await ctx.db
    .query('eventSpaces')
    .withIndex('by_event_id', (q) => q.eq('eventId', eventId))
    .first();
  if (existing) {
    return await ensureEventSpaceWorld(ctx, existing, { now });
  }
  const eventWorld = await createEventWorld(ctx, { now });
  const eventSpaceId = await ctx.db.insert('eventSpaces', {
    eventId,
    title: titleizeEventId(eventId),
    worldTemplateId: eventWorld.worldTemplateId,
    worldId: eventWorld.worldId,
    registrationStatus: 'open',
    createdAt: now,
    updatedAt: now,
  });
  return await mustGetEventSpace(ctx, eventSpaceId);
}

async function mustGetEventSpace(
  ctx: QueryCtx | MutationCtx,
  eventSpaceId: Id<'eventSpaces'>,
) {
  const eventSpace = await ctx.db.get(eventSpaceId);
  if (!eventSpace) {
    throw networkingError('event_agent_not_found', 'The event could not be loaded.');
  }
  return eventSpace;
}

function normalizeEventId(eventId: string) {
  const normalized = eventId.trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-');
  if (!normalized) {
    throw networkingError('invalid_public_field', 'eventId is required.');
  }
  return normalized;
}

function normalizeSkillUrl(skillUrl: string) {
  const normalized = skillUrl.trim();
  if (!normalized || normalized.length > MAX_SKILL_URL_LENGTH) {
    throw networkingError('invalid_public_field', 'skillUrl is invalid.');
  }
  try {
    const url = new URL(normalized);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      throw new Error('invalid protocol');
    }
  } catch {
    throw networkingError('invalid_public_field', 'skillUrl must be an absolute HTTP URL.');
  }
  return normalized;
}

function normalizeOptionalReason(reason: string | undefined) {
  if (reason === undefined) {
    return undefined;
  }
  const normalized = reason.trim();
  if (!normalized) {
    return undefined;
  }
  if (normalized.length > MAX_EVENT_REVIEW_NOTE_LENGTH) {
    throw networkingError(
      'invalid_public_field',
      `reason must be ${MAX_EVENT_REVIEW_NOTE_LENGTH} characters or fewer.`,
    );
  }
  return normalized;
}

function normalizeLimit(limit: number | undefined) {
  if (limit === undefined) {
    return DEFAULT_REVIEW_LIMIT;
  }
  return Math.max(1, Math.min(MAX_REVIEW_LIMIT, Math.floor(limit)));
}

function titleizeEventId(eventId: string) {
  return eventId
    .split('-')
    .filter(Boolean)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(' ');
}
