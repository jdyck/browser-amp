import { expect, test } from '@playwright/test';

test('every impulse control changes the response in its intended direction and remains finite at its limits', async ({ page }) => {
  await page.goto('./');
  const results = await page.evaluate(async () => {
    const impulsePath = './src/audio/reverbImpulses.ts';
    const settingsPath = './src/reverbSettings.ts';
    const { createReverbImpulse } = await import(impulsePath) as typeof import('../src/audio/reverbImpulses');
    const { DEFAULT_REVERB_SETTINGS, reverbParameters, reverbControlEntries } = await import(settingsPath) as typeof import('../src/reverbSettings');
    const sampleRate = 48_000;
    const context = new OfflineAudioContext(2, 1, sampleRate);
    function stats(buffer: AudioBuffer) {
      const data = buffer.getChannelData(0);
      let energy = 0;
      let weighted = 0;
      let difference = 0;
      let late = 0;
      let lateDifference = 0;
      let tailEnergy = 0;
      function magnitude(frequency: number) {
        let real = 0;
        let imaginary = 0;
        for (let index = 0; index < data.length; index += 1) {
          real += data[index] * Math.cos(2 * Math.PI * frequency * index / sampleRate);
          imaginary += data[index] * Math.sin(2 * Math.PI * frequency * index / sampleRate);
        }
        return Math.hypot(real, imaginary);
      }
      for (let index = 0; index < data.length; index += 1) {
        energy += data[index] ** 2;
        weighted += data[index] ** 2 * index / sampleRate;
        if (index > 0) difference += (data[index] - data[index - 1]) ** 2;
        if (index > sampleRate * 0.1) {
          late += data[index] ** 2;
        }
        // The hall's first comb arrivals and allpass diffusion extend beyond
        // 100 ms. Measure damping after that onset, in the feedback decay.
        if (index > sampleRate * 0.25) {
          tailEnergy += data[index] ** 2;
          lateDifference += (data[index] - data[index - 1]) ** 2;
        }
      }
      return {
        finite: [0, 1].every((channel) => buffer.getChannelData(channel).every(Number.isFinite)),
        centroid: weighted / energy,
        brightness: difference / energy,
        onset: data.findIndex((value) => Math.abs(value) > 1e-8) / sampleRate,
        lowRatio: magnitude(80) / magnitude(5_000),
        lateFraction: late / energy,
        lateBrightness: tailEnergy > 0 ? lateDifference / tailEnergy : 0,
        energy,
        duration: buffer.duration,
      };
    }
    const results = [];
    for (const profile of Object.keys(DEFAULT_REVERB_SETTINGS) as import('../src/controls').ReverbProfile[]) {
      for (const [key, definition] of reverbControlEntries(profile)) {
        if (key === 'dwell' || key === 'modulationDepth' || key === 'modulationRateHz') continue;
        const low = createReverbImpulse(context, profile, { ...reverbParameters(profile), [key]: definition.minimum });
        const high = createReverbImpulse(context, profile, { ...reverbParameters(profile), [key]: definition.maximum });
        const a = low.getChannelData(0);
        const b = high.getChannelData(0);
        let difference = 0;
        for (let index = 0; index < Math.max(a.length, b.length); index += 1) difference += ((a[index] ?? 0) - (b[index] ?? 0)) ** 2;
        results.push({ profile, key, difference, low: stats(low), high: stats(high) });
      }
      // Combined extreme settings must also be safe, including the shortest
      // decay with the longest predelay and the largest room size.
      for (const extreme of ['minimum', 'maximum'] as const) {
        const parameters = { ...reverbParameters(profile) };
        for (const [key, definition] of reverbControlEntries(profile)) parameters[key] = definition[extreme];
        parameters.preDelayMs = 200;
        const response = createReverbImpulse(context, profile, parameters);
        if (![0, 1].every((channel) => response.getChannelData(channel).every(Number.isFinite))) throw new Error(`${profile} ${extreme} is not finite`);
      }
    }
    return results;
  });
  for (const result of results) {
    const label = `${result.profile}: ${result.key}`;
    expect(result.difference, label).toBeGreaterThan(0.001);
    for (const response of [result.low, result.high]) {
      expect(response.finite, label).toBe(true);
      expect(response.energy, label).toBeGreaterThan(0.001);
      expect(response.energy, label).toBeLessThan(1000);
      expect(response.duration, label).toBeLessThan(8);
    }
    if (result.key === 'decaySeconds') expect(result.high.centroid, label).toBeGreaterThan(result.low.centroid * 1.5);
    if (result.key === 'preDelayMs') expect(result.high.onset - result.low.onset, label).toBeCloseTo(0.2, 3);
    if (result.key === 'toneDb') expect(result.high.brightness, label).toBeGreaterThan(result.low.brightness);
    if (result.key === 'lowCutHz') expect(result.high.lowRatio, label).toBeLessThan(result.low.lowRatio * 0.3);
    if (result.key === 'damping') expect(result.high.lateBrightness, label).toBeLessThan(result.low.lateBrightness);
    if (result.key === 'size') expect(result.high.onset, label).toBeGreaterThan(result.low.onset);
    if (result.key === 'earlyLate') expect(result.high.lateFraction, label).toBeGreaterThan(result.low.lateFraction + 0.01);
  }
});

