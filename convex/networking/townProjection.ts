import { v } from 'convex/values';
import { Doc, Id } from '../_generated/dataModel';
import { QueryCtx, query } from '../_generated/server';
import { GameId } from '../aiTown/ids';
import {
  EventActivityView,
  getEventMatchActivityCount,
  listRecentEventActivityHandler,
} from './eventActivity';
import type { EventAvatarConfig, EventPublicCard } from './eventCards';

export type NetworkingTownStatus = 'matched' | 'pending_meeting' | 'talking' | 'intro_ready';

export type NetworkingTownCard = {
  id: Id<'matchCards'>;
  type: Doc<'matchCards'>['type'];
  title: string;
  summary: string;
  desiredOutcome: string;
};

export type NetworkingTownRelationship = {
  agentId: Id<'networkAgents'>;
  displayName: string;
};

export type NetworkingTownAgent = {
  source: 'legacy' | 'event';
  agentId: Id<'networkAgents'> | Id<'eventAgents'>;
  eventId?: string;
  slug: string;
  displayName: string;
  description?: string;
  avatarConfig?: EventAvatarConfig;
  publicCard?: EventPublicCard;
  playerId?: GameId<'players'>;
  primaryStatus?: NetworkingTownStatus;
  cards: NetworkingTownCard[];
  matchedAgents: NetworkingTownRelationship[];
  pendingMeetingAgents: NetworkingTownRelationship[];
  talkingAgents: NetworkingTownRelationship[];
  introReadyAgents: NetworkingTownRelationship[];
  counts: Record<NetworkingTownStatus, number>;
  updatedAt: number;
};

export type NetworkingTownProjection = {
  agents: NetworkingTownAgent[];
  agentsByPlayerId: Record<string, NetworkingTownAgent>;
  statusCounts: Record<NetworkingTownStatus, number>;
  eventActivity?: {
    recent: EventActivityView[];
    matchCount: number;
    updatedAt: number;
  };
  updatedAt: number;
};

type AgentAccumulator = {
  agent: Doc<'networkAgents'>;
  playerId?: GameId<'players'>;
  cards: NetworkingTownCard[];
  matchedAgents: Map<Id<'networkAgents'>, NetworkingTownRelationship>;
  pendingMeetingAgents: Map<Id<'networkAgents'>, NetworkingTownRelationship>;
  talkingAgents: Map<Id<'networkAgents'>, NetworkingTownRelationship>;
  introReadyAgents: Map<Id<'networkAgents'>, NetworkingTownRelationship>;
  updatedAt: number;
};

const STATUS_PRIORITY: NetworkingTownStatus[] = [
  'intro_ready',
  'talking',
  'pending_meeting',
  'matched',
];

const DEMO_TOWN_PLAYER_NAME_BY_AGENT_SLUG: Record<string, string> = {
  'demo-capital-scout': 'lucky',
  'demo-growth-operator': 'bob',
};

export const get = query({
  args: {
    worldId: v.id('worlds'),
    eventId: v.optional(v.string()),
  },
  handler: (ctx, args) => getTownProjectionHandler(ctx, args),
});

