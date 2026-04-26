/**
 * Mocked API adapter for Packet 7 Owner Dashboard.
 *
 * This adapter implements the Packet 6 HTTP response shapes locally.
 * When Packet 6 (convex/networking/http.ts) is ready, replace these mocks
 * with real HTTP calls to /api/v1/* endpoints.
 *
 * INTEGRATION ASSUMPTIONS FOR PACKET 6/7 MERGE:
 * - All responses use { data: T } envelope with optional { error: string } on failure
 * - API key auth: Authorization: Bearer town_*
 * - IDs are strings (agent_id, card_id, etc.) to support Convex _id format
 * - Timestamps are ISO 8601 strings
 * - Claim token/verification code are demo fixtures (not real X/Twitter)
 */

export type ApiError = {
  error: string;
  code?: string;
  details?: Record<string, unknown>;
};

export type ApiResponse<T> =
  | { data: T }
  | ApiError;

// ============================================================================
// AGENT & REGISTRATION
// ============================================================================

export interface Agent {
  id: string;
  name: string;
  apiKey?: string; // Returned after registration, used for auth
  status: 'pending' | 'claimed' | 'active';
  claimedAt?: string; // ISO 8601
  claimedBy?: string; // owner handle
  description?: string;
}

export interface RegisterAgentRequest {
  name: string;
  description?: string;
}

export interface MockClaimRequest {
  apiKey: string;
  claimToken: string; // Demo: any string works
  verificationCode: string; // Demo: any string works
  xHandle?: string; // Owner's X handle (optional for demo)
}

// ============================================================================
// CARDS (Active Agent Recommendations)
// ============================================================================

export interface Card {
  id: string;
  agentId: string;
  agentName: string;
  targetAgentId: string;
  targetAgentName: string;
  status: 'active' | 'matched' | 'closed';
  reason: string; // Why this recommendation exists
  createdAt: string; // ISO 8601
}

export interface CreateCardRequest {
  apiKey: string;
  targetAgentId: string;
  reason?: string;
}

export interface UpdateCardRequest {
  apiKey: string;
  cardId: string;
  status: 'active' | 'matched' | 'closed';
}

// ============================================================================
// INBOX & RECOMMENDATIONS
// ============================================================================

export interface InboxItem {
  id: string;
  cardId: string;
  fromAgentId: string;
  fromAgentName: string;
  toAgentId: string;
  toAgentName: string;
  recommendation: string;
  status: 'pending' | 'accepted' | 'rejected';
  createdAt: string;
}

export interface InboxResponse {
  items: InboxItem[];
  total: number;
}

// ============================================================================
// MEETINGS
// ============================================================================

export interface Meeting {
  id: string;
  initiatorAgentId: string;
  initiatorAgentName: string;
  targetAgentId: string;
  targetAgentName: string;
  status: 'pending' | 'accepted' | 'rejected' | 'concluded';
  requestedAt: string;
  respondedAt?: string;
}

export interface RequestMeetingRequest {
  apiKey: string;
  targetAgentId: string;
  reason?: string;
}

export interface RespondMeetingRequest {
  apiKey: string;
  meetingId: string;
  accept: boolean;
}

// ============================================================================
// CONVERSATIONS & MESSAGES
// ============================================================================

export interface Message {
  id: string;
  senderAgentId: string;
  senderAgentName: string;
  text: string;
  timestamp: string; // ISO 8601
}

export interface Conversation {
  id: string;
  agentIds: string[];
  agentNames: string[];
  status: 'active' | 'closed';
  messages: Message[];
  createdAt: string;
  closedAt?: string;
}

export interface SendMessageRequest {
  apiKey: string;
  conversationId: string;
  text: string;
}

export interface CloseConversationRequest {
  apiKey: string;
  conversationId: string;
}

// ============================================================================
// INTRO CANDIDATES
// ============================================================================

export interface IntroCandidateCard {
  id: string;
  agentId: string;
  agentName: string;
  recommendedAgentId: string;
  recommendedAgentName: string;
  reason: string;
  status: 'ready' | 'contacted' | 'completed';
  createdAt: string;
}

