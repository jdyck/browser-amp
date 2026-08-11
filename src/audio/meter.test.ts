import { describe, expect, it } from 'vitest';
import { dbfsFromSamples, nextPeakHold } from './meter';

describe('Input Level Meter calculations', () => {
  it('clamps silence to -60 dBFS and a full-scale sample to 0 dBFS', () => {
    expect(dbfsFromSamples(new Float32Array([0, 0]))).toBe(-60);
    expect(dbfsFromSamples(new Float32Array([1, -1]))).toBe(0);
  });

  it('keeps a peak visible for one second before it falls to the current level', () => {
    const peak = { dbfs: -6, heldAt: 1_000 };

    expect(nextPeakHold(peak, -24, 1_900)).toEqual(peak);
    expect(nextPeakHold(peak, -24, 2_001)).toEqual({ dbfs: -24, heldAt: 2_001 });
  });
});
