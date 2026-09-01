export const AMP_MODELS = {
  'amp.studio-clean-v1': {
    label: 'Studio Clean',
    description: 'Neutral, fast, and very high headroom. Maximum is the clean reference voice.',
  },
  'amp.warm-jazz-combo-v1': {
    label: 'Warm Jazz Combo',
    description: 'Warm, focused solid-state clean with firm bass and a controlled top end.',
  },
  'amp.blackface-combo-v1': {
    label: 'Blackface Combo',
    description: 'Airy American clean with scooped mids, sparkling highs, and moderate headroom.',
  },
  'amp.high-headroom-american-v1': {
    label: 'High-Headroom American',
    description: 'Broad, tight, restrained clean that stays clean at higher virtual volume.',
  },
  'amp.small-tweed-combo-v1': {
    label: 'Small Tweed Combo',
    description: 'Warm, mid-forward, touch-sensitive, and the first voice to reach edge-of-breakup.',
  },
  'amp.british-chime-v1': {
    label: 'British Chime',
    description: 'Lean bass, prominent upper mids, bright detail, and a lively edge.',
  },
} as const;

export type JazzAmpId = keyof typeof AMP_MODELS;
/** Backwards-compatible name used by the audio engine and existing integrations. */
export type AmpModel = JazzAmpId;

export function isAmpModel(value: unknown): value is JazzAmpId {
  return typeof value === 'string' && Object.hasOwn(AMP_MODELS, value);
}

export interface StudioCleanSettings {
  readonly gain: number;
  readonly bass: number;
  readonly middle: number;
  readonly treble: number;
  readonly headroom: 'high' | 'maximum';
}

export interface WarmJazzComboSettings {
  readonly volume: number;
  readonly bass: number;
  readonly middle: number;
  readonly treble: number;
  readonly color: 'dark' | 'normal' | 'bright';
  readonly input: 'normal' | 'low';
}

export interface BlackfaceComboSettings {
  readonly volume: number;
  readonly bass: number;
  readonly treble: number;
  readonly bright: 'off' | 'on';
}

export interface HighHeadroomAmericanSettings {
  readonly volume: number;
  readonly bass: number;
  readonly middle: number;
  readonly treble: number;
  readonly bright: 'off' | 'on';
  readonly headroom: 'normal' | 'ultra';
}

export interface SmallTweedComboSettings {
  readonly volume: number;
  readonly tone: number;
  readonly input: 'normal' | 'low';
}

export interface BritishChimeSettings {
  readonly volume: number;
  readonly bass: number;
  readonly treble: number;
  readonly cut: number;
  readonly channel: 'normal' | 'top-boost';
}

export interface JazzAmpSettings {
  readonly 'amp.studio-clean-v1': StudioCleanSettings;
  readonly 'amp.warm-jazz-combo-v1': WarmJazzComboSettings;
  readonly 'amp.blackface-combo-v1': BlackfaceComboSettings;
  readonly 'amp.high-headroom-american-v1': HighHeadroomAmericanSettings;
  readonly 'amp.small-tweed-combo-v1': SmallTweedComboSettings;
  readonly 'amp.british-chime-v1': BritishChimeSettings;
}

export type JazzAmpState = JazzAmpSettings[JazzAmpId];

export const DEFAULT_JAZZ_AMP_SETTINGS: JazzAmpSettings = {
  'amp.studio-clean-v1': { gain: 5, bass: 5, middle: 5, treble: 5, headroom: 'maximum' },
  'amp.warm-jazz-combo-v1': { volume: 4, bass: 5, middle: 5, treble: 5, color: 'normal', input: 'normal' },
  'amp.blackface-combo-v1': { volume: 4, bass: 4, treble: 5.5, bright: 'off' },
  'amp.high-headroom-american-v1': { volume: 4, bass: 4, middle: 5, treble: 5.5, bright: 'off', headroom: 'ultra' },
  'amp.small-tweed-combo-v1': { volume: 3.5, tone: 5, input: 'normal' },
  'amp.british-chime-v1': { volume: 4, bass: 4, treble: 5, cut: 5, channel: 'normal' },
};

export interface AmpKnobDefinition {
  readonly kind: 'knob';
  readonly label: string;
  readonly minimum: 0;
  readonly maximum: 10;
  readonly step: 0.1;
  readonly fractionDigits: 1;
}

export interface AmpChoiceDefinition {
  readonly kind: 'choice';
  readonly label: string;
  readonly options: ReadonlyArray<readonly [value: string, label: string]>;
}

export type AmpControlDefinition = AmpKnobDefinition | AmpChoiceDefinition;

const knob = (label: string): AmpKnobDefinition => ({ kind: 'knob', label, minimum: 0, maximum: 10, step: 0.1, fractionDigits: 1 });
const choice = (label: string, options: ReadonlyArray<readonly [string, string]>): AmpChoiceDefinition => ({ kind: 'choice', label, options });

