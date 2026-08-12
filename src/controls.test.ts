import { describe, expect, it } from 'vitest';
import { DEFAULT_AMP_CONTROLS, normalizeAmpControlSettings } from './controls';

describe('Amp Control Settings', () => {
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
