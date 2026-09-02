import { DEFAULT_REVERB_SETTINGS, normalizeReverbSettings, type ReverbSettings } from './reverbProfiles';
import {
  DEFAULT_JAZZ_AMP_SETTINGS,
  isAmpModel,
  normalizeJazzAmpSettings,
  type AmpModel,
  type JazzAmpSettings,
} from './ampModels';
import { DEFAULT_JAZZ_CABINET, isCabinetModel, type JazzCabinetId } from './cabinetModels';

export { AMP_MODELS, isAmpModel } from './ampModels';
export type { AmpModel, JazzAmpId, JazzAmpSettings } from './ampModels';
export { CABINET_MODELS, isCabinetModel } from './cabinetModels';
export type { JazzCabinetId } from './cabinetModels';

export const REVERB_PROFILES = {
  'jazz-room': {
    label: 'Jazz Room',
    description: 'Short, dark ambience with distinct early reflections.',
  },
  'studio-chamber': {
    label: 'Studio Chamber',
    description: 'Warm studio space with early reflections and a dense tail.',
  },
  'studio-plate': {
    label: 'Studio Plate',
    description: 'Smooth, diffuse stereo sustain. The original Browser Amp reverb.',
  },
  'bright-spring': {
    label: 'Bright Spring',
    description: 'Bright, splashy synthetic spring response with adjustable drive.',
  },
  'dark-spring': {
    label: 'Dark Spring',
    description: 'Dark, restrained synthetic spring response with a compact decay.',
  },
  'digital-room': {
    label: 'Digital Room',
    description: 'Compact, diffuse room with adjustable size and echo density.',
  },
  'digital-hall': {
    label: 'Digital Hall',
    description: 'Spacious digital decay with adjustable damping and optional stereo modulation.',
  },
} as const;

export type ReverbProfile = keyof typeof REVERB_PROFILES;

const LEGACY_REVERB_PROFILES: Readonly<Record<string, ReverbProfile>> = {
  'fender-spring': 'bright-spring',
  'polytone-spring': 'dark-spring',
};

export function isReverbProfile(value: unknown): value is ReverbProfile {
  return typeof value === 'string' && Object.hasOwn(REVERB_PROFILES, value);
}

export interface AmpControlSettings {
  readonly ampModel: AmpModel;
  readonly ampSettings: JazzAmpSettings;
  readonly cabinetModel: JazzCabinetId;
  readonly inputTrimDb: number;
  readonly noiseGateThresholdDb: number;
  readonly noiseGateRangeDb: number;
  readonly noiseGateReleaseMs: number;
  readonly noiseGateBypassed: boolean;
  readonly lowShelfDb: number;
  readonly lowMidFrequencyHz: number;
  readonly lowMidDb: number;
  readonly upperMidFrequencyHz: number;
  readonly upperMidDb: number;
  readonly highShelfDb: number;
  readonly eqBypassed: boolean;
  readonly compressionAmount: number;
  readonly compressionLevelMatch: boolean;
  readonly compressionBypassed: boolean;
  readonly reverbProfile: ReverbProfile;
  readonly reverbSettings: ReverbSettings;
  readonly reverbAmount: number;
  readonly reverbBypassed: boolean;
  readonly masterVolumeDb: number;
}

export const DEFAULT_AMP_CONTROLS: AmpControlSettings = {
  ampModel: 'amp.studio-clean-v1',
  ampSettings: DEFAULT_JAZZ_AMP_SETTINGS,
  cabinetModel: DEFAULT_JAZZ_CABINET,
  inputTrimDb: 0,
  noiseGateThresholdDb: -55,
  noiseGateRangeDb: 9,
  noiseGateReleaseMs: 200,
  noiseGateBypassed: false,
  lowShelfDb: 0,
  lowMidFrequencyHz: 300,
  lowMidDb: 0,
  upperMidFrequencyHz: 1_000,
  upperMidDb: 0,
  highShelfDb: 0,
  eqBypassed: false,
  compressionAmount: 25,
  compressionLevelMatch: true,
  compressionBypassed: true,
  reverbProfile: 'studio-plate',
  reverbSettings: DEFAULT_REVERB_SETTINGS,
  reverbAmount: 20,
  reverbBypassed: true,
  masterVolumeDb: -18,
};

const LEGACY_AMP_MODELS: Readonly<Record<string, AmpModel>> = {
  'clean-voice': 'amp.studio-clean-v1',
  'clean-tube': 'amp.blackface-combo-v1',
  'clean-tube-warm': 'amp.small-tweed-combo-v1',
};

