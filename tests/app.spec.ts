import { expect, test, type Page } from '@playwright/test';

async function installAudioBrowser(page: Page, options: { clipOnce?: boolean; outputSelection?: boolean } = {}): Promise<void> {
  await page.addInitScript(({ clipOnce, outputSelection }) => {
    const track = {
      getSettings: () => ({ channelCount: 1, deviceId: 'microphone', echoCancellation: false, noiseSuppression: false, autoGainControl: false }),
      stop: () => undefined,
    };
    const stream = { getAudioTracks: () => [track], getTracks: () => [track] };
    Object.defineProperty(navigator, 'mediaDevices', {
      value: {
        getUserMedia: async () => {
          const state = window as Window & { captureRequests?: number };
          state.captureRequests = (state.captureRequests ?? 0) + 1;
          return stream;
        },
        enumerateDevices: async () => [
          { deviceId: 'microphone', kind: 'audioinput', label: 'Built-in Microphone' },
          { deviceId: 'irig-hd-2', kind: 'audioinput', label: 'iRig HD 2' },
          { deviceId: 'headphones', kind: 'audiooutput', label: 'Studio Headphones' },
        ],
        addEventListener: () => undefined,
      },
      configurable: true,
    });

    const node = (properties: Record<string, unknown> = {}) => ({ connect: () => undefined, disconnect: () => undefined, ...properties });
    let analyserIndex = 0;
    class MockAudioContext {
      currentTime = 1;
      sampleRate = 48_000;
      destination = node();
      state = 'running';
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
      createDynamicsCompressor() {
        const parameter = (value: number) => ({ value, cancelScheduledValues: () => undefined, setValueAtTime: () => undefined, linearRampToValueAtTime: () => undefined });
        return node({ threshold: parameter(-24), ratio: parameter(12), attack: parameter(0.003), release: parameter(0.25), knee: parameter(30) });
      }
      createBuffer(channels: number, length: number, sampleRate: number) {
        const data = Array.from({ length: channels }, () => new Float32Array(length));
        return { duration: length / sampleRate, length, numberOfChannels: channels, sampleRate, getChannelData: (channel: number) => data[channel] };
      }
      createConvolver() { return node({ buffer: null, normalize: true }); }
      resume() { return Promise.resolve(); }
      close() { return Promise.resolve(); }
    }
    if (outputSelection) {
      Object.defineProperty(MockAudioContext.prototype, 'setSinkId', {
        value: (deviceId: string) => {
          (window as Window & { selectedSink?: string }).selectedSink = deviceId;
          return Promise.resolve();
        },
      });
    }
    Object.defineProperty(window, 'AudioContext', { value: MockAudioContext, configurable: true });
  }, options);
}

test('starts disconnected with monitoring unavailable', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('status')).toContainText('Disconnected');
  await expect(page.getByRole('button', { name: 'Enable Monitoring' })).toBeDisabled();
  await expect(page.getByRole('progressbar', { name: 'Input level' })).toHaveAttribute('aria-valuenow', '-60');
});

test('synchronizes, clamps, and restores controls without restoring Processed Monitoring', async ({ page }) => {
  await page.goto('/');

  const cleanGain = page.getByLabel('Clean Gain value');
  const cleanGainSlider = page.getByLabel('Clean Gain slider');
  const bass = page.getByLabel('Bass value');
  const bassSlider = page.getByLabel('Bass slider');
  const middle = page.getByLabel('Middle value');
  const treble = page.getByLabel('Treble value');
  const compressionAmount = page.getByLabel('Compression Amount value');
  const compressionAmountSlider = page.getByLabel('Compression Amount slider');
  const compressionBypass = page.getByLabel('Compression Stage Bypass');
  const reverbAmount = page.getByLabel('Reverb Amount value');
  const reverbAmountSlider = page.getByLabel('Reverb Amount slider');
  const reverbBypass = page.getByLabel('Reverb Stage Bypass');
  const masterVolume = page.getByLabel('Master Volume value');

  await expect(cleanGain).toHaveValue('0.0');
  await expect(bass).toHaveValue('0.0');
  await expect(middle).toHaveValue('0.0');
  await expect(treble).toHaveValue('0.0');
  await expect(compressionAmount).toHaveValue('25');
  await expect(compressionBypass).toBeChecked();
  await expect(reverbAmount).toHaveValue('20');
  await expect(reverbBypass).toBeChecked();
  await expect(masterVolume).toHaveValue('-18.0');

  await cleanGain.fill('30');
  await cleanGain.press('Enter');
  await bass.fill('20');
  await bass.press('Enter');
  await middle.fill('3.26');
  await middle.press('Enter');
  await treble.fill('-20');
  await treble.press('Enter');
  await compressionAmount.fill('101');
  await compressionAmount.press('Enter');
  await compressionBypass.uncheck();
  await reverbAmount.fill('-1');
  await reverbAmount.press('Enter');
  await reverbBypass.uncheck();
  await masterVolume.fill('-12.26');
  await masterVolume.press('Enter');

  await expect(cleanGain).toHaveValue('24.0');
  await expect(cleanGainSlider).toHaveValue('24');
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
  await expect(page.getByLabel('Clean Gain value')).toHaveValue('24.0');
  await expect(page.getByLabel('Bass value')).toHaveValue('12.0');
  await expect(page.getByLabel('Middle value')).toHaveValue('3.3');
  await expect(page.getByLabel('Treble value')).toHaveValue('-12.0');
  await expect(page.getByLabel('Compression Amount value')).toHaveValue('100');
  await expect(page.getByLabel('Compression Stage Bypass')).not.toBeChecked();
  await expect(page.getByLabel('Reverb Amount value')).toHaveValue('0');
  await expect(page.getByLabel('Reverb Stage Bypass')).not.toBeChecked();
  await expect(page.getByLabel('Master Volume value')).toHaveValue('-12.3');
  await expect(page.getByRole('button', { name: 'Enable Monitoring' })).toBeDisabled();
});

