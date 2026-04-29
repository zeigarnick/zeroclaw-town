import { v } from 'convex/values';
import { Doc, Id } from '../_generated/dataModel';
import {
  ActionCtx,
  MutationCtx,
  internalAction,
  internalMutation,
  internalQuery,
} from '../_generated/server';
import { makeFunctionReference } from 'convex/server';
import { hashSecret } from './auth';
import { getCanonicalCardTextForEmbedding } from './cardText';
import { writeRecommendationInboxEvent } from './inbox';
import { MATCH_CARD_STALE_AFTER_DAYS } from './validators';
import { EMBEDDING_DIMENSION, fetchEmbedding, getLLMConfig } from '../util/llm';

const DAY_MS = 24 * 60 * 60 * 1000;
const DETERMINISTIC_EMBEDDING_MODEL = 'deterministic-v1';
const DEFAULT_MIN_SCORE = 0.25;
const VECTOR_MATCH_CANDIDATE_LIMIT = 64;
const SCORE_WEIGHTS = {
  embeddingSimilarity: 0.45,
  typeCompatibility: 0.2,
  overlap: 0.15,
  desiredOutcomeFit: 0.1,
  freshness: 0.1,
  suppressionPenalty: 0.35,
} as const;

const TYPE_COMPATIBILITY: Record<string, number> = {
  'need->offer': 1,
  'need->exchange': 0.9,
  'exchange->offer': 0.85,
};

export type ScoreBreakdown = {
  embeddingSimilarity: number;
  typeCompatibility: number;
  overlap: number;
  desiredOutcomeFit: number;
  freshness: number;
  suppressionPenalty: number;
};

export type MatchScore = {
  finalScore: number;
  breakdown: ScoreBreakdown;
};

type MatchScoringInput = {
  recipientCard: Doc<'matchCards'>;
  providerCard: Doc<'matchCards'>;
  recipientEmbedding: number[];
  providerEmbedding: number[];
  typeCompatibility: number;
  now: number;
  suppressionPenalty: number;
};

export type MatchScorer = (input: MatchScoringInput) => MatchScore;
export type EmbeddingLookup = (
  cards: ReadonlyArray<Doc<'matchCards'>>,
) => Promise<Map<Id<'matchCards'>, number[]>>;

type MatchDirection = {
  recipientCard: Doc<'matchCards'>;
  providerCard: Doc<'matchCards'>;
  typeCompatibility: number;
  cardPairKey: string;
};

type MatchingRunOptions = {
  now?: number;
  minScore?: number;
  embeddingLookup?: EmbeddingLookup;
  scorer?: MatchScorer;
};

type MatchRunResult = {
  evaluated: number;
  created: number;
  updated: number;
  skippedSuppressed: number;
  skippedBelowThreshold: number;
};

function emptyMatchRunResult(): MatchRunResult {
  return {
    evaluated: 0,
    created: 0,
    updated: 0,
    skippedSuppressed: 0,
    skippedBelowThreshold: 0,
  };
}

const loadVectorMatchingSeedRef = makeFunctionReference<'query'>(
  'networking/matching:loadVectorMatchingSeed',
);
const runMatchingForVectorCandidatesRef = makeFunctionReference<'mutation'>(
  'networking/matching:runMatchingForVectorCandidates',
);
const writeCardEmbeddingRef = makeFunctionReference<'mutation'>(
  'networking/matching:writeCardEmbedding',
);

export function createCardPairKey(
  recipientCardId: Id<'matchCards'>,
  providerCardId: Id<'matchCards'>,
) {
  return `${recipientCardId}:${providerCardId}`;
}

export async function runMatchingForCard(
  ctx: MutationCtx,
  triggerCard: Doc<'matchCards'>,
  options: MatchingRunOptions = {},
): Promise<MatchRunResult> {
  if (triggerCard.status !== 'active') {
    return {
      evaluated: 0,
      created: 0,
      updated: 0,
      skippedSuppressed: 0,
      skippedBelowThreshold: 0,
    };
  }

  const now = options.now ?? Date.now();
  const minScore = options.minScore ?? DEFAULT_MIN_SCORE;
  const scorer = options.scorer ?? scoreMatch;
  const activeCards = await ctx.db
    .query('matchCards')
    .withIndex('by_status_updated_at', (q) => q.eq('status', 'active'))
    .collect();

  return await runMatchingForCardAgainstCandidates(ctx, triggerCard, activeCards, options);
}

