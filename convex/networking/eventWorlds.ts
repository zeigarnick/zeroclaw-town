import { internal } from '../_generated/api';
import { Doc, Id } from '../_generated/dataModel';
import { MutationCtx } from '../_generated/server';
import { createEngine } from '../aiTown/main';
import { insertInput } from '../aiTown/insertInput';
import { ENGINE_ACTION_DURATION } from '../constants';
import {
  DEFAULT_EVENT_WORLD_TEMPLATE_ID,
  resolveEventWorldTemplate,
} from './eventWorldTemplates';
import { EventWorldTemplateId } from './validators';
import type { EventAvatarConfig, EventPublicCard } from './eventCards';

type EventWorldSelection = {
  worldTemplateId?: EventWorldTemplateId;
  now?: number;
};

type CreatedEventWorld = {
  worldTemplateId: EventWorldTemplateId;
  worldTemplateRevision: string;
  worldId: Id<'worlds'>;
  worldStatusId: Id<'worldStatus'>;
  engineId: Id<'engines'>;
  mapId: Id<'maps'>;
};

export async function createEventWorld(
  ctx: MutationCtx,
  selection: EventWorldSelection = {},
): Promise<CreatedEventWorld> {
  const now = selection.now ?? Date.now();
  const template = resolveEventWorldTemplate(selection.worldTemplateId);
  const engineId = await createEngine(ctx);
  const engine = await ctx.db.get(engineId);
  if (!engine) {
    throw new Error(`Invalid engine ID: ${engineId}`);
  }
  const worldId = await ctx.db.insert('worlds', {
    nextId: 0,
    agents: [],
    conversations: [],
    players: [],
  });
  const worldStatusId = await ctx.db.insert('worldStatus', {
    engineId,
    isDefault: false,
    lastViewed: now,
    status: 'running',
    worldId,
  });
  const mapId = await ctx.db.insert('maps', {
    worldId,
    ...template.mapModule.serializedWorldMap,
  });
  await ctx.scheduler.runAfter(0, internal.aiTown.main.runStep, {
    worldId,
    generationNumber: engine.generationNumber,
    maxDuration: ENGINE_ACTION_DURATION,
  });
  return {
    worldTemplateId: template.id,
    worldTemplateRevision: template.revision,
    worldId,
    worldStatusId,
    engineId,
    mapId,
  };
}

export async function ensureEventSpaceWorld(
  ctx: MutationCtx,
  eventSpace: Doc<'eventSpaces'>,
  selection: EventWorldSelection = {},
) {
  const selectedTemplateId =
    selection.worldTemplateId ?? eventSpace.worldTemplateId ?? DEFAULT_EVENT_WORLD_TEMPLATE_ID;
  const template = resolveEventWorldTemplate(selectedTemplateId);
  if (eventSpace.worldId && eventSpace.worldTemplateId) {
    const synced = await syncEventWorldMapFromTemplate(ctx, eventSpace, { now: selection.now });
    if (!synced && eventSpace.worldTemplateRevision === template.revision) {
      return eventSpace;
    }
    const updated = await ctx.db.get(eventSpace._id);
    if (!updated) {
      throw new Error(`Event space ${eventSpace._id} disappeared during world provisioning.`);
    }
    return updated;
  }

  const eventWorld = eventSpace.worldId
    ? {
        worldId: eventSpace.worldId,
        worldTemplateId: selectedTemplateId,
        worldTemplateRevision: template.revision,
      }
    : await createEventWorld(ctx, {
        worldTemplateId: selectedTemplateId,
        now: selection.now,
      });

  await ctx.db.patch(eventSpace._id, {
    worldId: eventWorld.worldId,
    worldTemplateId: eventWorld.worldTemplateId,
    worldTemplateRevision: eventWorld.worldTemplateRevision,
    updatedAt: selection.now ?? Date.now(),
  });
  const updated = await ctx.db.get(eventSpace._id);
  if (!updated) {
    throw new Error(`Event space ${eventSpace._id} disappeared during world provisioning.`);
  }
  return updated;
}

