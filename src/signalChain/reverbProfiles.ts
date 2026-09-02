import type { ContinuousControlDefinition, ReverbProfile } from './settings';

export interface ReverbParameters {
  readonly decaySeconds: number;
  readonly preDelayMs: number;
  readonly toneDb: number;
  readonly lowCutHz: number;
  readonly damping: number;
  readonly size: number;
  readonly earlyLate: number;
  readonly diffusion: number;
  readonly dwell: number;
  readonly modulationDepth: number;
  readonly modulationRateHz: number;
}

export type ReverbParameter = keyof ReverbParameters;
export interface ReverbControlDefinition extends ContinuousControlDefinition {
  readonly label: string;
  readonly unit: string;
  readonly help: string;
  readonly defaultValue: number;
}

function control(label: string, unit: string, minimum: number, maximum: number, step: number, defaultValue: number, help: string): ReverbControlDefinition {
  return { label, unit, minimum, maximum, step, defaultValue, fractionDigits: step === 0.01 ? 2 : step === 0.1 ? 1 : 0, help };
}

const decay = (value: number) => control('Decay', 's', 0.2, 6, 0.01, value, 'Length of the reverb tail; independent of Amount.');
const predelay = (value: number) => control('Pre-delay', 'ms', 0, 200, 1, value, 'Delay before the wet response, leaving the dry attack unchanged.');
const tone = control('Tone', 'dB', -12, 12, 0.1, 0, 'Darken or brighten the wet sound above 3.2 kHz.');
const lowCut = control('Low Cut', 'Hz', 20, 800, 1, 90, 'Remove bass from the reverb to reduce muddiness.');
const damping = control('Damping', '%', 0, 100, 1, 50, 'Higher values make high frequencies fade faster.');
const size = control('Size', '%', 0, 100, 1, 50, 'Change reflection spacing without setting the decay time.');
const earlyLate = control('Early/Late', '%', 0, 100, 1, 50, '0% is early reflections only; 100% is the late tail only.');
const diffusion = control('Diffusion', '%', 0, 100, 1, 70, 'Move from distinct echoes toward a dense, smooth tail.');
const dwell = control('Dwell', '%', 0, 100, 1, 0, 'Drive the spring send into soft saturation; 0% preserves the clean response.');
const modulationDepth = control('Modulation Depth', '%', 0, 100, 1, 0, 'Add stereo pitch movement to the wet tail; 0% disables modulation.');
const modulationRateHz = control('Modulation Rate', 'Hz', 0.05, 5, 0.01, 0.3, 'Speed of the wet-tail movement when Modulation Depth is above zero.');

export const REVERB_CONTROLS = {
  'jazz-room': { main: { decaySeconds: decay(0.65), toneDb: tone }, advanced: { size, earlyLate } },
  'studio-chamber': { main: { decaySeconds: decay(1.4), preDelayMs: predelay(0), toneDb: tone }, advanced: { lowCutHz: lowCut, diffusion } },
  'studio-plate': { main: { decaySeconds: decay(1.5), preDelayMs: predelay(12), toneDb: tone }, advanced: { damping } },
  'bright-spring': { main: { toneDb: tone, dwell }, advanced: { decaySeconds: decay(2.2) } },
  'dark-spring': { main: { toneDb: tone, decaySeconds: decay(1.3) }, advanced: { lowCutHz: lowCut } },
  'digital-room': { main: { decaySeconds: decay(0.85), size, toneDb: tone }, advanced: { preDelayMs: predelay(8), diffusion } },
  'digital-hall': { main: { decaySeconds: decay(2.8), preDelayMs: predelay(28), damping }, advanced: { size, modulationDepth, modulationRateHz } },
} as const satisfies Record<ReverbProfile, { main: Partial<Record<ReverbParameter, ReverbControlDefinition>>; advanced: Partial<Record<ReverbParameter, ReverbControlDefinition>> }>;

export type ReverbSettings = {
  readonly [Profile in ReverbProfile]: {
    readonly [Parameter in keyof typeof REVERB_CONTROLS[Profile]['main'] | keyof typeof REVERB_CONTROLS[Profile]['advanced']]: number;
  };
};

export function reverbControlEntries(profile: ReverbProfile, section?: 'main' | 'advanced'): [ReverbParameter, ReverbControlDefinition][] {
  const definitions = section === undefined
    ? { ...REVERB_CONTROLS[profile].main, ...REVERB_CONTROLS[profile].advanced }
    : REVERB_CONTROLS[profile][section];
  return Object.entries(definitions) as [ReverbParameter, ReverbControlDefinition][];
}

export const DEFAULT_REVERB_SETTINGS = Object.fromEntries(
  (Object.keys(REVERB_CONTROLS) as ReverbProfile[]).map((profile) => [profile,
    Object.fromEntries(reverbControlEntries(profile).map(([key, definition]) => [key, definition.defaultValue])),
  ]),
) as ReverbSettings;

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

const LEGACY_REVERB_SETTING_KEYS: Partial<Record<ReverbProfile, string>> = {
  'bright-spring': 'fender-spring',
  'dark-spring': 'polytone-spring',
};

export function normalizeReverbSettings(value: unknown, fallback: ReverbSettings = DEFAULT_REVERB_SETTINGS): ReverbSettings {
  const settings = record(value);
  return Object.fromEntries((Object.keys(REVERB_CONTROLS) as ReverbProfile[]).map((profile) => {
    const legacyKey = LEGACY_REVERB_SETTING_KEYS[profile];
    const values = record(settings[profile] ?? (legacyKey === undefined ? undefined : settings[legacyKey]));
    const defaults = fallback[profile] as Partial<ReverbParameters>;
    return [profile, Object.fromEntries(reverbControlEntries(profile).map(([key, definition]) => {
      const raw = values[key];
      const number = typeof raw === 'number' && Number.isFinite(raw) ? raw : defaults[key] ?? definition.defaultValue;
      const clamped = Math.max(definition.minimum, Math.min(definition.maximum, number));
      return [key, Number((Math.round(clamped / definition.step) * definition.step).toFixed(definition.fractionDigits))];
    }))];
  })) as ReverbSettings;
}

/** Complete internal parameters; only the module's supported controls are stored. */
export function reverbParameters(profile: ReverbProfile, settings: ReverbSettings = DEFAULT_REVERB_SETTINGS): ReverbParameters {
  return {
    preDelayMs: 0, toneDb: 0, lowCutHz: 90, damping: 50,
    size: 50, earlyLate: 50, diffusion: 70, dwell: 0, modulationDepth: 0, modulationRateHz: 0.3,
    ...settings[profile],
  };
}
