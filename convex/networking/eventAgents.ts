import { v } from 'convex/values';
import { Doc, Id } from '../_generated/dataModel';
import { MutationCtx, QueryCtx, mutation, query } from '../_generated/server';
import { formatClaimUrl, hashSecret, networkingError } from './auth';
import {
  EventAvatarConfig,
  EventPublicCard,
  EventPublicCardView,
  getDefaultEventAvatarConfig,
  normalizeEventAvatarConfig,
  normalizeEventPublicCard,
  toEventPublicCardView,
} from './eventCards';
import { createEventWorld, ensureEventSpaceWorld } from './eventWorlds';
import { writeEventOrganizerAuditEvent } from './eventOrganizerControls';
import { enforceEventRateLimit } from './eventRateLimits';
import {
  EventAgentStatus,
  EventCardStatus,
  MAX_EVENT_AGENT_IDENTIFIER_LENGTH,
  MAX_EVENT_REVIEW_NOTE_LENGTH,
} from './validators';

const DEFAULT_EVENT_OWNER_REVIEW_BASE_PATH = '/event-review';
const DISPLAY_ADJECTIVES = ['Cedar', 'River', 'Signal', 'Orbit', 'Harbor', 'Pixel', 'Meadow'];
const DISPLAY_NOUNS = ['Scout', 'Builder', 'Guide', 'Connector', 'Pilot', 'Mapper', 'Host'];

type RegisterEventAgentArgs = {
  eventId: string;
  agentIdentifier?: string;
  requesterKey?: string;
  publicCard: unknown;
  avatarConfig?: unknown;
};

type EventOwnerReview = {
  eventId: string;
  eventAgentId: Id<'eventAgents'>;
  cardId: Id<'eventNetworkingCards'>;
  sessionStatus: Doc<'eventOwnerSessions'>['status'];
  agentStatus: Doc<'eventAgents'>['approvalStatus'];
  displayName: string;
  avatarConfig: EventAvatarConfig;
  publicCard: EventPublicCard;
  reviewNote?: string;
  createdAt: number;
  updatedAt: number;
};

export type EventOwnerSessionAuth = {
  session: Doc<'eventOwnerSessions'>;
  agent: Doc<'eventAgents'>;
  card: Doc<'eventNetworkingCards'>;
};

export const registerEventAgent = mutation({
  args: {
    eventId: v.string(),
    agentIdentifier: v.optional(v.string()),
    publicCard: v.any(),
    avatarConfig: v.optional(v.any()),
  },
  handler: (ctx, args) => registerEventAgentHandler(ctx, args),
});

