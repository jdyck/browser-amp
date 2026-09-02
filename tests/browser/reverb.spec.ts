import { expect, test } from '@playwright/test';
import { DEFAULT_AMP_CONTROLS, REVERB_PROFILES, type ReverbProfile } from '../../src/signalChain/settings';
import { DEFAULT_REVERB_SETTINGS, reverbControlEntries } from '../../src/signalChain/reverbProfiles';
import { SAVED_CONTROL_SETTINGS_STORAGE_KEY } from '../../src/preferences';
import { installAudioBrowser, openSection, resetControlsFrom } from '../support/audioBrowser';

test('switches all reverb modules, remembers bypassed selections, and resets without recapturing', async ({ page }) => {
  await installAudioBrowser(page);
  await page.goto('./');
  await openSection(page, 'Reverb');
  const module = page.getByRole('combobox', { name: 'Reverb Module' });
  const enabled = page.getByLabel('Enable Reverb');
  await expect(module).toHaveValue('studio-plate');
  await expect(module.locator('option')).toHaveText([
    'Jazz Room', 'Studio Chamber', 'Studio Plate', 'Fender Spring', 'Polytone Spring', 'Digital Room', 'Digital Hall',
  ]);
  await module.selectOption('polytone-spring');
  await page.getByLabel('Reverb value').fill('63');
  await expect(enabled).not.toBeChecked();
  await expect(page.locator('#reverb-profile-help')).toContainText('Darker, restrained');
  await page.reload();
  await expect(module).toHaveValue('polytone-spring');
  await expect(enabled).not.toBeChecked();
  await openSection(page, 'Input');
  await page.getByRole('button', { name: 'Connect Input', exact: true }).click();
  await expect(page.locator('#monitoring-state')).toHaveText('Off');
  await openSection(page, 'Reverb');
  await enabled.check();
  await page.getByRole('button', { name: 'Enable Monitoring', exact: true }).click();
  await page.getByRole('button', { name: 'Checked — Enable Monitoring' }).click();
  for (const id of ['jazz-room', 'studio-chamber', 'studio-plate', 'fender-spring', 'polytone-spring', 'digital-room', 'digital-hall']) {
    await module.selectOption(id);
    await expect(module).toHaveValue(id);
    await expect(enabled).toBeChecked();
    await expect(page.getByLabel('Reverb value')).toHaveValue('63');
    await expect(page.locator('#monitoring-state')).toHaveText('On');
  }
  await expect.poll(() => page.evaluate(() => (window as Window & { captureRequests?: number }).captureRequests)).toBe(1);
  await page.reload();
  await expect(module).toHaveValue('digital-hall');
  await expect(enabled).toBeChecked();
  await expect(page.locator('#monitoring-state')).toHaveText('Off');
  await resetControlsFrom(page, 'Reverb');
  await expect(module).toHaveValue('studio-plate');
  await expect(page.locator('#reverb-profile-help')).toContainText('original Browser Amp reverb');
  await expect(enabled).not.toBeChecked();
  await expect(page.getByLabel('Reverb value')).toHaveValue('20');
});

