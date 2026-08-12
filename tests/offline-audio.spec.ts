import { expect, test } from '@playwright/test';

test('renders a smoothed linear Clean Gain through Master Volume without saturation', async ({ page }) => {
  await page.goto('/');

  const samples = await page.evaluate(async () => {
    const modulePath = '/src/audio/gain.ts';
    const { dbToLinearGain, smoothGainToDb } = await import(modulePath) as typeof import('../src/audio/gain');
    const sampleRate = 48_000;
    const context = new OfflineAudioContext(1, sampleRate * 0.05, sampleRate);
    const source = context.createConstantSource();
    const cleanGain = context.createGain();
    const masterVolume = context.createGain();

    source.offset.value = 0.05;
    cleanGain.gain.value = dbToLinearGain(0);
    masterVolume.gain.value = dbToLinearGain(-6);
    smoothGainToDb(cleanGain.gain, 24, 0);
    source.connect(cleanGain).connect(masterVolume).connect(context.destination);
    source.start();

    const rendered = await context.startRendering();
    const channel = rendered.getChannelData(0);
    return {
      beforeRamp: channel[48],
      halfway: channel[480],
      afterRamp: channel[1_440],
    };
  });

  expect(samples.beforeRamp).toBeCloseTo(0.0437, 3);
  expect(samples.halfway).toBeCloseTo(0.2111, 3);
  expect(samples.afterRamp).toBeCloseTo(0.3972, 3);
});
