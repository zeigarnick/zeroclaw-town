import { v } from 'convex/values';
import { Id } from '../_generated/dataModel';
import { MutationCtx, QueryCtx, mutation, query } from '../_generated/server';
import {
  assertAgentStatusIsClaimed,
  authenticateAgent,
  networkingError,
} from './auth';
import {
  CardStatus,
  CardType,
  MAX_ACTIVE_MATCH_CARDS_PER_AGENT,
  MAX_CARD_DETAILS_LENGTH,
  MAX_CARD_DOMAINS,
  MAX_CARD_SUMMARY_LENGTH,
  MAX_CARD_TAGS,
  MAX_CARD_TAG_OR_DOMAIN_LENGTH,
  isCardStatus,
  isCardType,
} from './validators';
import { getCanonicalCardTextForEmbedding } from './cardText';
import { markRecommendationsStaleForCard, runMatchingForCard } from './matching';

type CreateCardInput = {
  apiKey: string;
  type: string;
  title: string;
  summary: string;
  detailsForMatching: string;
  tags?: string[];
  domains?: string[];
  desiredOutcome: string;
  status?: string;
  agentGeneratedAt?: number;
  ownerConfirmedAt?: number;
};

type UpdateCardInput = {
  apiKey: string;
  cardId: Id<'matchCards'>;
  type?: string;
  title?: string;
  summary?: string;
  detailsForMatching?: string;
  tags?: string[];
  domains?: string[];
  desiredOutcome?: string;
  status?: string;
  agentGeneratedAt?: number;
  ownerConfirmedAt?: number;
};

export const createCard = mutation({
  args: {
    apiKey: v.string(),
    type: v.string(),
    title: v.string(),
    summary: v.string(),
    detailsForMatching: v.string(),
    tags: v.optional(v.array(v.string())),
    domains: v.optional(v.array(v.string())),
    desiredOutcome: v.string(),
    status: v.optional(v.string()),
    agentGeneratedAt: v.optional(v.number()),
    ownerConfirmedAt: v.optional(v.number()),
  },
  handler: (ctx, args) => createCardHandler(ctx, args),
});

export async function createCardHandler(ctx: MutationCtx, args: CreateCardInput) {
  const { agent } = await authenticateAgent(ctx, args.apiKey);
  const now = Date.now();
  const type = parseCardType(args.type);
  const status = parseCardStatus(args.status ?? 'draft');

  const cardDraft = {
    type,
    title: normalizeText(args.title),
    summary: normalizeText(args.summary),
    detailsForMatching: normalizeText(args.detailsForMatching),
    tags: normalizeStringList(args.tags),
    domains: normalizeStringList(args.domains),
    desiredOutcome: normalizeText(args.desiredOutcome),
    status,
    agentGeneratedAt: args.agentGeneratedAt ?? now,
    ownerConfirmedAt: args.ownerConfirmedAt,
    updatedAt: now,
  };

  validateCardText(cardDraft);
  validateTagAndDomainLimits(cardDraft.tags, cardDraft.domains);
  if (status === 'active') {
    assertAgentStatusIsClaimed(agent);
    await assertActiveCardCapacity(ctx, agent._id);
  }

  const cardId = await ctx.db.insert('matchCards', {
    agentId: agent._id,
    ...cardDraft,
  });

  const card = await ctx.db.get(cardId);
  if (!card) {
    throw networkingError('card_not_found', 'The created card could not be loaded.');
  }
  if (card.status === 'active') {
    await runMatchingForCard(ctx, card);
  }
  return card;
}

export const updateCard = mutation({
  args: {
    apiKey: v.string(),
    cardId: v.id('matchCards'),
    type: v.optional(v.string()),
    title: v.optional(v.string()),
    summary: v.optional(v.string()),
    detailsForMatching: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    domains: v.optional(v.array(v.string())),
    desiredOutcome: v.optional(v.string()),
    status: v.optional(v.string()),
    agentGeneratedAt: v.optional(v.number()),
    ownerConfirmedAt: v.optional(v.number()),
  },
  handler: (ctx, args) => updateCardHandler(ctx, args),
});

