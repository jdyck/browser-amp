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

export interface AmpSwitchDefinition {
  readonly kind: 'switch';
  readonly label: string;
}

export type AmpControlDefinition =
  | AmpKnobDefinition
  | AmpSwitchDefinition
  | AmpChoiceDefinition;

export const knob = (label: string): AmpKnobDefinition =>
  ({ kind: 'knob', label, minimum: 0, maximum: 10, step: 0.1, fractionDigits: 1 });

export const choice = (
  label: string,
  options: ReadonlyArray<readonly [string, string]>,
): AmpChoiceDefinition => ({ kind: 'choice', label, options });

export const switchControl = (label: string): AmpSwitchDefinition => ({ kind: 'switch', label });

export function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export function normalizeKnob(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.round(Math.min(10, Math.max(0, value)) * 10) / 10;
}

export function normalizeChoice<T extends string>(
  value: unknown,
  values: readonly T[],
  fallback: T,
): T {
  return typeof value === 'string' && values.includes(value as T) ? value as T : fallback;
}

export function normalizeBoolean(
  value: unknown,
  fallback: boolean,
  legacyTrueValues: readonly string[] = [],
  legacyFalseValues: readonly string[] = [],
): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') return fallback;
  if (
    value === 'true'
    || value === 'on'
    || value === '1'
    || legacyTrueValues.includes(value)
  ) return true;
  if (
    value === 'false'
    || value === 'off'
    || value === '0'
    || legacyFalseValues.includes(value)
  ) return false;
  return fallback;
}
