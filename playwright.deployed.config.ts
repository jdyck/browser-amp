import { defineConfig } from '@playwright/test';
import { productionSmokeTests } from './playwright.smoke';

const deploymentUrl = process.env.PLAYWRIGHT_BASE_URL;

if (deploymentUrl === undefined) {
  throw new Error('PLAYWRIGHT_BASE_URL is required for the deployed production smoke test.');
}

export default defineConfig({
  ...productionSmokeTests,
  use: { baseURL: deploymentUrl.endsWith('/') ? deploymentUrl : `${deploymentUrl}/` },
});
