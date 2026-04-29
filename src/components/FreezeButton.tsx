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

  const label = frozen ? 'Resume venue simulation' : 'Pause venue simulation';

  return !stopAllowed ? null : (
    <button
      type="button"
      onClick={() => void flipSwitch()}
      className="button pointer-events-auto size-10 bg-transparent p-0 text-xl text-white shadow-solid focus:outline-none focus:ring-2 focus:ring-clay-100 disabled:opacity-50 sm:size-12"
      title={label}
      aria-label={label}
      aria-pressed={frozen}
      disabled={!worldStatus}
    >
      <div className="flex h-full w-full items-center justify-center bg-clay-700">
        <span className="font-body text-xl leading-none tracking-normal [image-rendering:pixelated] sm:text-2xl">
          {frozen ? '>' : '||'}
        </span>
      </div>
    </button>
  );
}
