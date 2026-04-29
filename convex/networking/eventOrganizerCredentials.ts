import { v } from 'convex/values';
import { Id } from '../_generated/dataModel';
import { MutationCtx, mutation } from '../_generated/server';
import {
  generateEventOrganizerApiKey,
  getKeyPrefix,
  hashSecret,
  networkingError,
} from './auth';
import {
  assertRedeemableEventOrganizerInvite,
  assertPlatformOperatorCapability,
  authenticateEventOrganizerApiKey,
  EventOrganizerActor,
  organizerActorKeyForPrefix,
} from './eventOrganizerAuth';
import { writeEventOrganizerAuditEvent } from './eventOrganizerControls';

const MAX_LABEL_LENGTH = 120;

export type RedeemedOrganizerInvite = {
  eventId: string;
  keyId: Id<'eventOrganizerApiKeys'>;
  organizerApiKey: string;
  keyPrefix: string;
  role: 'owner' | 'staff' | 'viewer';
};

export type RedactedOrganizerApiKey = {
  keyId: Id<'eventOrganizerApiKeys'>;
  eventId: string;
  keyPrefix: string;
  status: 'active' | 'revoked';
  role: 'owner' | 'staff' | 'viewer';
  label?: string;
  createdAt: number;
  updatedAt: number;
  lastUsedAt?: number;
  revokedAt?: number;
};

export const redeemOrganizerInvite = mutation({
  args: {
    inviteToken: v.string(),
    label: v.optional(v.string()),
  },
  handler: (ctx, args) => redeemOrganizerInviteHandler(ctx, args),
});

export const listOrganizerApiKeys = mutation({
  args: {
    eventId: v.string(),
    organizerApiKey: v.string(),
  },
  handler: (ctx, args) => listOrganizerApiKeysHandler(ctx, args),
});

export const createOrganizerApiKey = mutation({
  args: {
    eventId: v.string(),
    organizerApiKey: v.string(),
    label: v.optional(v.string()),
  },
  handler: (ctx, args) => createOrganizerApiKeyHandler(ctx, args),
});

export const revokeOrganizerApiKey = mutation({
  args: {
    eventId: v.string(),
    organizerApiKey: v.string(),
    keyId: v.id('eventOrganizerApiKeys'),
  },
  handler: (ctx, args) => revokeOrganizerApiKeyHandler(ctx, args),
});

export const operatorListOrganizerApiKeys = mutation({
  args: {
    operatorToken: v.string(),
    eventId: v.string(),
  },
  handler: (ctx, args) => operatorListOrganizerApiKeysHandler(ctx, args),
});

export const operatorRevokeOrganizerApiKey = mutation({
  args: {
    operatorToken: v.string(),
    eventId: v.string(),
    keyId: v.id('eventOrganizerApiKeys'),
  },
  handler: (ctx, args) => operatorRevokeOrganizerApiKeyHandler(ctx, args),
});

export async function redeemOrganizerInviteHandler(
  ctx: MutationCtx,
  args: { inviteToken: string; label?: string },
): Promise<RedeemedOrganizerInvite> {
  const now = Date.now();
  const invite = await assertRedeemableEventOrganizerInvite(ctx, {
    inviteToken: args.inviteToken,
    now,
  });
  const organizerApiKey = generateEventOrganizerApiKey();
  const keyPrefix = getKeyPrefix(organizerApiKey);
  const keyId = await ctx.db.insert('eventOrganizerApiKeys', {
    eventId: invite.eventId,
    keyHash: await hashSecret(organizerApiKey),
    keyPrefix,
    status: 'active',
    role: invite.role,
    label: normalizeOptionalLabel(args.label) ?? invite.label,
    createdFromInviteId: invite._id,
    createdByActorKey: invite.createdByActorKey,
    createdAt: now,
    updatedAt: now,
  });
  await ctx.db.patch(invite._id, {
    status: 'redeemed',
    redeemedAt: now,
    redeemedByKeyId: keyId,
    updatedAt: now,
  });
  await writeEventOrganizerAuditEvent(ctx, {
    eventId: invite.eventId,
    type: 'organizer_invite_redeemed',
    actorKind: 'organizer',
    actorKey: organizerActorKeyForPrefix(keyPrefix),
    metadata: { inviteTokenPrefix: invite.inviteTokenPrefix, keyPrefix, role: invite.role },
    now,
  });
  return {
    eventId: invite.eventId,
    keyId,
    organizerApiKey,
    keyPrefix,
    role: invite.role,
  };
}

