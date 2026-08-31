import { DEFAULT_AMP_CONTROLS, REVERB_PROFILES, type ReverbProfile } from '../src/controls';
import { DEFAULT_REVERB_SETTINGS, reverbControlEntries } from '../src/reverbSettings';
import { SAVED_CONTROL_SETTINGS_STORAGE_KEY } from '../src/settings';
import { expect, test, type Page } from '@playwright/test';

async function installAudioBrowser(page: Page, options: {
  clipOnce?: boolean;
  outputSelection?: boolean;
  permissionDenied?: boolean;
  routingFailure?: boolean;
} = {}): Promise<void> {
  await page.addInitScript(({ clipOnce, outputSelection, permissionDenied, routingFailure }) => {
    const testWindow = window as Window & {
      captureRequests?: number;
      resumeRequests?: number;
      selectedSink?: string;
      setInputConnected?: (connected: boolean) => void;
      setOutputConnected?: (connected: boolean) => void;
      simulateBackground?: () => void;
      simulateForeground?: () => void;
    };
    let inputConnected = true;
    let outputConnected = true;
    let activeContext: MockAudioContext | undefined;
    const mediaDevices = Object.assign(new EventTarget(), {
      getUserMedia: async (constraints: MediaStreamConstraints) => {
        testWindow.captureRequests = (testWindow.captureRequests ?? 0) + 1;
        if (permissionDenied) throw new DOMException('Denied', 'NotAllowedError');
        const audio = typeof constraints.audio === 'object' ? constraints.audio : undefined;
        const exactDevice = typeof audio?.deviceId === 'object' && 'exact' in audio.deviceId
          ? String(audio.deviceId.exact)
          : undefined;
        if ((exactDevice === 'irig-hd-2' && !inputConnected) || (exactDevice !== undefined && exactDevice !== 'irig-hd-2')) {
          throw new DOMException('Unavailable', 'NotFoundError');
        }
        const deviceId = exactDevice ?? (inputConnected ? 'irig-hd-2' : 'microphone');
        const track = Object.assign(new EventTarget(), {
          getSettings: () => ({ channelCount: 1, deviceId, echoCancellation: false, noiseSuppression: false, autoGainControl: false }),
          stop: () => undefined,
        });
        const stream = { getAudioTracks: () => [track], getTracks: () => [track] };
        return stream;
      },
      enumerateDevices: async () => [
        { deviceId: 'microphone', kind: 'audioinput', label: 'Built-in Microphone' },
        ...(inputConnected ? [{ deviceId: 'irig-hd-2', kind: 'audioinput', label: 'iRig HD 2' }] : []),
        ...(outputConnected ? [{ deviceId: 'headphones', kind: 'audiooutput', label: 'Studio Headphones' }] : []),
      ],
    });
    Object.defineProperty(navigator, 'mediaDevices', {
      value: mediaDevices,
      configurable: true,
    });
    testWindow.setInputConnected = (connected) => {
      inputConnected = connected;
      mediaDevices.dispatchEvent(new Event('devicechange'));
    };
    testWindow.setOutputConnected = (connected) => {
      outputConnected = connected;
      mediaDevices.dispatchEvent(new Event('devicechange'));
    };

    const node = (properties: Record<string, unknown> = {}) => ({ connect: () => undefined, disconnect: () => undefined, ...properties });
    let analyserIndex = 0;
    class MockAudioContext extends EventTarget {
      currentTime = 1;
      sampleRate = 48_000;
      destination = node();
      state = 'running';
      constructor() {
        super();
        activeContext = this;
      }
      createMediaStreamSource() { return node(); }
      createAnalyser() {
        const index = analyserIndex++;
        let reads = 0;
        return node({
          fftSize: 2048,
          getFloatTimeDomainData: (samples: Float32Array) => {
            samples.fill(0);
            if (clipOnce && index === 1 && reads++ === 0) samples[0] = 1;
          },
        });
      }
      createChannelSplitter() { return node(); }
      createChannelMerger() { return node(); }
      createDelay() { return node({ delayTime: { value: 0 } }); }
      createOscillator() { return node({ frequency: { value: 0 }, start: () => undefined, stop: () => undefined }); }
      createGain() {
        const gain = {
          value: 1,
          cancelScheduledValues: () => gain,
          setValueAtTime: (value: number) => { gain.value = value; return gain; },
          linearRampToValueAtTime: (value: number) => { gain.value = value; return gain; },
        };
        return node({ gain });
      }
      createBiquadFilter() {
        const gain = { value: 0, cancelScheduledValues: () => gain, setValueAtTime: (value: number) => { gain.value = value; return gain; }, linearRampToValueAtTime: (value: number) => { gain.value = value; return gain; } };
        return node({ type: 'peaking', frequency: { value: 0 }, Q: { value: 0 }, gain });
      }
      createWaveShaper() { return node({ curve: null, oversample: 'none' }); }
      createConstantSource() { return node({ offset: { value: 1 }, start: () => undefined, stop: () => undefined, onended: null }); }
      createDynamicsCompressor() {
        const parameter = (value: number) => ({ value, cancelScheduledValues: () => undefined, setValueAtTime: () => undefined, linearRampToValueAtTime: () => undefined });
        return node({ threshold: parameter(-24), ratio: parameter(12), attack: parameter(0.003), release: parameter(0.25), knee: parameter(30) });
      }
      createBuffer(channels: number, length: number, sampleRate: number) {
        const data = Array.from({ length: channels }, () => new Float32Array(length));
        return { duration: length / sampleRate, length, numberOfChannels: channels, sampleRate, getChannelData: (channel: number) => data[channel] };
      }
      createConvolver() { return node({ buffer: null, normalize: true }); }
      resume() {
        testWindow.resumeRequests = (testWindow.resumeRequests ?? 0) + 1;
        this.state = 'running';
        return Promise.resolve();
      }
      close() {
        this.state = 'closed';
        return Promise.resolve();
      }
    }
    if (outputSelection) {
      Object.defineProperty(MockAudioContext.prototype, 'setSinkId', {
        value: (deviceId: string) => {
          if (routingFailure) return Promise.reject(new DOMException('Unavailable', 'NotFoundError'));
          testWindow.selectedSink = deviceId;
          return Promise.resolve();
        },
      });
    }
    testWindow.simulateBackground = () => {
      if (activeContext === undefined) return;
      activeContext.state = 'suspended';
      activeContext.dispatchEvent(new Event('statechange'));
    };
    testWindow.simulateForeground = () => {
      if (activeContext === undefined) return;
      activeContext.state = 'running';
      activeContext.dispatchEvent(new Event('statechange'));
      document.dispatchEvent(new Event('visibilitychange'));
    };
    Object.defineProperty(window, 'AudioContext', { value: MockAudioContext, configurable: true });
  }, options);
}

