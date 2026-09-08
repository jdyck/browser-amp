import {
  knob,
  normalizeBoolean,
  normalizeKnob,
  record,
  switchControl,
  type AmpControlDefinition,
} from './types';

export interface HighHeadroomAmericanSettings {
  readonly volume: number;
  readonly bass: number;
  readonly middle: number;
  readonly treble: number;
  readonly bright: boolean;
  readonly ultraHeadroom: boolean;
}

export const HIGH_HEADROOM_AMERICAN_CONTROLS = {
  volume: knob('Volume'),
  bass: knob('Bass'),
  middle: knob('Middle'),
  treble: knob('Treble'),
  bright: switchControl('Bright'),
  ultraHeadroom: switchControl('Ultra Headroom'),
} as const satisfies Readonly<
  Record<keyof HighHeadroomAmericanSettings, AmpControlDefinition>
>;

export const highHeadroomAmerican = {
  id: 'amp.high-headroom-american-v1',
  label: 'High-Headroom American',
  description: 'Broad, tight, restrained clean that stays clean at higher virtual volume.',
  defaultSettings: {
    volume: 4,
    bass: 4,
    middle: 5,
    treble: 5.5,
    bright: false,
    ultraHeadroom: true,
  } satisfies HighHeadroomAmericanSettings,
  controls: HIGH_HEADROOM_AMERICAN_CONTROLS,
  normalizeSettings,
} as const;

export function normalizeSettings(
  value: unknown,
  fallback: HighHeadroomAmericanSettings = highHeadroomAmerican.defaultSettings,
): HighHeadroomAmericanSettings {
  const settings = record(value);
  return {
    volume: normalizeKnob(settings.volume, fallback.volume),
    bass: normalizeKnob(settings.bass, fallback.bass),
    middle: normalizeKnob(settings.middle, fallback.middle),
    treble: normalizeKnob(settings.treble, fallback.treble),
    bright: normalizeBoolean(
      settings.bright,
      fallback.bright,
      ['on'],
      ['off'],
    ),
    ultraHeadroom: normalizeBoolean(
      settings.ultraHeadroom ?? settings.headroom,
      fallback.ultraHeadroom,
      ['ultra'],
      ['normal'],
    ),
  };
}
