import { expect, test } from '@playwright/test';
import { openSection, resetControlsFrom } from '../support/audioBrowser';

test('starts disconnected with monitoring unavailable', async ({ page }) => {
  await page.goto('./');

  await expect(page.getByRole('status')).toContainText('Disconnected');
  await expect(page.getByRole('button', { name: 'Enable Monitoring' })).toBeDisabled();
  await expect(page.getByRole('progressbar', { name: 'Input level' })).toHaveAttribute('aria-valuenow', '-60');
});

test('keeps monitoring and meters in the top bar while routing selectors stay in their sections', async ({ page }) => {
  await page.goto('./');

  await expect(page.locator('.topbar').getByRole('progressbar', { name: 'Input level' })).toBeVisible();
  await expect(page.locator('.topbar').getByRole('progressbar', { name: 'Output level' })).toBeVisible();
  await expect(page.locator('.topbar').getByLabel('Input device')).toHaveCount(0);
  await expect(page.getByLabel('Input device')).toBeVisible();
  await openSection(page, 'Master');
  await expect(page.getByLabel('Output device')).toBeVisible();
  await expect(page.locator('.topbar').getByLabel('Output device')).toHaveCount(0);
});

test('persists and resets the Noise Suppression controls', async ({ page }) => {
  await page.goto('./');
  const section = page.getByRole('region', { name: 'Noise Suppression' });
  const enabled = section.getByRole('checkbox', { name: 'Enable Noise Suppression' });
  const threshold = section.getByLabel('Threshold value');
  const range = section.getByLabel('Range value');
  const release = section.getByLabel('Release value');
  await expect(enabled).toBeChecked();
  await expect(threshold).toHaveValue('-55.0');
  await expect(range).toHaveValue('9.0');
  await expect(release).toHaveValue('200');

  await threshold.fill('-37.2');
  await range.fill('15.5');
  await release.fill('640');
  await enabled.uncheck();
  await page.reload();
  await expect(threshold).toHaveValue('-37.2');
  await expect(range).toHaveValue('15.5');
  await expect(release).toHaveValue('640');
  await expect(enabled).not.toBeChecked();

  await resetControlsFrom(page, 'Input');
  await expect(threshold).toHaveValue('-55.0');
  await expect(range).toHaveValue('9.0');
  await expect(release).toHaveValue('200');
  await expect(enabled).toBeChecked();
});

