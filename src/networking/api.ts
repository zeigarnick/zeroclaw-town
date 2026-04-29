export type ApiError = {
  success: false;
  error: {
    code: string;
    message: string;
  };
};

export type ApiSuccess<T> = {
  success: true;
  data: T;
};

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

export type OwnerMetadata = {
  displayName?: string;
  xProfileUrl?: string;
  verificationMethod?: 'tweet' | 'oauth';
  websiteUrl?: string;
};

export type AgentStatus = 'pending_claim' | 'active';

export interface Agent {
  agentId: string;
  agentSlug: string;
  status: AgentStatus;
  apiKey?: string;
  claimUrl?: string;
  verificationCode?: string;
  ownerClaimId?: string;
}

export interface RegisterAgentRequest {
  slug: string;
  displayName: string;
  description?: string;
}

export interface MockClaimRequest {
  claimToken: string;
  verificationCode: string;
  xHandle: string;
  owner?: OwnerMetadata;
}

export type CardType = 'need' | 'offer' | 'exchange';
export type CardStatus = 'draft' | 'active' | 'paused' | 'expired';

export interface Card {
  id: string;
  agentId: string;
  type: string;
  title: string;
  summary: string;
  detailsForMatching: string;
  desiredOutcome: string;
  tags: string[];
  domains: string[];
  status: string;
  createdAt: number;
  updatedAt: number;
}

export interface CreateCardRequest {
  apiKey: string;
  type: CardType;
  title: string;
  summary: string;
  detailsForMatching: string;
  desiredOutcome: string;
  tags?: string[];
  domains?: string[];
  status?: CardStatus;
}

export interface InboxEvent {
  id: string;
  recipientAgentId?: string;
  actorAgentId?: string;
  type: string;
  status: string;
  recommendationId?: string;
  meetingId?: string;
  conversationId?: string;
  messageId?: string;
  introCandidateId?: string;
  payload?: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

export interface Meeting {
  id: string;
  recommendationId: string;
  requesterAgentId: string;
  responderAgentId: string;
  requesterCardId: string;
  responderCardId: string;
  status: string;
  requestMessage?: string;
  conversationId?: string;
  createdAt: number;
  updatedAt: number;
  respondedAt?: number;
}

export interface RequestMeetingRequest {
  apiKey: string;
  recommendationId: string;
  requestMessage?: string;
}

export interface RespondMeetingRequest {
  apiKey: string;
  meetingId: string;
  accept: boolean;
}

export interface RespondMeetingResult {
  meeting: Meeting;
  conversation?: Conversation;
}

export interface Conversation {
  id: string;
  meetingId: string;
  participantOneAgentId: string;
  participantTwoAgentId: string;
  status: string;
  createdAt: number;
  updatedAt: number;
  closedAt?: number;
}

export interface Message {
  id: string;
  conversationId: string;
  authorAgentId: string;
  recipientAgentId: string;
  clientMessageId: string;
  body: string;
  createdAt: number;
}

export interface SendMessageRequest {
  apiKey: string;
  conversationId: string;
  clientMessageId: string;
  body: string;
}

export interface CloseConversationRequest {
  apiKey: string;
  conversationId: string;
}

export interface IntroCandidate {
  id: string;
  meetingId: string;
  conversationId: string;
  requesterAgentId: string;
  responderAgentId: string;
  summary: string;
  recommendedNextStep: string;
  status: string;
  createdByAgentId: string;
  createdAt: number;
  updatedAt: number;
}

export interface CreateIntroRequest {
  apiKey: string;
  conversationId: string;
  summary: string;
  recommendedNextStep: string;
  explicitlyQualified?: boolean;
}

export interface ReviewIntroRequest {
  apiKey: string;
  introCandidateId: string;
  action: 'approve' | 'defer' | 'dismiss';
}

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

export interface EventDirectoryResult {
  id: string;
  eventId: string;
  eventAgentId: string;
  displayName: string;
  avatarConfig: EventAvatarConfig;
  publicCard: EventPublicCard;
  approvedAt?: number;
  updatedAt: number;
}

export interface SearchEventDirectoryRequest {
  eventId: string;
  q?: string;
  role?: string;
  category?: string;
  offers?: string[];
  wants?: string[];
  lookingFor?: string;
  hobbies?: string[];
  interests?: string[];
  favoriteMedia?: string[];
}

export type EventConnectionIntentStatus =
  | 'pending_recipient_review'
  | 'auto_rejected'
  | 'recipient_approved'
  | 'recipient_declined';

export interface EventConnectionIntent {
  id: string;
  eventId: string;
  requesterAgentId: string;
  targetAgentId: string;
  status: EventConnectionIntentStatus;
  filterResult: {
    allowed: boolean;
    reasons: string[];
    evaluatedAt: number;
  };
  createdAt: number;
  updatedAt: number;
}

export interface EventInboundIntentReview {
  intent: EventConnectionIntent;
  requester: EventDirectoryResult;
}

export interface CreateEventConnectionIntentRequest {
  eventId: string;
  requesterAgentId: string;
  requesterOwnerSessionToken: string;
  targetAgentId: string;
}

export interface GetEventInboundIntentsRequest {
  eventId: string;
  targetAgentId: string;
  ownerSessionToken: string;
}

export interface EventRecipientRules {
  blockedAgentIds?: string[];
  allowedCategories?: string[];
  blockedCategories?: string[];
  requiredKeywords?: string[];
  blockedKeywords?: string[];
}

export interface UpsertEventRecipientRulesRequest {
  eventId: string;
  eventAgentId: string;
  ownerSessionToken: string;
  rules: EventRecipientRules;
}

export interface EventPrivateContact {
  realName?: string;
  company?: string;
  email?: string;
  phone?: string;
  linkedin?: string;
  x?: string;
  website?: string;
}

export interface EventContactReveal {
  id: string;
  eventId: string;
  intentId: string;
  requesterAgentId: string;
  targetAgentId: string;
  requesterContact: EventPrivateContact;
  targetContact: EventPrivateContact;
  createdAt: number;
  updatedAt: number;
}

export interface EventConnectionIntentDecisionResult {
  intent: EventConnectionIntent;
  reveal?: EventContactReveal;
}

export interface UpsertEventPrivateContactRequest {
  eventId: string;
  eventAgentId: string;
  ownerSessionToken: string;
  contact: EventPrivateContact;
}

export interface DecideEventConnectionIntentRequest {
  eventId: string;
  intentId: string;
  ownerSessionToken: string;
  decision: 'approve' | 'decline';
}

export interface GetEventContactRevealRequest {
  eventId: string;
  intentId: string;
  ownerSessionToken: string;
}

export type EventOwnerReviewStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'changes_requested';

export interface RegisterEventAgentRequest {
  eventId: string;
  agentIdentifier?: string;
  publicCard: EventPublicCard;
  avatarConfig?: EventAvatarConfig;
}

export interface EventAgentRegistration {
  eventId: string;
  eventAgentId: string;
  agentIdentifier: string;
  displayName: string;
  avatarConfig: EventAvatarConfig;
  publicCard: EventPublicCard;
  approvalStatus: string;
  cardId: string;
  ownerReviewPath: string;
  ownerSessionToken: string;
  createdAt: number;
  updatedAt: number;
}

export interface EventOwnerReviewData {
  eventId: string;
  eventAgentId: string;
  cardId: string;
  sessionStatus: EventOwnerReviewStatus;
  agentStatus: string;
  displayName: string;
  avatarConfig: EventAvatarConfig;
  publicCard: EventPublicCard;
  reviewNote?: string;
  createdAt: number;
  updatedAt: number;
}

export interface ReviewEventOwnerCardRequest {
  eventId: string;
  reviewToken: string;
  action: 'approve' | 'reject' | 'request-changes';
  reviewNote?: string;
}

export interface IApiAdapter {
  registerAgent(req: RegisterAgentRequest): Promise<ApiResponse<Agent>>;
  mockClaim(req: MockClaimRequest): Promise<ApiResponse<Agent>>;

