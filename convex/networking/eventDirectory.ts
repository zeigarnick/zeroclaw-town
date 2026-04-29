import { v } from 'convex/values';
import { MutationCtx, mutation } from '../_generated/server';
import { networkingError } from './auth';
import { normalizeEventId } from './eventAgents';
import { EventPublicCard, EventPublicCardView, toEventPublicCardView } from './eventCards';
import { enforceEventRateLimit } from './eventRateLimits';
import { MAX_EVENT_PUBLIC_LIST_ITEMS, MAX_EVENT_PUBLIC_TEXT_LENGTH } from './validators';

export type EventDirectoryFilters = {
  q?: string;
  role?: string;
  category?: string;
  offers?: string[];
  wants?: string[];
  lookingFor?: string;
  hobbies?: string[];
  interests?: string[];
  favoriteMedia?: string[];
};

export type SearchEventDirectoryArgs = {
  eventId: string;
  requesterKey?: string;
  filters?: EventDirectoryFilters;
};

export const searchEventDirectory = mutation({
  args: {
    eventId: v.string(),
    filters: v.optional(
      v.object({
        q: v.optional(v.string()),
        role: v.optional(v.string()),
        category: v.optional(v.string()),
        offers: v.optional(v.array(v.string())),
        wants: v.optional(v.array(v.string())),
        lookingFor: v.optional(v.string()),
        hobbies: v.optional(v.array(v.string())),
        interests: v.optional(v.array(v.string())),
        favoriteMedia: v.optional(v.array(v.string())),
      }),
    ),
  },
  handler: (ctx, args) => searchEventDirectoryHandler(ctx, args),
});

export async function searchEventDirectoryHandler(
  ctx: MutationCtx,
  args: SearchEventDirectoryArgs,
): Promise<EventPublicCardView[]> {
  const eventId = normalizeEventId(args.eventId);
  const filters = normalizeFilters(args.filters);
  await enforceEventRateLimit(ctx, 'eventDirectorySearch', [
    eventId,
    'requester',
    normalizeRequesterKey(args.requesterKey) ?? 'unknown-public-requester',
  ]);
  const cards = await ctx.db
    .query('eventNetworkingCards')
    .withIndex('by_event_and_status', (q) => q.eq('eventId', eventId).eq('status', 'approved'))
    .collect();

  const results: EventPublicCardView[] = [];
  for (const card of cards) {
    const agent = await ctx.db.get(card.eventAgentId);
    if (!agent || agent.eventId !== eventId || agent.approvalStatus !== 'approved') {
      continue;
    }
    if (!matchesFilters(card.publicCard, filters)) {
      continue;
    }
    results.push(toEventPublicCardView(agent, card));
  }

  return results.sort((left, right) => left.displayName.localeCompare(right.displayName));
}

function normalizeFilters(filters: EventDirectoryFilters | undefined): EventDirectoryFilters {
  if (!filters) {
    return {};
  }

  return {
    q: normalizeOptionalText(filters.q, 'q'),
    role: normalizeOptionalText(filters.role, 'role'),
    category: normalizeOptionalText(filters.category, 'category'),
    offers: normalizeOptionalTextList(filters.offers, 'offers'),
    wants: normalizeOptionalTextList(filters.wants, 'wants'),
    lookingFor: normalizeOptionalText(filters.lookingFor, 'lookingFor'),
    hobbies: normalizeOptionalTextList(filters.hobbies, 'hobbies'),
    interests: normalizeOptionalTextList(filters.interests, 'interests'),
    favoriteMedia: normalizeOptionalTextList(filters.favoriteMedia, 'favoriteMedia'),
  };
}

function normalizeRequesterKey(requesterKey: string | undefined) {
  const normalized = requesterKey?.trim();
  return normalized ? normalized.slice(0, 180) : undefined;
}

function normalizeOptionalText(value: string | undefined, fieldName: string) {
  if (value === undefined) {
    return undefined;
  }
  const normalized = value.trim();
  if (!normalized) {
    return undefined;
  }
  if (normalized.length > MAX_EVENT_PUBLIC_TEXT_LENGTH) {
    throw networkingError(
      'invalid_public_field',
      `${fieldName} must be ${MAX_EVENT_PUBLIC_TEXT_LENGTH} characters or fewer.`,
    );
  }
  return normalized;
}

function normalizeOptionalTextList(value: string[] | undefined, fieldName: string) {
  if (value === undefined) {
    return undefined;
  }
  const normalized = value.map((item) => item.trim()).filter(Boolean);
  if (normalized.length > MAX_EVENT_PUBLIC_LIST_ITEMS) {
    throw networkingError(
      'invalid_public_field',
      `${fieldName} can include at most ${MAX_EVENT_PUBLIC_LIST_ITEMS} items.`,
    );
  }
  for (const item of normalized) {
    if (item.length > MAX_EVENT_PUBLIC_TEXT_LENGTH) {
      throw networkingError(
        'invalid_public_field',
        `${fieldName} items must be ${MAX_EVENT_PUBLIC_TEXT_LENGTH} characters or fewer.`,
      );
    }
  }
  return normalized.length ? Array.from(new Set(normalized)) : undefined;
}

function matchesFilters(publicCard: EventPublicCard, filters: EventDirectoryFilters) {
  if (filters.q && !textMatches(publicCard, filters.q)) {
    return false;
  }
  if (filters.role && !textIncludes(publicCard.role, filters.role)) {
    return false;
  }
  if (filters.category && !textIncludes(publicCard.category, filters.category)) {
    return false;
  }
  if (filters.lookingFor && !textIncludes(publicCard.lookingFor, filters.lookingFor)) {
    return false;
  }
  return (
    listIncludesAll(publicCard.offers, filters.offers) &&
    listIncludesAll(publicCard.wants, filters.wants) &&
    listIncludesAll(publicCard.hobbies, filters.hobbies) &&
    listIncludesAll(publicCard.interests, filters.interests) &&
    listIncludesAll(publicCard.favoriteMedia, filters.favoriteMedia)
  );
}

function textMatches(publicCard: EventPublicCard, queryText: string) {
  const haystack = normalizeSearchText([
    publicCard.role,
    publicCard.category,
    publicCard.lookingFor,
    ...publicCard.offers,
    ...publicCard.wants,
    ...publicCard.hobbies,
    ...publicCard.interests,
    ...publicCard.favoriteMedia,
  ]);
  return tokenize(queryText).every((token) => haystack.includes(token));
}

function listIncludesAll(values: string[], filters: string[] | undefined) {
  if (!filters?.length) {
    return true;
  }
  return filters.every((filter) => values.some((value) => textIncludes(value, filter)));
}

function textIncludes(value: string | undefined, filter: string) {
  if (!value) {
    return false;
  }
  return normalizeSearchText([value]).includes(normalizeSearchText([filter]));
}

function tokenize(value: string) {
  return normalizeSearchText([value]).split(' ').filter(Boolean);
}

function normalizeSearchText(values: Array<string | undefined>) {
  return values
    .filter((value): value is string => Boolean(value))
    .join(' ')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
