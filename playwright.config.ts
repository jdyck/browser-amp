import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testIgnore: 'production-assets.spec.ts',
  webServer: { command: 'npm run dev -- --host 127.0.0.1 --port 4173', port: 4173, reuseExistingServer: false },
  use: { baseURL: 'http://127.0.0.1:4173' },
});
