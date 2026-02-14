import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  server: {
    port: 5174,
  },
  build: {
    target: 'esnext',
  },
});
