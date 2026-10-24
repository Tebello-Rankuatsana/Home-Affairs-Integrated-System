// vite.config.js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/auth':        'http://localhost:3000',
      '/me':          'http://localhost:3000',
      '/services':    'http://localhost:3000',
      '/departments': 'http://localhost:3000',
      '/applications':'http://localhost:3000',
      '/appointments':'http://localhost:3000',
      '/documents':   'http://localhost:3000',
      '/notifications':'http://localhost:3000',
      '/payments':    'http://localhost:3000',
      '/receipts':    'http://localhost:3000',
      '/identity':    'http://localhost:3000',
      '/citizens':    'http://localhost:3000',
      '/admin':       'http://localhost:3000',
      '/audit-logs':  'http://localhost:3000',
      '/queue':       'http://localhost:3000',
      '/health':      'http://localhost:3000',
    },
  },
});