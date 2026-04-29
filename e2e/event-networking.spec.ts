import * as crypto from 'node:crypto';
import { expect, Page, Route, test } from '@playwright/test';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
dotenv.config();

type EventAgentRegistration = {
  eventId: string;
  eventAgentId: string;
  ownerSessionToken: string;
  ownerReviewPath: string;
};

const appUrl =
  process.env.EVENT_NETWORKING_E2E_APP_URL ??
  process.env.NETWORKING_E2E_APP_URL ??
  process.env.PLAYWRIGHT_BASE_URL ??
  process.env.E2E_BASE_URL ??
  'http://localhost:5173/ai-town';
const apiBaseUrl = normalizeApiBaseUrl(
  process.env.EVENT_NETWORKING_API_BASE_URL ??
    process.env.NETWORKING_API_BASE_URL ??
    process.env.VITE_NETWORKING_API_BASE_URL ??
    process.env.CONVEX_SITE_URL ??
    convertConvexUrlToSite(process.env.VITE_CONVEX_URL),
);
const eventId =
  process.env.EVENT_NETWORKING_E2E_EVENT_ID ??
  `event-e2e-${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`;

test.skip(!apiBaseUrl, 'Set EVENT_NETWORKING_API_BASE_URL, NETWORKING_API_BASE_URL, CONVEX_SITE_URL, or VITE_CONVEX_URL.');

test('event networking registration review, inbound reveal, and town smoke', async ({ page }) => {
  const runId = `event-e2e-${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`;
  const reviewer = await registerEventAgent(`${runId}-reviewer`, {
    role: 'Founder',
    category: 'climate',
    offers: ['Pilot customer discovery'],
    wants: ['Event introductions'],
    lookingFor: 'People open to an event follow-up after a short owner review.',
    hobbies: ['walking meetings'],
    interests: ['climate', 'community'],
    favoriteMedia: ['field notes'],
  });

  await installNetworkingApiProxy(page);
  await page.goto(buildAppRoute(`/event-review/${eventId}/${encodeURIComponent(reviewer.ownerSessionToken)}`));
  await expect(page.getByRole('heading', { name: /Cedar|River|Signal|Orbit|Harbor|Pixel|Meadow/ })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByText('Owner review', { exact: true })).toBeVisible();
  await expect(page.getByText('Pilot customer discovery')).toBeVisible();
  await page.getByRole('button', { name: 'Approve' }).click();
  await expect(page.getByText('Approved')).toBeVisible({ timeout: 30_000 });

  const requester = await registerAndApproveEventAgent(`${runId}-requester`, {
    role: 'Founder',
    category: 'fintech',
    offers: ['Treasury automation buyer insight', 'Seed fundraising context'],
    wants: ['Investor introductions', 'GTM feedback'],
    lookingFor: 'Operator help with finance buyer messaging before an event follow-up.',
    hobbies: ['coffee chats'],
    interests: ['fintech', 'b2b sales'],
    favoriteMedia: ['operator memos'],
  });
  const target = await registerAndApproveEventAgent(`${runId}-target`, {
    role: 'Operator',
    category: 'fintech',
    offers: ['Investor introductions', 'GTM feedback'],
    wants: ['Promising fintech founder conversations'],
    lookingFor: 'Founders with a crisp fintech wedge and an active event ask.',
    hobbies: ['demo days'],
    interests: ['fintech', 'go to market'],
    favoriteMedia: ['fundraising teardown notes'],
  });
  await upsertPrivateContact(requester, {
    realName: `E2E Requester ${runId}`,
    email: `${runId}-requester@example.com`,
    company: 'OpenNetwork E2E',
  });
  await upsertPrivateContact(target, {
    realName: `E2E Target ${runId}`,
    email: `${runId}-target@example.com`,
    company: 'OpenNetwork E2E',
  });
  const intent = await createConnectionIntent(requester, target);

  await page.goto(
    buildAppRoute(
      `/event-inbound/${eventId}/${encodeURIComponent(target.eventAgentId)}/${encodeURIComponent(
        target.ownerSessionToken,
      )}`,
    ),
  );
  await expect(page.getByRole('heading', { name: 'Connection intents' })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByText('Pending')).toBeVisible();
  await expect(page.getByText('Treasury automation buyer insight')).toBeVisible();
  await page.getByRole('button', { name: 'Approve reveal' }).click();
  await expect(page.getByText('No allowed inbound requests are waiting for review.')).toBeVisible({
    timeout: 30_000,
  });
  const reveal = await api('GET', `/events/${eventId}/contact-reveals/${intent.id}`, {
    ownerSessionToken: requester.ownerSessionToken,
  });
  expect(reveal.requesterContact.email).toBe(`${runId}-requester@example.com`);
  expect(reveal.targetContact.email).toBe(`${runId}-target@example.com`);

  await page.goto(buildAppRoute('/'));
  await expect(page.getByRole('link', { name: 'Open skill.md' })).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('canvas').first()).toBeVisible({ timeout: 30_000 });
  await expect.poll(() => getCanvasSnapshotSize(page), { timeout: 30_000 }).toBeGreaterThan(1_000);
  await expect(page.getByText('Matches')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('button', { name: 'Dashboard' })).toHaveCount(0);
  await expect(page.getByText('Match recommendations')).toHaveCount(0);
});

