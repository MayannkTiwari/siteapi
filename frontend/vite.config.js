// import { defineConfig } from 'vite';

// import react from '@vitejs/plugin-react';
// import { resolve, dirname } from 'node:path';
// import { fileURLToPath } from 'node:url';
// const __dirname = dirname(fileURLToPath(import.meta.url));
// export default defineConfig({
//   plugins: [react()],
//   server: { port: 5173, proxy: { '/api': 'http://127.0.0.1:8001', '/v1': 'http://127.0.0.1:8001' } },
//   build: { outDir: resolve(__dirname, '../static'), emptyOutDir: true }
// });

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://127.0.0.1:8001',
      '/v1': 'http://127.0.0.1:8001'
    }
  },
  build: {
    outDir: resolve(__dirname, '../static'),
    emptyOutDir: false
  }
});