async function runMatchingForCardAgainstCandidates(
  ctx: MutationCtx,
  triggerCard: Doc<'matchCards'>,
  candidateCards: Doc<'matchCards'>[],
  options: MatchingRunOptions = {},
): Promise<MatchRunResult> {
  const now = options.now ?? Date.now();
  const minScore = options.minScore ?? DEFAULT_MIN_SCORE;
  const scorer = options.scorer ?? scoreMatch;
  const directionsByPair = new Map<string, MatchDirection>();
  for (const candidate of candidateCards) {
    if (candidate._id === triggerCard._id || candidate.agentId === triggerCard.agentId) {
      continue;
    }

    const primary = buildMatchDirection(triggerCard, candidate);
    if (primary) {
      directionsByPair.set(primary.cardPairKey, primary);
    }

    const reverse = buildMatchDirection(candidate, triggerCard);
    if (reverse) {
      directionsByPair.set(reverse.cardPairKey, reverse);
    }
  }

  const directions = Array.from(directionsByPair.values()).sort((left, right) =>
    left.cardPairKey.localeCompare(right.cardPairKey),
  );
  if (directions.length === 0) {
    return {
      evaluated: 0,
      created: 0,
      updated: 0,
      skippedSuppressed: 0,
      skippedBelowThreshold: 0,
    };
  }

  const cardsById = new Map<Id<'matchCards'>, Doc<'matchCards'>>();
  for (const direction of directions) {
    cardsById.set(direction.recipientCard._id, direction.recipientCard);
    cardsById.set(direction.providerCard._id, direction.providerCard);
  }

  const embeddings = await resolveEmbeddings(ctx, Array.from(cardsById.values()), {
    now,
    embeddingLookup: options.embeddingLookup,
  });

  let created = 0;
  let updated = 0;
  let skippedSuppressed = 0;
  let skippedBelowThreshold = 0;

  for (const direction of directions) {
    const suppression = await getSuppressionState(ctx, direction.cardPairKey);
    if (suppression.isSuppressed) {
      skippedSuppressed += 1;
      continue;
    }

    const recipientEmbedding = embeddings.get(direction.recipientCard._id);
    const providerEmbedding = embeddings.get(direction.providerCard._id);
    if (!recipientEmbedding || !providerEmbedding) {
      skippedBelowThreshold += 1;
      continue;
    }

    const score = scorer({
      recipientCard: direction.recipientCard,
      providerCard: direction.providerCard,
      recipientEmbedding,
      providerEmbedding,
      typeCompatibility: direction.typeCompatibility,
      now,
      suppressionPenalty: suppression.penalty,
    });
    if (score.finalScore < minScore) {
      skippedBelowThreshold += 1;
      continue;
    }

    const result = await upsertRecommendation(ctx, direction, score, now);
    if (result === 'created') {
      created += 1;
    } else {
      updated += 1;
    }
  }

  return {
    evaluated: directions.length,
    created,
    updated,
    skippedSuppressed,
    skippedBelowThreshold,
  };
}

export async function markRecommendationsStaleForCard(
  ctx: MutationCtx,
  cardId: Id<'matchCards'>,
  staleReason: string,
  now = Date.now(),
) {
  const recipientRecommendations = await ctx.db
    .query('recommendations')
    .withIndex('by_recipient_card_status', (q) => q.eq('recipientCardId', cardId).eq('status', 'active'))
    .collect();
  const providerRecommendations = await ctx.db
    .query('recommendations')
    .withIndex('by_provider_card_status', (q) => q.eq('providerCardId', cardId).eq('status', 'active'))
    .collect();

  const activeById = new Map<string, Doc<'recommendations'>>();
  for (const recommendation of recipientRecommendations) {
    activeById.set(recommendation._id, recommendation);
  }
  for (const recommendation of providerRecommendations) {
    activeById.set(recommendation._id, recommendation);
  }

  for (const recommendation of activeById.values()) {
    await ctx.db.patch(recommendation._id, {
      status: 'stale',
      staleReason,
      updatedAt: now,
    });
  }

  return activeById.size;
}

export const runVectorMatchingForCard = internalAction({
  args: {
    cardId: v.id('matchCards'),
  },
  handler: async (ctx, args) => runVectorMatchingForCardHandler(ctx, args),
});

