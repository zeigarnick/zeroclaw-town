import { spawn } from 'node:child_process';
import { expect, Page, Route, test } from '@playwright/test';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
dotenv.config();

const DEMO_KEYS = {
  capitalScout: 'town_demo_capital_scout_2026',
  growthOperator: 'town_demo_growth_operator_2026',
};

const appUrl =
  process.env.NETWORKING_E2E_APP_URL ??
  process.env.PLAYWRIGHT_BASE_URL ??
  process.env.E2E_BASE_URL ??
  'http://localhost:5173/';
const apiBaseUrl = normalizeApiBaseUrl(
  process.env.NETWORKING_API_BASE_URL ??
    process.env.VITE_NETWORKING_API_BASE_URL ??
    process.env.CONVEX_SITE_URL ??
    convertConvexUrlToSite(process.env.VITE_CONVEX_URL),
);

test.beforeAll(async () => {
  if (process.env.NETWORKING_E2E_SKIP_SEED === '1') {
    return;
  }

  await runCommand('npx', [
    'convex',
    'run',
    '--push',
    'networking/demoSeed:seed',
    JSON.stringify({ includeIntroCandidate: true }),
  ]);
});

test('agentic networking MVP dashboard and town smoke', async ({ page }) => {
  await installNetworkingApiProxy(page);
  await page.goto(appUrl);

  await expect(page.getByRole('heading', { name: 'AI Town' })).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('canvas').first()).toBeVisible({ timeout: 30_000 });
  await expect.poll(() => getCanvasSnapshotSize(page), { timeout: 30_000 }).toBeGreaterThan(1_000);

  await page.getByRole('button', { name: 'Dashboard' }).click();
  await expect(page.getByRole('heading', { name: 'Owner Dashboard' })).toBeVisible();

  await page.getByRole('button', { name: 'Capital Scout' }).click();
  await expect(page.getByText(`Active: Capital Scout | ${DEMO_KEYS.capitalScout}`)).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByRole('heading', { name: 'Cards' })).toBeVisible();
  await expect(page.getByText('Need warm fintech investor intros')).toBeVisible();
  await expect(page.getByRole('heading', { name: /Inbox Events/ })).toBeVisible();
  await expect(page.getByText('match_recommendation').first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Meetings' })).toBeVisible();
  await expect(page.getByText('accepted').first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Conversations' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Intro Candidates' })).toBeVisible();
  await expect(
    page.getByText('Both agents agreed there is a timely fit for fintech investor introductions and pitch review.'),
  ).toBeVisible();

  await selectFirstConversation(page);
  await expect(
    page.getByText('The founder is raising in early May and wants feedback on the fintech wedge before investor calls.'),
  ).toBeVisible();

  await page.getByRole('button', { name: 'Growth Operator' }).click();
  await expect(page.getByText(`Active: Growth Operator | ${DEMO_KEYS.growthOperator}`)).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByText('Offer fintech GTM and investor network').first()).toBeVisible();
  await expect(page.getByText('meeting_request').first()).toBeVisible();
  await expect(page.getByText('intro_candidate').first()).toBeVisible();

  await page.getByRole('button', { name: 'Back to Town' }).click();
  await expect(page.getByRole('heading', { name: 'AI Town' })).toBeVisible();
  await expect(page.locator('canvas').first()).toBeVisible({ timeout: 30_000 });
  await expect.poll(() => getCanvasSnapshotSize(page), { timeout: 30_000 }).toBeGreaterThan(1_000);
});

async function selectFirstConversation(page: Page) {
  const conversationSelect = page.locator('select').filter({
    has: page.locator('option', { hasText: 'Select conversation' }),
  });
  await expect(conversationSelect).toBeVisible();
  const values = await conversationSelect.locator('option').evaluateAll((options) =>
    options.map((option) => (option as HTMLOptionElement).value).filter(Boolean),
  );
  expect(values.length).toBeGreaterThan(0);
  await conversationSelect.selectOption(values[0]);
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
  if (!apiBaseUrl) {
    return;
  }

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
  const responseHeaders = Object.fromEntries(response.headers.entries());
  delete responseHeaders['content-encoding'];
  delete responseHeaders['content-length'];
  delete responseHeaders['transfer-encoding'];

  await route.fulfill({
    status: response.status,
    headers: responseHeaders,
    body: Buffer.from(await response.arrayBuffer()),
  });
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

function runCommand(command: string, args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} ${args.join(' ')} exited with ${code}`));
      }
    });
    child.on('error', reject);
  });
}
