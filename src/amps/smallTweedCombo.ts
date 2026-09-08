import {
  choice,
  knob,
  normalizeChoice,
  normalizeKnob,
  record,
  type AmpControlDefinition,
} from './types';

export interface SmallTweedComboSettings {
  readonly volume: number;
  readonly tone: number;
  readonly input: 'normal' | 'low';
}

export const SMALL_TWEED_COMBO_CONTROLS = {
  volume: knob('Volume'),
  tone: knob('Tone'),
  input: choice('Input', [['normal', 'Normal'], ['low', 'Low']]),
} as const satisfies Readonly<Record<keyof SmallTweedComboSettings, AmpControlDefinition>>;

export const smallTweedCombo = {
  id: 'amp.small-tweed-combo-v1',
  label: 'Small Tweed Combo',
  description: 'Warm, mid-forward, touch-sensitive, and the first voice to reach edge-of-breakup.',
  defaultSettings: {
    volume: 3.5,
    tone: 5,
    input: 'normal',
  } satisfies SmallTweedComboSettings,
  controls: SMALL_TWEED_COMBO_CONTROLS,
  normalizeSettings,
} as const;

export function normalizeSettings(
  value: unknown,
  fallback: SmallTweedComboSettings = smallTweedCombo.defaultSettings,
): SmallTweedComboSettings {
  const settings = record(value);
  return {
    volume: normalizeKnob(settings.volume, fallback.volume),
    tone: normalizeKnob(settings.tone, fallback.tone),
    input: normalizeChoice(settings.input, ['normal', 'low'], fallback.input),
  };
}
