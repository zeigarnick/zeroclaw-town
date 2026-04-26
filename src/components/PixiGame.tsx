import * as PIXI from 'pixi.js';
import { Container, Graphics, Text, useApp } from '@pixi/react';
import { Player, SelectElement } from './Player.tsx';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PixiStaticMap } from './PixiStaticMap.tsx';
import PixiMapLayer, { getAboveCharacterLayers } from './PixiMapLayer.tsx';
import PixiViewport from './PixiViewport.tsx';
import { Viewport } from 'pixi-viewport';
import { Id } from '../../convex/_generated/dataModel';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api.js';
import { useSendInput } from '../hooks/sendInput.ts';
import { toastOnError } from '../toasts.ts';
import { DebugPath } from './DebugPath.tsx';
import { PositionIndicator } from './PositionIndicator.tsx';
import { SHOW_DEBUG_UI } from './Game.tsx';
import { ServerGame } from '../hooks/serverGame.ts';
import type {
  NetworkingTownProjection,
  NetworkingTownStatus,
} from '../../convex/networking/townProjection.ts';
import { useHistoricalValue } from '../hooks/useHistoricalValue.ts';
import { Location, locationFields, playerLocation } from '../../convex/aiTown/location.ts';
import { Player as ServerPlayer } from '../../convex/aiTown/player.ts';

const NETWORKING_BADGE_META: Record<
  NetworkingTownStatus,
  { shortLabel: string; fill: number; text: number }
> = {
  matched: { shortLabel: 'Match', fill: 0x3a4466, text: 0xffffff },
  pending_meeting: { shortLabel: 'Meet', fill: 0xdd7c42, text: 0xffffff },
  talking: { shortLabel: 'Talk', fill: 0x6e2146, text: 0xffffff },
  intro_ready: { shortLabel: 'Intro', fill: 0xfec742, text: 0x181425 },
};

