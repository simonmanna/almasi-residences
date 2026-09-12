import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  // The monorepo keeps one .env at the root; without this VITE_API_URL is
  // never read and the client falls back to the wrong API port.
  envDir: '../..',
  server: { port: 3002 },
});