export interface CreateIntroRequest {
  apiKey: string;
  targetAgentId: string;
  reason?: string;
}

// ============================================================================
// API ADAPTER INTERFACE
// ============================================================================

export interface IApiAdapter {
  // Registration
  registerAgent(req: RegisterAgentRequest): Promise<ApiResponse<Agent>>;

  // Mock Claim
  mockClaim(req: MockClaimRequest): Promise<ApiResponse<Agent>>;

  // Cards
  getCards(apiKey: string): Promise<ApiResponse<Card[]>>;
  createCard(req: CreateCardRequest): Promise<ApiResponse<Card>>;
  updateCard(req: UpdateCardRequest): Promise<ApiResponse<Card>>;

  // Inbox
  getInbox(apiKey: string): Promise<ApiResponse<InboxResponse>>;

  // Meetings
  getMeetings(apiKey: string): Promise<ApiResponse<Meeting[]>>;
  requestMeeting(req: RequestMeetingRequest): Promise<ApiResponse<Meeting>>;
  respondToMeeting(req: RespondMeetingRequest): Promise<ApiResponse<Meeting>>;

  // Conversations
  getConversations(apiKey: string): Promise<ApiResponse<Conversation[]>>;
  sendMessage(req: SendMessageRequest): Promise<ApiResponse<Message>>;
  closeConversation(req: CloseConversationRequest): Promise<ApiResponse<Conversation>>;

  // Intros
  getIntros(apiKey: string): Promise<ApiResponse<IntroCandidateCard[]>>;
  createIntro(req: CreateIntroRequest): Promise<ApiResponse<IntroCandidateCard>>;
}

// ============================================================================
// LOCAL MOCK ADAPTER (for Packet 7 development)
// ============================================================================

type LocalStorage = {
  agents: Map<string, Agent>;
  cards: Map<string, Card>;
  inbox: Map<string, InboxItem>;
  meetings: Map<string, Meeting>;
  conversations: Map<string, Conversation>;
  intros: Map<string, IntroCandidateCard>;
};

export class LocalApiAdapter implements IApiAdapter {
  private store: LocalStorage;
  private agentCounter = 0;

  constructor() {
    this.store = {
      agents: new Map(),
      cards: new Map(),
      inbox: new Map(),
      meetings: new Map(),
      conversations: new Map(),
      intros: new Map(),
    };
  }

  private generateId(prefix: string): string {
    const ts = Date.now();
    const rand = Math.random().toString(36).substr(2, 9);
    return `${prefix}_${ts}_${rand}`;
  }

  private isValidApiKey(apiKey: string): Agent | null {
    for (const agent of this.store.agents.values()) {
      if (agent.apiKey === apiKey) {
        return agent;
      }
    }
    return null;
  }

  async registerAgent(req: RegisterAgentRequest): Promise<ApiResponse<Agent>> {
    const agent: Agent = {
      id: this.generateId('agent'),
      name: req.name,
      description: req.description,
      status: 'pending',
      apiKey: `town_demo_${++this.agentCounter}_${Math.random().toString(36).substr(2, 9)}`,
    };
    this.store.agents.set(agent.id, agent);
    return { data: agent };
  }

  async mockClaim(req: MockClaimRequest): Promise<ApiResponse<Agent>> {
    const agent = this.isValidApiKey(req.apiKey);
    if (!agent) {
      return { error: 'Invalid API key', code: 'INVALID_API_KEY' };
    }

    // Demo: accept any claim token and verification code
    if (!req.claimToken || !req.verificationCode) {
      return { error: 'Missing claim token or verification code', code: 'INVALID_CLAIM' };
    }

    agent.status = 'claimed';
    agent.claimedAt = new Date().toISOString();
    agent.claimedBy = req.xHandle || 'demo-owner';

    return { data: agent };
  }

  async getCards(apiKey: string): Promise<ApiResponse<Card[]>> {
    const agent = this.isValidApiKey(apiKey);
    if (!agent) {
      return { error: 'Invalid API key', code: 'INVALID_API_KEY' };
    }

    const cards = Array.from(this.store.cards.values()).filter(c => c.agentId === agent.id);
    return { data: cards };
  }

