import { defineConfig } from 'vite';

const commit = process.env.VERCEL_GIT_COMMIT_SHA;
const gameBuild = commit && /^[a-f0-9]{40}$/i.test(commit) ? `world-v2-${commit.slice(0,12)}` : 'world-v2-control-1';

export default defineConfig({
  define: { __GAME_BUILD__: JSON.stringify(gameBuild) },
  build: { rollupOptions: { input: ['index.html', 'control-center.html'] } },
  server: {
    host: '0.0.0.0',
    port: 3000,
    allowedHosts: true,
  },
  preview: {
    host: '0.0.0.0',
    port: 3000,
  },
});