test('starts disconnected with monitoring unavailable', async ({ page }) => {
  await page.goto('./');

  await expect(page.getByRole('status')).toContainText('Disconnected');
  await expect(page.getByRole('button', { name: 'Enable Monitoring' })).toBeDisabled();
  await expect(page.getByRole('progressbar', { name: 'Input level' })).toHaveAttribute('aria-valuenow', '-60');
});

test('places monitoring below input settings and output metering below input metering', async ({ page }) => {
  await page.goto('./');

  await expect(page.locator('[aria-labelledby="input-title"] + section')).toHaveAttribute('aria-labelledby', 'monitoring-title');
  await expect(page.locator('[aria-labelledby="input-meter-title"] + section')).toHaveAttribute('aria-labelledby', 'output-meter-title');
});

test('exposes six model-specific control sets, remembers them, and switches without recapturing', async ({ page }) => {
  await installAudioBrowser(page);
  await page.goto('./');

  const ampSection = page.getByRole('region', { name: 'Amp Model', exact: true });
  const ampModel = ampSection.getByRole('combobox', { name: 'Amp Model' });
  await expect(ampModel).toBeEnabled();
  await expect(ampModel).toHaveValue('amp.studio-clean-v1');
  await expect(ampModel.locator('option')).toHaveText([
    'Studio Clean', 'Warm Jazz Combo', 'Blackface Combo', 'High-Headroom American', 'Small Tweed Combo', 'British Chime',
  ]);
  await expect(ampSection.getByLabel('Gain value')).toHaveValue('5.0');
  await expect(ampSection.getByLabel('Headroom')).toHaveValue('maximum');
  const expectedControls = {
    'amp.studio-clean-v1': ['Gain', 'Bass', 'Middle', 'Treble', 'Headroom'],
    'amp.warm-jazz-combo-v1': ['Volume', 'Bass', 'Middle', 'Treble', 'Color', 'Input'],
    'amp.blackface-combo-v1': ['Volume', 'Bass', 'Treble', 'Bright'],
    'amp.high-headroom-american-v1': ['Volume', 'Bass', 'Middle', 'Treble', 'Bright', 'Headroom'],
    'amp.small-tweed-combo-v1': ['Volume', 'Tone', 'Input'],
    'amp.british-chime-v1': ['Volume', 'Bass', 'Treble', 'Cut', 'Channel'],
  } as const;
  for (const [id, labels] of Object.entries(expectedControls)) {
    await ampModel.selectOption(id);
    await expect(ampSection.locator('#amp-model-controls label')).toHaveText(labels);
  }
  await ampModel.selectOption('amp.studio-clean-v1');

  await ampSection.getByLabel('Gain value').fill('7');
  await ampModel.selectOption('amp.blackface-combo-v1');
  await expect(ampSection.getByLabel('Volume value')).toHaveValue('4.0');
  await expect(ampSection.getByLabel('Bright')).toHaveValue('off');
  await expect(ampSection.getByLabel('Middle value')).toHaveCount(0);
  await ampModel.selectOption('amp.small-tweed-combo-v1');
  await expect(ampSection.getByLabel('Volume value')).toHaveValue('3.5');
  await expect(ampSection.getByLabel('Tone value')).toHaveValue('5.0');
  await expect(ampSection.getByLabel('Input', { exact: true })).toHaveValue('normal');
  await ampSection.getByLabel('Volume value').fill('8');
  await ampModel.selectOption('amp.studio-clean-v1');
  await expect(ampSection.getByLabel('Gain value')).toHaveValue('7.0');
  await ampModel.selectOption('amp.small-tweed-combo-v1');
  await expect(ampSection.getByLabel('Volume value')).toHaveValue('8.0');
  await expect(page.getByRole('button', { name: 'Enable Monitoring' })).toBeDisabled();

  await page.reload();
  await expect(ampModel).toHaveValue('amp.small-tweed-combo-v1');
  await page.getByRole('button', { name: 'Connect Input', exact: true }).click();
  await expect(page.locator('#monitoring-state')).toHaveText('Off');
  await expect(ampModel).toHaveValue('amp.small-tweed-combo-v1');
  await page.getByRole('button', { name: 'Enable Monitoring', exact: true }).click();
  await page.getByRole('button', { name: 'Checked — Enable Monitoring' }).click();
  await ampModel.selectOption('amp.studio-clean-v1');
  await expect(page.locator('#monitoring-state')).toHaveText('On');
  await expect(ampSection.getByLabel('Gain value')).toHaveValue('7.0');
  await ampModel.selectOption('amp.blackface-combo-v1');
  await ampModel.selectOption('amp.small-tweed-combo-v1');
  await expect.poll(() => page.evaluate(() => (window as Window & { captureRequests?: number }).captureRequests)).toBe(1);
  await page.getByRole('button', { name: 'Reset Controls' }).click();
  await expect(ampModel).toHaveValue('amp.studio-clean-v1');
  await expect(page.locator('#monitoring-state')).toHaveText('On');
});

