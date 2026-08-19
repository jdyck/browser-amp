import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: '/browser-amp/',
  plugins: [tailwindcss()],
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
  },
});
