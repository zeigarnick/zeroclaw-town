import { v } from 'convex/values';
import { QueryCtx, query } from '../_generated/server';
import { networkingError } from './auth';

export type EventSpaceConfig = {
  eventId: string;
  title: string;
  registrationStatus: 'open' | 'paused';
  skillUrl?: string;
  skillUrlRotatedAt?: number;
  updatedAt: number;
};

export const getEventSpaceConfig = query({
  args: {
    eventId: v.string(),
  },
  handler: (ctx, args) => getEventSpaceConfigHandler(ctx, args),
});

export async function getEventSpaceConfigHandler(
  ctx: QueryCtx,
  args: { eventId: string },
): Promise<EventSpaceConfig | null> {
  const eventId = normalizeEventId(args.eventId);
  const eventSpace = await ctx.db
    .query('eventSpaces')
    .withIndex('by_event_id', (q) => q.eq('eventId', eventId))
    .first();
  if (!eventSpace) {
    return null;
  }
  return {
    eventId: eventSpace.eventId,
    title: eventSpace.title,
    registrationStatus: eventSpace.registrationStatus,
    skillUrl: eventSpace.skillUrl,
    skillUrlRotatedAt: eventSpace.skillUrlRotatedAt,
    updatedAt: eventSpace.updatedAt,
  };
}

function normalizeEventId(eventId: string) {
  const normalized = eventId.trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-');
  if (!normalized) {
    throw networkingError('invalid_public_field', 'eventId is required.');
  }
  return normalized;
}
