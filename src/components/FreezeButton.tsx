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
      className="pointer-events-auto inline-flex size-10 items-center justify-center border-2 border-brown-900 bg-clay-700 text-clay-100 shadow-solid transition hover:bg-clay-500 focus:outline-none focus:ring-2 focus:ring-clay-100 disabled:cursor-not-allowed disabled:opacity-50 active:translate-x-px active:translate-y-px"
      title={label}
      aria-label={label}
      aria-pressed={frozen}
      disabled={!worldStatus}
    >
      <span className="font-mono text-base font-black leading-none [image-rendering:pixelated]">
        {frozen ? '>' : '||'}
      </span>
    </button>
  );
}