  async createCard(req: CreateCardRequest): Promise<ApiResponse<Card>> {
    const agent = this.isValidApiKey(req.apiKey);
    if (!agent) {
      return { error: 'Invalid API key', code: 'INVALID_API_KEY' };
    }

    const targetAgent = this.store.agents.get(req.targetAgentId);
    if (!targetAgent) {
      return { error: 'Target agent not found', code: 'NOT_FOUND' };
    }

    const card: Card = {
      id: this.generateId('card'),
      agentId: agent.id,
      agentName: agent.name,
      targetAgentId: targetAgent.id,
      targetAgentName: targetAgent.name,
      status: 'active',
      reason: req.reason || 'Manual recommendation',
      createdAt: new Date().toISOString(),
    };
    this.store.cards.set(card.id, card);

    // Create inbox entry
    const inbox: InboxItem = {
      id: this.generateId('inbox'),
      cardId: card.id,
      fromAgentId: agent.id,
      fromAgentName: agent.name,
      toAgentId: targetAgent.id,
      toAgentName: targetAgent.name,
      recommendation: card.reason,
      status: 'pending',
      createdAt: card.createdAt,
    };
    this.store.inbox.set(inbox.id, inbox);

    return { data: card };
  }

  async updateCard(req: UpdateCardRequest): Promise<ApiResponse<Card>> {
    const agent = this.isValidApiKey(req.apiKey);
    if (!agent) {
      return { error: 'Invalid API key', code: 'INVALID_API_KEY' };
    }

    const card = this.store.cards.get(req.cardId);
    if (!card) {
      return { error: 'Card not found', code: 'NOT_FOUND' };
    }

    if (card.agentId !== agent.id) {
      return { error: 'Unauthorized', code: 'UNAUTHORIZED' };
    }

    card.status = req.status;
    return { data: card };
  }

  async getInbox(apiKey: string): Promise<ApiResponse<InboxResponse>> {
    const agent = this.isValidApiKey(apiKey);
    if (!agent) {
      return { error: 'Invalid API key', code: 'INVALID_API_KEY' };
    }

    const items = Array.from(this.store.inbox.values()).filter(i => i.toAgentId === agent.id);
    return { data: { items, total: items.length } };
  }

  async getMeetings(apiKey: string): Promise<ApiResponse<Meeting[]>> {
    const agent = this.isValidApiKey(apiKey);
    if (!agent) {
      return { error: 'Invalid API key', code: 'INVALID_API_KEY' };
    }

    const meetings = Array.from(this.store.meetings.values()).filter(
      m => m.initiatorAgentId === agent.id || m.targetAgentId === agent.id
    );
    return { data: meetings };
  }

  async requestMeeting(req: RequestMeetingRequest): Promise<ApiResponse<Meeting>> {
    const agent = this.isValidApiKey(req.apiKey);
    if (!agent) {
      return { error: 'Invalid API key', code: 'INVALID_API_KEY' };
    }

    const targetAgent = this.store.agents.get(req.targetAgentId);
    if (!targetAgent) {
      return { error: 'Target agent not found', code: 'NOT_FOUND' };
    }

    const meeting: Meeting = {
      id: this.generateId('meeting'),
      initiatorAgentId: agent.id,
      initiatorAgentName: agent.name,
      targetAgentId: targetAgent.id,
      targetAgentName: targetAgent.name,
      status: 'pending',
      requestedAt: new Date().toISOString(),
    };
    this.store.meetings.set(meeting.id, meeting);

    return { data: meeting };
  }

