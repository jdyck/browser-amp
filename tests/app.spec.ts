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

test('synchronizes, clamps, and restores controls without restoring Processed Monitoring', async ({ page }) => {
  await page.goto('./');

  const cleanGain = page.getByLabel('Clean Gain value');
  const cleanGainSlider = page.getByLabel('Clean Gain slider');
  const bass = page.getByLabel('Bass value');
  const bassSlider = page.getByLabel('Bass slider');
  const middle = page.getByLabel('Middle value');
  const treble = page.getByLabel('Treble value');
  const eqEnabled = page.getByLabel('Enable EQ');
  const compressionAmount = page.getByLabel('Compression value');
  const compressionAmountSlider = page.getByLabel('Compression slider');
  const compressionEnabled = page.getByLabel('Enable Compression');
  const reverbAmount = page.getByLabel('Reverb value');
  const reverbAmountSlider = page.getByLabel('Reverb slider');
  const reverbEnabled = page.getByLabel('Enable Reverb');
  const masterVolume = page.getByLabel('Master value');

  await expect(cleanGain).toHaveValue('0.0');
  await expect(bass).toHaveValue('0.0');
  await expect(middle).toHaveValue('0.0');
  await expect(treble).toHaveValue('0.0');
  await expect(eqEnabled).toBeChecked();
  await expect(compressionAmount).toHaveValue('25');
  await expect(compressionEnabled).not.toBeChecked();
  await expect(reverbAmount).toHaveValue('20');
  await expect(reverbEnabled).not.toBeChecked();
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
  await compressionEnabled.check();
  await reverbAmount.fill('-1');
  await reverbAmount.press('Enter');
  await reverbEnabled.check();
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
  await page.getByLabel('Clean Gain value').fill('9');
  await page.getByLabel('Bass value').fill('-4');
  await page.getByLabel('Enable EQ').uncheck();
  await page.getByLabel('Enable Compression').check();
  await page.getByLabel('Reverb value').fill('60');
  await page.getByLabel('Enable Reverb').check();
  await page.getByLabel('Master value').fill('-6');
  await page.getByRole('button', { name: 'Connect Input' }).click();
  await page.getByRole('button', { name: 'Enable Monitoring' }).click();
  await page.getByRole('button', { name: 'Checked — Enable Monitoring' }).click();

  await page.getByRole('button', { name: 'Reset Controls' }).click();

  await expect(page.getByLabel('Clean Gain value')).toHaveValue('0.0');
  await expect(page.getByLabel('Bass value')).toHaveValue('0.0');
  await expect(page.getByLabel('Middle value')).toHaveValue('0.0');
  await expect(page.getByLabel('Treble value')).toHaveValue('0.0');
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
    controls: {
      cleanGainDb: 0,
      bassDb: 0,
      middleDb: 0,
      trebleDb: 0,
      eqBypassed: false,
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
  await page.getByLabel('Clean Gain value').fill('7');
  await page.getByRole('button', { name: 'Connect Input' }).click();
  await page.getByRole('button', { name: 'Enable Monitoring' }).click();
  await page.getByRole('button', { name: 'Checked — Enable Monitoring' }).click();

  await page.evaluate(() => (window as Window & { setInputConnected?: (connected: boolean) => void }).setInputConnected?.(false));

  await expect(page.getByRole('status')).toContainText('Connection interrupted');
  await expect(page.getByRole('alert')).toContainText('active input device was disconnected');
  await expect(page.getByRole('button', { name: 'Reconnect Input' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Enable Monitoring' })).toBeDisabled();
  await expect(page.getByLabel('Clean Gain value')).toHaveValue('7.0');
  await expect.poll(() => page.evaluate(() => (window as Window & { captureRequests?: number }).captureRequests)).toBe(1);

  await page.evaluate(() => (window as Window & { setInputConnected?: (connected: boolean) => void }).setInputConnected?.(true));
  await expect(page.getByLabel('Input device')).toContainText('iRig HD 2');
  await expect(page.getByRole('status')).toContainText('Connection interrupted');
  await page.getByRole('button', { name: 'Reconnect Input' }).click();

  await expect(page.getByRole('status')).toContainText('Connected — muted');
  await expect(page.getByRole('button', { name: 'Enable Monitoring' })).toBeEnabled();
  await expect(page.getByLabel('Clean Gain value')).toHaveValue('7.0');
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

  const bassSlider = page.getByLabel('Bass slider');
  await bassSlider.focus();
  await bassSlider.press('ArrowRight');
  await expect(page.getByLabel('Bass value')).toHaveValue('0.1');

  await expect(page.locator('.panel[aria-label]')).toHaveCount(5);
  await expect(page.locator('.panel[aria-label]').evaluateAll((panels) => panels.map((panel) => panel.getAttribute('aria-label')))).resolves.toEqual([
    'Clean Gain',
    'Three-Band EQ',
    'Compression',
    'Reverb',
    'Master Volume',
  ]);

  const amountBounds = await page.getByLabel('Compression value').boundingBox();
  expect(amountBounds).not.toBeNull();
  expect((amountBounds?.x ?? 0) + (amountBounds?.width ?? 0)).toBeLessThanOrEqual(320);
});