test('switches all reverb modules, remembers bypassed selections, and resets without recapturing', async ({ page }) => {
  await installAudioBrowser(page);
  await page.goto('./');
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
  await page.getByRole('button', { name: 'Connect Input', exact: true }).click();
  await expect(page.locator('#monitoring-state')).toHaveText('Off');
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
  await page.getByRole('button', { name: 'Reset Controls' }).click();
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
        ampModel: 'amp.blackface-combo-v1', inputTrimDb: 6, bassDb: -3, middleDb: 2, trebleDb: 4,
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
    const module = page.getByRole('combobox', { name: 'Reverb Module' });
    // Switching before resetting also verifies the handler uses the current selection.
    await module.selectOption(profile === 'studio-plate' ? 'jazz-room' : 'studio-plate');
    await module.selectOption(profile);
    await page.getByRole('button', { name: 'Connect Input', exact: true }).click();
    await page.getByRole('button', { name: 'Enable Monitoring', exact: true }).click();
    await expect(page.locator('#monitoring-state')).toHaveText('On');
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
  await page.getByRole('button', { name: 'Connect Input', exact: true }).click();
  await expect(advanced).toHaveAttribute('open', '');
  await page.getByLabel('Enable Reverb').check();
  await page.getByRole('button', { name: 'Enable Monitoring', exact: true }).click();
  await page.getByRole('button', { name: 'Checked — Enable Monitoring' }).click();
  await page.getByLabel('Decay value').fill('4');
  await expect(page.locator('#monitoring-state')).toHaveText('On');
  await expect.poll(() => page.evaluate(() => (window as Window & { captureRequests?: number }).captureRequests)).toBe(1);
  await page.getByRole('button', { name: 'Reset Controls' }).click();
  await expect(page.getByLabel('Decay value')).toHaveValue('1.50');
  await module.selectOption('fender-spring');
  await expect(page.getByLabel('Dwell value')).toHaveValue('0');
  await module.selectOption('digital-hall');
  await expect(page.getByLabel('Modulation Depth value')).toHaveValue('0');
  await expect(page.getByLabel('Modulation Rate value')).toHaveValue('0.30');
  await expect(page.locator('#monitoring-state')).toHaveText('On');
});