  async respondToMeeting(req: RespondMeetingRequest): Promise<ApiResponse<Meeting>> {
    const agent = this.isValidApiKey(req.apiKey);
    if (!agent) {
      return { error: 'Invalid API key', code: 'INVALID_API_KEY' };
    }

    const meeting = this.store.meetings.get(req.meetingId);
    if (!meeting) {
      return { error: 'Meeting not found', code: 'NOT_FOUND' };
    }

    if (meeting.targetAgentId !== agent.id) {
      return { error: 'Unauthorized', code: 'UNAUTHORIZED' };
    }

    meeting.status = req.accept ? 'accepted' : 'rejected';
    meeting.respondedAt = new Date().toISOString();

    // Create conversation if accepted
    if (req.accept) {
      const conversation: Conversation = {
        id: this.generateId('conversation'),
        agentIds: [meeting.initiatorAgentId, meeting.targetAgentId],
        agentNames: [meeting.initiatorAgentName, meeting.targetAgentName],
        status: 'active',
        messages: [],
        createdAt: new Date().toISOString(),
      };
      this.store.conversations.set(conversation.id, conversation);
    }

    return { data: meeting };
  }

  async getConversations(apiKey: string): Promise<ApiResponse<Conversation[]>> {
    const agent = this.isValidApiKey(apiKey);
    if (!agent) {
      return { error: 'Invalid API key', code: 'INVALID_API_KEY' };
    }

    const conversations = Array.from(this.store.conversations.values()).filter(c =>
      c.agentIds.includes(agent.id)
    );
    return { data: conversations };
  }

  async sendMessage(req: SendMessageRequest): Promise<ApiResponse<Message>> {
    const agent = this.isValidApiKey(req.apiKey);
    if (!agent) {
      return { error: 'Invalid API key', code: 'INVALID_API_KEY' };
    }

    const conversation = this.store.conversations.get(req.conversationId);
    if (!conversation) {
      return { error: 'Conversation not found', code: 'NOT_FOUND' };
    }

    if (!conversation.agentIds.includes(agent.id)) {
      return { error: 'Unauthorized', code: 'UNAUTHORIZED' };
    }

    const message: Message = {
      id: this.generateId('message'),
      senderAgentId: agent.id,
      senderAgentName: agent.name,
      text: req.text,
      timestamp: new Date().toISOString(),
    };

    conversation.messages.push(message);
    return { data: message };
  }

  async closeConversation(req: CloseConversationRequest): Promise<ApiResponse<Conversation>> {
    const agent = this.isValidApiKey(req.apiKey);
    if (!agent) {
      return { error: 'Invalid API key', code: 'INVALID_API_KEY' };
    }

    const conversation = this.store.conversations.get(req.conversationId);
    if (!conversation) {
      return { error: 'Conversation not found', code: 'NOT_FOUND' };
    }

    if (!conversation.agentIds.includes(agent.id)) {
      return { error: 'Unauthorized', code: 'UNAUTHORIZED' };
    }

    conversation.status = 'closed';
    conversation.closedAt = new Date().toISOString();
    return { data: conversation };
  }

  async getIntros(apiKey: string): Promise<ApiResponse<IntroCandidateCard[]>> {
    const agent = this.isValidApiKey(apiKey);
    if (!agent) {
      return { error: 'Invalid API key', code: 'INVALID_API_KEY' };
    }

    const intros = Array.from(this.store.intros.values()).filter(i => i.agentId === agent.id);
    return { data: intros };
  }

  async createIntro(req: CreateIntroRequest): Promise<ApiResponse<IntroCandidateCard>> {
    const agent = this.isValidApiKey(req.apiKey);
    if (!agent) {
      return { error: 'Invalid API key', code: 'INVALID_API_KEY' };
    }

    const targetAgent = this.store.agents.get(req.targetAgentId);
    if (!targetAgent) {
      return { error: 'Target agent not found', code: 'NOT_FOUND' };
    }

    const intro: IntroCandidateCard = {
      id: this.generateId('intro'),
      agentId: agent.id,
      agentName: agent.name,
      recommendedAgentId: targetAgent.id,
      recommendedAgentName: targetAgent.name,
      reason: req.reason || 'Recommended introduction',
      status: 'ready',
      createdAt: new Date().toISOString(),
    };
    this.store.intros.set(intro.id, intro);

    return { data: intro };
  }
}

// Singleton instance for the app
export const apiAdapter = new LocalApiAdapter();
