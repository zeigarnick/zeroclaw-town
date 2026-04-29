import type { NetworkingTownProjection } from '../../convex/networking/townProjection';
import type { Player } from '../../convex/aiTown/player';

type EventActivitySummary = NonNullable<NetworkingTownProjection['eventActivity']>;
type EventActivityItem = EventActivitySummary['recent'][number];
type EventAgent = NetworkingTownProjection['agents'][number];

export type EventMatchBubble = {
  key: string;
  text: 'Match';
  x: number;
  y: number;
  alpha: number;
};

const MATCH_BUBBLE_DURATION_MS = 5000;

export function hasActiveEventMatchBubbles({
  activity,
  nowMs,
}: {
  activity?: EventActivitySummary;
  nowMs: number;
}) {
  return (activity?.recent ?? []).some((item) => isRecentMatchActivity(item, nowMs));
}

export function buildEventMatchBubbles({
  players,
  agents,
  activity,
  nowMs,
  tileDim,
}: {
  players: Player[];
  agents: EventAgent[];
  activity?: EventActivitySummary;
  nowMs: number;
  tileDim: number;
}): EventMatchBubble[] {
  const playersById = new Map(players.map((player) => [player.id, player]));
  const eventAgentsBySlug = new Map(
    agents
      .filter((agent) => agent.source === 'event' && agent.playerId)
      .map((agent) => [agent.slug, agent]),
  );
  const bubbles: EventMatchBubble[] = [];

  for (const item of activity?.recent ?? []) {
    if (!isRecentMatchActivity(item, nowMs) || !item.requesterMarkerSlug || !item.targetMarkerSlug) {
      continue;
    }
    const requester = eventAgentsBySlug.get(item.requesterMarkerSlug);
    const target = eventAgentsBySlug.get(item.targetMarkerSlug);
    const requesterPlayer = requester?.playerId ? playersById.get(requester.playerId) : undefined;
    const targetPlayer = target?.playerId ? playersById.get(target.playerId) : undefined;
    if (!requesterPlayer || !targetPlayer) {
      continue;
    }
    const progress = clamp((nowMs - item.createdAt) / MATCH_BUBBLE_DURATION_MS);
    const fadeProgress = clamp((progress - 0.72) / 0.28);
    bubbles.push({
      key: `${item.createdAt}:${item.requesterMarkerSlug}:${item.targetMarkerSlug}`,
      text: 'Match',
      x: ((requesterPlayer.position.x + targetPlayer.position.x) / 2) * tileDim + tileDim / 2,
      y: ((requesterPlayer.position.y + targetPlayer.position.y) / 2) * tileDim - tileDim * 1.2,
      alpha: 1 - fadeProgress,
    });
  }

  return bubbles;
}

function isRecentMatchActivity(item: EventActivityItem, nowMs: number) {
  if (item.type !== 'match_created') {
    return false;
  }
  const elapsedMs = nowMs - item.createdAt;
  return elapsedMs >= 0 && elapsedMs <= MATCH_BUBBLE_DURATION_MS;
}

function clamp(value: number) {
  return Math.max(0, Math.min(1, value));
}