export interface ContinuousControlDefinition {
  readonly minimum: number;
  readonly maximum: number;
  readonly step: number;
  readonly fractionDigits: number;
}

export const AMP_CONTROL_DEFINITIONS = {
  inputTrimDb: { minimum: -12, maximum: 24, step: 0.1, fractionDigits: 1 },
  noiseGateThresholdDb: { minimum: -80, maximum: -20, step: 0.1, fractionDigits: 1 },
  noiseGateRangeDb: { minimum: 0, maximum: 24, step: 0.1, fractionDigits: 1 },
  noiseGateReleaseMs: { minimum: 50, maximum: 1_000, step: 10, fractionDigits: 0 },
  lowShelfDb: { minimum: -12, maximum: 12, step: 0.1, fractionDigits: 1 },
  lowMidFrequencyHz: { minimum: 180, maximum: 500, step: 1, fractionDigits: 0 },
  lowMidDb: { minimum: -12, maximum: 12, step: 0.1, fractionDigits: 1 },
  upperMidFrequencyHz: { minimum: 600, maximum: 2_000, step: 1, fractionDigits: 0 },
  upperMidDb: { minimum: -12, maximum: 12, step: 0.1, fractionDigits: 1 },
  highShelfDb: { minimum: -12, maximum: 12, step: 0.1, fractionDigits: 1 },
  compressionAmount: { minimum: 0, maximum: 100, step: 1, fractionDigits: 0 },
  reverbAmount: { minimum: 0, maximum: 100, step: 1, fractionDigits: 0 },
  masterVolumeDb: { minimum: -60, maximum: 0, step: 0.1, fractionDigits: 1 },
} as const satisfies Record<string, ContinuousControlDefinition>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function normalizeContinuousControl(value: number, definition: ContinuousControlDefinition): number {
  const clamped = Math.min(definition.maximum, Math.max(definition.minimum, value));
  const stepsPerUnit = 1 / definition.step;
  return Math.round(clamped * stepsPerUnit) / stepsPerUnit;
}

export function normalizePercentAmount(value: number): number {
  return normalizeContinuousControl(value, AMP_CONTROL_DEFINITIONS.compressionAmount);
}