  getCards(apiKey: string): Promise<ApiResponse<Card[]>>;
  createCard(req: CreateCardRequest): Promise<ApiResponse<Card>>;

  getInbox(apiKey: string): Promise<ApiResponse<InboxEvent[]>>;

  getMeetings(apiKey: string): Promise<ApiResponse<Meeting[]>>;
  requestMeeting(req: RequestMeetingRequest): Promise<ApiResponse<Meeting>>;
  respondToMeeting(req: RespondMeetingRequest): Promise<ApiResponse<RespondMeetingResult>>;

  getConversations(apiKey: string): Promise<ApiResponse<Conversation[]>>;
  getConversationMessages(apiKey: string, conversationId: string): Promise<ApiResponse<Message[]>>;
  sendMessage(req: SendMessageRequest): Promise<ApiResponse<Message>>;
  closeConversation(req: CloseConversationRequest): Promise<ApiResponse<Conversation>>;

  getIntros(apiKey: string): Promise<ApiResponse<IntroCandidate[]>>;
  createIntro(req: CreateIntroRequest): Promise<ApiResponse<IntroCandidate>>;
  reviewIntro(req: ReviewIntroRequest): Promise<ApiResponse<IntroCandidate>>;

  registerEventAgent(req: RegisterEventAgentRequest): Promise<ApiResponse<EventAgentRegistration>>;
  getEventOwnerReview(
    eventId: string,
    reviewToken: string,
  ): Promise<ApiResponse<EventOwnerReviewData>>;
  reviewEventOwnerCard(
    req: ReviewEventOwnerCardRequest,
  ): Promise<ApiResponse<EventOwnerReviewData>>;
  searchEventDirectory(
    req: SearchEventDirectoryRequest,
  ): Promise<ApiResponse<EventDirectoryResult[]>>;
  createEventConnectionIntent(
    req: CreateEventConnectionIntentRequest,
  ): Promise<ApiResponse<EventConnectionIntent>>;
  getEventInboundIntents(
    req: GetEventInboundIntentsRequest,
  ): Promise<ApiResponse<EventInboundIntentReview[]>>;
  upsertEventRecipientRules(req: UpsertEventRecipientRulesRequest): Promise<ApiResponse<unknown>>;
  upsertEventPrivateContact(req: UpsertEventPrivateContactRequest): Promise<ApiResponse<unknown>>;
  decideEventConnectionIntent(
    req: DecideEventConnectionIntentRequest,
  ): Promise<ApiResponse<EventConnectionIntentDecisionResult>>;
  getEventContactReveal(
    req: GetEventContactRevealRequest,
  ): Promise<ApiResponse<EventContactReveal>>;
}

type FetchLike = typeof fetch;

type Envelope<T> =
  | {
      success: true;
      data: T;
    }
  | {
      success: false;
      error: {
        code: string;
        message: string;
      };
    };

function defaultApiBaseUrl() {
  const env = getImportMetaEnv();
  const explicitBase = env.VITE_NETWORKING_API_BASE_URL;
  if (explicitBase) {
    return normalizeApiBaseUrl(explicitBase);
  }

  const convexUrl = env.VITE_CONVEX_URL;
  if (!convexUrl) {
    return '/api/v1';
  }

  return normalizeApiBaseUrl(toConvexHttpActionsOrigin(convexUrl));
}

function getImportMetaEnv() {
  return (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env ?? {};
}

function normalizeApiBaseUrl(value: string) {
  const trimmed = value.replace(/\/+$/, '');
  return trimmed.endsWith('/api/v1') ? trimmed : `${trimmed}/api/v1`;
}

function toConvexHttpActionsOrigin(convexUrl: string) {
  try {
    const url = new URL(convexUrl);
    url.hostname = url.hostname.replace(/\.convex\.cloud$/, '.convex.site');
    url.pathname = '';
    url.search = '';
    url.hash = '';
    return url.toString();
  } catch {
    return convexUrl.replace(/\.convex\.cloud\/?$/, '.convex.site');
  }
}

function normalizeId(row: Record<string, unknown>) {
  if (typeof row._id === 'string') {
    return row._id;
  }
  if (typeof row.id === 'string') {
    return row.id;
  }
  return '';
}

function toArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === 'string');
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function normalizeCard(value: unknown): Card {
  const row = asRecord(value);
  return {
    id: normalizeId(row),
    agentId: typeof row.agentId === 'string' ? row.agentId : '',
    type: typeof row.type === 'string' ? row.type : '',
    title: typeof row.title === 'string' ? row.title : '',
    summary: typeof row.summary === 'string' ? row.summary : '',
    detailsForMatching: typeof row.detailsForMatching === 'string' ? row.detailsForMatching : '',
    desiredOutcome: typeof row.desiredOutcome === 'string' ? row.desiredOutcome : '',
    tags: toArray(row.tags),
    domains: toArray(row.domains),
    status: typeof row.status === 'string' ? row.status : '',
    createdAt: typeof row.createdAt === 'number' ? row.createdAt : 0,
    updatedAt: typeof row.updatedAt === 'number' ? row.updatedAt : 0,
  };
}

function normalizeInboxEvent(value: unknown): InboxEvent {
  const row = asRecord(value);
  return {
    id: normalizeId(row),
    recipientAgentId: typeof row.recipientAgentId === 'string' ? row.recipientAgentId : undefined,
    actorAgentId: typeof row.actorAgentId === 'string' ? row.actorAgentId : undefined,
    type: typeof row.type === 'string' ? row.type : '',
    status: typeof row.status === 'string' ? row.status : '',
    recommendationId: typeof row.recommendationId === 'string' ? row.recommendationId : undefined,
    meetingId: typeof row.meetingId === 'string' ? row.meetingId : undefined,
    conversationId: typeof row.conversationId === 'string' ? row.conversationId : undefined,
    messageId: typeof row.messageId === 'string' ? row.messageId : undefined,
    introCandidateId: typeof row.introCandidateId === 'string' ? row.introCandidateId : undefined,
    payload: row.payload && typeof row.payload === 'object' ? (row.payload as Record<string, unknown>) : undefined,
    createdAt: typeof row.createdAt === 'number' ? row.createdAt : 0,
    updatedAt: typeof row.updatedAt === 'number' ? row.updatedAt : 0,
  };
}

function normalizeMeeting(value: unknown): Meeting {
  const row = asRecord(value);
  return {
    id: normalizeId(row),
    recommendationId: typeof row.recommendationId === 'string' ? row.recommendationId : '',
    requesterAgentId: typeof row.requesterAgentId === 'string' ? row.requesterAgentId : '',
    responderAgentId: typeof row.responderAgentId === 'string' ? row.responderAgentId : '',
    requesterCardId: typeof row.requesterCardId === 'string' ? row.requesterCardId : '',
    responderCardId: typeof row.responderCardId === 'string' ? row.responderCardId : '',
    status: typeof row.status === 'string' ? row.status : '',
    requestMessage: typeof row.requestMessage === 'string' ? row.requestMessage : undefined,
    conversationId: typeof row.conversationId === 'string' ? row.conversationId : undefined,
    createdAt: typeof row.createdAt === 'number' ? row.createdAt : 0,
    updatedAt: typeof row.updatedAt === 'number' ? row.updatedAt : 0,
    respondedAt: typeof row.respondedAt === 'number' ? row.respondedAt : undefined,
  };
}

function normalizeConversation(value: unknown): Conversation {
  const row = asRecord(value);
  return {
    id: normalizeId(row),
    meetingId: typeof row.meetingId === 'string' ? row.meetingId : '',
    participantOneAgentId:
      typeof row.participantOneAgentId === 'string' ? row.participantOneAgentId : '',
    participantTwoAgentId:
      typeof row.participantTwoAgentId === 'string' ? row.participantTwoAgentId : '',
    status: typeof row.status === 'string' ? row.status : '',
    createdAt: typeof row.createdAt === 'number' ? row.createdAt : 0,
    updatedAt: typeof row.updatedAt === 'number' ? row.updatedAt : 0,
    closedAt: typeof row.closedAt === 'number' ? row.closedAt : undefined,
  };
}

function normalizeMessage(value: unknown): Message {
  const row = asRecord(value);
  return {
    id: normalizeId(row),
    conversationId: typeof row.conversationId === 'string' ? row.conversationId : '',
    authorAgentId: typeof row.authorAgentId === 'string' ? row.authorAgentId : '',
    recipientAgentId: typeof row.recipientAgentId === 'string' ? row.recipientAgentId : '',
    clientMessageId: typeof row.clientMessageId === 'string' ? row.clientMessageId : '',
    body: typeof row.body === 'string' ? row.body : '',
    createdAt: typeof row.createdAt === 'number' ? row.createdAt : 0,
  };
}

function normalizeIntroCandidate(value: unknown): IntroCandidate {
  const row = asRecord(value);
  return {
    id: normalizeId(row),
    meetingId: typeof row.meetingId === 'string' ? row.meetingId : '',
    conversationId: typeof row.conversationId === 'string' ? row.conversationId : '',
    requesterAgentId: typeof row.requesterAgentId === 'string' ? row.requesterAgentId : '',
    responderAgentId: typeof row.responderAgentId === 'string' ? row.responderAgentId : '',
    summary: typeof row.summary === 'string' ? row.summary : '',
    recommendedNextStep:
      typeof row.recommendedNextStep === 'string' ? row.recommendedNextStep : '',
    status: typeof row.status === 'string' ? row.status : '',
    createdByAgentId: typeof row.createdByAgentId === 'string' ? row.createdByAgentId : '',
    createdAt: typeof row.createdAt === 'number' ? row.createdAt : 0,
    updatedAt: typeof row.updatedAt === 'number' ? row.updatedAt : 0,
  };
}

function normalizeAvatarConfig(value: unknown): EventAvatarConfig {
  const row = asRecord(value);
  return {
    hair: typeof row.hair === 'string' ? row.hair : '',
    skinTone: typeof row.skinTone === 'string' ? row.skinTone : '',
    clothing: typeof row.clothing === 'string' ? row.clothing : '',
    hat: typeof row.hat === 'string' ? row.hat : undefined,
    accessory: typeof row.accessory === 'string' ? row.accessory : undefined,
  };
}

function normalizeEventPublicCard(value: unknown): EventPublicCard {
  const row = asRecord(value);
  return {
    role: typeof row.role === 'string' ? row.role : undefined,
    category: typeof row.category === 'string' ? row.category : undefined,
    offers: toArray(row.offers),
    wants: toArray(row.wants),
    lookingFor: typeof row.lookingFor === 'string' ? row.lookingFor : undefined,
    hobbies: toArray(row.hobbies),
    interests: toArray(row.interests),
    favoriteMedia: toArray(row.favoriteMedia),
  };
}

function normalizeEventRegistration(value: unknown): EventAgentRegistration {
  const row = asRecord(value);
  return {
    eventId: typeof row.eventId === 'string' ? row.eventId : '',
    eventAgentId: typeof row.eventAgentId === 'string' ? row.eventAgentId : '',
    agentIdentifier: typeof row.agentIdentifier === 'string' ? row.agentIdentifier : '',
    displayName: typeof row.displayName === 'string' ? row.displayName : '',
    avatarConfig: normalizeAvatarConfig(row.avatarConfig),
    publicCard: normalizeEventPublicCard(row.publicCard),
    approvalStatus: typeof row.approvalStatus === 'string' ? row.approvalStatus : '',
    cardId: typeof row.cardId === 'string' ? row.cardId : '',
    ownerReviewPath: typeof row.ownerReviewPath === 'string' ? row.ownerReviewPath : '',
    ownerSessionToken: typeof row.ownerSessionToken === 'string' ? row.ownerSessionToken : '',
    createdAt: typeof row.createdAt === 'number' ? row.createdAt : 0,
    updatedAt: typeof row.updatedAt === 'number' ? row.updatedAt : 0,
  };
}

function normalizeEventOwnerReview(value: unknown): EventOwnerReviewData {
  const row = asRecord(value);
  const sessionStatus =
    row.sessionStatus === 'approved' ||
    row.sessionStatus === 'rejected' ||
    row.sessionStatus === 'changes_requested'
      ? row.sessionStatus
      : 'pending';
  return {
    eventId: typeof row.eventId === 'string' ? row.eventId : '',
    eventAgentId: typeof row.eventAgentId === 'string' ? row.eventAgentId : '',
    cardId: typeof row.cardId === 'string' ? row.cardId : '',
    sessionStatus,
    agentStatus: typeof row.agentStatus === 'string' ? row.agentStatus : '',
    displayName: typeof row.displayName === 'string' ? row.displayName : '',
    avatarConfig: normalizeAvatarConfig(row.avatarConfig),
    publicCard: normalizeEventPublicCard(row.publicCard),
    reviewNote: typeof row.reviewNote === 'string' ? row.reviewNote : undefined,
    createdAt: typeof row.createdAt === 'number' ? row.createdAt : 0,
    updatedAt: typeof row.updatedAt === 'number' ? row.updatedAt : 0,
  };
}

function normalizeEventDirectoryResult(value: unknown): EventDirectoryResult {
  const row = asRecord(value);
  return {
    id: normalizeId(row),
    eventId: typeof row.eventId === 'string' ? row.eventId : '',
    eventAgentId: typeof row.eventAgentId === 'string' ? row.eventAgentId : '',
    displayName: typeof row.displayName === 'string' ? row.displayName : '',
    avatarConfig: normalizeAvatarConfig(row.avatarConfig),
    publicCard: normalizeEventPublicCard(row.publicCard),
    approvedAt: typeof row.approvedAt === 'number' ? row.approvedAt : undefined,
    updatedAt: typeof row.updatedAt === 'number' ? row.updatedAt : 0,
  };
}

function normalizeEventConnectionIntentStatus(value: unknown): EventConnectionIntentStatus {
  if (
    value === 'auto_rejected' ||
    value === 'recipient_approved' ||
    value === 'recipient_declined'
  ) {
    return value;
  }
  return 'pending_recipient_review';
}

function normalizeEventConnectionIntent(value: unknown): EventConnectionIntent {
  const row = asRecord(value);
  const filterResult = asRecord(row.filterResult);
  return {
    id: normalizeId(row),
    eventId: typeof row.eventId === 'string' ? row.eventId : '',
    requesterAgentId: typeof row.requesterAgentId === 'string' ? row.requesterAgentId : '',
    targetAgentId: typeof row.targetAgentId === 'string' ? row.targetAgentId : '',
    status: normalizeEventConnectionIntentStatus(row.status),
    filterResult: {
      allowed: typeof filterResult.allowed === 'boolean' ? filterResult.allowed : false,
      reasons: toArray(filterResult.reasons),
      evaluatedAt: typeof filterResult.evaluatedAt === 'number' ? filterResult.evaluatedAt : 0,
    },
    createdAt: typeof row.createdAt === 'number' ? row.createdAt : 0,
    updatedAt: typeof row.updatedAt === 'number' ? row.updatedAt : 0,
  };
}

function normalizeEventInboundIntentReview(value: unknown): EventInboundIntentReview {
  const row = asRecord(value);
  return {
    intent: normalizeEventConnectionIntent(row.intent),
    requester: normalizeEventDirectoryResult(row.requester),
  };
}

function normalizeEventPrivateContact(value: unknown): EventPrivateContact {
  const row = asRecord(value);
  return {
    realName: typeof row.realName === 'string' ? row.realName : undefined,
    company: typeof row.company === 'string' ? row.company : undefined,
    email: typeof row.email === 'string' ? row.email : undefined,
    phone: typeof row.phone === 'string' ? row.phone : undefined,
    linkedin: typeof row.linkedin === 'string' ? row.linkedin : undefined,
    x: typeof row.x === 'string' ? row.x : undefined,
    website: typeof row.website === 'string' ? row.website : undefined,
  };
}

function normalizeEventContactReveal(value: unknown): EventContactReveal {
  const row = asRecord(value);
  return {
    id: normalizeId(row),
    eventId: typeof row.eventId === 'string' ? row.eventId : '',
    intentId: typeof row.intentId === 'string' ? row.intentId : '',
    requesterAgentId: typeof row.requesterAgentId === 'string' ? row.requesterAgentId : '',
    targetAgentId: typeof row.targetAgentId === 'string' ? row.targetAgentId : '',
    requesterContact: normalizeEventPrivateContact(row.requesterContact),
    targetContact: normalizeEventPrivateContact(row.targetContact),
    createdAt: typeof row.createdAt === 'number' ? row.createdAt : 0,
    updatedAt: typeof row.updatedAt === 'number' ? row.updatedAt : 0,
  };
}

function normalizeEventConnectionIntentDecisionResult(
  value: unknown,
): EventConnectionIntentDecisionResult {
  const row = asRecord(value);
  const reveal = row.reveal ? normalizeEventContactReveal(row.reveal) : undefined;
  return {
    intent: normalizeEventConnectionIntent(row.intent),
    reveal,
  };
}

function normalizeAgent(value: unknown): Agent {
  const row = asRecord(value);
  return {
    agentId: typeof row.agentId === 'string' ? row.agentId : '',
    agentSlug: typeof row.agentSlug === 'string' ? row.agentSlug : '',
    status: row.status === 'active' ? 'active' : 'pending_claim',
    apiKey: typeof row.apiKey === 'string' ? row.apiKey : undefined,
    claimUrl: typeof row.claimUrl === 'string' ? row.claimUrl : undefined,
    verificationCode: typeof row.verificationCode === 'string' ? row.verificationCode : undefined,
    ownerClaimId: typeof row.ownerClaimId === 'string' ? row.ownerClaimId : undefined,
  };
}

export class HttpApiAdapter implements IApiAdapter {
  private readonly baseUrl: string;
  private readonly fetchImpl: FetchLike;

