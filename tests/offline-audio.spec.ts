import { expect, test } from '@playwright/test';

interface RenderOptions {
  readonly frequency: number;
  readonly amplitude?: number;
  readonly controls?: Partial<import('../src/audio/types').AmpControlSettings>;
}

async function renderAmp(page: import('@playwright/test').Page, options: RenderOptions): Promise<number> {
  return page.evaluate(async ({ frequency, amplitude = 0.1, controls = {} }) => {
    const modulePath = '/src/audio/AudioEngine.ts';
    const { AudioEngine } = await import(modulePath) as typeof import('../src/audio/AudioEngine');
    const sampleRate = 48_000;
    const context = new OfflineAudioContext(1, sampleRate, sampleRate);
    const source = context.createOscillator();
    const inputGain = context.createGain();
    source.frequency.value = frequency;
    inputGain.gain.value = amplitude;
    source.connect(inputGain);
    Object.defineProperty(context, 'createMediaStreamSource', { value: () => inputGain });
    Object.defineProperty(context, 'resume', { value: async () => undefined });

    const track = {
      getSettings: () => ({ channelCount: 1, echoCancellation: false, noiseSuppression: false, autoGainControl: false }),
      stop: () => undefined,
    };
    const stream = { getAudioTracks: () => [track], getTracks: () => [track] };
    const mediaDevices = {
      getUserMedia: async () => stream,
      enumerateDevices: async () => [],
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    };
    const engine = new AudioEngine({
      mediaDevices: mediaDevices as unknown as MediaDevices,
      createAudioContext: () => context as unknown as AudioContext,
      requestAnimationFrame: () => 1,
      cancelAnimationFrame: () => undefined,
    });
    engine.applyControls({ ...engine.snapshot.controls, ...controls });
    await engine.connectInput();
    await engine.setMonitoring(true);
    source.start();

    const rendered = await context.startRendering();
    const channel = rendered.getChannelData(0);
    const start = Math.floor(channel.length * 0.75);
    let squared = 0;
    for (let index = start; index < channel.length; index += 1) squared += channel[index] ** 2;
    return Math.sqrt(squared / (channel.length - start)) / amplitude;
  }, options);
}

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

test('shapes Middle with a peaking EQ centered near 800 Hz', async ({ page }) => {
  await page.goto('/');

  const flat = await renderAmp(page, { frequency: 800, controls: { masterVolumeDb: 0 } });
  const boosted = await renderAmp(page, { frequency: 800, controls: { middleDb: 12, masterVolumeDb: 0 } });
  const cut = await renderAmp(page, { frequency: 800, controls: { middleDb: -12, masterVolumeDb: 0 } });

  expect(boosted / flat).toBeGreaterThan(3.7);
  expect(cut / flat).toBeLessThan(0.3);
});

test('shapes Bass and Treble with shelves near 120 Hz and 3.2 kHz', async ({ page }) => {
  await page.goto('/');

  const flatBass = await renderAmp(page, { frequency: 40, controls: { masterVolumeDb: 0 } });
  const boostedBass = await renderAmp(page, { frequency: 40, controls: { bassDb: 12, masterVolumeDb: 0 } });
  const flatTreble = await renderAmp(page, { frequency: 10_000, controls: { masterVolumeDb: 0 } });
  const cutTreble = await renderAmp(page, { frequency: 10_000, controls: { trebleDb: -12, masterVolumeDb: 0 } });

  expect(boostedBass / flatBass).toBeGreaterThan(3.5);
  expect(cutTreble / flatTreble).toBeLessThan(0.35);
});

test('bypasses Compression without losing Amount and maps Amount toward firm compression', async ({ page }) => {
  await page.goto('/');

  const bypassed = await renderAmp(page, {
    frequency: 440,
    amplitude: 0.5,
    controls: { compressionAmount: 100, compressionBypassed: true, masterVolumeDb: 0 },
  });
  const neutral = await renderAmp(page, {
    frequency: 440,
    amplitude: 0.5,
    controls: { compressionAmount: 0, compressionBypassed: false, masterVolumeDb: 0 },
  });
  const firm = await renderAmp(page, {
    frequency: 440,
    amplitude: 0.5,
    controls: { compressionAmount: 100, compressionBypassed: false, masterVolumeDb: 0 },
  });

  expect(neutral).toBeCloseTo(bypassed, 2);
  expect(firm).toBeLessThan(bypassed * 0.75);
});

