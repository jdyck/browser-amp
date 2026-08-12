import { defineConfig } from '@playwright/test';
import { productionSmokeTests } from './playwright.smoke';

export default defineConfig({
  ...productionSmokeTests,
  webServer: {
    command: 'npm run preview -- --host 127.0.0.1 --port 4174',
    port: 4174,
    reuseExistingServer: false,
  },
  use: { baseURL: 'http://127.0.0.1:4174/browser-amp/' },
});