export async function ensureEventWorldAvatars(
  ctx: MutationCtx,
  eventSpace: Doc<'eventSpaces'>,
  selection: { now?: number } = {},
) {
  const now = selection.now ?? Date.now();
  const space = eventSpace.worldId
    ? eventSpace
    : await ensureEventSpaceWorld(ctx, eventSpace, { now });
  if (!space.worldId) {
    return { enqueued: 0, skipped: 0 };
  }
  const worldStatus = await ctx.db
    .query('worldStatus')
    .withIndex('worldId', (q) => q.eq('worldId', space.worldId!))
    .first();
  if (!worldStatus) {
    return { enqueued: 0, skipped: 0 };
  }

  const pendingInputs = await ctx.db
    .query('inputs')
    .withIndex('byInputNumber', (q) => q.eq('engineId', worldStatus.engineId))
    .collect();
  const agents = await ctx.db
    .query('eventAgents')
    .withIndex('by_event_and_status', (q) =>
      q.eq('eventId', space.eventId).eq('approvalStatus', 'approved'),
    )
    .collect();

  let enqueued = 0;
  let skipped = 0;
  for (const agent of agents) {
    if (agent.townPlayerId || hasPendingEventAvatarInput(pendingInputs, agent._id)) {
      skipped += 1;
      continue;
    }
    const card = agent.activeCardId ? await ctx.db.get(agent.activeCardId) : null;
    if (!card || card.eventId !== space.eventId || card.status !== 'approved') {
      skipped += 1;
      continue;
    }
    await insertInput(ctx, space.worldId, 'createEventAgentAvatar', {
      eventAgentId: agent._id,
      displayName: agent.displayName,
      description: describeEventAvatar(agent.avatarConfig, card.publicCard),
      character: characterForEventAgent(`${agent.eventId}:${agent.publicMarkerSlug ?? agent._id}`),
    });
    enqueued += 1;
  }
  return { enqueued, skipped };
}

export async function syncEventWorldMapByWorldId(
  ctx: MutationCtx,
  worldId: Id<'worlds'>,
  selection: { now?: number } = {},
) {
  const eventSpace = await ctx.db
    .query('eventSpaces')
    .withIndex('by_world_id', (q) => q.eq('worldId', worldId))
    .first();
  if (!eventSpace) {
    return false;
  }
  return await syncEventWorldMapFromTemplate(ctx, eventSpace, selection);
}

export async function syncEventWorldMapFromTemplate(
  ctx: MutationCtx,
  eventSpace: Doc<'eventSpaces'>,
  selection: { now?: number } = {},
) {
  if (!eventSpace.worldId) {
    return false;
  }
  const selectedTemplateId = eventSpace.worldTemplateId ?? DEFAULT_EVENT_WORLD_TEMPLATE_ID;
  const template = resolveEventWorldTemplate(selectedTemplateId);
  if (
    eventSpace.worldTemplateId === template.id &&
    eventSpace.worldTemplateRevision === template.revision
  ) {
    return false;
  }
  const existingMap = await ctx.db
    .query('maps')
    .withIndex('worldId', (q) => q.eq('worldId', eventSpace.worldId!))
    .unique();
  if (existingMap) {
    await ctx.db.replace(existingMap._id, {
      worldId: eventSpace.worldId,
      ...template.mapModule.serializedWorldMap,
    });
  } else {
    await ctx.db.insert('maps', {
      worldId: eventSpace.worldId,
      ...template.mapModule.serializedWorldMap,
    });
  }
  await ctx.db.patch(eventSpace._id, {
    worldTemplateId: template.id,
    worldTemplateRevision: template.revision,
    updatedAt: selection.now ?? Date.now(),
  });
  return true;
}

function hasPendingEventAvatarInput(
  inputs: Array<{ name: string; args?: any; returnValue?: unknown }>,
  eventAgentId: Id<'eventAgents'>,
) {
  return inputs.some(
    (input) =>
      input.name === 'createEventAgentAvatar' &&
      !input.returnValue &&
      input.args?.eventAgentId === eventAgentId,
  );
}

function describeEventAvatar(avatar: EventAvatarConfig, card: EventPublicCard) {
  const cardParts = [
    card.role ? `Role: ${card.role}` : undefined,
    card.category ? `Category: ${card.category}` : undefined,
    card.offers.length > 0 ? `Offers: ${card.offers.join(', ')}` : undefined,
    card.wants.length > 0 ? `Wants: ${card.wants.join(', ')}` : undefined,
    card.lookingFor ? `Looking for: ${card.lookingFor}` : undefined,
  ].filter(Boolean);
  const avatarParts = [
    `Hair: ${avatar.hair}`,
    `Skin tone: ${avatar.skinTone}`,
    `Clothing: ${avatar.clothing}`,
    avatar.hat ? `Hat: ${avatar.hat}` : undefined,
    avatar.accessory ? `Accessory: ${avatar.accessory}` : undefined,
  ].filter(Boolean);
  return [...avatarParts, ...cardParts].join(' | ');
}

function characterForEventAgent(seed: string) {
  const characters = ['f1', 'f2', 'f3', 'f4', 'f5', 'f6', 'f7', 'f8'];
  let hash = 0;
  for (const char of seed) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return characters[hash % characters.length];
}
