import {
  choice,
  knob,
  normalizeBoolean,
  normalizeChoice,
  normalizeKnob,
  record,
  switchControl,
  type AmpControlDefinition,
} from './types';

export interface WarmJazzComboSettings {
  readonly volume: number;
  readonly bass: number;
  readonly middle: number;
  readonly treble: number;
  readonly color: 'dark' | 'normal' | 'bright';
  readonly lowInput: boolean;
}

export const WARM_JAZZ_COMBO_CONTROLS = {
  volume: knob('Volume'),
  bass: knob('Bass'),
  middle: knob('Middle'),
  treble: knob('Treble'),
  color: choice('Color', [['dark', 'Dark'], ['normal', 'Normal'], ['bright', 'Bright']]),
  lowInput: switchControl('Low Input'),
} as const satisfies Readonly<
  Record<keyof WarmJazzComboSettings, AmpControlDefinition>
>;

export const warmJazzCombo = {
  id: 'amp.warm-jazz-combo-v1',
  label: 'Warm Jazz Combo',
  description: 'Warm, focused solid-state clean with firm bass and a controlled top end.',
  defaultSettings: {
    volume: 4,
    bass: 5,
    middle: 5,
    treble: 5,
    color: 'normal',
    lowInput: false,
  } satisfies WarmJazzComboSettings,
  controls: WARM_JAZZ_COMBO_CONTROLS,
  normalizeSettings,
} as const;

export function normalizeSettings(
  value: unknown,
  fallback: WarmJazzComboSettings = warmJazzCombo.defaultSettings,
): WarmJazzComboSettings {
  const settings = record(value);
  return {
    volume: normalizeKnob(settings.volume, fallback.volume),
    bass: normalizeKnob(settings.bass, fallback.bass),
    middle: normalizeKnob(settings.middle, fallback.middle),
    treble: normalizeKnob(settings.treble, fallback.treble),
    color: normalizeChoice(settings.color, ['dark', 'normal', 'bright'], fallback.color),
    lowInput: normalizeBoolean(
      settings.lowInput ?? settings.input,
      fallback.lowInput,
      ['low'],
      ['normal'],
    ),
  };
}
