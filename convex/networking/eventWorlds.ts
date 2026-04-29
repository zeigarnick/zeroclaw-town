import { internal } from '../_generated/api';
import { Doc, Id } from '../_generated/dataModel';
import { MutationCtx } from '../_generated/server';
import { createEngine } from '../aiTown/main';
import { ENGINE_ACTION_DURATION } from '../constants';
import {
  DEFAULT_EVENT_WORLD_TEMPLATE_ID,
  resolveEventWorldTemplate,
} from './eventWorldTemplates';
import { EventWorldTemplateId } from './validators';

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
