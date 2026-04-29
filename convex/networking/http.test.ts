import { ConvexError } from 'convex/values';
import { registerAgentForTestingHandler, mockClaimAgentHandler } from './agents';
import { handleNetworkingHttpRequest, parseBearerAuthorizationHeader } from './http';

type TableName = 'networkAgents' | 'networkAgentApiKeys' | 'ownerClaims' | 'worldStatus';
type Row = Record<string, any> & { _id: string };

function createMockCtx() {
  const tables: Record<TableName, Row[]> = {
    networkAgents: [],
    networkAgentApiKeys: [],
    ownerClaims: [],
    worldStatus: [],
  };
  const counters: Record<TableName, number> = {
    networkAgents: 0,
    networkAgentApiKeys: 0,
    ownerClaims: 0,
    worldStatus: 0,
  };

  const db = {
    insert: async (tableName: TableName, document: Record<string, any>) => {
      counters[tableName] += 1;
      const row = { _id: `${tableName}:${counters[tableName]}`, ...document };
      tables[tableName].push(row);
      return row._id;
    },
    patch: async (id: string, patch: Record<string, any>) => {
      const row = findById(tables, id);
      if (!row) {
        throw new Error(`Missing row ${id}`);
      }
      Object.assign(row, patch);
    },
    get: async (id: string) => findById(tables, id) ?? null,
    query: (tableName: TableName) => ({
      withIndex: (_indexName: string, buildQuery: (q: any) => any) => {
        const filters: Array<{ field: string; value: any }> = [];
        const q = {
          eq: (field: string, value: any) => {
            filters.push({ field, value });
            return q;
          },
        };
        buildQuery(q);
        const rows = tables[tableName].filter((row) =>
          filters.every(({ field, value }) => valuesEqual(row[field], value)),
        );

        return {
          first: async () => rows[0] ?? null,
          collect: async () => rows,
        };
      },
    }),
  };

  return { ctx: { db }, tables };
}

function findById(tables: Record<TableName, Row[]>, id: string) {
  return Object.values(tables)
    .flat()
    .find((row) => row._id === id);
}

function valuesEqual(left: any, right: any) {
  if (left instanceof ArrayBuffer && right instanceof ArrayBuffer) {
    return buffersEqual(left, right);
  }
  return left === right;
}

function buffersEqual(left: ArrayBuffer, right: ArrayBuffer) {
  if (left.byteLength !== right.byteLength) {
    return false;
  }
  const leftBytes = new Uint8Array(left);
  const rightBytes = new Uint8Array(right);
  return leftBytes.every((byte, index) => byte === new Uint8Array(right)[index]);
}

function tokenFromClaimUrl(claimUrl: string) {
  return claimUrl.split('/').at(-1) ?? '';
}

async function readJson(response: Response) {
  return (await response.json()) as any;
}

