import { PixiComponent, applyDefaultProps } from '@pixi/react';
import * as PIXI from 'pixi.js';
import { TileLayer, WorldMap } from '../../convex/aiTown/worldMap';

const tileTextureCache = new Map<string, PIXI.Texture[]>();

export const getBelowCharacterLayers = (map: WorldMap): TileLayer[] => {
  if (map.visualLayers && map.visualLayers.length > 0) {
    const belowCharacterLayers = map.visualLayers
      .filter((layer) => layer.role === 'background' || layer.role === 'object')
      .map((layer) => layer.tiles);
    if (belowCharacterLayers.length > 0) {
      return belowCharacterLayers;
    }
  }

  return [...map.bgTiles, ...map.objectTiles];
};

export const getAboveCharacterLayers = (map: WorldMap): TileLayer[] => {
  if (map.aboveCharacterLayers && map.aboveCharacterLayers.length > 0) {
    return map.aboveCharacterLayers.map((layer) => layer.tiles);
  }

  if (map.visualLayers && map.visualLayers.length > 0) {
    return map.visualLayers
      .filter((layer) => layer.role === 'aboveCharacter')
      .map((layer) => layer.tiles);
  }

  return [];
};

const getTileTextureCacheKey = (map: WorldMap): string =>
  `${map.tileSetUrl}|${map.tileSetDimX}|${map.tileSetDimY}|${map.tileDim}`;

const getTileTextures = (map: WorldMap): PIXI.Texture[] => {
  const cacheKey = getTileTextureCacheKey(map);
  const cached = tileTextureCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const numXTiles = Math.floor(map.tileSetDimX / map.tileDim);
  const numYTiles = Math.floor(map.tileSetDimY / map.tileDim);
  const baseTexture = PIXI.BaseTexture.from(map.tileSetUrl, {
    scaleMode: PIXI.SCALE_MODES.NEAREST,
  });

  const tiles: PIXI.Texture[] = [];
  for (let x = 0; x < numXTiles; x++) {
    for (let y = 0; y < numYTiles; y++) {
      tiles[x + y * numXTiles] = new PIXI.Texture(
        baseTexture,
        new PIXI.Rectangle(x * map.tileDim, y * map.tileDim, map.tileDim, map.tileDim),
      );
    }
  }

  tileTextureCache.set(cacheKey, tiles);
  return tiles;
};

const areTileLayersEquivalent = (first: TileLayer, second: TileLayer): boolean => {
  if (first === second) {
    return true;
  }
  if (first.length !== second.length) {
    return false;
  }

  for (let x = 0; x < first.length; x++) {
    const firstColumn = first[x];
    const secondColumn = second[x];
    if (firstColumn === secondColumn) {
      continue;
    }
    if (!firstColumn || !secondColumn || firstColumn.length !== secondColumn.length) {
      return false;
    }
    for (let y = 0; y < firstColumn.length; y++) {
      if (firstColumn[y] !== secondColumn[y]) {
        return false;
      }
    }
  }

  return true;
};

export const areLayerCollectionsEquivalent = (first: TileLayer[], second: TileLayer[]): boolean => {
  if (first === second) {
    return true;
  }
  if (first.length !== second.length) {
    return false;
  }
  for (let i = 0; i < first.length; i++) {
    if (!areTileLayersEquivalent(first[i], second[i])) {
      return false;
    }
  }
  return true;
};

export const didMapRenderGeometryChange = (previous: WorldMap, next: WorldMap): boolean =>
  previous.tileSetUrl !== next.tileSetUrl ||
  previous.tileSetDimX !== next.tileSetDimX ||
  previous.tileSetDimY !== next.tileSetDimY ||
  previous.tileDim !== next.tileDim ||
  previous.width !== next.width ||
  previous.height !== next.height;

export const renderTileLayers = (
  container: PIXI.Container,
  map: WorldMap,
  layers: TileLayer[],
): void => {
  container.removeChildren();
  if (layers.length === 0) {
    return;
  }

  const tiles = getTileTextures(map);
  for (let i = 0; i < map.width * map.height; i++) {
    const x = i % map.width;
    const y = Math.floor(i / map.width);
    const xPx = x * map.tileDim;
    const yPx = y * map.tileDim;

    for (const layer of layers) {
      const tileIndex = layer[x]?.[y];
      if (tileIndex === undefined || tileIndex < 0) {
        continue;
      }
      const tileTexture = tiles[tileIndex];
      if (!tileTexture) {
        continue;
      }
      const tile = new PIXI.Sprite(tileTexture);
      tile.x = xPx;
      tile.y = yPx;
      container.addChild(tile);
    }
  }
};

const applyStableHitArea = (container: PIXI.Container, map: WorldMap, stableHitArea?: boolean) => {
  if (!stableHitArea) {
    container.interactive = false;
    container.hitArea = null;
    return;
  }

  container.interactive = true;
  container.hitArea = new PIXI.Rectangle(0, 0, map.width * map.tileDim, map.height * map.tileDim);
};

export const PixiMapLayer = PixiComponent('PixiMapLayer', {
  create: (props: {
    map: WorldMap;
    layers: TileLayer[];
    stableHitArea?: boolean;
    [k: string]: any;
  }) => {
    const container = new PIXI.Container();
    renderTileLayers(container, props.map, props.layers);
    applyStableHitArea(container, props.map, props.stableHitArea);
    return container;
  },

  applyProps: (instance, oldProps, newProps) => {
    if (!oldProps.map) {
      renderTileLayers(instance, newProps.map, newProps.layers);
      applyStableHitArea(instance, newProps.map, newProps.stableHitArea);
      applyDefaultProps(instance, oldProps, newProps);
      return;
    }

    const oldMap = oldProps.map as WorldMap;
    const newMap = newProps.map as WorldMap;
    const oldLayers = (oldProps.layers as TileLayer[] | undefined) ?? [];
    const newLayers = (newProps.layers as TileLayer[] | undefined) ?? [];

    const didMapGeometryChange = didMapRenderGeometryChange(oldMap, newMap);
    const didLayerContentChange = !areLayerCollectionsEquivalent(oldLayers, newLayers);
    if (didMapGeometryChange || didLayerContentChange) {
      renderTileLayers(instance, newProps.map, newProps.layers);
    }

    applyDefaultProps(instance, oldProps, newProps);

    const didHitAreaModeChange = oldProps.stableHitArea !== newProps.stableHitArea;
    const didMapSizeChange =
      oldMap.width !== newMap.width ||
      oldMap.height !== newMap.height ||
      oldMap.tileDim !== newMap.tileDim;
    if (didMapSizeChange || didHitAreaModeChange) {
      applyStableHitArea(instance, newProps.map, newProps.stableHitArea);
    }
  },
});

export default PixiMapLayer;
