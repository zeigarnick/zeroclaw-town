import type { SerializedWorldMap } from '../aiTown/worldMap';
import * as clawportTerminalMap from '../../data/clawportTerminal';
import { networkingError } from './auth';
import {
  EventWorldTemplateId,
  eventWorldTemplateIds,
} from './validators';

export const DEFAULT_EVENT_WORLD_TEMPLATE_ID = 'clawport-terminal' satisfies EventWorldTemplateId;

export type EventWorldTemplate = {
  id: EventWorldTemplateId;
  revision: string;
  displayName: string;
  description: string;
  mapModule: {
    serializedWorldMap: SerializedWorldMap;
  };
  metadata: {
    theme: string;
    recommendedUse: string;
  };
};

const templates = {
  'clawport-terminal': {
    id: 'clawport-terminal',
    revision: '2026-04-29-cozy-harbor-terminal-v3',
    displayName: 'Clawport Terminal',
    description: 'A compact terminal-harbor event floor for QR onboarding and attendee markers.',
    mapModule: clawportTerminalMap as { serializedWorldMap: SerializedWorldMap },
    metadata: {
      theme: 'terminal-harbor',
      recommendedUse: 'default-event-networking',
    },
  },
} as const satisfies Record<EventWorldTemplateId, EventWorldTemplate>;

export const eventWorldTemplates = Object.values(templates);

export function resolveEventWorldTemplate(
  templateId?: EventWorldTemplateId,
): EventWorldTemplate {
  const selectedTemplateId = templateId ?? DEFAULT_EVENT_WORLD_TEMPLATE_ID;
  const template = templates[selectedTemplateId];
  if (!template) {
    throw networkingError(
      'invalid_event_world_template',
      'The requested event world template is not available.',
    );
  }
  return template;
}

export function isEventWorldTemplateId(value: string): value is EventWorldTemplateId {
  return (eventWorldTemplateIds as readonly string[]).includes(value);
}
