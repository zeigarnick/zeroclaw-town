import { v } from 'convex/values';
import { Doc, Id } from '../_generated/dataModel';
import { MutationCtx, QueryCtx, mutation, query } from '../_generated/server';
import {
  generateEventOrganizerInviteToken,
  getKeyPrefix,
  hashSecret,
  networkingError,
} from './auth';
import { assertPlatformOperatorCapability } from './eventOrganizerAuth';
import { createEventWorld, ensureEventSpaceWorld } from './eventWorlds';
import { isEventWorldTemplateId } from './eventWorldTemplates';
import { writeEventOrganizerAuditEvent } from './eventOrganizerControls';
import {
  EventOrganizerRole,
  EventRegistrationStatus,
  EventWorldTemplateId,
  eventOrganizerRoleValidator,
  eventRegistrationStatusValidator,
  eventWorldTemplateIdValidator,
} from './validators';

const DEFAULT_INVITE_TTL_MS = 1000 * 60 * 60 * 24 * 7;
const MAX_INVITE_TTL_MS = 1000 * 60 * 60 * 24 * 90;
const MAX_EVENT_TITLE_LENGTH = 120;
const MAX_SKILL_URL_LENGTH = 2048;
const MAX_LABEL_LENGTH = 120;
const MAX_ORGANIZER_NAME_LENGTH = 120;
const MAX_ORGANIZER_EMAIL_LENGTH = 254;

export type OperatorEventConfig = {
  eventId: string;
  title: string;
  registrationStatus: EventRegistrationStatus;
  skillUrl?: string;
  worldTemplateId?: EventWorldTemplateId;
  worldTemplateRevision?: string;
  worldId?: Id<'worlds'>;
  createdAt: number;
  updatedAt: number;
};

export type CreatedOrganizerInvite = {
  eventId: string;
  inviteId: Id<'eventOrganizerInvites'>;
  inviteToken: string;
  inviteUrl: string;
  inviteTokenPrefix: string;
  role: EventOrganizerRole;
  expiresAt: number;
};

export const createOrUpdateEvent = mutation({
  args: {
    operatorToken: v.string(),
    eventId: v.string(),
    title: v.optional(v.string()),
    registrationStatus: v.optional(eventRegistrationStatusValidator),
    skillUrl: v.optional(v.string()),
    worldTemplateId: v.optional(eventWorldTemplateIdValidator),
  },
  handler: (ctx, args) => createOrUpdateEventHandler(ctx, args),
});

export const getOperatorEvent = query({
  args: {
    operatorToken: v.string(),
    eventId: v.string(),
  },
  handler: (ctx, args) => getOperatorEventHandler(ctx, args),
});

export const createOrganizerInvite = mutation({
  args: {
    operatorToken: v.string(),
    eventId: v.string(),
    role: v.optional(eventOrganizerRoleValidator),
    label: v.optional(v.string()),
    organizerEmail: v.optional(v.string()),
    organizerName: v.optional(v.string()),
    inviteBaseUrl: v.optional(v.string()),
    expiresAt: v.optional(v.number()),
    expiresInMs: v.optional(v.number()),
  },
  handler: (ctx, args) => createOrganizerInviteHandler(ctx, args),
});

