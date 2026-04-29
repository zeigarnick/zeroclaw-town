import type { Doc } from '../_generated/dataModel';
import type { MutationCtx } from '../_generated/server';

export function createPublicEventMarkerSlug() {
  return `event-marker-${randomBase64Url(8).toLowerCase()}`;
}

export function getPublicEventMarkerSlugForView(
  agent: Pick<Doc<'eventAgents'>, 'eventId' | 'displayName' | 'createdAt' | 'publicMarkerSlug'>,
) {
  return agent.publicMarkerSlug ?? fallbackPublicEventMarkerSlug(agent);
}

export async function ensurePublicEventMarkerSlug(
  ctx: MutationCtx,
  agent: Pick<Doc<'eventAgents'>, '_id' | 'publicMarkerSlug'>,
  now?: number,
) {
  if (agent.publicMarkerSlug) {
    return agent.publicMarkerSlug;
  }
  const publicMarkerSlug = createPublicEventMarkerSlug();
  await ctx.db.patch(agent._id, {
    publicMarkerSlug,
    ...(now === undefined ? {} : { updatedAt: now }),
  });
  return publicMarkerSlug;
}

function fallbackPublicEventMarkerSlug(
  agent: Pick<Doc<'eventAgents'>, 'eventId' | 'displayName' | 'createdAt'>,
) {
  return `legacy-event-marker-${hashString(
    `${agent.eventId}:${agent.displayName}:${agent.createdAt}`,
  ).toString(36)}`;
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

function hashString(value: string) {
  let hash = 0;
  for (const char of value) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return hash;
}
