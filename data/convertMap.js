import fs from 'fs';
import process from 'process';

// Path to the JSON file containing the map data
const mapDataPath = process.argv[2];
if (!mapDataPath) {
  throw new Error(
    'No map data path provided. Usage: node convertMap.js <mapDataPath> <assetPath> <tilesetpxw> <tilesetpxh> [outputPath]',
  );
}

// Retrieve command line arguments for asset path and dimensions
const assetPath = process.argv[3];
if (!assetPath) {
  throw new Error(
    'No asset path provided. Usage: node convertMap.js <mapDataPath> <assetPath> <tilesetpxw> <tilesetpxh> [outputPath]',
  );
}

const tilesetpxw = parseInt(process.argv[4], 10);
if (Number.isNaN(tilesetpxw)) {
  throw new Error(
    'Tileset pixel width must be a number. Usage: node convertMap.js <mapDataPath> <assetPath> <tilesetpxw> <tilesetpxh> [outputPath]',
  );
}

const tilesetpxh = parseInt(process.argv[5], 10);
if (Number.isNaN(tilesetpxh)) {
  throw new Error(
    'Tileset pixel height must be a number. Usage: node convertMap.js <mapDataPath> <assetPath> <tilesetpxw> <tilesetpxh> [outputPath]',
  );
}
const outputPath = process.argv[6] ?? 'converted-map.js';

// Read the JSON file and parse it
const tiledMapData = JSON.parse(fs.readFileSync(mapDataPath, 'utf8'));

const tileDimension = tiledMapData.tilewidth;
const width = tiledMapData.width;
const height = tiledMapData.height;
if (
  !Number.isFinite(tileDimension) ||
  !Number.isFinite(width) ||
  !Number.isFinite(height) ||
  tileDimension <= 0 ||
  width <= 0 ||
  height <= 0
) {
  throw new Error('Map file must provide positive numeric tilewidth, width, and height fields.');
}

function exportConst(name, value) {
  return `export const ${name} = ${JSON.stringify(value, null, 2)};\n\n`;
}

function parseProperties(rawProperties) {
  const properties = {};
  if (!Array.isArray(rawProperties)) {
    return properties;
  }
  for (const property of rawProperties) {
    if (!property || typeof property.name !== 'string') {
      continue;
    }
    properties[property.name] = property.value;
  }
  return properties;
}

function toNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function toOptionalString(value) {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

const TILED_FLIP_MASK = 0x1fffffff;

function tiledGidToTileIndex(gid) {
  if (typeof gid !== 'number' || gid <= 0) {
    return -1;
  }
  return (gid & TILED_FLIP_MASK) - 1;
}

function createEmptyTileGrid(mapWidth, mapHeight) {
  return Array.from({ length: mapWidth }, () => Array(mapHeight).fill(-1));
}

function writeLayerDataIntoGrid(
  grid,
  rawData,
  sourceWidth,
  sourceHeight,
  offsetX = 0,
  offsetY = 0,
) {
  if (!Array.isArray(rawData) || !Number.isFinite(sourceWidth) || !Number.isFinite(sourceHeight)) {
    return;
  }
  for (let y = 0; y < sourceHeight; y++) {
    for (let x = 0; x < sourceWidth; x++) {
      const mapX = offsetX + x;
      const mapY = offsetY + y;
      if (mapX < 0 || mapX >= width || mapY < 0 || mapY >= height) {
        continue;
      }
      const gid = rawData[y * sourceWidth + x];
      grid[mapX][mapY] = tiledGidToTileIndex(gid);
    }
  }
}

function convertTileLayerToGrid(layer) {
  const grid = createEmptyTileGrid(width, height);
  if (Array.isArray(layer.data)) {
    const layerWidth = Number.isFinite(layer.width) ? layer.width : width;
    const layerHeight = Number.isFinite(layer.height) ? layer.height : height;
    const offsetX = Number.isFinite(layer.x) ? layer.x : 0;
    const offsetY = Number.isFinite(layer.y) ? layer.y : 0;
    writeLayerDataIntoGrid(grid, layer.data, layerWidth, layerHeight, offsetX, offsetY);
  }
  if (Array.isArray(layer.chunks)) {
    for (const chunk of layer.chunks) {
      if (!chunk) {
        continue;
      }
      const chunkWidth = Number.isFinite(chunk.width) ? chunk.width : 0;
      const chunkHeight = Number.isFinite(chunk.height) ? chunk.height : 0;
      const chunkX = Number.isFinite(chunk.x) ? chunk.x : 0;
      const chunkY = Number.isFinite(chunk.y) ? chunk.y : 0;
      writeLayerDataIntoGrid(grid, chunk.data, chunkWidth, chunkHeight, chunkX, chunkY);
    }
  }
  return grid;
}

function readLayerRole(layer, properties) {
  const fromProperties = properties.role ?? properties.layerRole ?? properties.layer_role;
  return toOptionalString(fromProperties) ?? toOptionalString(layer.class);
}

function flattenLayers(layers, inheritedRole) {
  const flattened = [];
  for (const layer of layers ?? []) {
    if (!layer) {
      continue;
    }
    const layerProperties = parseProperties(layer.properties);
    const ownRole = readLayerRole(layer, layerProperties);
    const effectiveRole = ownRole ?? inheritedRole;
    if (layer.type === 'group') {
      flattened.push(...flattenLayers(layer.layers, effectiveRole));
      continue;
    }
    flattened.push({ layer, inheritedRole: effectiveRole });
  }
  return flattened;
}

function normalizeVisualLayerRole(rawRole) {
  const normalized = toOptionalString(rawRole)
    ?.toLowerCase()
    .replace(/[\s_-]/g, '');
  if (!normalized) {
    return null;
  }
  if (['background', 'bg', 'ground', 'floor', 'terrain'].includes(normalized)) {
    return 'background';
  }
  if (['object', 'objects', 'prop', 'props', 'decor', 'decoration'].includes(normalized)) {
    return 'object';
  }
  if (['abovecharacter', 'overlay', 'foreground', 'roof', 'canopy'].includes(normalized)) {
    return 'aboveCharacter';
  }
  if (
    [
      'collision',
      'collisions',
      'blocked',
      'blocking',
      'obstacle',
      'obstacles',
      'wall',
      'walls',
    ].includes(normalized)
  ) {
    return 'collision';
  }
  return null;
}

function normalizeObjectGroupRole(rawRole) {
  const normalized = toOptionalString(rawRole)
    ?.toLowerCase()
    .replace(/[\s_-]/g, '');
  if (!normalized) {
    return null;
  }
  if (['spawn', 'spawnpoint', 'spawnpoints', 'spawns'].includes(normalized)) {
    return 'spawnPoints';
  }
  if (['semanticzone', 'semanticzones', 'zone', 'zones'].includes(normalized)) {
    return 'semanticZones';
  }
  if (['animatedsprite', 'animatedsprites', 'animation', 'animations'].includes(normalized)) {
    return 'animatedSprites';
  }
  return null;
}

function resolveVisualLayerRole(layer, rawRole) {
  const explicit = normalizeVisualLayerRole(rawRole);
  if (explicit) {
    return explicit;
  }
  const normalizedName = String(layer.name ?? '').toLowerCase();
  if (
    normalizedName.includes('collision') ||
    normalizedName.includes('blocked') ||
    normalizedName.includes('obstacle')
  ) {
    return 'collision';
  }
  if (
    normalizedName.includes('above') ||
    normalizedName.includes('overlay') ||
    normalizedName.includes('roof') ||
    normalizedName.includes('foreground')
  ) {
    return 'aboveCharacter';
  }
  return 'object';
}

function resolveObjectGroupRole(layer, rawRole) {
  const explicit = normalizeObjectGroupRole(rawRole);
  if (explicit) {
    return explicit;
  }
  const normalizedName = String(layer.name ?? '').toLowerCase();
  if (normalizedName.includes('spawn')) {
    return 'spawnPoints';
  }
  if (normalizedName.includes('semantic') || normalizedName.includes('zone')) {
    return 'semanticZones';
  }
  if (normalizedName.includes('anim')) {
    return 'animatedSprites';
  }
  return null;
}

function mergeCollisionLayers(collisionLayers) {
  if (collisionLayers.length === 0) {
    return undefined;
  }
  const merged = createEmptyTileGrid(width, height);
  for (const collisionLayer of collisionLayers) {
    for (let x = 0; x < width; x++) {
      for (let y = 0; y < height; y++) {
        if (collisionLayer[x][y] !== -1) {
          merged[x][y] = collisionLayer[x][y];
        }
      }
    }
  }
  return merged;
}

function tileXFromPixels(xPx) {
  return Math.floor(xPx / tileDimension);
}

function tileYFromPixels(yPx) {
  return Math.floor(yPx / tileDimension);
}

const visualLayers = [];
const aboveCharacterLayers = [];
const collisionLayerCandidates = [];
const spawnPoints = [];
const semanticZones = [];
const animatedSprites = [];

const allLayers = flattenLayers(tiledMapData.layers);
for (const { layer, inheritedRole } of allLayers) {
  const layerProperties = parseProperties(layer.properties);
  const rawRole = readLayerRole(layer, layerProperties) ?? inheritedRole;
  if (layer.type === 'tilelayer') {
    const tiles = convertTileLayerToGrid(layer);
    const role = resolveVisualLayerRole(layer, rawRole);
    if (role === 'collision') {
      collisionLayerCandidates.push(tiles);
      continue;
    }
    const visualLayer = {
      name: toOptionalString(layer.name) ?? `tileLayer${visualLayers.length}`,
      role,
      tiles,
    };
    visualLayers.push(visualLayer);
    if (role === 'aboveCharacter') {
      aboveCharacterLayers.push(visualLayer);
    }
    continue;
  }
  if (layer.type !== 'objectgroup') {
    continue;
  }
  const objectGroupRole = resolveObjectGroupRole(layer, rawRole);
  if (!objectGroupRole) {
    continue;
  }
  for (const object of layer.objects ?? []) {
    const objectProperties = parseProperties(object.properties);
    const objectName = toOptionalString(object.name);
    const x = toNumber(object.x, 0);
    const y = toNumber(object.y, 0);
    if (objectGroupRole === 'spawnPoints') {
      const kind =
        toOptionalString(objectProperties.kind) ??
        toOptionalString(objectProperties.spawnType) ??
        toOptionalString(object.type) ??
        toOptionalString(object.class) ??
        'default';
      const spawnPoint = {
        kind,
        x,
        y,
        tileX: tileXFromPixels(x),
        tileY: tileYFromPixels(y),
      };
      if (objectName) {
        spawnPoint.name = objectName;
      }
      spawnPoints.push(spawnPoint);
      continue;
    }
    if (objectGroupRole === 'semanticZones') {
      const widthPx = Math.max(toNumber(object.width, tileDimension), tileDimension);
      const heightPx = Math.max(toNumber(object.height, tileDimension), tileDimension);
      const kind =
        toOptionalString(objectProperties.kind) ??
        toOptionalString(objectProperties.zoneType) ??
        toOptionalString(object.type) ??
        toOptionalString(object.class) ??
        'zone';
      const semanticZone = {
        kind,
        x,
        y,
        width: widthPx,
        height: heightPx,
        tileX: tileXFromPixels(x),
        tileY: tileYFromPixels(y),
        tileWidth: Math.max(1, Math.ceil(widthPx / tileDimension)),
        tileHeight: Math.max(1, Math.ceil(heightPx / tileDimension)),
      };
      if (objectName) {
        semanticZone.name = objectName;
      }
      semanticZones.push(semanticZone);
      continue;
    }
    if (objectGroupRole === 'animatedSprites') {
      const sheet =
        toOptionalString(objectProperties.sheet) ?? toOptionalString(objectProperties.spritesheet);
      const animation =
        toOptionalString(objectProperties.animation) ?? toOptionalString(objectProperties.clip);
      if (!sheet || !animation) {
        continue;
      }
      const spriteWidth = Math.max(toNumber(object.width, tileDimension), tileDimension);
      const spriteHeight = Math.max(toNumber(object.height, tileDimension), tileDimension);
      animatedSprites.push({
        x,
        y,
        w: spriteWidth,
        h: spriteHeight,
        layer: toNumber(objectProperties.layer, 1),
        sheet,
        animation,
      });
    }
  }
}

const collisionTiles = mergeCollisionLayers(collisionLayerCandidates);
let bgTiles = visualLayers
  .filter((layer) => layer.role === 'background')
  .map((layer) => layer.tiles);
if (bgTiles.length === 0) {
  throw new Error('Map must include at least one background tile layer for bgtiles.');
}
const objectTiles = visualLayers
  .filter((layer) => layer.role === 'object')
  .map((layer) => layer.tiles);

let jsContent = '// Map generated by convertMap.js\n\n';
jsContent += `export const tilesetpath = ${JSON.stringify(assetPath)};\n`;
jsContent += `export const tiledim = ${tileDimension};\n`;
jsContent += `export const screenxtiles = ${width};\n`;
jsContent += `export const screenytiles = ${height};\n`;
jsContent += `export const tilesetpxw = ${tilesetpxw};\n`;
jsContent += `export const tilesetpxh = ${tilesetpxh};\n\n`;
jsContent += exportConst('bgtiles', bgTiles);
jsContent += exportConst('objmap', objectTiles);
jsContent += exportConst('animatedsprites', animatedSprites);
jsContent += "/** @type {import('../convex/aiTown/worldMap').VisualLayer[]} */\n";
jsContent += exportConst('visualLayers', visualLayers);
if (collisionTiles !== undefined) {
  jsContent += exportConst('collisionTiles', collisionTiles);
} else {
  jsContent += 'export const collisionTiles = undefined;\n\n';
}
jsContent += "/** @type {import('../convex/aiTown/worldMap').AboveCharacterLayer[]} */\n";
jsContent += exportConst('aboveCharacterLayers', aboveCharacterLayers);
jsContent += exportConst('spawnPoints', spawnPoints);
jsContent += exportConst('semanticZones', semanticZones);
jsContent += `export const mapwidth = ${width};\n`;
jsContent += `export const mapheight = ${height};\n\n`;
jsContent += `export const serializedWorldMap = {
  width: mapwidth,
  height: mapheight,
  tileSetUrl: tilesetpath,
  tileSetDimX: tilesetpxw,
  tileSetDimY: tilesetpxh,
  tileDim: tiledim,
  bgTiles: bgtiles,
  objectTiles: objmap,
  animatedSprites: animatedsprites,
  ...(visualLayers.length > 0 ? { visualLayers } : {}),
  ...(collisionTiles ? { collisionTiles } : {}),
  ...(aboveCharacterLayers.length > 0 ? { aboveCharacterLayers } : {}),
  ...(spawnPoints.length > 0 ? { spawnPoints } : {}),
  ...(semanticZones.length > 0 ? { semanticZones } : {}),
};\n`;

fs.writeFileSync(outputPath, jsContent);

console.log(`Map conversion and JS module creation complete: ${outputPath}`);