export async function createOrUpdateEventHandler(
  ctx: MutationCtx,
  args: {
    operatorToken: string;
    eventId: string;
    title?: string;
    registrationStatus?: EventRegistrationStatus;
    skillUrl?: string;
    worldTemplateId?: EventWorldTemplateId;
  },
) {
  const actor = assertPlatformOperatorCapability(args.operatorToken);
  const eventId = normalizeEventId(args.eventId);
  const now = Date.now();
  const existing = await ctx.db
    .query('eventSpaces')
    .withIndex('by_event_id', (q) => q.eq('eventId', eventId))
    .first();
  const title = normalizeOptionalTitle(args.title) ?? existing?.title ?? titleizeEventId(eventId);
  const registrationStatus = args.registrationStatus ?? existing?.registrationStatus ?? 'open';
  const skillUrl = normalizeOptionalSkillUrl(args.skillUrl) ?? existing?.skillUrl;
  const worldTemplateId = normalizeOptionalWorldTemplateId(args.worldTemplateId);

  if (existing) {
    await ctx.db.patch(existing._id, {
      title,
      registrationStatus,
      skillUrl,
      ...(worldTemplateId ? { worldTemplateId } : {}),
      updatedAt: now,
    });
    const patched = await mustGetEventSpace(ctx, existing._id);
    const ensured = await ensureEventSpaceWorld(ctx, patched, { worldTemplateId, now });
    await writeEventOrganizerAuditEvent(ctx, {
      eventId,
      type: 'event_updated',
      actorKind: actor.kind,
      actorKey: actor.actorKey,
      metadata: { title, registrationStatus, skillUrl, worldTemplateId },
      now,
    });
    return serializeEventConfig(ensured);
  }

  const eventWorld = await createEventWorld(ctx, { worldTemplateId, now });
  const eventSpaceId = await ctx.db.insert('eventSpaces', {
    eventId,
    title,
    worldTemplateId: eventWorld.worldTemplateId,
    worldTemplateRevision: eventWorld.worldTemplateRevision,
    worldId: eventWorld.worldId,
    registrationStatus,
    skillUrl,
    createdAt: now,
    updatedAt: now,
  });
  const eventSpace = await mustGetEventSpace(ctx, eventSpaceId);
  await writeEventOrganizerAuditEvent(ctx, {
    eventId,
    type: 'event_created',
    actorKind: actor.kind,
    actorKey: actor.actorKey,
    metadata: { title, registrationStatus, skillUrl, worldTemplateId: eventWorld.worldTemplateId },
    now,
  });
  return serializeEventConfig(eventSpace);
}

export async function getOperatorEventHandler(
  ctx: QueryCtx,
  args: { operatorToken: string; eventId: string },
): Promise<OperatorEventConfig> {
  assertPlatformOperatorCapability(args.operatorToken);
  const eventId = normalizeEventId(args.eventId);
  const eventSpace = await ctx.db
    .query('eventSpaces')
    .withIndex('by_event_id', (q) => q.eq('eventId', eventId))
    .first();
  if (!eventSpace) {
    throw networkingError('event_not_found', 'The event could not be loaded.');
  }
  return serializeEventConfig(eventSpace);
}

export async function createOrganizerInviteHandler(
  ctx: MutationCtx,
  args: {
    operatorToken: string;
    eventId: string;
    role?: EventOrganizerRole;
    label?: string;
    organizerEmail?: string;
    organizerName?: string;
    inviteBaseUrl?: string;
    expiresAt?: number;
    expiresInMs?: number;
  },
): Promise<CreatedOrganizerInvite> {
  const actor = assertPlatformOperatorCapability(args.operatorToken);
  const eventId = normalizeEventId(args.eventId);
  const eventSpace = await ctx.db
    .query('eventSpaces')
    .withIndex('by_event_id', (q) => q.eq('eventId', eventId))
    .first();
  if (!eventSpace) {
    throw networkingError('event_not_found', 'The event could not be loaded.');
  }
  const now = Date.now();
  const inviteToken = generateEventOrganizerInviteToken();
  const inviteTokenPrefix = getKeyPrefix(inviteToken);
  const expiresAt = normalizeInviteExpiration(args, now);
  const role = args.role ?? 'owner';
  const inviteId = await ctx.db.insert('eventOrganizerInvites', {
    eventId,
    inviteTokenHash: await hashSecret(inviteToken),
    inviteTokenPrefix,
    status: 'pending',
    role,
    label: normalizeOptionalBoundedString(args.label, 'label', MAX_LABEL_LENGTH),
    organizerEmail: normalizeOptionalEmail(args.organizerEmail),
    organizerName: normalizeOptionalBoundedString(
      args.organizerName,
      'organizerName',
      MAX_ORGANIZER_NAME_LENGTH,
    ),
    createdByActorKey: actor.actorKey,
    createdAt: now,
    updatedAt: now,
    expiresAt,
  });
  await writeEventOrganizerAuditEvent(ctx, {
    eventId,
    type: 'organizer_invite_created',
    actorKind: actor.kind,
    actorKey: actor.actorKey,
    metadata: { inviteTokenPrefix, role, label: args.label, expiresAt },
    now,
  });
  return {
    eventId,
    inviteId,
    inviteToken,
    inviteUrl: formatInviteUrl(args.inviteBaseUrl, inviteToken),
    inviteTokenPrefix,
    role,
    expiresAt,
  };
}

