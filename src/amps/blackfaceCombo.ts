import {
  knob,
  normalizeBoolean,
  normalizeKnob,
  record,
  switchControl,
  type AmpControlDefinition,
} from './types';

export interface BlackfaceComboSettings {
  readonly volume: number;
  readonly bass: number;
  readonly treble: number;
  readonly bright: boolean;
}

export const BLACKFACE_COMBO_CONTROLS = {
  volume: knob('Volume'),
  bass: knob('Bass'),
  treble: knob('Treble'),
  bright: switchControl('Bright'),
} as const satisfies Readonly<
  Record<keyof BlackfaceComboSettings, AmpControlDefinition>
>;

export const blackfaceCombo = {
  id: 'amp.blackface-combo-v1',
  label: 'Blackface Combo',
  description: 'Airy American clean with scooped mids, sparkling highs, and moderate headroom.',
  defaultSettings: {
    volume: 4,
    bass: 4,
    treble: 5.5,
    bright: false,
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
    bright: normalizeBoolean(
      settings.bright,
      fallback.bright,
      ['on'],
      ['off'],
    ),
  };
}
