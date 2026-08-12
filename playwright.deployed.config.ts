import { defineConfig } from '@playwright/test';

const deploymentUrl = process.env.PLAYWRIGHT_BASE_URL;

if (deploymentUrl === undefined) {
  throw new Error('PLAYWRIGHT_BASE_URL is required for the deployed production smoke test.');
}

export default defineConfig({
  testDir: './tests',
  testMatch: ['app.spec.ts', 'production-assets.spec.ts'],
  use: { baseURL: deploymentUrl.endsWith('/') ? deploymentUrl : `${deploymentUrl}/` },
});