export async function listOrganizerApiKeysHandler(
  ctx: MutationCtx,
  args: { eventId: string; organizerApiKey: string },
): Promise<RedactedOrganizerApiKey[]> {
  const eventId = normalizeEventId(args.eventId);
  await authenticateEventOrganizerApiKey(ctx, {
    eventId,
    organizerApiKey: args.organizerApiKey,
  });
  const keys = await ctx.db
    .query('eventOrganizerApiKeys')
    .withIndex('by_event_created_at', (q) => q.eq('eventId', eventId))
    .collect();
  return keys
    .sort((left, right) => right.createdAt - left.createdAt)
    .map((key) => redactedKey(key));
}

export async function createOrganizerApiKeyHandler(
  ctx: MutationCtx,
  args: { eventId: string; organizerApiKey: string; label?: string },
): Promise<RedactedOrganizerApiKey & { organizerApiKey: string }> {
  const eventId = normalizeEventId(args.eventId);
  const actor = await authenticateEventOrganizerApiKey(ctx, {
    eventId,
    organizerApiKey: args.organizerApiKey,
  });
  assertCanManageKeys(actor);
  const now = Date.now();
  const organizerApiKey = generateEventOrganizerApiKey();
  const keyPrefix = getKeyPrefix(organizerApiKey);
  const keyId = await ctx.db.insert('eventOrganizerApiKeys', {
    eventId,
    keyHash: await hashSecret(organizerApiKey),
    keyPrefix,
    status: 'active',
    role: actor.role,
    label: normalizeOptionalLabel(args.label),
    createdByKeyId: actor.keyId,
    createdAt: now,
    updatedAt: now,
  });
  const key = await mustGetOrganizerApiKey(ctx, keyId);
  await writeEventOrganizerAuditEvent(ctx, {
    eventId,
    type: 'organizer_api_key_created',
    actorKind: 'organizer',
    actorKey: actor.actorKey,
    metadata: { keyPrefix, role: actor.role },
    now,
  });
  return {
    ...redactedKey(key),
    organizerApiKey,
  };
}

export async function revokeOrganizerApiKeyHandler(
  ctx: MutationCtx,
  args: { eventId: string; organizerApiKey: string; keyId: Id<'eventOrganizerApiKeys'> },
): Promise<RedactedOrganizerApiKey> {
  const eventId = normalizeEventId(args.eventId);
  const actor = await authenticateEventOrganizerApiKey(ctx, {
    eventId,
    organizerApiKey: args.organizerApiKey,
  });
  assertCanManageKeys(actor);
  const target = await mustGetOrganizerApiKey(ctx, args.keyId);
  if (target.eventId !== eventId) {
    throw networkingError(
      'event_scope_mismatch',
      'The organizer API key is not scoped to this event.',
    );
  }
  if (target.status === 'revoked') {
    return redactedKey(target);
  }
  const activeKeys = await ctx.db
    .query('eventOrganizerApiKeys')
    .withIndex('by_event_and_status', (q) => q.eq('eventId', eventId).eq('status', 'active'))
    .collect();
  if (activeKeys.length <= 1) {
    throw networkingError(
      'invalid_public_field',
      'Cannot revoke the only active organizer API key.',
    );
  }
  const now = Date.now();
  await ctx.db.patch(target._id, {
    status: 'revoked',
    revokedAt: now,
    updatedAt: now,
  });
  await writeEventOrganizerAuditEvent(ctx, {
    eventId,
    type: 'organizer_api_key_revoked',
    actorKind: 'organizer',
    actorKey: actor.actorKey,
    metadata: { keyPrefix: target.keyPrefix },
    now,
  });
  return redactedKey({
    ...target,
    status: 'revoked',
    revokedAt: now,
    updatedAt: now,
  });
}

