import { Doc, Id } from '../_generated/dataModel';
import { networkingError } from './auth';
import {
  MAX_EVENT_PUBLIC_LIST_ITEMS,
  MAX_EVENT_PUBLIC_TEXT_LENGTH,
  eventAvatarCategories,
  eventContactFieldNames,
  eventPublicCardFieldNames,
  eventSensitiveFieldNames,
} from './validators';

export type EventAvatarConfig = {
  hair: string;
  skinTone: string;
  clothing: string;
  hat?: string;
  accessory?: string;
};

export type EventPublicCard = {
  role?: string;
  category?: string;
  offers: string[];
  wants: string[];
  lookingFor?: string;
  hobbies: string[];
  interests: string[];
  favoriteMedia: string[];
};

export type EventPublicCardView = {
  id: Id<'eventNetworkingCards'>;
  eventId: string;
  eventAgentId: Id<'eventAgents'>;
  displayName: string;
  avatarConfig: EventAvatarConfig;
  publicCard: EventPublicCard;
  approvedAt?: number;
  updatedAt: number;
};

type PublicCardInput = Record<string, unknown>;

const REQUIRED_AVATAR_CATEGORIES = ['hair', 'skinTone', 'clothing'] as const;

const ALLOWED_AVATAR_ASSET_IDS: Record<keyof EventAvatarConfig, readonly string[]> = {
  hair: ['short', 'curly', 'braids', 'waves', 'buzz'],
  skinTone: ['tone-1', 'tone-2', 'tone-3', 'tone-4', 'tone-5'],
  clothing: ['jacket', 'hoodie', 'blazer', 'sweater', 'tee'],
  hat: ['none', 'cap', 'beanie'],
  accessory: ['none', 'glasses', 'earpiece'],
};

export function normalizeEventPublicCard(input: unknown): EventPublicCard {
  if (!isPlainRecord(input)) {
    throw networkingError('invalid_public_field', 'publicCard must be an object.');
  }

  for (const fieldName of Object.keys(input)) {
    if (isContactField(fieldName)) {
      throw networkingError(
        'contact_field_not_public',
        `${fieldName} cannot be included in the public event card.`,
      );
    }
    if (isSensitiveField(fieldName)) {
      throw networkingError(
        'sensitive_field_not_allowed',
        `${fieldName} cannot be included in the public event card.`,
      );
    }
    if (!eventPublicCardFieldNames.includes(fieldName as any)) {
      throw networkingError(
        'invalid_public_field',
        `${fieldName} is not an allowed public event card field.`,
      );
    }
  }

  const card = {
    role: optionalText(input.role, 'role'),
    category: optionalText(input.category, 'category'),
    offers: optionalTextList(input.offers, 'offers'),
    wants: optionalTextList(input.wants, 'wants'),
    lookingFor: optionalText(input.lookingFor, 'lookingFor'),
    hobbies: optionalTextList(input.hobbies, 'hobbies'),
    interests: optionalTextList(input.interests, 'interests'),
    favoriteMedia: optionalTextList(input.favoriteMedia, 'favoriteMedia'),
  };

  if (
    !card.role &&
    !card.category &&
    !card.lookingFor &&
    card.offers.length === 0 &&
    card.wants.length === 0 &&
    card.hobbies.length === 0 &&
    card.interests.length === 0 &&
    card.favoriteMedia.length === 0
  ) {
    throw networkingError(
      'invalid_public_field',
      'publicCard must include at least one approved public field.',
    );
  }

  return card;
}

export function normalizeEventAvatarConfig(input: unknown): EventAvatarConfig {
  if (!isPlainRecord(input)) {
    throw networkingError('invalid_avatar_asset', 'avatarConfig must be an object.');
  }

  for (const fieldName of Object.keys(input)) {
    if (!eventAvatarCategories.includes(fieldName as any)) {
      throw networkingError(
        'invalid_avatar_asset',
        `${fieldName} is not an allowed avatar category.`,
      );
    }
  }

  const avatarConfig = {
    hair: requireAvatarAsset(input.hair, 'hair'),
    skinTone: requireAvatarAsset(input.skinTone, 'skinTone'),
    clothing: requireAvatarAsset(input.clothing, 'clothing'),
    hat: optionalAvatarAsset(input.hat, 'hat'),
    accessory: optionalAvatarAsset(input.accessory, 'accessory'),
  };

  return {
    hair: avatarConfig.hair,
    skinTone: avatarConfig.skinTone,
    clothing: avatarConfig.clothing,
    ...(avatarConfig.hat && avatarConfig.hat !== 'none' ? { hat: avatarConfig.hat } : {}),
    ...(avatarConfig.accessory && avatarConfig.accessory !== 'none'
      ? { accessory: avatarConfig.accessory }
      : {}),
  };
}

