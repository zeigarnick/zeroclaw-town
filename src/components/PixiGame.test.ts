import { jest } from '@jest/globals';
import { beginMapNavigationPointer, shouldCompleteMapNavigationPointer } from './pixiMapNavigation';

describe('PixiGame map navigation pointer gating', () => {
  test('does not navigate for a marker-originated pointerup without map pointerdown', () => {
    const moveTo = jest.fn();
    const shouldNavigate = shouldCompleteMapNavigationPointer(null, {
      screenX: 100,
      screenY: 100,
      pointerId: 1,
    });

    if (shouldNavigate) {
      moveTo();
    }

    expect(shouldNavigate).toBe(false);
    expect(moveTo).not.toHaveBeenCalled();
  });

  test('does not navigate when a stale map pointerdown has a different pointer id', () => {
    const moveTo = jest.fn();
    const pointerStart = beginMapNavigationPointer({
      screenX: 100,
      screenY: 100,
      pointerId: 1,
    });
    const shouldNavigate = shouldCompleteMapNavigationPointer(pointerStart, {
      screenX: 100,
      screenY: 100,
      pointerId: 2,
    });

    if (shouldNavigate) {
      moveTo();
    }

    expect(shouldNavigate).toBe(false);
    expect(moveTo).not.toHaveBeenCalled();
  });

  test('allows matching map pointerdown and pointerup with click-distance movement', () => {
    const pointerStart = beginMapNavigationPointer({
      screenX: 100,
      screenY: 100,
      pointerId: 1,
    });

    expect(
      shouldCompleteMapNavigationPointer(pointerStart, {
        screenX: 104,
        screenY: 105,
        pointerId: 1,
      }),
    ).toBe(true);
  });
});
