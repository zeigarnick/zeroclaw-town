import { spawnSync } from 'node:child_process';

const FALLBACK_CONVEX_URL = 'https://youthful-sockeye-531.convex.cloud';

const hasDeployKey = Boolean(process.env.CONVEX_DEPLOY_KEY);
const command = hasDeployKey ? ['npm', 'run', 'build:vercel'] : ['npm', 'run', 'build'];
const env = { ...process.env };

if (!hasDeployKey && !env.VITE_CONVEX_URL) {
  env.VITE_CONVEX_URL = FALLBACK_CONVEX_URL;
  console.warn(
    `CONVEX_DEPLOY_KEY is not set; running frontend-only Vite build against ${FALLBACK_CONVEX_URL}. This deploy does not push Convex functions.`,
  );
}

const result = spawnSync(command[0], command.slice(1), {
  env,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

if (result.error) {
  console.error(result.error);
  process.exit(1);
}

process.exit(result.status ?? 1);
