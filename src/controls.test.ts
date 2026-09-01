import { describe, expect, it } from 'vitest';
import { CABINET_MODELS, DEFAULT_AMP_CONTROLS, REVERB_PROFILES, normalizeAmpControlSettings } from './controls';
import { AMP_MODELS, DEFAULT_JAZZ_AMP_SETTINGS } from './ampModels';
import { DEFAULT_REVERB_SETTINGS, reverbControlEntries, type ReverbParameters } from './reverbSettings';

describe('Amp Control Settings', () => {
  it('normalizes every module parameter without keeping unsupported fields', () => {
    for (const profile of Object.keys(DEFAULT_REVERB_SETTINGS) as (keyof typeof DEFAULT_REVERB_SETTINGS)[]) {
      for (const [key, definition] of reverbControlEntries(profile)) {
        const parameter = (raw: unknown) => (normalizeAmpControlSettings({
          reverbSettings: { [profile]: { [key]: raw, unsupported: 7 } },
        }).reverbSettings[profile] as Partial<ReverbParameters>)[key];
        expect(parameter(-1000)).toBe(definition.minimum);
        expect(parameter(1000)).toBe(definition.maximum);
        for (const raw of [NaN, Infinity, '5', null, undefined]) expect(parameter(raw)).toBe(definition.defaultValue);
      }
    }
    const settings = normalizeAmpControlSettings({ reverbSettings: {
      'studio-plate': { decaySeconds: 2.345, toneDb: 3.26, dwell: 80 },
      'digital-hall': { modulationRateHz: 1.237 },
      unknown: { decaySeconds: 8 },
    } }).reverbSettings;
    expect(settings['studio-plate']).toEqual({ ...DEFAULT_REVERB_SETTINGS['studio-plate'], decaySeconds: 2.35, toneDb: 3.3 });
    expect(settings['digital-hall'].modulationRateHz).toBe(1.24);
    expect(settings['jazz-room']).toEqual(DEFAULT_REVERB_SETTINGS['jazz-room']);
    expect(settings).not.toHaveProperty('unknown');
    expect(normalizeAmpControlSettings({ reverbSettings: [] }).reverbSettings).toEqual(DEFAULT_REVERB_SETTINGS);
    expect(normalizeAmpControlSettings({}, { ...DEFAULT_AMP_CONTROLS, reverbSettings: settings }).reverbSettings).toEqual(settings);
  });

  it('accepts every reverb profile and preserves the plate for old or malformed settings', () => {
    for (const reverbProfile of Object.keys(REVERB_PROFILES)) {
      expect(normalizeAmpControlSettings({ reverbProfile }).reverbProfile).toBe(reverbProfile);
    }
    for (const reverbProfile of [undefined, 'unknown', 'constructor', '__proto__', null, 1]) {
      expect(normalizeAmpControlSettings({ reverbProfile }).reverbProfile).toBe('studio-plate');
    }
    expect(normalizeAmpControlSettings(
      { reverbProfile: 'unknown' },
      { ...DEFAULT_AMP_CONTROLS, reverbProfile: 'jazz-room' },
    ).reverbProfile).toBe('jazz-room');
  });

  it('accepts known amp models and safely defaults old or unknown selections', () => {
    for (const ampModel of Object.keys(AMP_MODELS)) expect(normalizeAmpControlSettings({ ampModel }).ampModel).toBe(ampModel);
    expect(normalizeAmpControlSettings({ ampModel: 'clean-voice' }).ampModel).toBe('amp.studio-clean-v1');
    expect(normalizeAmpControlSettings({ ampModel: 'clean-tube' }).ampModel).toBe('amp.blackface-combo-v1');
    expect(normalizeAmpControlSettings({ ampModel: 'clean-tube-warm' }).ampModel).toBe('amp.small-tweed-combo-v1');
    expect(normalizeAmpControlSettings({}).ampModel).toBe('amp.studio-clean-v1');
    for (const ampModel of ['unknown', 'constructor', '__proto__', null, 1]) {
      expect(normalizeAmpControlSettings({ ampModel }).ampModel).toBe('amp.studio-clean-v1');
    }
    expect(normalizeAmpControlSettings(
      { ampModel: 'unknown' },
      { ...DEFAULT_AMP_CONTROLS, ampModel: 'amp.british-chime-v1' },
    ).ampModel).toBe('amp.british-chime-v1');
  });

  it('accepts every cabinet model and safely defaults unknown selections', () => {
    for (const cabinetModel of Object.keys(CABINET_MODELS)) {
      expect(normalizeAmpControlSettings({ cabinetModel }).cabinetModel).toBe(cabinetModel);
    }
    for (const cabinetModel of [undefined, 'unknown', 'constructor', '__proto__', null, 1]) {
      expect(normalizeAmpControlSettings({ cabinetModel }).cabinetModel).toBe('cab.compact-jazz-1x12-v1');
    }
    expect(normalizeAmpControlSettings(
      { cabinetModel: 'unknown' },
      { ...DEFAULT_AMP_CONTROLS, cabinetModel: 'cab.open-4x10-v1' },
    ).cabinetModel).toBe('cab.open-4x10-v1');
  });

  it('normalizes each amp independently and migrates legacy Clean Voice gain exactly', () => {
    const controls = normalizeAmpControlSettings({
      ampSettings: {
        'amp.studio-clean-v1': { gain: 50, bass: -1, middle: 5.26, treble: 'bad', headroom: 'high' },
        'amp.small-tweed-combo-v1': { volume: 8.88, tone: 2.22, input: 'low', middle: 10 },
      },
    });
    expect(controls.ampSettings['amp.studio-clean-v1']).toEqual({ gain: 10, bass: 0, middle: 5.3, treble: 5, headroom: 'high' });
    expect(controls.ampSettings['amp.small-tweed-combo-v1']).toEqual({ volume: 8.9, tone: 2.2, input: 'low' });
    expect(controls.ampSettings['amp.british-chime-v1']).toEqual(DEFAULT_JAZZ_AMP_SETTINGS['amp.british-chime-v1']);
    expect(normalizeAmpControlSettings({ ampModel: 'clean-voice', cleanGainDb: 12 })).toMatchObject({
      ampModel: 'amp.studio-clean-v1',
      inputTrimDb: 12,
      ampSettings: { 'amp.studio-clean-v1': { gain: 5 } },
    });
  });

  it('normalizes EQ bypass and keeps older settings enabled', () => {
    expect(normalizeAmpControlSettings({ eqBypassed: true }).eqBypassed).toBe(true);
    expect(normalizeAmpControlSettings({ eqBypassed: false }).eqBypassed).toBe(false);
    expect(normalizeAmpControlSettings({ eqBypassed: 'true' }).eqBypassed).toBe(false);
    expect(normalizeAmpControlSettings({ bassDb: 6 }).eqBypassed).toBe(false);
  });

  it('normalizes every noise suppression control independently', () => {
    expect(normalizeAmpControlSettings({ noiseGateThresholdDb: -100 }).noiseGateThresholdDb).toBe(-80);
    expect(normalizeAmpControlSettings({ noiseGateThresholdDb: -37.26 }).noiseGateThresholdDb).toBe(-37.3);
    expect(normalizeAmpControlSettings({ noiseGateThresholdDb: 0 }).noiseGateThresholdDb).toBe(-20);
    expect(normalizeAmpControlSettings({ noiseGateRangeDb: 30 }).noiseGateRangeDb).toBe(24);
    expect(normalizeAmpControlSettings({ noiseGateRangeDb: 12.26 }).noiseGateRangeDb).toBe(12.3);
    expect(normalizeAmpControlSettings({ noiseGateReleaseMs: 25 }).noiseGateReleaseMs).toBe(50);
    expect(normalizeAmpControlSettings({ noiseGateReleaseMs: 734 }).noiseGateReleaseMs).toBe(730);
    expect(normalizeAmpControlSettings({ noiseGateReleaseMs: 2_000 }).noiseGateReleaseMs).toBe(1_000);
    expect(normalizeAmpControlSettings({ noiseGateBypassed: true }).noiseGateBypassed).toBe(true);
    expect(normalizeAmpControlSettings({ noiseGateBypassed: 'yes' }).noiseGateBypassed).toBe(false);
  });

  it('normalizes Level Match and enables it for older settings', () => {
    expect(normalizeAmpControlSettings({ compressionLevelMatch: false }).compressionLevelMatch).toBe(false);
    expect(normalizeAmpControlSettings({ compressionLevelMatch: true }).compressionLevelMatch).toBe(true);
    expect(normalizeAmpControlSettings({ compressionLevelMatch: 'off' }).compressionLevelMatch).toBe(true);
    expect(normalizeAmpControlSettings({ compressionAmount: 50 }).compressionLevelMatch).toBe(true);
  });

  it('normalizes values to their documented ranges and precision', () => {
    expect(normalizeAmpControlSettings({
      ...DEFAULT_AMP_CONTROLS,
      inputTrimDb: 24.08,
      bassDb: -72,
      middleDb: 3.26,
      compressionAmount: 73.6,
      masterVolumeDb: -18.26,
    })).toMatchObject({
      inputTrimDb: 24,
      bassDb: -12,
      middleDb: 3.3,
      compressionAmount: 74,
      masterVolumeDb: -18.3,
    });
  });
});
