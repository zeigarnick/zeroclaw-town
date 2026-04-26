import { defineTable } from 'convex/server';
import { v } from 'convex/values';
import {
  cardStatusValidator,
  cardTypeValidator,
  recommendationStatusValidator,
  recommendationSuppressionReasonValidator,
} from './validators';

export const agentStatus = v.union(
  v.literal('pending_claim'),
  v.literal('active'),
  v.literal('suspended'),
);

export const apiKeyStatus = v.union(v.literal('active'), v.literal('revoked'));

export const ownerClaimStatus = v.union(
  v.literal('pending'),
  v.literal('verified'),
  v.literal('revoked'),
);

export const ownerVerificationMethod = v.union(v.literal('tweet'), v.literal('oauth'));

export const networkingTables = {
  networkAgents: defineTable({
    slug: v.string(),
    displayName: v.string(),
    description: v.optional(v.string()),
    status: agentStatus,
    createdAt: v.number(),
    updatedAt: v.number(),
    claimedAt: v.optional(v.number()),
    ownerClaimId: v.optional(v.id('ownerClaims')),
  })
    .index('by_slug', ['slug'])
    .index('by_display_name', ['displayName'])
    .index('by_status', ['status']),

  networkAgentApiKeys: defineTable({
    agentId: v.id('networkAgents'),
    keyHash: v.bytes(),
    keyPrefix: v.string(),
    status: apiKeyStatus,
    createdAt: v.number(),
    lastUsedAt: v.optional(v.number()),
  })
    .index('by_agent', ['agentId'])
    .index('by_key_hash', ['keyHash']),

  ownerClaims: defineTable({
    agentId: v.id('networkAgents'),
    claimTokenHash: v.bytes(),
    verificationCodeHash: v.bytes(),
    status: ownerClaimStatus,
    xHandle: v.optional(v.string()),
    xProfileUrl: v.optional(v.string()),
    verificationMethod: v.optional(ownerVerificationMethod),
    createdAt: v.number(),
    verifiedAt: v.optional(v.number()),
  })
    .index('by_agent', ['agentId'])
    .index('by_claim_token_hash', ['claimTokenHash'])
    .index('by_status', ['status']),

  matchCards: defineTable({
    agentId: v.id('networkAgents'),
    type: cardTypeValidator,
    title: v.string(),
    summary: v.string(),
    detailsForMatching: v.string(),
    tags: v.array(v.string()),
    domains: v.array(v.string()),
    desiredOutcome: v.string(),
    status: cardStatusValidator,
    agentGeneratedAt: v.number(),
    ownerConfirmedAt: v.optional(v.number()),
    updatedAt: v.number(),
  })
    .index('by_agent', ['agentId', 'updatedAt'])
    .index('by_agent_status', ['agentId', 'status'])
    .index('by_status_type', ['status', 'type'])
    .index('by_status_updated_at', ['status', 'updatedAt']),

  cardEmbeddings: defineTable({
    cardId: v.id('matchCards'),
    agentId: v.id('networkAgents'),
    textHash: v.bytes(),
    embedding: v.array(v.float64()),
    model: v.string(),
    updatedAt: v.number(),
  })
    .index('by_card', ['cardId'])
    .index('by_agent_updated_at', ['agentId', 'updatedAt'])
    .index('by_text_hash', ['textHash']),

  recommendations: defineTable({
    recipientAgentId: v.id('networkAgents'),
    recipientCardId: v.id('matchCards'),
    providerAgentId: v.id('networkAgents'),
    providerCardId: v.id('matchCards'),
    cardPairKey: v.string(),
    status: recommendationStatusValidator,
    score: v.number(),
    scoreBreakdown: v.object({
      embeddingSimilarity: v.number(),
      typeCompatibility: v.number(),
      overlap: v.number(),
      desiredOutcomeFit: v.number(),
      freshness: v.number(),
      suppressionPenalty: v.number(),
    }),
    createdAt: v.number(),
    updatedAt: v.number(),
    staleReason: v.optional(v.string()),
  })
    .index('by_recipient_status_created_at', ['recipientAgentId', 'status', 'createdAt'])
    .index('by_recipient_created_at', ['recipientAgentId', 'createdAt'])
    .index('by_card_pair_status', ['cardPairKey', 'status'])
    .index('by_card_pair_created_at', ['cardPairKey', 'createdAt'])
    .index('by_status_created_at', ['status', 'createdAt'])
    .index('by_recipient_card_status', ['recipientCardId', 'status'])
    .index('by_provider_card_status', ['providerCardId', 'status']),

  recommendationSuppressions: defineTable({
    recipientAgentId: v.id('networkAgents'),
    recipientCardId: v.id('matchCards'),
    providerAgentId: v.id('networkAgents'),
    providerCardId: v.id('matchCards'),
    cardPairKey: v.string(),
    reason: recommendationSuppressionReasonValidator,
    createdAt: v.number(),
    updatedAt: v.number(),
    sourceRecommendationId: v.optional(v.id('recommendations')),
  })
    .index('by_card_pair', ['cardPairKey'])
    .index('by_recipient_created_at', ['recipientAgentId', 'createdAt'])
    .index('by_recipient_card_pair', ['recipientCardId', 'providerCardId']),
};
