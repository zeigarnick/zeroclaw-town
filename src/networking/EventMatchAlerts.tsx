import type { NetworkingTownProjection } from '../../convex/networking/townProjection';

type EventActivitySummary = NonNullable<NetworkingTownProjection['eventActivity']>;

export function EventMatchAlerts({
  activity,
}: {
  activity?: EventActivitySummary;
}) {
  if (!activity) {
    return null;
  }

  return (
    <aside
      aria-label="Event match activity"
      className="pointer-events-none absolute left-4 top-20 z-10 text-white sm:left-6 sm:top-6"
    >
      <div className="inline-flex rounded-md border border-brown-900 bg-brown-900/90 px-3 py-2 text-sm shadow-lg">
        <span className="font-medium">Matches</span>
        <span className="ml-2 tabular-nums text-clay-100">{activity.matchCount}</span>
      </div>
    </aside>
  );
}
