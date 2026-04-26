import { v } from 'convex/values';

export const cardTypes = ['need', 'offer', 'exchange'] as const;
export type CardType = (typeof cardTypes)[number];
export const cardTypeValidator = v.union(
  v.literal('need'),
  v.literal('offer'),
  v.literal('exchange'),
);

export const cardStatuses = ['draft', 'active', 'paused', 'expired'] as const;
export type CardStatus = (typeof cardStatuses)[number];
export const cardStatusValidator = v.union(
  v.literal('draft'),
  v.literal('active'),
  v.literal('paused'),
  v.literal('expired'),
);

export const meetingStatuses = ['pending', 'accepted', 'declined', 'expired'] as const;
export type MeetingStatus = (typeof meetingStatuses)[number];
export const meetingStatusValidator = v.union(
  v.literal('pending'),
  v.literal('accepted'),
  v.literal('declined'),
  v.literal('expired'),
);

export const conversationStatuses = ['open', 'closed'] as const;
export type ConversationStatus = (typeof conversationStatuses)[number];
export const conversationStatusValidator = v.union(v.literal('open'), v.literal('closed'));

export const inboxItemTypes = [
  'match_recommendation',
  'meeting_request',
  'meeting_accepted',
  'meeting_declined',
  'conversation_message',
  'intro_candidate',
] as const;
export type InboxItemType = (typeof inboxItemTypes)[number];
export const inboxItemTypeValidator = v.union(
  v.literal('match_recommendation'),
  v.literal('meeting_request'),
  v.literal('meeting_accepted'),
  v.literal('meeting_declined'),
  v.literal('conversation_message'),
  v.literal('intro_candidate'),
);

export const MAX_ACTIVE_MATCH_CARDS_PER_AGENT = 3;
export const MATCH_CARD_STALE_AFTER_DAYS = 30;
export const MAX_CARD_TITLE_LENGTH = 140;
export const MAX_CARD_SUMMARY_LENGTH = 400;
export const MAX_CARD_DETAILS_LENGTH = 4000;
export const MAX_CARD_DESIRED_OUTCOME_LENGTH = 400;
export const MAX_CARD_TAGS = 16;
export const MAX_CARD_DOMAINS = 16;
export const MAX_CARD_TAG_OR_DOMAIN_LENGTH = 64;

export const MAX_MESSAGE_LENGTH = 2000;
export const MAX_SUMMARY_LENGTH = 1200;

export function isCardType(value: string): value is CardType {
  return cardTypes.includes(value as CardType);
}

export function isCardStatus(value: string): value is CardStatus {
  return cardStatuses.includes(value as CardStatus);
}

export function isMeetingStatus(value: string): value is MeetingStatus {
  return meetingStatuses.includes(value as MeetingStatus);
}

export function isConversationStatus(value: string): value is ConversationStatus {
  return conversationStatuses.includes(value as ConversationStatus);
}

export function isInboxItemType(value: string): value is InboxItemType {
  return inboxItemTypes.includes(value as InboxItemType);
}