export async function getTownProjectionHandler(
  ctx: QueryCtx,
  args: { worldId: Id<'worlds'>; eventId?: string },
): Promise<NetworkingTownProjection> {
  if (args.eventId) {
    const projectedAgents = await collectApprovedEventAgents(ctx, args.eventId);
    const eventActivity = await collectEventActivitySummary(ctx, args.eventId);
    const updatedAt = Math.max(
      eventActivity.updatedAt,
      ...projectedAgents.map((agent) => agent.updatedAt),
      0,
    );
    return {
      agents: projectedAgents.sort((left, right) => left.displayName.localeCompare(right.displayName)),
      agentsByPlayerId: {},
      statusCounts: createEmptyStatusCounts(),
      eventActivity,
      updatedAt,
    };
  }

  const agents = await ctx.db
    .query('networkAgents')
    .withIndex('by_status', (q) => q.eq('status', 'active'))
    .collect();
  const playerDescriptions = await ctx.db
    .query('playerDescriptions')
    .withIndex('worldId', (q) => q.eq('worldId', args.worldId))
    .collect();

  const playerIdsByName = new Map(
    playerDescriptions.map((description) => [
      normalizeAgentLookupKey(description.name),
      description.playerId as GameId<'players'>,
    ]),
  );
  const agentsById = new Map(agents.map((agent) => [agent._id, agent]));
  const accumulators = new Map<Id<'networkAgents'>, AgentAccumulator>();
  let updatedAt = 0;

  for (const agent of agents) {
    updatedAt = Math.max(updatedAt, agent.updatedAt);
    accumulators.set(agent._id, {
      agent,
      playerId: resolveTownPlayerId(agent, playerIdsByName),
      cards: [],
      matchedAgents: new Map(),
      pendingMeetingAgents: new Map(),
      talkingAgents: new Map(),
      introReadyAgents: new Map(),
      updatedAt: agent.updatedAt,
    });
  }

  const activeCards = await ctx.db
    .query('matchCards')
    .withIndex('by_status_updated_at', (q) => q.eq('status', 'active'))
    .collect();
  const cardsById = new Map(activeCards.map((card) => [card._id, card]));

  for (const card of activeCards) {
    const accumulator = accumulators.get(card.agentId);
    if (!accumulator) {
      continue;
    }
    accumulator.cards.push({
      id: card._id,
      type: card.type,
      title: card.title,
      summary: card.summary,
      desiredOutcome: card.desiredOutcome,
    });
    accumulator.updatedAt = Math.max(accumulator.updatedAt, card.updatedAt);
    updatedAt = Math.max(updatedAt, card.updatedAt);
  }

  const activeRecommendations = await ctx.db
    .query('recommendations')
    .withIndex('by_status_created_at', (q) => q.eq('status', 'active'))
    .collect();
  for (const recommendation of activeRecommendations) {
    const recipientCard = cardsById.get(recommendation.recipientCardId);
    const providerCard = cardsById.get(recommendation.providerCardId);
    if (!recipientCard || !providerCard) {
      continue;
    }
    addRelationship(
      accumulators,
      agentsById,
      recommendation.recipientAgentId,
      recommendation.providerAgentId,
      'matchedAgents',
    );
    addRelationship(
      accumulators,
      agentsById,
      recommendation.providerAgentId,
      recommendation.recipientAgentId,
      'matchedAgents',
    );
    touchAccumulators(accumulators, recommendation.updatedAt, [
      recommendation.recipientAgentId,
      recommendation.providerAgentId,
    ]);
    updatedAt = Math.max(updatedAt, recommendation.updatedAt);
  }

  for (const status of ['pending', 'accepted'] as const) {
    const meetings = await ctx.db
      .query('meetings')
      .withIndex('by_status_created_at', (q) => q.eq('status', status))
      .collect();
    for (const meeting of meetings) {
      addRelationship(
        accumulators,
        agentsById,
        meeting.requesterAgentId,
        meeting.responderAgentId,
        'pendingMeetingAgents',
      );
      addRelationship(
        accumulators,
        agentsById,
        meeting.responderAgentId,
        meeting.requesterAgentId,
        'pendingMeetingAgents',
      );
      touchAccumulators(accumulators, meeting.updatedAt, [
        meeting.requesterAgentId,
        meeting.responderAgentId,
      ]);
      updatedAt = Math.max(updatedAt, meeting.updatedAt);
    }
  }

  const conversations = await collectOpenConversations(
    ctx,
    agents.map((agent) => agent._id),
  );
  for (const conversation of conversations) {
    addRelationship(
      accumulators,
      agentsById,
      conversation.participantOneAgentId,
      conversation.participantTwoAgentId,
      'talkingAgents',
    );
    addRelationship(
      accumulators,
      agentsById,
      conversation.participantTwoAgentId,
      conversation.participantOneAgentId,
      'talkingAgents',
    );
    touchAccumulators(accumulators, conversation.updatedAt, [
      conversation.participantOneAgentId,
      conversation.participantTwoAgentId,
    ]);
    updatedAt = Math.max(updatedAt, conversation.updatedAt);
  }

  const introCandidates = await collectActiveIntroCandidates(
    ctx,
    agents.map((agent) => agent._id),
  );
  for (const introCandidate of introCandidates) {
    addRelationship(
      accumulators,
      agentsById,
      introCandidate.requesterAgentId,
      introCandidate.responderAgentId,
      'introReadyAgents',
    );
    addRelationship(
      accumulators,
      agentsById,
      introCandidate.responderAgentId,
      introCandidate.requesterAgentId,
      'introReadyAgents',
    );
    touchAccumulators(accumulators, introCandidate.updatedAt, [
      introCandidate.requesterAgentId,
      introCandidate.responderAgentId,
    ]);
    updatedAt = Math.max(updatedAt, introCandidate.updatedAt);
  }

  const statusCounts = createEmptyStatusCounts();
  const projectedAgents: NetworkingTownAgent[] = Array.from(accumulators.values())
    .map((accumulator) => {
      const counts = {
        matched: accumulator.matchedAgents.size,
        pending_meeting: accumulator.pendingMeetingAgents.size,
        talking: accumulator.talkingAgents.size,
        intro_ready: accumulator.introReadyAgents.size,
      };
      const primaryStatus = STATUS_PRIORITY.find((status) => counts[status] > 0);
      if (primaryStatus) {
        statusCounts[primaryStatus] += 1;
      }
      return {
        source: 'legacy' as const,
        agentId: accumulator.agent._id,
        slug: accumulator.agent.slug,
        displayName: accumulator.agent.displayName,
        description: accumulator.agent.description,
        playerId: accumulator.playerId,
        primaryStatus,
        cards: accumulator.cards.sort((left, right) => left.title.localeCompare(right.title)),
        matchedAgents: sortRelationships(accumulator.matchedAgents),
        pendingMeetingAgents: sortRelationships(accumulator.pendingMeetingAgents),
        talkingAgents: sortRelationships(accumulator.talkingAgents),
        introReadyAgents: sortRelationships(accumulator.introReadyAgents),
        counts,
        updatedAt: accumulator.updatedAt,
      };
    })
    .sort((left, right) => left.displayName.localeCompare(right.displayName));

  const agentsByPlayerId: Record<string, NetworkingTownAgent> = {};
  for (const agent of projectedAgents) {
    if (agent.playerId) {
      agentsByPlayerId[agent.playerId] = agent;
    }
  }

  return {
    agents: projectedAgents,
    agentsByPlayerId,
    statusCounts,
    updatedAt,
  };
}

