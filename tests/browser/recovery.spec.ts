import { expect, test } from '@playwright/test';
import { installAudioBrowser, openSection } from '../support/audioBrowser';

test('shows browser-visible output routing and clears a latched post-Master CLIP', async ({ page }) => {
  await installAudioBrowser(page, { clipOnce: true, outputSelection: true });
  await page.goto('./');
  await page.getByRole('button', { name: 'Connect Input' }).click();

  await openSection(page, 'Master');
  await page.getByLabel('Output device').selectOption('headphones');
  await expect.poll(() => page.evaluate(() => (window as Window & { selectedSink?: string }).selectedSink)).toBe('headphones');
  await openSection(page, 'Compression');
  await expect(page.getByLabel('Compression reduction')).toHaveText('0.0 dB');
  await page.getByLabel('Enable Compression').check();
  await expect(page.getByLabel('Compression reduction')).toHaveText('4.0 dB');
  await page.getByLabel('Enable Compression').uncheck();
  await expect(page.getByLabel('Compression reduction')).toHaveText('0.0 dB');
  await openSection(page, 'Master');
  await expect(page.locator('#clip-indicator')).toHaveAttribute('aria-hidden', 'false');
  await page.getByRole('button', { name: 'Clear CLIP' }).click();
  await expect(page.locator('#clip-indicator')).toHaveAttribute('aria-hidden', 'true');
});

test('keeps the input selector mounted while the meter updates', async ({ page }) => {
  await installAudioBrowser(page);
  await page.goto('./');
  await page.getByRole('button', { name: 'Connect Input' }).click();

  const selector = page.getByLabel('Input device');
  await expect(selector).toBeVisible();
  await selector.evaluate((element) => element.setAttribute('data-regression-node', 'original'));
  await page.waitForTimeout(100);

  await expect(selector).toHaveAttribute('data-regression-node', 'original');
});

test('offers a keyboard-accessible retry after permission denial on a narrow layout', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await installAudioBrowser(page, { permissionDenied: true });
  await page.goto('./');

  await page.getByRole('button', { name: 'Connect Input' }).click();

  await expect(page.getByRole('status')).toContainText('Connection interrupted');
  await expect(page.getByRole('alert')).toContainText('Allow access in browser settings');
  const retry = page.getByRole('button', { name: 'Try Again' });
  await retry.focus();
  await retry.press('Enter');
  await expect.poll(() => page.evaluate(() => (window as Window & { captureRequests?: number }).captureRequests)).toBe(2);
  const bounds = await retry.boundingBox();
  expect(bounds).not.toBeNull();
  expect((bounds?.x ?? 0) + (bounds?.width ?? 0)).toBeLessThanOrEqual(320);
});

test('stays muted through active-input unplug and replug until explicit reconnection', async ({ page }) => {
  await installAudioBrowser(page);
  await page.goto('./');
  await page.getByLabel('Input Trim value').fill('7');
  await page.getByRole('button', { name: 'Connect Input' }).click();
  await page.getByRole('button', { name: 'Enable Monitoring' }).click();
  await page.getByRole('button', { name: 'Checked — Enable Monitoring' }).click();

  await page.evaluate(() => (window as Window & { setInputConnected?: (connected: boolean) => void }).setInputConnected?.(false));

  await expect(page.getByRole('status')).toContainText('Connection interrupted');
  await expect(page.getByRole('alert')).toContainText('active input device was disconnected');
  await expect(page.getByRole('button', { name: 'Reconnect Input' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Enable Monitoring' })).toBeDisabled();
  await expect(page.getByLabel('Input Trim value')).toHaveValue('7.0');
  await expect.poll(() => page.evaluate(() => (window as Window & { captureRequests?: number }).captureRequests)).toBe(1);

  await page.evaluate(() => (window as Window & { setInputConnected?: (connected: boolean) => void }).setInputConnected?.(true));
  await expect(page.getByLabel('Input device')).toContainText('iRig HD 2');
  await expect(page.getByRole('status')).toContainText('Connection interrupted');
  await page.getByRole('button', { name: 'Reconnect Input' }).click();

  await expect(page.getByRole('status')).toContainText('Connected — muted');
  await expect(page.getByRole('button', { name: 'Enable Monitoring' })).toBeEnabled();
  await expect(page.getByLabel('Input Trim value')).toHaveValue('7.0');
  await expect.poll(() => page.evaluate(() => (window as Window & { captureRequests?: number }).captureRequests)).toBe(2);
});

test('does not restart monitoring across background and foreground suspension', async ({ page }) => {
  await installAudioBrowser(page);
  await page.goto('./');
  await page.getByRole('button', { name: 'Connect Input' }).click();
  await page.getByRole('button', { name: 'Enable Monitoring' }).click();
  await page.getByRole('button', { name: 'Checked — Enable Monitoring' }).click();
  await expect.poll(() => page.evaluate(() => (window as Window & { resumeRequests?: number }).resumeRequests)).toBe(1);

  await page.evaluate(() => (window as Window & { simulateBackground?: () => void }).simulateBackground?.());

  await openSection(page, 'Master');
  await expect(page.getByText('Audio was suspended by the browser')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Resume Monitoring' })).toBeVisible();
  await page.evaluate(() => (window as Window & { simulateForeground?: () => void }).simulateForeground?.());
  await expect(page.getByRole('button', { name: 'Resume Monitoring' })).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as Window & { resumeRequests?: number }).resumeRequests)).toBe(1);

  await page.getByRole('button', { name: 'Resume Monitoring' }).click();
  await expect(page.getByRole('button', { name: 'Disable Monitoring' })).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as Window & { resumeRequests?: number }).resumeRequests)).toBe(2);
});

