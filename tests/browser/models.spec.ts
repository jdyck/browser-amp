import { expect, test } from '@playwright/test';
import { installAudioBrowser, openSection, resetControlsFrom } from '../support/audioBrowser';

test('exposes six model-specific control sets, remembers them, and switches without recapturing', async ({ page }) => {
  await installAudioBrowser(page);
  await page.goto('./');
  await openSection(page, 'Amplifier');

  const ampSection = page.getByRole('region', { name: 'Amp Model', exact: true });
  const ampModel = ampSection.getByRole('combobox', { name: 'Amp Model' });
  await expect(ampModel).toBeEnabled();
  await expect(ampModel).toHaveValue('amp.studio-clean-v1');
  await expect(ampModel.locator('option')).toHaveText([
    'Studio Clean', 'Warm Jazz Combo', 'Blackface Combo', 'High-Headroom American', 'Small Tweed Combo', 'British Chime',
  ]);
  await expect(ampSection.getByLabel('Gain value')).toHaveValue('5.0');
  await expect(ampSection.getByRole('switch', { name: 'Maximum Headroom' })).toHaveAttribute('aria-checked', 'true');
  const expectedControls = {
    'amp.studio-clean-v1': ['Gain', 'Bass', 'Middle', 'Treble', 'Maximum Headroom'],
    'amp.warm-jazz-combo-v1': ['Volume', 'Bass', 'Middle', 'Treble', 'Color', 'Low Input'],
    'amp.blackface-combo-v1': ['Volume', 'Bass', 'Treble', 'Bright'],
    'amp.high-headroom-american-v1': ['Volume', 'Bass', 'Middle', 'Treble', 'Bright', 'Ultra Headroom'],
    'amp.small-tweed-combo-v1': ['Volume', 'Tone', 'Low Input'],
    'amp.british-chime-v1': ['Volume', 'Bass', 'Treble', 'Cut', 'Top Boost'],
  } as const;
  for (const [id, labels] of Object.entries(expectedControls)) {
    await ampModel.selectOption(id);
    await expect(ampSection.locator('#amp-model-controls label')).toHaveText(labels);
  }
  await ampModel.selectOption('amp.warm-jazz-combo-v1');
  const colorTabs = ampSection.getByRole('radiogroup', { name: 'Color' });
  await expect(colorTabs.getByRole('radio')).toHaveText(['Dark', 'Normal', 'Bright']);
  await colorTabs.getByRole('radio', { name: 'Bright' }).click();
  await expect(colorTabs.getByRole('radio', { name: 'Bright' })).toHaveAttribute('aria-checked', 'true');
  const inputSwitch = ampSection.getByRole('switch', { name: 'Low Input', exact: true });
  await expect(inputSwitch).toHaveAttribute('aria-checked', 'false');
  await inputSwitch.click();
  await expect(inputSwitch).toHaveAttribute('aria-checked', 'true');
  await ampModel.selectOption('amp.studio-clean-v1');

  await ampSection.getByLabel('Gain value').fill('7');
  await ampModel.selectOption('amp.blackface-combo-v1');
  await expect(ampSection.getByLabel('Volume value')).toHaveValue('4.0');
  await expect(ampSection.getByRole('switch', { name: 'Bright' })).toHaveAttribute('aria-checked', 'false');
  await expect(ampSection.getByLabel('Middle value')).toHaveCount(0);
  await ampModel.selectOption('amp.small-tweed-combo-v1');
  await expect(ampSection.getByLabel('Volume value')).toHaveValue('3.5');
  await expect(ampSection.getByLabel('Tone value')).toHaveValue('5.0');
  await expect(ampSection.getByRole('switch', { name: 'Low Input', exact: true })).toHaveAttribute('aria-checked', 'false');
  await ampSection.getByLabel('Volume value').fill('8');
  await ampModel.selectOption('amp.studio-clean-v1');
  await expect(ampSection.getByLabel('Gain value')).toHaveValue('7.0');
  await ampModel.selectOption('amp.small-tweed-combo-v1');
  await expect(ampSection.getByLabel('Volume value')).toHaveValue('8.0');
  await expect(page.getByRole('button', { name: 'Enable Monitoring' })).toBeDisabled();

  await page.reload();
  await expect(ampModel).toHaveValue('amp.small-tweed-combo-v1');
  await openSection(page, 'Input');
  await page.getByRole('button', { name: 'Connect Input', exact: true }).click();
  await expect(page.locator('#monitoring-state')).toHaveText('Off');
  await openSection(page, 'Amplifier');
  await expect(ampModel).toHaveValue('amp.small-tweed-combo-v1');
  await page.getByRole('button', { name: 'Enable Monitoring', exact: true }).click();
  await page.getByRole('button', { name: 'Checked — Enable Monitoring' }).click();
  await ampModel.selectOption('amp.studio-clean-v1');
  await expect(page.locator('#monitoring-state')).toHaveText('On');
  await expect(ampSection.getByLabel('Gain value')).toHaveValue('7.0');
  await ampModel.selectOption('amp.blackface-combo-v1');
  await ampModel.selectOption('amp.small-tweed-combo-v1');
  await expect.poll(() => page.evaluate(() => (window as Window & { captureRequests?: number }).captureRequests)).toBe(1);
  await resetControlsFrom(page, 'Amplifier');
  await expect(ampModel).toHaveValue('amp.studio-clean-v1');
  await expect(page.locator('#monitoring-state')).toHaveText('On');
});

test('switches every cabinet voicing, persists the choice, and resets without recapturing', async ({ page }) => {
  await installAudioBrowser(page);
  await page.goto('./');
  await openSection(page, 'Amplifier');

  const cabinet = page.getByRole('combobox', { name: 'Cabinet', exact: true });
  await expect(cabinet).toHaveValue('cab.compact-jazz-1x12-v1');
  await expect(cabinet.locator('option')).toHaveText([
    'Compact 1×12 Jazz',
    'American 1×12 Open-Back',
    'American 2×12 Open-Back',
    '4×10 Open-Back',
    'Direct / Full Range',
  ]);
  await cabinet.selectOption('cab.direct-full-range-v1');
  await expect(page.getByText('Driven amps may sound unusually bright')).toBeVisible();
  await page.reload();
  await expect(cabinet).toHaveValue('cab.direct-full-range-v1');

  await openSection(page, 'Input');
  await page.getByRole('button', { name: 'Connect Input', exact: true }).click();
  await openSection(page, 'Amplifier');
  await page.getByRole('button', { name: 'Enable Monitoring', exact: true }).click();
  await page.getByRole('button', { name: 'Checked — Enable Monitoring' }).click();
  for (const id of [
    'cab.compact-jazz-1x12-v1',
    'cab.american-open-1x12-v1',
    'cab.american-open-2x12-v1',
    'cab.open-4x10-v1',
    'cab.direct-full-range-v1',
  ]) await cabinet.selectOption(id);
  await expect(page.locator('#monitoring-state')).toHaveText('On');
  await expect.poll(() => page.evaluate(() => (window as Window & { captureRequests?: number }).captureRequests)).toBe(1);

  await resetControlsFrom(page, 'Amplifier');
  await expect(cabinet).toHaveValue('cab.compact-jazz-1x12-v1');
  await expect(page.locator('#monitoring-state')).toHaveText('On');
});
