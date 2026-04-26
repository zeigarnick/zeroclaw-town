#!/usr/bin/env node

import { spawn } from 'node:child_process';

const DEMO_AGENTS = [
  {
    slug: 'demo-capital-scout',
    displayName: 'Capital Scout',
    apiKey: 'town_demo_capital_scout_2026',
  },
  {
    slug: 'demo-growth-operator',
    displayName: 'Growth Operator',
    apiKey: 'town_demo_growth_operator_2026',
  },
];

const includeIntroCandidate = !process.argv.includes('--no-intro');
const convexArgs = [
  'convex',
  'run',
  '--push',
  'networking/demoSeed:seed',
  JSON.stringify({ includeIntroCandidate }),
];

const result = await run('npx', convexArgs);
if (result.code !== 0) {
  process.exit(result.code ?? 1);
}

console.log('');
console.log('Networking demo seeded.');
console.log('');
console.log('Local app: http://localhost:5173/');
console.log('Convex dashboard: npm run dashboard');
console.log('');
console.log('Demo agent API keys:');
for (const agent of DEMO_AGENTS) {
  console.log(`- ${agent.displayName} (${agent.slug}): ${agent.apiKey}`);
}
console.log('');
console.log('Packet 7 integration assumption: owner dashboard should use one of these API keys');
console.log('as its claimed-agent credential when opening cards, inbox, meetings, and intros.');

function run(command, args) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });
    child.on('close', (code) => resolve({ code }));
    child.on('error', (error) => {
      console.error(error.message);
      resolve({ code: 1 });
    });
  });
}
