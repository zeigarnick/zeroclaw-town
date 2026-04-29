import { useMutation, useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Id } from '../../convex/_generated/dataModel';

type FreezeWorldStatus =
  | {
      worldId: Id<'worlds'>;
      status: 'running' | 'stoppedByDeveloper' | 'inactive';
    }
  | null
  | undefined;

export default function FreezeButton({ eventId }: { eventId?: string }) {
  const stopAllowed = useQuery(api.testing.stopAllowed) ?? false;
  const defaultWorld = useQuery(api.world.defaultWorldStatus);
  const eventWorld = useQuery(
    api.world.eventWorldStatus,
    eventId ? { eventId } : 'skip',
  ) as FreezeWorldStatus;
  const worldStatus = eventWorld ?? defaultWorld;

  const frozen = worldStatus?.status === 'stoppedByDeveloper';

  const unfreeze = useMutation(api.testing.resume);
  const freeze = useMutation(api.testing.stop);

  const flipSwitch = async () => {
    if (frozen) {
      console.log('Unfreezing');
      await unfreeze(worldStatus?.worldId ? { worldId: worldStatus.worldId } : {});
    } else {
      console.log('Freezing');
      await freeze(worldStatus?.worldId ? { worldId: worldStatus.worldId } : {});
    }
  };

  const controlDisabled = !worldStatus || !stopAllowed;
  const label = !stopAllowed
    ? 'Venue pause is unavailable'
    : frozen
      ? 'Resume venue simulation'
      : 'Pause venue simulation';

  return (
    <button
      type="button"
      onClick={() => void flipSwitch()}
      className="button hud-button pointer-events-auto bg-transparent text-white shadow-solid focus:outline-none focus:ring-2 focus:ring-clay-100 disabled:opacity-60"
      title={label}
      aria-label={label}
      aria-pressed={frozen}
      disabled={controlDisabled}
    >
      <div className="flex h-full w-full items-center justify-center bg-clay-700">
        {frozen ? (
          <svg
            aria-hidden="true"
            className="size-5 [image-rendering:pixelated]"
            viewBox="0 0 24 24"
            shapeRendering="crispEdges"
          >
            <rect x="7" y="5" width="4" height="14" fill="white" />
            <rect x="11" y="8" width="4" height="8" fill="white" />
            <rect x="15" y="11" width="4" height="2" fill="white" />
          </svg>
        ) : (
          <svg
            aria-hidden="true"
            className="size-5 [image-rendering:pixelated]"
            viewBox="0 0 24 24"
            shapeRendering="crispEdges"
          >
            <rect x="7" y="4" width="4" height="16" fill="white" />
            <rect x="13" y="4" width="4" height="16" fill="white" />
          </svg>
        )}
      </div>
    </button>
  );
}