export async function operatorListOrganizerApiKeysHandler(
  ctx: MutationCtx,
  args: { operatorToken: string; eventId: string },
): Promise<RedactedOrganizerApiKey[]> {
  assertPlatformOperatorCapability(args.operatorToken);
  const eventId = normalizeEventId(args.eventId);
  const keys = await ctx.db
    .query('eventOrganizerApiKeys')
    .withIndex('by_event_created_at', (q) => q.eq('eventId', eventId))
    .collect();
  return keys
    .sort((left, right) => right.createdAt - left.createdAt)
    .map((key) => redactedKey(key));
}

export async function operatorRevokeOrganizerApiKeyHandler(
  ctx: MutationCtx,
  args: { operatorToken: string; eventId: string; keyId: Id<'eventOrganizerApiKeys'> },
): Promise<RedactedOrganizerApiKey> {
  const actor = assertPlatformOperatorCapability(args.operatorToken);
  const eventId = normalizeEventId(args.eventId);
  const target = await mustGetOrganizerApiKey(ctx, args.keyId);
  if (target.eventId !== eventId) {
    throw networkingError(
      'event_scope_mismatch',
      'The organizer API key is not scoped to this event.',
    );
  }
  if (target.status === 'revoked') {
    return redactedKey(target);
  }
  const now = Date.now();
  await ctx.db.patch(target._id, {
    status: 'revoked',
    revokedAt: now,
    updatedAt: now,
  });
  await writeEventOrganizerAuditEvent(ctx, {
    eventId,
    type: 'organizer_api_key_revoked',
    actorKind: actor.kind,
    actorKey: actor.actorKey,
    metadata: { keyPrefix: target.keyPrefix, operatorOverride: true },
    now,
  });
  return redactedKey({
    ...target,
    status: 'revoked',
    revokedAt: now,
    updatedAt: now,
  });
}

async function mustGetOrganizerApiKey(
  ctx: MutationCtx,
  keyId: Id<'eventOrganizerApiKeys'>,
) {
  const key = await ctx.db.get(keyId);
  if (!key) {
    throw networkingError('invalid_event_organizer_token', 'The organizer API key is invalid.');
  }
  return key;
}

function redactedKey(key: {
  _id: Id<'eventOrganizerApiKeys'>;
  eventId: string;
  keyPrefix: string;
  status: 'active' | 'revoked';
  role: 'owner' | 'staff' | 'viewer';
  label?: string;
  createdAt: number;
  updatedAt: number;
  lastUsedAt?: number;
  revokedAt?: number;
}): RedactedOrganizerApiKey {
  return {
    keyId: key._id,
    eventId: key.eventId,
    keyPrefix: key.keyPrefix,
    status: key.status,
    role: key.role,
    label: key.label,
    createdAt: key.createdAt,
    updatedAt: key.updatedAt,
    lastUsedAt: key.lastUsedAt,
    revokedAt: key.revokedAt,
  };
}

function assertCanManageKeys(actor: EventOrganizerActor) {
  if (actor.role !== 'owner' && actor.role !== 'staff') {
    throw networkingError(
      'event_scope_mismatch',
      'This organizer API key cannot manage organizer credentials.',
    );
  }
}

function normalizeEventId(eventId: string) {
  const normalized = eventId.trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-');
  if (!normalized) {
    throw networkingError('invalid_public_field', 'eventId is required.');
  }
  return normalized;
}

function normalizeOptionalLabel(label: string | undefined) {
  if (label === undefined) {
    return undefined;
  }
  const normalized = label.trim();
  if (!normalized) {
    return undefined;
  }
  if (normalized.length > MAX_LABEL_LENGTH) {
    throw networkingError('invalid_public_field', 'label is too long.');
  }
  return normalized;
}