test('Dwell changes spring drive and modulation depth/rate change only the hall wet signal', async ({ page }) => {
  await page.goto('./');
  const result = await page.evaluate(async () => {
    const stagePath = './src/audio/reverb.ts';
    const settingsPath = './src/reverbSettings.ts';
    const { ReverbStage } = await import(stagePath) as typeof import('../src/audio/reverb');
    const { reverbParameters } = await import(settingsPath) as typeof import('../src/reverbSettings');
    const sampleRate = 48_000;
    async function render(profile: import('../src/controls').ReverbProfile, overrides: Partial<import('../src/reverbSettings').ReverbParameters>, amplitude = 0.15, amount = 100) {
      const context = new OfflineAudioContext(3, sampleRate * 1.5, sampleRate);
      const oscillator = context.createOscillator();
      oscillator.frequency.value = 440;
      const source = context.createGain();
      source.gain.value = amplitude;
      oscillator.connect(source);
      const stage = new ReverbStage(context, amount, false, profile, { ...reverbParameters(profile), ...overrides });
      source.connect(stage.input);
      const splitter = context.createChannelSplitter(2);
      const merger = context.createChannelMerger(3);
      stage.output.connect(splitter);
      splitter.connect(merger, 0, 0);
      splitter.connect(merger, 1, 1);
      source.connect(merger, 0, 2);
      merger.connect(context.destination);
      oscillator.start(0.05);
      oscillator.stop(0.9);
      const buffer = await context.startRendering();
      const dry = buffer.getChannelData(2);
      const wet = buffer.getChannelData(0).map((value, index) => value - dry[index]);
      let energy = 0;
      for (let index = sampleRate * 0.6; index < sampleRate * 0.8; index += 1) energy += wet[index] ** 2;
      const rms = Math.sqrt(energy / (sampleRate * 0.2));
      function harmonic(frequency: number) {
        let real = 0;
        let imaginary = 0;
        for (let index = sampleRate * 0.6; index < sampleRate * 0.8; index += 1) {
          real += wet[index] * Math.cos(2 * Math.PI * frequency * index / sampleRate);
          imaginary += wet[index] * Math.sin(2 * Math.PI * frequency * index / sampleRate);
        }
        return Math.hypot(real, imaginary);
      }
      stage.disconnect();
      return { wet, rms, dry, harmonicRatio: harmonic(1320) / harmonic(440), finite: wet.every(Number.isFinite) };
    }
    function difference(a: Float32Array, b: Float32Array) {
      let energy = 0;
      for (let index = 0; index < a.length; index += 1) energy += (a[index] - b[index]) ** 2;
      return Math.sqrt(energy / a.length);
    }
    const cleanQuiet = await render('fender-spring', { dwell: 0 }, 0.02);
    const cleanLoud = await render('fender-spring', { dwell: 0 }, 0.5);
    const drivenQuiet = await render('fender-spring', { dwell: 100 }, 0.02);
    const drivenLoud = await render('fender-spring', { dwell: 100 }, 0.5);
    const hall = await render('digital-hall', { modulationDepth: 0 });
    const inactiveRate = await render('digital-hall', { modulationDepth: 0, modulationRateHz: 5 });
    const modulated = await render('digital-hall', { modulationDepth: 70, modulationRateHz: 0.3 });
    const faster = await render('digital-hall', { modulationDepth: 70, modulationRateHz: 2 });
    const deeper = await render('digital-hall', { modulationDepth: 100, modulationRateHz: 0.3 });
    const dryOnly = await render('digital-hall', { modulationDepth: 100, modulationRateHz: 5 }, 0.15, 0);
    return {
      cleanRatio: cleanLoud.rms / cleanQuiet.rms,
      drivenRatio: drivenLoud.rms / drivenQuiet.rms,
      cleanHarmonics: cleanLoud.harmonicRatio,
      drivenHarmonics: drivenLoud.harmonicRatio,
      inactiveRateDifference: difference(hall.wet, inactiveRate.wet),
      modulationDifference: difference(hall.wet, modulated.wet),
      rateDifference: difference(modulated.wet, faster.wet),
      depthDifference: difference(modulated.wet, deeper.wet),
      dryDifference: difference(hall.dry, modulated.dry),
      dryOnlyWet: dryOnly.rms,
      finite: [cleanQuiet, cleanLoud, drivenQuiet, drivenLoud, hall, modulated, faster, deeper, dryOnly].every(({ finite }) => finite),
    };
  });
  expect(result.finite).toBe(true);
  expect(result.cleanRatio).toBeCloseTo(25, 1);
  // The spring's resonances can emphasize generated harmonics, so test
  // nonlinearity and harmonic growth rather than overall output compression.
  expect(Math.abs(result.drivenRatio / result.cleanRatio - 1)).toBeGreaterThan(0.2);
  expect(result.drivenHarmonics).toBeGreaterThan(result.cleanHarmonics * 5);
  expect(result.inactiveRateDifference).toBeLessThan(0.000_001);
  expect(result.modulationDifference).toBeGreaterThan(0.000_1);
  expect(result.rateDifference).toBeGreaterThan(0.000_1);
  expect(result.depthDifference).toBeGreaterThan(0.000_1);
  expect(result.dryDifference).toBe(0);
  expect(result.dryOnlyWet).toBeLessThan(0.000_001);
});