  constructor(baseUrl = defaultApiBaseUrl(), fetchImpl: FetchLike = globalThis.fetch.bind(globalThis)) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.fetchImpl = fetchImpl;
  }

  async registerAgent(req: RegisterAgentRequest): Promise<ApiResponse<Agent>> {
    const response = await this.request<unknown>('/agents/register', {
      method: 'POST',
      body: {
        slug: req.slug,
        displayName: req.displayName,
        description: req.description,
      },
    });
    if (!response.success) {
      return response;
    }
    return { success: true, data: normalizeAgent(response.data) };
  }

  async mockClaim(req: MockClaimRequest): Promise<ApiResponse<Agent>> {
    const response = await this.request<unknown>('/agents/mock-claim', {
      method: 'POST',
      body: {
        claimToken: req.claimToken,
        verificationCode: req.verificationCode,
        xHandle: req.xHandle,
        owner: req.owner,
      },
    });
    if (!response.success) {
      return response;
    }
    return { success: true, data: normalizeAgent(response.data) };
  }

  async getCards(apiKey: string): Promise<ApiResponse<Card[]>> {
    const response = await this.request<unknown[]>('/cards', {
      method: 'GET',
      apiKey,
    });
    if (!response.success) {
      return response;
    }
    return { success: true, data: response.data.map((item) => normalizeCard(item)) };
  }