test('synchronizes, clamps, and restores controls without restoring Processed Monitoring', async ({ page }) => {
  await page.goto('./');

  const inputTrim = page.getByLabel('Input Trim value');
  const inputTrimSlider = page.getByLabel('Input Trim slider');
  const studioEq = page.getByRole('region', { name: 'Three-Band EQ' });
  const bass = studioEq.getByLabel('Bass value');
  const bassSlider = studioEq.getByLabel('Bass slider');
  const middle = studioEq.getByLabel('Middle value');
  const treble = studioEq.getByLabel('Treble value');
  const eqEnabled = page.getByLabel('Enable EQ');
  const compressionAmount = page.getByLabel('Compression value');
  const compressionAmountSlider = page.getByLabel('Compression slider');
  const compressionEnabled = page.getByLabel('Enable Compression');
  const reverbAmount = page.getByLabel('Reverb value');
  const reverbAmountSlider = page.getByLabel('Reverb slider');
  const reverbEnabled = page.getByLabel('Enable Reverb');
  const masterVolume = page.getByLabel('Master value');

  await expect(inputTrim).toHaveValue('0.0');
  await expect(bass).toHaveValue('0.0');
  await expect(middle).toHaveValue('0.0');
  await expect(treble).toHaveValue('0.0');
  await expect(eqEnabled).toBeChecked();
  await expect(compressionAmount).toHaveValue('25');
  await expect(compressionEnabled).not.toBeChecked();
  await expect(reverbAmount).toHaveValue('20');
  await expect(reverbEnabled).not.toBeChecked();
  await expect(masterVolume).toHaveValue('-18.0');

  await inputTrim.fill('30');
  await inputTrim.press('Enter');
  await bass.fill('20');
  await bass.press('Enter');
  await middle.fill('3.26');
  await middle.press('Enter');
  await treble.fill('-20');
  await treble.press('Enter');
  await compressionAmount.fill('101');
  await compressionAmount.press('Enter');
  await compressionEnabled.check();
  await reverbAmount.fill('-1');
  await reverbAmount.press('Enter');
  await reverbEnabled.check();
  await masterVolume.fill('-12.26');
  await masterVolume.press('Enter');

  await expect(inputTrim).toHaveValue('24.0');
  await expect(inputTrimSlider).toHaveValue('24');
  await expect(bass).toHaveValue('12.0');
  await expect(bassSlider).toHaveValue('12');
  await expect(middle).toHaveValue('3.3');
  await expect(treble).toHaveValue('-12.0');
  await expect(compressionAmount).toHaveValue('100');
  await expect(compressionAmountSlider).toHaveValue('100');
  await expect(reverbAmount).toHaveValue('0');
  await expect(reverbAmountSlider).toHaveValue('0');
  await expect(masterVolume).toHaveValue('-12.3');

  await page.reload();
  await expect(page.getByLabel('Input Trim value')).toHaveValue('24.0');
  await expect(studioEq.getByLabel('Bass value')).toHaveValue('12.0');
  await expect(studioEq.getByLabel('Middle value')).toHaveValue('3.3');
  await expect(studioEq.getByLabel('Treble value')).toHaveValue('-12.0');
  await expect(page.getByLabel('Compression value')).toHaveValue('100');
  await expect(compressionEnabled).toBeChecked();
  await expect(page.getByLabel('Reverb value')).toHaveValue('0');
  await expect(reverbEnabled).toBeChecked();
  await expect(page.getByLabel('Master value')).toHaveValue('-12.3');
  await expect(page.getByRole('button', { name: 'Enable Monitoring' })).toBeDisabled();

  const enabledSettings = await page.evaluate(() => JSON.parse(localStorage.getItem('browser-amp.saved-control-settings') ?? 'null'));
  expect(enabledSettings.controls).toMatchObject({ eqBypassed: false, compressionBypassed: false, reverbBypassed: false });

  await eqEnabled.uncheck();
  await expect(bass).toHaveValue('12.0');
  await expect(middle).toHaveValue('3.3');
  await expect(treble).toHaveValue('-12.0');
  await compressionEnabled.uncheck();
  await expect(reverbEnabled).toBeChecked();
  await reverbEnabled.uncheck();
  const bypassedSettings = await page.evaluate(() => JSON.parse(localStorage.getItem('browser-amp.saved-control-settings') ?? 'null'));
  expect(bypassedSettings.controls).toMatchObject({ eqBypassed: true, compressionBypassed: true, reverbBypassed: true });

  await page.reload();
  await expect(eqEnabled).not.toBeChecked();
  await expect(compressionEnabled).not.toBeChecked();
  await expect(reverbEnabled).not.toBeChecked();
  await eqEnabled.check();
  await expect(bass).toHaveValue('12.0');
  await expect(middle).toHaveValue('3.3');
  await expect(treble).toHaveValue('-12.0');
  const reenabledSettings = await page.evaluate(() => JSON.parse(localStorage.getItem('browser-amp.saved-control-settings') ?? 'null'));
  expect(reenabledSettings.controls.eqBypassed).toBe(false);
});

