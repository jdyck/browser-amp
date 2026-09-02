import { expect, test } from '@playwright/test';
import { DEFAULT_AMP_CONTROLS } from '../../src/signalChain/settings';
import { installAudioBrowser, openSection } from '../support/audioBrowser';

test('synchronizes, clamps, and restores controls without restoring Processed Monitoring', async ({ page }) => {
  await page.goto('./');

  const inputTrim = page.getByLabel('Input Trim value');
  const inputTrimSlider = page.getByLabel('Input Trim slider');
  await expect(inputTrim).toHaveValue('0.0');
  await inputTrim.fill('30');
  await inputTrim.press('Enter');
  await expect(inputTrim).toHaveValue('24.0');
  await expect(inputTrimSlider).toHaveValue('24');

  await openSection(page, 'EQ');
  const studioEq = page.getByRole('region', { name: 'Studio EQ' });
  const low = studioEq.getByLabel('Low value');
  const lowSlider = studioEq.getByLabel('Low slider');
  const lowMidFrequency = studioEq.getByLabel('Low Mid Frequency value');
  const lowMid = studioEq.getByLabel('Low Mid value');
  const upperMidFrequency = studioEq.getByLabel('Upper Mid Frequency value');
  const upperMid = studioEq.getByLabel('Upper Mid value');
  const high = studioEq.getByLabel('High value');
  const eqEnabled = page.getByLabel('Enable Studio EQ');
  await expect(low).toHaveValue('0.0');
  await expect(lowMidFrequency).toHaveValue('300');
  await expect(lowMid).toHaveValue('0.0');
  await expect(upperMidFrequency).toHaveValue('1000');
  await expect(upperMid).toHaveValue('0.0');
  await expect(high).toHaveValue('0.0');
  await expect(eqEnabled).toBeChecked();
  await low.fill('20');
  await low.press('Enter');
  await lowMidFrequency.fill('100');
  await lowMidFrequency.press('Enter');
  await lowMid.fill('-3.26');
  await lowMid.press('Enter');
  await upperMidFrequency.fill('2500');
  await upperMidFrequency.press('Enter');
  await upperMid.fill('3.26');
  await upperMid.press('Enter');
  await high.fill('-20');
  await high.press('Enter');

  await expect(low).toHaveValue('12.0');
  await expect(lowSlider).toHaveValue('12');
  await expect(lowMidFrequency).toHaveValue('180');
  await expect(lowMid).toHaveValue('-3.3');
  await expect(upperMidFrequency).toHaveValue('2000');
  await expect(upperMid).toHaveValue('3.3');
  await expect(high).toHaveValue('-12.0');

  await openSection(page, 'Compression');
  const compressionAmount = page.getByLabel('Amount value');
  const compressionAmountSlider = page.getByLabel('Amount slider');
  const compressionEnabled = page.getByLabel('Enable Compression');
  const compressionLevelMatch = page.getByLabel('Level Match');
  await expect(compressionAmount).toHaveValue('25');
  await expect(compressionEnabled).not.toBeChecked();
  await expect(compressionLevelMatch).toBeChecked();
  await compressionAmount.fill('101');
  await compressionAmount.press('Enter');
  await compressionEnabled.check();
  await compressionLevelMatch.uncheck();
  await expect(compressionAmount).toHaveValue('100');
  await expect(compressionAmountSlider).toHaveValue('100');

  await openSection(page, 'Reverb');
  const reverbAmount = page.getByLabel('Reverb value');
  const reverbAmountSlider = page.getByLabel('Reverb slider');
  const reverbEnabled = page.getByLabel('Enable Reverb');
  await expect(reverbAmount).toHaveValue('20');
  await expect(reverbEnabled).not.toBeChecked();
  await reverbAmount.fill('-1');
  await reverbAmount.press('Enter');
  await reverbEnabled.check();
  await expect(reverbAmount).toHaveValue('0');
  await expect(reverbAmountSlider).toHaveValue('0');

  await openSection(page, 'Master');
  const masterVolume = page.getByLabel('Master value');
  await expect(masterVolume).toHaveValue('-18.0');
  await masterVolume.fill('-12.26');
  await masterVolume.press('Enter');
  await expect(masterVolume).toHaveValue('-12.3');

  await page.reload();
  await expect(page.getByLabel('Master value')).toHaveValue('-12.3');
  await expect(page.getByRole('button', { name: 'Enable Monitoring' })).toBeDisabled();
  await openSection(page, 'Input');
  await expect(page.getByLabel('Input Trim value')).toHaveValue('24.0');
  await openSection(page, 'EQ');
  await expect(studioEq.getByLabel('Low value')).toHaveValue('12.0');
  await expect(studioEq.getByLabel('Low Mid Frequency value')).toHaveValue('180');
  await expect(studioEq.getByLabel('Low Mid value')).toHaveValue('-3.3');
  await expect(studioEq.getByLabel('Upper Mid Frequency value')).toHaveValue('2000');
  await expect(studioEq.getByLabel('Upper Mid value')).toHaveValue('3.3');
  await expect(studioEq.getByLabel('High value')).toHaveValue('-12.0');
  await openSection(page, 'Compression');
  await expect(page.getByLabel('Amount value')).toHaveValue('100');
  await expect(compressionEnabled).toBeChecked();
  await expect(compressionLevelMatch).not.toBeChecked();
  await openSection(page, 'Reverb');
  await expect(page.getByLabel('Reverb value')).toHaveValue('0');
  await expect(reverbEnabled).toBeChecked();

  const enabledSettings = await page.evaluate(() => JSON.parse(localStorage.getItem('browser-amp.saved-control-settings') ?? 'null'));
  expect(enabledSettings.controls).toMatchObject({ eqBypassed: false, compressionBypassed: false, compressionLevelMatch: false, reverbBypassed: false });

  await openSection(page, 'EQ');
  await eqEnabled.uncheck();
  await expect(low).toHaveValue('12.0');
  await expect(lowMid).toHaveValue('-3.3');
  await expect(upperMid).toHaveValue('3.3');
  await expect(high).toHaveValue('-12.0');
  await openSection(page, 'Compression');
  await compressionEnabled.uncheck();
  await openSection(page, 'Reverb');
  await expect(reverbEnabled).toBeChecked();
  await reverbEnabled.uncheck();
  const bypassedSettings = await page.evaluate(() => JSON.parse(localStorage.getItem('browser-amp.saved-control-settings') ?? 'null'));
  expect(bypassedSettings.controls).toMatchObject({ eqBypassed: true, compressionBypassed: true, reverbBypassed: true });

  await page.reload();
  await expect(reverbEnabled).not.toBeChecked();
  await openSection(page, 'Compression');
  await expect(compressionEnabled).not.toBeChecked();
  await openSection(page, 'EQ');
  await expect(eqEnabled).not.toBeChecked();
  await eqEnabled.check();
  await expect(low).toHaveValue('12.0');
  await expect(lowMid).toHaveValue('-3.3');
  await expect(upperMid).toHaveValue('3.3');
  await expect(high).toHaveValue('-12.0');
  const reenabledSettings = await page.evaluate(() => JSON.parse(localStorage.getItem('browser-amp.saved-control-settings') ?? 'null'));
  expect(reenabledSettings.controls.eqBypassed).toBe(false);
});