export async function registerEventAgentHandler(
  ctx: MutationCtx,
  args: RegisterEventAgentArgs,
) {
  const eventId = normalizeEventId(args.eventId);
  const agentIdentifier = normalizeAgentIdentifier(args.agentIdentifier);
  const requesterKey = normalizeRequesterKey(args.requesterKey) ?? 'unknown-public-requester';
  await enforceEventRateLimit(ctx, 'eventRegistrationPerRequester', [
    eventId,
    'requester',
    requesterKey,
  ]);
  if (args.agentIdentifier !== undefined) {
    await enforceEventRateLimit(ctx, 'eventRegistrationPerRequester', [
      eventId,
      'agent-identifier',
      agentIdentifier,
    ]);
  }
  await enforceEventRateLimit(ctx, 'eventRegistrationPerEvent', [eventId]);
  const publicCard = normalizeEventPublicCard(args.publicCard);
  const avatarConfig =
    args.avatarConfig === undefined
      ? getDefaultEventAvatarConfig(`${eventId}:${agentIdentifier}`)
      : normalizeEventAvatarConfig(args.avatarConfig);

  const now = Date.now();
  const eventSpace = await getOrCreateEventSpace(ctx, eventId, now);
  if (eventSpace.registrationStatus !== 'open') {
    throw networkingError('event_registration_paused', 'Registration is paused for this event.');
  }

  const existing = await ctx.db
    .query('eventAgents')
    .withIndex('by_event_and_agent_identifier', (q) =>
      q.eq('eventId', eventId).eq('agentIdentifier', agentIdentifier),
    )
    .first();
  if (existing) {
    throw networkingError(
      'duplicate_event_agent',
      'An event agent already exists for this event and identifier.',
    );
  }

  const displayName = generateRandomDisplayName();
  const eventAgentId = await ctx.db.insert('eventAgents', {
    eventId,
    agentIdentifier,
    publicMarkerSlug: generatePublicMarkerSlug(),
    displayName,
    avatarConfig,
    approvalStatus: 'pending_owner_review',
    createdAt: now,
    updatedAt: now,
  });
  const cardId = await ctx.db.insert('eventNetworkingCards', {
    eventId,
    eventAgentId,
    publicCard,
    status: 'pending_owner_review',
    createdAt: now,
    updatedAt: now,
  });
  const ownerSessionToken = generateEventOwnerSessionToken();
  const ownerSessionId = await ctx.db.insert('eventOwnerSessions', {
    eventId,
    eventAgentId,
    cardId,
    sessionTokenHash: await hashSecret(ownerSessionToken),
    status: 'pending',
    createdAt: now,
    updatedAt: now,
  });
  await ctx.db.patch(eventAgentId, {
    ownerSessionId,
    activeCardId: cardId,
    updatedAt: now,
  });
  await writeEventOrganizerAuditEvent(ctx, {
    eventId,
    type: 'event_agent_registered',
    actorKind: 'public_requester',
    actorKey: requesterKey,
    eventAgentId,
    metadata: {
      agentIdentifier,
      hasAvatarConfig: args.avatarConfig !== undefined,
    },
    now,
  });

  return {
    eventId,
    eventAgentId,
    agentIdentifier,
    displayName,
    avatarConfig,
    publicCard,
    approvalStatus: 'pending_owner_review' as const,
    cardId,
    ownerSessionId,
    ownerReviewPath: formatEventOwnerReviewPath(eventId, ownerSessionToken),
    ownerSessionToken,
    createdAt: now,
    updatedAt: now,
  };
}

export const getOwnerReview = query({
  args: {
    reviewToken: v.string(),
  },
  handler: (ctx, args) => getOwnerReviewHandler(ctx, args),
});

export async function getOwnerReviewHandler(
  ctx: QueryCtx,
  args: { reviewToken: string },
): Promise<EventOwnerReview> {
  const { session, agent, card } = await getOwnerReviewRows(ctx, args.reviewToken);
  return toOwnerReview(session, agent, card);
}

export const approveOwnerReview = mutation({
  args: {
    reviewToken: v.string(),
  },
  handler: (ctx, args) => decideOwnerReviewHandler(ctx, args, 'approved'),
});

export const rejectOwnerReview = mutation({
  args: {
    reviewToken: v.string(),
    reviewNote: v.optional(v.string()),
  },
  handler: (ctx, args) => decideOwnerReviewHandler(ctx, args, 'rejected'),
});

export const requestOwnerReviewChanges = mutation({
  args: {
    reviewToken: v.string(),
    reviewNote: v.optional(v.string()),
  },
  handler: (ctx, args) => decideOwnerReviewHandler(ctx, args, 'changes_requested'),
});

export async function decideOwnerReviewHandler(
  ctx: MutationCtx,
  args: { reviewToken: string; reviewNote?: string },
  decision: Exclude<EventCardStatus, 'pending_owner_review' | 'revoked'>,
): Promise<EventOwnerReview> {
  const { session, agent, card } = await getOwnerReviewRows(ctx, args.reviewToken);
  await enforceEventRateLimit(ctx, 'eventOwnerReviewDecision', [
    session.eventId,
    agent._id,
    decision,
  ]);
  if (
    session.status !== 'pending' ||
    agent.approvalStatus !== 'pending_owner_review' ||
    card.status !== 'pending_owner_review'
  ) {
    throw networkingError(
      'invalid_event_owner_session_status',
      'This event owner review has already been decided.',
    );
  }
  const now = Date.now();
  const reviewNote = normalizeReviewNote(args.reviewNote);
  const timestampField = timestampFieldForDecision(decision);
  const agentStatus = decision as EventAgentStatus;
  const sessionStatus =
    decision === 'changes_requested' ? 'changes_requested' : decision;

  await ctx.db.patch(card._id, {
    status: decision,
    updatedAt: now,
    reviewNote,
    [timestampField]: now,
  });
  await ctx.db.patch(agent._id, {
    approvalStatus: agentStatus,
    activeCardId: card._id,
    updatedAt: now,
    [timestampField]: now,
  });
  await ctx.db.patch(session._id, {
    status: sessionStatus,
    updatedAt: now,
    decidedAt: now,
  });

  const updatedSession = await ctx.db.get(session._id);
  const updatedAgent = await ctx.db.get(agent._id);
  const updatedCard = await ctx.db.get(card._id);
  if (!updatedSession || !updatedAgent || !updatedCard) {
    throw networkingError('event_owner_session_not_found', 'The review session could not be loaded.');
  }
  return toOwnerReview(updatedSession, updatedAgent, updatedCard);
}

