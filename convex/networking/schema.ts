import { defineTable } from 'convex/server';
import { v } from 'convex/values';
import { playerId } from '../aiTown/ids';
import { EMBEDDING_DIMENSION } from '../util/llm';
import {
  cardStatusValidator,
  cardTypeValidator,
  conversationStatusValidator,
  eventActivityTypeValidator,
  eventAgentStatusValidator,
  eventAvatarAssetStatusValidator,
  eventAvatarCategoryValidator,
  eventCardStatusValidator,
  eventConnectionIntentStatusValidator,
  eventOrganizerAuditTypeValidator,
  eventOrganizerApiKeyStatusValidator,
  eventOrganizerInviteStatusValidator,
  eventOrganizerRoleValidator,
  eventOwnerSessionStatusValidator,
  eventRegistrationStatusValidator,
  eventWorldTemplateIdValidator,
  introCandidateStatusValidator,
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
    townPlayerId: v.optional(v.string()),
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
    .index('by_text_hash', ['textHash'])
    .vectorIndex('embedding', {
      vectorField: 'embedding',
      filterFields: ['agentId'],
      dimensions: EMBEDDING_DIMENSION,
    }),

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
    .index('by_participant_two_status_updated_at', [
      'participantTwoAgentId',
      'status',
      'updatedAt',
    ]),

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

  introCandidates: defineTable({
    meetingId: v.id('meetings'),
    conversationId: v.id('agentConversations'),
    requesterAgentId: v.id('networkAgents'),
    requesterCardId: v.id('matchCards'),
    responderAgentId: v.id('networkAgents'),
    responderCardId: v.id('matchCards'),
    summary: v.string(),
    recommendedNextStep: v.string(),
    status: introCandidateStatusValidator,
    createdByAgentId: v.id('networkAgents'),
    qualificationMode: v.union(
      v.literal('conversation_closed'),
      v.literal('explicit_qualification'),
    ),
    requesterReviewedAt: v.optional(v.number()),
    responderReviewedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_meeting', ['meetingId'])
    .index('by_conversation_created_at', ['conversationId', 'createdAt'])
    .index('by_conversation_status_created_at', ['conversationId', 'status', 'createdAt'])
    .index('by_requester_status_created_at', ['requesterAgentId', 'status', 'createdAt'])
    .index('by_responder_status_created_at', ['responderAgentId', 'status', 'createdAt']),

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
    introCandidateId: v.optional(v.id('introCandidates')),
    payload: v.optional(v.any()),
    readAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_recipient_created_at', ['recipientAgentId', 'createdAt'])
    .index('by_recipient_status_created_at', ['recipientAgentId', 'status', 'createdAt'])
    .index('by_recipient_type_created_at', ['recipientAgentId', 'type', 'createdAt'])
    .index('by_recipient_dedupe_key', ['recipientAgentId', 'dedupeKey']),

  eventSpaces: defineTable({
    eventId: v.string(),
    title: v.string(),
    worldTemplateId: v.optional(eventWorldTemplateIdValidator),
    worldTemplateRevision: v.optional(v.string()),
    worldId: v.optional(v.id('worlds')),
    registrationStatus: eventRegistrationStatusValidator,
    skillUrl: v.optional(v.string()),
    registrationPausedAt: v.optional(v.number()),
    skillUrlRotatedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_event_id', ['eventId'])
    .index('by_world_id', ['worldId'])
    .index('by_registration_status', ['registrationStatus']),

  eventAgents: defineTable({
    eventId: v.string(),
    agentIdentifier: v.string(),
    publicMarkerSlug: v.optional(v.string()),
    displayName: v.string(),
    avatarConfig: v.object({
      hair: v.string(),
      skinTone: v.string(),
      clothing: v.string(),
      hat: v.optional(v.string()),
      accessory: v.optional(v.string()),
    }),
    approvalStatus: eventAgentStatusValidator,
    ownerSessionId: v.optional(v.id('eventOwnerSessions')),
    activeCardId: v.optional(v.id('eventNetworkingCards')),
    townPlayerId: v.optional(playerId),
    createdAt: v.number(),
    updatedAt: v.number(),
    approvedAt: v.optional(v.number()),
    rejectedAt: v.optional(v.number()),
    changesRequestedAt: v.optional(v.number()),
    revokedAt: v.optional(v.number()),
    revokedReason: v.optional(v.string()),
  })
    .index('by_event_and_agent_identifier', ['eventId', 'agentIdentifier'])
    .index('by_event_and_status', ['eventId', 'approvalStatus'])
    .index('by_event_updated_at', ['eventId', 'updatedAt']),

  eventNetworkingCards: defineTable({
    eventId: v.string(),
    eventAgentId: v.id('eventAgents'),
    publicCard: v.object({
      role: v.optional(v.string()),
      category: v.optional(v.string()),
      offers: v.array(v.string()),
      wants: v.array(v.string()),
      lookingFor: v.optional(v.string()),
      hobbies: v.array(v.string()),
      interests: v.array(v.string()),
      favoriteMedia: v.array(v.string()),
    }),
    status: eventCardStatusValidator,
    createdAt: v.number(),
    updatedAt: v.number(),
    approvedAt: v.optional(v.number()),
    rejectedAt: v.optional(v.number()),
    changesRequestedAt: v.optional(v.number()),
    revokedAt: v.optional(v.number()),
    revokedReason: v.optional(v.string()),
    reviewNote: v.optional(v.string()),
  })
    .index('by_event_and_status', ['eventId', 'status'])
    .index('by_agent_and_status', ['eventAgentId', 'status'])
    .index('by_event_updated_at', ['eventId', 'updatedAt']),

  eventOwnerSessions: defineTable({
    eventId: v.string(),
    eventAgentId: v.id('eventAgents'),
    cardId: v.id('eventNetworkingCards'),
    sessionTokenHash: v.bytes(),
    status: eventOwnerSessionStatusValidator,
    createdAt: v.number(),
    updatedAt: v.number(),
    decidedAt: v.optional(v.number()),
    revokedAt: v.optional(v.number()),
  })
    .index('by_session_token_hash', ['sessionTokenHash'])
    .index('by_event_and_status', ['eventId', 'status'])
    .index('by_agent', ['eventAgentId']),

  eventOrganizerInvites: defineTable({
    eventId: v.string(),
    inviteTokenHash: v.bytes(),
    inviteTokenPrefix: v.string(),
    status: eventOrganizerInviteStatusValidator,
    role: eventOrganizerRoleValidator,
    label: v.optional(v.string()),
    organizerEmail: v.optional(v.string()),
    organizerName: v.optional(v.string()),
    createdByActorKey: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
    expiresAt: v.number(),
    redeemedAt: v.optional(v.number()),
    redeemedByKeyId: v.optional(v.id('eventOrganizerApiKeys')),
    revokedAt: v.optional(v.number()),
  })
    .index('by_invite_token_hash', ['inviteTokenHash'])
    .index('by_event_and_status', ['eventId', 'status'])
    .index('by_event_created_at', ['eventId', 'createdAt']),

  eventOrganizerApiKeys: defineTable({
    eventId: v.string(),
    keyHash: v.bytes(),
    keyPrefix: v.string(),
    status: eventOrganizerApiKeyStatusValidator,
    role: eventOrganizerRoleValidator,
    label: v.optional(v.string()),
    createdFromInviteId: v.optional(v.id('eventOrganizerInvites')),
    createdByKeyId: v.optional(v.id('eventOrganizerApiKeys')),
    createdByActorKey: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
    lastUsedAt: v.optional(v.number()),
    revokedAt: v.optional(v.number()),
  })
    .index('by_key_hash', ['keyHash'])
    .index('by_event_and_status', ['eventId', 'status'])
    .index('by_event_created_at', ['eventId', 'createdAt'])
    .index('by_event_and_key_prefix', ['eventId', 'keyPrefix']),

  eventConnectionIntents: defineTable({
    eventId: v.string(),
    requesterAgentId: v.id('eventAgents'),
    targetAgentId: v.id('eventAgents'),
    requesterCardId: v.id('eventNetworkingCards'),
    targetCardId: v.id('eventNetworkingCards'),
    status: eventConnectionIntentStatusValidator,
    dedupeKey: v.string(),
    filterResult: v.object({
      allowed: v.boolean(),
      reasons: v.array(v.string()),
      evaluatedAt: v.number(),
    }),
    auditMetadata: v.object({
      source: v.literal('event_connection_intent_api'),
      requesterOwnerApprovalExternal: v.boolean(),
    }),
    decidedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_event_and_status', ['eventId', 'status'])
    .index('by_requester_and_status', ['requesterAgentId', 'status'])
    .index('by_target_and_status', ['targetAgentId', 'status'])
    .index('by_dedupe_key', ['dedupeKey']),

  eventActivityEvents: defineTable({
    eventId: v.string(),
    type: eventActivityTypeValidator,
    requesterDisplayName: v.string(),
    targetDisplayName: v.string(),
    requesterMarkerSlug: v.optional(v.string()),
    targetMarkerSlug: v.optional(v.string()),
    sourceIntentId: v.id('eventConnectionIntents'),
    movementInputId: v.optional(v.id('inputs')),
    movementQueuedAt: v.optional(v.number()),
    payload: v.object({
      matchKind: v.literal('recipient_approved'),
    }),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index('by_event_type_created_at', ['eventId', 'type', 'createdAt']),

  eventActivityAggregates: defineTable({
    eventId: v.string(),
    matchCount: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index('by_event_id', ['eventId']),

  eventOrganizerAuditEvents: defineTable({
    eventId: v.string(),
    type: eventOrganizerAuditTypeValidator,
    actorKind: v.union(
      v.literal('platform_operator'),
      v.literal('organizer'),
      v.literal('event_agent'),
      v.literal('public_requester'),
      v.literal('system'),
    ),
    actorKey: v.optional(v.string()),
    eventAgentId: v.optional(v.id('eventAgents')),
    metadata: v.optional(v.any()),
    createdAt: v.number(),
  })
    .index('by_event_created_at', ['eventId', 'createdAt'])
    .index('by_event_type_created_at', ['eventId', 'type', 'createdAt'])
    .index('by_event_actor_created_at', ['eventId', 'actorKey', 'createdAt'])
    .index('by_event_agent_created_at', ['eventAgentId', 'createdAt']),

  eventRecipientRules: defineTable({
    eventId: v.string(),
    eventAgentId: v.id('eventAgents'),
    rules: v.object({
      blockedAgentIds: v.array(v.id('eventAgents')),
      allowedCategories: v.array(v.string()),
      blockedCategories: v.array(v.string()),
      requiredKeywords: v.array(v.string()),
      blockedKeywords: v.array(v.string()),
    }),
    approvedAt: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_event_agent', ['eventAgentId'])
    .index('by_event', ['eventId']),

  eventPrivateContacts: defineTable({
    eventId: v.string(),
    eventAgentId: v.id('eventAgents'),
    contact: v.object({
      realName: v.optional(v.string()),
      company: v.optional(v.string()),
      email: v.optional(v.string()),
      phone: v.optional(v.string()),
      linkedin: v.optional(v.string()),
      x: v.optional(v.string()),
      website: v.optional(v.string()),
    }),
    approvedAt: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_event_agent', ['eventAgentId'])
    .index('by_event', ['eventId']),

  eventContactReveals: defineTable({
    eventId: v.string(),
    intentId: v.id('eventConnectionIntents'),
    requesterAgentId: v.id('eventAgents'),
    targetAgentId: v.id('eventAgents'),
    requesterContact: v.object({
      realName: v.optional(v.string()),
      company: v.optional(v.string()),
      email: v.optional(v.string()),
      phone: v.optional(v.string()),
      linkedin: v.optional(v.string()),
      x: v.optional(v.string()),
      website: v.optional(v.string()),
    }),
    targetContact: v.object({
      realName: v.optional(v.string()),
      company: v.optional(v.string()),
      email: v.optional(v.string()),
      phone: v.optional(v.string()),
      linkedin: v.optional(v.string()),
      x: v.optional(v.string()),
      website: v.optional(v.string()),
    }),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_intent', ['intentId'])
    .index('by_requester', ['requesterAgentId', 'createdAt'])
    .index('by_target', ['targetAgentId', 'createdAt']),

  eventAvatarAssets: defineTable({
    category: eventAvatarCategoryValidator,
    assetId: v.string(),
    label: v.string(),
    status: eventAvatarAssetStatusValidator,
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_category_and_asset_id', ['category', 'assetId'])
    .index('by_category_and_status', ['category', 'status']),
};