test('requires a separate monitoring action and remembers dismissed Hardware Direct Monitoring guidance', async ({ page }) => {
  await installAudioBrowser(page);
  await page.goto('./');
  await page.getByRole('button', { name: 'Connect Input' }).click();

  await openSection(page, 'Master');
  await expect(page.getByText('This browser does not expose output selection.')).toBeVisible();
  await page.getByRole('button', { name: 'Enable Monitoring' }).click();
  await expect(page.getByRole('heading', { name: 'Before you monitor' })).toBeVisible();
  await expect(page.getByText('Disable Hardware Direct Monitoring')).toBeVisible();
  await expect(page.locator('#monitoring-state')).toHaveText('Off');

  await page.getByRole('button', { name: 'Checked — Enable Monitoring' }).click();
  await expect(page.getByRole('button', { name: 'Disable Monitoring' })).toBeVisible();
  await page.reload();
  await openSection(page, 'Input');
  await page.getByRole('button', { name: 'Connect Input' }).click();
  await page.getByRole('button', { name: 'Enable Monitoring' }).click();
  await expect(page.getByRole('button', { name: 'Disable Monitoring' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Before you monitor' })).toHaveCount(0);
});

test('Reset Controls restores sound defaults without changing connection, monitoring, or dismissed guidance', async ({ page }) => {
  await installAudioBrowser(page);
  await page.goto('./');
  await page.getByLabel('Input Trim value').fill('9');
  await openSection(page, 'EQ');
  await page.getByRole('region', { name: 'Studio EQ' }).getByLabel('Low value').fill('-4');
  await page.getByLabel('Enable Studio EQ').uncheck();
  await openSection(page, 'Compression');
  await page.getByLabel('Enable Compression').check();
  await page.getByLabel('Level Match').uncheck();
  await openSection(page, 'Reverb');
  await page.getByLabel('Reverb value').fill('60');
  await page.getByLabel('Enable Reverb').check();
  await openSection(page, 'Master');
  await page.getByLabel('Master value').fill('-6');
  await openSection(page, 'Input');
  await page.getByRole('button', { name: 'Connect Input' }).click();
  await page.getByRole('button', { name: 'Enable Monitoring' }).click();
  await page.getByRole('button', { name: 'Checked — Enable Monitoring' }).click();

  await openSection(page, 'Master');
  await page.getByRole('button', { name: 'Reset Controls' }).click();

  await openSection(page, 'Input');
  await expect(page.getByLabel('Input Trim value')).toHaveValue('0.0');
  await openSection(page, 'EQ');
  const studioEq = page.getByRole('region', { name: 'Studio EQ' });
  await expect(studioEq.getByLabel('Low value')).toHaveValue('0.0');
  await expect(studioEq.getByLabel('Low Mid Frequency value')).toHaveValue('300');
  await expect(studioEq.getByLabel('Low Mid value')).toHaveValue('0.0');
  await expect(studioEq.getByLabel('Upper Mid Frequency value')).toHaveValue('1000');
  await expect(studioEq.getByLabel('Upper Mid value')).toHaveValue('0.0');
  await expect(studioEq.getByLabel('High value')).toHaveValue('0.0');
  await expect(page.getByLabel('Enable Studio EQ')).toBeChecked();
  await openSection(page, 'Compression');
  await expect(page.getByLabel('Amount value')).toHaveValue('25');
  await expect(page.getByLabel('Enable Compression')).not.toBeChecked();
  await expect(page.getByLabel('Level Match')).toBeChecked();
  await openSection(page, 'Reverb');
  await expect(page.getByLabel('Reverb value')).toHaveValue('20');
  await expect(page.getByLabel('Enable Reverb')).not.toBeChecked();
  await openSection(page, 'Master');
  await expect(page.getByLabel('Master value')).toHaveValue('-18.0');
  await openSection(page, 'Input');
  await expect(page.locator('.connection-state')).toHaveText('Connected — monitoring');
  await expect(page.getByRole('button', { name: 'Disable Monitoring' })).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as Window & { captureRequests?: number }).captureRequests)).toBe(1);

  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('browser-amp.saved-control-settings') ?? 'null'));
  expect(saved).toEqual({
    version: 1,
    controls: DEFAULT_AMP_CONTROLS,
    hardwareDirectMonitoringGuidanceDismissed: true,
  });

  await page.reload();
  await expect(page.locator('.connection-state')).toHaveText('Disconnected');
  await expect(page.getByRole('button', { name: 'Enable Monitoring' })).toBeDisabled();
  await page.getByRole('button', { name: 'Connect Input' }).click();
  await page.getByRole('button', { name: 'Enable Monitoring' }).click();
  await expect(page.getByRole('button', { name: 'Disable Monitoring' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Before you monitor' })).toHaveCount(0);
});