export async function updateCardHandler(ctx: MutationCtx, args: UpdateCardInput) {
  const { agent } = await authenticateAgent(ctx, args.apiKey);
  const existing = await getOwnedCardOrThrow(ctx, args.cardId, agent._id);
  const now = Date.now();

  if (existing.status === 'active' && agent.status !== 'active') {
    throw networkingError(
      'pending_claim',
      'The agent must be claimed before updating an active card.',
    );
  }

  const nextStatus = args.status === undefined ? existing.status : parseCardStatus(args.status);
  if (nextStatus === 'active') {
    assertAgentStatusIsClaimed(agent);
    if (existing.status !== 'active') {
      await assertActiveCardCapacity(ctx, agent._id);
    }
  }

  const nextCard = {
    type: args.type === undefined ? existing.type : parseCardType(args.type),
    title: args.title === undefined ? existing.title : normalizeText(args.title),
    summary: args.summary === undefined ? existing.summary : normalizeText(args.summary),
    detailsForMatching:
      args.detailsForMatching === undefined
        ? existing.detailsForMatching
        : normalizeText(args.detailsForMatching),
    tags: args.tags === undefined ? existing.tags : normalizeStringList(args.tags),
    domains: args.domains === undefined ? existing.domains : normalizeStringList(args.domains),
    desiredOutcome:
      args.desiredOutcome === undefined
        ? existing.desiredOutcome
        : normalizeText(args.desiredOutcome),
    status: nextStatus,
    agentGeneratedAt: args.agentGeneratedAt ?? existing.agentGeneratedAt,
    ownerConfirmedAt:
      args.ownerConfirmedAt === undefined ? existing.ownerConfirmedAt : args.ownerConfirmedAt,
  };

  validateCardText(nextCard);
  validateTagAndDomainLimits(nextCard.tags, nextCard.domains);
  const existingCanonical = getCanonicalCardTextForEmbedding(existing);
  const nextCanonical = getCanonicalCardTextForEmbedding(nextCard);
  const meaningChanged = existingCanonical !== nextCanonical;

  await ctx.db.patch(existing._id, {
    ...nextCard,
    updatedAt: now,
  });

  const updated = await ctx.db.get(existing._id);
  if (!updated) {
    throw networkingError('card_not_found', 'The updated card could not be loaded.');
  }
  if (existing.status === 'active' && (updated.status !== 'active' || meaningChanged)) {
    await markRecommendationsStaleForCard(
      ctx,
      updated._id,
      updated.status === 'active' ? 'card_meaning_changed' : 'card_no_longer_active',
    );
  }
  if (updated.status === 'active') {
    await runMatchingForCard(ctx, updated);
  }
  return updated;
}

export const pauseCard = mutation({
  args: {
    apiKey: v.string(),
    cardId: v.id('matchCards'),
  },
  handler: pauseCardHandler,
});

export async function pauseCardHandler(
  ctx: MutationCtx,
  args: { apiKey: string; cardId: Id<'matchCards'> },
) {
  return await updateCardHandler(ctx, {
    apiKey: args.apiKey,
    cardId: args.cardId,
    status: 'paused',
  });
}

export const deleteCard = mutation({
  args: {
    apiKey: v.string(),
    cardId: v.id('matchCards'),
  },
  handler: deleteCardHandler,
});

export async function deleteCardHandler(
  ctx: MutationCtx,
  args: { apiKey: string; cardId: Id<'matchCards'> },
) {
  const { agent } = await authenticateAgent(ctx, args.apiKey);
  const existing = await getOwnedCardOrThrow(ctx, args.cardId, agent._id);
  if (existing.status === 'active') {
    await markRecommendationsStaleForCard(ctx, existing._id, 'card_deleted');
  }

  const embedding = await ctx.db
    .query('cardEmbeddings')
    .withIndex('by_card', (q) => q.eq('cardId', existing._id))
    .first();
  if (embedding) {
    await ctx.db.delete(embedding._id);
  }
  await ctx.db.delete(existing._id);
  return { deleted: true as const, cardId: existing._id };
}

