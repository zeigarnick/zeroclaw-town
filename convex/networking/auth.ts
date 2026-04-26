import { ConvexError } from 'convex/values';
import { Doc } from '../_generated/dataModel';
import { MutationCtx, QueryCtx } from '../_generated/server';

export type NetworkingErrorCode =
  | 'agent_not_found'
  | 'api_key_revoked'
  | 'claim_not_found'
  | 'claim_token_mismatch'
  | 'duplicate_agent_slug'
  | 'invalid_agent_slug'
  | 'invalid_api_key'
  | 'invalid_claim_status'
  | 'invalid_verification_code'
  | 'pending_claim';

const API_KEY_PREFIX = 'town';
const CLAIM_TOKEN_PREFIX = 'town_claim';

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

export function generateClaimToken() {
  return `${CLAIM_TOKEN_PREFIX}_${randomBase64Url(24)}`;
}

export function generateVerificationCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return `town-${randomString(6, alphabet)}`;
}

export function getKeyPrefix(apiKey: string) {
  return apiKey.slice(0, 12);
}

export function formatClaimUrl(claimBaseUrl: string, claimToken: string) {
  const normalizedBaseUrl = claimBaseUrl.endsWith('/')
    ? claimBaseUrl.slice(0, -1)
    : claimBaseUrl;
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