for (const [index, profile] of (Object.keys(REVERB_PROFILES) as ReverbProfile[]).entries()) {
  test(`resets only ${profile} while preserving other reverbs and live session state`, async ({ page }) => {
    await installAudioBrowser(page);
    await page.setViewportSize({ width: 320, height: 900 });
    const preferences = {
      version: 1,
      hardwareDirectMonitoringGuidanceDismissed: true,
      controls: {
        ...DEFAULT_AMP_CONTROLS,
        ampModel: 'amp.blackface-combo-v1', inputTrimDb: 6,
        lowShelfDb: -3, lowMidFrequencyHz: 240, lowMidDb: -2,
        upperMidFrequencyHz: 1_200, upperMidDb: 2, highShelfDb: 4,
        eqBypassed: true, compressionAmount: 72, compressionBypassed: false, masterVolumeDb: -12,
        reverbProfile: profile, reverbAmount: 63, reverbBypassed: index % 2 === 0,
        reverbSettings: Object.fromEntries((Object.keys(REVERB_PROFILES) as ReverbProfile[]).map((id) => [
          id, Object.fromEntries(reverbControlEntries(id).map(([key, definition]) => [key, definition.maximum])),
        ])),
      },
    };
    // Seed once so reload verifies the app's saved reset rather than reseeding it.
    await page.goto('./');
    await page.evaluate(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), {
      key: SAVED_CONTROL_SETTINGS_STORAGE_KEY, value: preferences,
    });
    await page.reload();
    await openSection(page, 'Reverb');
    const module = page.getByRole('combobox', { name: 'Reverb Module' });
    // Switching before resetting also verifies the handler uses the current selection.
    await module.selectOption(profile === 'studio-plate' ? 'jazz-room' : 'studio-plate');
    await module.selectOption(profile);
    await openSection(page, 'Input');
    await page.getByRole('button', { name: 'Connect Input', exact: true }).click();
    await page.getByRole('button', { name: 'Enable Monitoring', exact: true }).click();
    await expect(page.locator('#monitoring-state')).toHaveText('On');
    await openSection(page, 'Reverb');
    const reset = page.getByRole('button', { name: 'Reset This Reverb', exact: true });
    await reset.focus();
    await reset.press('Enter');
    await expect(reset).toBeFocused();
    await expect(module).toHaveValue(profile);
    await expect(page.getByLabel('Enable Reverb')).toBeChecked({ checked: !preferences.controls.reverbBypassed });
    await expect(page.getByLabel('Reverb value')).toHaveValue('63');
    await expect(page.locator('#monitoring-state')).toHaveText('On');
    await expect.poll(() => page.evaluate(() => (window as Window & { captureRequests?: number }).captureRequests)).toBe(1);
    await expect(page.locator('body').evaluate((body) => body.scrollWidth)).resolves.toBeLessThanOrEqual(320);

    const expected = {
      ...preferences,
      controls: { ...preferences.controls, reverbSettings: {
        ...preferences.controls.reverbSettings, [profile]: DEFAULT_REVERB_SETTINGS[profile],
      } },
    };
    const savedPreferences = () => page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '{}'), SAVED_CONTROL_SETTINGS_STORAGE_KEY);
    await expect.poll(savedPreferences).toEqual(expected);
    await expect(page.locator('#reverb-advanced')).not.toHaveAttribute('open');
    await page.locator('#reverb-advanced summary').click();
    for (const [key, definition] of reverbControlEntries(profile)) {
      await expect(page.locator(`#reverb-${key}-value`)).toHaveValue(definition.defaultValue.toFixed(definition.fractionDigits));
      await expect(page.locator(`#reverb-${key}-slider`)).toHaveValue(String(definition.defaultValue));
    }
    await page.reload();
    await expect(module).toHaveValue(profile);
    await expect.poll(savedPreferences).toEqual(expected);
  });
}

