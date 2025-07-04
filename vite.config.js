import { defineConfig } from 'vite';
import tsconfigPaths from 'vite-tsconfig-paths';
import path from 'path';

// Fix: Load remix plugin from CommonJS module
import remixPlugin from '@remix-run/dev';
const { remix } = remixPlugin;

export default defineConfig({
  plugins: [remix(), tsconfigPaths()],
  resolve: {
    alias: {
      '~': path.resolve(__dirname, 'app'),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 3000,
    strictPort: true,
    hmr: {
      protocol: 'wss',
      host: process.env.HMR_HOST || 'localhost',
      port: 443,
    },
  },
});