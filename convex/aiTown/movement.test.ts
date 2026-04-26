import { blockedWithPositions } from './movement';
import { WorldMap } from './worldMap';
import type { TileLayer } from './worldMap';

function makeTileLayer(
  width: number,
  height: number,
  blockedTiles: Array<[x: number, y: number]> = [],
): TileLayer {
  const layer = Array.from({ length: width }, () => Array.from({ length: height }, () => -1));
  for (const [x, y] of blockedTiles) {
    layer[x][y] = 1;
  }
  return layer;
}

function makeWorldMap({
  width = 3,
  height = 3,
  objectTiles = [],
  collisionTiles,
}: {
  width?: number;
  height?: number;
  objectTiles?: TileLayer[];
  collisionTiles?: TileLayer;
} = {}) {
  return new WorldMap({
    width,
    height,
    tileSetUrl: '/ai-town/assets/test.png',
    tileSetDimX: 32,
    tileSetDimY: 32,
    tileDim: 32,
    bgTiles: [makeTileLayer(width, height)],
    objectTiles,
    animatedSprites: [],
    ...(collisionTiles !== undefined ? { collisionTiles } : {}),
  });
}

describe('blockedWithPositions', () => {
  test('prefers explicit collisionTiles over legacy objectTiles when available', () => {
    const map = makeWorldMap({
      objectTiles: [makeTileLayer(3, 3, [[0, 0]])],
      collisionTiles: makeTileLayer(3, 3, [[1, 1]]),
    });

    expect(blockedWithPositions({ x: 1, y: 1 }, [], map)).toBe('world blocked');
    expect(blockedWithPositions({ x: 0, y: 0 }, [], map)).toBeNull();
  });

  test('falls back to legacy objectTiles when collisionTiles is absent', () => {
    const map = makeWorldMap({
      objectTiles: [makeTileLayer(3, 3, [[2, 1]])],
    });

    expect(blockedWithPositions({ x: 2, y: 1 }, [], map)).toBe('world blocked');
  });

  test('uses deterministic tile-based collision checks for non-integral positions', () => {
    const map = makeWorldMap({
      collisionTiles: makeTileLayer(3, 3, [[1, 1]]),
    });

    expect(blockedWithPositions({ x: 1.99, y: 1.01 }, [], map)).toBe('world blocked');
    expect(blockedWithPositions({ x: 0.99, y: 1.01 }, [], map)).toBeNull();
  });
});
