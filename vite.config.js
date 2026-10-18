import { defineConfig } from 'vite';
export default defineConfig({
  build: {
    rolldownOptions: {
      input: {game:'index.html',chapters:'chapters.html',algae:'algae-preview.html'},
      output: {
        codeSplitting: {
          groups: [{ name: 'three', test: /node_modules\/three/ }],
        },
      },
    },
    // Three.js is a local rendering engine, loaded once; geometry dominates payload.
    chunkSizeWarningLimit: 750,
  },
});
