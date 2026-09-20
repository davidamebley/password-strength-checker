import { defineConfig } from 'vite';

export default defineConfig({
  // Relative asset paths so the built site works from any path, including a
  // GitHub Pages project subpath, without knowing the repository name.
  base: './',
  build: {
    sourcemap: false,
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
  },
});
