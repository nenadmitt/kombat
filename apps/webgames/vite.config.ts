import { createRequire } from 'node:module';
import { dirname } from 'node:path';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const require = createRequire(import.meta.url);
const coreDist = dirname(require.resolve('@gaming-platform/core'));

export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
  // Core ships CommonJS (server and Metro both need it). Rollup cannot see
  // through its `__exportStar` re-exports, so the CJS interop has to be told
  // to cover the linked workspace package as well as node_modules.
  optimizeDeps: { include: ['@gaming-platform/core'] },
  build: {
    commonjsOptions: { include: [new RegExp(coreDist), /node_modules/] },
  },
});
