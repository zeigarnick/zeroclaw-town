#!/usr/bin/env node

import crypto from 'node:crypto';
import process from 'node:process';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
dotenv.config();

const args = parseArgs(process.argv.slice(2));
const baseUrl = normalizeApiBaseUrl(
  args.baseUrl ??
    process.env.EVENT_NETWORKING_API_BASE_URL ??
    process.env.NETWORKING_API_BASE_URL ??
    process.env.VITE_NETWORKING_API_BASE_URL ??
    process.env.CONVEX_SITE_URL ??
    convertConvexUrlToSite(process.env.VITE_CONVEX_URL),
);
const eventId =
  args.eventId ??
  process.env.EVENT_NETWORKING_SMOKE_EVENT_ID ??
  `event-smoke-${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`;
const runId = `event-smoke-${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`;

if (!baseUrl) {
  console.error(
    'Missing API base URL. Set EVENT_NETWORKING_API_BASE_URL, NETWORKING_API_BASE_URL, VITE_NETWORKING_API_BASE_URL, CONVEX_SITE_URL, or VITE_CONVEX_URL.',
  );
  process.exit(1);
}

console.log(`Event networking smoke target: ${baseUrl}`);
console.log(`Event: ${eventId}`);

try {
  await step('load event space', async () => {
    const space = await api('GET', `/events/${eventId}/space`);
    if (space !== null) {
      assert(space.eventId === normalizeEventId(eventId), `Unexpected space eventId: ${snippet(space)}`);
      assert(space.registrationStatus === 'open', `Expected registration to be open: ${snippet(space)}`);
    }
    return { loaded: true };
  });

  const attendee = await registerAndApproveEventAgent({
    slug: `${runId}-attendee`,
    publicCard: {
      role: 'Founder',
      category: 'fintech',
      offers: ['Treasury automation buyer insight', 'Seed fundraising context'],
      wants: ['Investor introductions', 'GTM feedback'],
      lookingFor: 'A focused operator or investor who can compare fundraising and buyer messaging.',
      hobbies: ['coffee chats'],
      interests: ['fintech', 'b2b sales'],
      favoriteMedia: ['operator memos'],
    },
    avatarConfig: {
      hair: 'short',
      skinTone: 'tone-3',
      clothing: 'blazer',
      accessory: 'glasses',
    },
  });

  const connector = await registerAndApproveEventAgent({
    slug: `${runId}-connector`,
    publicCard: {
      role: 'Operator',
      category: 'fintech',
      offers: ['Investor introductions', 'GTM feedback', 'Finance buyer workflow review'],
      wants: ['Promising fintech founder conversations'],
      lookingFor: 'Founders with a crisp fintech wedge and an active near-term ask.',
      hobbies: ['demo days'],
      interests: ['fintech', 'go to market'],
      favoriteMedia: ['fundraising teardown notes'],
    },
    avatarConfig: {
      hair: 'waves',
      skinTone: 'tone-4',
      clothing: 'jacket',
      hat: 'cap',
    },
  });

  await step('upsert private contacts', async () => {
    await Promise.all([
      api('POST', `/events/${eventId}/agents/${attendee.eventAgentId}/private-contact`, {
        ownerSessionToken: attendee.ownerSessionToken,
        body: {
          contact: {
            realName: `Smoke Attendee ${runId}`,
            company: 'OpenNetwork Smoke Labs',
            email: `${runId}-attendee@example.com`,
            website: 'https://example.com/attendee',
          },
        },
      }),
      api('POST', `/events/${eventId}/agents/${connector.eventAgentId}/private-contact`, {
        ownerSessionToken: connector.ownerSessionToken,
        body: {
          contact: {
            realName: `Smoke Connector ${runId}`,
            company: 'OpenNetwork Smoke Labs',
            email: `${runId}-connector@example.com`,
            linkedin: 'https://example.com/connector',
          },
        },
      }),
    ]);
    return { contacts: 2 };
  });

  await step('list approved public cards', async () => {
    const cards = await api('GET', `/events/${eventId}/approved-cards`);
    assertArrayHas(cards, (card) => card.eventAgentId === attendee.eventAgentId, 'attendee approved card');
    assertArrayHas(cards, (card) => card.eventAgentId === connector.eventAgentId, 'connector approved card');
    assertPublicPayloadDoesNotLeakPrivateData(cards);
    return { approvedCards: cards.length };
  });

  await step('search public event directory', async () => {
    const directory = await api('GET', `/events/${eventId}/directory?q=fintech`);
    assertArrayHas(directory, (entry) => entry.eventAgentId === attendee.eventAgentId, 'attendee directory entry');
    assertArrayHas(directory, (entry) => entry.eventAgentId === connector.eventAgentId, 'connector directory entry');
    assertPublicPayloadDoesNotLeakPrivateData(directory);
    return { directoryResults: directory.length };
  });

  const intent = await step('create connection intent', async () =>
    api('POST', `/events/${eventId}/connection-intents`, {
      ownerSessionToken: attendee.ownerSessionToken,
      body: {
        requesterAgentId: attendee.eventAgentId,
        targetAgentId: connector.eventAgentId,
      },
    }),
  );
  assert(intent.status === 'pending_recipient_review', `Expected pending intent: ${snippet(intent)}`);

  await step('list target inbound intents', async () => {
    const inbound = await api(
      'GET',
      `/events/${eventId}/agents/${connector.eventAgentId}/inbound-intents`,
      {
        ownerSessionToken: connector.ownerSessionToken,
      },
    );
    assertArrayHas(inbound, (item) => item.intent?.id === intent.id, 'fresh inbound intent');
    assertPublicPayloadDoesNotLeakPrivateData(inbound);
    return { inbound: inbound.length };
  });

  const decision = await step('approve connection reveal', async () =>
    api('POST', `/events/${eventId}/connection-intents/${intent.id}/decision`, {
      ownerSessionToken: connector.ownerSessionToken,
      body: {
        decision: 'approve',
      },
    }),
  );
  assert(
    decision.intent?.status === 'recipient_approved',
    `Expected recipient_approved decision: ${snippet(decision)}`,
  );
  assert(decision.reveal?.intentId === intent.id, `Decision did not include reveal: ${snippet(decision)}`);

  await step('load approved contact reveal', async () => {
    const reveal = await api('GET', `/events/${eventId}/contact-reveals/${intent.id}`, {
      ownerSessionToken: attendee.ownerSessionToken,
    });
    assert(
      reveal.requesterContact?.email === `${runId}-attendee@example.com`,
      `Requester contact missing from reveal: ${snippet(reveal)}`,
    );
    assert(
      reveal.targetContact?.email === `${runId}-connector@example.com`,
      `Target contact missing from reveal: ${snippet(reveal)}`,
    );
    return { reveal: reveal.id };
  });

  await step('reject legacy networking routes', async () => {
    const legacyChecks = await Promise.all([
      apiExpectError('GET', '/cards', 410),
      apiExpectError('GET', '/inbox', 410),
      apiExpectError('POST', '/agents/register', 410, {
        body: { slug: `${runId}-legacy`, displayName: 'Legacy Smoke' },
      }),
    ]);
    return { legacyChecks: legacyChecks.length };
  });

  console.log('');
  console.log('Event networking smoke passed.');
  console.log(`Owner review path: ${attendee.ownerReviewPath}`);
  console.log(
    `Inbound review path: /event-inbound/${eventId}/${encodeURIComponent(
      connector.eventAgentId,
    )}/${encodeURIComponent(connector.ownerSessionToken)}`,
  );
} catch (error) {
  console.error('');
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

async function registerAndApproveEventAgent({ slug, publicCard, avatarConfig }) {
  const registered = await step(`register event agent ${slug}`, async () =>
    api('POST', `/events/${eventId}/register`, {
      body: {
        agentIdentifier: slug,
        publicCard,
        avatarConfig,
      },
    }),
  );
  assert(registered.ownerSessionToken, `Register response missing ownerSessionToken: ${snippet(registered)}`);
  assert(registered.ownerReviewPath, `Register response missing ownerReviewPath: ${snippet(registered)}`);

  await step(`load owner review ${slug}`, async () => {
    const review = await api(
      'GET',
      `/events/${eventId}/owner-sessions/${registered.ownerSessionToken}`,
    );
    assert(review.sessionStatus === 'pending', `Expected pending owner review: ${snippet(review)}`);
    return { sessionStatus: review.sessionStatus };
  });

  const approved = await step(`approve owner review ${slug}`, async () =>
    api('POST', `/events/${eventId}/owner-sessions/${registered.ownerSessionToken}/approve`, {
      body: {},
    }),
  );
  assert(approved.sessionStatus === 'approved', `Expected approved owner review: ${snippet(approved)}`);
  return registered;
}

async function api(method, path, { ownerSessionToken, body } = {}) {
  const payload = await apiRaw(method, path, { ownerSessionToken, body });
  if (!payload.response.ok || payload.body?.success !== true) {
    throw new Error(`${method} ${path} failed with status ${payload.response.status}: ${snippet(payload.body)}`);
  }
  return payload.body.data;
}

async function apiExpectError(method, path, expectedStatus, { ownerSessionToken, body } = {}) {
  const payload = await apiRaw(method, path, { ownerSessionToken, body });
  assert(
    payload.response.status === expectedStatus,
    `${method} ${path} expected ${expectedStatus}, got ${payload.response.status}: ${snippet(payload.body)}`,
  );
  assert(payload.body?.success === false, `${method} ${path} expected error envelope: ${snippet(payload.body)}`);
  return payload.body.error;
}

async function apiRaw(method, path, { ownerSessionToken, body } = {}) {
  const url = `${baseUrl}${path}`;
  const headers = {
    Accept: 'application/json',
  };
  if (ownerSessionToken) {
    headers.Authorization = `Bearer ${ownerSessionToken}`;
  }
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  let response;
  try {
    response = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (error) {
    throw new Error(`${method} ${path} network failure: ${error instanceof Error ? error.message : String(error)}`);
  }

  const responseText = await response.text();
  let parsedBody;
  try {
    parsedBody = JSON.parse(responseText);
  } catch {
    throw new Error(`${method} ${path} returned non-JSON status ${response.status}: ${snippet(responseText)}`);
  }
  return { response, body: parsedBody };
}

async function step(name, fn) {
  process.stdout.write(`- ${name} ... `);
  try {
    const result = await fn();
    console.log('ok');
    return result;
  } catch (error) {
    console.log('failed');
    throw new Error(`[${name}] ${error instanceof Error ? error.message : String(error)}`);
  }
}

function parseArgs(argv) {
  const parsed = {
    baseUrl: undefined,
    eventId: undefined,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--base-url') {
      parsed.baseUrl = argv[index + 1];
      index += 1;
    } else if (arg.startsWith('--base-url=')) {
      parsed.baseUrl = arg.slice('--base-url='.length);
    } else if (arg === '--event-id') {
      parsed.eventId = argv[index + 1];
      index += 1;
    } else if (arg.startsWith('--event-id=')) {
      parsed.eventId = arg.slice('--event-id='.length);
    } else if (arg === '--help' || arg === '-h') {
      console.log(`Usage: node scripts/event-networking-smoke.mjs [--base-url URL] [--event-id EVENT_ID]

Environment:
  EVENT_NETWORKING_API_BASE_URL   API root or origin. /api/v1 is appended when omitted.
  EVENT_NETWORKING_SMOKE_EVENT_ID Event id to mutate. Defaults to an isolated smoke event.
`);
      process.exit(0);
    }
  }

  return parsed;
}

function normalizeApiBaseUrl(value) {
  if (!value) {
    return undefined;
  }
  const trimmed = value.replace(/\/+$/, '');
  return trimmed.endsWith('/api/v1') ? trimmed : `${trimmed}/api/v1`;
}

function convertConvexUrlToSite(value) {
  if (!value) {
    return undefined;
  }
  try {
    const url = new URL(value);
    url.hostname = url.hostname.replace(/\.convex\.cloud$/, '.convex.site');
    url.pathname = '';
    url.search = '';
    url.hash = '';
    return url.toString();
  } catch {
    return value.replace(/\.convex\.cloud\/?$/, '.convex.site');
  }
}

function normalizeEventId(value) {
  return value.trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-');
}

function assertArrayHas(rows, predicate, label) {
  assert(Array.isArray(rows), `Expected an array while looking for ${label}: ${snippet(rows)}`);
  assert(rows.some(predicate), `Could not find ${label}. Response snippet: ${snippet(rows)}`);
}

function assertPublicPayloadDoesNotLeakPrivateData(value) {
  const text = JSON.stringify(value);
  const forbidden = [
    'ownerSessionToken',
    'ownerReviewPath',
    'sessionTokenHash',
    'privateContact',
    'realName',
    'email',
    'phone',
    'linkedin',
  ];
  for (const token of forbidden) {
    assert(!text.includes(token), `Public payload leaked ${token}: ${snippet(value)}`);
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function snippet(value) {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return text.length > 900 ? `${text.slice(0, 900)}...` : text;
}
