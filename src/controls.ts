export const AMP_MODELS = {
  'clean-voice': {
    label: 'Clean Voice',
    description: 'Transparent gain without intentional saturation.',
  },
  'clean-tube': {
    label: 'Clean Tube',
    description: 'Tube-inspired warmth and a softer high end. Raise Clean Gain for gentle breakup; use Master for listening volume.',
  },
  'clean-tube-warm': {
    label: 'Clean Tube Warm',
    description: 'Fuller low mids, darker highs, and earlier tube-inspired breakup. Raise Clean Gain for more saturation; use Master for listening volume.',
  },
} as const;

export type AmpModel = keyof typeof AMP_MODELS;

export function isAmpModel(value: unknown): value is AmpModel {
  return typeof value === 'string' && Object.hasOwn(AMP_MODELS, value);
}

export interface AmpControlSettings {
  readonly ampModel: AmpModel;
  readonly cleanGainDb: number;
  readonly bassDb: number;
  readonly middleDb: number;
  readonly trebleDb: number;
  readonly eqBypassed: boolean;
  readonly compressionAmount: number;
  readonly compressionBypassed: boolean;
  readonly reverbAmount: number;
  readonly reverbBypassed: boolean;
  readonly masterVolumeDb: number;
}

export const DEFAULT_AMP_CONTROLS: AmpControlSettings = {
  ampModel: 'clean-voice',
  cleanGainDb: 0,
  bassDb: 0,
  middleDb: 0,
  trebleDb: 0,
  eqBypassed: false,
  compressionAmount: 25,
  compressionBypassed: true,
  reverbAmount: 20,
  reverbBypassed: true,
  masterVolumeDb: -18,
};

export interface ContinuousControlDefinition {
  readonly minimum: number;
  readonly maximum: number;
  readonly step: number;
  readonly fractionDigits: number;
}

export const AMP_CONTROL_DEFINITIONS = {
  cleanGainDb: { minimum: -12, maximum: 24, step: 0.1, fractionDigits: 1 },
  bassDb: { minimum: -12, maximum: 12, step: 0.1, fractionDigits: 1 },
  middleDb: { minimum: -12, maximum: 12, step: 0.1, fractionDigits: 1 },
  trebleDb: { minimum: -12, maximum: 12, step: 0.1, fractionDigits: 1 },
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
  const cleanGainDb = finiteNumber(controls.cleanGainDb);
  const bassDb = finiteNumber(controls.bassDb);
  const middleDb = finiteNumber(controls.middleDb);
  const trebleDb = finiteNumber(controls.trebleDb);
  const compressionAmount = finiteNumber(controls.compressionAmount);
  const reverbAmount = finiteNumber(controls.reverbAmount);
  const masterVolumeDb = finiteNumber(controls.masterVolumeDb);

  return {
    ampModel: isAmpModel(controls.ampModel) ? controls.ampModel : fallback.ampModel,
    cleanGainDb: cleanGainDb === undefined ? fallback.cleanGainDb : normalizeContinuousControl(cleanGainDb, AMP_CONTROL_DEFINITIONS.cleanGainDb),
    bassDb: bassDb === undefined ? fallback.bassDb : normalizeContinuousControl(bassDb, AMP_CONTROL_DEFINITIONS.bassDb),
    middleDb: middleDb === undefined ? fallback.middleDb : normalizeContinuousControl(middleDb, AMP_CONTROL_DEFINITIONS.middleDb),
    trebleDb: trebleDb === undefined ? fallback.trebleDb : normalizeContinuousControl(trebleDb, AMP_CONTROL_DEFINITIONS.trebleDb),
    eqBypassed: typeof controls.eqBypassed === 'boolean' ? controls.eqBypassed : fallback.eqBypassed,
    compressionAmount: compressionAmount === undefined
      ? fallback.compressionAmount
      : normalizePercentAmount(compressionAmount),
    compressionBypassed: typeof controls.compressionBypassed === 'boolean'
      ? controls.compressionBypassed
      : fallback.compressionBypassed,
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
