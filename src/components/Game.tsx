import { useCallback, useRef, useState } from 'react';
import PixiGame from './PixiGame.tsx';

import { useElementSize } from 'usehooks-ts';
import { Stage } from '@pixi/react';
import { ConvexProvider, useConvex, useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { useWorldHeartbeat } from '../hooks/useWorldHeartbeat.ts';
import { useHistoricalTime } from '../hooks/useHistoricalTime.ts';
import { DebugTimeManager } from './DebugTimeManager.tsx';
import { useServerGame } from '../hooks/serverGame.ts';
import type { NetworkingTownProjection } from '../../convex/networking/townProjection.ts';
import PlayerDetails from './PlayerDetails.tsx';
import type { SelectElement } from './Player.tsx';

export const SHOW_DEBUG_UI = !!import.meta.env.VITE_SHOW_DEBUG_UI;
const EVENT_ID = import.meta.env.VITE_OPENNETWORK_EVENT_ID ?? 'main-event';

export default function Game() {
  const convex = useConvex();
  const [gameWrapperRef, { width, height }] = useElementSize();
  const [selectedElement, setSelectedElementState] = useState<Parameters<SelectElement>[0]>();
  const scrollViewRef = useRef<HTMLDivElement>(null);
  const setSelectedElement = useCallback<SelectElement>((element) => {
    setSelectedElementState(element);
  }, []);

  const worldStatus = useQuery(api.world.defaultWorldStatus);
  const worldId = worldStatus?.worldId;
  const engineId = worldStatus?.engineId;

  const game = useServerGame(worldId);
  const networkingProjection = useQuery(
    api.networking.townProjection.get,
    worldId ? { worldId, eventId: EVENT_ID } : 'skip',
  ) as NetworkingTownProjection | undefined;

  // Send a periodic heartbeat to our world to keep it alive.
  useWorldHeartbeat();

  const worldState = useQuery(api.world.worldState, worldId ? { worldId } : 'skip');
  const { historicalTime, timeManager } = useHistoricalTime(worldState?.engine);

  if (!worldId || !engineId || !game) {
    return null;
  }
  return (
    <>
      {SHOW_DEBUG_UI && <DebugTimeManager timeManager={timeManager} width={200} height={100} />}
      <div
        className="relative w-full overflow-hidden bg-brown-900"
        ref={gameWrapperRef}
        style={{ height: '100dvh' }}
      >
        <div className="absolute inset-0">
          <Stage width={width} height={height} options={{ backgroundColor: 0x7ab5ff }}>
            {/* Re-propagate context because contexts are not shared between renderers.
https://github.com/michalochman/react-pixi-fiber/issues/145#issuecomment-531549215 */}
            <ConvexProvider client={convex}>
              <PixiGame
                game={game}
                worldId={worldId}
                engineId={engineId}
                width={width}
                height={height}
                historicalTime={historicalTime}
                networkingProjection={networkingProjection}
                setSelectedElement={setSelectedElement}
              />
            </ConvexProvider>
          </Stage>
        </div>
        {selectedElement?.kind === 'player' && (
          <aside className="pointer-events-auto absolute inset-y-0 right-0 z-20 flex w-full max-w-md border-l-4 border-brown-900 bg-brown-900/95 text-white shadow-2xl sm:max-w-lg">
            <div ref={scrollViewRef} className="h-full w-full overflow-y-auto p-4 sm:p-5">
              <PlayerDetails
                worldId={worldId}
                engineId={engineId}
                game={game}
                playerId={selectedElement.id}
                networkingProjection={networkingProjection}
                setSelectedElement={setSelectedElement}
                scrollViewRef={scrollViewRef}
              />
            </div>
          </aside>
        )}
      </div>
    </>
  );
}