export async function runVectorMatchingForCardHandler(
  ctx: Pick<ActionCtx, 'runQuery' | 'runMutation' | 'vectorSearch'>,
  args: { cardId: Id<'matchCards'> },
) {
  if (!platformVectorMatchingAvailableForEventMode()) {
    return emptyMatchRunResult();
  }

  const seed = await ctx.runQuery(loadVectorMatchingSeedRef, args);
  if (!seed) {
    return emptyMatchRunResult();
  }

  let embedding = seed.embedding;
  if (!embedding) {
    const generated = await fetchSemanticEmbeddingWithFallback(seed.canonicalText);
    const writeResult = await ctx.runMutation(writeCardEmbeddingRef, {
      cardId: args.cardId,
      textHash: seed.textHash,
      embedding: generated.embedding,
      model: generated.model,
    });
    if (!writeResult.written) {
      return emptyMatchRunResult();
    }
    embedding = generated.embedding;
  }

  const candidates = await ctx.vectorSearch('cardEmbeddings', 'embedding', {
    vector: embedding,
    limit: VECTOR_MATCH_CANDIDATE_LIMIT,
  });

  return await ctx.runMutation(runMatchingForVectorCandidatesRef, {
    triggerCardId: args.cardId,
    candidateEmbeddingIds: candidates.map((candidate) => candidate._id),
  });
}

export function platformVectorMatchingAvailableForEventMode(
  eventMode = process.env.OPENNETWORK_EVENT_MODE,
) {
  if (!eventMode) {
    return true;
  }
  return !['1', 'true', 'yes', 'on'].includes(eventMode.trim().toLowerCase());
}

export const loadVectorMatchingSeed = internalQuery({
  args: {
    cardId: v.id('matchCards'),
  },
  handler: async (ctx, args) => {
    const card = await ctx.db.get(args.cardId);
    if (!card || card.status !== 'active') {
      return null;
    }
    const canonicalText = getCanonicalCardTextForEmbedding(card);
    const textHash = await hashSecret(canonicalText);

    const embedding = await ctx.db
      .query('cardEmbeddings')
      .withIndex('by_card', (q) => q.eq('cardId', card._id))
      .first();
    const hasReusableEmbedding =
      embedding &&
      buffersEqual(embedding.textHash, textHash) &&
      embedding.embedding.length === EMBEDDING_DIMENSION &&
      embedding.model !== DETERMINISTIC_EMBEDDING_MODEL;

    return {
      canonicalText,
      textHash,
      embedding: hasReusableEmbedding ? embedding.embedding : null,
    };
  },
});

export const writeCardEmbedding = internalMutation({
  args: {
    cardId: v.id('matchCards'),
    textHash: v.bytes(),
    embedding: v.array(v.float64()),
    model: v.string(),
  },
  handler: async (ctx, args) => writeCardEmbeddingHandler(ctx, args),
});

export async function writeCardEmbeddingHandler(
  ctx: MutationCtx,
  args: {
    cardId: Id<'matchCards'>;
    textHash: ArrayBuffer;
    embedding: number[];
    model: string;
  },
) {
  const card = await ctx.db.get(args.cardId);
  if (!card || card.status !== 'active') {
    return { written: false as const };
  }
  const currentTextHash = await hashSecret(getCanonicalCardTextForEmbedding(card));
  if (!buffersEqual(currentTextHash, args.textHash)) {
    return { written: false as const };
  }
  if (args.embedding.length !== EMBEDDING_DIMENSION) {
    throw new Error(
      `Expected networking card embedding dimension ${EMBEDDING_DIMENSION}, got ${args.embedding.length}`,
    );
  }

  const now = Date.now();
  const existing = await ctx.db
    .query('cardEmbeddings')
    .withIndex('by_card', (q) => q.eq('cardId', card._id))
    .first();
  if (existing) {
    await ctx.db.patch(existing._id, {
      agentId: card.agentId,
      textHash: args.textHash,
      embedding: args.embedding,
      model: args.model,
      updatedAt: now,
    });
    return { written: true as const, embeddingId: existing._id };
  }

  const embeddingId = await ctx.db.insert('cardEmbeddings', {
    cardId: card._id,
    agentId: card.agentId,
    textHash: args.textHash,
    embedding: args.embedding,
    model: args.model,
    updatedAt: now,
  });
  return { written: true as const, embeddingId };
}

