import { Doc, Id } from './_generated/dataModel';
import { MutationCtx } from './_generated/server';

export function townNpcsEnabled(value = process.env.AGORA_ENABLE_TOWN_NPCS) {
  if (!value) {
    return false;
  }
  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
}

export async function pruneDefaultWorldNpcsHandler(ctx: MutationCtx) {
  const worldStatus = await ctx.db
    .query('worldStatus')
    .filter((q) => q.eq(q.field('isDefault'), true))
    .first();
  if (!worldStatus) {
    return { skipped: true, reason: 'default_world_not_found' as const };
  }
  return await pruneWorldNpcs(ctx, worldStatus.worldId);
}

export async function pruneWorldNpcs(ctx: MutationCtx, worldId: Id<'worlds'>) {
  const world = await ctx.db.get(worldId);
  if (!world) {
    throw new Error(`Invalid world ID: ${worldId}`);
  }

  const linkedTownPlayerIds = new Set<string>();
  const networkAgents = await ctx.db.query('networkAgents').collect();
  for (const agent of networkAgents) {
    if (agent.townPlayerId) {
      linkedTownPlayerIds.add(agent.townPlayerId);
    }
  }

  const pruneResult = pruneNpcWorldState(world, linkedTownPlayerIds);
  if (pruneResult.removedAgentIds.length === 0 && pruneResult.removedPlayerIds.length === 0) {
    return {
      skipped: false,
      removedAgents: 0,
      removedPlayers: 0,
      removedConversations: 0,
    };
  }

  const replacementWorld = {
    nextId: pruneResult.world.nextId,
    agents: pruneResult.world.agents,
    players: pruneResult.world.players,
    conversations: pruneResult.world.conversations,
    ...(pruneResult.world.historicalLocations !== undefined
      ? { historicalLocations: pruneResult.world.historicalLocations }
      : {}),
  };
  await ctx.db.replace(world._id, replacementWorld);

  const playerDescriptions = await ctx.db
    .query('playerDescriptions')
    .withIndex('worldId', (q) => q.eq('worldId', world._id))
    .collect();
  for (const description of playerDescriptions) {
    if (pruneResult.removedPlayerIds.includes(description.playerId)) {
      await ctx.db.delete(description._id);
    }
  }

  const agentDescriptions = await ctx.db
    .query('agentDescriptions')
    .withIndex('worldId', (q) => q.eq('worldId', world._id))
    .collect();
  for (const description of agentDescriptions) {
    if (pruneResult.removedAgentIds.includes(description.agentId)) {
      await ctx.db.delete(description._id);
    }
  }

  return {
    skipped: false,
    removedAgents: pruneResult.removedAgentIds.length,
    removedPlayers: pruneResult.removedPlayerIds.length,
    removedConversations: pruneResult.removedConversationIds.length,
  };
}

export function pruneNpcWorldState(
  world: Doc<'worlds'>,
  linkedTownPlayerIds: ReadonlySet<string>,
) {
  const removedAgentIds: string[] = [];
  const removedPlayerIds: string[] = [];
  const removedPlayerIdSet = new Set<string>();

  const agents = world.agents.filter((agent) => {
    if (linkedTownPlayerIds.has(agent.playerId)) {
      return true;
    }
    removedAgentIds.push(agent.id);
    const player = world.players.find((candidate) => candidate.id === agent.playerId);
    if (player && !player.human && !linkedTownPlayerIds.has(player.id)) {
      removedPlayerIds.push(player.id);
      removedPlayerIdSet.add(player.id);
    }
    return false;
  });

  const players = world.players.filter((player) => !removedPlayerIdSet.has(player.id));
  const conversations = world.conversations.filter((conversation) =>
    conversation.participants.every((participant) => !removedPlayerIdSet.has(participant.playerId)),
  );
  const removedConversationIds = world.conversations
    .filter((conversation) =>
      conversation.participants.some((participant) => removedPlayerIdSet.has(participant.playerId)),
    )
    .map((conversation) => conversation.id);

  return {
    world: {
      ...world,
      agents,
      players,
      conversations,
      historicalLocations: world.historicalLocations?.filter(
        (location) => !removedPlayerIdSet.has(location.playerId),
      ),
    },
    removedAgentIds,
    removedPlayerIds,
    removedConversationIds,
  };
}