export function getDefaultEventAvatarConfig(seed: string): EventAvatarConfig {
  return {
    hair: pickSeededAsset('hair', seed),
    skinTone: pickSeededAsset('skinTone', seed),
    clothing: pickSeededAsset('clothing', seed),
  };
}

export function toEventPublicCardView(
  agent: Doc<'eventAgents'>,
  card: Doc<'eventNetworkingCards'>,
): EventPublicCardView {
  return {
    id: card._id,
    eventId: card.eventId,
    eventAgentId: agent._id,
    displayName: agent.displayName,
    avatarConfig: agent.avatarConfig,
    publicCard: card.publicCard,
    approvedAt: card.approvedAt,
    updatedAt: Math.max(agent.updatedAt, card.updatedAt),
  };
}

function optionalText(value: unknown, fieldName: string) {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'string') {
    throw networkingError('invalid_public_field', `${fieldName} must be a string when provided.`);
  }
  const normalized = value.trim();
  if (!normalized) {
    return undefined;
  }
  if (normalized.length > MAX_EVENT_PUBLIC_TEXT_LENGTH) {
    throw networkingError(
      'invalid_public_field',
      `${fieldName} must be ${MAX_EVENT_PUBLIC_TEXT_LENGTH} characters or fewer.`,
    );
  }
  return normalized;
}

function optionalTextList(value: unknown, fieldName: string) {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw networkingError(
      'invalid_public_field',
      `${fieldName} must be an array of strings when provided.`,
    );
  }
  if (value.length > MAX_EVENT_PUBLIC_LIST_ITEMS) {
    throw networkingError(
      'invalid_public_field',
      `${fieldName} can include at most ${MAX_EVENT_PUBLIC_LIST_ITEMS} items.`,
    );
  }
  const normalized = value
    .map((item) => {
      if (typeof item !== 'string') {
        throw networkingError('invalid_public_field', `${fieldName} must contain only strings.`);
      }
      return item.trim();
    })
    .filter(Boolean);

  for (const item of normalized) {
    if (item.length > MAX_EVENT_PUBLIC_TEXT_LENGTH) {
      throw networkingError(
        'invalid_public_field',
        `${fieldName} items must be ${MAX_EVENT_PUBLIC_TEXT_LENGTH} characters or fewer.`,
      );
    }
  }

  return Array.from(new Set(normalized));
}

function requireAvatarAsset(value: unknown, category: (typeof REQUIRED_AVATAR_CATEGORIES)[number]) {
  const assetId = optionalAvatarAsset(value, category);
  if (!assetId) {
    throw networkingError('invalid_avatar_asset', `${category} avatar asset is required.`);
  }
  return assetId;
}

function optionalAvatarAsset(value: unknown, category: keyof EventAvatarConfig) {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'string') {
    throw networkingError('invalid_avatar_asset', `${category} avatar asset must be a string.`);
  }
  const assetId = value.trim();
  if (!ALLOWED_AVATAR_ASSET_IDS[category].includes(assetId)) {
    throw networkingError('invalid_avatar_asset', `${assetId} is not an allowed ${category} asset.`);
  }
  return assetId;
}

function pickSeededAsset(category: keyof EventAvatarConfig, seed: string) {
  const ids = ALLOWED_AVATAR_ASSET_IDS[category].filter((assetId) => assetId !== 'none');
  let hash = 0;
  for (const char of `${category}:${seed}`) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return ids[hash % ids.length];
}

function isPlainRecord(value: unknown): value is PublicCardInput {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isContactField(fieldName: string) {
  return eventContactFieldNames.includes(fieldName as any);
}

function isSensitiveField(fieldName: string) {
  return eventSensitiveFieldNames.includes(fieldName as any);
}
