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

test('chops the current Reverb tail without a click or resurrecting it after rapid bypass', async ({ page }) => {
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

    const switches = [
      { time: 0.5, bypassed: true },
      { time: 0.505, bypassed: false },
      { time: 0.51, bypassed: true },
      { time: 0.7, bypassed: false },
    ];
    const suspensions = switches.map(({ time }) => context.suspend(time));
    source.start(0.05);
    oscillator.start(0.62);
    oscillator.stop(0.9);
    const rendering = context.startRendering();
    for (let index = 0; index < switches.length; index += 1) {
      await suspensions[index];
      engine.applyControls({ ...engine.snapshot.controls, reverbBypassed: switches[index].bypassed });
      await resumeRendering();
    }
    const amountAfterBypass = engine.snapshot.controls.reverbAmount;

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

for (const { ampModel, sampleRate } of (['clean-tube', 'clean-tube-warm'] as const).flatMap(
  (ampModel) => [44_100, 48_000].map((sampleRate) => ({ ampModel, sampleRate })),
)) {
  test(`${ampModel} stays nearly clean at light input and breaks up progressively at ${sampleRate} Hz`, async ({ page }) => {
    await page.goto('./');
    const tones = await page.evaluate(async ({ ampModel, sampleRate }) => {
      const harnessPath = './tests/offlineAudioHarness.ts';
      const { connectOfflineEngine, rms, peak } = await import(harnessPath) as typeof import('./offlineAudioHarness');
      async function render(ampModel: import('../src/controls').AmpModel, amplitude: number, cleanGainDb = 0) {
        const context = new OfflineAudioContext(1, sampleRate, sampleRate);
        const source = context.createOscillator();
        const input = context.createGain();
        source.frequency.value = 200;
        input.gain.value = amplitude;
        source.connect(input);
        const engine = await connectOfflineEngine(context, input, { ampModel, cleanGainDb, masterVolumeDb: 0 });
        if (!engine.snapshot.monitoring) throw new Error('Offline engine did not connect');
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
          level: rms(samples, sampleRate, 0.5, 1),
          peak: peak(samples, sampleRate, 0.5, 1),
          distortion: Math.hypot(...harmonics.slice(1)) / (harmonics[0] || 1),
          secondHarmonic: harmonics[1],
          dc: samples.slice(start).reduce((sum, value) => sum + value, 0) / length,
          finite: samples.every(Number.isFinite),
        };
      }
      return {
        clean: await render('clean-voice', 0.1),
        light: await render(ampModel, 0.1),
        driven: await render(ampModel, 0.1, 12),
        hot: await render(ampModel, 1, 24),
        silent: await render(ampModel, 0, 24),
        originalLight: await render('clean-tube', 0.1),
        originalDriven: await render('clean-tube', 0.1, 12),
      };
    }, { ampModel, sampleRate });

    expect(tones.clean.level).toBeCloseTo(0.1 / Math.sqrt(2), 5);
    expect(tones.clean.distortion).toBeLessThan(0.0001);
    expect(tones.light.level / tones.clean.level).toBeGreaterThan(0.75);
    expect(tones.light.level / tones.clean.level).toBeLessThan(1.05);
    expect(tones.light.distortion).toBeGreaterThan(0.001);
    expect(tones.light.distortion).toBeLessThan(0.02);
    expect(tones.light.secondHarmonic).toBeGreaterThan(tones.clean.secondHarmonic * 100);
    expect(tones.driven.distortion).toBeGreaterThan(tones.light.distortion * 2);
    expect(tones.driven.level).toBeGreaterThan(tones.light.level * 2);
    expect(tones.driven.level).toBeLessThan(tones.light.level * 4);
    expect(tones.hot.distortion).toBeGreaterThan(tones.driven.distortion);
    expect(tones.hot.peak).toBeLessThan(1);
    for (const tone of Object.values(tones)) {
      expect(tone.finite).toBe(true);
      expect(Math.abs(tone.dc)).toBeLessThan(0.0001);
    }
    expect(tones.silent.peak).toBe(0);
    if (ampModel === 'clean-tube-warm') {
      expect(tones.driven.distortion).toBeGreaterThan(tones.originalDriven.distortion * 1.25);
      expect(tones.driven.level / tones.light.level).toBeLessThan(tones.originalDriven.level / tones.originalLight.level);
    }
  });
}

test('Clean Tube Warm has fuller low mids and darker highs than the original tube voice', async ({ page }) => {
  await page.goto('./');
  const responses = [];
  for (const ampModel of ['clean-tube', 'clean-tube-warm'] as const) {
    const controls = { ampModel, masterVolumeDb: 0 };
    responses.push({
      rumble: await renderAmp(page, { frequency: 10, amplitude: 0.01, controls }),
      bass: await renderAmp(page, { frequency: 80, amplitude: 0.01, controls }),
      lowMid: await renderAmp(page, { frequency: 400, amplitude: 0.01, controls }),
      mid: await renderAmp(page, { frequency: 1_000, amplitude: 0.01, controls }),
      high: await renderAmp(page, { frequency: 6_000, amplitude: 0.01, controls }),
    });
  }
  const [original, warm] = responses;
  expect(warm.lowMid / warm.mid).toBeGreaterThan(original.lowMid / original.mid * 1.1);
  expect(warm.high / warm.mid).toBeLessThan(original.high / original.mid * 0.75);
  expect(warm.rumble).toBeLessThan(warm.bass * 0.05);
});

test('Clean Tube rolls off rumble and harsh high frequencies without changing Clean Voice', async ({ page }) => {
  await page.goto('./');
  const controls = { ampModel: 'clean-tube', masterVolumeDb: 0 } as const;
  const low = await renderAmp(page, { frequency: 20, controls });
  const body = await renderAmp(page, { frequency: 200, controls });
  const high = await renderAmp(page, { frequency: 10_000, controls });
  const cleanHigh = await renderAmp(page, { frequency: 10_000, controls: { masterVolumeDb: 0 } });

  expect(low).toBeLessThan(body * 0.25);
  expect(high).toBeLessThan(body * 0.25);
  expect(cleanHigh).toBeCloseTo(1 / Math.sqrt(2), 4);
});

test('rapid amp model switches crossfade and return to the original clean signal', async ({ page }) => {
  await page.goto('./');
  const transition = await page.evaluate(async () => {
    const harnessPath = './tests/offlineAudioHarness.ts';
    const { connectOfflineEngine, maximumSampleStep, rms } = await import(harnessPath) as typeof import('./offlineAudioHarness');
    const sampleRate = 48_000;
    const context = new OfflineAudioContext(1, sampleRate, sampleRate);
    const resumeRendering = context.resume.bind(context);
    const source = context.createConstantSource();
    source.offset.value = 0.25;
    const engine = await connectOfflineEngine(context, source, { masterVolumeDb: 0 });
    const switches = [
      { time: 0.2, model: 'clean-tube' },
      { time: 0.208, model: 'clean-tube-warm' },
      { time: 0.216, model: 'clean-tube' },
      { time: 0.224, model: 'clean-voice' },
      { time: 0.232, model: 'clean-tube-warm' },
      { time: 0.5, model: 'clean-voice' },
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

test('shared switching retires old graphs on audio deadlines without further control changes', async ({ page }) => {
  await page.goto('./');
  const result = await page.evaluate(async () => {
    const modulePath = './src/audio/stageSwitcher.ts';
    const harnessPath = './tests/offlineAudioHarness.ts';
    const { StageSwitcher } = await import(modulePath) as typeof import('../src/audio/stageSwitcher');
    const { rms, maximumSampleStep } = await import(harnessPath) as typeof import('./offlineAudioHarness');
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

for (const frequency of [40, 800, 10_000]) {
  test(`bypasses and restores the whole EQ at ${frequency} Hz while retaining band settings`, async ({ page }) => {
    await page.goto('./');

    const levels = await page.evaluate(async (frequency) => {
      const harnessPath = './tests/offlineAudioHarness.ts';
      const { connectOfflineEngine, rms } = await import(harnessPath) as typeof import('./offlineAudioHarness');
      const sampleRate = 48_000;
      const context = new OfflineAudioContext(1, sampleRate, sampleRate);
      const resumeRendering = context.resume.bind(context);
      const source = context.createOscillator();
      const inputGain = context.createGain();
      source.frequency.value = frequency;
      inputGain.gain.value = 0.1;
      source.connect(inputGain);
      const engine = await connectOfflineEngine(context, inputGain, {
        bassDb: 6, middleDb: 6, trebleDb: 6, eqBypassed: true, masterVolumeDb: 0,
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
      engine.applyControls({ ...engine.snapshot.controls, bassDb: 12, middleDb: 12, trebleDb: 12 });
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

    expect(levels.retainedSettings).toMatchObject({ bassDb: 6, middleDb: 6, trebleDb: 6, eqBypassed: true });
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
