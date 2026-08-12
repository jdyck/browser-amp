export const GAIN_SMOOTHING_SECONDS = 0.02;

export interface SchedulableAudioParam {
  readonly value: number;
  cancelScheduledValues(cancelTime: number): AudioParam;
  setValueAtTime(value: number, startTime: number): AudioParam;
  linearRampToValueAtTime(value: number, endTime: number): AudioParam;
}

export function dbToLinearGain(db: number): number {
  return 10 ** (db / 20);
}

export function smoothGainToDb(parameter: SchedulableAudioParam, db: number, now: number): void {
  smoothGainToValue(parameter, dbToLinearGain(db), now);
}

export function smoothGainToValue(parameter: SchedulableAudioParam, value: number, now: number): void {
  parameter.cancelScheduledValues(now);
  parameter.setValueAtTime(parameter.value, now);
  parameter.linearRampToValueAtTime(value, now + GAIN_SMOOTHING_SECONDS);
}