  async createCard(req: CreateCardRequest): Promise<ApiResponse<Card>> {
    const response = await this.request<unknown>('/cards', {
      method: 'POST',
      apiKey: req.apiKey,
      body: {
        type: req.type,
        title: req.title,
        summary: req.summary,
        detailsForMatching: req.detailsForMatching,
        desiredOutcome: req.desiredOutcome,
        tags: req.tags,
        domains: req.domains,
        status: req.status,
      },
    });
    if (!response.success) {
      return response;
    }
    return { success: true, data: normalizeCard(response.data) };
  }

  async getInbox(apiKey: string): Promise<ApiResponse<InboxEvent[]>> {
    const response = await this.request<unknown[]>('/inbox', {
      method: 'GET',
      apiKey,
    });
    if (!response.success) {
      return response;
    }
    return { success: true, data: response.data.map((item) => normalizeInboxEvent(item)) };
  }

  async getMeetings(apiKey: string): Promise<ApiResponse<Meeting[]>> {
    const response = await this.request<unknown[]>('/meetings', {
      method: 'GET',
      apiKey,
    });
    if (!response.success) {
      return response;
    }
    return { success: true, data: response.data.map((item) => normalizeMeeting(item)) };
  }

  async requestMeeting(req: RequestMeetingRequest): Promise<ApiResponse<Meeting>> {
    const response = await this.request<unknown>(
      `/recommendations/${req.recommendationId}/request-meeting`,
      {
        method: 'POST',
        apiKey: req.apiKey,
        body: {
          requestMessage: req.requestMessage,
        },
      },
    );
    if (!response.success) {
      return response;
    }
    return { success: true, data: normalizeMeeting(response.data) };
  }

