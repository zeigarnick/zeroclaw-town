import { v } from 'convex/values';
import { agentId, conversationId, parseGameId, playerId } from './ids';
import { Player, activity } from './player';
import { Conversation, conversationInputs } from './conversation';
import { blocked, movePlayer } from './movement';
import { inputHandler } from './inputHandler';
import { Point, point } from '../util/types';
import { Descriptions } from '../../data/characters';
import { AgentDescription } from './agentDescription';
import { Agent } from './agent';
import { Id } from '../_generated/dataModel';
import type { Game } from './game';
import { PATHFINDING_TIMEOUT } from '../constants';
import { findRoute } from './movement';

export const agentInputs = {
  finishRememberConversation: inputHandler({
    args: {
      operationId: v.string(),
      agentId,
    },
    handler: (game, now, args) => {
      const agentId = parseGameId('agents', args.agentId);
      const agent = game.world.agents.get(agentId);
      if (!agent) {
        throw new Error(`Couldn't find agent: ${agentId}`);
      }
      if (
        !agent.inProgressOperation ||
        agent.inProgressOperation.operationId !== args.operationId
      ) {
        console.debug(`Agent ${agentId} isn't remembering ${args.operationId}`);
      } else {
        delete agent.inProgressOperation;
        delete agent.toRemember;
      }
      return null;
    },
  }),
  finishDoSomething: inputHandler({
    args: {
      operationId: v.string(),
      agentId: v.id('agents'),
      destination: v.optional(point),
      invitee: v.optional(v.id('players')),
      activity: v.optional(activity),
    },
    handler: (game, now, args) => {
      const agentId = parseGameId('agents', args.agentId);
      const agent = game.world.agents.get(agentId);
      if (!agent) {
        throw new Error(`Couldn't find agent: ${agentId}`);
      }
      if (
        !agent.inProgressOperation ||
        agent.inProgressOperation.operationId !== args.operationId
      ) {
        console.debug(`Agent ${agentId} didn't have ${args.operationId} in progress`);
        return null;
      }
      delete agent.inProgressOperation;
      const player = game.world.players.get(agent.playerId)!;
      if (args.invitee) {
        const inviteeId = parseGameId('players', args.invitee);
        const invitee = game.world.players.get(inviteeId);
        if (!invitee) {
          throw new Error(`Couldn't find player: ${inviteeId}`);
        }
        Conversation.start(game, now, player, invitee);
        agent.lastInviteAttempt = now;
      }
      if (args.destination) {
        if (!agent.eventAgentId || canReachExactDestination(game, now, player, args.destination)) {
          movePlayer(game, now, player, args.destination);
        }
      }
      if (args.activity) {
        player.activity = args.activity;
      }
      return null;
    },
  }),
  agentFinishSendingMessage: inputHandler({
    args: {
      agentId,
      conversationId,
      timestamp: v.number(),
      operationId: v.string(),
      leaveConversation: v.boolean(),
    },
    handler: (game, now, args) => {
      const agentId = parseGameId('agents', args.agentId);
      const agent = game.world.agents.get(agentId);
      if (!agent) {
        throw new Error(`Couldn't find agent: ${agentId}`);
      }
      const player = game.world.players.get(agent.playerId);
      if (!player) {
        throw new Error(`Couldn't find player: ${agent.playerId}`);
      }
      const conversationId = parseGameId('conversations', args.conversationId);
      const conversation = game.world.conversations.get(conversationId);
      if (!conversation) {
        throw new Error(`Couldn't find conversation: ${conversationId}`);
      }
      if (
        !agent.inProgressOperation ||
        agent.inProgressOperation.operationId !== args.operationId
      ) {
        console.debug(`Agent ${agentId} wasn't sending a message ${args.operationId}`);
        return null;
      }
      delete agent.inProgressOperation;
      conversationInputs.finishSendingMessage.handler(game, now, {
        playerId: agent.playerId,
        conversationId: args.conversationId,
        timestamp: args.timestamp,
      });
      if (args.leaveConversation) {
        conversation.leave(game, now, player);
      }
      return null;
    },
  }),
  createAgent: inputHandler({
    args: {
      descriptionIndex: v.number(),
    },
    handler: (game, now, args) => {
      const description = Descriptions[args.descriptionIndex];
      const playerId = Player.join(
        game,
        now,
        description.name,
        description.character,
        description.identity,
      );
      const agentId = game.allocId('agents');
      game.world.agents.set(
        agentId,
        new Agent({
          id: agentId,
          playerId: playerId,
          inProgressOperation: undefined,
          lastConversation: undefined,
          lastInviteAttempt: undefined,
          toRemember: undefined,
        }),
      );
      game.agentDescriptions.set(
        agentId,
        new AgentDescription({
          agentId: agentId,
          identity: description.identity,
          plan: description.plan,
        }),
      );
      return { agentId };
    },
  }),
  createNetworkingAgent: inputHandler({
    args: {
      networkAgentId: v.id('networkAgents'),
      displayName: v.string(),
      description: v.optional(v.string()),
      character: v.string(),
    },
    handler: (game, now, args) => {
      const existingDescription = [...game.playerDescriptions.values()].find(
        (description) => description.name === args.displayName,
      );
      if (existingDescription) {
        game.linkNetworkingAvatar(
          args.networkAgentId as Id<'networkAgents'>,
          existingDescription.playerId,
        );
        return { playerId: existingDescription.playerId };
      }

      const identity = args.description ?? `${args.displayName} is a networking agent.`;
      const playerId = Player.join(game, now, args.displayName, args.character, identity);
      const agentId = game.allocId('agents');
      game.world.agents.set(
        agentId,
        new Agent({
          id: agentId,
          playerId,
          inProgressOperation: undefined,
          lastConversation: undefined,
          lastInviteAttempt: undefined,
          toRemember: undefined,
        }),
      );
      game.agentDescriptions.set(
        agentId,
        new AgentDescription({
          agentId,
          identity,
          plan: 'Wander the town and represent active networking conversations.',
        }),
      );
      game.linkNetworkingAvatar(args.networkAgentId as Id<'networkAgents'>, playerId);
      return { agentId, playerId };
    },
  }),
  createEventAgentAvatar: inputHandler({
    args: {
      eventAgentId: v.id('eventAgents'),
      displayName: v.string(),
      description: v.string(),
      character: v.string(),
    },
    handler: (game, now, args) => {
      const existingAgent = [...game.world.agents.values()].find(
        (agent) => agent.eventAgentId === args.eventAgentId,
      );
      if (existingAgent) {
        game.linkEventAvatar(args.eventAgentId as Id<'eventAgents'>, existingAgent.playerId);
        return { playerId: existingAgent.playerId };
      }

      const playerId = Player.join(
        game,
        now,
        args.displayName,
        args.character,
        args.description,
      );
      const agentId = game.allocId('agents');
      game.world.agents.set(
        agentId,
        new Agent({
          id: agentId,
          playerId,
          eventAgentId: args.eventAgentId as Id<'eventAgents'>,
          inProgressOperation: undefined,
          lastConversation: undefined,
          lastInviteAttempt: undefined,
          toRemember: undefined,
        }),
      );
      game.agentDescriptions.set(
        agentId,
        new AgentDescription({
          agentId,
          identity: args.description,
          plan: 'Wander the event space and move toward approved matches.',
        }),
      );
      game.linkEventAvatar(args.eventAgentId as Id<'eventAgents'>, playerId);
      return { agentId, playerId };
    },
  }),
  moveEventMatchPair: inputHandler({
    args: {
      requesterPlayerId: playerId,
      targetPlayerId: playerId,
    },
    handler: (game, now, args) => {
      const requester = game.world.players.get(parseGameId('players', args.requesterPlayerId));
      const target = game.world.players.get(parseGameId('players', args.targetPlayerId));
      if (!requester || !target) {
        return null;
      }
      const { requesterDestination, targetDestination } = matchMeetingDestinations(
        game,
        now,
        requester,
        target,
      );
      if (requesterDestination) {
        movePlayer(game, now, requester, requesterDestination, true);
      }
      if (targetDestination) {
        movePlayer(game, now, target, targetDestination, true);
      }
      const holdUntil = now + 10000;
      requester.activity = {
        description: 'Matched',
        emoji: 'Match',
        until: holdUntil,
      };
      target.activity = {
        description: 'Matched',
        emoji: 'Match',
        until: holdUntil,
      };
      return null;
    },
  }),
  removeEventAgentAvatar: inputHandler({
    args: {
      eventAgentId: v.id('eventAgents'),
      playerId: playerId,
    },
    handler: (game, now, args) => {
      const agent = [...game.world.agents.values()].find(
        (candidate) => candidate.eventAgentId === args.eventAgentId,
      );
      if (!agent || agent.playerId !== args.playerId) {
        return null;
      }
      const player = game.world.players.get(agent.playerId);
      if (player) {
        player.leave(game, now);
      }
      game.world.agents.delete(agent.id);
      game.agentDescriptions.delete(agent.id);
      game.playerDescriptions.delete(agent.playerId);
      game.descriptionsModified = true;
      return null;
    },
  }),
};

