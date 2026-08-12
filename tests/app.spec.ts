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
        getUserMedia: async () => stream,
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
  const masterVolume = page.getByLabel('Master Volume value');

  await expect(cleanGain).toHaveValue('0.0');
  await expect(masterVolume).toHaveValue('-18.0');

  await cleanGain.fill('30');
  await cleanGain.press('Enter');
  await masterVolume.fill('-12.26');
  await masterVolume.press('Enter');

  await expect(cleanGain).toHaveValue('24.0');
  await expect(cleanGainSlider).toHaveValue('24');
  await expect(masterVolume).toHaveValue('-12.3');

  await page.reload();
  await expect(page.getByLabel('Clean Gain value')).toHaveValue('24.0');
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
