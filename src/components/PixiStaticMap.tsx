import { PixiComponent, applyDefaultProps } from '@pixi/react';
import * as PIXI from 'pixi.js';
import { AnimatedSprite, WorldMap } from '../../convex/aiTown/worldMap';
import * as campfire from '../../data/animations/campfire.json';
import * as gentlesparkle from '../../data/animations/gentlesparkle.json';
import * as gentlewaterfall from '../../data/animations/gentlewaterfall.json';
import * as gentlesplash from '../../data/animations/gentlesplash.json';
import * as windmill from '../../data/animations/windmill.json';
import {
  areLayerCollectionsEquivalent,
  didMapRenderGeometryChange,
  getBelowCharacterLayers,
  renderTileLayers,
} from './PixiMapLayer.tsx';

const animations = {
  'campfire.json': { spritesheet: campfire, url: '/ai-town/assets/spritesheets/campfire.png' },
  'gentlesparkle.json': {
    spritesheet: gentlesparkle,
    url: '/ai-town/assets/spritesheets/gentlesparkle32.png',
  },
  'gentlewaterfall.json': {
    spritesheet: gentlewaterfall,
    url: '/ai-town/assets/spritesheets/gentlewaterfall32.png',
  },
  'windmill.json': { spritesheet: windmill, url: '/ai-town/assets/spritesheets/windmill.png' },
  'gentlesplash.json': {
    spritesheet: gentlesplash,
    url: '/ai-town/assets/spritesheets/gentlewaterfall32.png',
  },
};

const toSheetCandidates = (sheet: string): string[] => {
  const normalizedSheet = sheet.split('/').pop()?.split('?')[0] ?? sheet;
  const withoutExtension = normalizedSheet.replace(/\.(json|png)$/i, '');
  return Array.from(
    new Set([sheet, normalizedSheet, withoutExtension, `${withoutExtension}.json`]),
  );
};

const resolveAnimationReference = (
  sheet: string,
): { spritesheet: any; url: string } | undefined => {
  const entries = animations as Record<string, { spritesheet: any; url: string }>;
  for (const candidate of toSheetCandidates(sheet)) {
    const animation = entries[candidate];
    if (animation) {
      return animation;
    }
  }
  return undefined;
};

type StaticMapContainer = PIXI.Container & {
  _tileLayerContainer: PIXI.Container;
  _animatedLayerContainer: PIXI.Container;
  _animationGeneration: number;
};

const applyMapHitArea = (container: PIXI.Container, map: WorldMap): void => {
  container.interactive = true;
  container.hitArea = new PIXI.Rectangle(0, 0, map.width * map.tileDim, map.height * map.tileDim);
};

const renderAnimatedSprites = (container: StaticMapContainer, map: WorldMap): void => {
  container._animationGeneration += 1;
  const generation = container._animationGeneration;
  container._animatedLayerContainer.removeChildren();

  const spritesBySheet = new Map<string, AnimatedSprite[]>();
  for (const sprite of map.animatedSprites) {
    const sheet = sprite.sheet;
    if (!spritesBySheet.has(sheet)) {
      spritesBySheet.set(sheet, []);
    }
    spritesBySheet.get(sheet)!.push(sprite);
  }

  for (const [sheet, sprites] of spritesBySheet.entries()) {
    const animation = resolveAnimationReference(sheet);
    if (!animation) {
      console.error('Could not find animation', sheet);
      continue;
    }
    const { spritesheet, url } = animation;
    const texture = PIXI.BaseTexture.from(url, {
      scaleMode: PIXI.SCALE_MODES.NEAREST,
    });
    const spriteSheet = new PIXI.Spritesheet(texture, spritesheet);
    spriteSheet.parse().then(() => {
      if (container._animationGeneration !== generation) {
        return;
      }

      for (const sprite of sprites) {
        const pixiAnimation = spriteSheet.animations[sprite.animation];
        if (!pixiAnimation) {
          console.error('Failed to load animation', sprite);
          continue;
        }
        const pixiSprite = new PIXI.AnimatedSprite(pixiAnimation);
        pixiSprite.animationSpeed = 0.1;
        pixiSprite.autoUpdate = true;
        pixiSprite.x = sprite.x;
        pixiSprite.y = sprite.y;
        pixiSprite.width = sprite.w;
        pixiSprite.height = sprite.h;
        container._animatedLayerContainer.addChild(pixiSprite);
        pixiSprite.play();
      }
    });
  }
};

const syncStaticMap = (container: StaticMapContainer, map: WorldMap): void => {
  renderTileLayers(container._tileLayerContainer, map, getBelowCharacterLayers(map));
  renderAnimatedSprites(container, map);
  applyMapHitArea(container, map);
};

const areAnimatedSpritesEquivalent = (
  first: AnimatedSprite[],
  second: AnimatedSprite[],
): boolean => {
  if (first === second) {
    return true;
  }
  if (first.length !== second.length) {
    return false;
  }

  for (let i = 0; i < first.length; i++) {
    const firstSprite = first[i];
    const secondSprite = second[i];
    if (
      firstSprite.x !== secondSprite.x ||
      firstSprite.y !== secondSprite.y ||
      firstSprite.w !== secondSprite.w ||
      firstSprite.h !== secondSprite.h ||
      firstSprite.layer !== secondSprite.layer ||
      firstSprite.sheet !== secondSprite.sheet ||
      firstSprite.animation !== secondSprite.animation
    ) {
      return false;
    }
  }
  return true;
};

const shouldSyncStaticMap = (previous: WorldMap, next: WorldMap): boolean =>
  didMapRenderGeometryChange(previous, next) ||
  !areLayerCollectionsEquivalent(
    getBelowCharacterLayers(previous),
    getBelowCharacterLayers(next),
  ) ||
  !areAnimatedSpritesEquivalent(previous.animatedSprites, next.animatedSprites);

export const PixiStaticMap = PixiComponent('StaticMap', {
  create: (props: { map: WorldMap; [k: string]: any }) => {
    const map = props.map;
    const container = new PIXI.Container() as StaticMapContainer;
    container._tileLayerContainer = new PIXI.Container();
    container._animatedLayerContainer = new PIXI.Container();
    container._animationGeneration = 0;

    container.addChild(container._tileLayerContainer);
    container.addChild(container._animatedLayerContainer);
    syncStaticMap(container, map);

    container.x = 0;
    container.y = 0;

    return container;
  },

  applyProps: (instance, oldProps, newProps) => {
    if (!oldProps.map || shouldSyncStaticMap(oldProps.map, newProps.map)) {
      syncStaticMap(instance as StaticMapContainer, newProps.map);
    }
    applyDefaultProps(instance, oldProps, newProps);
  },
});
