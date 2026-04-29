import type { NetworkingTownAgent } from '../../convex/networking/townProjection';
import type { EventAvatarConfig, EventPublicCard } from '../../convex/networking/eventCards';

export type EventTownMarker = {
  key: string;
  markerSlug: string;
  displayName: string;
  avatarConfig: EventAvatarConfig;
  avatarSummary: string;
  publicCard: EventPublicCard;
  x: number;
  y: number;
  fill: number;
  accent: number;
};

const SKIN_TONE_COLORS: Record<string, number> = {
  'tone-1': 0xf6d6bd,
  'tone-2': 0xd9a066,
  'tone-3': 0x8f563b,
  'tone-4': 0x663931,
  'tone-5': 0x45283c,
};

const CLOTHING_COLORS: Record<string, number> = {
  jacket: 0x3a4466,
  hoodie: 0x5a6988,
  blazer: 0x181425,
  sweater: 0x6e2146,
  tee: 0xdd7c42,
};

export function buildEventTownMarkers({
  agents,
  mapWidth,
  mapHeight,
  tileDim,
}: {
  agents: NetworkingTownAgent[];
  mapWidth: number;
  mapHeight: number;
  tileDim: number;
}): EventTownMarker[] {
  const eventAgents = agents.filter(
    (agent) =>
      agent.source === 'event' &&
      agent.playerId === undefined &&
      agent.avatarConfig !== undefined &&
      agent.publicCard !== undefined,
  );
  return eventAgents.map((agent, index) => {
    const position = deterministicTilePosition(agent.slug, index, mapWidth, mapHeight);
    const avatarConfig = agent.avatarConfig!;
    return {
      key: `${agent.eventId ?? 'event'}:${agent.slug}`,
      markerSlug: agent.slug,
      displayName: agent.displayName,
      avatarConfig,
      avatarSummary: describeAvatar(avatarConfig),
      publicCard: agent.publicCard!,
      x: position.x * tileDim + tileDim / 2,
      y: position.y * tileDim + tileDim / 2,
      fill: SKIN_TONE_COLORS[avatarConfig.skinTone] ?? SKIN_TONE_COLORS['tone-3'],
      accent: CLOTHING_COLORS[avatarConfig.clothing] ?? CLOTHING_COLORS.jacket,
    };
  });
}

function describeAvatar(avatarConfig: EventAvatarConfig) {
  const details = [
    `Hair: ${avatarConfig.hair}`,
    `Skin tone: ${avatarConfig.skinTone}`,
    `Clothing: ${avatarConfig.clothing}`,
  ];
  if (avatarConfig.hat) {
    details.push(`Hat: ${avatarConfig.hat}`);
  }
  if (avatarConfig.accessory) {
    details.push(`Accessory: ${avatarConfig.accessory}`);
  }
  return details.join(' | ');
}

function deterministicTilePosition(
  seed: string,
  index: number,
  mapWidth: number,
  mapHeight: number,
) {
  const usableWidth = Math.max(1, mapWidth - 8);
  const usableHeight = Math.max(1, mapHeight - 8);
  const hash = hashString(`${seed}:${index}`);
  return {
    x: 4 + (hash % usableWidth),
    y: 4 + (Math.floor(hash / usableWidth) % usableHeight),
  };
}

function hashString(value: string) {
  let hash = 0;
  for (const char of value) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return hash;
}
