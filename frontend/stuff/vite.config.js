import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const BACKEND = process.env.VITE_PROXY_TARGET || 'http://localhost:3000';

const API_PREFIXES = [
  '/auth', '/me', '/citizens', '/identity',
  '/services', '/departments',
  '/applications', '/payments', '/documents',
  '/appointments', '/queue',
  '/notifications', '/receipts',
  '/admin', '/audit-logs',
  '/health', '/openapi.json', '/docs',
];

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: Object.fromEntries(
      API_PREFIXES.map((p) => [p, { target: BACKEND, changeOrigin: true }])
    ),
  },
});