export const runMatchingForVectorCandidates = internalMutation({
  args: {
    triggerCardId: v.id('matchCards'),
    candidateEmbeddingIds: v.array(v.id('cardEmbeddings')),
  },
  handler: async (ctx, args) => runMatchingForVectorCandidatesHandler(ctx, args),
});

export async function runMatchingForVectorCandidatesHandler(
  ctx: MutationCtx,
  args: {
    triggerCardId: Id<'matchCards'>;
    candidateEmbeddingIds: Id<'cardEmbeddings'>[];
  },
) {
  const triggerCard = await ctx.db.get(args.triggerCardId);
  if (!triggerCard || triggerCard.status !== 'active') {
    return emptyMatchRunResult();
  }

  await ensureEmbeddingForCard(ctx, triggerCard);
  const candidateCards = [];
  for (const embeddingId of args.candidateEmbeddingIds) {
    const embedding = await ctx.db.get(embeddingId);
    if (!embedding || embedding.cardId === triggerCard._id) {
      continue;
    }

    const card = await ctx.db.get(embedding.cardId);
    if (card?.status === 'active') {
      candidateCards.push(card);
    }
  }

  return await runMatchingForCardAgainstCandidates(ctx, triggerCard, candidateCards);
}

export async function ensureEmbeddingForCard(ctx: MutationCtx, card: Doc<'matchCards'>) {
  const embeddings = await resolveEmbeddings(ctx, [card], { now: Date.now() });
  return embeddings.get(card._id);
}

export function scoreMatch(input: MatchScoringInput): MatchScore {
  const embeddingSimilarity = toUnitRange(
    cosineSimilarity(input.recipientEmbedding, input.providerEmbedding),
  );
  const overlap = average(
    jaccard(input.recipientCard.tags, input.providerCard.tags),
    jaccard(input.recipientCard.domains, input.providerCard.domains),
  );
  const desiredOutcomeFit = textOverlap(
    input.recipientCard.desiredOutcome,
    input.providerCard.desiredOutcome,
  );
  const freshness = freshnessScore(
    Math.min(input.recipientCard.updatedAt, input.providerCard.updatedAt),
    input.now,
  );
  const suppressionPenalty = clamp(input.suppressionPenalty);

  const weighted =
    embeddingSimilarity * SCORE_WEIGHTS.embeddingSimilarity +
    input.typeCompatibility * SCORE_WEIGHTS.typeCompatibility +
    overlap * SCORE_WEIGHTS.overlap +
    desiredOutcomeFit * SCORE_WEIGHTS.desiredOutcomeFit +
    freshness * SCORE_WEIGHTS.freshness -
    suppressionPenalty * SCORE_WEIGHTS.suppressionPenalty;

  return {
    finalScore: roundScore(clamp(weighted)),
    breakdown: {
      embeddingSimilarity: roundScore(embeddingSimilarity),
      typeCompatibility: roundScore(input.typeCompatibility),
      overlap: roundScore(overlap),
      desiredOutcomeFit: roundScore(desiredOutcomeFit),
      freshness: roundScore(freshness),
      suppressionPenalty: roundScore(suppressionPenalty),
    },
  };
}

function buildMatchDirection(
  recipientCard: Doc<'matchCards'>,
  providerCard: Doc<'matchCards'>,
): MatchDirection | null {
  const typeKey = `${recipientCard.type}->${providerCard.type}`;
  const typeCompatibility = TYPE_COMPATIBILITY[typeKey];
  if (typeCompatibility === undefined) {
    return null;
  }
  return {
    recipientCard,
    providerCard,
    typeCompatibility,
    cardPairKey: createCardPairKey(recipientCard._id, providerCard._id),
  };
}

