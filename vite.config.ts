import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: '/browser-amp/',
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
  },
});