describe('networking HTTP helpers', () => {
  test('parses bearer API keys with the required town prefix', () => {
    expect(parseBearerAuthorizationHeader('Bearer town_abc123')).toBe('town_abc123');
    expect(() => parseBearerAuthorizationHeader(null)).toThrow('Authorization header is required');
    expect(() => parseBearerAuthorizationHeader('Bearer other_abc123')).toThrow(
      'Authorization header must be in the form: Bearer town_*.',
    );
  });

  test('mock claim activates a registered agent and verifies the owner claim', async () => {
    const { ctx, tables } = createMockCtx();
    const registration = await registerAgentForTestingHandler(ctx as any, {
      slug: 'Mock Owner Agent',
      displayName: 'Mock Owner Agent',
    });

    const result = await mockClaimAgentHandler(ctx as any, {
      claimToken: tokenFromClaimUrl(registration.claimUrl),
      verificationCode: registration.verificationCode,
      xHandle: '@mock_owner',
      owner: { displayName: 'Mock Owner' },
    });

    expect(result.status).toBe('active');
    expect(tables.networkAgents[0].status).toBe('active');
    expect(tables.ownerClaims[0].status).toBe('verified');
    expect(tables.ownerClaims[0].xHandle).toBe('mock_owner');
    expect(tables.ownerClaims[0].xProfileUrl).toBe('https://x.com/mock_owner');
  });

  test('mock claim rejects an invalid verification code with a stable error code', async () => {
    const { ctx } = createMockCtx();
    const registration = await registerAgentForTestingHandler(ctx as any, {
      slug: 'bad-code-agent',
      displayName: 'Bad Code Agent',
    });

    await expect(
      mockClaimAgentHandler(ctx as any, {
        claimToken: tokenFromClaimUrl(registration.claimUrl),
        verificationCode: 'town-WRONG1',
        xHandle: '@bad_code',
      }),
    ).rejects.toMatchObject({
      data: { code: 'invalid_verification_code' },
    } satisfies Partial<ConvexError<{ code: string }>>);
  });

  test('wraps representative route successes in JSON envelopes', async () => {
    const calls: Array<{ kind: string; args: any }> = [];
    const response = await handleNetworkingHttpRequest(
      {
        runMutation: async (_funcRef, args) => {
          calls.push({ kind: 'mutation', args });
          return { agentSlug: args.slug, status: 'pending_claim' };
        },
        runQuery: async () => {
          throw new Error('unexpected query');
        },
      },
      new Request('https://town.example/api/v1/agents/register', {
        method: 'POST',
        body: JSON.stringify({ slug: 'route-agent', displayName: 'Route Agent' }),
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(await readJson(response)).toEqual({
      success: true,
      data: { agentSlug: 'route-agent', status: 'pending_claim' },
    });
    expect(calls[0]).toMatchObject({
      kind: 'mutation',
      args: { slug: 'route-agent', displayName: 'Route Agent' },
    });
  });

  test('routes event registration through the event API envelope', async () => {
    const calls: Array<{ kind: string; args: any }> = [];
    const response = await handleNetworkingHttpRequest(
      {
        runMutation: async (_funcRef, args) => {
          calls.push({ kind: 'mutation', args });
          return {
            eventId: args.eventId,
            displayName: 'Cedar Scout 123',
            approvalStatus: 'pending_owner_review',
          };
        },
        runQuery: async () => {
          throw new Error('unexpected query');
        },
      },
      new Request('https://town.example/api/v1/events/demo-event/register', {
        method: 'POST',
        body: JSON.stringify({
          agentIdentifier: 'attendee-agent',
          avatarConfig: {
            hair: 'curly',
            skinTone: 'tone-3',
            clothing: 'jacket',
          },
          publicCard: {
            role: 'Founder',
            offers: ['GTM help'],
          },
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(await readJson(response)).toEqual({
      success: true,
      data: {
        eventId: 'demo-event',
        displayName: 'Cedar Scout 123',
        approvalStatus: 'pending_owner_review',
      },
    });
    expect(calls[0]).toMatchObject({
      kind: 'mutation',
      args: {
        eventId: 'demo-event',
        agentIdentifier: 'attendee-agent',
        avatarConfig: {
          hair: 'curly',
          skinTone: 'tone-3',
          clothing: 'jacket',
        },
        publicCard: {
          role: 'Founder',
          offers: ['GTM help'],
        },
      },
    });
  });

  test('routes event directory search through the event API envelope', async () => {
    const calls: Array<{ kind: string; args: any }> = [];
    const response = await handleNetworkingHttpRequest(
      {
        runMutation: async () => {
          throw new Error('unexpected mutation');
        },
        runQuery: async (_funcRef, args) => {
          calls.push({ kind: 'query', args });
          return [
            {
              eventId: args.eventId,
              eventAgentId: 'eventAgents:1',
              displayName: 'Cedar Scout 123',
              publicCard: { role: 'Founder', offers: ['GTM help'] },
            },
          ];
        },
      },
      new Request(
        'https://town.example/api/v1/events/demo-event/directory?q=climate&category=Climate&offers=GTM,operator%20intros&wants=seed%20feedback',
        {
          method: 'GET',
        },
      ),
    );

    expect(response.status).toBe(200);
    expect(await readJson(response)).toEqual({
      success: true,
      data: [
        {
          eventId: 'demo-event',
          eventAgentId: 'eventAgents:1',
          displayName: 'Cedar Scout 123',
          publicCard: { role: 'Founder', offers: ['GTM help'] },
        },
      ],
    });
    expect(calls[0]).toMatchObject({
      kind: 'query',
      args: {
        eventId: 'demo-event',
        filters: {
          q: 'climate',
          category: 'Climate',
          offers: ['GTM', 'operator intros'],
          wants: ['seed feedback'],
        },
      },
    });
  });

  test('routes minimal event connection intents and rejects extra fields', async () => {
    const calls: Array<{ kind: string; args: any }> = [];
    const response = await handleNetworkingHttpRequest(
      {
        runMutation: async (_funcRef, args) => {
          calls.push({ kind: 'mutation', args });
          return {
            eventId: args.eventId,
            requesterAgentId: args.requesterAgentId,
            targetAgentId: args.targetAgentId,
            status: 'pending_recipient_review',
          };
        },
        runQuery: async () => {
          throw new Error('unexpected query');
        },
      },
      new Request('https://town.example/api/v1/events/demo-event/connection-intents', {
        method: 'POST',
        headers: { Authorization: 'Bearer event_owner_requester' },
        body: JSON.stringify({
          requesterAgentId: 'eventAgents:1',
          targetAgentId: 'eventAgents:2',
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(await readJson(response)).toEqual({
      success: true,
      data: {
        eventId: 'demo-event',
        requesterAgentId: 'eventAgents:1',
        targetAgentId: 'eventAgents:2',
        status: 'pending_recipient_review',
      },
    });
    expect(calls[0]).toMatchObject({
      kind: 'mutation',
      args: {
        eventId: 'demo-event',
        requesterAgentId: 'eventAgents:1',
        targetAgentId: 'eventAgents:2',
        requesterOwnerSessionToken: 'event_owner_requester',
      },
    });

    const extraFieldResponse = await handleNetworkingHttpRequest(
      {
        runMutation: async () => {
          throw new Error('unexpected mutation');
        },
        runQuery: async () => {
          throw new Error('unexpected query');
        },
      },
      new Request('https://town.example/api/v1/events/demo-event/connection-intents', {
        method: 'POST',
        headers: { Authorization: 'Bearer event_owner_requester' },
        body: JSON.stringify({
          requesterAgentId: 'eventAgents:1',
          targetAgentId: 'eventAgents:2',
          message: 'please connect us',
        }),
      }),
    );

    expect(extraFieldResponse.status).toBe(400);
    expect(await readJson(extraFieldResponse)).toEqual({
      success: false,
      error: {
        code: 'invalid_request',
        message: 'Unexpected request field: message.',
      },
    });
  });

  test('rejects unauthenticated owner-only event HTTP routes before handlers run', async () => {
    const ctx = {
      runMutation: async () => {
        throw new Error('unexpected mutation');
      },
      runQuery: async () => {
        throw new Error('unexpected query');
      },
    };
    const requests = [
      new Request('https://town.example/api/v1/events/demo-event/connection-intents', {
        method: 'POST',
        body: JSON.stringify({
          requesterAgentId: 'eventAgents:1',
          targetAgentId: 'eventAgents:2',
        }),
      }),
      new Request(
        'https://town.example/api/v1/events/demo-event/agents/eventAgents:2/inbound-intents',
        { method: 'GET' },
      ),
      new Request(
        'https://town.example/api/v1/events/demo-event/agents/eventAgents:2/recipient-rules',
        {
          method: 'POST',
          body: JSON.stringify({ rules: {} }),
        },
      ),
      new Request(
        'https://town.example/api/v1/events/demo-event/agents/eventAgents:1/private-contact',
        {
          method: 'POST',
          body: JSON.stringify({ contact: { email: 'attendee@example.com' } }),
        },
      ),
      new Request(
        'https://town.example/api/v1/events/demo-event/connection-intents/eventConnectionIntents:1/decision',
        {
          method: 'POST',
          body: JSON.stringify({ decision: 'approve' }),
        },
      ),
      new Request(
        'https://town.example/api/v1/events/demo-event/contact-reveals/eventConnectionIntents:1',
        { method: 'GET' },
      ),
    ];

    for (const request of requests) {
      const response = await handleNetworkingHttpRequest(ctx, request);
      expect(response.status).toBe(401);
      expect(await readJson(response)).toEqual({
        success: false,
        error: {
          code: 'invalid_event_owner_token',
          message: 'Authorization header is required. Expected Bearer event_owner_*.',
        },
      });
    }
  });

  test('wraps wrong-owner event capability failures for owner-only HTTP routes', async () => {
    const wrongOwnerError = new ConvexError({
      code: 'invalid_event_owner_token',
      message: 'The event owner token is not valid for this event agent.',
    });
    const ctx = {
      runMutation: async () => {
        throw wrongOwnerError;
      },
      runQuery: async () => {
        throw wrongOwnerError;
      },
    };
    const requests = [
      new Request('https://town.example/api/v1/events/demo-event/connection-intents', {
        method: 'POST',
        headers: { Authorization: 'Bearer event_owner_wrong' },
        body: JSON.stringify({
          requesterAgentId: 'eventAgents:1',
          targetAgentId: 'eventAgents:2',
        }),
      }),
      new Request(
        'https://town.example/api/v1/events/demo-event/agents/eventAgents:2/inbound-intents',
        {
          method: 'GET',
          headers: { Authorization: 'Bearer event_owner_wrong' },
        },
      ),
      new Request(
        'https://town.example/api/v1/events/demo-event/agents/eventAgents:2/recipient-rules',
        {
          method: 'POST',
          headers: { Authorization: 'Bearer event_owner_wrong' },
          body: JSON.stringify({ rules: {} }),
        },
      ),
      new Request(
        'https://town.example/api/v1/events/demo-event/agents/eventAgents:1/private-contact',
        {
          method: 'POST',
          headers: { Authorization: 'Bearer event_owner_wrong' },
          body: JSON.stringify({ contact: { email: 'attendee@example.com' } }),
        },
      ),
      new Request(
        'https://town.example/api/v1/events/demo-event/connection-intents/eventConnectionIntents:1/decision',
        {
          method: 'POST',
          headers: { Authorization: 'Bearer event_owner_wrong' },
          body: JSON.stringify({ decision: 'approve' }),
        },
      ),
      new Request(
        'https://town.example/api/v1/events/demo-event/contact-reveals/eventConnectionIntents:1',
        {
          method: 'GET',
          headers: { Authorization: 'Bearer event_owner_wrong' },
        },
      ),
    ];

    for (const request of requests) {
      const response = await handleNetworkingHttpRequest(ctx, request);
      expect(response.status).toBe(401);
      expect(await readJson(response)).toEqual({
        success: false,
        error: {
          code: 'invalid_event_owner_token',
          message: 'The event owner token is not valid for this event agent.',
        },
      });
    }
  });

  test('routes inbound intent review and recipient rules endpoints', async () => {
    const calls: Array<{ kind: string; args: any }> = [];
    const inboundResponse = await handleNetworkingHttpRequest(
      {
        runMutation: async () => {
          throw new Error('unexpected mutation');
        },
        runQuery: async (_funcRef, args) => {
          calls.push({ kind: 'query', args });
          return [
            {
              intent: {
                id: 'eventConnectionIntents:1',
                status: 'pending_recipient_review',
              },
              requester: {
                eventAgentId: args.targetAgentId,
                displayName: 'Cedar Scout 123',
              },
            },
          ];
        },
      },
      new Request(
        'https://town.example/api/v1/events/demo-event/agents/eventAgents:2/inbound-intents',
        {
          method: 'GET',
          headers: { Authorization: 'Bearer event_owner_target' },
        },
      ),
    );

    expect(inboundResponse.status).toBe(200);
    expect(calls[0]).toMatchObject({
      kind: 'query',
      args: {
        eventId: 'demo-event',
        targetAgentId: 'eventAgents:2',
        ownerSessionToken: 'event_owner_target',
      },
    });

    const rulesResponse = await handleNetworkingHttpRequest(
      {
        runMutation: async (_funcRef, args) => {
          calls.push({ kind: 'mutation', args });
          return { eventAgentId: args.eventAgentId, rules: args.rules };
        },
        runQuery: async () => {
          throw new Error('unexpected query');
        },
      },
      new Request(
        'https://town.example/api/v1/events/demo-event/agents/eventAgents:2/recipient-rules',
        {
          method: 'POST',
          headers: { Authorization: 'Bearer event_owner_target' },
          body: JSON.stringify({
            rules: {
              blockedAgentIds: ['eventAgents:9'],
              requiredKeywords: ['climate'],
            },
          }),
        },
      ),
    );

    expect(rulesResponse.status).toBe(200);
    expect(await readJson(rulesResponse)).toEqual({
      success: true,
      data: {
        eventAgentId: 'eventAgents:2',
        rules: {
          blockedAgentIds: ['eventAgents:9'],
          requiredKeywords: ['climate'],
        },
      },
    });
    expect(calls[1]).toMatchObject({
      kind: 'mutation',
      args: {
        eventId: 'demo-event',
        eventAgentId: 'eventAgents:2',
        ownerSessionToken: 'event_owner_target',
        rules: {
          blockedAgentIds: ['eventAgents:9'],
          requiredKeywords: ['climate'],
        },
      },
    });
  });

  test('routes private contact storage, recipient decisions, and contact reveal reads', async () => {
    const calls: Array<{ kind: string; args: any }> = [];
    const privateContactResponse = await handleNetworkingHttpRequest(
      {
        runMutation: async (_funcRef, args) => {
          calls.push({ kind: 'mutation', args });
          return { eventAgentId: args.eventAgentId, contact: args.contact };
        },
        runQuery: async () => {
          throw new Error('unexpected query');
        },
      },
      new Request(
        'https://town.example/api/v1/events/demo-event/agents/eventAgents:1/private-contact',
        {
          method: 'POST',
          headers: { Authorization: 'Bearer event_owner_requester' },
          body: JSON.stringify({
            contact: {
              email: 'attendee@example.com',
              linkedin: 'https://linkedin.com/in/attendee',
            },
          }),
        },
      ),
    );

    expect(privateContactResponse.status).toBe(200);
    expect(calls[0]).toMatchObject({
      kind: 'mutation',
      args: {
        eventId: 'demo-event',
        eventAgentId: 'eventAgents:1',
        ownerSessionToken: 'event_owner_requester',
        contact: {
          email: 'attendee@example.com',
          linkedin: 'https://linkedin.com/in/attendee',
        },
      },
    });

    const decisionResponse = await handleNetworkingHttpRequest(
      {
        runMutation: async (_funcRef, args) => {
          calls.push({ kind: 'mutation', args });
          return {
            intent: {
              id: args.intentId,
              status: 'recipient_approved',
            },
            reveal: {
              id: 'eventContactReveals:1',
              requesterContact: { email: 'requester@example.com' },
              targetContact: { email: 'target@example.com' },
            },
          };
        },
        runQuery: async () => {
          throw new Error('unexpected query');
        },
      },
      new Request(
        'https://town.example/api/v1/events/demo-event/connection-intents/eventConnectionIntents:1/decision',
        {
          method: 'POST',
          headers: { Authorization: 'Bearer event_owner_target' },
          body: JSON.stringify({
            decision: 'approve',
          }),
        },
      ),
    );

    expect(decisionResponse.status).toBe(200);
    expect(calls[1]).toMatchObject({
      kind: 'mutation',
      args: {
        eventId: 'demo-event',
        intentId: 'eventConnectionIntents:1',
        ownerSessionToken: 'event_owner_target',
        decision: 'approve',
      },
    });

    const revealResponse = await handleNetworkingHttpRequest(
      {
        runMutation: async () => {
          throw new Error('unexpected mutation');
        },
        runQuery: async (_funcRef, args) => {
          calls.push({ kind: 'query', args });
          return {
            id: 'eventContactReveals:1',
            eventId: args.eventId,
            intentId: args.intentId,
            requesterAgentId: 'eventAgents:1',
            targetAgentId: 'eventAgents:2',
            requesterContact: { email: 'requester@example.com' },
            targetContact: { email: 'target@example.com' },
          };
        },
      },
      new Request(
        'https://town.example/api/v1/events/demo-event/contact-reveals/eventConnectionIntents:1',
        {
          method: 'GET',
          headers: { Authorization: 'Bearer event_owner_requester' },
        },
      ),
    );

    expect(revealResponse.status).toBe(200);
    expect(calls[2]).toMatchObject({
      kind: 'query',
      args: {
        eventId: 'demo-event',
        intentId: 'eventConnectionIntents:1',
        ownerSessionToken: 'event_owner_requester',
      },
    });

    const invalidDecisionResponse = await handleNetworkingHttpRequest(
      {
        runMutation: async () => {
          throw new Error('unexpected mutation');
        },
        runQuery: async () => {
          throw new Error('unexpected query');
        },
      },
      new Request(
        'https://town.example/api/v1/events/demo-event/connection-intents/eventConnectionIntents:1/decision',
        {
          method: 'POST',
          headers: { Authorization: 'Bearer event_owner_target' },
          body: JSON.stringify({
            decision: 'approve',
            contact: { email: 'leak@example.com' },
          }),
        },
      ),
    );

    expect(invalidDecisionResponse.status).toBe(400);
    expect(await readJson(invalidDecisionResponse)).toMatchObject({
      success: false,
      error: {
        code: 'invalid_request',
        message: 'Unexpected request field: contact.',
      },
    });
  });

  test('wraps representative route errors in stable JSON envelopes', async () => {
    const response = await handleNetworkingHttpRequest(
      {
        runMutation: async () => {
          throw new Error('unexpected mutation');
        },
        runQuery: async () => {
          throw new Error('unexpected query');
        },
      },
      new Request('https://town.example/api/v1/cards', {
        method: 'GET',
      }),
    );

    expect(response.status).toBe(401);
    expect(await readJson(response)).toEqual({
      success: false,
      error: {
        code: 'invalid_api_key',
        message: 'Authorization header is required. Expected Bearer town_*.',
      },
    });
  });
});
