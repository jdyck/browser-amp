import {
  knob,
  normalizeBoolean,
  normalizeKnob,
  record,
  switchControl,
  type AmpControlDefinition,
} from './types';

export interface BritishChimeSettings {
  readonly volume: number;
  readonly bass: number;
  readonly treble: number;
  readonly cut: number;
  readonly topBoost: boolean;
}

export const BRITISH_CHIME_CONTROLS = {
  volume: knob('Volume'),
  bass: knob('Bass'),
  treble: knob('Treble'),
  cut: knob('Cut'),
  topBoost: switchControl('Top Boost'),
} as const satisfies Readonly<
  Record<keyof BritishChimeSettings, AmpControlDefinition>
>;

export const britishChime = {
  id: 'amp.british-chime-v1',
  label: 'British Chime',
  description: 'Lean bass, prominent upper mids, bright detail, and a lively edge.',
  defaultSettings: {
    volume: 4,
    bass: 4,
    treble: 5,
    cut: 5,
    topBoost: false,
  } satisfies BritishChimeSettings,
  controls: BRITISH_CHIME_CONTROLS,
  normalizeSettings,
} as const;

export function normalizeSettings(
  value: unknown,
  fallback: BritishChimeSettings = britishChime.defaultSettings,
): BritishChimeSettings {
  const settings = record(value);
  return {
    volume: normalizeKnob(settings.volume, fallback.volume),
    bass: normalizeKnob(settings.bass, fallback.bass),
    treble: normalizeKnob(settings.treble, fallback.treble),
    cut: normalizeKnob(settings.cut, fallback.cut),
    topBoost: normalizeBoolean(
      settings.topBoost ?? settings.channel,
      fallback.topBoost,
      ['top-boost'],
      ['normal'],
    ),
  };
}
