import { defineTable } from 'convex/server';
import { v } from 'convex/values';
import {
  cardStatusValidator,
  cardTypeValidator,
  conversationStatusValidator,
  inboxEventStatusValidator,
  inboxItemTypeValidator,
  meetingStatusValidator,
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

  meetings: defineTable({
    recommendationId: v.id('recommendations'),
    requesterAgentId: v.id('networkAgents'),
    requesterCardId: v.id('matchCards'),
    responderAgentId: v.id('networkAgents'),
    responderCardId: v.id('matchCards'),
    cardPairKey: v.string(),
    status: meetingStatusValidator,
    requestMessage: v.optional(v.string()),
    outreachContext: v.object({
      requesterCardSummary: v.string(),
      responderCardTitle: v.string(),
      requestedOutcome: v.string(),
    }),
    conversationId: v.optional(v.id('agentConversations')),
    declinedByAgentId: v.optional(v.id('networkAgents')),
    respondedAt: v.optional(v.number()),
    expiresAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_recommendation', ['recommendationId'])
    .index('by_requester_status_created_at', ['requesterAgentId', 'status', 'createdAt'])
    .index('by_responder_status_created_at', ['responderAgentId', 'status', 'createdAt'])
    .index('by_status_created_at', ['status', 'createdAt']),

  agentConversations: defineTable({
    meetingId: v.id('meetings'),
    participantOneAgentId: v.id('networkAgents'),
    participantTwoAgentId: v.id('networkAgents'),
    status: conversationStatusValidator,
    closedByAgentId: v.optional(v.id('networkAgents')),
    closedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_meeting', ['meetingId'])
    .index('by_participant_one_status_updated_at', ['participantOneAgentId', 'status', 'updatedAt'])
    .index('by_participant_two_status_updated_at', ['participantTwoAgentId', 'status', 'updatedAt']),

  agentMessages: defineTable({
    conversationId: v.id('agentConversations'),
    authorAgentId: v.id('networkAgents'),
    recipientAgentId: v.id('networkAgents'),
    clientMessageId: v.string(),
    body: v.string(),
    createdAt: v.number(),
  })
    .index('by_conversation_created_at', ['conversationId', 'createdAt'])
    .index('by_conversation_client_message_id', ['conversationId', 'clientMessageId'])
    .index('by_recipient_created_at', ['recipientAgentId', 'createdAt']),

  inboxEvents: defineTable({
    recipientAgentId: v.id('networkAgents'),
    actorAgentId: v.optional(v.id('networkAgents')),
    type: inboxItemTypeValidator,
    status: inboxEventStatusValidator,
    dedupeKey: v.optional(v.string()),
    recommendationId: v.optional(v.id('recommendations')),
    meetingId: v.optional(v.id('meetings')),
    conversationId: v.optional(v.id('agentConversations')),
    messageId: v.optional(v.id('agentMessages')),
    introCandidateId: v.optional(v.string()),
    payload: v.optional(v.any()),
    readAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_recipient_created_at', ['recipientAgentId', 'createdAt'])
    .index('by_recipient_status_created_at', ['recipientAgentId', 'status', 'createdAt'])
    .index('by_recipient_type_created_at', ['recipientAgentId', 'type', 'createdAt'])
    .index('by_recipient_dedupe_key', ['recipientAgentId', 'dedupeKey']),
};
