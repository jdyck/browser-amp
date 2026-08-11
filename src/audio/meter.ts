export const METER_FLOOR_DBFS = -60;
const PEAK_HOLD_MS = 1_000;

export interface PeakHold {
  readonly dbfs: number;
  readonly heldAt: number;
}

export function dbfsFromSamples(samples: Float32Array): number {
  let peak = 0;
  for (const sample of samples) peak = Math.max(peak, Math.abs(sample));
  if (peak === 0) return METER_FLOOR_DBFS;
  return Math.max(METER_FLOOR_DBFS, Math.min(0, 20 * Math.log10(peak)));
}

export function nextPeakHold(previous: PeakHold, levelDbfs: number, now: number): PeakHold {
  if (levelDbfs >= previous.dbfs || now - previous.heldAt > PEAK_HOLD_MS) {
    return { dbfs: levelDbfs, heldAt: now };
  }
  return previous;
}