export const listCards = query({
  args: {
    apiKey: v.string(),
    status: v.optional(v.string()),
    type: v.optional(v.string()),
  },
  handler: (ctx, args) => listCardsHandler(ctx, args),
});

export async function listCardsHandler(
  ctx: QueryCtx,
  args: { apiKey: string; status?: string; type?: string },
) {
  const { agent } = await authenticateAgent(ctx, args.apiKey);
  const status = args.status === undefined ? undefined : parseCardStatus(args.status);
  const type = args.type === undefined ? undefined : parseCardType(args.type);
  const cards = await ctx.db
    .query('matchCards')
    .withIndex('by_agent', (q) => q.eq('agentId', agent._id))
    .collect();

  return cards
    .filter((card) => (status ? card.status === status : true))
    .filter((card) => (type ? card.type === type : true))
    .sort((left, right) => right.updatedAt - left.updatedAt);
}

export { getCanonicalCardTextForEmbedding };

async function getOwnedCardOrThrow(
  ctx: MutationCtx | QueryCtx,
  cardId: Id<'matchCards'>,
  agentId: Id<'networkAgents'>,
) {
  const card = await ctx.db.get(cardId);
  if (!card) {
    throw networkingError('card_not_found', 'The requested card does not exist.');
  }
  if (card.agentId !== agentId) {
    throw networkingError('card_access_denied', 'The requested card does not belong to this agent.');
  }
  return card;
}

async function assertActiveCardCapacity(
  ctx: MutationCtx,
  agentId: Id<'networkAgents'>,
) {
  const activeCards = await ctx.db
    .query('matchCards')
    .withIndex('by_agent_status', (q) => q.eq('agentId', agentId).eq('status', 'active'))
    .collect();
  if (activeCards.length >= MAX_ACTIVE_MATCH_CARDS_PER_AGENT) {
    throw networkingError(
      'active_card_limit',
      `An agent can have at most ${MAX_ACTIVE_MATCH_CARDS_PER_AGENT} active cards.`,
    );
  }
}

function parseCardType(value: string): CardType {
  if (!isCardType(value)) {
    throw networkingError('invalid_card_type', `Unsupported card type: ${value}`);
  }
  return value;
}

function parseCardStatus(value: string): CardStatus {
  if (!isCardStatus(value)) {
    throw networkingError('invalid_card_status', `Unsupported card status: ${value}`);
  }
  return value;
}

function validateCardText(card: {
  title: string;
  summary: string;
  detailsForMatching: string;
  desiredOutcome: string;
}) {
  if (!card.title || !card.summary || !card.detailsForMatching || !card.desiredOutcome) {
    throw networkingError(
      'empty_card_text',
      'Card title, summary, details, and desired outcome are required.',
    );
  }
  if (card.summary.length > MAX_CARD_SUMMARY_LENGTH) {
    throw networkingError(
      'summary_too_long',
      `Card summary must be ${MAX_CARD_SUMMARY_LENGTH} characters or less.`,
    );
  }
  if (card.detailsForMatching.length > MAX_CARD_DETAILS_LENGTH) {
    throw networkingError(
      'details_too_long',
      `Card details must be ${MAX_CARD_DETAILS_LENGTH} characters or less.`,
    );
  }
}

function validateTagAndDomainLimits(tags: string[], domains: string[]) {
  if (tags.length > MAX_CARD_TAGS || domains.length > MAX_CARD_DOMAINS) {
    throw networkingError('details_too_long', 'Card tags or domains exceed allowed limits.');
  }
  if (
    tags.some((tag) => tag.length > MAX_CARD_TAG_OR_DOMAIN_LENGTH) ||
    domains.some((domain) => domain.length > MAX_CARD_TAG_OR_DOMAIN_LENGTH)
  ) {
    throw networkingError('details_too_long', 'Card tags or domains contain oversized values.');
  }
}

function normalizeStringList(values: string[] | undefined) {
  if (!values) {
    return [];
  }
  const normalized = values.map((value) => value.trim()).filter(Boolean);
  return Array.from(new Set(normalized));
}

function normalizeText(value: string) {
  return value.trim();
}