test('rapid parameter changes with drive and modulation preserve dry audio and retire wet histories', async ({ page }) => {
  await page.goto('./');
  const result = await page.evaluate(async () => {
    const stagePath = './src/audio/reverb.ts';
    const settingsPath = './src/reverbSettings.ts';
    const harnessPath = './tests/offlineAudioHarness.ts';
    const { ReverbStage } = await import(stagePath) as typeof import('../src/audio/reverb');
    const { reverbParameters } = await import(settingsPath) as typeof import('../src/reverbSettings');
    const { rms, maximumSampleStep } = await import(harnessPath) as typeof import('./offlineAudioHarness');
    const sampleRate = 48_000;
    const context = new OfflineAudioContext(2, sampleRate * 1.4, sampleRate);
    const oscillator = context.createOscillator();
    oscillator.frequency.value = 220;
    const source = context.createGain();
    source.gain.value = 0.1;
    oscillator.connect(source);
    const stage = new ReverbStage(context, 100, false, 'digital-hall', { ...reverbParameters('digital-hall'), modulationDepth: 80 });
    source.connect(stage.input);
    stage.output.connect(context.destination);
    const edits: { time: number; profile: import('../src/controls').ReverbProfile; parameters: Partial<import('../src/reverbSettings').ReverbParameters>; bypassed?: boolean }[] = [
      { time: 0.2, profile: 'digital-hall', parameters: { decaySeconds: 0.3, modulationDepth: 100 } },
      { time: 0.205, profile: 'digital-hall', parameters: { decaySeconds: 4, modulationDepth: 50 } },
      { time: 0.21, profile: 'digital-hall', parameters: { decaySeconds: 1, modulationDepth: 70, modulationRateHz: 2 } },
      { time: 0.4, profile: 'fender-spring', parameters: { dwell: 100 } },
      { time: 0.405, profile: 'fender-spring', parameters: { dwell: 35 } },
      { time: 0.6, profile: 'digital-hall', parameters: { modulationDepth: 100, modulationRateHz: 5 } },
      { time: 0.75, profile: 'digital-hall', parameters: { modulationDepth: 100, modulationRateHz: 5 }, bypassed: true },
      { time: 1, profile: 'digital-hall', parameters: { modulationDepth: 80 } },
    ];
    const suspensions = edits.map(({ time }) => context.suspend(time));
    oscillator.start(0.05);
    oscillator.stop(0.65);
    const rendering = context.startRendering();
    for (let index = 0; index < edits.length; index += 1) {
      await suspensions[index];
      const edit = edits[index];
      stage.setControls(100, edit.bypassed ?? false, edit.profile, { ...reverbParameters(edit.profile), ...edit.parameters });
      await context.resume();
    }
    const buffer = await rendering;
    const samples = buffer.getChannelData(0);
    stage.disconnect();
    return {
      finite: [0, 1].every((channel) => buffer.getChannelData(channel).every(Number.isFinite)),
      duringEdits: rms(samples, sampleRate, 0.2, 0.6),
      maximumStep: maximumSampleStep(samples, sampleRate, 0.19, 0.64),
      afterBypass: rms(samples, sampleRate, 0.82, 0.95),
      afterReenable: rms(samples, sampleRate, 1.1, 1.3),
    };
  });
  expect(result.finite).toBe(true);
  expect(result.duringEdits).toBeGreaterThan(0.04);
  expect(result.duringEdits).toBeLessThan(0.2);
  expect(result.maximumStep).toBeLessThan(0.05);
  expect(result.afterBypass).toBeLessThan(0.000_001);
  expect(result.afterReenable).toBeLessThan(0.000_001);
});

