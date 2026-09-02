import { expect, test } from '@playwright/test';
import { DEFAULT_JAZZ_AMP_SETTINGS, type JazzAmpId, type JazzAmpSettings } from '../../src/signalChain/ampModels';
import type { AmpControlSettings } from '../../src/signalChain/settings';
import { renderAmp } from '../support/renderAudio';

function modelControls<Id extends JazzAmpId>(
  ampModel: Id,
  changes: Partial<JazzAmpSettings[Id]> = {},
): Partial<AmpControlSettings> {
  return {
    ampModel,
    ampSettings: {
      ...DEFAULT_JAZZ_AMP_SETTINGS,
      [ampModel]: { ...DEFAULT_JAZZ_AMP_SETTINGS[ampModel], ...changes },
    },
    masterVolumeDb: 0,
  };
}

test('renders a smoothed linear Input Trim through Master Volume without saturation', async ({ page }) => {
  await page.goto('./');

  const samples = await page.evaluate(async () => {
    const modulePath = './src/audio/gain.ts';
    const { dbToLinearGain, smoothGainToDb } = await import(modulePath) as typeof import('../../src/audio/gain');
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

const MAX_AMP_DC_OFFSET = 0.000_2;

for (const sampleRate of [44_100, 48_000]) {
  test(`six amp models are stable, level-matched, and respond to drive at ${sampleRate} Hz`, async ({ page }) => {
    await page.goto('./');
    const results = await page.evaluate(async (sampleRate) => {
      const harnessPath = './tests/support/offlineAudioHarness.ts';
      const settingsPath = './src/signalChain/ampModels.ts';
      const { connectOfflineEngine, rms, peak } = await import(harnessPath) as typeof import('../support/offlineAudioHarness');
      const { AMP_MODELS, DEFAULT_JAZZ_AMP_SETTINGS } = await import(settingsPath) as typeof import('../../src/signalChain/ampModels');
      type Id = keyof typeof AMP_MODELS;
      async function render(ampModel: Id, amplitude: number, drive?: number, changes: Record<string, number | string> = {}) {
        const context = new OfflineAudioContext(1, sampleRate, sampleRate);
        const source = context.createOscillator();
        const input = context.createGain();
        source.frequency.value = 200;
        input.gain.value = amplitude;
        source.connect(input);
        const defaults = DEFAULT_JAZZ_AMP_SETTINGS[ampModel] as unknown as Record<string, number | string>;
        const driveKey = ampModel === 'amp.studio-clean-v1' ? 'gain' : 'volume';
        const ampSettings = {
          ...DEFAULT_JAZZ_AMP_SETTINGS,
          [ampModel]: { ...defaults, ...changes, ...(drive === undefined ? {} : { [driveKey]: drive }) },
        };
        await connectOfflineEngine(context, input, { ampModel, ampSettings, masterVolumeDb: 0 });
        source.start();
        const samples = (await context.startRendering()).getChannelData(0);
        const start = Math.round(sampleRate * 0.5);
        const length = samples.length - start;
        const harmonics = Array.from({ length: 8 }, (_, harmonic) => {
          let real = 0;
          let imaginary = 0;
          for (let index = start; index < samples.length; index += 1) {
            const phase = 2 * Math.PI * 200 * (harmonic + 1) * index / sampleRate;
            real += samples[index] * Math.cos(phase);
            imaginary += samples[index] * Math.sin(phase);
          }
          return 2 * Math.hypot(real, imaginary) / length;
        });
        return {
          level: rms(samples, sampleRate, 0.5, 1), peak: peak(samples, sampleRate, 0.5, 1),
          distortion: Math.hypot(...harmonics.slice(1)) / (harmonics[0] || 1),
          dc: samples.slice(start).reduce((sum, value) => sum + value, 0) / length,
          finite: samples.every(Number.isFinite),
        };
      }
      const entries = [];
      for (const id of Object.keys(AMP_MODELS) as Id[]) entries.push([id, {
        normal: await render(id, 0.1), driven: await render(id, 0.1, 9), silent: await render(id, 0, 9),
      }] as const);
      return {
        models: Object.fromEntries(entries) as Record<Id, { normal: Awaited<ReturnType<typeof render>>; driven: Awaited<ReturnType<typeof render>>; silent: Awaited<ReturnType<typeof render>> }>,
        highHeadroom: {
          normal: await render('amp.high-headroom-american-v1', 0.7, 8, { headroom: 'normal' }),
          ultra: await render('amp.high-headroom-american-v1', 0.7, 8, { headroom: 'ultra' }),
        },
        studioHeadroom: {
          high: await render('amp.studio-clean-v1', 0.7, 7, { headroom: 'high' }),
          maximum: await render('amp.studio-clean-v1', 0.7, 7, { headroom: 'maximum' }),
        },
      };
    }, sampleRate);

    const clean = results.models['amp.studio-clean-v1'];
    expect(clean.normal.level).toBeCloseTo(0.1 / Math.sqrt(2), 5);
    expect(clean.normal.distortion).toBeLessThan(0.0001);
    for (const [id, tones] of Object.entries(results.models)) {
      expect(tones.normal.finite, `${id} normal is finite`).toBe(true);
      expect(tones.driven.finite, `${id} driven is finite`).toBe(true);
      expect(Math.abs(tones.normal.dc), `${id} normal DC`).toBeLessThan(MAX_AMP_DC_OFFSET);
      expect(Math.abs(tones.driven.dc), `${id} driven DC`).toBeLessThan(MAX_AMP_DC_OFFSET);
      expect(tones.silent.peak, `${id} is silent at zero input`).toBe(0);
      const ratio = tones.normal.level / clean.normal.level;
      expect(ratio, `${id} default level`).toBeGreaterThan(0.89);
      expect(ratio, `${id} default level`).toBeLessThan(1.12);
      if (id !== 'amp.studio-clean-v1') {
        expect(tones.driven.distortion, `${id} distortion rises with drive`).toBeGreaterThan(tones.normal.distortion * 1.15);
      }
    }
    expect(results.models['amp.small-tweed-combo-v1'].normal.distortion).toBeGreaterThan(results.models['amp.blackface-combo-v1'].normal.distortion * 2);
    expect(results.models['amp.high-headroom-american-v1'].normal.distortion).toBeLessThan(results.models['amp.blackface-combo-v1'].normal.distortion);
    expect(results.highHeadroom.normal.distortion).toBeGreaterThan(results.highHeadroom.ultra.distortion * 1.5);
    expect(results.highHeadroom.normal.level / results.highHeadroom.ultra.level).toBeGreaterThan(0.9);
    expect(results.studioHeadroom.high.distortion).toBeGreaterThan(results.studioHeadroom.maximum.distortion * 10);
  });
}

test('model-specific switches and tone controls move sound in their documented directions', async ({ page }) => {
  await page.goto('./');
  const warmNormal = modelControls('amp.warm-jazz-combo-v1');
  const warmLow = modelControls('amp.warm-jazz-combo-v1', { input: 'low' });
  expect(await renderAmp(page, { frequency: 200, controls: warmLow })).toBeLessThan(await renderAmp(page, { frequency: 200, controls: warmNormal }) * 0.65);
  expect(await renderAmp(page, { frequency: 6_000, controls: modelControls('amp.warm-jazz-combo-v1', { color: 'dark' }) }))
    .toBeLessThan(await renderAmp(page, { frequency: 6_000, controls: modelControls('amp.warm-jazz-combo-v1', { color: 'bright' }) }) * 0.65);

  const blackfaceBright = modelControls('amp.blackface-combo-v1', { volume: 2, bright: 'on' });
  const blackfaceOff = modelControls('amp.blackface-combo-v1', { volume: 2, bright: 'off' });
  expect(await renderAmp(page, { frequency: 6_000, controls: blackfaceBright })).toBeGreaterThan(await renderAmp(page, { frequency: 6_000, controls: blackfaceOff }) * 1.5);

  const tweedLow = modelControls('amp.small-tweed-combo-v1', { input: 'low' });
  const tweedNormal = modelControls('amp.small-tweed-combo-v1', { input: 'normal' });
  expect(await renderAmp(page, { frequency: 200, controls: tweedLow })).toBeLessThan(await renderAmp(page, { frequency: 200, controls: tweedNormal }) * 0.65);

  const chimeDark = modelControls('amp.british-chime-v1', { cut: 10 });
  const chimeOpen = modelControls('amp.british-chime-v1', { cut: 0 });
  expect(await renderAmp(page, { frequency: 6_000, controls: chimeDark })).toBeLessThan(await renderAmp(page, { frequency: 6_000, controls: chimeOpen }) * 0.5);
});

test('rapid amp model switches crossfade and return to the original clean signal', async ({ page }) => {
  await page.goto('./');
  const transition = await page.evaluate(async () => {
    const harnessPath = './tests/support/offlineAudioHarness.ts';
    const { connectOfflineEngine, maximumSampleStep, rms } = await import(harnessPath) as typeof import('../support/offlineAudioHarness');
    const sampleRate = 48_000;
    const context = new OfflineAudioContext(1, sampleRate, sampleRate);
    const resumeRendering = context.resume.bind(context);
    const source = context.createConstantSource();
    source.offset.value = 0.25;
    const engine = await connectOfflineEngine(context, source, { masterVolumeDb: 0 });
    const switches = [
      { time: 0.2, model: 'amp.blackface-combo-v1' },
      { time: 0.208, model: 'amp.small-tweed-combo-v1' },
      { time: 0.216, model: 'amp.blackface-combo-v1' },
      { time: 0.224, model: 'amp.studio-clean-v1' },
      { time: 0.232, model: 'amp.small-tweed-combo-v1' },
      { time: 0.5, model: 'amp.studio-clean-v1' },
    ] as const;
    const suspensions = switches.map(({ time }) => context.suspend(time));
    source.start();
    const rendering = context.startRendering();
    for (let index = 0; index < switches.length; index += 1) {
      await suspensions[index];
      engine.applyControls({ ...engine.snapshot.controls, ampModel: switches[index].model });
      await resumeRendering();
    }
    const samples = (await rendering).getChannelData(0);
    return {
      initial: rms(samples, sampleRate, 0.1, 0.18),
      tube: rms(samples, sampleRate, 0.35, 0.45),
      restored: rms(samples, sampleRate, 0.7, 0.9),
      maximumStep: maximumSampleStep(samples, sampleRate, 0.19, 0.6),
      monitoring: engine.snapshot.monitoring,
    };
  });

  expect(transition.initial).toBeCloseTo(0.25, 5);
  expect(transition.tube).toBeLessThan(0.0001);
  expect(transition.restored).toBeCloseTo(transition.initial, 5);
  expect(transition.maximumStep).toBeLessThan(0.002);
  expect(transition.monitoring).toBe(true);
});

for (const sampleRate of [44_100, 48_000]) {
  test(`cabinet voicings are finite, level-matched, and keep distinct response fingerprints at ${sampleRate} Hz`, async ({ page }) => {
    await page.goto('./');
    const results = await page.evaluate(async (sampleRate) => {
      const modulePath = './src/audio/cabinetModel.ts';
      const settingsPath = './src/signalChain/cabinetModels.ts';
      const harnessPath = './tests/support/offlineAudioHarness.ts';
      const { CabinetModelStage } = await import(modulePath) as typeof import('../../src/audio/cabinetModel');
      const { CABINET_MODELS } = await import(settingsPath) as typeof import('../../src/signalChain/cabinetModels');
      const { rms } = await import(harnessPath) as typeof import('../support/offlineAudioHarness');
      type Id = keyof typeof CABINET_MODELS;
      const ids = Object.keys(CABINET_MODELS) as Id[];
      const frequencies = [70, 120, 230, 800, 2_500, 6_000, 10_000];

      async function sineLevel(id: Id, frequency: number) {
        const context = new OfflineAudioContext(1, sampleRate * 0.4, sampleRate);
        const source = context.createOscillator();
        const input = context.createGain();
        const stage = new CabinetModelStage(context, id);
        source.frequency.value = frequency;
        input.gain.value = 0.05;
        source.connect(input).connect(stage.input);
        stage.output.connect(context.destination);
        source.start();
        const samples = (await context.startRendering()).getChannelData(0);
        stage.disconnect();
        return { level: rms(samples, sampleRate, 0.25, 0.4), finite: samples.every(Number.isFinite) };
      }

      async function programLevel(id: Id) {
        const context = new OfflineAudioContext(1, sampleRate * 0.5, sampleRate);
        const stage = new CabinetModelStage(context, id);
        const voices = [[82, 1], [147, 0.9], [330, 0.8], [740, 0.68], [1_660, 0.52], [3_720, 0.34]] as const;
        for (const [frequency, amplitude] of voices) {
          const source = context.createOscillator();
          const gain = context.createGain();
          source.frequency.value = frequency;
          gain.gain.value = amplitude * 0.015;
          source.connect(gain).connect(stage.input);
          source.start();
        }
        stage.output.connect(context.destination);
        const samples = (await context.startRendering()).getChannelData(0);
        stage.disconnect();
        return rms(samples, sampleRate, 0.3, 0.5);
      }

      const responses = {} as Record<Id, { levels: number[]; finite: boolean; program: number }>;
      for (const id of ids) {
        const rendered = [];
        for (const frequency of frequencies) rendered.push(await sineLevel(id, frequency));
        responses[id] = {
          levels: rendered.map(({ level }) => level),
          finite: rendered.every(({ finite }) => finite),
          program: await programLevel(id),
        };
      }
      return { frequencies, responses };
    }, sampleRate);

    const direct = results.responses['cab.direct-full-range-v1'];
    for (const [id, response] of Object.entries(results.responses)) {
      expect(response.finite, `${id} is finite`).toBe(true);
      for (let index = 0; index < results.frequencies.length; index += 1) {
        const relativeDb = 20 * Math.log10(response.levels[index] / direct.levels[index]);
        if (id === 'cab.direct-full-range-v1') expect(relativeDb, `Direct at ${results.frequencies[index]} Hz`).toBeCloseTo(0, 5);
      }
      const programRatio = response.program / direct.program;
      expect(programRatio, `${id} representative level`).toBeGreaterThan(0.89);
      expect(programRatio, `${id} representative level`).toBeLessThan(1.12);
    }

    const processed = Object.entries(results.responses).filter(([id]) => id !== 'cab.direct-full-range-v1');
    for (let left = 0; left < processed.length; left += 1) {
      for (let right = left + 1; right < processed.length; right += 1) {
        const maximumDifferenceDb = Math.max(...processed[left][1].levels.map((level, index) => Math.abs(
          20 * Math.log10(level / processed[right][1].levels[index]),
        )));
        expect(maximumDifferenceDb, `${processed[left][0]} vs ${processed[right][0]}`).toBeGreaterThan(1);
      }
    }
    const index = (frequency: number) => results.frequencies.indexOf(frequency);
    const compact = results.responses['cab.compact-jazz-1x12-v1'].levels;
    const americanOne = results.responses['cab.american-open-1x12-v1'].levels;
    const americanTwo = results.responses['cab.american-open-2x12-v1'].levels;
    const fourTen = results.responses['cab.open-4x10-v1'].levels;
    expect(americanOne[index(2_500)]).toBeGreaterThan(compact[index(2_500)]);
    expect(americanTwo[index(230)]).toBeGreaterThan(americanOne[index(230)]);
    const fourTenBassRatio = fourTen[index(70)] / fourTen[index(120)];
    for (const response of [compact, americanOne, americanTwo]) {
      expect(fourTenBassRatio).toBeLessThan(response[index(70)] / response[index(120)]);
    }
    for (const response of [compact, americanOne, americanTwo, fourTen]) {
      expect(response[index(10_000)]).toBeLessThan(response[index(800)] * 0.7);
    }
  });
}

test('rapid cabinet switches crossfade without recapturing, silence, or an output click', async ({ page }) => {
  await page.goto('./');
  const result = await page.evaluate(async () => {
    const modulePath = './src/audio/cabinetModel.ts';
    const harnessPath = './tests/support/offlineAudioHarness.ts';
    const { CabinetModelStage } = await import(modulePath) as typeof import('../../src/audio/cabinetModel');
    const { maximumSampleStep, rms } = await import(harnessPath) as typeof import('../support/offlineAudioHarness');
    const sampleRate = 48_000;
    const context = new OfflineAudioContext(1, sampleRate, sampleRate);
    const resumeRendering = context.resume.bind(context);
    const source = context.createOscillator();
    const input = context.createGain();
    const stage = new CabinetModelStage(context, 'cab.direct-full-range-v1');
    source.frequency.value = 220;
    input.gain.value = 0.1;
    source.connect(input).connect(stage.input);
    stage.output.connect(context.destination);
    const switches = [
      { time: 0.2, model: 'cab.compact-jazz-1x12-v1' },
      { time: 0.205, model: 'cab.american-open-1x12-v1' },
      { time: 0.21, model: 'cab.open-4x10-v1' },
      { time: 0.5, model: 'cab.direct-full-range-v1' },
    ] as const;
    const suspensions = switches.map(({ time }) => context.suspend(time));
    source.start();
    const rendering = context.startRendering();
    for (let index = 0; index < switches.length; index += 1) {
      await suspensions[index];
      stage.setModel(switches[index].model);
      await resumeRendering();
    }
    const samples = (await rendering).getChannelData(0);
    stage.disconnect();
    return {
      finite: samples.every(Number.isFinite),
      initial: rms(samples, sampleRate, 0.1, 0.18),
      switched: rms(samples, sampleRate, 0.3, 0.45),
      restored: rms(samples, sampleRate, 0.7, 0.9),
      maximumStep: maximumSampleStep(samples, sampleRate, 0.19, 0.6),
    };
  });
  expect(result.finite).toBe(true);
  expect(result.initial).toBeCloseTo(0.1 / Math.sqrt(2), 3);
  expect(result.switched).toBeGreaterThan(0.04);
  expect(result.restored).toBeCloseTo(result.initial, 3);
  expect(result.maximumStep).toBeLessThan(0.02);
});

test('shared switching retires old graphs on audio deadlines without further control changes', async ({ page }) => {
  await page.goto('./');
  const result = await page.evaluate(async () => {
    const modulePath = './src/audio/stageSwitcher.ts';
    const harnessPath = './tests/support/offlineAudioHarness.ts';
    const { StageSwitcher } = await import(modulePath) as typeof import('../../src/audio/stageSwitcher');
    const { rms, maximumSampleStep } = await import(harnessPath) as typeof import('../support/offlineAudioHarness');
    const sampleRate = 48_000;
    const context = new OfflineAudioContext(1, sampleRate * 0.6, sampleRate);
    const live = new Set<string>();
    const created: string[] = [];
    let maximumLive = 0;
    const stage = new StageSwitcher<'a' | 'b' | 'c'>(context, 'a', (key) => {
      const gain = context.createGain();
      gain.gain.value = { a: 1, b: 0.5, c: 0.25 }[key];
      live.add(key);
      created.push(key);
      maximumLive = Math.max(maximumLive, live.size);
      return {
        input: gain, output: gain,
        dispose: () => { gain.disconnect(); live.delete(key); },
      };
    });
    const source = context.createConstantSource();
    source.offset.value = 0.2;
    source.connect(stage.input);
    stage.output.connect(context.destination);
    source.start();
    const suspensions = [0.1, 0.2, 0.3].map((time) => context.suspend(time));
    const rendering = context.startRendering();
    await suspensions[0];
    stage.select('b');
    stage.select('a');
    stage.select('c');
    await context.resume();
    // Offline rendering runs faster than the control thread. Yield at each
    // checkpoint so native ended events can perform cleanup, without calling
    // select() again to force catch-up or relying on a wall-clock fade timer.
    await suspensions[1];
    await new Promise((resolve) => setTimeout(resolve, 0));
    await context.resume();
    await suspensions[2];
    await new Promise((resolve) => setTimeout(resolve, 0));
    const selected = [...live];
    await context.resume();
    const samples = (await rendering).getChannelData(0);
    stage.dispose();
    return {
      created, maximumLive, selected, remaining: live.size,
      initial: rms(samples, sampleRate, 0.02, 0.08),
      final: rms(samples, sampleRate, 0.4, 0.5),
      maximumStep: maximumSampleStep(samples, sampleRate, 0.09, 0.4),
    };
  });
  expect(result.created).toEqual(['a', 'b', 'c']);
  expect(result.maximumLive).toBe(2);
  expect(result.selected).toEqual(['c']);
  expect(result.remaining).toBe(0);
  expect(result.initial).toBeCloseTo(0.2, 5);
  expect(result.final).toBeCloseTo(0.05, 5);
  expect(result.maximumStep).toBeLessThan(0.001);
});
