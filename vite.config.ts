import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Relative base so the production build can be served from any static path.
export default defineConfig({
  base: './',
  plugins: [react()],
  server: { port: 5173, host: true },
  preview: { port: 4173, host: true },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    testTimeout: 60000,
  },
});
