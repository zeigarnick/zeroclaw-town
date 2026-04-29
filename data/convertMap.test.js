import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { pathToFileURL } from 'url';
import { describe, expect, test } from '@jest/globals';

function tiledProperty(name, value) {
  return { name, type: 'string', value };
}

async function convertFixture(fixture) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'convert-map-'));
  const fixturePath = path.join(tmpDir, 'fixture.tmj');
  const outputPath = path.join(tmpDir, 'fixture-map.mjs');
  fs.writeFileSync(fixturePath, JSON.stringify(fixture));

  execFileSync(
    'node',
    [
      path.resolve('data/convertMap.js'),
      fixturePath,
      '/ai-town/assets/founder-village/test.png',
      '64',
      '64',
      outputPath,
    ],
    { cwd: path.resolve('.') },
  );

  return import(pathToFileURL(outputPath).href);
}

describe('convertMap', () => {
  test('preserves expanded map semantics while keeping legacy exports', async () => {
    const flippedGid = 0x80000000 + 2;
    const module = await convertFixture({
      width: 2,
      height: 2,
      tilewidth: 32,
      tileheight: 32,
      layers: [
        {
          name: 'Ground',
          type: 'tilelayer',
          width: 2,
          height: 2,
          data: [1, flippedGid, 0, 1],
          properties: [tiledProperty('role', 'background')],
        },
        {
          name: 'Collision Group',
          type: 'group',
          properties: [tiledProperty('role', 'collision')],
          layers: [
            {
              name: 'Cafe Walls',
              type: 'tilelayer',
              width: 2,
              height: 2,
              data: [0, 3, 0, 0],
            },
          ],
        },
        {
          name: 'Props',
          type: 'tilelayer',
          width: 2,
          height: 2,
          data: [0, 0, 4, 0],
          properties: [tiledProperty('role', 'object')],
        },
        {
          name: 'Roof',
          type: 'tilelayer',
          width: 2,
          height: 2,
          data: [0, 0, 0, 5],
          properties: [tiledProperty('role', 'aboveCharacter')],
        },
        {
          name: 'Spawn Group',
          type: 'group',
          properties: [tiledProperty('role', 'spawnPoints')],
          layers: [
            {
              name: 'Entrances',
              type: 'objectgroup',
              objects: [
                { name: 'front-door', x: 32, y: 0, properties: [tiledProperty('kind', 'entry')] },
              ],
            },
          ],
        },
        {
          name: 'Zones',
          type: 'objectgroup',
          properties: [tiledProperty('role', 'semanticZones')],
          objects: [
            {
              name: 'coffee-chat',
              x: 0,
              y: 32,
              width: 64,
              height: 32,
              properties: [tiledProperty('kind', 'conversation')],
            },
          ],
        },
        {
          name: 'Animated Props',
          type: 'objectgroup',
          properties: [tiledProperty('role', 'animatedSprites')],
          objects: [
            {
              x: 32,
              y: 32,
              width: 32,
              height: 32,
              properties: [
                tiledProperty('sheet', 'founder-cafe-sign.json'),
                tiledProperty('animation', 'glow'),
              ],
            },
          ],
        },
      ],
    });

    expect(module.bgtiles[0][1][0]).toBe(1);
    expect(module.collisionTiles[1][0]).toBe(2);
    expect(module.objmap).toHaveLength(1);
    expect(module.aboveCharacterLayers).toHaveLength(1);
    expect(module.spawnPoints).toEqual([
      { name: 'front-door', kind: 'entry', x: 32, y: 0, tileX: 1, tileY: 0 },
    ]);
    expect(module.semanticZones[0]).toMatchObject({
      name: 'coffee-chat',
      kind: 'conversation',
      tileX: 0,
      tileY: 1,
      tileWidth: 2,
      tileHeight: 1,
    });
    expect(module.animatedsprites[0]).toMatchObject({
      sheet: 'founder-cafe-sign.json',
      animation: 'glow',
    });
    expect(module.serializedWorldMap.visualLayers).toHaveLength(3);
    expect(module.serializedWorldMap.collisionTiles[1][0]).toBe(2);
  });

  test('rejects maps without an explicit background tile layer', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'convert-map-'));
    const fixturePath = path.join(tmpDir, 'fixture.tmj');
    const outputPath = path.join(tmpDir, 'fixture-map.mjs');
    fs.writeFileSync(
      fixturePath,
      JSON.stringify({
        width: 1,
        height: 1,
        tilewidth: 32,
        tileheight: 32,
        layers: [
          {
            name: 'Props',
            type: 'tilelayer',
            width: 1,
            height: 1,
            data: [1],
            properties: [tiledProperty('role', 'object')],
          },
        ],
      }),
    );

    expect(() =>
      execFileSync(
        'node',
        [
          path.resolve('data/convertMap.js'),
          fixturePath,
          '/ai-town/assets/founder-village/test.png',
          '64',
          '64',
          outputPath,
        ],
        { cwd: path.resolve('.'), stdio: 'pipe' },
      ),
    ).toThrow(/background tile layer/);
  });

  test('converts fixed sprite object groups into serialized map data', async () => {
    const module = await convertFixture({
      width: 2,
      height: 2,
      tilewidth: 32,
      tileheight: 32,
      layers: [
        {
          name: 'Ground',
          type: 'tilelayer',
          width: 2,
          height: 2,
          data: [1, 1, 1, 1],
          properties: [tiledProperty('role', 'background')],
        },
        {
          name: 'Fixed Sprites',
          type: 'objectgroup',
          properties: [tiledProperty('role', 'fixedSprites')],
          objects: [
            {
              name: 'ferry',
              x: 16,
              y: 24,
              width: 96,
              height: 64,
              properties: [
                tiledProperty('url', '/ai-town/assets/clawport-terminal/ferry.png'),
                tiledProperty('layer', '2'),
                tiledProperty('order', '10'),
              ],
            },
            {
              name: 'missing-url',
              x: 0,
              y: 0,
              width: 32,
              height: 32,
              properties: [tiledProperty('layer', '3')],
            },
          ],
        },
      ],
    });

    expect(module.fixedSprites).toEqual([
      {
        url: '/ai-town/assets/clawport-terminal/ferry.png',
        x: 16,
        y: 24,
        width: 96,
        height: 64,
        layer: 2,
        order: 10,
      },
    ]);
    expect(module.serializedWorldMap.fixedSprites).toEqual(module.fixedSprites);
  });

  test('does not infer background role from layer names', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'convert-map-'));
    const fixturePath = path.join(tmpDir, 'fixture.tmj');
    const outputPath = path.join(tmpDir, 'fixture-map.mjs');
    fs.writeFileSync(
      fixturePath,
      JSON.stringify({
        width: 1,
        height: 1,
        tilewidth: 32,
        tileheight: 32,
        layers: [
          {
            name: 'Ground',
            type: 'tilelayer',
            width: 1,
            height: 1,
            data: [1],
          },
        ],
      }),
    );

    expect(() =>
      execFileSync(
        'node',
        [
          path.resolve('data/convertMap.js'),
          fixturePath,
          '/ai-town/assets/founder-village/test.png',
          '64',
          '64',
          outputPath,
        ],
        { cwd: path.resolve('.'), stdio: 'pipe' },
      ),
    ).toThrow(/background tile layer/);
  });
});