function serializeEventConfig(eventSpace: Doc<'eventSpaces'>): OperatorEventConfig {
  return {
    eventId: eventSpace.eventId,
    title: eventSpace.title,
    registrationStatus: eventSpace.registrationStatus,
    skillUrl: eventSpace.skillUrl,
    worldTemplateId: eventSpace.worldTemplateId,
    worldTemplateRevision: eventSpace.worldTemplateRevision,
    worldId: eventSpace.worldId,
    createdAt: eventSpace.createdAt,
    updatedAt: eventSpace.updatedAt,
  };
}

async function mustGetEventSpace(
  ctx: QueryCtx | MutationCtx,
  eventSpaceId: Id<'eventSpaces'>,
) {
  const eventSpace = await ctx.db.get(eventSpaceId);
  if (!eventSpace) {
    throw networkingError('event_not_found', 'The event could not be loaded.');
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

function normalizeOptionalTitle(title: string | undefined) {
  return normalizeOptionalBoundedString(title, 'title', MAX_EVENT_TITLE_LENGTH);
}

function normalizeOptionalSkillUrl(skillUrl: string | undefined) {
  const normalized = normalizeOptionalBoundedString(skillUrl, 'skillUrl', MAX_SKILL_URL_LENGTH);
  if (!normalized) {
    return undefined;
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

function normalizeOptionalWorldTemplateId(worldTemplateId: EventWorldTemplateId | undefined) {
  if (worldTemplateId === undefined) {
    return undefined;
  }
  if (!isEventWorldTemplateId(worldTemplateId)) {
    throw networkingError(
      'invalid_event_world_template',
      'The requested event world template is not available.',
    );
  }
  return worldTemplateId;
}

function normalizeInviteExpiration(
  args: { expiresAt?: number; expiresInMs?: number },
  now: number,
) {
  if (args.expiresAt !== undefined && args.expiresInMs !== undefined) {
    throw networkingError('invalid_public_field', 'Use expiresAt or expiresInMs, not both.');
  }
  if (args.expiresAt !== undefined) {
    if (!Number.isFinite(args.expiresAt) || args.expiresAt <= now) {
      throw networkingError('invalid_public_field', 'expiresAt must be in the future.');
    }
    return args.expiresAt;
  }
  const ttl = args.expiresInMs ?? DEFAULT_INVITE_TTL_MS;
  if (!Number.isFinite(ttl) || ttl <= 0 || ttl > MAX_INVITE_TTL_MS) {
    throw networkingError('invalid_public_field', 'expiresInMs is outside the allowed range.');
  }
  return now + ttl;
}

function normalizeOptionalEmail(email: string | undefined) {
  const normalized = normalizeOptionalBoundedString(
    email,
    'organizerEmail',
    MAX_ORGANIZER_EMAIL_LENGTH,
  );
  if (!normalized) {
    return undefined;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw networkingError('invalid_public_field', 'organizerEmail must be a valid email.');
  }
  return normalized.toLowerCase();
}

function normalizeOptionalBoundedString(
  value: string | undefined,
  fieldName: string,
  maxLength: number,
) {
  if (value === undefined) {
    return undefined;
  }
  const normalized = value.trim();
  if (!normalized) {
    return undefined;
  }
  if (normalized.length > maxLength) {
    throw networkingError('invalid_public_field', `${fieldName} is too long.`);
  }
  return normalized;
}

function formatInviteUrl(inviteBaseUrl: string | undefined, inviteToken: string) {
  const fallbackPath = `/event-admin/invite/${encodeURIComponent(inviteToken)}`;
  if (!inviteBaseUrl) {
    return fallbackPath;
  }
  const normalizedBase = inviteBaseUrl.endsWith('/') ? inviteBaseUrl.slice(0, -1) : inviteBaseUrl;
  return `${normalizedBase}/${encodeURIComponent(inviteToken)}`;
}

function titleizeEventId(eventId: string) {
  return eventId
    .split('-')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
