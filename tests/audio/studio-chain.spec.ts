import { expect, test } from '@playwright/test';
import { renderAmp } from '../support/renderAudio';

test('shapes both broad mid bands at their selected frequencies', async ({ page }) => {
  await page.goto('./');

  const flatLowMid = await renderAmp(page, { frequency: 450, controls: { masterVolumeDb: 0 } });
  const boostedLowMid = await renderAmp(page, {
    frequency: 450,
    controls: { lowMidFrequencyHz: 450, lowMidDb: 12, masterVolumeDb: 0 },
  });
  const cutLowMid = await renderAmp(page, {
    frequency: 450,
    controls: { lowMidFrequencyHz: 450, lowMidDb: -12, masterVolumeDb: 0 },
  });
  const flatUpperMid = await renderAmp(page, { frequency: 1_600, controls: { masterVolumeDb: 0 } });
  const boostedUpperMid = await renderAmp(page, {
    frequency: 1_600,
    controls: { upperMidFrequencyHz: 1_600, upperMidDb: 12, masterVolumeDb: 0 },
  });

  expect(boostedLowMid / flatLowMid).toBeGreaterThan(3.7);
  expect(cutLowMid / flatLowMid).toBeLessThan(0.3);
  expect(boostedUpperMid / flatUpperMid).toBeGreaterThan(3.7);
});

test('shapes Low and High with fixed shelves near 120 Hz and 3.2 kHz', async ({ page }) => {
  await page.goto('./');

  const flatBass = await renderAmp(page, { frequency: 40, controls: { masterVolumeDb: 0 } });
  const boostedBass = await renderAmp(page, { frequency: 40, controls: { lowShelfDb: 12, masterVolumeDb: 0 } });
  const flatTreble = await renderAmp(page, { frequency: 10_000, controls: { masterVolumeDb: 0 } });
  const cutTreble = await renderAmp(page, { frequency: 10_000, controls: { highShelfDb: -12, masterVolumeDb: 0 } });

  expect(boostedBass / flatBass).toBeGreaterThan(3.5);
  expect(cutTreble / flatTreble).toBeLessThan(0.35);
});

for (const frequency of [40, 300, 1_000, 10_000]) {
  test(`bypasses and restores the whole EQ at ${frequency} Hz while retaining band settings`, async ({ page }) => {
    await page.goto('./');

    const levels = await page.evaluate(async (frequency) => {
      const harnessPath = './tests/support/offlineAudioHarness.ts';
      const { connectOfflineEngine, rms } = await import(harnessPath) as typeof import('../support/offlineAudioHarness');
      const sampleRate = 48_000;
      const context = new OfflineAudioContext(1, sampleRate, sampleRate);
      const resumeRendering = context.resume.bind(context);
      const source = context.createOscillator();
      const inputGain = context.createGain();
      source.frequency.value = frequency;
      inputGain.gain.value = 0.1;
      source.connect(inputGain);
      const engine = await connectOfflineEngine(context, inputGain, {
        lowShelfDb: 6, lowMidDb: 6, upperMidDb: 6, highShelfDb: 6, eqBypassed: true, masterVolumeDb: 0,
      });

      const enabled = context.suspend(0.2);
      const bypassed = context.suspend(0.4);
      const edited = context.suspend(0.6);
      const reenabled = context.suspend(0.8);
      source.start();
      const rendering = context.startRendering();
      await enabled;
      engine.applyControls({ ...engine.snapshot.controls, eqBypassed: false });
      await resumeRendering();
      await bypassed;
      engine.applyControls({ ...engine.snapshot.controls, eqBypassed: true });
      const retainedSettings = engine.snapshot.controls;
      await resumeRendering();
      await edited;
      engine.applyControls({
        ...engine.snapshot.controls,
        lowShelfDb: 12,
        lowMidDb: 12,
        upperMidDb: 12,
        highShelfDb: 12,
      });
      await resumeRendering();
      await reenabled;
      engine.applyControls({ ...engine.snapshot.controls, eqBypassed: false });
      await resumeRendering();

      const samples = (await rendering).getChannelData(0);
      return {
        retainedSettings,
        initial: rms(samples, sampleRate, 0.1, 0.18),
        enabled: rms(samples, sampleRate, 0.3, 0.38),
        bypassed: rms(samples, sampleRate, 0.5, 0.58),
        editedWhileBypassed: rms(samples, sampleRate, 0.7, 0.78),
        reenabled: rms(samples, sampleRate, 0.9, 0.98),
      };
    }, frequency);

    expect(levels.retainedSettings).toMatchObject({
      lowShelfDb: 6, lowMidDb: 6, upperMidDb: 6, highShelfDb: 6, eqBypassed: true,
    });
    expect(levels.initial).toBeCloseTo(0.1 / Math.sqrt(2), 2);
    expect(levels.enabled).toBeGreaterThan(levels.initial * 1.7);
    expect(levels.bypassed).toBeCloseTo(levels.initial, 4);
    expect(levels.editedWhileBypassed).toBeCloseTo(levels.initial, 4);
    expect(levels.reenabled).toBeGreaterThan(levels.enabled * 1.7);
  });
}