  async respondToMeeting(req: RespondMeetingRequest): Promise<ApiResponse<RespondMeetingResult>> {
    const action = req.accept ? 'accept' : 'decline';
    const response = await this.request<unknown>(
      `/meetings/${req.meetingId}/${action}`,
      {
        method: 'POST',
        apiKey: req.apiKey,
      },
    );
    if (!response.success) {
      return response;
    }

    const payload = asRecord(response.data);
    const meeting = payload.meeting ? normalizeMeeting(payload.meeting) : normalizeMeeting(response.data);
    const conversation = payload.conversation ? normalizeConversation(payload.conversation) : undefined;
    return { success: true, data: { meeting, conversation } };
  }

  async getConversations(apiKey: string): Promise<ApiResponse<Conversation[]>> {
    const response = await this.request<unknown[]>('/conversations', {
      method: 'GET',
      apiKey,
    });
    if (!response.success) {
      return response;
    }
    return {
      success: true,
      data: response.data.map((item) => normalizeConversation(item)),
    };
  }

  async getConversationMessages(
    apiKey: string,
    conversationId: string,
  ): Promise<ApiResponse<Message[]>> {
    const response = await this.request<unknown[]>(
      `/conversations/${conversationId}/messages`,
      {
        method: 'GET',
        apiKey,
      },
    );
    if (!response.success) {
      return response;
    }
    return {
      success: true,
      data: response.data.map((item) => normalizeMessage(item)),
    };
  }

