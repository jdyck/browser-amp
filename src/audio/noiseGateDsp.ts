export const NOISE_GATE_TIMING = {
  attackSeconds: 0.005,
  holdSeconds: 0.06,
  detectorAttackSeconds: 0.001,
  detectorReleaseSeconds: 0.03,
  hysteresisDb: 6,
} as const;

export const DEFAULT_NOISE_GATE_SETTINGS: NoiseGateSettings = {
  thresholdDb: -55,
  rangeDb: 9,
  releaseSeconds: 0.2,
  bypassed: false,
};

export interface NoiseGateSettings {
  readonly thresholdDb: number;
  readonly rangeDb: number;
  readonly releaseSeconds: number;
  readonly bypassed: boolean;
}

export interface NoiseGateState {
  readonly open: boolean;
  readonly envelopeDb: number;
  readonly reductionDb: number;
}

const DB_FLOOR = -120;

function dbToGain(db: number): number {
  return 10 ** (db / 20);
}

function smoothingCoefficient(seconds: number, sampleRate: number): number {
  return Math.exp(-1 / Math.max(1, seconds * sampleRate));
}

/** Sample-accurate downward expander used by the worklet and deterministic tests. */
export class NoiseGateDsp {
  readonly #sampleRate: number;
  readonly #detectorAttack: number;
  readonly #detectorRelease: number;
  readonly #openAttack: number;
  readonly #holdSamples: number;
  #thresholdDb: number;
  #rangeDb: number;
  #closeRelease: number;
  #bypassed: boolean;
  #envelope = 0;
  #gain: number;
  #open = false;
  #holdRemaining = 0;

  public constructor(sampleRate: number, settings: NoiseGateSettings) {
    this.#sampleRate = sampleRate;
    this.#thresholdDb = settings.thresholdDb;
    this.#rangeDb = settings.rangeDb;
    this.#bypassed = settings.bypassed;
    this.#detectorAttack = smoothingCoefficient(NOISE_GATE_TIMING.detectorAttackSeconds, sampleRate);
    this.#detectorRelease = smoothingCoefficient(NOISE_GATE_TIMING.detectorReleaseSeconds, sampleRate);
    this.#openAttack = smoothingCoefficient(NOISE_GATE_TIMING.attackSeconds, sampleRate);
    this.#closeRelease = smoothingCoefficient(settings.releaseSeconds, sampleRate);
    this.#holdSamples = Math.round(NOISE_GATE_TIMING.holdSeconds * sampleRate);
    this.#gain = this.#bypassed ? 1 : dbToGain(-this.#rangeDb);
  }

  public setSettings(settings: NoiseGateSettings): void {
    this.#thresholdDb = settings.thresholdDb;
    this.#rangeDb = settings.rangeDb;
    this.#closeRelease = smoothingCoefficient(settings.releaseSeconds, this.#sampleRate);
    this.#bypassed = settings.bypassed;
  }

  public processSample(signal: number, detector: number): number {
    const detectorMagnitude = Math.abs(detector);
    const detectorCoefficient = detectorMagnitude > this.#envelope ? this.#detectorAttack : this.#detectorRelease;
    this.#envelope = detectorMagnitude + detectorCoefficient * (this.#envelope - detectorMagnitude);

    const openThreshold = dbToGain(this.#thresholdDb);
    const closeThreshold = dbToGain(this.#thresholdDb - NOISE_GATE_TIMING.hysteresisDb);
    if (this.#envelope >= openThreshold) {
      this.#open = true;
      this.#holdRemaining = this.#holdSamples;
    } else if (this.#open && this.#envelope >= closeThreshold) {
      this.#holdRemaining = this.#holdSamples;
    } else if (this.#open && this.#holdRemaining > 0) {
      this.#holdRemaining -= 1;
    } else {
      this.#open = false;
    }

    const targetGain = this.#bypassed || this.#open ? 1 : dbToGain(-this.#rangeDb);
    const gainCoefficient = targetGain > this.#gain ? this.#openAttack : this.#closeRelease;
    this.#gain = targetGain + gainCoefficient * (this.#gain - targetGain);
    return signal * this.#gain;
  }

  public get state(): NoiseGateState {
    return {
      open: this.#open,
      envelopeDb: this.#envelope > 0 ? 20 * Math.log10(this.#envelope) : DB_FLOOR,
      reductionDb: Math.max(0, -20 * Math.log10(Math.max(this.#gain, Number.EPSILON))),
    };
  }
}
