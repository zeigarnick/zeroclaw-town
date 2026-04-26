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

export const introCandidateStatuses = [
  'pending_review',
  'approved',
  'deferred',
  'dismissed',
] as const;
export type IntroCandidateStatus = (typeof introCandidateStatuses)[number];
export const introCandidateStatusValidator = v.union(
  v.literal('pending_review'),
  v.literal('approved'),
  v.literal('deferred'),
  v.literal('dismissed'),
);

export const recommendationStatuses = [
  'active',
  'stale',
  'dismissed',
  'declined',
  'consumed',
] as const;
export type RecommendationStatus = (typeof recommendationStatuses)[number];
export const recommendationStatusValidator = v.union(
  v.literal('active'),
  v.literal('stale'),
  v.literal('dismissed'),
  v.literal('declined'),
  v.literal('consumed'),
);

export const recommendationSuppressionReasons = ['dismissed', 'declined'] as const;
export type RecommendationSuppressionReason =
  (typeof recommendationSuppressionReasons)[number];
export const recommendationSuppressionReasonValidator = v.union(
  v.literal('dismissed'),
  v.literal('declined'),
);

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

export const inboxEventStatuses = ['unread', 'read', 'archived'] as const;
export type InboxEventStatus = (typeof inboxEventStatuses)[number];
export const inboxEventStatusValidator = v.union(
  v.literal('unread'),
  v.literal('read'),
  v.literal('archived'),
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
export const MAX_RECOMMENDED_NEXT_STEP_LENGTH = 600;
export const MAX_MEETING_REQUEST_MESSAGE_LENGTH = 600;
export const MAX_CLIENT_MESSAGE_ID_LENGTH = 128;

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

export function isIntroCandidateStatus(value: string): value is IntroCandidateStatus {
  return introCandidateStatuses.includes(value as IntroCandidateStatus);
}

export function isRecommendationStatus(value: string): value is RecommendationStatus {
  return recommendationStatuses.includes(value as RecommendationStatus);
}

export function isInboxItemType(value: string): value is InboxItemType {
  return inboxItemTypes.includes(value as InboxItemType);
}

export function isInboxEventStatus(value: string): value is InboxEventStatus {
  return inboxEventStatuses.includes(value as InboxEventStatus);
}
