import { useCallback } from 'react';
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

export const SHOW_DEBUG_UI = !!import.meta.env.VITE_SHOW_DEBUG_UI;

export default function Game() {
  const convex = useConvex();
  const [gameWrapperRef, { width, height }] = useElementSize();
  const ignoreSelectedElement = useCallback(() => undefined, []);

  const worldStatus = useQuery(api.world.defaultWorldStatus);
  const worldId = worldStatus?.worldId;
  const engineId = worldStatus?.engineId;

  const game = useServerGame(worldId);
  const networkingProjection = useQuery(
    api.networking.townProjection.get,
    worldId ? { worldId } : 'skip',
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
                setSelectedElement={ignoreSelectedElement}
              />
            </ConvexProvider>
          </Stage>
        </div>
      </div>
    </>
  );
}
