import type { NetworkingTownProjection } from '../../convex/networking/townProjection';
import type { EventTownMarker } from './eventTownMarkers';

type EventActivitySummary = NonNullable<NetworkingTownProjection['eventActivity']>;
type EventActivityItem = EventActivitySummary['recent'][number];

export type EventMatchBubble = {
  key: string;
  text: 'Match';
  x: number;
  y: number;
  alpha: number;
};

export type EventMatchChoreography = {
  markers: EventTownMarker[];
  bubble: EventMatchBubble | null;
};

const MATCH_MOVE_DURATION_MS = 1400;
const MATCH_BUBBLE_DELAY_MS = 900;
const MATCH_BUBBLE_DURATION_MS = 3600;
const MATCH_TOTAL_DURATION_MS = MATCH_BUBBLE_DELAY_MS + MATCH_BUBBLE_DURATION_MS;

export function hasActiveEventMatchChoreography({
  activity,
  nowMs,
}: {
  activity?: EventActivitySummary;
  nowMs: number;
}) {
  return (activity?.recent ?? []).some((item) => isRecentMatchActivity(item, nowMs));
}

export function buildEventMatchChoreography({
  markers,
  activity,
  nowMs,
  tileDim,
}: {
  markers: EventTownMarker[];
  activity?: EventActivitySummary;
  nowMs: number;
  tileDim: number;
}): EventMatchChoreography {
  const match = selectActiveMatch(markers, activity, nowMs);
  if (!match) {
    return { markers, bubble: null };
  }

  const { item, requester, target } = match;
  const elapsedMs = Math.max(0, nowMs - item.createdAt);
  const moveProgress = easeOutCubic(clamp(elapsedMs / MATCH_MOVE_DURATION_MS));
  const dx = target.x - requester.x;
  const dy = target.y - requester.y;
  const distance = Math.hypot(dx, dy);
  const direction =
    distance > 0
      ? { x: dx / distance, y: dy / distance }
      : { x: 1, y: 0 };
  const midpoint = {
    x: (requester.x + target.x) / 2,
    y: (requester.y + target.y) / 2,
  };
  const targetSeparation = Math.min(tileDim * 1.15, Math.max(tileDim * 0.6, distance * 0.16));
  const pairSeparation = distance > 0 ? Math.min(distance, targetSeparation) : targetSeparation;
  const requesterMeet = {
    x: midpoint.x - direction.x * (pairSeparation / 2),
    y: midpoint.y - direction.y * (pairSeparation / 2),
  };
  const targetMeet = {
    x: midpoint.x + direction.x * (pairSeparation / 2),
    y: midpoint.y + direction.y * (pairSeparation / 2),
  };

  const choreographedMarkers = markers.map((marker) => {
    if (marker.key === requester.key) {
      return {
        ...marker,
        x: lerp(marker.x, requesterMeet.x, moveProgress),
        y: lerp(marker.y, requesterMeet.y, moveProgress),
      };
    }
    if (marker.key === target.key) {
      return {
        ...marker,
        x: lerp(marker.x, targetMeet.x, moveProgress),
        y: lerp(marker.y, targetMeet.y, moveProgress),
      };
    }
    return marker;
  });

  const bubble = buildBubble({
    item,
    requester,
    target,
    nowMs,
    tileDim,
  });

  return {
    markers: choreographedMarkers,
    bubble,
  };
}

function selectActiveMatch(
  markers: EventTownMarker[],
  activity: EventActivitySummary | undefined,
  nowMs: number,
) {
  const markersBySlug = new Map(markers.map((marker) => [marker.markerSlug, marker]));
  for (const item of activity?.recent ?? []) {
    if (!isRecentMatchActivity(item, nowMs)) {
      continue;
    }
    const requesterSlug = item.requesterMarkerSlug;
    const targetSlug = item.targetMarkerSlug;
    if (!requesterSlug || !targetSlug) {
      continue;
    }
    const requester = markersBySlug.get(requesterSlug);
    const target = markersBySlug.get(targetSlug);
    if (!requester || !target || requester.key === target.key) {
      continue;
    }
    return { item, requester, target };
  }
  return null;
}

function isRecentMatchActivity(item: EventActivityItem, nowMs: number) {
  if (item.type !== 'match_created') {
    return false;
  }
  const elapsedMs = nowMs - item.createdAt;
  return elapsedMs >= 0 && elapsedMs <= MATCH_TOTAL_DURATION_MS;
}

function buildBubble({
  item,
  requester,
  target,
  nowMs,
  tileDim,
}: {
  item: EventActivityItem;
  requester: EventTownMarker;
  target: EventTownMarker;
  nowMs: number;
  tileDim: number;
}): EventMatchBubble | null {
  const elapsedMs = nowMs - item.createdAt;
  const bubbleElapsedMs = elapsedMs - MATCH_BUBBLE_DELAY_MS;
  if (bubbleElapsedMs < 0 || bubbleElapsedMs > MATCH_BUBBLE_DURATION_MS) {
    return null;
  }
  const bubbleProgress = clamp(bubbleElapsedMs / MATCH_BUBBLE_DURATION_MS);
  const fadeProgress = clamp((bubbleProgress - 0.7) / 0.3);
  return {
    key: `${item.createdAt}:${requester.key}:${target.key}`,
    text: 'Match',
    x: (requester.x + target.x) / 2,
    y: (requester.y + target.y) / 2 - tileDim * (0.8 + bubbleProgress * 0.9),
    alpha: 1 - fadeProgress,
  };
}

function clamp(value: number) {
  return Math.max(0, Math.min(1, value));
}

function easeOutCubic(value: number) {
  return 1 - (1 - value) ** 3;
}

function lerp(start: number, end: number, progress: number) {
  return start + (end - start) * progress;
}
