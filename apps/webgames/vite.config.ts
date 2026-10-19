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
    // Same-origin proxy so a tunnelled dev server (ngrok) reaches the local API without CORS.
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
  // Rollup cannot see through core's CJS `__exportStar` re-exports, so interop must cover the linked package.
  optimizeDeps: { include: ['@gaming-platform/core'] },
  build: {
    commonjsOptions: { include: [new RegExp(coreDist), /node_modules/] },
  },
});