async function resolveEmbeddings(
  ctx: MutationCtx,
  cards: Array<Doc<'matchCards'>>,
  options: {
    now: number;
    embeddingLookup?: EmbeddingLookup;
  },
) {
  if (options.embeddingLookup) {
    const provided = await options.embeddingLookup(cards);
    const out = new Map<Id<'matchCards'>, number[]>();
    for (const card of cards) {
      const embedding = provided.get(card._id);
      if (embedding) {
        out.set(card._id, embedding);
      }
    }
    return out;
  }

  const embeddings = new Map<Id<'matchCards'>, number[]>();
  for (const card of cards) {
    const canonicalText = getCanonicalCardTextForEmbedding(card);
    const textHash = await hashSecret(canonicalText);
    const existing = await ctx.db
      .query('cardEmbeddings')
      .withIndex('by_card', (q) => q.eq('cardId', card._id))
      .first();

    if (existing && buffersEqual(existing.textHash, textHash)) {
      embeddings.set(card._id, existing.embedding);
      continue;
    }

    const embedding = deterministicEmbedding(canonicalText);
    if (existing) {
      await ctx.db.patch(existing._id, {
        agentId: card.agentId,
        textHash,
        embedding,
        model: DETERMINISTIC_EMBEDDING_MODEL,
        updatedAt: options.now,
      });
    } else {
      await ctx.db.insert('cardEmbeddings', {
        cardId: card._id,
        agentId: card.agentId,
        textHash,
        embedding,
        model: DETERMINISTIC_EMBEDDING_MODEL,
        updatedAt: options.now,
      });
    }
    embeddings.set(card._id, embedding);
  }
  return embeddings;
}

async function getSuppressionState(ctx: MutationCtx, cardPairKey: string) {
  const suppression = await ctx.db
    .query('recommendationSuppressions')
    .withIndex('by_card_pair', (q) => q.eq('cardPairKey', cardPairKey))
    .first();
  if (suppression) {
    return { isSuppressed: true, penalty: 1 };
  }

  const dismissed = await ctx.db
    .query('recommendations')
    .withIndex('by_card_pair_status', (q) => q.eq('cardPairKey', cardPairKey).eq('status', 'dismissed'))
    .first();
  if (dismissed) {
    await ensureSuppression(ctx, {
      recipientAgentId: dismissed.recipientAgentId,
      recipientCardId: dismissed.recipientCardId,
      providerAgentId: dismissed.providerAgentId,
      providerCardId: dismissed.providerCardId,
      cardPairKey,
      reason: 'dismissed',
      sourceRecommendationId: dismissed._id,
    });
    return { isSuppressed: true, penalty: 1 };
  }

  const declined = await ctx.db
    .query('recommendations')
    .withIndex('by_card_pair_status', (q) => q.eq('cardPairKey', cardPairKey).eq('status', 'declined'))
    .first();
  if (declined) {
    await ensureSuppression(ctx, {
      recipientAgentId: declined.recipientAgentId,
      recipientCardId: declined.recipientCardId,
      providerAgentId: declined.providerAgentId,
      providerCardId: declined.providerCardId,
      cardPairKey,
      reason: 'declined',
      sourceRecommendationId: declined._id,
    });
    return { isSuppressed: true, penalty: 1 };
  }

  return { isSuppressed: false, penalty: 0 };
}

async function ensureSuppression(
  ctx: MutationCtx,
  args: {
    recipientAgentId: Id<'networkAgents'>;
    recipientCardId: Id<'matchCards'>;
    providerAgentId: Id<'networkAgents'>;
    providerCardId: Id<'matchCards'>;
    cardPairKey: string;
    reason: 'dismissed' | 'declined';
    sourceRecommendationId?: Id<'recommendations'>;
  },
) {
  const now = Date.now();
  const existing = await ctx.db
    .query('recommendationSuppressions')
    .withIndex('by_card_pair', (q) => q.eq('cardPairKey', args.cardPairKey))
    .first();
  if (existing) {
    await ctx.db.patch(existing._id, {
      reason: args.reason,
      updatedAt: now,
      sourceRecommendationId: args.sourceRecommendationId,
    });
    return existing._id;
  }
  return await ctx.db.insert('recommendationSuppressions', {
    ...args,
    createdAt: now,
    updatedAt: now,
  });
}

async function upsertRecommendation(
  ctx: MutationCtx,
  direction: MatchDirection,
  score: MatchScore,
  now: number,
) {
  const existing = await ctx.db
    .query('recommendations')
    .withIndex('by_card_pair_status', (q) =>
      q.eq('cardPairKey', direction.cardPairKey).eq('status', 'active'),
    )
    .first();

  if (existing) {
    await ctx.db.patch(existing._id, {
      score: score.finalScore,
      scoreBreakdown: score.breakdown,
      updatedAt: now,
    });
    return 'updated' as const;
  }

  const recommendationId = await ctx.db.insert('recommendations', {
    recipientAgentId: direction.recipientCard.agentId,
    recipientCardId: direction.recipientCard._id,
    providerAgentId: direction.providerCard.agentId,
    providerCardId: direction.providerCard._id,
    cardPairKey: direction.cardPairKey,
    status: 'active',
    score: score.finalScore,
    scoreBreakdown: score.breakdown,
    createdAt: now,
    updatedAt: now,
  });
  await writeRecommendationInboxEvent(ctx, {
    recommendationId,
    recipientAgentId: direction.recipientCard.agentId,
    providerAgentId: direction.providerCard.agentId,
    recipientCardId: direction.recipientCard._id,
    providerCardId: direction.providerCard._id,
    cardPairKey: direction.cardPairKey,
    score: score.finalScore,
    now,
  });
  return 'created' as const;
}