export const listApprovedPublicCards = query({
  args: {
    eventId: v.string(),
  },
  handler: (ctx, args) => listApprovedPublicCardsHandler(ctx, args),
});

export async function listApprovedPublicCardsHandler(
  ctx: QueryCtx,
  args: { eventId: string },
): Promise<EventPublicCardView[]> {
  const eventId = normalizeEventId(args.eventId);
  const cards = await ctx.db
    .query('eventNetworkingCards')
    .withIndex('by_event_and_status', (q) => q.eq('eventId', eventId).eq('status', 'approved'))
    .collect();
  const views: EventPublicCardView[] = [];
  for (const card of cards) {
    const agent = await ctx.db.get(card.eventAgentId);
    if (!agent || agent.approvalStatus !== 'approved') {
      continue;
    }
    views.push(toEventPublicCardView(agent, card));
  }
  return views.sort((left, right) => left.displayName.localeCompare(right.displayName));
}

export async function authenticateApprovedEventOwnerSession(
  ctx: QueryCtx | MutationCtx,
  args: {
    eventId: string;
    ownerSessionToken: string;
    eventAgentId?: Id<'eventAgents'>;
  },
): Promise<EventOwnerSessionAuth> {
  const eventId = normalizeEventId(args.eventId);
  if (!args.ownerSessionToken.startsWith('event_owner_')) {
    throw networkingError('invalid_event_owner_token', 'A valid event owner token is required.');
  }

  const { session, agent, card } = await getOwnerReviewRows(ctx, args.ownerSessionToken);
  if (session.eventId !== eventId || agent.eventId !== eventId || card.eventId !== eventId) {
    throw networkingError('invalid_event_owner_token', 'The event owner token is not valid for this event.');
  }
  if (args.eventAgentId !== undefined && agent._id !== args.eventAgentId) {
    throw networkingError(
      'invalid_event_owner_token',
      'The event owner token is not valid for this event agent.',
    );
  }
  if (
    session.status !== 'approved' ||
    agent.approvalStatus !== 'approved' ||
    card.status !== 'approved'
  ) {
    throw networkingError(
      'invalid_event_owner_session_status',
      'The event owner token must belong to an approved event agent.',
    );
  }

  return { session, agent, card };
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
    worldTemplateRevision: eventWorld.worldTemplateRevision,
    worldId: eventWorld.worldId,
    registrationStatus: 'open',
    createdAt: now,
    updatedAt: now,
  });
  const created = await ctx.db.get(eventSpaceId);
  if (!created) {
    throw networkingError('event_agent_not_found', 'The event could not be initialized.');
  }
  return created;
}

async function getOwnerReviewRows(ctx: QueryCtx | MutationCtx, reviewToken: string) {
  const sessionTokenHash = await hashSecret(reviewToken);
  const session = await ctx.db
    .query('eventOwnerSessions')
    .withIndex('by_session_token_hash', (q) => q.eq('sessionTokenHash', sessionTokenHash))
    .first();
  if (!session) {
    throw networkingError('event_owner_session_not_found', 'The event owner review link is invalid.');
  }
  const agent = await ctx.db.get(session.eventAgentId);
  if (!agent) {
    throw networkingError('event_agent_not_found', 'The event agent could not be loaded.');
  }
  if (agent.approvalStatus === 'revoked') {
    throw networkingError('event_agent_not_found', 'The event agent could not be loaded.');
  }
  const card = await ctx.db.get(session.cardId);
  if (!card) {
    throw networkingError('event_card_not_found', 'The event networking card could not be loaded.');
  }
  if (card.status === 'revoked') {
    throw networkingError('event_card_not_found', 'The event networking card could not be loaded.');
  }
  return { session, agent, card };
}