  async sendMessage(req: SendMessageRequest): Promise<ApiResponse<Message>> {
    const response = await this.request<unknown>(
      `/conversations/${req.conversationId}/messages`,
      {
        method: 'POST',
        apiKey: req.apiKey,
        body: {
          clientMessageId: req.clientMessageId,
          body: req.body,
        },
      },
    );
    if (!response.success) {
      return response;
    }
    return { success: true, data: normalizeMessage(response.data) };
  }

  async closeConversation(req: CloseConversationRequest): Promise<ApiResponse<Conversation>> {
    const response = await this.request<unknown>(
      `/conversations/${req.conversationId}/close`,
      {
        method: 'POST',
        apiKey: req.apiKey,
      },
    );
    if (!response.success) {
      return response;
    }
    return { success: true, data: normalizeConversation(response.data) };
  }

  async getIntros(apiKey: string): Promise<ApiResponse<IntroCandidate[]>> {
    const response = await this.request<unknown[]>('/intros', {
      method: 'GET',
      apiKey,
    });
    if (!response.success) {
      return response;
    }
    return {
      success: true,
      data: response.data.map((item) => normalizeIntroCandidate(item)),
    };
  }

  async createIntro(req: CreateIntroRequest): Promise<ApiResponse<IntroCandidate>> {
    const response = await this.request<unknown>('/intros', {
      method: 'POST',
      apiKey: req.apiKey,
      body: {
        conversationId: req.conversationId,
        summary: req.summary,
        recommendedNextStep: req.recommendedNextStep,
        explicitlyQualified: req.explicitlyQualified,
      },
    });
    if (!response.success) {
      return response;
    }
    return { success: true, data: normalizeIntroCandidate(response.data) };
  }

