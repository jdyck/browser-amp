export const CABINET_MODELS = {
  'cab.compact-jazz-1x12-v1': {
    label: 'Compact 1×12 Jazz',
    description: 'Warm, focused, and controlled on top, with a compact low resonance.',
  },
  'cab.american-open-1x12-v1': {
    label: 'American 1×12 Open-Back',
    description: 'Airy upper mids and a moderately bright, open-back character.',
  },
  'cab.american-open-2x12-v1': {
    label: 'American 2×12 Open-Back',
    description: 'Broad low-mid authority with a smooth top end and clear chords.',
  },
  'cab.open-4x10-v1': {
    label: '4×10 Open-Back',
    description: 'Tight, punchy bass with articulate upper-mid detail.',
  },
  'cab.direct-full-range-v1': {
    label: 'Direct / Full Range',
    description: 'Unity full-range output. Driven amps may sound unusually bright without speaker voicing.',
  },
} as const;

export type JazzCabinetId = keyof typeof CABINET_MODELS;

export const DEFAULT_JAZZ_CABINET: JazzCabinetId = 'cab.compact-jazz-1x12-v1';

export function isCabinetModel(value: unknown): value is JazzCabinetId {
  return typeof value === 'string' && Object.hasOwn(CABINET_MODELS, value);
}
