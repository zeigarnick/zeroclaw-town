import { useMutation, useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import Button from './buttons/Button';
import { Id } from '../../convex/_generated/dataModel';

type FreezeWorldStatus = {
  worldId: Id<'worlds'>;
  status: 'running' | 'stoppedByDeveloper' | 'inactive';
} | null | undefined;

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

  return !stopAllowed ? null : (
    <>
      <Button
        onClick={flipSwitch}
        className="hidden lg:block"
        title="When freezing a world, the agents will take some time to stop what they are doing before they become frozen. "
        imgUrl="/assets/star.svg"
      >
        {frozen ? 'Unfreeze' : 'Freeze'}
      </Button>
    </>
  );
}
