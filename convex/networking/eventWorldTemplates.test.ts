import { ConvexError } from 'convex/values';
import {
  DEFAULT_EVENT_WORLD_TEMPLATE_ID,
  eventWorldTemplates,
  isEventWorldTemplateId,
  resolveEventWorldTemplate,
} from './eventWorldTemplates';

describe('event world templates', () => {
  test('resolves the default Clawport Terminal template', () => {
    const template = resolveEventWorldTemplate();

    expect(template.id).toBe(DEFAULT_EVENT_WORLD_TEMPLATE_ID);
    expect(template.displayName).toBe('Clawport Terminal');
    expect(template.mapModule.serializedWorldMap).toMatchObject({
      width: 46,
      height: 34,
      tileSetUrl: '/ai-town/assets/clawport-terminal/empty-tileset.png',
    });
    expect(template.mapModule.serializedWorldMap.fixedSprites).toContainEqual(
      expect.objectContaining({
        url: '/ai-town/assets/clawport-terminal/background.png',
        width: 1472,
        height: 1088,
      }),
    );
  });

  test('exposes typed catalog metadata', () => {
    expect(eventWorldTemplates).toHaveLength(1);
    expect(eventWorldTemplates[0]).toMatchObject({
      id: 'clawport-terminal',
      metadata: {
        theme: 'terminal-harbor',
        recommendedUse: 'default-event-networking',
      },
    });
    expect(isEventWorldTemplateId('clawport-terminal')).toBe(true);
    expect(isEventWorldTemplateId('unknown-terminal')).toBe(false);
  });

  test('rejects unknown template ids defensively at runtime', () => {
    expect(() => resolveEventWorldTemplate('unknown-terminal' as any)).toThrow(
      ConvexError,
    );
  });
});