test('renders Clean Gain and EQ before Compression, then Master Volume', async ({ page }) => {
  await page.goto('/');

  const compressed = await renderAmp(page, {
    frequency: 800,
    amplitude: 0.1,
    controls: { compressionAmount: 100, compressionBypassed: false, masterVolumeDb: 0 },
  });
  const gainCompensated = await renderAmp(page, {
    frequency: 800,
    amplitude: 0.1,
    controls: { cleanGainDb: 12, compressionAmount: 100, compressionBypassed: false, masterVolumeDb: -12 },
  });
  const eqCompensated = await renderAmp(page, {
    frequency: 800,
    amplitude: 0.1,
    controls: { middleDb: 12, compressionAmount: 100, compressionBypassed: false, masterVolumeDb: -12 },
  });

  expect(gainCompensated).toBeLessThan(compressed * 0.6);
  expect(eqCompensated).toBeLessThan(compressed * 0.6);
});

test('crossfades Compression Stage Bypass without an output click', async ({ page }) => {
  await page.goto('/');

  const transition = await page.evaluate(async () => {
    const modulePath = '/src/audio/AudioEngine.ts';
    const { AudioEngine } = await import(modulePath) as typeof import('../src/audio/AudioEngine');
    const sampleRate = 48_000;
    const context = new OfflineAudioContext(1, sampleRate, sampleRate);
    const resumeRendering = context.resume.bind(context);
    const source = context.createOscillator();
    const inputGain = context.createGain();
    source.frequency.value = 440;
    inputGain.gain.value = 0.5;
    source.connect(inputGain);
    Object.defineProperty(context, 'createMediaStreamSource', { value: () => inputGain });
    Object.defineProperty(context, 'resume', { value: async () => undefined });

    const track = { getSettings: () => ({ channelCount: 1 }), stop: () => undefined };
    const stream = { getAudioTracks: () => [track], getTracks: () => [track] };
    const engine = new AudioEngine({
      mediaDevices: {
        getUserMedia: async () => stream,
        enumerateDevices: async () => [],
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      } as unknown as MediaDevices,
      createAudioContext: () => context as unknown as AudioContext,
      requestAnimationFrame: () => 1,
      cancelAnimationFrame: () => undefined,
    });
    engine.applyControls({
      ...engine.snapshot.controls,
      compressionAmount: 100,
      compressionBypassed: true,
      masterVolumeDb: 0,
    });
    await engine.connectInput();
    await engine.setMonitoring(true);

    const suspended = context.suspend(0.5);
    source.start();
    const rendering = context.startRendering();
    await suspended;
    engine.applyControls({ ...engine.snapshot.controls, compressionBypassed: false });
    await resumeRendering();
    const rendered = await rendering;
    const samples = rendered.getChannelData(0);

    function rms(startSeconds: number, endSeconds: number): number {
      const start = Math.floor(startSeconds * sampleRate);
      const end = Math.floor(endSeconds * sampleRate);
      let squared = 0;
      for (let index = start; index < end; index += 1) squared += samples[index] ** 2;
      return Math.sqrt(squared / (end - start));
    }

    let maximumStep = 0;
    for (let index = Math.floor(0.48 * sampleRate); index < Math.floor(0.55 * sampleRate); index += 1) {
      maximumStep = Math.max(maximumStep, Math.abs(samples[index] - samples[index - 1]));
    }
    return { before: rms(0.3, 0.45), after: rms(0.75, 0.95), maximumStep };
  });

  expect(transition.after).toBeLessThan(transition.before * 0.75);
  expect(transition.maximumStep).toBeLessThan(0.1);
});
