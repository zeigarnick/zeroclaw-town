import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const configuredPort = process.env.PORT ?? process.env.CODEX_WORKTREE_PORT;
const worktreePort = configuredPort ? Number.parseInt(configuredPort, 10) : 5173;

// https://vitejs.dev/config/
export default defineConfig({
  base: '/ai-town',
  plugins: [react()],
  server: {
    allowedHosts: ['ai-town-your-app-name.fly.dev', 'localhost', '127.0.0.1'],
    port: Number.isFinite(worktreePort) ? worktreePort : 5173,
    strictPort: Boolean(configuredPort),
  },
});
