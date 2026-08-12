import { describe, expect, it, vi } from 'vitest';
import { dbToLinearGain, normalizeDb, smoothGainToDb } from './gain';

describe('gain controls', () => {
  it('normalizes displayed values to their range and 0.1 dB precision', () => {
    expect(normalizeDb(24.08, -12, 24)).toBe(24);
    expect(normalizeDb(-18.26, -60, 0)).toBe(-18.3);
    expect(normalizeDb(-72, -60, 0)).toBe(-60);
  });

  it('maps decibels to linear gain without adding a nonlinear transfer', () => {
    expect(dbToLinearGain(0)).toBe(1);
    expect(dbToLinearGain(6)).toBeCloseTo(1.9953, 4);
    expect(dbToLinearGain(-60)).toBeCloseTo(0.001, 6);
  });

  it('ramps from the current value over 20 ms for click-free updates', () => {
    const parameter = {
      value: 0.5,
      cancelScheduledValues: vi.fn(),
      setValueAtTime: vi.fn(),
      linearRampToValueAtTime: vi.fn(),
    };

    smoothGainToDb(parameter, 0, 12.5);

    expect(parameter.cancelScheduledValues).toHaveBeenCalledWith(12.5);
    expect(parameter.setValueAtTime).toHaveBeenCalledWith(0.5, 12.5);
    expect(parameter.linearRampToValueAtTime).toHaveBeenCalledWith(1, 12.52);
  });
});
