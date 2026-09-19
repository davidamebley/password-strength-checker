import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    sourcemap: false,
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
  },
});
