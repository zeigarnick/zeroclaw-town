import { Infer, ObjectType, v } from 'convex/values';

// `layer[position.x][position.y]` is the tileIndex or -1 if empty.
const tileLayer = v.array(v.array(v.number()));
export type TileLayer = Infer<typeof tileLayer>;

const visualLayerRole = v.union(
  v.literal('background'),
  v.literal('object'),
  v.literal('aboveCharacter'),
);
export type VisualLayerRole = Infer<typeof visualLayerRole>;

const visualLayer = {
  name: v.string(),
  role: visualLayerRole,
  tiles: tileLayer,
};
export type VisualLayer = ObjectType<typeof visualLayer>;

const aboveCharacterLayer = {
  name: v.string(),
  role: v.literal('aboveCharacter'),
  tiles: tileLayer,
};
export type AboveCharacterLayer = ObjectType<typeof aboveCharacterLayer>;

const spawnPoint = {
  name: v.optional(v.string()),
  kind: v.string(),
  x: v.number(),
  y: v.number(),
  tileX: v.number(),
  tileY: v.number(),
};
export type SpawnPoint = ObjectType<typeof spawnPoint>;

const semanticZone = {
  name: v.optional(v.string()),
  kind: v.string(),
  x: v.number(),
  y: v.number(),
  width: v.number(),
  height: v.number(),
  tileX: v.number(),
  tileY: v.number(),
  tileWidth: v.number(),
  tileHeight: v.number(),
};
export type SemanticZone = ObjectType<typeof semanticZone>;

const animatedSprite = {
  x: v.number(),
  y: v.number(),
  w: v.number(),
  h: v.number(),
  layer: v.number(),
  sheet: v.string(),
  animation: v.string(),
};
export type AnimatedSprite = ObjectType<typeof animatedSprite>;

const fixedSprite = {
  url: v.string(),
  x: v.number(),
  y: v.number(),
  width: v.number(),
  height: v.number(),
  layer: v.number(),
  order: v.number(),
};
export type FixedSprite = ObjectType<typeof fixedSprite>;

export const serializedWorldMap = {
  width: v.number(),
  height: v.number(),

  tileSetUrl: v.string(),
  //  Width & height of tileset image, px.
  tileSetDimX: v.number(),
  tileSetDimY: v.number(),

  // Tile size in pixels (assume square)
  tileDim: v.number(),
  bgTiles: v.array(v.array(v.array(v.number()))),
  objectTiles: v.array(tileLayer),
  animatedSprites: v.array(v.object(animatedSprite)),
  fixedSprites: v.optional(v.array(v.object(fixedSprite))),
  visualLayers: v.optional(v.array(v.object(visualLayer))),
  collisionTiles: v.optional(tileLayer),
  aboveCharacterLayers: v.optional(v.array(v.object(aboveCharacterLayer))),
  spawnPoints: v.optional(v.array(v.object(spawnPoint))),
  semanticZones: v.optional(v.array(v.object(semanticZone))),
};
export type SerializedWorldMap = ObjectType<typeof serializedWorldMap>;

export class WorldMap {
  width: number;
  height: number;

  tileSetUrl: string;
  tileSetDimX: number;
  tileSetDimY: number;

  tileDim: number;

  bgTiles: TileLayer[];
  objectTiles: TileLayer[];
  animatedSprites: AnimatedSprite[];
  fixedSprites?: FixedSprite[];
  visualLayers?: VisualLayer[];
  collisionTiles?: TileLayer;
  aboveCharacterLayers?: AboveCharacterLayer[];
  spawnPoints?: SpawnPoint[];
  semanticZones?: SemanticZone[];

  constructor(serialized: SerializedWorldMap) {
    this.width = serialized.width;
    this.height = serialized.height;
    this.tileSetUrl = serialized.tileSetUrl;
    this.tileSetDimX = serialized.tileSetDimX;
    this.tileSetDimY = serialized.tileSetDimY;
    this.tileDim = serialized.tileDim;
    this.bgTiles = serialized.bgTiles;
    this.objectTiles = serialized.objectTiles;
    this.animatedSprites = serialized.animatedSprites;
    this.fixedSprites = serialized.fixedSprites;
    this.visualLayers = serialized.visualLayers;
    this.collisionTiles = serialized.collisionTiles;
    this.aboveCharacterLayers = serialized.aboveCharacterLayers;
    this.spawnPoints = serialized.spawnPoints;
    this.semanticZones = serialized.semanticZones;
  }

  serialize(): SerializedWorldMap {
    const serialized: SerializedWorldMap = {
      width: this.width,
      height: this.height,
      tileSetUrl: this.tileSetUrl,
      tileSetDimX: this.tileSetDimX,
      tileSetDimY: this.tileSetDimY,
      tileDim: this.tileDim,
      bgTiles: this.bgTiles,
      objectTiles: this.objectTiles,
      animatedSprites: this.animatedSprites,
    };
    if (this.fixedSprites !== undefined) {
      serialized.fixedSprites = this.fixedSprites;
    }
    if (this.visualLayers !== undefined) {
      serialized.visualLayers = this.visualLayers;
    }
    if (this.collisionTiles !== undefined) {
      serialized.collisionTiles = this.collisionTiles;
    }
    if (this.aboveCharacterLayers !== undefined) {
      serialized.aboveCharacterLayers = this.aboveCharacterLayers;
    }
    if (this.spawnPoints !== undefined) {
      serialized.spawnPoints = this.spawnPoints;
    }
    if (this.semanticZones !== undefined) {
      serialized.semanticZones = this.semanticZones;
    }
    return serialized;
  }
}
