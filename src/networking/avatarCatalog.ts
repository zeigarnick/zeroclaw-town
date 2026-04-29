export type EventAvatarCategory = 'hair' | 'skinTone' | 'clothing' | 'hat' | 'accessory';

export type EventAvatarAsset = {
  category: EventAvatarCategory;
  id: string;
  label: string;
};

export const EVENT_AVATAR_CATALOG: Record<EventAvatarCategory, EventAvatarAsset[]> = {
  hair: [
    { category: 'hair', id: 'short', label: 'Short' },
    { category: 'hair', id: 'curly', label: 'Curly' },
    { category: 'hair', id: 'braids', label: 'Braids' },
    { category: 'hair', id: 'waves', label: 'Waves' },
    { category: 'hair', id: 'buzz', label: 'Buzz' },
  ],
  skinTone: [
    { category: 'skinTone', id: 'tone-1', label: 'Tone 1' },
    { category: 'skinTone', id: 'tone-2', label: 'Tone 2' },
    { category: 'skinTone', id: 'tone-3', label: 'Tone 3' },
    { category: 'skinTone', id: 'tone-4', label: 'Tone 4' },
    { category: 'skinTone', id: 'tone-5', label: 'Tone 5' },
  ],
  clothing: [
    { category: 'clothing', id: 'jacket', label: 'Jacket' },
    { category: 'clothing', id: 'hoodie', label: 'Hoodie' },
    { category: 'clothing', id: 'blazer', label: 'Blazer' },
    { category: 'clothing', id: 'sweater', label: 'Sweater' },
    { category: 'clothing', id: 'tee', label: 'Tee' },
  ],
  hat: [
    { category: 'hat', id: 'none', label: 'No hat' },
    { category: 'hat', id: 'cap', label: 'Cap' },
    { category: 'hat', id: 'beanie', label: 'Beanie' },
  ],
  accessory: [
    { category: 'accessory', id: 'none', label: 'No accessory' },
    { category: 'accessory', id: 'glasses', label: 'Glasses' },
    { category: 'accessory', id: 'earpiece', label: 'Earpiece' },
  ],
};

export function getEventAvatarAssetLabel(category: EventAvatarCategory, id: string) {
  return EVENT_AVATAR_CATALOG[category].find((asset) => asset.id === id)?.label ?? id;
}
