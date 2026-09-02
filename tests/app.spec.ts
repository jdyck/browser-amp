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
      audioWorklet = { addModule: async () => undefined };
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
        const parameter = (initialValue: number) => {
          const value = {
            value: initialValue,
            cancelScheduledValues: () => value,
            setValueAtTime: (nextValue: number) => { value.value = nextValue; return value; },
            linearRampToValueAtTime: (nextValue: number) => { value.value = nextValue; return value; },
          };
          return value;
        };
        return node({ type: 'peaking', frequency: parameter(0), Q: { value: 0 }, gain: parameter(0) });
      }
      createWaveShaper() { return node({ curve: null, oversample: 'none' }); }
      createConstantSource() { return node({ offset: { value: 1 }, start: () => undefined, stop: () => undefined, onended: null }); }
      createDynamicsCompressor() {
        const parameter = (value: number) => ({ value, cancelScheduledValues: () => undefined, setValueAtTime: () => undefined, linearRampToValueAtTime: () => undefined });
        return node({ reduction: -4, threshold: parameter(-24), ratio: parameter(12), attack: parameter(0.003), release: parameter(0.25), knee: parameter(30) });
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
    class MockAudioWorkletNode {
      port = { onmessage: null, postMessage: () => undefined };
      constructor(_context: BaseAudioContext, _name: string, _options?: AudioWorkletNodeOptions) {}
      connect() { return undefined; }
      disconnect() { return undefined; }
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
    Object.defineProperty(window, 'AudioWorkletNode', { value: MockAudioWorkletNode, configurable: true });
  }, options);
}

type AmpSection = 'Input' | 'Amp + Cabinet' | 'Compression' | 'EQ' | 'Reverb' | 'Master';

async function openSection(page: Page, section: AmpSection): Promise<void> {
  await page.getByRole('button', { name: section, exact: true }).click();
}

async function resetControlsFrom(page: Page, section: AmpSection): Promise<void> {
  await openSection(page, 'Master');
  await page.getByRole('button', { name: 'Reset Controls' }).click();
  await openSection(page, section);
}

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

test('exposes six model-specific control sets, remembers them, and switches without recapturing', async ({ page }) => {
  await installAudioBrowser(page);
  await page.goto('./');
  await openSection(page, 'Amp + Cabinet');

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
  await openSection(page, 'Input');
  await page.getByRole('button', { name: 'Connect Input', exact: true }).click();
  await expect(page.locator('#monitoring-state')).toHaveText('Off');
  await openSection(page, 'Amp + Cabinet');
  await expect(ampModel).toHaveValue('amp.small-tweed-combo-v1');
  await page.getByRole('button', { name: 'Enable Monitoring', exact: true }).click();
  await page.getByRole('button', { name: 'Checked — Enable Monitoring' }).click();
  await ampModel.selectOption('amp.studio-clean-v1');
  await expect(page.locator('#monitoring-state')).toHaveText('On');
  await expect(ampSection.getByLabel('Gain value')).toHaveValue('7.0');
  await ampModel.selectOption('amp.blackface-combo-v1');
  await ampModel.selectOption('amp.small-tweed-combo-v1');
  await expect.poll(() => page.evaluate(() => (window as Window & { captureRequests?: number }).captureRequests)).toBe(1);
  await resetControlsFrom(page, 'Amp + Cabinet');
  await expect(ampModel).toHaveValue('amp.studio-clean-v1');
  await expect(page.locator('#monitoring-state')).toHaveText('On');
});

test('switches every cabinet voicing, persists the choice, and resets without recapturing', async ({ page }) => {
  await installAudioBrowser(page);
  await page.goto('./');
  await openSection(page, 'Amp + Cabinet');

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
  await openSection(page, 'Amp + Cabinet');
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

  await resetControlsFrom(page, 'Amp + Cabinet');
  await expect(cabinet).toHaveValue('cab.compact-jazz-1x12-v1');
  await expect(page.locator('#monitoring-state')).toHaveText('On');
});

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