export function normalizeAmpControlSettings(
  value: unknown,
  fallback: AmpControlSettings = DEFAULT_AMP_CONTROLS,
): AmpControlSettings {
  const controls = isRecord(value) ? value : {};
  const inputTrimDb = finiteNumber(controls.inputTrimDb) ?? finiteNumber(controls.cleanGainDb);
  const noiseGateThresholdDb = finiteNumber(controls.noiseGateThresholdDb);
  const noiseGateRangeDb = finiteNumber(controls.noiseGateRangeDb);
  const noiseGateReleaseMs = finiteNumber(controls.noiseGateReleaseMs);
  const legacyBassDb = finiteNumber(controls.bassDb);
  const legacyMiddleDb = finiteNumber(controls.middleDb);
  const legacyTrebleDb = finiteNumber(controls.trebleDb);
  const lowShelfDb = finiteNumber(controls.lowShelfDb) ?? legacyBassDb;
  const lowMidFrequencyHz = finiteNumber(controls.lowMidFrequencyHz);
  const lowMidDb = finiteNumber(controls.lowMidDb);
  const upperMidFrequencyHz = finiteNumber(controls.upperMidFrequencyHz);
  const upperMidDb = finiteNumber(controls.upperMidDb) ?? legacyMiddleDb;
  const highShelfDb = finiteNumber(controls.highShelfDb) ?? legacyTrebleDb;
  const compressionAmount = finiteNumber(controls.compressionAmount);
  const reverbAmount = finiteNumber(controls.reverbAmount);
  const masterVolumeDb = finiteNumber(controls.masterVolumeDb);

  // Retired tube voices migrate to the closest new intent with a deliberate,
  // disclosed sound change. Clean Voice maps to the bit-transparent Studio Clean path.
  const rawModel = controls.ampModel;
  const ampModel = isAmpModel(rawModel)
    ? rawModel
    : typeof rawModel === 'string' && Object.hasOwn(LEGACY_AMP_MODELS, rawModel)
      ? LEGACY_AMP_MODELS[rawModel]
      : fallback.ampModel;
  const cabinetModel = isCabinetModel(controls.cabinetModel) ? controls.cabinetModel : fallback.cabinetModel;

  return {
    ampModel,
    ampSettings: normalizeJazzAmpSettings(controls.ampSettings, fallback.ampSettings),
    cabinetModel,
    inputTrimDb: inputTrimDb === undefined ? fallback.inputTrimDb : normalizeContinuousControl(inputTrimDb, AMP_CONTROL_DEFINITIONS.inputTrimDb),
    noiseGateThresholdDb: noiseGateThresholdDb === undefined
      ? fallback.noiseGateThresholdDb
      : normalizeContinuousControl(noiseGateThresholdDb, AMP_CONTROL_DEFINITIONS.noiseGateThresholdDb),
    noiseGateRangeDb: noiseGateRangeDb === undefined
      ? fallback.noiseGateRangeDb
      : normalizeContinuousControl(noiseGateRangeDb, AMP_CONTROL_DEFINITIONS.noiseGateRangeDb),
    noiseGateReleaseMs: noiseGateReleaseMs === undefined
      ? fallback.noiseGateReleaseMs
      : normalizeContinuousControl(noiseGateReleaseMs, AMP_CONTROL_DEFINITIONS.noiseGateReleaseMs),
    noiseGateBypassed: typeof controls.noiseGateBypassed === 'boolean' ? controls.noiseGateBypassed : fallback.noiseGateBypassed,
    lowShelfDb: lowShelfDb === undefined
      ? fallback.lowShelfDb
      : normalizeContinuousControl(lowShelfDb, AMP_CONTROL_DEFINITIONS.lowShelfDb),
    lowMidFrequencyHz: lowMidFrequencyHz === undefined
      ? fallback.lowMidFrequencyHz
      : normalizeContinuousControl(lowMidFrequencyHz, AMP_CONTROL_DEFINITIONS.lowMidFrequencyHz),
    lowMidDb: lowMidDb === undefined
      ? fallback.lowMidDb
      : normalizeContinuousControl(lowMidDb, AMP_CONTROL_DEFINITIONS.lowMidDb),
    // The retired Middle bell was fixed at 800 Hz. Keep that exact center when
    // loading an old non-flat setting rather than silently moving the saved tone.
    upperMidFrequencyHz: upperMidFrequencyHz === undefined && legacyMiddleDb !== undefined && legacyMiddleDb !== 0
      ? 800
      : upperMidFrequencyHz === undefined
        ? fallback.upperMidFrequencyHz
        : normalizeContinuousControl(upperMidFrequencyHz, AMP_CONTROL_DEFINITIONS.upperMidFrequencyHz),
    upperMidDb: upperMidDb === undefined
      ? fallback.upperMidDb
      : normalizeContinuousControl(upperMidDb, AMP_CONTROL_DEFINITIONS.upperMidDb),
    highShelfDb: highShelfDb === undefined
      ? fallback.highShelfDb
      : normalizeContinuousControl(highShelfDb, AMP_CONTROL_DEFINITIONS.highShelfDb),
    eqBypassed: typeof controls.eqBypassed === 'boolean' ? controls.eqBypassed : fallback.eqBypassed,
    compressionAmount: compressionAmount === undefined
      ? fallback.compressionAmount
      : normalizePercentAmount(compressionAmount),
    compressionLevelMatch: typeof controls.compressionLevelMatch === 'boolean'
      ? controls.compressionLevelMatch
      : fallback.compressionLevelMatch,
    compressionBypassed: typeof controls.compressionBypassed === 'boolean'
      ? controls.compressionBypassed
      : fallback.compressionBypassed,
    reverbProfile: isReverbProfile(controls.reverbProfile)
      ? controls.reverbProfile
      : typeof controls.reverbProfile === 'string' && Object.hasOwn(LEGACY_REVERB_PROFILES, controls.reverbProfile)
        ? LEGACY_REVERB_PROFILES[controls.reverbProfile]
        : fallback.reverbProfile,
    reverbSettings: normalizeReverbSettings(controls.reverbSettings, fallback.reverbSettings),
    reverbAmount: reverbAmount === undefined
      ? fallback.reverbAmount
      : normalizeContinuousControl(reverbAmount, AMP_CONTROL_DEFINITIONS.reverbAmount),
    reverbBypassed: typeof controls.reverbBypassed === 'boolean'
      ? controls.reverbBypassed
      : fallback.reverbBypassed,
    masterVolumeDb: masterVolumeDb === undefined
      ? fallback.masterVolumeDb
      : normalizeContinuousControl(masterVolumeDb, AMP_CONTROL_DEFINITIONS.masterVolumeDb),
  };
}