async function collectEventActivitySummary(ctx: QueryCtx, eventId: string) {
  const [recent, matchCount] = await Promise.all([
    listRecentEventActivityHandler(ctx, { eventId, limit: 5 }),
    getEventMatchActivityCount(ctx, eventId),
  ]);
  return {
    recent,
    matchCount,
    updatedAt: recent.reduce((latest, activity) => Math.max(latest, activity.updatedAt), 0),
  };
}

async function collectApprovedEventAgents(
  ctx: QueryCtx,
  eventId: string,
): Promise<NetworkingTownAgent[]> {
  const agents = await ctx.db
    .query('eventAgents')
    .withIndex('by_event_and_status', (q) =>
      q.eq('eventId', eventId).eq('approvalStatus', 'approved'),
    )
    .collect();
  const projectedAgents: NetworkingTownAgent[] = [];
  for (const agent of agents) {
    const approvedCard = await ctx.db
      .query('eventNetworkingCards')
      .withIndex('by_agent_and_status', (q) =>
        q.eq('eventAgentId', agent._id).eq('status', 'approved'),
      )
      .first();
    if (!approvedCard) {
      continue;
    }
    if (!agent.publicMarkerSlug) {
      continue;
    }
    projectedAgents.push({
      source: 'event',
      eventId: agent.eventId,
      agentId: agent._id,
      slug: agent.publicMarkerSlug,
      displayName: agent.displayName,
      description: approvedCard.publicCard.category ?? approvedCard.publicCard.role,
      avatarConfig: agent.avatarConfig,
      publicCard: approvedCard.publicCard,
      cards: [],
      matchedAgents: [],
      pendingMeetingAgents: [],
      talkingAgents: [],
      introReadyAgents: [],
      counts: createEmptyStatusCounts(),
      updatedAt: Math.max(agent.updatedAt, approvedCard.updatedAt),
    });
  }
  return projectedAgents;
}

