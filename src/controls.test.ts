import { describe, expect, it } from 'vitest';
import { DEFAULT_AMP_CONTROLS, normalizeAmpControlSettings } from './controls';

describe('Amp Control Settings', () => {
  it('accepts known amp models and safely defaults old or unknown selections', () => {
    expect(normalizeAmpControlSettings({ ampModel: 'clean-tube' }).ampModel).toBe('clean-tube');
    expect(normalizeAmpControlSettings({ ampModel: 'clean-tube-warm' }).ampModel).toBe('clean-tube-warm');
    expect(normalizeAmpControlSettings({}).ampModel).toBe('clean-voice');
    for (const ampModel of ['unknown', 'constructor', '__proto__', null, 1]) {
      expect(normalizeAmpControlSettings({ ampModel }).ampModel).toBe('clean-voice');
    }
    expect(normalizeAmpControlSettings(
      { ampModel: 'unknown' },
      { ...DEFAULT_AMP_CONTROLS, ampModel: 'clean-tube' },
    ).ampModel).toBe('clean-tube');
  });

  it('normalizes EQ bypass and keeps older settings enabled', () => {
    expect(normalizeAmpControlSettings({ eqBypassed: true }).eqBypassed).toBe(true);
    expect(normalizeAmpControlSettings({ eqBypassed: false }).eqBypassed).toBe(false);
    expect(normalizeAmpControlSettings({ eqBypassed: 'true' }).eqBypassed).toBe(false);
    expect(normalizeAmpControlSettings({ bassDb: 6 }).eqBypassed).toBe(false);
  });

  it('normalizes values to their documented ranges and precision', () => {
    expect(normalizeAmpControlSettings({
      ...DEFAULT_AMP_CONTROLS,
      cleanGainDb: 24.08,
      bassDb: -72,
      middleDb: 3.26,
      compressionAmount: 73.6,
      masterVolumeDb: -18.26,
    })).toMatchObject({
      cleanGainDb: 24,
      bassDb: -12,
      middleDb: 3.3,
      compressionAmount: 74,
      masterVolumeDb: -18.3,
    });
  });
});
