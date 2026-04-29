import { ConvexError } from 'convex/values';
import { Doc } from '../_generated/dataModel';
import { MutationCtx, QueryCtx } from '../_generated/server';

export type NetworkingErrorCode =
  | 'active_card_limit'
  | 'agent_not_found'
  | 'api_key_revoked'
  | 'card_access_denied'
  | 'card_not_found'
  | 'claim_not_found'
  | 'claim_token_mismatch'
  | 'details_too_long'
  | 'duplicate_agent_slug'
  | 'duplicate_event_connection_intent'
  | 'duplicate_event_agent'
  | 'empty_card_text'
  | 'event_activity_not_found'
  | 'event_agent_not_approved'
  | 'contact_field_not_public'
  | 'event_agent_not_found'
  | 'event_card_not_found'
  | 'event_connection_intent_access_denied'
  | 'event_connection_intent_not_actionable'
  | 'event_connection_intent_not_found'
  | 'event_contact_reveal_not_found'
  | 'event_not_found'
  | 'invalid_event_owner_token'
  | 'event_owner_session_not_found'
  | 'event_organizer_key_revoked'
  | 'event_registration_paused'
  | 'event_rate_limited'
  | 'event_scope_mismatch'
  | 'invalid_event_connection_intent'
  | 'invalid_event_owner_session_status'
  | 'invalid_event_organizer_token'
  | 'invalid_event_world_template'
  | 'invalid_operator_token'
  | 'organizer_invite_already_redeemed'
  | 'organizer_invite_expired'
  | 'organizer_invite_not_found'
  | 'invalid_card_status'
  | 'invalid_card_type'
  | 'invalid_agent_slug'
  | 'invalid_api_key'
  | 'invalid_avatar_asset'
  | 'invalid_conversation_status'
  | 'invalid_intro_candidate_text'
  | 'invalid_intro_candidate_status'
  | 'invalid_claim_status'
  | 'invalid_public_field'
  | 'invalid_inbox_event_status'
  | 'invalid_meeting_status'
  | 'invalid_message_body'
  | 'invalid_message_client_id'
  | 'invalid_verification_code'
  | 'meeting_access_denied'
  | 'meeting_already_exists'
  | 'meeting_not_found'
  | 'message_too_long'
  | 'conversation_access_denied'
  | 'conversation_closed'
  | 'conversation_not_found'
  | 'conversation_not_qualified'
  | 'duplicate_client_message_id'
  | 'intro_candidate_access_denied'
  | 'intro_candidate_not_found'
  | 'pending_claim'
  | 'recommendation_access_denied'
  | 'recommendation_not_actionable'
  | 'recommendation_not_found'
  | 'sensitive_field_not_allowed'
  | 'summary_too_long';

const API_KEY_PREFIX = 'town';
const CLAIM_TOKEN_PREFIX = 'town_claim';
const EVENT_ORGANIZER_INVITE_TOKEN_PREFIX = 'event_org_invite';
const EVENT_ORGANIZER_API_KEY_PREFIX = 'event_org';

export function networkingError(code: NetworkingErrorCode, message: string) {
  return new ConvexError({ code, message });
}

export async function authenticateAgent(ctx: QueryCtx | MutationCtx, apiKey: string) {
  const keyHash = await hashSecret(apiKey);
  const key = await ctx.db
    .query('networkAgentApiKeys')
    .withIndex('by_key_hash', (q) => q.eq('keyHash', keyHash))
    .first();

  if (!key) {
    throw networkingError('invalid_api_key', 'The provided API key is invalid.');
  }
  if (key.status !== 'active') {
    throw networkingError('api_key_revoked', 'The provided API key has been revoked.');
  }

  const agent = await ctx.db.get(key.agentId);
  if (!agent) {
    throw networkingError('agent_not_found', 'The API key is not attached to an agent.');
  }

  return { agent, key };
}

export async function assertClaimedAgent(ctx: QueryCtx | MutationCtx, apiKey: string) {
  const auth = await authenticateAgent(ctx, apiKey);
  assertAgentStatusIsClaimed(auth.agent);
  return auth;
}

export function assertAgentStatusIsClaimed(agent: Pick<Doc<'networkAgents'>, 'status'>) {
  if (agent.status !== 'active') {
    throw networkingError('pending_claim', 'The agent must be claimed before using this endpoint.');
  }
}

export async function hashSecret(secret: string): Promise<ArrayBuffer> {
  const textEncoder = new TextEncoder();
  const bytes = textEncoder.encode(secret);

  if (typeof crypto === 'undefined') {
    const f = () => 'node:crypto';
    const nodeCrypto = (await import(f())) as typeof import('crypto');
    const hash = nodeCrypto.createHash('sha256');
    hash.update(bytes);
    return toStandaloneArrayBuffer(hash.digest());
  }

  return await crypto.subtle.digest('SHA-256', bytes);
}

export function generateApiKey() {
  return `${API_KEY_PREFIX}_${randomBase64Url(32)}`;
}

export function generateEventOrganizerInviteToken() {
  return `${EVENT_ORGANIZER_INVITE_TOKEN_PREFIX}_${randomBase64Url(24)}`;
}

export function generateEventOrganizerApiKey() {
  return `${EVENT_ORGANIZER_API_KEY_PREFIX}_${randomBase64Url(32)}`;
}

export function generateClaimToken() {
  return `${CLAIM_TOKEN_PREFIX}_${randomBase64Url(24)}`;
}

export function generateVerificationCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return `town-${randomString(6, alphabet)}`;
}

export function getKeyPrefix(apiKey: string) {
  return apiKey.slice(0, 20);
}

export function formatClaimUrl(claimBaseUrl: string, claimToken: string) {
  const normalizedBaseUrl = claimBaseUrl.endsWith('/') ? claimBaseUrl.slice(0, -1) : claimBaseUrl;
  return `${normalizedBaseUrl}/${claimToken}`;
}

function randomString(length: number, alphabet: string) {
  const bytes = new Uint8Array(length);
  getRandomValues(bytes);
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join('');
}

function randomBase64Url(byteLength: number) {
  const bytes = new Uint8Array(byteLength);
  getRandomValues(bytes);

  return bytesToBase64Url(bytes);
}

function getRandomValues(bytes: Uint8Array) {
  if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
    return;
  }

  throw new Error('Secure random generation is unavailable.');
}

function toStandaloneArrayBuffer(buffer: Uint8Array): ArrayBuffer {
  const out = new ArrayBuffer(buffer.byteLength);
  new Uint8Array(out).set(buffer);
  return out;
}

function bytesToBase64Url(bytes: Uint8Array) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  let out = '';

  for (let i = 0; i < bytes.length; i += 3) {
    const first = bytes[i];
    const second = bytes[i + 1];
    const third = bytes[i + 2];
    const hasSecond = i + 1 < bytes.length;
    const hasThird = i + 2 < bytes.length;
    const bits = (first << 16) | ((second ?? 0) << 8) | (third ?? 0);

    out += alphabet[(bits >> 18) & 63];
    out += alphabet[(bits >> 12) & 63];
    if (hasSecond) {
      out += alphabet[(bits >> 6) & 63];
    }
    if (hasThird) {
      out += alphabet[bits & 63];
    }
  }

  return out;
}
