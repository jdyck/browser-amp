import { expect, test } from '@playwright/test';

test('produces a deterministic stereo tail while Amount keeps the dry attack constant', async ({ page }) => {
  await page.goto('./');

  const renders = await page.evaluate(async () => {
    const harnessPath = './tests/offlineAudioHarness.ts';
    const { connectOfflineEngine, peak, rms } = await import(harnessPath) as typeof import('./offlineAudioHarness');
    const sampleRate = 48_000;

    async function render(reverbAmount: number) {
      const context = new OfflineAudioContext(2, sampleRate * 1.8, sampleRate);
      const source = context.createBufferSource();
      const input = context.createBuffer(1, 1, sampleRate);
      input.getChannelData(0)[0] = 0.5;
      source.buffer = input;
      await connectOfflineEngine(context, source, {
        compressionBypassed: true,
        reverbAmount,
        reverbBypassed: false,
        masterVolumeDb: 0,
      });
      source.start(0.05);

      const rendered = await context.startRendering();
      const left = rendered.getChannelData(0);
      const right = rendered.getChannelData(1);

      return {
        left,
        right,
        dryAttack: peak(left, sampleRate, 0.05, 0.06),
        tail: rms(left, sampleRate, 0.08, 1.45),
        earlyTail: rms(left, sampleRate, 0.08, 0.18),
        lateTail: rms(left, sampleRate, 1.35, 1.45),
        afterTail: rms(left, sampleRate, 1.65, 1.78),
        stereo: left.some((sample, index) => sample !== right[index]),
      };
    }

    const dry = await render(0);
    const wet = await render(100);
    const repeat = await render(100);
    return {
      dryAttack: dry.dryAttack,
      wetAttack: wet.dryAttack,
      dryTail: dry.tail,
      wetTail: wet.tail,
      earlyTail: wet.earlyTail,
      lateTail: wet.lateTail,
      afterTail: wet.afterTail,
      stereo: wet.stereo,
      deterministic: wet.left.every((sample, index) => sample === repeat.left[index])
        && wet.right.every((sample, index) => sample === repeat.right[index]),
    };
  });

  expect(renders.wetAttack).toBeCloseTo(renders.dryAttack, 4);
  expect(renders.dryTail).toBeLessThan(0.000_001);
  expect(renders.wetTail).toBeGreaterThan(0.000_1);
  expect(renders.wetTail).toBeLessThanOrEqual(0.001_1);
  expect(renders.earlyTail).toBeGreaterThan(renders.lateTail * 20);
  expect(renders.lateTail).toBeGreaterThan(0);
  expect(renders.afterTail).toBeLessThan(0.000_001);
  expect(renders.stereo).toBe(true);
  expect(renders.deterministic).toBe(true);
});

test('chops the current Reverb tail without a click or resurrecting it after bypass', async ({ page }) => {
  await page.goto('./');

  const transition = await page.evaluate(async () => {
    const harnessPath = './tests/offlineAudioHarness.ts';
    const { connectOfflineEngine, maximumSampleStep, rms, stereoDifference } = await import(harnessPath) as typeof import('./offlineAudioHarness');
    const sampleRate = 48_000;
    const context = new OfflineAudioContext(2, sampleRate, sampleRate);
    const resumeRendering = context.resume.bind(context);
    const source = context.createBufferSource();
    const input = context.createBuffer(1, 1, sampleRate);
    input.getChannelData(0)[0] = 0.5;
    source.buffer = input;
    const oscillator = context.createOscillator();
    const oscillatorGain = context.createGain();
    const inputNode = context.createGain();
    oscillator.frequency.value = 440;
    oscillatorGain.gain.value = 0.2;
    source.connect(inputNode);
    oscillator.connect(oscillatorGain).connect(inputNode);
    const engine = await connectOfflineEngine(context, inputNode, {
      reverbAmount: 100,
      reverbBypassed: false,
      masterVolumeDb: 0,
    });

    const bypassed = context.suspend(0.5);
    const reenabled = context.suspend(0.7);
    source.start(0.05);
    oscillator.start(0.62);
    oscillator.stop(0.9);
    const rendering = context.startRendering();
    await bypassed;
    engine.applyControls({ ...engine.snapshot.controls, reverbBypassed: true });
    const amountAfterBypass = engine.snapshot.controls.reverbAmount;
    await resumeRendering();
    await reenabled;
    engine.applyControls({ ...engine.snapshot.controls, reverbBypassed: false });
    await resumeRendering();

    const rendered = await rendering;
    const left = rendered.getChannelData(0);
    const right = rendered.getChannelData(1);

    return {
      amountAfterBypass,
      beforeBypass: rms(left, sampleRate, 0.3, 0.45),
      afterBypass: rms(left, sampleRate, 0.55, 0.6),
      oldTailAfterReenable: stereoDifference(left, right, sampleRate, 0.702, 0.709),
      newWetSignal: stereoDifference(left, right, sampleRate, 0.76, 0.85),
      bypassMaximumStep: maximumSampleStep(left, sampleRate, 0.48, 0.55),
      enableMaximumStep: maximumSampleStep(left, sampleRate, 0.68, 0.75),
    };
  });

  expect(transition.amountAfterBypass).toBe(100);
  expect(transition.beforeBypass).toBeGreaterThan(0.000_1);
  expect(transition.afterBypass).toBeLessThan(0.000_001);
  expect(transition.oldTailAfterReenable).toBeLessThan(0.000_001);
  expect(transition.newWetSignal).toBeGreaterThan(0.000_1);
  expect(transition.bypassMaximumStep).toBeLessThan(0.05);
  expect(transition.enableMaximumStep).toBeLessThan(0.06);
});