test('bypasses Compression without losing Amount and maps Amount toward firm compression', async ({ page }) => {
  await page.goto('./');

  const bypassed = await renderAmp(page, {
    frequency: 440,
    amplitude: 0.5,
    controls: { compressionAmount: 100, compressionLevelMatch: false, compressionBypassed: true, masterVolumeDb: 0 },
  });
  const neutral = await renderAmp(page, {
    frequency: 440,
    amplitude: 0.5,
    controls: { compressionAmount: 0, compressionLevelMatch: false, compressionBypassed: false, masterVolumeDb: 0 },
  });
  const firm = await renderAmp(page, {
    frequency: 440,
    amplitude: 0.5,
    controls: { compressionAmount: 100, compressionLevelMatch: false, compressionBypassed: false, masterVolumeDb: 0 },
  });

  expect(neutral).toBeCloseTo(bypassed, 2);
  expect(firm).toBeLessThan(bypassed * 0.75);
});

test('Level Match keeps representative guitar dynamics close to bypass', async ({ page }) => {
  await page.goto('./');

  const differencesDb = await page.evaluate(async () => {
    const harnessPath = './tests/support/offlineAudioHarness.ts';
    const { connectOfflineEngine, rms } = await import(harnessPath) as typeof import('../support/offlineAudioHarness');
    const sampleRate = 48_000;

    async function render(compressionAmount: number, compressionBypassed: boolean): Promise<number> {
      const durationSeconds = 2;
      const context = new OfflineAudioContext(1, sampleRate * durationSeconds, sampleRate);
      const source = context.createBufferSource();
      const buffer = context.createBuffer(1, sampleRate * durationSeconds, sampleRate);
      const samples = buffer.getChannelData(0);
      for (let index = 0; index < samples.length; index += 1) {
        const elapsed = index / sampleRate;
        const pickPhase = elapsed % 0.25;
        const envelope = 0.55 + 0.45 * Math.exp(-10 * pickPhase);
        samples[index] = 0.5 * envelope * (
          0.75 * Math.sin(2 * Math.PI * 110 * elapsed)
          + 0.2 * Math.sin(2 * Math.PI * 220 * elapsed)
          + 0.05 * Math.sin(2 * Math.PI * 330 * elapsed)
        );
      }
      source.buffer = buffer;
      await connectOfflineEngine(context, source, {
        compressionAmount,
        compressionLevelMatch: true,
        compressionBypassed,
        masterVolumeDb: 0,
      });
      source.start();
      return rms((await context.startRendering()).getChannelData(0), sampleRate, 0.08, 1.9);
    }

    const bypassed = await render(25, true);
    const differences = [];
    for (const amount of [25, 50, 75, 100]) {
      const matched = await render(amount, false);
      differences.push({ amount, db: 20 * Math.log10(matched / bypassed) });
    }
    return differences;
  });

  expect(
    Math.max(...differencesDb.map((difference) => Math.abs(difference.db))),
    `Level Match differences: ${JSON.stringify(differencesDb)}`,
  ).toBeLessThanOrEqual(1.5);
});

test('renders Input Trim before Compression, then EQ, Reverb, and Master Volume', async ({ page }) => {
  await page.goto('./');

  const compressed = await renderAmp(page, {
    frequency: 800,
    amplitude: 0.1,
    controls: { compressionAmount: 100, compressionLevelMatch: false, compressionBypassed: false, reverbAmount: 100, reverbBypassed: false, masterVolumeDb: 0 },
  });
  const gainCompensated = await renderAmp(page, {
    frequency: 800,
    amplitude: 0.1,
    controls: { inputTrimDb: 12, compressionAmount: 100, compressionLevelMatch: false, compressionBypassed: false, reverbAmount: 100, reverbBypassed: false, masterVolumeDb: -12 },
  });
  const eqCompensated = await renderAmp(page, {
    frequency: 800,
    amplitude: 0.1,
    controls: { upperMidFrequencyHz: 800, upperMidDb: 12, compressionAmount: 100, compressionLevelMatch: false, compressionBypassed: false, reverbAmount: 100, reverbBypassed: false, masterVolumeDb: -12 },
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
    const harnessPath = './tests/support/offlineAudioHarness.ts';
    const { connectOfflineEngine, rms } = await import(harnessPath) as typeof import('../support/offlineAudioHarness');
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
        compressionLevelMatch: false,
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
  expect(eqCompensated).toBeCloseTo(compressed, 2);
  expect(reverbAttenuated / reverbAtUnity).toBeCloseTo(10 ** (-12 / 20), 2);
  expect(compressedReverbTail.compressed.early).toBeLessThan(compressedReverbTail.bypassed.early * 0.75);
  expect(compressedReverbTail.compressed.late).toBeLessThan(compressedReverbTail.bypassed.late * 0.75);
});

test('crossfades Compression Stage Bypass without an output click', async ({ page }) => {
  await page.goto('./');

  const transition = await page.evaluate(async () => {
    const harnessPath = './tests/support/offlineAudioHarness.ts';
    const { connectOfflineEngine, maximumSampleStep, rms } = await import(harnessPath) as typeof import('../support/offlineAudioHarness');
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
      compressionLevelMatch: false,
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