test('shows module-specific accordions, keeps edits focused, and restores every module independently', async ({ page }) => {
  await installAudioBrowser(page);
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto('./');
  await openSection(page, 'Reverb');
  const module = page.getByRole('combobox', { name: 'Reverb Module' });
  const main = page.locator('#reverb-main');
  const advanced = page.locator('#reverb-advanced');
  await expect(main).toHaveAttribute('open', '');
  await expect(advanced).not.toHaveAttribute('open');
  await advanced.locator('summary').focus();
  await advanced.locator('summary').press('Enter');
  await expect(advanced).toHaveAttribute('open', '');

  const modules = [
    { id: 'jazz-room', main: ['Reverb', 'Decay', 'Tone'], advanced: ['Size', 'Early/Late'], edit: 'Size', value: '73' },
    { id: 'studio-chamber', main: ['Reverb', 'Decay', 'Pre-delay', 'Tone'], advanced: ['Low Cut', 'Diffusion'], edit: 'Low Cut', value: '240' },
    { id: 'studio-plate', main: ['Reverb', 'Decay', 'Pre-delay', 'Tone'], advanced: ['Damping'], edit: 'Damping', value: '81' },
    { id: 'fender-spring', main: ['Reverb', 'Tone', 'Dwell'], advanced: ['Decay'], edit: 'Dwell', value: '70' },
    { id: 'polytone-spring', main: ['Reverb', 'Tone', 'Decay'], advanced: ['Low Cut'], edit: 'Tone', value: '-4.0' },
    { id: 'digital-room', main: ['Reverb', 'Decay', 'Size', 'Tone'], advanced: ['Pre-delay', 'Diffusion'], edit: 'Diffusion', value: '42' },
    { id: 'digital-hall', main: ['Reverb', 'Decay', 'Pre-delay', 'Damping'], advanced: ['Size', 'Modulation Depth', 'Modulation Rate'], edit: 'Modulation Depth', value: '63' },
  ];
  for (const item of modules) {
    await module.selectOption(item.id);
    await expect(main.locator('input[type="number"]')).toHaveCount(item.main.length);
    await expect(advanced.locator('input[type="number"]')).toHaveCount(item.advanced.length);
    for (const label of item.main) await expect(main.getByLabel(`${label} value`, { exact: true })).toBeVisible();
    for (const label of item.advanced) await expect(advanced.getByLabel(`${label} value`, { exact: true })).toBeVisible();
    const input = page.getByLabel(`${item.edit} value`, { exact: true });
    await input.fill(item.value);
    await expect(input).toBeFocused();
    await expect(page.getByLabel(`${item.edit} slider`, { exact: true })).toHaveValue(String(Number(item.value)));
    await expect(page.getByLabel('Enable Reverb')).not.toBeChecked();
  }
  const rate = page.getByLabel('Modulation Rate value');
  await rate.fill('100');
  await expect(rate).toHaveValue('5.00');
  await rate.fill('');
  await rate.press('Tab');
  await expect(rate).toHaveValue('5.00');
  await page.getByLabel('Modulation Depth slider').focus();
  await page.getByLabel('Modulation Depth slider').press('ArrowRight');
  await expect(page.getByLabel('Modulation Depth value')).toHaveValue('64');
  modules[6].value = '64';
  await expect(page.locator('body').evaluate((body) => body.scrollWidth)).resolves.toBeLessThanOrEqual(320);

  await page.reload();
  await expect(module).toHaveValue('digital-hall');
  await expect(advanced).not.toHaveAttribute('open');
  await advanced.locator('summary').click();
  for (const item of modules) {
    await module.selectOption(item.id);
    await expect(page.getByLabel(`${item.edit} value`, { exact: true })).toHaveValue(item.value);
  }
  await openSection(page, 'Input');
  await page.getByRole('button', { name: 'Connect Input', exact: true }).click();
  await openSection(page, 'Reverb');
  await expect(advanced).toHaveAttribute('open', '');
  await page.getByLabel('Enable Reverb').check();
  await page.getByRole('button', { name: 'Enable Monitoring', exact: true }).click();
  await page.getByRole('button', { name: 'Checked — Enable Monitoring' }).click();
  await page.getByLabel('Decay value').fill('4');
  await expect(page.locator('#monitoring-state')).toHaveText('On');
  await expect.poll(() => page.evaluate(() => (window as Window & { captureRequests?: number }).captureRequests)).toBe(1);
  await resetControlsFrom(page, 'Reverb');
  await expect(page.getByLabel('Decay value')).toHaveValue('1.50');
  await module.selectOption('fender-spring');
  await expect(page.getByLabel('Dwell value')).toHaveValue('0');
  await module.selectOption('digital-hall');
  await expect(page.getByLabel('Modulation Depth value')).toHaveValue('0');
  await expect(page.getByLabel('Modulation Rate value')).toHaveValue('0.30');
  await expect(page.locator('#monitoring-state')).toHaveText('On');
});
