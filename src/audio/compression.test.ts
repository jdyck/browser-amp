import { describe, expect, it } from 'vitest';
import { compressionLevelMatchDb, compressionSettings } from './AudioEngine';

describe('Compression Amount', () => {
  it('maps the exact control range from neutral to firm compression', () => {
    expect(compressionSettings(0)).toEqual({
      thresholdDb: 0,
      ratio: 1,
      attackSeconds: 0.01,
      releaseSeconds: 0.15,
      kneeDb: 12,
    });
    expect(compressionSettings(25)).toEqual({
      thresholdDb: -9,
      ratio: 2.25,
      attackSeconds: 0.01,
      releaseSeconds: 0.15,
      kneeDb: 12,
    });
    expect(compressionSettings(100)).toEqual({
      thresholdDb: -36,
      ratio: 6,
      attackSeconds: 0.01,
      releaseSeconds: 0.15,
      kneeDb: 12,
    });
  });

  it('clamps and rounds numeric input to the one-percent control precision', () => {
    expect(compressionSettings(-1)).toEqual(compressionSettings(0));
    expect(compressionSettings(73.6)).toEqual(compressionSettings(74));
    expect(compressionSettings(101)).toEqual(compressionSettings(100));
  });

  it('derives stable, capped Level Match gain from Amount', () => {
    expect(compressionLevelMatchDb(0)).toBe(0);
    expect(compressionLevelMatchDb(25)).toBe(-1);
    expect(compressionLevelMatchDb(50)).toBe(-3.5);
    expect(compressionLevelMatchDb(75)).toBe(-2);
    expect(compressionLevelMatchDb(100)).toBe(0.5);
    expect(compressionLevelMatchDb(101)).toBe(0.5);
    expect(compressionLevelMatchDb(62.5)).toBeCloseTo(-2.72, 6);
  });
});