async function collectOpenConversations(
  ctx: QueryCtx,
  agentIds: Id<'networkAgents'>[],
): Promise<Doc<'agentConversations'>[]> {
  const byId = new Map<Id<'agentConversations'>, Doc<'agentConversations'>>();
  for (const agentId of agentIds) {
    const participantOneRows = await ctx.db
      .query('agentConversations')
      .withIndex('by_participant_one_status_updated_at', (q) =>
        q.eq('participantOneAgentId', agentId).eq('status', 'open'),
      )
      .collect();
    const participantTwoRows = await ctx.db
      .query('agentConversations')
      .withIndex('by_participant_two_status_updated_at', (q) =>
        q.eq('participantTwoAgentId', agentId).eq('status', 'open'),
      )
      .collect();
    for (const row of [...participantOneRows, ...participantTwoRows]) {
      byId.set(row._id, row);
    }
  }
  return Array.from(byId.values());
}

async function collectActiveIntroCandidates(
  ctx: QueryCtx,
  agentIds: Id<'networkAgents'>[],
): Promise<Doc<'introCandidates'>[]> {
  const byId = new Map<Id<'introCandidates'>, Doc<'introCandidates'>>();
  for (const agentId of agentIds) {
    for (const status of ['pending_review', 'deferred'] as const) {
      const requesterRows = await ctx.db
        .query('introCandidates')
        .withIndex('by_requester_status_created_at', (q) =>
          q.eq('requesterAgentId', agentId).eq('status', status),
        )
        .collect();
      const responderRows = await ctx.db
        .query('introCandidates')
        .withIndex('by_responder_status_created_at', (q) =>
          q.eq('responderAgentId', agentId).eq('status', status),
        )
        .collect();
      for (const row of [...requesterRows, ...responderRows]) {
        byId.set(row._id, row);
      }
    }
  }
  return Array.from(byId.values());
}

function resolveTownPlayerId(
  agent: Doc<'networkAgents'>,
  playerIdsByName: Map<string, GameId<'players'>>,
) {
  return (
    (agent.townPlayerId as GameId<'players'> | undefined) ??
    playerIdsByName.get(normalizeAgentLookupKey(agent.displayName)) ??
    playerIdsByName.get(normalizeAgentLookupKey(agent.slug)) ??
    playerIdsByName.get(DEMO_TOWN_PLAYER_NAME_BY_AGENT_SLUG[agent.slug] ?? '')
  );
}

function normalizeAgentLookupKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}


function addRelationship(
  accumulators: Map<Id<'networkAgents'>, AgentAccumulator>,
  agentsById: Map<Id<'networkAgents'>, Doc<'networkAgents'>>,
  agentId: Id<'networkAgents'>,
  relatedAgentId: Id<'networkAgents'>,
  field: 'matchedAgents' | 'pendingMeetingAgents' | 'talkingAgents' | 'introReadyAgents',
) {
  const accumulator = accumulators.get(agentId);
  const relatedAgent = agentsById.get(relatedAgentId);
  if (!accumulator || !relatedAgent) {
    return;
  }
  accumulator[field].set(relatedAgent._id, {
    agentId: relatedAgent._id,
    displayName: relatedAgent.displayName,
  });
}

function touchAccumulators(
  accumulators: Map<Id<'networkAgents'>, AgentAccumulator>,
  timestamp: number,
  agentIds: Id<'networkAgents'>[],
) {
  for (const agentId of agentIds) {
    const accumulator = accumulators.get(agentId);
    if (accumulator) {
      accumulator.updatedAt = Math.max(accumulator.updatedAt, timestamp);
    }
  }
}

function createEmptyStatusCounts(): Record<NetworkingTownStatus, number> {
  return {
    matched: 0,
    pending_meeting: 0,
    talking: 0,
    intro_ready: 0,
  };
}

function sortRelationships(relationships: Map<Id<'networkAgents'>, NetworkingTownRelationship>) {
  return Array.from(relationships.values()).sort((left, right) =>
    left.displayName.localeCompare(right.displayName),
  );
}