export const AMP_MODEL_CONTROLS = {
  'amp.studio-clean-v1': {
    gain: knob('Gain'), bass: knob('Bass'), middle: knob('Middle'), treble: knob('Treble'),
    headroom: choice('Headroom', [['high', 'High'], ['maximum', 'Maximum']]),
  },
  'amp.warm-jazz-combo-v1': {
    volume: knob('Volume'), bass: knob('Bass'), middle: knob('Middle'), treble: knob('Treble'),
    color: choice('Color', [['dark', 'Dark'], ['normal', 'Normal'], ['bright', 'Bright']]),
    input: choice('Input', [['normal', 'Normal'], ['low', 'Low']]),
  },
  'amp.blackface-combo-v1': {
    volume: knob('Volume'), bass: knob('Bass'), treble: knob('Treble'),
    bright: choice('Bright', [['off', 'Off'], ['on', 'On']]),
  },
  'amp.high-headroom-american-v1': {
    volume: knob('Volume'), bass: knob('Bass'), middle: knob('Middle'), treble: knob('Treble'),
    bright: choice('Bright', [['off', 'Off'], ['on', 'On']]),
    headroom: choice('Headroom', [['normal', 'Normal'], ['ultra', 'Ultra']]),
  },
  'amp.small-tweed-combo-v1': {
    volume: knob('Volume'), tone: knob('Tone'),
    input: choice('Input', [['normal', 'Normal'], ['low', 'Low']]),
  },
  'amp.british-chime-v1': {
    volume: knob('Volume'), bass: knob('Bass'), treble: knob('Treble'), cut: knob('Cut'),
    channel: choice('Channel', [['normal', 'Normal'], ['top-boost', 'Top Boost']]),
  },
} as const satisfies { readonly [Id in JazzAmpId]: Readonly<Record<keyof JazzAmpSettings[Id], AmpControlDefinition>> };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeKnob(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.round(Math.min(10, Math.max(0, value)) * 10) / 10;
}

function normalizeChoice<T extends string>(value: unknown, values: readonly T[], fallback: T): T {
  return typeof value === 'string' && values.includes(value as T) ? value as T : fallback;
}

export function normalizeJazzAmpSettings(value: unknown, fallback: JazzAmpSettings = DEFAULT_JAZZ_AMP_SETTINGS): JazzAmpSettings {
  const all = isRecord(value) ? value : {};
  const raw = (id: JazzAmpId) => isRecord(all[id]) ? all[id] : {};
  const studio = raw('amp.studio-clean-v1');
  const warm = raw('amp.warm-jazz-combo-v1');
  const blackface = raw('amp.blackface-combo-v1');
  const american = raw('amp.high-headroom-american-v1');
  const tweed = raw('amp.small-tweed-combo-v1');
  const british = raw('amp.british-chime-v1');
  return {
    'amp.studio-clean-v1': {
      gain: normalizeKnob(studio.gain, fallback['amp.studio-clean-v1'].gain),
      bass: normalizeKnob(studio.bass, fallback['amp.studio-clean-v1'].bass),
      middle: normalizeKnob(studio.middle, fallback['amp.studio-clean-v1'].middle),
      treble: normalizeKnob(studio.treble, fallback['amp.studio-clean-v1'].treble),
      headroom: normalizeChoice(studio.headroom, ['high', 'maximum'], fallback['amp.studio-clean-v1'].headroom),
    },
    'amp.warm-jazz-combo-v1': {
      volume: normalizeKnob(warm.volume, fallback['amp.warm-jazz-combo-v1'].volume),
      bass: normalizeKnob(warm.bass, fallback['amp.warm-jazz-combo-v1'].bass),
      middle: normalizeKnob(warm.middle, fallback['amp.warm-jazz-combo-v1'].middle),
      treble: normalizeKnob(warm.treble, fallback['amp.warm-jazz-combo-v1'].treble),
      color: normalizeChoice(warm.color, ['dark', 'normal', 'bright'], fallback['amp.warm-jazz-combo-v1'].color),
      input: normalizeChoice(warm.input, ['normal', 'low'], fallback['amp.warm-jazz-combo-v1'].input),
    },
    'amp.blackface-combo-v1': {
      volume: normalizeKnob(blackface.volume, fallback['amp.blackface-combo-v1'].volume),
      bass: normalizeKnob(blackface.bass, fallback['amp.blackface-combo-v1'].bass),
      treble: normalizeKnob(blackface.treble, fallback['amp.blackface-combo-v1'].treble),
      bright: normalizeChoice(blackface.bright, ['off', 'on'], fallback['amp.blackface-combo-v1'].bright),
    },
    'amp.high-headroom-american-v1': {
      volume: normalizeKnob(american.volume, fallback['amp.high-headroom-american-v1'].volume),
      bass: normalizeKnob(american.bass, fallback['amp.high-headroom-american-v1'].bass),
      middle: normalizeKnob(american.middle, fallback['amp.high-headroom-american-v1'].middle),
      treble: normalizeKnob(american.treble, fallback['amp.high-headroom-american-v1'].treble),
      bright: normalizeChoice(american.bright, ['off', 'on'], fallback['amp.high-headroom-american-v1'].bright),
      headroom: normalizeChoice(american.headroom, ['normal', 'ultra'], fallback['amp.high-headroom-american-v1'].headroom),
    },
    'amp.small-tweed-combo-v1': {
      volume: normalizeKnob(tweed.volume, fallback['amp.small-tweed-combo-v1'].volume),
      tone: normalizeKnob(tweed.tone, fallback['amp.small-tweed-combo-v1'].tone),
      input: normalizeChoice(tweed.input, ['normal', 'low'], fallback['amp.small-tweed-combo-v1'].input),
    },
    'amp.british-chime-v1': {
      volume: normalizeKnob(british.volume, fallback['amp.british-chime-v1'].volume),
      bass: normalizeKnob(british.bass, fallback['amp.british-chime-v1'].bass),
      treble: normalizeKnob(british.treble, fallback['amp.british-chime-v1'].treble),
      cut: normalizeKnob(british.cut, fallback['amp.british-chime-v1'].cut),
      channel: normalizeChoice(british.channel, ['normal', 'top-boost'], fallback['amp.british-chime-v1'].channel),
    },
  };
}

export function studioGainDb(knob: number): number {
  return knob <= 5 ? (knob - 5) * 12 / 5 : (knob - 5) * 24 / 5;
}
