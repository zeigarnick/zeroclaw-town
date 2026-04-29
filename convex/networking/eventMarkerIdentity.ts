import { Id } from '../_generated/dataModel';

export function publicEventMarkerSlug(eventAgentId: Id<'eventAgents'>) {
  return `event-agent-${hashString(eventAgentId).toString(36)}`;
}

function hashString(value: string) {
  let hash = 0;
  for (const char of value) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return hash;
}
