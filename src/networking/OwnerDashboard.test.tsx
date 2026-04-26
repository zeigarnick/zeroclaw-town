/**
 * Tests for OwnerDashboard API adapter (Packet 7).
 *
 * Covers the mocked LocalApiAdapter that implements Packet 6 response shapes.
 * Component render tests are covered where existing test setup supports it.
 * Full integration with actual Convex functions and HTTP routes is tested separately
 * in convex/networking/http.test.ts (Packet 6).
 */

import { LocalApiAdapter, Agent } from './api';

describe('LocalApiAdapter (OwnerDashboard)', () => {
  let adapter: LocalApiAdapter;

  beforeEach(() => {
    adapter = new LocalApiAdapter();
  });

  describe('Agent Registration', () => {
    it('registers a new agent with pending status', async () => {
      const response = await adapter.registerAgent({
        name: 'TestAgent',
        description: 'A test agent',
      });

      if ('error' in response) {
        throw new Error(`Registration failed: ${response.error}`);
      }

      const agent = response.data;
      expect(agent.name).toBe('TestAgent');
      expect(agent.status).toBe('pending');
      expect(agent.apiKey).toBeDefined();
      expect(agent.apiKey).toMatch(/^town_demo_/);
    });
  });

  describe('Mock Claim', () => {
    it('claims a pending agent', async () => {
      // Register
      const regResponse = await adapter.registerAgent({ name: 'Agent1' });
      if ('error' in regResponse) throw new Error(`Register failed: ${regResponse.error}`);
      const agent = regResponse.data;

      // Claim
      const claimResponse = await adapter.mockClaim({
        apiKey: agent.apiKey!,
        claimToken: 'demo_token',
        verificationCode: 'demo_code',
        xHandle: 'demo_owner',
      });

      if ('error' in claimResponse) {
        throw new Error(`Claim failed: ${claimResponse.error}`);
      }

      expect(claimResponse.data.status).toBe('claimed');
      expect(claimResponse.data.claimedBy).toBe('demo_owner');
      expect(claimResponse.data.claimedAt).toBeDefined();
    });

    it('rejects invalid API key', async () => {
      const response = await adapter.mockClaim({
        apiKey: 'invalid_key',
        claimToken: 'token',
        verificationCode: 'code',
      });

      expect('error' in response).toBe(true);
      if ('error' in response) {
        expect(response.error).toContain('Invalid API key');
      }
    });
  });

  describe('Cards', () => {
    let agent1: Agent;
    let agent2: Agent;

    beforeEach(async () => {
      const resp1 = await adapter.registerAgent({ name: 'Agent1' });
      const resp2 = await adapter.registerAgent({ name: 'Agent2' });
      if ('error' in resp1 || 'error' in resp2) throw new Error('Registration failed');
      agent1 = resp1.data;
      agent2 = resp2.data;

      // Claim agent1
      await adapter.mockClaim({
        apiKey: agent1.apiKey!,
        claimToken: 'token',
        verificationCode: 'code',
      });
    });

    it('creates a card', async () => {
      const response = await adapter.createCard({
        apiKey: agent1.apiKey!,
        targetAgentId: agent2.id,
        reason: 'Good match',
      });

      if ('error' in response) {
        throw new Error(`Create card failed: ${response.error}`);
      }

      expect(response.data.agentId).toBe(agent1.id);
      expect(response.data.targetAgentId).toBe(agent2.id);
      expect(response.data.status).toBe('active');
      expect(response.data.reason).toBe('Good match');
    });

    it('gets cards for agent', async () => {
      await adapter.createCard({
        apiKey: agent1.apiKey!,
        targetAgentId: agent2.id,
      });

      const response = await adapter.getCards(agent1.apiKey!);
      if ('error' in response) {
        throw new Error(`Get cards failed: ${response.error}`);
      }

      expect(response.data.length).toBe(1);
      expect(response.data[0].agentId).toBe(agent1.id);
    });

    it('updates card status', async () => {
      const createResponse = await adapter.createCard({
        apiKey: agent1.apiKey!,
        targetAgentId: agent2.id,
      });

      if ('error' in createResponse) {
        throw new Error(`Create card failed: ${createResponse.error}`);
      }

      const cardId = createResponse.data.id;

      const updateResponse = await adapter.updateCard({
        apiKey: agent1.apiKey!,
        cardId,
        status: 'matched',
      });

      if ('error' in updateResponse) {
        throw new Error(`Update card failed: ${updateResponse.error}`);
      }

      expect(updateResponse.data.status).toBe('matched');
    });
  });

  describe('Inbox', () => {
    it('returns inbox items for agent', async () => {
      const resp1 = await adapter.registerAgent({ name: 'Agent1' });
      const resp2 = await adapter.registerAgent({ name: 'Agent2' });
      if ('error' in resp1 || 'error' in resp2) throw new Error('Registration failed');

      await adapter.mockClaim({
        apiKey: resp1.data.apiKey!,
        claimToken: 'token',
        verificationCode: 'code',
      });

      // Create a card from Agent1 to Agent2
      await adapter.createCard({
        apiKey: resp1.data.apiKey!,
        targetAgentId: resp2.data.id,
      });

      const inboxResponse = await adapter.getInbox(resp2.data.apiKey!);
      if ('error' in inboxResponse) {
        throw new Error(`Get inbox failed: ${inboxResponse.error}`);
      }

      expect(inboxResponse.data.items.length).toBe(1);
      expect(inboxResponse.data.total).toBe(1);
    });
  });

  describe('Meetings', () => {
    it('requests a meeting', async () => {
      const resp1 = await adapter.registerAgent({ name: 'Agent1' });
      const resp2 = await adapter.registerAgent({ name: 'Agent2' });
      if ('error' in resp1 || 'error' in resp2) throw new Error('Registration failed');

      const meetingResponse = await adapter.requestMeeting({
        apiKey: resp1.data.apiKey!,
        targetAgentId: resp2.data.id,
      });

      if ('error' in meetingResponse) {
        throw new Error(`Request meeting failed: ${meetingResponse.error}`);
      }

      expect(meetingResponse.data.status).toBe('pending');
      expect(meetingResponse.data.initiatorAgentId).toBe(resp1.data.id);
    });

    it('responds to a meeting request', async () => {
      const resp1 = await adapter.registerAgent({ name: 'Agent1' });
      const resp2 = await adapter.registerAgent({ name: 'Agent2' });
      if ('error' in resp1 || 'error' in resp2) throw new Error('Registration failed');

      const meetingResponse = await adapter.requestMeeting({
        apiKey: resp1.data.apiKey!,
        targetAgentId: resp2.data.id,
      });

      if ('error' in meetingResponse) {
        throw new Error(`Request meeting failed: ${meetingResponse.error}`);
      }

      const respondResponse = await adapter.respondToMeeting({
        apiKey: resp2.data.apiKey!,
        meetingId: meetingResponse.data.id,
        accept: true,
      });

      if ('error' in respondResponse) {
        throw new Error(`Respond to meeting failed: ${respondResponse.error}`);
      }

      expect(respondResponse.data.status).toBe('accepted');
      expect(respondResponse.data.respondedAt).toBeDefined();
    });
  });

  describe('Conversations', () => {
    it('creates conversation on meeting accept', async () => {
      const resp1 = await adapter.registerAgent({ name: 'Agent1' });
      const resp2 = await adapter.registerAgent({ name: 'Agent2' });
      if ('error' in resp1 || 'error' in resp2) throw new Error('Registration failed');

      const meetingResponse = await adapter.requestMeeting({
        apiKey: resp1.data.apiKey!,
        targetAgentId: resp2.data.id,
      });

      if ('error' in meetingResponse) throw new Error('Request meeting failed');

      await adapter.respondToMeeting({
        apiKey: resp2.data.apiKey!,
        meetingId: meetingResponse.data.id,
        accept: true,
      });

      const convResponse = await adapter.getConversations(resp1.data.apiKey!);
      if ('error' in convResponse) {
        throw new Error(`Get conversations failed: ${convResponse.error}`);
      }

      expect(convResponse.data.length).toBe(1);
      expect(convResponse.data[0].status).toBe('active');
    });

    it('sends message in conversation', async () => {
      const resp1 = await adapter.registerAgent({ name: 'Agent1' });
      const resp2 = await adapter.registerAgent({ name: 'Agent2' });
      if ('error' in resp1 || 'error' in resp2) throw new Error('Registration failed');

      const meetingResponse = await adapter.requestMeeting({
        apiKey: resp1.data.apiKey!,
        targetAgentId: resp2.data.id,
      });

      if ('error' in meetingResponse) throw new Error('Request meeting failed');

      await adapter.respondToMeeting({
        apiKey: resp2.data.apiKey!,
        meetingId: meetingResponse.data.id,
        accept: true,
      });

      const convResponse = await adapter.getConversations(resp1.data.apiKey!);
      if ('error' in convResponse) throw new Error('Get conversations failed');

      const convId = convResponse.data[0].id;

      const msgResponse = await adapter.sendMessage({
        apiKey: resp1.data.apiKey!,
        conversationId: convId,
        text: 'Hello!',
      });

      if ('error' in msgResponse) {
        throw new Error(`Send message failed: ${msgResponse.error}`);
      }

      expect(msgResponse.data.text).toBe('Hello!');
      expect(msgResponse.data.senderAgentId).toBe(resp1.data.id);
    });
  });

  describe('Intros', () => {
    it('creates intro candidate', async () => {
      const resp1 = await adapter.registerAgent({ name: 'Agent1' });
      const resp2 = await adapter.registerAgent({ name: 'Agent2' });
      if ('error' in resp1 || 'error' in resp2) throw new Error('Registration failed');

      const introResponse = await adapter.createIntro({
        apiKey: resp1.data.apiKey!,
        targetAgentId: resp2.data.id,
        reason: 'Great connection',
      });

      if ('error' in introResponse) {
        throw new Error(`Create intro failed: ${introResponse.error}`);
      }

      expect(introResponse.data.status).toBe('ready');
      expect(introResponse.data.agentId).toBe(resp1.data.id);
      expect(introResponse.data.recommendedAgentId).toBe(resp2.data.id);
    });

    it('retrieves intros for agent', async () => {
      const resp1 = await adapter.registerAgent({ name: 'Agent1' });
      const resp2 = await adapter.registerAgent({ name: 'Agent2' });
      if ('error' in resp1 || 'error' in resp2) throw new Error('Registration failed');

      await adapter.createIntro({
        apiKey: resp1.data.apiKey!,
        targetAgentId: resp2.data.id,
      });

      const introsResponse = await adapter.getIntros(resp1.data.apiKey!);
      if ('error' in introsResponse) {
        throw new Error(`Get intros failed: ${introsResponse.error}`);
      }

      expect(introsResponse.data.length).toBe(1);
    });
  });
});
