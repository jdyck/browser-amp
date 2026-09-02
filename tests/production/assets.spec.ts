import { expect, test } from '@playwright/test';

test('loads the production app and its generated assets from the repository path', async ({ page }) => {
  const failedRequests: string[] = [];
  const errorResponses: string[] = [];
  const browserErrors: string[] = [];
  page.on('requestfailed', (request) => failedRequests.push(request.url()));
  page.on('response', (response) => {
    if (response.status() >= 400) errorResponses.push(`${response.status()} ${response.url()}`);
  });
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text());
  });
  page.on('pageerror', (error) => browserErrors.push(error.message));

  await page.goto('./');
  await expect(page.getByLabel('Browser Amp', { exact: true })).toBeVisible();

  const assetPaths = await page.locator('script[src], link[rel="stylesheet"][href]').evaluateAll((elements) => (
    elements.map((element) => {
      const assetUrl = element instanceof HTMLScriptElement ? element.src : (element as HTMLLinkElement).href;
      return new URL(assetUrl).pathname;
    })
  ));

  expect(assetPaths.length).toBeGreaterThan(0);
  expect(assetPaths).toEqual(assetPaths.map(() => expect.stringMatching(/^\/browser-amp\//)));
  expect(failedRequests).toEqual([]);
  expect(errorResponses).toEqual([]);
  expect(browserErrors).toEqual([]);
});