for (const sampleRate of [44_100, 48_000, 96_000]) {
  test(`all reverb modules render distinct, finite, decaying responses at ${sampleRate} Hz`, async ({ page }) => {
    await page.goto('./');
    const results = await page.evaluate(async (sampleRate) => {
      const harnessPath = './tests/offlineAudioHarness.ts';
      const impulsePath = './src/audio/reverbImpulses.ts';
      const controlsPath = './src/controls.ts';
      const { connectOfflineEngine, peak, rms, stereoDifference } = await import(harnessPath) as typeof import('./offlineAudioHarness');
      const { createReverbImpulse } = await import(impulsePath) as typeof import('../src/audio/reverbImpulses');
      const { REVERB_PROFILES } = await import(controlsPath) as typeof import('../src/controls');
      const profiles = Object.keys(REVERB_PROFILES) as import('../src/controls').ReverbProfile[];
      const impulses: Float32Array[] = [];
      const results = [];
      for (const reverbProfile of profiles) {
        const context = new OfflineAudioContext(2, sampleRate * 3.7, sampleRate);
        const impulse = createReverbImpulse(context, reverbProfile);
        const repeat = createReverbImpulse(context, reverbProfile);
        impulses.push(impulse.getChannelData(0));
        const source = context.createBufferSource();
        const input = context.createBuffer(1, 1, sampleRate);
        input.getChannelData(0)[0] = 0.5;
        source.buffer = input;
        await connectOfflineEngine(context, source, {
          reverbProfile, reverbAmount: 100, reverbBypassed: false, masterVolumeDb: 0,
        });
        source.start(0.05);
        const rendered = await context.startRendering();
        const left = rendered.getChannelData(0);
        const right = rendered.getChannelData(1);
        let maximumError = 0;
        let energy = 0;
        let differenceEnergy = 0;
        const samples = impulse.getChannelData(0);
        const offset = Math.round(0.05 * sampleRate);
        for (let index = 0; index < samples.length; index += 1) {
          energy += samples[index] ** 2;
          if (index > 0) differenceEnergy += (samples[index] - samples[index - 1]) ** 2;
          const expected = samples[index] * 0.5 * 0.0975 + (index === 0 ? 0.5 : 0);
          maximumError = Math.max(maximumError, Math.abs(left[offset + index] - expected));
        }
        results.push({
          reverbProfile,
          deterministic: [0, 1].every((channel) => impulse.getChannelData(channel).every(
            (sample, index) => sample === repeat.getChannelData(channel)[index],
          )),
          finite: left.every(Number.isFinite) && right.every(Number.isFinite),
          energy: energy * 48_000 / sampleRate,
          brightness: differenceEnergy / energy,
          maximumError,
          dryAttack: peak(left, sampleRate, 0.05, 0.054),
          wetPeak: peak(left, sampleRate, 0.055, 3.6),
          early: rms(left, sampleRate, 0.06, 0.3),
          late: rms(left, sampleRate, 0.05 + impulse.duration * 0.8, 0.05 + impulse.duration),
          after: peak(left, sampleRate, 0.06 + impulse.duration, 3.7),
          stereo: stereoDifference(left, right, sampleRate, 0.06, 0.3),
        });
      }
      let maximumCorrelation = 0;
      for (let a = 0; a < impulses.length; a += 1) {
        for (let b = a + 1; b < impulses.length; b += 1) {
          let dot = 0;
          let energyA = 0;
          let energyB = 0;
          for (let index = 0; index < Math.max(impulses[a].length, impulses[b].length); index += 1) {
            const left = impulses[a][index] ?? 0;
            const right = impulses[b][index] ?? 0;
            dot += left * right;
            energyA += left * left;
            energyB += right * right;
          }
          maximumCorrelation = Math.max(maximumCorrelation, Math.abs(dot / Math.sqrt(energyA * energyB)));
        }
      }
      return { profiles: results, maximumCorrelation };
    }, sampleRate);

    expect(results.maximumCorrelation).toBeLessThan(0.8);
    for (const response of results.profiles) {
      expect(response.deterministic, response.reverbProfile).toBe(true);
      expect(response.finite, response.reverbProfile).toBe(true);
      expect(response.energy, response.reverbProfile).toBeGreaterThan(25);
      expect(response.energy, response.reverbProfile).toBeLessThan(42);
      expect(response.maximumError, response.reverbProfile).toBeLessThan(0.000_001);
      expect(response.dryAttack, response.reverbProfile).toBeCloseTo(0.5, 5);
      expect(response.wetPeak, response.reverbProfile).toBeLessThan(0.2);
      expect(response.early, response.reverbProfile).toBeGreaterThan(0.000_1);
      expect(response.late, response.reverbProfile).toBeLessThan(response.early * 0.1);
      expect(response.after, response.reverbProfile).toBeLessThan(0.000_001);
      expect(response.stereo, response.reverbProfile).toBeGreaterThan(0.000_1);
    }
    const brightSpring = results.profiles.find(({ reverbProfile }) => reverbProfile === 'fender-spring')!;
    const darkSpring = results.profiles.find(({ reverbProfile }) => reverbProfile === 'polytone-spring')!;
    expect(brightSpring.brightness).toBeGreaterThan(darkSpring.brightness * 1.5);
  });
}

