export const METER_FLOOR_DBFS = -60;
const PEAK_HOLD_MS = 1_000;

export interface PeakHold {
  readonly dbfs: number;
  readonly heldAt: number;
}

export interface MeterReading {
  readonly dbfs: number;
  readonly clipped: boolean;
}

export function meterReadingFromSamples(samples: Float32Array): MeterReading {
  let peak = 0;
  for (const sample of samples) peak = Math.max(peak, Math.abs(sample));
  const dbfs = peak === 0 ? METER_FLOOR_DBFS : Math.max(METER_FLOOR_DBFS, Math.min(0, 20 * Math.log10(peak)));
  return { dbfs, clipped: peak >= 1 };
}

export function dbfsFromSamples(samples: Float32Array): number {
  return meterReadingFromSamples(samples).dbfs;
}

export function nextPeakHold(previous: PeakHold, levelDbfs: number, now: number): PeakHold {
  if (levelDbfs >= previous.dbfs || now - previous.heldAt > PEAK_HOLD_MS) {
    return { dbfs: levelDbfs, heldAt: now };
  }
  return previous;
}
