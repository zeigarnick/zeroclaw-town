import { v } from 'convex/values';
import { mutation, query } from '../_generated/server';
import {
  formatClaimUrl,
  generateApiKey,
  generateClaimToken,
  generateVerificationCode,
  getKeyPrefix,
  hashSecret,
  networkingError,
} from './auth';

const DEFAULT_CLAIM_BASE_URL = 'https://town.example/claim';

export const registerAgent = mutation({
  args: {
    slug: v.string(),
    displayName: v.string(),
    description: v.optional(v.string()),
    claimBaseUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const slug = normalizeSlug(args.slug);
    if (!slug) {
      throw networkingError('invalid_agent_slug', 'Agent slug is required.');
    }

    const existing = await ctx.db
      .query('networkAgents')
      .withIndex('by_slug', (q) => q.eq('slug', slug))
      .first();
    if (existing) {
      throw networkingError('duplicate_agent_slug', 'An agent with this slug already exists.');
    }

    const now = Date.now();
    const apiKey = generateApiKey();
    const claimToken = generateClaimToken();
    const verificationCode = generateVerificationCode();

    const agentId = await ctx.db.insert('networkAgents', {
      slug,
      displayName: args.displayName.trim(),
      ...(args.description ? { description: args.description.trim() } : {}),
      status: 'pending_claim',
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.insert('networkAgentApiKeys', {
      agentId,
      keyHash: await hashSecret(apiKey),
      keyPrefix: getKeyPrefix(apiKey),
      status: 'active',
      createdAt: now,
    });

    const ownerClaimId = await ctx.db.insert('ownerClaims', {
      agentId,
      claimTokenHash: await hashSecret(claimToken),
      verificationCodeHash: await hashSecret(verificationCode),
      status: 'pending',
      createdAt: now,
    });

    await ctx.db.patch(agentId, { ownerClaimId, updatedAt: now });

    return {
      agentId,
      agentSlug: slug,
      apiKey,
      claimUrl: formatClaimUrl(args.claimBaseUrl ?? DEFAULT_CLAIM_BASE_URL, claimToken),
      verificationCode,
      status: 'pending_claim' as const,
    };
  },
});

export const getClaimStatus = query({
  args: {
    claimToken: v.string(),
  },
  handler: async (ctx, args) => {
    const claimTokenHash = await hashSecret(args.claimToken);
    const claim = await ctx.db
      .query('ownerClaims')
      .withIndex('by_claim_token_hash', (q) => q.eq('claimTokenHash', claimTokenHash))
      .first();
    if (!claim) {
      throw networkingError('claim_not_found', 'The claim token does not exist.');
    }

    const agent = await ctx.db.get(claim.agentId);
    if (!agent) {
      throw networkingError('agent_not_found', 'The claimed agent does not exist.');
    }

    return {
      agentId: claim.agentId,
      agentSlug: agent.slug,
      agentDisplayName: agent.displayName,
      agentStatus: agent.status,
      claimStatus: claim.status,
      verifiedAt: claim.verifiedAt,
      xHandle: claim.xHandle,
      xProfileUrl: claim.xProfileUrl,
      verificationMethod: claim.verificationMethod,
    };
  },
});

export const claimAgentForTesting = mutation({
  args: {
    claimToken: v.string(),
    verificationCode: v.string(),
    xHandle: v.string(),
    xProfileUrl: v.string(),
    verificationMethod: v.optional(v.union(v.literal('tweet'), v.literal('oauth'))),
  },
  handler: async (ctx, args) => {
    const claimTokenHash = await hashSecret(args.claimToken);
    const claim = await ctx.db
      .query('ownerClaims')
      .withIndex('by_claim_token_hash', (q) => q.eq('claimTokenHash', claimTokenHash))
      .first();
    if (!claim) {
      throw networkingError('claim_not_found', 'The claim token does not exist.');
    }
    if (claim.status !== 'pending') {
      throw networkingError('invalid_claim_status', 'The claim is no longer pending.');
    }

    const verificationCodeHash = await hashSecret(args.verificationCode);
    if (!arrayBuffersEqual(verificationCodeHash, claim.verificationCodeHash)) {
      throw networkingError('invalid_verification_code', 'The verification code is invalid.');
    }

    const agent = await ctx.db.get(claim.agentId);
    if (!agent) {
      throw networkingError('agent_not_found', 'The claimed agent does not exist.');
    }

    const now = Date.now();
    await ctx.db.patch(claim._id, {
      status: 'verified',
      xHandle: normalizeXHandle(args.xHandle),
      xProfileUrl: args.xProfileUrl,
      verificationMethod: args.verificationMethod ?? 'tweet',
      verifiedAt: now,
    });
    await ctx.db.patch(agent._id, {
      status: 'active',
      ownerClaimId: claim._id,
      claimedAt: now,
      updatedAt: now,
    });

    return {
      agentId: agent._id,
      agentSlug: agent.slug,
      status: 'active' as const,
      ownerClaimId: claim._id,
    };
  },
});

function normalizeSlug(slug: string) {
  return slug
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function normalizeXHandle(handle: string) {
  return handle.trim().replace(/^@/, '');
}

function arrayBuffersEqual(left: ArrayBuffer, right: ArrayBuffer) {
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
