import Button from './Button';
import { toast } from 'react-toastify';
import interactImg from '../../../assets/interact.svg';
import { useConvex, useMutation, useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
// import { SignInButton } from '@clerk/clerk-react';
import { ConvexError } from 'convex/values';
import { Id } from '../../../convex/_generated/dataModel';
import { useCallback } from 'react';
import { waitForInput } from '../../hooks/sendInput';
import { useServerGame } from '../../hooks/serverGame';
import {
  clearPlayerSessionToken,
  setPlayerSessionToken,
  usePlayerSessionToken,
} from '../../hooks/playerSession';

export default function InteractButton() {
  // const { isAuthenticated } = useConvexAuth();
  const worldStatus = useQuery(api.world.defaultWorldStatus);
  const worldId = worldStatus?.worldId;
  const game = useServerGame(worldId);
  const sessionToken = usePlayerSessionToken();
  const humanTokenIdentifier = useQuery(
    api.world.userStatus,
    worldId ? { worldId, sessionToken: sessionToken ?? undefined } : 'skip',
  );
  const userPlayerId =
    game && [...game.world.players.values()].find((p) => p.human === humanTokenIdentifier)?.id;
  const join = useMutation(api.world.joinWorld);
  const leave = useMutation(api.world.leaveWorld);
  const isPlaying = !!userPlayerId;

  const convex = useConvex();
  const joinInput = useCallback(
    async (worldId: Id<'worlds'>) => {
      try {
        const joinResult = await join({ worldId });
        setPlayerSessionToken(joinResult.sessionToken);
        try {
          await waitForInput(convex, joinResult.inputId);
        } catch (e: any) {
          toast.error(e.message);
        }
      } catch (e: any) {
        if (e instanceof ConvexError) {
          toast.error(e.data);
          return;
        }
        throw e;
      }
    },
    [convex, join],
  );

  const joinOrLeaveGame = () => {
    if (
      !worldId ||
      // || !isAuthenticated
      game === undefined
    ) {
      return;
    }
    if (isPlaying) {
      console.log(`Leaving game for player ${userPlayerId}`);
      if (!sessionToken || !userPlayerId) {
        return;
      }
      void leave({ worldId, playerId: userPlayerId, sessionToken })
        .then(() => clearPlayerSessionToken())
        .catch((e: any) => toast.error(e.message));
    } else {
      console.log(`Joining game`);
      void joinInput(worldId);
    }
  };
  // if (!isAuthenticated || game === undefined) {
  //   return (
  //     <SignInButton>
  //       <Button imgUrl={interactImg}>Interact</Button>
  //     </SignInButton>
  //   );
  // }
  return (
    <Button imgUrl={interactImg} onClick={joinOrLeaveGame}>
      {isPlaying ? 'Leave' : 'Interact'}
    </Button>
  );
}