function buffersEqual(left: ArrayBuffer, right: ArrayBuffer) {
  if (left.byteLength !== right.byteLength) {
    return false;
  }
  const leftBytes = new Uint8Array(left);
  const rightBytes = new Uint8Array(right);
  for (let i = 0; i < leftBytes.length; i++) {
    if (leftBytes[i] !== rightBytes[i]) {
      return false;
    }
  }
  return true;
}

async function fetchSemanticEmbeddingWithFallback(text: string) {
  try {
    const { embedding } = await fetchEmbedding(text);
    if (embedding.length !== EMBEDDING_DIMENSION) {
      throw new Error(`Expected ${EMBEDDING_DIMENSION} dimensions, got ${embedding.length}`);
    }
    return {
      embedding,
      model: getLLMConfig().embeddingModel,
    };
  } catch (error) {
    console.warn(
      'Falling back to deterministic networking embedding:',
      error instanceof Error ? error.message : String(error),
    );
    return {
      embedding: deterministicEmbedding(text),
      model: DETERMINISTIC_EMBEDDING_MODEL,
    };
  }
}

function deterministicEmbedding(text: string, dimension = EMBEDDING_DIMENSION) {
  const tokens = tokenize(text);
  const vector = new Array<number>(dimension).fill(0);
  for (const token of tokens) {
    const hash = stableHash(token);
    vector[hash % dimension] += 1;
    vector[(hash >>> 8) % dimension] += 0.5;
    vector[(hash >>> 16) % dimension] -= 0.25;
  }
  return normalizeVector(vector);
}

function tokenize(text: string) {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .map((token) => token.trim())
    .filter(Boolean);
}

function stableHash(input: string) {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function normalizeVector(values: number[]) {
  const norm = Math.sqrt(values.reduce((sum, value) => sum + value * value, 0));
  if (norm === 0) {
    return values;
  }
  return values.map((value) => value / norm);
}

function cosineSimilarity(left: number[], right: number[]) {
  const length = Math.min(left.length, right.length);
  if (length === 0) {
    return 0;
  }
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let i = 0; i < length; i++) {
    dot += left[i] * right[i];
    leftNorm += left[i] * left[i];
    rightNorm += right[i] * right[i];
  }
  if (leftNorm === 0 || rightNorm === 0) {
    return 0;
  }
  return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm));
}

function jaccard(left: string[], right: string[]) {
  const leftSet = new Set(left.map((item) => item.trim().toLowerCase()).filter(Boolean));
  const rightSet = new Set(right.map((item) => item.trim().toLowerCase()).filter(Boolean));
  if (leftSet.size === 0 || rightSet.size === 0) {
    return 0;
  }

  let overlap = 0;
  for (const value of leftSet) {
    if (rightSet.has(value)) {
      overlap += 1;
    }
  }
  return overlap / (leftSet.size + rightSet.size - overlap);
}

function textOverlap(left: string, right: string) {
  return jaccard(tokenize(left), tokenize(right));
}

function freshnessScore(cardUpdatedAt: number, now: number) {
  const ageMs = Math.max(0, now - cardUpdatedAt);
  const ageDays = ageMs / DAY_MS;
  const freshness = 1 - ageDays / MATCH_CARD_STALE_AFTER_DAYS;
  return clamp(freshness);
}

function average(left: number, right: number) {
  return (left + right) / 2;
}

function toUnitRange(value: number) {
  return clamp((value + 1) / 2);
}

function clamp(value: number) {
  if (value < 0) {
    return 0;
  }
  if (value > 1) {
    return 1;
  }
  return value;
}

function roundScore(value: number) {
  return Number(value.toFixed(6));
}
