import { ConvexError } from 'convex/values';
import {
  getDefaultEventAvatarConfig,
  normalizeEventAvatarConfig,
  normalizeEventPublicCard,
} from './eventCards';

function expectNetworkingCode(error: unknown, code: string) {
  expect(error).toMatchObject({
    data: { code },
  } satisfies Partial<ConvexError<{ code: string }>>);
}

describe('event public card validation', () => {
  test('accepts and normalizes approved public fields', () => {
    expect(
      normalizeEventPublicCard({
        role: ' Founder ',
        category: 'Climate',
        offers: [' GTM help ', 'GTM help', 'operator intros'],
        wants: ['seed investors'],
        lookingFor: 'people building in climate infrastructure',
        hobbies: ['cycling'],
        interests: ['hardware', 'energy'],
        favoriteMedia: ['The Expanse'],
      }),
    ).toEqual({
      role: 'Founder',
      category: 'Climate',
      offers: ['GTM help', 'operator intros'],
      wants: ['seed investors'],
      lookingFor: 'people building in climate infrastructure',
      hobbies: ['cycling'],
      interests: ['hardware', 'energy'],
      favoriteMedia: ['The Expanse'],
    });
  });

  test('rejects contact and real-identity public fields', () => {
    expect(() =>
      normalizeEventPublicCard({
        role: 'Founder',
        email: 'founder@example.com',
      }),
    ).toThrow(ConvexError);

    try {
      normalizeEventPublicCard({
        role: 'Founder',
        linkedin: 'https://linkedin.com/in/founder',
      });
    } catch (error) {
      expectNetworkingCode(error, 'contact_field_not_public');
    }
  });

  test('rejects sensitive demographic public fields', () => {
    try {
      normalizeEventPublicCard({
        role: 'Founder',
        ethnicity: 'not allowed',
      });
    } catch (error) {
      expectNetworkingCode(error, 'sensitive_field_not_allowed');
    }
  });

  test('rejects unknown public card fields', () => {
    try {
      normalizeEventPublicCard({
        role: 'Founder',
        favoriteColor: 'blue',
      });
    } catch (error) {
      expectNetworkingCode(error, 'invalid_public_field');
    }
  });
});

describe('event avatar validation', () => {
  test('accepts known asset ids and omits none-valued optional assets', () => {
    expect(
      normalizeEventAvatarConfig({
        hair: 'curly',
        skinTone: 'tone-3',
        clothing: 'jacket',
        hat: 'none',
        accessory: 'glasses',
      }),
    ).toEqual({
      hair: 'curly',
      skinTone: 'tone-3',
      clothing: 'jacket',
      accessory: 'glasses',
    });
  });

  test('rejects invalid avatar assets', () => {
    try {
      normalizeEventAvatarConfig({
        hair: 'laser-hair',
        skinTone: 'tone-3',
        clothing: 'jacket',
      });
    } catch (error) {
      expectNetworkingCode(error, 'invalid_avatar_asset');
    }
  });

  test('generates a stable default avatar from seed', () => {
    expect(getDefaultEventAvatarConfig('event-a:agent-a')).toEqual(
      getDefaultEventAvatarConfig('event-a:agent-a'),
    );
    expect(getDefaultEventAvatarConfig('event-a:agent-a')).toHaveProperty('hair');
  });
});