  async reviewIntro(req: ReviewIntroRequest): Promise<ApiResponse<IntroCandidate>> {
    const response = await this.request<unknown>(
      `/intros/${req.introCandidateId}/${req.action}`,
      {
        method: 'POST',
        apiKey: req.apiKey,
      },
    );
    if (!response.success) {
      return response;
    }
    return { success: true, data: normalizeIntroCandidate(response.data) };
  }

  async registerEventAgent(
    req: RegisterEventAgentRequest,
  ): Promise<ApiResponse<EventAgentRegistration>> {
    const response = await this.request<unknown>(`/events/${req.eventId}/register`, {
      method: 'POST',
      body: {
        agentIdentifier: req.agentIdentifier,
        publicCard: req.publicCard,
        avatarConfig: req.avatarConfig,
      },
    });
    if (!response.success) {
      return response;
    }
    return { success: true, data: normalizeEventRegistration(response.data) };
  }

  async getEventOwnerReview(
    eventId: string,
    reviewToken: string,
  ): Promise<ApiResponse<EventOwnerReviewData>> {
    const response = await this.request<unknown>(
      `/events/${eventId}/owner-sessions/${reviewToken}`,
      {
        method: 'GET',
      },
    );
    if (!response.success) {
      return response;
    }
    return { success: true, data: normalizeEventOwnerReview(response.data) };
  }

  async reviewEventOwnerCard(
    req: ReviewEventOwnerCardRequest,
  ): Promise<ApiResponse<EventOwnerReviewData>> {
    const response = await this.request<unknown>(
      `/events/${req.eventId}/owner-sessions/${req.reviewToken}/${req.action}`,
      {
        method: 'POST',
        body: {
          reviewNote: req.reviewNote,
        },
      },
    );
    if (!response.success) {
      return response;
    }
    return { success: true, data: normalizeEventOwnerReview(response.data) };
  }

  async searchEventDirectory(
    req: SearchEventDirectoryRequest,
  ): Promise<ApiResponse<EventDirectoryResult[]>> {
    const response = await this.request<unknown[]>(`/events/${req.eventId}/directory`, {
      method: 'GET',
      query: {
        q: req.q,
        role: req.role,
        category: req.category,
        offers: joinQueryList(req.offers),
        wants: joinQueryList(req.wants),
        lookingFor: req.lookingFor,
        hobbies: joinQueryList(req.hobbies),
        interests: joinQueryList(req.interests),
        favoriteMedia: joinQueryList(req.favoriteMedia),
      },
    });
    if (!response.success) {
      return response;
    }
    return { success: true, data: response.data.map((item) => normalizeEventDirectoryResult(item)) };
  }

  async createEventConnectionIntent(
    req: CreateEventConnectionIntentRequest,
  ): Promise<ApiResponse<EventConnectionIntent>> {
    const response = await this.request<unknown>(
      `/events/${req.eventId}/connection-intents`,
      {
        method: 'POST',
        ownerSessionToken: req.requesterOwnerSessionToken,
        body: {
          requesterAgentId: req.requesterAgentId,
          targetAgentId: req.targetAgentId,
        },
      },
    );
    if (!response.success) {
      return response;
    }
    return { success: true, data: normalizeEventConnectionIntent(response.data) };
  }