test('requires a separate monitoring action and remembers dismissed Hardware Direct Monitoring guidance', async ({ page }) => {
  await installAudioBrowser(page);
  await page.goto('/');
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
  await page.goto('/');
  await page.getByLabel('Clean Gain value').fill('9');
  await page.getByLabel('Bass value').fill('-4');
  await page.getByLabel('Compression Stage Bypass').uncheck();
  await page.getByLabel('Reverb Amount value').fill('60');
  await page.getByLabel('Reverb Stage Bypass').uncheck();
  await page.getByLabel('Master Volume value').fill('-6');
  await page.getByRole('button', { name: 'Connect Input' }).click();
  await page.getByRole('button', { name: 'Enable Monitoring' }).click();
  await page.getByRole('button', { name: 'Checked — Enable Monitoring' }).click();

  await page.getByRole('button', { name: 'Reset Controls' }).click();

  await expect(page.getByLabel('Clean Gain value')).toHaveValue('0.0');
  await expect(page.getByLabel('Bass value')).toHaveValue('0.0');
  await expect(page.getByLabel('Middle value')).toHaveValue('0.0');
  await expect(page.getByLabel('Treble value')).toHaveValue('0.0');
  await expect(page.getByLabel('Compression Amount value')).toHaveValue('25');
  await expect(page.getByLabel('Compression Stage Bypass')).toBeChecked();
  await expect(page.getByLabel('Reverb Amount value')).toHaveValue('20');
  await expect(page.getByLabel('Reverb Stage Bypass')).toBeChecked();
  await expect(page.getByLabel('Master Volume value')).toHaveValue('-18.0');
  await expect(page.locator('.connection-state')).toHaveText('Connected — monitoring');
  await expect(page.getByRole('button', { name: 'Disable Monitoring' })).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as Window & { captureRequests?: number }).captureRequests)).toBe(1);

  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('browser-amp.saved-control-settings') ?? 'null'));
  expect(saved).toEqual({
    version: 1,
    controls: {
      cleanGainDb: 0,
      bassDb: 0,
      middleDb: 0,
      trebleDb: 0,
      compressionAmount: 25,
      compressionBypassed: true,
      reverbAmount: 20,
      reverbBypassed: true,
      masterVolumeDb: -18,
    },
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
  await page.goto('/');
  await page.getByRole('button', { name: 'Connect Input' }).click();

  await page.getByLabel('Output device').selectOption('headphones');
  await expect.poll(() => page.evaluate(() => (window as Window & { selectedSink?: string }).selectedSink)).toBe('headphones');
  await expect(page.locator('#clip-indicator')).toHaveAttribute('aria-hidden', 'false');
  await page.getByRole('button', { name: 'Clear CLIP' }).click();
  await expect(page.locator('#clip-indicator')).toHaveAttribute('aria-hidden', 'true');
});

test('keeps the input selector mounted while the meter updates', async ({ page }) => {
  await installAudioBrowser(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Connect Input' }).click();

  const selector = page.getByLabel('Input device');
  await expect(selector).toBeVisible();
  await selector.evaluate((element) => element.setAttribute('data-regression-node', 'original'));
  await page.waitForTimeout(100);

  await expect(selector).toHaveAttribute('data-regression-node', 'original');
});

test('keeps exact controls keyboard-operable and in Amp Chain order on a narrow layout', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto('/');

  const bassSlider = page.getByLabel('Bass slider');
  await bassSlider.focus();
  await bassSlider.press('ArrowRight');
  await expect(page.getByLabel('Bass value')).toHaveValue('0.1');

  await expect(page.locator('.panel > .panel-heading > h2')).toHaveText([
    'Live Guitar Input',
    'Input Level Meter',
    'Clean Gain',
    'Three-Band EQ',
    'Compression',
    'Reverb',
    'Master Volume',
    'Output Level Meter',
    'Processed Monitoring',
  ]);

  const amountBounds = await page.getByLabel('Compression Amount value').boundingBox();
  expect(amountBounds).not.toBeNull();
  expect((amountBounds?.x ?? 0) + (amountBounds?.width ?? 0)).toBeLessThanOrEqual(320);
});
