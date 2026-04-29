import { Doc, Id } from '../_generated/dataModel';
import { MutationCtx, QueryCtx } from '../_generated/server';
import { getKeyPrefix, hashSecret, networkingError } from './auth';

const OPERATOR_TOKEN_ENV_KEYS = [
  'OPENNETWORK_OPERATOR_TOKEN',
  'OPENNETWORK_ORGANIZER_TOKEN',
  'EVENT_ORGANIZER_TOKEN',
  'NETWORKING_ORGANIZER_TOKEN',
] as const;

export type EventOrganizerActor = {
  kind: 'organizer';
  eventId: string;
  keyId: Id<'eventOrganizerApiKeys'>;
  keyPrefix: string;
  role: Doc<'eventOrganizerApiKeys'>['role'];
  actorKey: string;
};

export type PlatformOperatorActor = {
  kind: 'platform_operator';
  actorKey: string;
};

export function assertPlatformOperatorCapability(operatorToken: string): PlatformOperatorActor {
  const configuredToken = getConfiguredOperatorToken();
  if (!configuredToken || operatorToken !== configuredToken) {
    throw networkingError(
      'invalid_operator_token',
      'A configured platform operator bearer token is required.',
    );
  }
  return {
    kind: 'platform_operator',
    actorKey: 'configured-platform-operator',
  };
}

export async function authenticateEventOrganizerApiKey(
  ctx: MutationCtx,
  args: { eventId: string; organizerApiKey: string; now?: number },
): Promise<EventOrganizerActor> {
  const key = await findEventOrganizerApiKey(ctx, args.organizerApiKey);
  if (!key) {
    throw networkingError(
      'invalid_event_organizer_token',
      'The event organizer API key is invalid.',
    );
  }
  if (key.status !== 'active') {
    throw networkingError(
      'event_organizer_key_revoked',
      'The event organizer API key has been revoked.',
    );
  }
  if (key.eventId !== args.eventId) {
    throw networkingError(
      'event_scope_mismatch',
      'The event organizer API key is not scoped to this event.',
    );
  }
  const now = args.now ?? Date.now();
  await ctx.db.patch(key._id, {
    lastUsedAt: now,
    updatedAt: now,
  });
  return eventOrganizerActorFromKey(key);
}

export async function findEventOrganizerApiKey(
  ctx: QueryCtx | MutationCtx,
  organizerApiKey: string,
) {
  const keyHash = await hashSecret(organizerApiKey);
  return await ctx.db
    .query('eventOrganizerApiKeys')
    .withIndex('by_key_hash', (q) => q.eq('keyHash', keyHash))
    .first();
}

export async function findEventOrganizerInvite(ctx: QueryCtx | MutationCtx, inviteToken: string) {
  const inviteTokenHash = await hashSecret(inviteToken);
  return await ctx.db
    .query('eventOrganizerInvites')
    .withIndex('by_invite_token_hash', (q) => q.eq('inviteTokenHash', inviteTokenHash))
    .first();
}

export async function assertRedeemableEventOrganizerInvite(
  ctx: QueryCtx | MutationCtx,
  args: { inviteToken: string; now?: number },
) {
  const invite = await findEventOrganizerInvite(ctx, args.inviteToken);
  if (!invite) {
    throw networkingError('organizer_invite_not_found', 'The organizer invite is invalid.');
  }
  if (invite.status === 'redeemed') {
    throw networkingError(
      'organizer_invite_already_redeemed',
      'The organizer invite has already been redeemed.',
    );
  }
  if (invite.status === 'revoked') {
    throw networkingError('organizer_invite_not_found', 'The organizer invite is invalid.');
  }
  if (invite.expiresAt <= (args.now ?? Date.now())) {
    throw networkingError('organizer_invite_expired', 'The organizer invite has expired.');
  }
  return invite;
}

export function eventOrganizerActorFromKey(
  key: Doc<'eventOrganizerApiKeys'>,
): EventOrganizerActor {
  return {
    kind: 'organizer',
    eventId: key.eventId,
    keyId: key._id,
    keyPrefix: key.keyPrefix,
    role: key.role,
    actorKey: organizerActorKeyForPrefix(key.keyPrefix),
  };
}

export function getSecretPrefix(secret: string) {
  return getKeyPrefix(secret);
}

export function organizerActorKeyForPrefix(keyPrefix: string) {
  return `organizer-key:${keyPrefix}`;
}

function getConfiguredOperatorToken() {
  for (const key of OPERATOR_TOKEN_ENV_KEYS) {
    const value = process.env[key]?.trim();
    if (value) {
      return value;
    }
  }
  return undefined;
}
