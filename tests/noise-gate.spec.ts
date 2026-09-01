import { expect, test } from '@playwright/test';

test('the AudioWorklet opens, holds, closes, applies hysteresis, and bypasses deterministically', async ({ page }) => {
  await page.goto('./');
  const result = await page.evaluate(async () => {
    const stagePath = './src/audio/noiseGate.ts';
    const { NoiseGateStage } = await import(stagePath) as typeof import('../src/audio/noiseGate');
    const sampleRate = 48_000;

    async function render(
      detectorSegments: ReadonlyArray<readonly [number, number, number]>,
      bypassed = false,
      rangeDb = 9,
      releaseSeconds = 0.2,
    ) {
      const duration = 1.8;
      const context = new OfflineAudioContext(1, duration * sampleRate, sampleRate);
      const signal = new ConstantSourceNode(context, { offset: 0.2 });
      const detectorBuffer = context.createBuffer(1, duration * sampleRate, sampleRate);
      const detectorSamples = detectorBuffer.getChannelData(0);
      for (const [start, end, amplitude] of detectorSegments) {
        detectorSamples.fill(amplitude, Math.round(start * sampleRate), Math.round(end * sampleRate));
      }
      const detector = new AudioBufferSourceNode(context, { buffer: detectorBuffer });
      const stage = await NoiseGateStage.create(
        context,
        {
          createAudioWorkletNode: (workletContext, name, options) => new AudioWorkletNode(workletContext, name, options),
        } as import('../src/audio/browserAudio').BrowserAudio,
        { thresholdDb: -40, rangeDb, releaseSeconds, bypassed },
        () => undefined,
      );
      signal.connect(stage.input);
      detector.connect(stage.detectorInput);
      stage.output.connect(context.destination);
      signal.start(0);
      detector.start(0);
      const rendered = await context.startRendering();
      stage.disconnect();
      return rendered.getChannelData(0);
    }

    function average(samples: Float32Array, start: number, end: number) {
      let total = 0;
      for (let index = Math.round(start * sampleRate); index < Math.round(end * sampleRate); index += 1) total += samples[index];
      return total / Math.round((end - start) * sampleRate);
    }

    const cycle = await render([[0.3, 0.5, 0.1]]);
    const between = 10 ** (-43 / 20);
    const staysClosed = await render([[0, 1.8, between]]);
    const staysOpen = await render([[0, 0.2, 0.1], [0.2, 1.8, between]]);
    const bypassed = await render([], true);
    const widerRange = await render([], false, 18);
    const fastRelease = await render([[0, 0.2, 0.1]], false, 9, 0.05);
    const slowRelease = await render([[0, 0.2, 0.1]], false, 9, 0.8);
    return {
      closed: average(cycle, 0.2, 0.29),
      attackEarly: average(cycle, 0.3, 0.302),
      open: average(cycle, 0.34, 0.48),
      held: average(cycle, 0.52, 0.56),
      closing: average(cycle, 0.75, 0.85),
      closedAgain: average(cycle, 1.65, 1.75),
      hysteresisClosed: average(staysClosed, 1.6, 1.7),
      hysteresisOpen: average(staysOpen, 1.6, 1.7),
      bypass: average(bypassed, 1.6, 1.7),
      widerRange: average(widerRange, 1.6, 1.7),
      fastRelease: average(fastRelease, 0.55, 0.65),
      slowRelease: average(slowRelease, 0.55, 0.65),
      finite: [cycle, staysClosed, staysOpen, bypassed, widerRange, fastRelease, slowRelease]
        .every((samples) => samples.every(Number.isFinite)),
    };
  });

  expect(result.finite).toBe(true);
  expect(result.closed).toBeCloseTo(0.2 * 10 ** (-9 / 20), 3);
  expect(result.attackEarly).toBeGreaterThan(result.closed);
  expect(result.open).toBeCloseTo(0.2, 3);
  expect(result.held).toBeCloseTo(0.2, 3);
  expect(result.closing).toBeLessThan(0.19);
  expect(result.closing).toBeGreaterThan(result.closed);
  expect(result.closedAgain).toBeCloseTo(result.closed, 2);
  expect(result.hysteresisClosed).toBeCloseTo(result.closed, 3);
  expect(result.hysteresisOpen).toBeCloseTo(0.2, 3);
  expect(result.bypass).toBeCloseTo(0.2, 6);
  expect(result.widerRange).toBeCloseTo(0.2 * 10 ** (-18 / 20), 3);
  expect(result.fastRelease).toBeLessThan(result.slowRelease);
});
