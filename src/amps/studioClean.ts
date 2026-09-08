import {
  choice,
  knob,
  normalizeChoice,
  normalizeKnob,
  record,
  type AmpControlDefinition,
} from './types';

export interface StudioCleanSettings {
  readonly gain: number;
  readonly bass: number;
  readonly middle: number;
  readonly treble: number;
  readonly headroom: 'high' | 'maximum';
}

export const STUDIO_CLEAN_CONTROLS = {
  gain: knob('Gain'),
  bass: knob('Bass'),
  middle: knob('Middle'),
  treble: knob('Treble'),
  headroom: choice('Headroom', [['high', 'High'], ['maximum', 'Maximum']]),
} as const satisfies Readonly<Record<keyof StudioCleanSettings, AmpControlDefinition>>;

export const studioClean = {
  id: 'amp.studio-clean-v1',
  label: 'Studio Clean',
  description: 'Neutral, fast, and very high headroom. Maximum is the clean reference voice.',
  defaultSettings: {
    gain: 5,
    bass: 5,
    middle: 5,
    treble: 5,
    headroom: 'maximum',
  } satisfies StudioCleanSettings,
  controls: STUDIO_CLEAN_CONTROLS,
  normalizeSettings,
} as const;

export function normalizeSettings(
  value: unknown,
  fallback: StudioCleanSettings = studioClean.defaultSettings,
): StudioCleanSettings {
  const settings = record(value);
  return {
    gain: normalizeKnob(settings.gain, fallback.gain),
    bass: normalizeKnob(settings.bass, fallback.bass),
    middle: normalizeKnob(settings.middle, fallback.middle),
    treble: normalizeKnob(settings.treble, fallback.treble),
    headroom: normalizeChoice(settings.headroom, ['high', 'maximum'], fallback.headroom),
  };
}

export function studioGainDb(knobValue: number): number {
  return knobValue <= 5 ? (knobValue - 5) * 12 / 5 : (knobValue - 5) * 24 / 5;
}
