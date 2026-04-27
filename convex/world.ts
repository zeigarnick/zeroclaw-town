import { ConvexError, v } from 'convex/values';
import { MutationCtx, QueryCtx, internalMutation, mutation, query } from './_generated/server';
import { characters } from '../data/characters';
import { insertInput } from './aiTown/insertInput';
import { ENGINE_ACTION_DURATION, IDLE_WORLD_TIMEOUT, WORLD_HEARTBEAT_INTERVAL } from './constants';
import { playerId } from './aiTown/ids';
import { kickEngine, startEngine, stopEngine } from './aiTown/main';
import { engineInsertInput } from './engine/abstractGame';
import { hashSecret } from './networking/auth';
import { Doc, Id } from './_generated/dataModel';

const HUMAN_INPUT_NAMES = new Set([
  'moveTo',
  'startConversation',
  'startTyping',
  'acceptInvite',
  'rejectInvite',
  'leaveConversation',
]);

export const defaultWorldStatus = query({
  handler: async (ctx) => {
    const worldStatus = await ctx.db
      .query('worldStatus')
      .filter((q) => q.eq(q.field('isDefault'), true))
      .first();
    return worldStatus;
  },
});

export const heartbeatWorld = mutation({
  args: {
    worldId: v.id('worlds'),
  },
  handler: async (ctx, args) => {
    const worldStatus = await ctx.db
      .query('worldStatus')
      .withIndex('worldId', (q) => q.eq('worldId', args.worldId))
      .first();
    if (!worldStatus) {
      throw new Error(`Invalid world ID: ${args.worldId}`);
    }
    const now = Date.now();

    // Skip the update (and then potentially make the transaction readonly)
    // if it's been viewed sufficiently recently..
    if (!worldStatus.lastViewed || worldStatus.lastViewed < now - WORLD_HEARTBEAT_INTERVAL / 2) {
      await ctx.db.patch(worldStatus._id, {
        lastViewed: Math.max(worldStatus.lastViewed ?? now, now),
      });
    }

    // Restart inactive worlds, but leave worlds explicitly stopped by the developer alone.
    if (worldStatus.status === 'stoppedByDeveloper') {
      console.debug(`World ${worldStatus._id} is stopped by developer, not restarting.`);
    }
    if (worldStatus.status === 'inactive') {
      console.log(`Restarting inactive world ${worldStatus._id}...`);
      await ctx.db.patch(worldStatus._id, { status: 'running' });
      await startEngine(ctx, worldStatus.worldId);
    }
  },
});

export const stopInactiveWorlds = internalMutation({
  handler: async (ctx) => {
    const cutoff = Date.now() - IDLE_WORLD_TIMEOUT;
    const worlds = await ctx.db.query('worldStatus').collect();
    for (const worldStatus of worlds) {
      if (cutoff < worldStatus.lastViewed || worldStatus.status !== 'running') {
        continue;
      }
      console.log(`Stopping inactive world ${worldStatus._id}`);
      await ctx.db.patch(worldStatus._id, { status: 'inactive' });
      await stopEngine(ctx, worldStatus.worldId);
    }
  },
});

export const restartDeadWorlds = internalMutation({
  handler: async (ctx) => {
    const now = Date.now();

    // Restart an engine if it hasn't run for 2x its action duration.
    const engineTimeout = now - ENGINE_ACTION_DURATION * 2;
    const worlds = await ctx.db.query('worldStatus').collect();
    for (const worldStatus of worlds) {
      if (worldStatus.status !== 'running') {
        continue;
      }
      const engine = await ctx.db.get(worldStatus.engineId);
      if (!engine) {
        throw new Error(`Invalid engine ID: ${worldStatus.engineId}`);
      }
      if (engine.currentTime && engine.currentTime < engineTimeout) {
        console.warn(`Restarting dead engine ${engine._id}...`);
        await kickEngine(ctx, worldStatus.worldId);
      }
    }
  },
});

export const userStatus = query({
  args: {
    worldId: v.id('worlds'),
    sessionToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (!args.sessionToken) {
      return null;
    }
    const session = await getPlayerSessionByToken(ctx, args.sessionToken);
    if (!session || session.worldId !== args.worldId) {
      return null;
    }
    const world = await ctx.db.get(args.worldId);
    const player = world?.players.find((row) => row.human === session.sessionId);
    return player ? session.sessionId : null;
  },
});

