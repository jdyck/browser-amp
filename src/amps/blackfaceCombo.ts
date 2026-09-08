import {
  choice,
  knob,
  normalizeChoice,
  normalizeKnob,
  record,
  type AmpControlDefinition,
} from './types';

export interface BlackfaceComboSettings {
  readonly volume: number;
  readonly bass: number;
  readonly treble: number;
  readonly bright: 'off' | 'on';
}

export const BLACKFACE_COMBO_CONTROLS = {
  volume: knob('Volume'),
  bass: knob('Bass'),
  treble: knob('Treble'),
  bright: choice('Bright', [['off', 'Off'], ['on', 'On']]),
} as const satisfies Readonly<Record<keyof BlackfaceComboSettings, AmpControlDefinition>>;

export const blackfaceCombo = {
  id: 'amp.blackface-combo-v1',
  label: 'Blackface Combo',
  description: 'Airy American clean with scooped mids, sparkling highs, and moderate headroom.',
  defaultSettings: {
    volume: 4,
    bass: 4,
    treble: 5.5,
    bright: 'off',
  } satisfies BlackfaceComboSettings,
  controls: BLACKFACE_COMBO_CONTROLS,
  normalizeSettings,
} as const;

export function normalizeSettings(
  value: unknown,
  fallback: BlackfaceComboSettings = blackfaceCombo.defaultSettings,
): BlackfaceComboSettings {
  const settings = record(value);
  return {
    volume: normalizeKnob(settings.volume, fallback.volume),
    bass: normalizeKnob(settings.bass, fallback.bass),
    treble: normalizeKnob(settings.treble, fallback.treble),
    bright: normalizeChoice(settings.bright, ['off', 'on'], fallback.bright),
  };
}
