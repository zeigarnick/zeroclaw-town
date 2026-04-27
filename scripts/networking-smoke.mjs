#!/usr/bin/env node

import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import process from 'node:process';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
dotenv.config();

const DEMO_KEYS = {
  capitalScout: 'town_demo_capital_scout_2026',
  growthOperator: 'town_demo_growth_operator_2026',
};

const args = parseArgs(process.argv.slice(2));
const baseUrl = normalizeApiBaseUrl(
  args.baseUrl ??
    process.env.NETWORKING_API_BASE_URL ??
    process.env.VITE_NETWORKING_API_BASE_URL ??
    process.env.CONVEX_SITE_URL ??
    convertConvexUrlToSite(process.env.VITE_CONVEX_URL),
);
const seedDemo = args.seedDemo;
const runId = `smoke-${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`;

if (!baseUrl) {
  console.error(
    'Missing API base URL. Set NETWORKING_API_BASE_URL, VITE_NETWORKING_API_BASE_URL, CONVEX_SITE_URL, or VITE_CONVEX_URL.',
  );
  process.exit(1);
}

console.log(`Networking smoke target: ${baseUrl}`);

try {
  if (seedDemo) {
    await step('seed demo state', async () => {
      await runCommand('npx', [
        'convex',
        'run',
        '--push',
        'networking/demoSeed:seed',
        JSON.stringify({ includeIntroCandidate: true }),
      ]);
      return { seeded: true };
    });
  } else {
    console.log('Skipping demo seed. Pass --seed-demo to seed Packet 9 demo state first.');
  }

  if (seedDemo) {
    await step('verify seeded demo credentials', async () => {
      const [capitalCards, growthInbox] = await Promise.all([
        api('GET', '/cards', { apiKey: DEMO_KEYS.capitalScout }),
        api('GET', '/inbox', { apiKey: DEMO_KEYS.growthOperator }),
      ]);
      assertArrayHas(capitalCards, (card) => card.title === 'Need warm fintech investor intros', 'capital scout demo card');
      assertArrayHas(growthInbox, (event) => event.type === 'meeting_request', 'growth operator meeting request event');
      return { capitalCards: capitalCards.length, growthInbox: growthInbox.length };
    });
  }

  const needAgent = await registerAndClaimAgent({
    slug: `${runId}-capital-scout`,
    displayName: `Smoke Capital Scout ${runId}`,
    description: 'Smoke test agent looking for focused investor introductions.',
    xHandle: `${runId.replace(/-/g, '_')}_capital`,
  });

  const offerAgent = await registerAndClaimAgent({
    slug: `${runId}-growth-operator`,
    displayName: `Smoke Growth Operator ${runId}`,
    description: 'Smoke test agent offering fintech GTM and investor context.',
    xHandle: `${runId.replace(/-/g, '_')}_growth`,
  });

  await step('create need card', async () =>
    api('POST', '/cards', {
      apiKey: needAgent.apiKey,
      body: {
        type: 'need',
        title: `Need fintech investor intros ${runId}`,
        summary: 'Seed-stage fintech team needs warm investor intros and deck feedback.',
        detailsForMatching:
          'The founder is raising a seed round for treasury automation and needs investor introductions plus tactical GTM feedback.',
        tags: ['fundraising', 'fintech', 'seed'],
        domains: ['fintech', 'b2b-saas'],
        desiredOutcome: 'Book qualified investor and operator feedback calls this week.',
        status: 'active',
      },
    }),
  );

  await step('create offer card', async () =>
    api('POST', '/cards', {
      apiKey: offerAgent.apiKey,
      body: {
        type: 'offer',
        title: `Offer fintech GTM intros ${runId}`,
        summary: 'Operator can review fintech decks and make warm investor introductions.',
        detailsForMatching:
          'Can introduce founders to fintech angels, review the seed narrative, and pressure-test finance buyer workflows.',
        tags: ['fundraising', 'fintech', 'gtm'],
        domains: ['fintech', 'b2b-saas'],
        desiredOutcome: 'Help a focused team sharpen the raise and meet relevant investors.',
        status: 'active',
      },
    }),
  );

  await step('list cards', async () => {
    const [needCards, offerCards] = await Promise.all([
      api('GET', '/cards', { apiKey: needAgent.apiKey }),
      api('GET', '/cards', { apiKey: offerAgent.apiKey }),
    ]);
    assertArrayHas(needCards, (card) => card.title === `Need fintech investor intros ${runId}`, 'fresh need card');
    assertArrayHas(offerCards, (card) => card.title === `Offer fintech GTM intros ${runId}`, 'fresh offer card');
    return { needCards: needCards.length, offerCards: offerCards.length };
  });

  const recommendationId = await step('find recommendation in inbox', async () => {
    const recommendation = await poll(async () => {
      const inbox = await api('GET', '/inbox', { apiKey: needAgent.apiKey });
      return inbox.find(
        (event) => event.type === 'match_recommendation' && typeof event.recommendationId === 'string',
      );
    }, 'match_recommendation inbox event');
    return recommendation.recommendationId;
  });

  const meeting = await step('request meeting', async () =>
    api('POST', `/recommendations/${recommendationId}/request-meeting`, {
      apiKey: needAgent.apiKey,
      body: {
        requestMessage: 'Smoke test request: can we compare investor fit this week?',
      },
    }),
  );

  await step('verify responder inbox', async () => {
    const event = await poll(async () => {
      const inbox = await api('GET', '/inbox', { apiKey: offerAgent.apiKey });
      return inbox.find(
        (row) => row.type === 'meeting_request' && row.meetingId === meeting._id,
      );
    }, 'meeting request event');
    return { event: event._id };
  });

  const acceptResult = await step('accept meeting', async () =>
    api('POST', `/meetings/${meeting._id}/accept`, {
      apiKey: offerAgent.apiKey,
    }),
  );
  const conversationId = acceptResult.conversation?._id;
  if (!conversationId) {
    throw new Error(`Meeting accept response did not include conversation._id: ${snippet(acceptResult)}`);
  }

  await step('list meetings and conversations', async () => {
    const [needMeeting, offerConversation] = await Promise.all([
      poll(async () => {
        const meetings = await api('GET', '/meetings', { apiKey: needAgent.apiKey });
        return meetings.find((row) => row._id === meeting._id && row.status === 'accepted');
      }, 'accepted meeting'),
      poll(async () => {
        const conversations = await api('GET', '/conversations', { apiKey: offerAgent.apiKey });
        return conversations.find((row) => row._id === conversationId && row.status === 'open');
      }, 'open conversation'),
    ]);
    return { meeting: needMeeting._id, conversation: offerConversation._id };
  });

  const messageBody = `Smoke message ${runId}`;
  await step('send message', async () =>
    api('POST', `/conversations/${conversationId}/messages`, {
      apiKey: needAgent.apiKey,
      body: {
        clientMessageId: `client-${runId}`,
        body: messageBody,
      },
    }),
  );

  await step('list messages', async () => {
    const message = await poll(async () => {
      const messages = await api('GET', `/conversations/${conversationId}/messages`, {
        apiKey: offerAgent.apiKey,
      });
      return messages.find((row) => row.body === messageBody);
    }, 'smoke message');
    return { message: message._id };
  });

  await step('close conversation', async () =>
    api('POST', `/conversations/${conversationId}/close`, {
      apiKey: offerAgent.apiKey,
    }),
  );

  const intro = await step('create intro candidate', async () =>
    api('POST', '/intros', {
      apiKey: offerAgent.apiKey,
      body: {
        conversationId,
        summary: 'Smoke candidate is qualified for a warm intro.',
        recommendedNextStep: 'Schedule a short founder and operator call.',
      },
    }),
  );

  await step('review intro candidate', async () =>
    api('POST', `/intros/${intro._id}/approve`, {
      apiKey: needAgent.apiKey,
    }),
  );

  await step('list intros', async () => {
    const approvedIntro = await poll(async () => {
      const intros = await api('GET', '/intros', { apiKey: needAgent.apiKey });
      return intros.find((row) => row._id === intro._id && row.status === 'approved');
    }, 'approved intro');
    return { intro: approvedIntro._id };
  });

  console.log('');
  console.log('Networking smoke passed.');
} catch (error) {
  console.error('');
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

async function registerAndClaimAgent({ slug, displayName, description, xHandle }) {
  const registered = await step(`register agent ${slug}`, async () =>
    api('POST', '/agents/register', {
      body: {
        slug,
        displayName,
        description,
      },
    }),
  );

  const claimToken = getClaimTokenFromUrl(registered.claimUrl);
  if (!registered.apiKey || !claimToken || !registered.verificationCode) {
    throw new Error(`Register response missing apiKey/claim token/verification code: ${snippet(registered)}`);
  }

  await step(`mock claim agent ${slug}`, async () =>
    api('POST', '/agents/mock-claim', {
      body: {
        claimToken,
        verificationCode: registered.verificationCode,
        xHandle,
        owner: {
          displayName,
          verificationMethod: 'tweet',
        },
      },
    }),
  );

  return registered;
}

async function api(method, path, { apiKey, body } = {}) {
  const url = `${baseUrl}${path}`;
  const headers = {
    Accept: 'application/json',
  };
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
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
  let payload;
  try {
    payload = JSON.parse(responseText);
  } catch {
    throw new Error(`${method} ${path} returned non-JSON status ${response.status}: ${snippet(responseText)}`);
  }

  if (!response.ok || payload?.success !== true) {
    throw new Error(`${method} ${path} failed with status ${response.status}: ${snippet(payload)}`);
  }

  return payload.data;
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

async function poll(fn, label, { timeoutMs = 30_000, intervalMs = 1_000 } = {}) {
  const startedAt = Date.now();
  let lastError;
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const result = await fn();
      if (result) {
        return result;
      }
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  const suffix = lastError instanceof Error ? ` Last error: ${lastError.message}` : '';
  throw new Error(`Timed out waiting for ${label}.${suffix}`);
}

function runCommand(command, commandArgs) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, commandArgs, {
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} ${commandArgs.join(' ')} exited with ${code}`));
      }
    });
    child.on('error', reject);
  });
}

function parseArgs(argv) {
  const parsed = {
    baseUrl: undefined,
    seedDemo: process.env.NETWORKING_SMOKE_SEED === '1',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--base-url') {
      parsed.baseUrl = argv[index + 1];
      index += 1;
    } else if (arg.startsWith('--base-url=')) {
      parsed.baseUrl = arg.slice('--base-url='.length);
    } else if (arg === '--seed-demo') {
      parsed.seedDemo = true;
    } else if (arg === '--no-seed-demo') {
      parsed.seedDemo = false;
    } else if (arg === '--help' || arg === '-h') {
      console.log(`Usage: node scripts/networking-smoke.mjs [--base-url URL] [--seed-demo]

Environment:
  NETWORKING_API_BASE_URL   API root or origin. /api/v1 is appended when omitted.
  NETWORKING_SMOKE_SEED=1   Seed Packet 9 demo data before running the smoke.
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

function getClaimTokenFromUrl(claimUrl) {
  return String(claimUrl ?? '').split('/').filter(Boolean).at(-1);
}

function assertArrayHas(rows, predicate, label) {
  if (!Array.isArray(rows)) {
    throw new Error(`Expected an array while looking for ${label}: ${snippet(rows)}`);
  }
  if (!rows.some(predicate)) {
    throw new Error(`Could not find ${label}. Response snippet: ${snippet(rows)}`);
  }
}

function snippet(value) {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return text.length > 900 ? `${text.slice(0, 900)}...` : text;
}
