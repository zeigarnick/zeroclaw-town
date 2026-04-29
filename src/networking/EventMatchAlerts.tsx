import type { NetworkingTownProjection } from '../../convex/networking/townProjection';

type EventActivitySummary = NonNullable<NetworkingTownProjection['eventActivity']>;

export function EventMatchAlerts({ activity }: { activity?: EventActivitySummary }) {
  if (!activity) {
    return null;
  }

  return (
    <aside
      aria-label="Event match activity"
      className="pointer-events-none absolute left-[72px] top-4 z-20 text-white sm:left-[80px] sm:top-5"
    >
      <div className="button inline-flex h-10 cursor-default bg-transparent p-0 text-sm shadow-solid sm:h-12 sm:text-base">
        <div className="inline-flex h-full items-center bg-clay-700 px-2.5 sm:px-3">
          <span className="font-body uppercase leading-none tracking-normal [image-rendering:pixelated]">
            Matches{' '}
            <span className="inline-block min-w-5 text-right tabular-nums tracking-tight">
              {activity.matchCount}
            </span>
          </span>
        </div>
      </div>
    </aside>
  );
}