test('requires an explicit output choice and monitoring action after output loss', async ({ page }) => {
  await installAudioBrowser(page, { outputSelection: true });
  await page.goto('./');
  await page.getByRole('button', { name: 'Connect Input' }).click();
  await openSection(page, 'Master');
  await page.getByLabel('Output device').selectOption('headphones');
  await page.getByRole('button', { name: 'Enable Monitoring' }).click();
  await page.getByRole('button', { name: 'Checked — Enable Monitoring' }).click();

  await page.evaluate(() => (window as Window & { setOutputConnected?: (connected: boolean) => void }).setOutputConnected?.(false));

  await expect(page.getByText('selected output device was disconnected')).toBeVisible();
  await expect(page.getByLabel('Output device')).toContainText('Unavailable output');
  await expect(page.getByRole('button', { name: 'Choose Output Before Monitoring' })).toBeDisabled();

  await page.evaluate(() => (window as Window & { setOutputConnected?: (connected: boolean) => void }).setOutputConnected?.(true));
  await expect(page.getByText('selected output device was disconnected')).toBeVisible();
  await page.getByRole('button', { name: 'Retry Selected Output' }).click();
  await expect(page.getByRole('button', { name: 'Enable Monitoring' })).toBeEnabled();
  await expect(page.locator('#monitoring-state')).toHaveText('Off');
  await page.getByRole('button', { name: 'Enable Monitoring' }).click();
  await expect(page.getByRole('button', { name: 'Disable Monitoring' })).toBeVisible();
});

test('surfaces an actionable routing failure and remains muted', async ({ page }) => {
  await installAudioBrowser(page, { outputSelection: true, routingFailure: true });
  await page.goto('./');
  await page.getByRole('button', { name: 'Connect Input' }).click();

  await openSection(page, 'Master');
  await page.getByLabel('Output device').selectOption('headphones');

  await expect(page.getByText('browser could not route audio to that output')).toBeVisible();
  await expect(page.locator('#monitoring-state')).toHaveText('Off');
  await expect(page.getByRole('button', { name: 'Retry Selected Output' })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Choose Output Before Monitoring' })).toBeDisabled();
});

test('keeps exact controls keyboard-operable and section navigation usable on a narrow layout', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto('./');

  await openSection(page, 'EQ');
  const studioEq = page.getByRole('region', { name: 'Studio EQ' });
  const lowSlider = studioEq.getByLabel('Low slider');
  await lowSlider.focus();
  await lowSlider.press('ArrowRight');
  await expect(studioEq.getByLabel('Low value')).toHaveValue('0.1');

  await expect(page.locator('.stage-link').evaluateAll((links) => links.map((link) => link.textContent?.trim()))).resolves.toEqual([
    '1Input', '2Amp + Cabinet', '3Compression', '4EQ', '5Reverb', '6Master',
  ]);
  await openSection(page, 'Compression');
  const amountBounds = await page.getByLabel('Amount value').boundingBox();
  expect(amountBounds).not.toBeNull();
  expect((amountBounds?.x ?? 0) + (amountBounds?.width ?? 0)).toBeLessThanOrEqual(320);
});