test('requires a separate monitoring action and remembers dismissed Hardware Direct Monitoring guidance', async ({ page }) => {
  await installAudioBrowser(page);
  await page.goto('./');
  await page.getByRole('button', { name: 'Connect Input' }).click();

  await expect(page.getByText('This browser does not expose output selection.')).toBeVisible();
  await page.getByRole('button', { name: 'Enable Monitoring' }).click();
  await expect(page.getByRole('heading', { name: 'Before you monitor' })).toBeVisible();
  await expect(page.getByText('Disable Hardware Direct Monitoring')).toBeVisible();
  await expect(page.locator('#monitoring-state')).toHaveText('Off');

  await page.getByRole('button', { name: 'Checked — Enable Monitoring' }).click();
  await expect(page.getByRole('button', { name: 'Disable Monitoring' })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Connect Input' }).click();
  await page.getByRole('button', { name: 'Enable Monitoring' }).click();
  await expect(page.getByRole('button', { name: 'Disable Monitoring' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Before you monitor' })).toHaveCount(0);
});

test('Reset Controls restores sound defaults without changing connection, monitoring, or dismissed guidance', async ({ page }) => {
  await installAudioBrowser(page);
  await page.goto('./');
  await page.getByLabel('Input Trim value').fill('9');
  await page.getByRole('region', { name: 'Three-Band EQ' }).getByLabel('Bass value').fill('-4');
  await page.getByLabel('Enable EQ').uncheck();
  await page.getByLabel('Enable Compression').check();
  await page.getByLabel('Reverb value').fill('60');
  await page.getByLabel('Enable Reverb').check();
  await page.getByLabel('Master value').fill('-6');
  await page.getByRole('button', { name: 'Connect Input' }).click();
  await page.getByRole('button', { name: 'Enable Monitoring' }).click();
  await page.getByRole('button', { name: 'Checked — Enable Monitoring' }).click();

  await page.getByRole('button', { name: 'Reset Controls' }).click();

  await expect(page.getByLabel('Input Trim value')).toHaveValue('0.0');
  const studioEq = page.getByRole('region', { name: 'Three-Band EQ' });
  await expect(studioEq.getByLabel('Bass value')).toHaveValue('0.0');
  await expect(studioEq.getByLabel('Middle value')).toHaveValue('0.0');
  await expect(studioEq.getByLabel('Treble value')).toHaveValue('0.0');
  await expect(page.getByLabel('Enable EQ')).toBeChecked();
  await expect(page.getByLabel('Compression value')).toHaveValue('25');
  await expect(page.getByLabel('Enable Compression')).not.toBeChecked();
  await expect(page.getByLabel('Reverb value')).toHaveValue('20');
  await expect(page.getByLabel('Enable Reverb')).not.toBeChecked();
  await expect(page.getByLabel('Master value')).toHaveValue('-18.0');
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

test('shows browser-visible output routing and clears a latched post-Master CLIP', async ({ page }) => {
  await installAudioBrowser(page, { clipOnce: true, outputSelection: true });
  await page.goto('./');
  await page.getByRole('button', { name: 'Connect Input' }).click();

  await page.getByLabel('Output device').selectOption('headphones');
  await expect.poll(() => page.evaluate(() => (window as Window & { selectedSink?: string }).selectedSink)).toBe('headphones');
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

  await page.getByLabel('Output device').selectOption('headphones');

  await expect(page.getByText('browser could not route audio to that output')).toBeVisible();
  await expect(page.locator('#monitoring-state')).toHaveText('Off');
  await expect(page.getByRole('button', { name: 'Retry Selected Output' })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Choose Output Before Monitoring' })).toBeDisabled();
});

test('keeps exact controls keyboard-operable and in Amp Chain order on a narrow layout', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto('./');

  const studioEq = page.getByRole('region', { name: 'Three-Band EQ' });
  const bassSlider = studioEq.getByLabel('Bass slider');
  await bassSlider.focus();
  await bassSlider.press('ArrowRight');
  await expect(studioEq.getByLabel('Bass value')).toHaveValue('0.1');

  await expect(page.locator('.panel[aria-label]')).toHaveCount(5);
  await expect(page.locator('.panel[aria-label]').evaluateAll((panels) => panels.map((panel) => panel.getAttribute('aria-label')))).resolves.toEqual([
    'Amp Model',
    'Three-Band EQ',
    'Compression',
    'Reverb',
    'Master Volume',
  ]);

  const amountBounds = await page.getByLabel('Compression value').boundingBox();
  expect(amountBounds).not.toBeNull();
  expect((amountBounds?.x ?? 0) + (amountBounds?.width ?? 0)).toBeLessThanOrEqual(320);
});