export const joinWorld = mutation({
  args: {
    worldId: v.id('worlds'),
  },
  handler: async (ctx, args) => {
    // const identity = await ctx.auth.getUserIdentity();
    // if (!identity) {
    //   throw new ConvexError(`Not logged in`);
    // }
    // const name =
    //   identity.givenName || identity.nickname || (identity.email && identity.email.split('@')[0]);
    const name = 'You';

    // if (!name) {
    //   throw new ConvexError(`Missing name on ${JSON.stringify(identity)}`);
    // }
    const world = await ctx.db.get(args.worldId);
    if (!world) {
      throw new ConvexError(`Invalid world ID: ${args.worldId}`);
    }
    const sessionId = `player_${randomBase64Url(16)}`;
    const sessionToken = `player_session_${randomBase64Url(32)}`;
    const now = Date.now();
    await ctx.db.insert('playerSessions', {
      worldId: world._id,
      sessionId,
      tokenHash: await hashSecret(sessionToken),
      createdAt: now,
    });
    const inputId = await insertInput(ctx, world._id, 'join', {
      name,
      character: characters[Math.floor(Math.random() * characters.length)].name,
      description: `${name} are a human player.`,
      // description: `${identity.givenName} is a human player`,
      tokenIdentifier: sessionId,
    });
    return { inputId, sessionToken };
  },
});

export const leaveWorld = mutation({
  args: {
    worldId: v.id('worlds'),
    playerId,
    sessionToken: v.string(),
  },
  handler: async (ctx, args) => {
    // const identity = await ctx.auth.getUserIdentity();
    // if (!identity) {
    //   throw new Error(`Not logged in`);
    // }
    // const { tokenIdentifier } = identity;
    const world = await ctx.db.get(args.worldId);
    if (!world) {
      throw new Error(`Invalid world ID: ${args.worldId}`);
    }
    const session = await assertPlayerSession(ctx, {
      worldId: world._id,
      playerId: args.playerId,
      sessionToken: args.sessionToken,
    });
    const inputId = await insertInput(ctx, world._id, 'leave', {
      playerId: args.playerId,
    });
    await ctx.db.patch(session._id, { revokedAt: Date.now() });
    return inputId;
  },
});

export const sendWorldInput = mutation({
  args: {
    worldId: v.id('worlds'),
    engineId: v.id('engines'),
    sessionToken: v.string(),
    name: v.string(),
    args: v.any(),
  },
  handler: async (ctx, args) => {
    // const identity = await ctx.auth.getUserIdentity();
    // if (!identity) {
    //   throw new Error(`Not logged in`);
    // }
    if (!HUMAN_INPUT_NAMES.has(args.name)) {
      throw new ConvexError({
        code: 'invalid_world_input',
        message: 'Unsupported player input.',
      });
    }
    if (!isObjectWithPlayerId(args.args)) {
      throw new ConvexError({
        code: 'invalid_world_input',
        message: 'Player input must include a playerId.',
      });
    }
    await assertPlayerSession(ctx, {
      worldId: args.worldId,
      playerId: args.args.playerId,
      sessionToken: args.sessionToken,
    });
    if (inputRequiresConversationMembership(args.name)) {
      if (!isObjectWithConversationId(args.args)) {
        throw new ConvexError({
          code: 'invalid_world_input',
          message: 'Conversation input must include a conversationId.',
        });
      }
      await assertCurrentConversationParticipant(ctx, {
        worldId: args.worldId,
        playerId: args.args.playerId,
        conversationId: args.args.conversationId,
      });
    }
    const worldStatus = await ctx.db
      .query('worldStatus')
      .withIndex('worldId', (q) => q.eq('worldId', args.worldId))
      .unique();
    if (!worldStatus || worldStatus.engineId !== args.engineId) {
      throw new ConvexError({
        code: 'invalid_world_input',
        message: 'Engine does not belong to this world.',
      });
    }
    return await engineInsertInput(ctx, args.engineId, args.name as any, args.args);
  },
});

export async function assertPlayerSession(
  ctx: MutationCtx,
  args: {
    worldId: Id<'worlds'>;
    playerId: string;
    sessionToken: string;
  },
): Promise<Doc<'playerSessions'>> {
  const session = await getPlayerSessionByToken(ctx, args.sessionToken);
  if (!session || session.worldId !== args.worldId) {
    throw new ConvexError({
      code: 'invalid_player_session',
      message: 'Player session is invalid.',
    });
  }
  const world = await ctx.db.get(args.worldId);
  const player = world?.players.find((row) => row.id === args.playerId);
  if (!player || player.human !== session.sessionId) {
    throw new ConvexError({
      code: 'invalid_player_session',
      message: 'Player session does not own this player.',
    });
  }
  await ctx.db.patch(session._id, { lastUsedAt: Date.now() });
  return session;
}

