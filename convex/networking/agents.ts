import { v } from 'convex/values';
import { MutationCtx, QueryCtx, internalMutation, mutation, query } from '../_generated/server';
import { Doc } from '../_generated/dataModel';
import { insertInput } from '../aiTown/insertInput';
import {
  formatClaimUrl,
  generateApiKey,
  generateClaimToken,
  generateVerificationCode,
  getKeyPrefix,
  hashSecret,
  networkingError,
} from './auth';

const DEFAULT_CLAIM_BASE_URL = 'https://zeroclaw-town.vercel.app/claim';
const DEFAULT_OWNER_VERIFICATION_METHOD = 'tweet' as const;

export const registerAgent = mutation({
  args: {
    slug: v.string(),
    displayName: v.string(),
    description: v.optional(v.string()),
  },
  handler: registerAgentHandler,
});

export const autoClaimAgentBySlug = internalMutation({
  args: {
    slug: v.string(),
    xHandle: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const slug = normalizeSlug(args.slug);
    const agent = await ctx.db
      .query('networkAgents')
      .withIndex('by_slug', (q) => q.eq('slug', slug))
      .first();
    if (!agent) {
      throw networkingError('agent_not_found', 'The agent does not exist.');
    }
    return await activateAgent(ctx, agent, Date.now(), {
      xHandle: args.xHandle ?? agent.slug,
      xProfileUrl: defaultProfileUrlForHandle(args.xHandle ?? agent.slug),
      verificationMethod: 'oauth',
    });
  },
});

export async function registerAgentHandler(
  ctx: MutationCtx,
  args: {
    slug: string;
    displayName: string;
    description?: string;
  },
) {
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
    status: 'active',
    createdAt: now,
    updatedAt: now,
    claimedAt: now,
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
    status: 'verified',
    xHandle: slug,
    xProfileUrl: defaultProfileUrlForHandle(slug),
    verificationMethod: 'oauth',
    createdAt: now,
    verifiedAt: now,
  });

  await ctx.db.patch(agentId, { ownerClaimId, updatedAt: now });
  const agent = await ctx.db.get(agentId);
  if (agent) {
    await ensureNetworkingTownAvatar(ctx, agent, now);
  }

  return {
    agentId,
    agentSlug: slug,
    apiKey,
    claimUrl: formatClaimUrl(getClaimBaseUrl(), claimToken),
    verificationCode,
    status: 'active' as const,
  };
}

function getClaimBaseUrl() {
  return process.env.NETWORKING_CLAIM_BASE_URL ?? DEFAULT_CLAIM_BASE_URL;
}

export const getClaimStatus = query({
  args: {
    claimToken: v.string(),
  },
  handler: getClaimStatusHandler,
});

export async function getClaimStatusHandler(ctx: QueryCtx, args: { claimToken: string }) {
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
}

export const claimAgentForTesting = internalMutation({
  args: {
    claimToken: v.string(),
    verificationCode: v.string(),
    xHandle: v.string(),
    xProfileUrl: v.string(),
    verificationMethod: v.optional(v.union(v.literal('tweet'), v.literal('oauth'))),
  },
  handler: claimAgentForTestingHandler,
});

export const mockClaimAgent = mutation({
  args: {
    claimToken: v.string(),
    verificationCode: v.string(),
    xHandle: v.string(),
    owner: v.optional(
      v.object({
        displayName: v.optional(v.string()),
        xProfileUrl: v.optional(v.string()),
        verificationMethod: v.optional(v.union(v.literal('tweet'), v.literal('oauth'))),
        websiteUrl: v.optional(v.string()),
      }),
    ),
  },
  handler: mockClaimAgentHandler,
});

export async function claimAgentForTestingHandler(
  ctx: MutationCtx,
  args: {
    claimToken: string;
    verificationCode: string;
    xHandle: string;
    xProfileUrl: string;
    verificationMethod?: 'tweet' | 'oauth';
  },
) {
  return await claimAgentHandler(ctx, args);
}

export async function mockClaimAgentHandler(
  ctx: MutationCtx,
  args: {
    claimToken: string;
    verificationCode: string;
    xHandle: string;
    owner?: {
      displayName?: string;
      xProfileUrl?: string;
      verificationMethod?: 'tweet' | 'oauth';
      websiteUrl?: string;
    };
  },
) {
  return await claimAgentHandler(ctx, {
    claimToken: args.claimToken,
    verificationCode: args.verificationCode,
    xHandle: args.xHandle,
    xProfileUrl: args.owner?.xProfileUrl ?? defaultProfileUrlForHandle(args.xHandle),
    verificationMethod: args.owner?.verificationMethod ?? DEFAULT_OWNER_VERIFICATION_METHOD,
  });
}

