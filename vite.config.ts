import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Relative base so the production build can be served from any static path.
export default defineConfig({
  base: './',
  plugins: [react()],
  server: { port: 5173, host: true },
  preview: { port: 4173, host: true },
  // The bundled map data (~150 KB) and the SVG unit and city art (~180 KB) live in the
  // main chunk on purpose: no runtime fetches. Code-splitting is on the roadmap (M3).
  build: { chunkSizeWarningLimit: 950 },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    testTimeout: 60000,
  },
});
