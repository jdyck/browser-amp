import { describe, expect, it } from 'vitest';
import { DEFAULT_NOISE_GATE_SETTINGS, NoiseGateDsp } from './noiseGateDsp';

const SAMPLE_RATE = 48_000;

function run(dsp: NoiseGateDsp, seconds: number, signal: number, detector: number): Float32Array {
  const output = new Float32Array(Math.round(seconds * SAMPLE_RATE));
  for (let index = 0; index < output.length; index += 1) output[index] = dsp.processSample(signal, detector);
  return output;
}

describe('NoiseGateDsp', () => {
  it('opens quickly above threshold and closes only after hold and release', () => {
    const dsp = new NoiseGateDsp(SAMPLE_RATE, { ...DEFAULT_NOISE_GATE_SETTINGS, thresholdDb: -40 });
    run(dsp, 0.3, 1, 0);
    expect(dsp.state.open).toBe(false);
    expect(dsp.state.reductionDb).toBeCloseTo(DEFAULT_NOISE_GATE_SETTINGS.rangeDb, 1);

    const opening = run(dsp, 0.03, 1, 0.1);
    expect(dsp.state.open).toBe(true);
    expect(opening[Math.round(0.005 * SAMPLE_RATE)]).toBeGreaterThan(0.7);
    expect(dsp.state.reductionDb).toBeLessThan(0.1);

    run(dsp, 0.05, 1, 0);
    expect(dsp.state.open).toBe(true);
    const closing = run(dsp, 1.5, 1, 0);
    expect(dsp.state.open).toBe(false);
    expect(closing.at(-1)).toBeCloseTo(10 ** (-DEFAULT_NOISE_GATE_SETTINGS.rangeDb / 20), 2);
  });

  it('uses hysteresis so an in-between detector cannot open a closed gate or close an open gate', () => {
    const betweenThresholds = 10 ** (-43 / 20);
    const closed = new NoiseGateDsp(SAMPLE_RATE, { ...DEFAULT_NOISE_GATE_SETTINGS, thresholdDb: -40 });
    run(closed, 0.3, 1, betweenThresholds);
    expect(closed.state.open).toBe(false);

    const open = new NoiseGateDsp(SAMPLE_RATE, { ...DEFAULT_NOISE_GATE_SETTINGS, thresholdDb: -40 });
    run(open, 0.1, 1, 0.1);
    run(open, 0.3, 1, betweenThresholds);
    expect(open.state.open).toBe(true);
  });

  it('never attenuates beyond its range and smoothly returns to unity when bypassed', () => {
    const dsp = new NoiseGateDsp(SAMPLE_RATE, { ...DEFAULT_NOISE_GATE_SETTINGS, thresholdDb: -40 });
    const quiet = run(dsp, 1, 1, 0);
    expect(Math.min(...quiet)).toBeGreaterThanOrEqual(10 ** (-DEFAULT_NOISE_GATE_SETTINGS.rangeDb / 20) - 1e-6);
    expect(dsp.state.reductionDb).toBeCloseTo(DEFAULT_NOISE_GATE_SETTINGS.rangeDb, 2);

    dsp.setSettings({ ...DEFAULT_NOISE_GATE_SETTINGS, thresholdDb: -40, bypassed: true });
    const bypass = run(dsp, 0.1, 1, 0);
    expect(bypass[1]).toBeGreaterThan(quiet.at(-1)!);
    expect(bypass.at(-1)).toBeCloseTo(1, 5);
    expect(dsp.state.reductionDb).toBeCloseTo(0, 5);
  });

  it('responds deterministically to threshold changes without resetting its envelope', () => {
    const dsp = new NoiseGateDsp(SAMPLE_RATE, { ...DEFAULT_NOISE_GATE_SETTINGS, thresholdDb: -30 });
    run(dsp, 0.2, 1, 0.01);
    expect(dsp.state.open).toBe(false);
    dsp.setSettings({ ...DEFAULT_NOISE_GATE_SETTINGS, thresholdDb: -50 });
    run(dsp, 0.02, 1, 0.01);
    expect(dsp.state.open).toBe(true);
  });

  it('applies range and release changes without resetting the gate', () => {
    const fast = new NoiseGateDsp(SAMPLE_RATE, {
      ...DEFAULT_NOISE_GATE_SETTINGS,
      thresholdDb: -40,
      rangeDb: 18,
      releaseSeconds: 0.05,
    });
    const slow = new NoiseGateDsp(SAMPLE_RATE, {
      ...DEFAULT_NOISE_GATE_SETTINGS,
      thresholdDb: -40,
      rangeDb: 18,
      releaseSeconds: 0.8,
    });
    for (const dsp of [fast, slow]) run(dsp, 0.1, 1, 0.1);
    const fastClosing = run(fast, 0.4, 1, 0);
    const slowClosing = run(slow, 0.4, 1, 0);
    expect(fastClosing.at(-1)).toBeLessThan(slowClosing.at(-1)!);
    run(fast, 1, 1, 0);
    expect(fast.state.reductionDb).toBeCloseTo(18, 2);
  });
});