async function registerAndApproveEventAgent(slug: string, publicCard: Record<string, unknown>) {
  const registered = await registerEventAgent(slug, publicCard);
  await api('POST', `/events/${eventId}/owner-sessions/${registered.ownerSessionToken}/approve`, {
    body: {},
  });
  return registered;
}

async function registerEventAgent(
  slug: string,
  publicCard: Record<string, unknown>,
): Promise<EventAgentRegistration> {
  return await api('POST', `/events/${eventId}/register`, {
    body: {
      agentIdentifier: slug,
      publicCard,
      avatarConfig: {
        hair: 'short',
        skinTone: 'tone-3',
        clothing: 'blazer',
      },
    },
  });
}

async function upsertPrivateContact(
  agent: EventAgentRegistration,
  contact: Record<string, unknown>,
) {
  await api('POST', `/events/${eventId}/agents/${agent.eventAgentId}/private-contact`, {
    ownerSessionToken: agent.ownerSessionToken,
    body: { contact },
  });
}

async function createConnectionIntent(
  requester: EventAgentRegistration,
  target: EventAgentRegistration,
) {
  return await api('POST', `/events/${eventId}/connection-intents`, {
    ownerSessionToken: requester.ownerSessionToken,
    body: {
      requesterAgentId: requester.eventAgentId,
      targetAgentId: target.eventAgentId,
    },
  });
}

async function api(method: 'GET' | 'POST', path: string, options: {
  ownerSessionToken?: string;
  body?: Record<string, unknown>;
} = {}) {
  if (!apiBaseUrl) {
    throw new Error('Missing event networking API base URL.');
  }
  const headers: Record<string, string> = {
    Accept: 'application/json',
  };
  if (options.ownerSessionToken) {
    headers.Authorization = `Bearer ${options.ownerSessionToken}`;
  }
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const payload = await response.json();
  if (!response.ok || payload?.success !== true) {
    throw new Error(`${method} ${path} failed with ${response.status}: ${JSON.stringify(payload)}`);
  }
  return payload.data;
}

async function getCanvasSnapshotSize(page: Page) {
  return await page.locator('canvas').first().evaluate((canvas) => {
    try {
      return (canvas as HTMLCanvasElement).toDataURL('image/png').length;
    } catch {
      return 0;
    }
  });
}

async function installNetworkingApiProxy(page: Page) {
  await page.route(/\/api\/v1(?:\/|$)/, forwardApiRequest);
}

async function forwardApiRequest(route: Route) {
  if (!apiBaseUrl) {
    await route.continue();
    return;
  }

  const request = route.request();
  const requestUrl = new URL(request.url());
  const apiPathIndex = requestUrl.pathname.indexOf('/api/v1');
  const apiPath = requestUrl.pathname.slice(apiPathIndex + '/api/v1'.length);
  const targetUrl = `${apiBaseUrl}${apiPath}${requestUrl.search}`;
  const requestHeaders = request.headers();
  const headers: Record<string, string> = {
    Accept: requestHeaders.accept ?? 'application/json',
  };
  if (requestHeaders.authorization) {
    headers.Authorization = requestHeaders.authorization;
  }
  if (requestHeaders['content-type']) {
    headers['Content-Type'] = requestHeaders['content-type'];
  }

  const response = await fetch(targetUrl, {
    method: request.method(),
    headers,
    body: request.method() === 'GET' || request.method() === 'HEAD' ? undefined : request.postData(),
  });
  const responseHeaders: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    responseHeaders[key] = value;
  });
  delete responseHeaders['content-encoding'];
  delete responseHeaders['content-length'];
  delete responseHeaders['transfer-encoding'];

  await route.fulfill({
    status: response.status,
    headers: responseHeaders,
    body: Buffer.from(await response.arrayBuffer()),
  });
}

function buildAppRoute(path: string) {
  const url = new URL(appUrl);
  const basePath = url.pathname.replace(/\/+$/, '');
  if (path === '/') {
    url.pathname = basePath || '/';
  } else {
    url.pathname = `${basePath}${path}`;
  }
  url.search = '';
  url.hash = '';
  return url.toString();
}

function normalizeApiBaseUrl(value: string | undefined) {
  if (!value) {
    return undefined;
  }
  const trimmed = value.replace(/\/+$/, '');
  return trimmed.endsWith('/api/v1') ? trimmed : `${trimmed}/api/v1`;
}

function convertConvexUrlToSite(value: string | undefined) {
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