async function claimAgentHandler(
  ctx: MutationCtx,
  args: {
    claimToken: string;
    verificationCode: string;
    xHandle: string;
    xProfileUrl: string;
    verificationMethod?: 'tweet' | 'oauth';
  },
) {
  const claimTokenHash = await hashSecret(args.claimToken);
  const claim = await ctx.db
    .query('ownerClaims')
    .withIndex('by_claim_token_hash', (q) => q.eq('claimTokenHash', claimTokenHash))
    .first();
  if (!claim) {
    throw networkingError('claim_not_found', 'The claim token does not exist.');
  }
  const verificationCodeHash = await hashSecret(args.verificationCode);
  if (!arrayBuffersEqual(verificationCodeHash, claim.verificationCodeHash)) {
    throw networkingError('invalid_verification_code', 'The verification code is invalid.');
  }
  if (claim.status !== 'pending' && claim.status !== 'verified') {
    throw networkingError('invalid_claim_status', 'The claim cannot be activated.');
  }

  const agent = await ctx.db.get(claim.agentId);
  if (!agent) {
    throw networkingError('agent_not_found', 'The claimed agent does not exist.');
  }

  return await activateAgent(ctx, agent, Date.now(), {
    xHandle: normalizeXHandle(args.xHandle),
    xProfileUrl: args.xProfileUrl,
    verificationMethod: args.verificationMethod ?? DEFAULT_OWNER_VERIFICATION_METHOD,
  });
}

async function activateAgent(
  ctx: MutationCtx,
  agent: Doc<'networkAgents'>,
  now: number,
  owner: {
    xHandle: string;
    xProfileUrl: string;
    verificationMethod: 'tweet' | 'oauth';
  },
) {
  let ownerClaimId = agent.ownerClaimId;
  if (ownerClaimId) {
    await ctx.db.patch(ownerClaimId, {
      status: 'verified',
      xHandle: owner.xHandle,
      xProfileUrl: owner.xProfileUrl,
      verificationMethod: owner.verificationMethod,
      verifiedAt: now,
    });
  } else {
    ownerClaimId = await ctx.db.insert('ownerClaims', {
      agentId: agent._id,
      claimTokenHash: await hashSecret(generateClaimToken()),
      verificationCodeHash: await hashSecret(generateVerificationCode()),
      status: 'verified',
      xHandle: owner.xHandle,
      xProfileUrl: owner.xProfileUrl,
      verificationMethod: owner.verificationMethod,
      createdAt: now,
      verifiedAt: now,
    });
  }

  await ctx.db.patch(agent._id, {
    status: 'active',
    ownerClaimId,
    claimedAt: now,
    updatedAt: now,
  });
  await ensureNetworkingTownAvatar(ctx, { ...agent, status: 'active', updatedAt: now }, now);

  return {
    agentId: agent._id,
    agentSlug: agent.slug,
    status: 'active' as const,
    ownerClaimId,
  };
}

export async function ensureNetworkingTownAvatar(
  ctx: MutationCtx,
  agent: Doc<'networkAgents'>,
  now = Date.now(),
) {
  if (agent.townPlayerId || agent.status !== 'active') {
    return null;
  }

  const worldStatus = await ctx.db
    .query('worldStatus')
    .withIndex('isDefault', (q) => q.eq('isDefault', true))
    .first();
  if (!worldStatus) {
    return null;
  }

  const pendingInputs = await ctx.db
    .query('inputs')
    .withIndex('byInputNumber', (q) => q.eq('engineId', worldStatus.engineId))
    .order('desc')
    .take(100);
  const existingInput = pendingInputs.find(
    (input) =>
      input.name === 'createNetworkingAgent' &&
      !input.returnValue &&
      input.args?.networkAgentId === agent._id,
  );
  if (existingInput) {
    return existingInput._id;
  }

  const inputId = await insertInput(ctx, worldStatus.worldId, 'createNetworkingAgent', {
    networkAgentId: agent._id,
    displayName: agent.displayName,
    description: agent.description,
    character: characterForAgent(agent.slug),
  });
  await ctx.db.patch(agent._id, { updatedAt: now });
  return inputId;
}

function characterForAgent(slug: string) {
  const characters = ['f1', 'f2', 'f3', 'f4', 'f5', 'f6', 'f7', 'f8'];
  let hash = 0;
  for (const char of slug) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return characters[hash % characters.length];
}

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

function defaultProfileUrlForHandle(handle: string) {
  return `https://x.com/${normalizeXHandle(handle)}`;
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