function matchMeetingDestinations(
  game: Game,
  now: number,
  requester: Player,
  target: Player,
) {
  const requesterCandidates = openNeighborCandidates(game, now, target, requester);
  const targetCandidates = openNeighborCandidates(game, now, requester, target);
  let bestPair:
    | {
        requesterDestination: Point;
        targetDestination: Point;
        score: number;
      }
    | undefined;
  for (const requesterDestination of requesterCandidates) {
    for (const targetDestination of targetCandidates) {
      if (sameTile(requesterDestination, targetDestination)) {
        continue;
      }
      const score =
        tileDistance(requesterDestination, requester.position) +
        tileDistance(targetDestination, target.position);
      if (!bestPair || score < bestPair.score) {
        bestPair = { requesterDestination, targetDestination, score };
      }
    }
  }
  if (bestPair) {
    return {
      requesterDestination: bestPair.requesterDestination,
      targetDestination: bestPair.targetDestination,
    };
  }
  return {
    requesterDestination: requesterCandidates[0],
    targetDestination: undefined,
  };
}

function openNeighborCandidates(
  game: Game,
  now: number,
  anchor: Player,
  mover: Player,
) {
  const base = {
    x: Math.floor(anchor.position.x),
    y: Math.floor(anchor.position.y),
  };
  const candidates = [
    { x: base.x + 1, y: base.y },
    { x: base.x - 1, y: base.y },
    { x: base.x, y: base.y + 1 },
    { x: base.x, y: base.y - 1 },
  ];
  candidates.sort(
    (left, right) =>
      tileDistance(left, mover.position) - tileDistance(right, mover.position),
  );
  return candidates.filter(
    (candidate) =>
      !sameTile(candidate, mover.position) &&
      blocked(game, now, candidate, mover.id) === null &&
      canReachExactDestination(game, now, mover, candidate),
  );
}

function tileDistance(left: { x: number; y: number }, right: { x: number; y: number }) {
  return Math.hypot(left.x - right.x, left.y - right.y);
}

function canReachExactDestination(game: Game, now: number, player: Player, destination: Point) {
  const route = findRoute(game, now, player, destination);
  if (!route || route.newDestination) {
    return false;
  }
  const finalPoint = route.path[route.path.length - 1];
  return finalPoint !== undefined && finalPoint[4] - now < PATHFINDING_TIMEOUT - 1000;
}

function sameTile(left: Point, right: Point) {
  return Math.floor(left.x) === Math.floor(right.x) && Math.floor(left.y) === Math.floor(right.y);
}
