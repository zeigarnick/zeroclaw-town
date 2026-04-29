import { Doc } from '../_generated/dataModel';

export function getStoredPublicEventMarkerSlug(
  agent: Pick<Doc<'eventAgents'>, 'publicMarkerSlug'>,
) {
  return agent.publicMarkerSlug;
}
