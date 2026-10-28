import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Chunks grouped by how often they change, so a deploy that only touches the interface
// leaves the libraries, the simulation, the map data and the art cached in the browser.
// Every chunk is still loaded at start (no runtime fetches beyond the page's own files).
const CHUNKS: [name: string, test: RegExp][] = [
  ['react', /node_modules[\\/](react|react-dom|scheduler)[\\/]/],
  ['map-libs', /node_modules[\\/](d3-[a-z]+|topojson-client|internmap|delaunator|robust-predicates)[\\/]/],
  ['map-data', /src[\\/]assets[\\/]map[\\/]/],
  ['sim', /src[\\/]sim[\\/]/],
  ['art', /src[\\/]ui[\\/]art[\\/]/],
];

// Relative base so the production build can be served from any static path.
export default defineConfig({
  base: './',
  plugins: [react()],
  server: { port: 5173, host: true },
  preview: { port: 4173, host: true },
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: CHUNKS.map(([name, test]) => ({ name, test })),
        },
      },
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    testTimeout: 60000,
    // Some suites play short campaigns in beforeAll.
    hookTimeout: 60000,
  },
});
