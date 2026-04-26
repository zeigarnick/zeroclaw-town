import { defineTable } from 'convex/server';
import { v } from 'convex/values';

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
};