test('switching reverb modules fades old tails, keeps dry audio, and never revives old history', async ({ page }) => {
  await page.goto('./');
  const result = await page.evaluate(async () => {
    const harnessPath = './tests/offlineAudioHarness.ts';
    const { connectOfflineEngine, maximumSampleStep, rms } = await import(harnessPath) as typeof import('./offlineAudioHarness');
    const sampleRate = 48_000;
    const context = new OfflineAudioContext(2, sampleRate * 1.5, sampleRate);
    const resume = context.resume.bind(context);
    const input = context.createGain();
    const pulse = context.createBufferSource();
    pulse.buffer = context.createBuffer(1, 1, sampleRate);
    pulse.buffer.getChannelData(0)[0] = 0.5;
    pulse.connect(input);
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.frequency.value = 220;
    gain.gain.value = 0.15;
    oscillator.connect(gain).connect(input);
    const engine = await connectOfflineEngine(context, input, {
      reverbProfile: 'digital-hall', reverbAmount: 100, reverbBypassed: false, masterVolumeDb: 0,
    });
    const switches: { time: number; reverbProfile: import('../src/controls').ReverbProfile }[] = [
      { time: 0.3, reverbProfile: 'fender-spring' },
      { time: 0.305, reverbProfile: 'studio-chamber' },
      { time: 0.31, reverbProfile: 'digital-hall' },
      { time: 0.7, reverbProfile: 'polytone-spring' },
      { time: 0.705, reverbProfile: 'jazz-room' },
      { time: 0.71, reverbProfile: 'digital-room' },
      { time: 0.85, reverbProfile: 'studio-plate' },
    ];
    const suspensions = switches.map(({ time }) => context.suspend(time));
    pulse.start(0.05);
    oscillator.start(0.6);
    oscillator.stop(1.1);
    const rendering = context.startRendering();
    for (let index = 0; index < switches.length; index += 1) {
      await suspensions[index];
      engine.applyControls({ ...engine.snapshot.controls, reverbProfile: switches[index].reverbProfile });
      await resume();
    }
    const rendered = await rendering;
    const samples = rendered.getChannelData(0);
    return {
      oldTail: rms(samples, sampleRate, 0.1, 0.25),
      retiredTail: rms(samples, sampleRate, 0.38, 0.55),
      pulseSwitchStep: maximumSampleStep(samples, sampleRate, 0.29, 0.38),
      sustainedSwitchStep: maximumSampleStep(samples, sampleRate, 0.69, 0.9),
      sustained: rms(samples, sampleRate, 0.7, 1.05),
      newTail: rms(samples, sampleRate, 1.15, 1.4),
      profile: engine.snapshot.controls.reverbProfile,
      monitoring: engine.snapshot.monitoring,
    };
  });
  expect(result.oldTail).toBeGreaterThan(0.000_1);
  expect(result.retiredTail).toBeLessThan(0.000_001);
  expect(result.pulseSwitchStep).toBeLessThan(0.05);
  expect(result.sustainedSwitchStep).toBeLessThan(0.05);
  expect(result.sustained).toBeGreaterThan(0.07);
  expect(result.sustained).toBeLessThan(0.2);
  expect(result.newTail).toBeGreaterThan(0.000_1);
  expect(result.profile).toBe('studio-plate');
  expect(result.monitoring).toBe(true);
});

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
