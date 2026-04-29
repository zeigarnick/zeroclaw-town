import { useEffect, useMemo, useState } from 'react';
import type { NetworkingTownProjection } from '../../convex/networking/townProjection';

type EventActivitySummary = NonNullable<NetworkingTownProjection['eventActivity']>;
type EventActivityItem = EventActivitySummary['recent'][number];

const DEFAULT_ALERT_DURATION_MS = 6000;

export function EventMatchAlerts({
  activity,
  alertDurationMs = DEFAULT_ALERT_DURATION_MS,
}: {
  activity?: EventActivitySummary;
  alertDurationMs?: number;
}) {
  const recent = useMemo(() => activity?.recent ?? [], [activity?.recent]);
  const [visibleActivity, setVisibleActivity] = useState<EventActivityItem[]>(recent);

  useEffect(() => {
    setVisibleActivity(recent);
    if (recent.length === 0) {
      return undefined;
    }
    const timeoutId = window.setTimeout(() => {
      setVisibleActivity([]);
    }, alertDurationMs);
    return () => window.clearTimeout(timeoutId);
  }, [alertDurationMs, recent]);

  if (!activity) {
    return null;
  }

  return (
    <aside
      aria-label="Event match activity"
      className="pointer-events-none absolute left-4 top-20 z-10 w-full max-w-sm text-white sm:left-6 sm:top-6"
    >
      <div className="inline-flex rounded-md border border-brown-900 bg-brown-900/90 px-3 py-2 text-sm shadow-lg">
        <span className="font-medium">Matches</span>
        <span className="ml-2 tabular-nums text-clay-100">{activity.matchCount}</span>
      </div>
      {visibleActivity.length > 0 && (
        <div aria-live="polite" className="mt-3 space-y-2">
          {visibleActivity.map((item) => (
            <div
              key={`${item.createdAt}:${item.requesterDisplayName}:${item.targetDisplayName}`}
              className="rounded-md border border-brown-900 bg-brown-900/95 p-3 text-sm leading-6 shadow-lg"
            >
              <span className="font-medium">{item.requesterDisplayName}</span>
              <span className="text-clay-100"> matched with </span>
              <span className="font-medium">{item.targetDisplayName}</span>
            </div>
          ))}
        </div>
      )}
    </aside>
  );
}