  async getEventInboundIntents(
    req: GetEventInboundIntentsRequest,
  ): Promise<ApiResponse<EventInboundIntentReview[]>> {
    const response = await this.request<unknown[]>(
      `/events/${req.eventId}/agents/${req.targetAgentId}/inbound-intents`,
      {
        method: 'GET',
        ownerSessionToken: req.ownerSessionToken,
      },
    );
    if (!response.success) {
      return response;
    }
    return {
      success: true,
      data: response.data.map((item) => normalizeEventInboundIntentReview(item)),
    };
  }

  async upsertEventRecipientRules(
    req: UpsertEventRecipientRulesRequest,
  ): Promise<ApiResponse<unknown>> {
    return await this.request<unknown>(
      `/events/${req.eventId}/agents/${req.eventAgentId}/recipient-rules`,
      {
        method: 'POST',
        ownerSessionToken: req.ownerSessionToken,
        body: {
          rules: req.rules,
        },
      },
    );
  }

  async upsertEventPrivateContact(
    req: UpsertEventPrivateContactRequest,
  ): Promise<ApiResponse<unknown>> {
    return await this.request<unknown>(
      `/events/${req.eventId}/agents/${req.eventAgentId}/private-contact`,
      {
        method: 'POST',
        ownerSessionToken: req.ownerSessionToken,
        body: {
          contact: req.contact,
        },
      },
    );
  }

  async decideEventConnectionIntent(
    req: DecideEventConnectionIntentRequest,
  ): Promise<ApiResponse<EventConnectionIntentDecisionResult>> {
    const response = await this.request<unknown>(
      `/events/${req.eventId}/connection-intents/${req.intentId}/decision`,
      {
        method: 'POST',
        ownerSessionToken: req.ownerSessionToken,
        body: {
          decision: req.decision,
        },
      },
    );
    if (!response.success) {
      return response;
    }
    return {
      success: true,
      data: normalizeEventConnectionIntentDecisionResult(response.data),
    };
  }

  async getEventContactReveal(
    req: GetEventContactRevealRequest,
  ): Promise<ApiResponse<EventContactReveal>> {
    const response = await this.request<unknown>(
      `/events/${req.eventId}/contact-reveals/${req.intentId}`,
      {
        method: 'GET',
        ownerSessionToken: req.ownerSessionToken,
      },
    );
    if (!response.success) {
      return response;
    }
    return { success: true, data: normalizeEventContactReveal(response.data) };
  }

  private async request<T>(
    path: string,
    options: {
      method: 'GET' | 'POST';
      apiKey?: string;
      ownerSessionToken?: string;
      body?: Record<string, unknown>;
      query?: Record<string, string | number | undefined>;
    },
  ): Promise<ApiResponse<T>> {
    const url = this.buildUrl(path, options.query);
    const headers: Record<string, string> = {
      Accept: 'application/json',
    };
    if (options.body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }
    if (options.apiKey) {
      headers.Authorization = `Bearer ${options.apiKey}`;
    }
    if (options.ownerSessionToken) {
      headers.Authorization = `Bearer ${options.ownerSessionToken}`;
    }

    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method: options.method,
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
      });
    } catch {
      return {
        success: false,
        error: {
          code: 'network_error',
          message: 'Network request failed.',
        },
      };
    }

    let payload: Envelope<T>;
    try {
      payload = (await response.json()) as Envelope<T>;
    } catch {
      return {
        success: false,
        error: {
          code: 'invalid_response',
          message: 'Server returned non-JSON response.',
        },
      };
    }

    if (!payload || typeof payload !== 'object' || typeof payload.success !== 'boolean') {
      return {
        success: false,
        error: {
          code: 'invalid_response',
          message: 'Server returned an unexpected response envelope.',
        },
      };
    }

    if (payload.success) {
      return payload;
    }

    return {
      success: false,
      error: {
        code: payload.error?.code ?? 'unknown_error',
        message: payload.error?.message ?? 'Request failed.',
      },
    };
  }

  private buildUrl(
    path: string,
    query?: Record<string, string | number | undefined>,
  ): string {
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    const base = `${this.baseUrl}${normalizedPath}`;
    if (!query) {
      return base;
    }

    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) {
        search.set(key, String(value));
      }
    }

    const searchString = search.toString();
    return searchString ? `${base}?${searchString}` : base;
  }
}

function joinQueryList(values: string[] | undefined) {
  return values?.length ? values.join(',') : undefined;
}

export function getClaimTokenFromUrl(claimUrl: string): string {
  const parts = claimUrl.split('/').filter(Boolean);
  return parts[parts.length - 1] ?? '';
}

export function isError<T>(response: ApiResponse<T>): response is ApiError {
  return !response.success;
}

export const apiAdapter = new HttpApiAdapter();
