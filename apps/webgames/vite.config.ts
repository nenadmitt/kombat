import { createRequire } from 'node:module';
import { dirname } from 'node:path';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const require = createRequire(import.meta.url);
const coreDist = dirname(require.resolve('@gaming-platform/core'));

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Tunnelling the dev server (ngrok et al) for phone testing: the app and
    // the API have to share one origin, or every call is cross-origin to a
    // host the browser has no CORS grant for. Point VITE_API_URL at the
    // tunnel's own URL and these forward to the local server.
    allowedHosts: ['.ngrok-free.app', '.ngrok.app', '.trycloudflare.com'],
    proxy: {
      '/api': { target: 'http://localhost:3000', changeOrigin: true },
      '/socket.io': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        ws: true,
      },
    },
  },
  // Core ships CommonJS (server and Metro both need it). Rollup cannot see
  // through its `__exportStar` re-exports, so the CJS interop has to be told
  // to cover the linked workspace package as well as node_modules.
  optimizeDeps: { include: ['@gaming-platform/core'] },
  build: {
    commonjsOptions: { include: [new RegExp(coreDist), /node_modules/] },
  },
});
