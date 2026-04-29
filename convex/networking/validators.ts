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
export type RecommendationSuppressionReason = (typeof recommendationSuppressionReasons)[number];
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

export const eventRegistrationStatuses = ['open', 'paused'] as const;
export type EventRegistrationStatus = (typeof eventRegistrationStatuses)[number];
export const eventRegistrationStatusValidator = v.union(v.literal('open'), v.literal('paused'));

export const eventWorldTemplateIds = ['clawport-terminal'] as const;
export type EventWorldTemplateId = (typeof eventWorldTemplateIds)[number];
export const eventWorldTemplateIdValidator = v.union(v.literal('clawport-terminal'));

export const eventAgentStatuses = [
  'pending_owner_review',
  'approved',
  'rejected',
  'changes_requested',
  'revoked',
] as const;
export type EventAgentStatus = (typeof eventAgentStatuses)[number];
export const eventAgentStatusValidator = v.union(
  v.literal('pending_owner_review'),
  v.literal('approved'),
  v.literal('rejected'),
  v.literal('changes_requested'),
  v.literal('revoked'),
);

export const eventCardStatuses = [
  'pending_owner_review',
  'approved',
  'rejected',
  'changes_requested',
  'revoked',
] as const;
export type EventCardStatus = (typeof eventCardStatuses)[number];
export const eventCardStatusValidator = v.union(
  v.literal('pending_owner_review'),
  v.literal('approved'),
  v.literal('rejected'),
  v.literal('changes_requested'),
  v.literal('revoked'),
);

export const eventOwnerSessionStatuses = [
  'pending',
  'approved',
  'rejected',
  'changes_requested',
  'revoked',
] as const;
export type EventOwnerSessionStatus = (typeof eventOwnerSessionStatuses)[number];
export const eventOwnerSessionStatusValidator = v.union(
  v.literal('pending'),
  v.literal('approved'),
  v.literal('rejected'),
  v.literal('changes_requested'),
  v.literal('revoked'),
);

export const eventOrganizerInviteStatuses = ['pending', 'redeemed', 'revoked'] as const;
export type EventOrganizerInviteStatus = (typeof eventOrganizerInviteStatuses)[number];
export const eventOrganizerInviteStatusValidator = v.union(
  v.literal('pending'),
  v.literal('redeemed'),
  v.literal('revoked'),
);

export const eventOrganizerApiKeyStatuses = ['active', 'revoked'] as const;
export type EventOrganizerApiKeyStatus = (typeof eventOrganizerApiKeyStatuses)[number];
export const eventOrganizerApiKeyStatusValidator = v.union(
  v.literal('active'),
  v.literal('revoked'),
);

export const eventOrganizerRoles = ['owner', 'staff', 'viewer'] as const;
export type EventOrganizerRole = (typeof eventOrganizerRoles)[number];
export const eventOrganizerRoleValidator = v.union(
  v.literal('owner'),
  v.literal('staff'),
  v.literal('viewer'),
);

export const eventOrganizerAuditTypes = [
  'event_created',
  'event_updated',
  'organizer_invite_created',
  'organizer_invite_redeemed',
  'organizer_api_key_created',
  'organizer_api_key_revoked',
  'event_agent_registered',
  'registration_paused',
  'registration_resumed',
  'skill_url_rotated',
  'event_agent_revoked',
  'event_agent_removed',
] as const;
export type EventOrganizerAuditType = (typeof eventOrganizerAuditTypes)[number];
export const eventOrganizerAuditTypeValidator = v.union(
  v.literal('event_created'),
  v.literal('event_updated'),
  v.literal('organizer_invite_created'),
  v.literal('organizer_invite_redeemed'),
  v.literal('organizer_api_key_created'),
  v.literal('organizer_api_key_revoked'),
  v.literal('event_agent_registered'),
  v.literal('registration_paused'),
  v.literal('registration_resumed'),
  v.literal('skill_url_rotated'),
  v.literal('event_agent_revoked'),
  v.literal('event_agent_removed'),
);

export const eventConnectionIntentStatuses = [
  'pending_recipient_review',
  'auto_rejected',
  'recipient_approved',
  'recipient_declined',
] as const;
export type EventConnectionIntentStatus = (typeof eventConnectionIntentStatuses)[number];
export const eventConnectionIntentStatusValidator = v.union(
  v.literal('pending_recipient_review'),
  v.literal('auto_rejected'),
  v.literal('recipient_approved'),
  v.literal('recipient_declined'),
);

export const eventActivityTypes = ['match_created'] as const;
export type EventActivityType = (typeof eventActivityTypes)[number];
export const eventActivityTypeValidator = v.union(v.literal('match_created'));

export const eventAvatarCategories = ['hair', 'skinTone', 'clothing', 'hat', 'accessory'] as const;
export type EventAvatarCategory = (typeof eventAvatarCategories)[number];
export const eventAvatarCategoryValidator = v.union(
  v.literal('hair'),
  v.literal('skinTone'),
  v.literal('clothing'),
  v.literal('hat'),
  v.literal('accessory'),
);

export const eventAvatarAssetStatuses = ['active', 'disabled'] as const;
export type EventAvatarAssetStatus = (typeof eventAvatarAssetStatuses)[number];
export const eventAvatarAssetStatusValidator = v.union(v.literal('active'), v.literal('disabled'));

export const eventPublicCardFieldNames = [
  'role',
  'category',
  'offers',
  'wants',
  'lookingFor',
  'hobbies',
  'interests',
  'favoriteMedia',
] as const;
export type EventPublicCardFieldName = (typeof eventPublicCardFieldNames)[number];

export const eventContactFieldNames = [
  'realName',
  'name',
  'company',
  'email',
  'phone',
  'linkedin',
  'linkedIn',
  'x',
  'twitter',
  'website',
  'contact',
  'contactLink',
  'contactLinks',
  'profileUrl',
  'url',
] as const;

export const eventSensitiveFieldNames = [
  'age',
  'dateOfBirth',
  'disability',
  'ethnicity',
  'gender',
  'nationality',
  'race',
  'religion',
  'sexuality',
  'sexualOrientation',
] as const;

export const eventNetworkingErrorCodes = [
  'invalid_public_field',
  'contact_field_not_public',
  'sensitive_field_not_allowed',
  'invalid_avatar_asset',
] as const;
export type EventNetworkingErrorCode = (typeof eventNetworkingErrorCodes)[number];

export const MAX_EVENT_PUBLIC_TEXT_LENGTH = 280;
export const MAX_EVENT_PUBLIC_LIST_ITEMS = 12;
export const MAX_EVENT_AGENT_IDENTIFIER_LENGTH = 120;
export const MAX_EVENT_REVIEW_NOTE_LENGTH = 800;

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