interface RenderOptions {
  readonly frequency: number;
  readonly amplitude?: number;
  readonly controls?: Partial<import('../src/audio/types').AmpControlSettings>;
}

async function renderAmp(page: import('@playwright/test').Page, options: RenderOptions): Promise<number> {
  return page.evaluate(async ({ frequency, amplitude = 0.1, controls = {} }) => {
    const harnessPath = './tests/offlineAudioHarness.ts';
    const { connectOfflineEngine, rms } = await import(harnessPath) as typeof import('./offlineAudioHarness');
    const sampleRate = 48_000;
    const context = new OfflineAudioContext(1, sampleRate, sampleRate);
    const source = context.createOscillator();
    const inputGain = context.createGain();
    source.frequency.value = frequency;
    inputGain.gain.value = amplitude;
    source.connect(inputGain);
    await connectOfflineEngine(context, inputGain, controls);
    source.start();

    const rendered = await context.startRendering();
    const channel = rendered.getChannelData(0);
    return rms(channel, sampleRate, 0.75, 1) / amplitude;
  }, options);
}

test('renders a smoothed linear Clean Gain through Master Volume without saturation', async ({ page }) => {
  await page.goto('./');

  const samples = await page.evaluate(async () => {
    const modulePath = './src/audio/gain.ts';
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
  await page.goto('./');

  const flat = await renderAmp(page, { frequency: 800, controls: { masterVolumeDb: 0 } });
  const boosted = await renderAmp(page, { frequency: 800, controls: { middleDb: 12, masterVolumeDb: 0 } });
  const cut = await renderAmp(page, { frequency: 800, controls: { middleDb: -12, masterVolumeDb: 0 } });

  expect(boosted / flat).toBeGreaterThan(3.7);
  expect(cut / flat).toBeLessThan(0.3);
});

test('shapes Bass and Treble with shelves near 120 Hz and 3.2 kHz', async ({ page }) => {
  await page.goto('./');

  const flatBass = await renderAmp(page, { frequency: 40, controls: { masterVolumeDb: 0 } });
  const boostedBass = await renderAmp(page, { frequency: 40, controls: { bassDb: 12, masterVolumeDb: 0 } });
  const flatTreble = await renderAmp(page, { frequency: 10_000, controls: { masterVolumeDb: 0 } });
  const cutTreble = await renderAmp(page, { frequency: 10_000, controls: { trebleDb: -12, masterVolumeDb: 0 } });

  expect(boostedBass / flatBass).toBeGreaterThan(3.5);
  expect(cutTreble / flatTreble).toBeLessThan(0.35);
});

test('bypasses Compression without losing Amount and maps Amount toward firm compression', async ({ page }) => {
  await page.goto('./');

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

test('renders Clean Gain and EQ before Compression, then Reverb and Master Volume', async ({ page }) => {
  await page.goto('./');

  const compressed = await renderAmp(page, {
    frequency: 800,
    amplitude: 0.1,
    controls: { compressionAmount: 100, compressionBypassed: false, reverbAmount: 100, reverbBypassed: false, masterVolumeDb: 0 },
  });
  const gainCompensated = await renderAmp(page, {
    frequency: 800,
    amplitude: 0.1,
    controls: { cleanGainDb: 12, compressionAmount: 100, compressionBypassed: false, reverbAmount: 100, reverbBypassed: false, masterVolumeDb: -12 },
  });
  const eqCompensated = await renderAmp(page, {
    frequency: 800,
    amplitude: 0.1,
    controls: { middleDb: 12, compressionAmount: 100, compressionBypassed: false, reverbAmount: 100, reverbBypassed: false, masterVolumeDb: -12 },
  });
  const reverbAtUnity = await renderAmp(page, {
    frequency: 800,
    controls: { compressionBypassed: true, reverbAmount: 100, reverbBypassed: false, masterVolumeDb: 0 },
  });
  const reverbAttenuated = await renderAmp(page, {
    frequency: 800,
    controls: { compressionBypassed: true, reverbAmount: 100, reverbBypassed: false, masterVolumeDb: -12 },
  });
  const compressedReverbTail = await page.evaluate(async () => {
    const harnessPath = './tests/offlineAudioHarness.ts';
    const { connectOfflineEngine, rms } = await import(harnessPath) as typeof import('./offlineAudioHarness');
    const sampleRate = 48_000;

    async function render(compressionBypassed: boolean) {
      const context = new OfflineAudioContext(2, sampleRate * 1.4, sampleRate);
      const source = context.createBufferSource();
      const input = context.createBuffer(1, Math.round(sampleRate * 0.3), sampleRate);
      const samples = input.getChannelData(0);
      for (let index = Math.round(sampleRate * 0.05); index < samples.length; index += 1) {
        samples[index] = 0.8 * Math.sin(2 * Math.PI * 440 * index / sampleRate);
      }
      source.buffer = input;
      await connectOfflineEngine(context, source, {
        compressionAmount: 100,
        compressionBypassed,
        reverbAmount: 100,
        reverbBypassed: false,
        masterVolumeDb: 0,
      });
      source.start();
      const rendered = await context.startRendering();
      const channel = rendered.getChannelData(0);
      return {
        early: rms(channel, sampleRate, 0.4, 0.55),
        late: rms(channel, sampleRate, 1.1, 1.25),
      };
    }

    return { bypassed: await render(true), compressed: await render(false) };
  });

  expect(gainCompensated).toBeLessThan(compressed * 0.6);
  expect(eqCompensated).toBeLessThan(compressed * 0.6);
  expect(reverbAttenuated / reverbAtUnity).toBeCloseTo(10 ** (-12 / 20), 2);
  expect(compressedReverbTail.compressed.early).toBeLessThan(compressedReverbTail.bypassed.early * 0.75);
  expect(compressedReverbTail.compressed.late).toBeLessThan(compressedReverbTail.bypassed.late * 0.75);
});

test('crossfades Compression Stage Bypass without an output click', async ({ page }) => {
  await page.goto('./');

  const transition = await page.evaluate(async () => {
    const harnessPath = './tests/offlineAudioHarness.ts';
    const { connectOfflineEngine, maximumSampleStep, rms } = await import(harnessPath) as typeof import('./offlineAudioHarness');
    const sampleRate = 48_000;
    const context = new OfflineAudioContext(1, sampleRate, sampleRate);
    const resumeRendering = context.resume.bind(context);
    const source = context.createOscillator();
    const inputGain = context.createGain();
    source.frequency.value = 440;
    inputGain.gain.value = 0.5;
    source.connect(inputGain);
    const engine = await connectOfflineEngine(context, inputGain, {
      compressionAmount: 100,
      compressionBypassed: true,
      masterVolumeDb: 0,
    });

    const suspended = context.suspend(0.5);
    source.start();
    const rendering = context.startRendering();
    await suspended;
    engine.applyControls({ ...engine.snapshot.controls, compressionBypassed: false });
    await resumeRendering();
    const rendered = await rendering;
    const samples = rendered.getChannelData(0);
    return {
      before: rms(samples, sampleRate, 0.3, 0.45),
      after: rms(samples, sampleRate, 0.75, 0.95),
      maximumStep: maximumSampleStep(samples, sampleRate, 0.48, 0.55),
    };
  });

  expect(transition.after).toBeLessThan(transition.before * 0.75);
  expect(transition.maximumStep).toBeLessThan(0.1);
});