export const PixiGame = (props: {
  worldId: Id<'worlds'>;
  engineId: Id<'engines'>;
  game: ServerGame;
  historicalTime: number | undefined;
  width: number;
  height: number;
  setSelectedElement: SelectElement;
  networkingProjection?: NetworkingTownProjection;
}) => {
  // PIXI setup.
  const pixiApp = useApp();
  const viewportRef = useRef<Viewport | undefined>();

  const humanTokenIdentifier = useQuery(api.world.userStatus, { worldId: props.worldId }) ?? null;
  const humanPlayerId = [...props.game.world.players.values()].find(
    (p) => p.human === humanTokenIdentifier,
  )?.id;

  const moveTo = useSendInput(props.engineId, 'moveTo');

  // Interaction for clicking on the world to navigate.
  const dragStart = useRef<{ screenX: number; screenY: number } | null>(null);
  const onMapPointerDown = (e: any) => {
    // https://pixijs.download/dev/docs/PIXI.FederatedPointerEvent.html
    dragStart.current = { screenX: e.screenX, screenY: e.screenY };
  };

  const [lastDestination, setLastDestination] = useState<{
    x: number;
    y: number;
    t: number;
  } | null>(null);
  const onMapPointerUp = async (e: any) => {
    if (dragStart.current) {
      const { screenX, screenY } = dragStart.current;
      dragStart.current = null;
      const [dx, dy] = [screenX - e.screenX, screenY - e.screenY];
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > 10) {
        console.log(`Skipping navigation on drag event (${dist}px)`);
        return;
      }
    }
    if (!humanPlayerId) {
      return;
    }
    const viewport = viewportRef.current;
    if (!viewport) {
      return;
    }
    const gameSpacePx = viewport.toWorld(e.screenX, e.screenY);
    const tileDim = props.game.worldMap.tileDim;
    const gameSpaceTiles = {
      x: gameSpacePx.x / tileDim,
      y: gameSpacePx.y / tileDim,
    };
    setLastDestination({ t: Date.now(), ...gameSpaceTiles });
    const roundedTiles = {
      x: Math.floor(gameSpaceTiles.x),
      y: Math.floor(gameSpaceTiles.y),
    };
    console.log(`Moving to ${JSON.stringify(roundedTiles)}`);
    await toastOnError(moveTo({ playerId: humanPlayerId, destination: roundedTiles }));
  };
  const { width, height, tileDim } = props.game.worldMap;
  const aboveCharacterLayers = useMemo(
    () => getAboveCharacterLayers(props.game.worldMap),
    [props.game.worldMap.aboveCharacterLayers, props.game.worldMap.visualLayers],
  );
  const players = [...props.game.world.players.values()];

  // Zoom on the user’s avatar when it is created
  useEffect(() => {
    if (!viewportRef.current || humanPlayerId === undefined) return;

    const humanPlayer = props.game.world.players.get(humanPlayerId)!;
    viewportRef.current.animate({
      position: new PIXI.Point(humanPlayer.position.x * tileDim, humanPlayer.position.y * tileDim),
      scale: 1.5,
    });
  }, [humanPlayerId]);

  return (
    <PixiViewport
      app={pixiApp}
      screenWidth={props.width}
      screenHeight={props.height}
      worldWidth={width * tileDim}
      worldHeight={height * tileDim}
      viewportRef={viewportRef}
    >
      <PixiStaticMap
        map={props.game.worldMap}
        onpointerup={onMapPointerUp}
        onpointerdown={onMapPointerDown}
      />
      {players.map(
        (p) =>
          // Only show the path for the human player in non-debug mode.
          (SHOW_DEBUG_UI || p.id === humanPlayerId) && (
            <DebugPath key={`path-${p.id}`} player={p} tileDim={tileDim} />
          ),
      )}
      {lastDestination && <PositionIndicator destination={lastDestination} tileDim={tileDim} />}
      {players.map((p) => (
        <Player
          key={`player-${p.id}`}
          game={props.game}
          player={p}
          isViewer={p.id === humanPlayerId}
          onClick={props.setSelectedElement}
          historicalTime={props.historicalTime}
          isNetworkingTalking={
            (props.networkingProjection?.agentsByPlayerId[p.id]?.counts.talking ?? 0) > 0
          }
        />
      ))}
      {players.map((p) => {
        const networkingAgent = props.networkingProjection?.agentsByPlayerId[p.id];
        return networkingAgent?.primaryStatus ? (
          <NetworkingBadge
            key={`networking-${p.id}`}
            game={props.game}
            player={p}
            status={networkingAgent.primaryStatus}
            historicalTime={props.historicalTime}
          />
        ) : null;
      })}
      {aboveCharacterLayers.length > 0 && (
        <PixiMapLayer map={props.game.worldMap} layers={aboveCharacterLayers} />
      )}
    </PixiViewport>
  );
};
export default PixiGame;

function NetworkingBadge({
  game,
  player,
  status,
  historicalTime,
}: {
  game: ServerGame;
  player: ServerPlayer;
  status: NetworkingTownStatus;
  historicalTime: number | undefined;
}) {
  const locationBuffer = game.world.historicalLocations?.get(player.id);
  const historicalLocation = useHistoricalValue<Location>(
    locationFields,
    historicalTime,
    playerLocation(player),
    locationBuffer,
  );
  const meta = NETWORKING_BADGE_META[status];
  const draw = useCallback(
    (g: PIXI.Graphics) => {
      g.clear();
      g.beginFill(0x181425, 0.85);
      g.drawRoundedRect(-24, -48, 48, 16, 4);
      g.endFill();
      g.beginFill(meta.fill, 1);
      g.drawRoundedRect(-22, -46, 44, 12, 3);
      g.endFill();
    },
    [meta.fill],
  );

  if (!historicalLocation) {
    return null;
  }

  const tileDim = game.worldMap.tileDim;
  return (
    <Container
      x={historicalLocation.x * tileDim + tileDim / 2}
      y={historicalLocation.y * tileDim + tileDim / 2}
    >
      <Graphics draw={draw} />
      <Text
        x={0}
        y={-40}
        text={meta.shortLabel}
        anchor={{ x: 0.5, y: 0.5 }}
        style={
          new PIXI.TextStyle({
            align: 'center',
            fill: meta.text,
            fontFamily: 'VCR OSD Mono, monospace',
            fontSize: 9,
          })
        }
      />
    </Container>
  );
}
