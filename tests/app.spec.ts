import { expect, test } from '@playwright/test';

test('starts disconnected with monitoring unavailable', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('status')).toContainText('Disconnected');
  await expect(page.getByRole('button', { name: 'Enable Monitoring' })).toBeDisabled();
  await expect(page.getByRole('progressbar', { name: 'Input level' })).toHaveAttribute('aria-valuenow', '-60');
});

test('keeps the input selector mounted while the meter updates', async ({ page }) => {
  await page.addInitScript(() => {
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
        ],
        addEventListener: () => undefined,
      },
      configurable: true,
    });
    Object.defineProperty(window, 'AudioContext', {
      value: class {
        createMediaStreamSource() { return { connect: () => undefined, disconnect: () => undefined }; }
        createAnalyser() { return { fftSize: 2048, getFloatTimeDomainData: (samples: Float32Array) => samples.fill(0), disconnect: () => undefined }; }
        createChannelSplitter() { return { connect: () => undefined, disconnect: () => undefined }; }
        close() { return Promise.resolve(); }
      },
      configurable: true,
    });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Connect Input' }).click();

  const selector = page.getByLabel('Input device');
  await expect(selector).toBeVisible();
  await selector.evaluate((element) => element.setAttribute('data-regression-node', 'original'));
  await page.waitForTimeout(100);

  await expect(selector).toHaveAttribute('data-regression-node', 'original');
});
