import type { NetworkingTownProjection } from '../../convex/networking/townProjection';

type EventActivitySummary = NonNullable<NetworkingTownProjection['eventActivity']>;

export function EventMatchAlerts({ activity }: { activity?: EventActivitySummary }) {
  if (!activity) {
    return null;
  }

  return (
    <aside
      aria-label="Event match activity"
      className="pointer-events-none absolute left-4 top-4 z-20 text-clay-100 sm:left-5 sm:top-5"
    >
      <div className="inline-flex h-10 items-center border-2 border-brown-900 bg-clay-700 text-sm shadow-solid">
        <span className="border-r-2 border-brown-900 px-3 font-mono text-[11px] font-black uppercase leading-none tracking-normal [image-rendering:pixelated]">
          Matches
        </span>
        <span className="min-w-10 px-3 text-center font-mono text-base font-black leading-none tabular-nums tracking-tight [image-rendering:pixelated]">
          {activity.matchCount}
        </span>
      </div>
    </aside>
  );
}