export async function assertCurrentConversationParticipant(
  ctx: QueryCtx | MutationCtx,
  args: {
    worldId: Id<'worlds'>;
    playerId: string;
    conversationId: string;
  },
) {
  const world = await ctx.db.get(args.worldId);
  const conversation = world?.conversations.find((row) => row.id === args.conversationId);
  if (!conversation) {
    throw new ConvexError({
      code: 'invalid_world_input',
      message: 'Conversation does not exist in this world.',
    });
  }
  const isParticipant = conversation.participants.some((row) => row.playerId === args.playerId);
  if (!isParticipant) {
    throw new ConvexError({
      code: 'invalid_world_input',
      message: 'Player is not in this conversation.',
    });
  }
}

async function getPlayerSessionByToken(ctx: QueryCtx | MutationCtx, sessionToken: string) {
  const tokenHash = await hashSecret(sessionToken);
  const session = await ctx.db
    .query('playerSessions')
    .withIndex('by_token_hash', (q) => q.eq('tokenHash', tokenHash))
    .first();
  if (!session || session.revokedAt) {
    return null;
  }
  return session;
}

function isObjectWithPlayerId(value: unknown): value is { playerId: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    typeof (value as { playerId?: unknown }).playerId === 'string'
  );
}

function isObjectWithConversationId(value: unknown): value is { conversationId: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    typeof (value as { conversationId?: unknown }).conversationId === 'string'
  );
}

function inputRequiresConversationMembership(name: string) {
  return (
    name === 'startTyping' ||
    name === 'acceptInvite' ||
    name === 'rejectInvite' ||
    name === 'leaveConversation'
  );
}

function randomBase64Url(byteLength: number) {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  let out = '';

  for (let i = 0; i < bytes.length; i += 3) {
    const first = bytes[i];
    const second = bytes[i + 1];
    const third = bytes[i + 2];
    const hasSecond = i + 1 < bytes.length;
    const hasThird = i + 2 < bytes.length;
    const bits = (first << 16) | ((second ?? 0) << 8) | (third ?? 0);

    out += alphabet[(bits >> 18) & 63];
    out += alphabet[(bits >> 12) & 63];
    if (hasSecond) {
      out += alphabet[(bits >> 6) & 63];
    }
    if (hasThird) {
      out += alphabet[bits & 63];
    }
  }

  return out;
}

export const worldState = query({
  args: {
    worldId: v.id('worlds'),
  },
  handler: async (ctx, args) => {
    const world = await ctx.db.get(args.worldId);
    if (!world) {
      throw new Error(`Invalid world ID: ${args.worldId}`);
    }
    const worldStatus = await ctx.db
      .query('worldStatus')
      .withIndex('worldId', (q) => q.eq('worldId', world._id))
      .unique();
    if (!worldStatus) {
      throw new Error(`Invalid world status ID: ${world._id}`);
    }
    const engine = await ctx.db.get(worldStatus.engineId);
    if (!engine) {
      throw new Error(`Invalid engine ID: ${worldStatus.engineId}`);
    }
    return { world, engine };
  },
});

export const gameDescriptions = query({
  args: {
    worldId: v.id('worlds'),
  },
  handler: async (ctx, args) => {
    const playerDescriptions = await ctx.db
      .query('playerDescriptions')
      .withIndex('worldId', (q) => q.eq('worldId', args.worldId))
      .collect();
    const agentDescriptions = await ctx.db
      .query('agentDescriptions')
      .withIndex('worldId', (q) => q.eq('worldId', args.worldId))
      .collect();
    const worldMap = await ctx.db
      .query('maps')
      .withIndex('worldId', (q) => q.eq('worldId', args.worldId))
      .first();
    if (!worldMap) {
      throw new Error(`No map for world: ${args.worldId}`);
    }
    return { worldMap, playerDescriptions, agentDescriptions };
  },
});

export const previousConversation = query({
  args: {
    worldId: v.id('worlds'),
    playerId,
  },
  handler: async (ctx, args) => {
    // Walk the player's history in descending order, looking for a nonempty
    // conversation.
    const members = ctx.db
      .query('participatedTogether')
      .withIndex('playerHistory', (q) => q.eq('worldId', args.worldId).eq('player1', args.playerId))
      .order('desc');

    for await (const member of members) {
      const conversation = await ctx.db
        .query('archivedConversations')
        .withIndex('worldId', (q) => q.eq('worldId', args.worldId).eq('id', member.conversationId))
        .unique();
      if (!conversation) {
        throw new Error(`Invalid conversation ID: ${member.conversationId}`);
      }
      if (conversation.numMessages > 0) {
        return conversation;
      }
    }
    return null;
  },
});
