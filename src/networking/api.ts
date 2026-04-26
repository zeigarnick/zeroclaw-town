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

  private async request<T>(
    path: string,
    options: {
      method: 'GET' | 'POST';
      apiKey?: string;
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

export function getClaimTokenFromUrl(claimUrl: string): string {
  const parts = claimUrl.split('/').filter(Boolean);
  return parts[parts.length - 1] ?? '';
}

export function isError<T>(response: ApiResponse<T>): response is ApiError {
  return !response.success;
}

export const apiAdapter = new HttpApiAdapter();