function toOwnerReview(
  session: Doc<'eventOwnerSessions'>,
  agent: Doc<'eventAgents'>,
  card: Doc<'eventNetworkingCards'>,
): EventOwnerReview {
  return {
    eventId: session.eventId,
    eventAgentId: agent._id,
    cardId: card._id,
    sessionStatus: session.status,
    agentStatus: agent.approvalStatus,
    displayName: agent.displayName,
    avatarConfig: agent.avatarConfig,
    publicCard: card.publicCard,
    reviewNote: card.reviewNote,
    createdAt: card.createdAt,
    updatedAt: Math.max(session.updatedAt, agent.updatedAt, card.updatedAt),
  };
}

export function normalizeEventId(eventId: string) {
  const normalized = eventId.trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-');
  if (!normalized) {
    throw networkingError('invalid_public_field', 'eventId is required.');
  }
  return normalized;
}

function normalizeAgentIdentifier(agentIdentifier: string | undefined) {
  const raw = agentIdentifier?.trim() || `agent-${generateShortToken()}`;
  const normalized = raw.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
  if (!normalized || normalized.length > MAX_EVENT_AGENT_IDENTIFIER_LENGTH) {
    throw networkingError('invalid_public_field', 'agentIdentifier is invalid.');
  }
  return normalized;
}

function normalizeRequesterKey(requesterKey: string | undefined) {
  const normalized = requesterKey?.trim();
  return normalized ? normalized.slice(0, 180) : undefined;
}

function normalizeReviewNote(reviewNote: string | undefined) {
  if (reviewNote === undefined) {
    return undefined;
  }
  const normalized = reviewNote.trim();
  if (!normalized) {
    return undefined;
  }
  if (normalized.length > MAX_EVENT_REVIEW_NOTE_LENGTH) {
    throw networkingError(
      'invalid_public_field',
      `reviewNote must be ${MAX_EVENT_REVIEW_NOTE_LENGTH} characters or fewer.`,
    );
  }
  return normalized;
}

function timestampFieldForDecision(
  decision: Exclude<EventCardStatus, 'pending_owner_review' | 'revoked'>,
) {
  if (decision === 'approved') {
    return 'approvedAt';
  }
  if (decision === 'rejected') {
    return 'rejectedAt';
  }
  return 'changesRequestedAt';
}

function titleizeEventId(eventId: string) {
  return eventId
    .split('-')
    .filter(Boolean)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(' ');
}

function getEventOwnerReviewBasePath() {
  return process.env.EVENT_OWNER_REVIEW_BASE_URL ?? DEFAULT_EVENT_OWNER_REVIEW_BASE_PATH;
}

function formatEventOwnerReviewPath(eventId: string, ownerSessionToken: string) {
  return formatClaimUrl(formatClaimUrl(getEventOwnerReviewBasePath(), eventId), ownerSessionToken);
}

function generateRandomDisplayName() {
  const adjective = DISPLAY_ADJECTIVES[randomInt(DISPLAY_ADJECTIVES.length)];
  const noun = DISPLAY_NOUNS[randomInt(DISPLAY_NOUNS.length)];
  return `${adjective} ${noun} ${100 + randomInt(900)}`;
}

function generateEventOwnerSessionToken() {
  return `event_owner_${randomBase64Url(24)}`;
}

function generatePublicMarkerSlug() {
  return `event-marker-${generateShortToken()}`;
}

function generateShortToken() {
  return randomBase64Url(8).toLowerCase();
}

function randomInt(maxExclusive: number) {
  const bytes = new Uint8Array(1);
  getRandomValues(bytes);
  return bytes[0] % maxExclusive;
}

function randomBase64Url(byteLength: number) {
  const bytes = new Uint8Array(byteLength);
  getRandomValues(bytes);
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  let out = '';
  for (const byte of bytes) {
    out += alphabet[byte % alphabet.length];
  }
  return out;
}

function getRandomValues(bytes: Uint8Array) {
  if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
    return;
  }
  throw new Error('Secure random generation is unavailable.');
}
