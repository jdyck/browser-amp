import { smoothGainToValue } from './gain';
import { StageSwitcher, type StagePath } from './stageSwitcher';

const IMPULSE_DURATION_SECONDS = 1.5;
const IMPULSE_GAIN = 0.22;
const LOW_PASS_MEMORY = 0.72;
const PRE_DELAY_SECONDS = 0.012;
// Bound full-scale Amount to the existing calibrated wet return (about -20 dB).
const REVERB_MAX_WET_GAIN = 0.0975;

/** Constant dry path plus a lazily constructed, switchable wet effect. */
export class ReverbStage {
  readonly input: GainNode;
  readonly output: GainNode;
  readonly #context: BaseAudioContext;
  readonly #wetGain: GainNode;
  readonly #switcher: StageSwitcher<'off' | 'plate'>;
  #impulse: AudioBuffer | undefined;
  #amount: number;

  constructor(context: BaseAudioContext, amount: number, bypassed: boolean) {
    this.#context = context;
    this.#amount = amount;
    this.input = context.createGain();
    this.output = context.createGain();
    this.#wetGain = context.createGain();
    this.#wetGain.gain.value = amount / 100 * REVERB_MAX_WET_GAIN;
    this.#switcher = new StageSwitcher(context, bypassed ? 'off' : 'plate', (model) => this.#createPath(model));
    this.input.connect(this.output);
    this.input.connect(this.#switcher.input);
    this.#switcher.output.connect(this.#wetGain);
    this.#wetGain.connect(this.output);
  }

  setControls(amount: number, bypassed: boolean): void {
    if (amount !== this.#amount) {
      this.#amount = amount;
      smoothGainToValue(this.#wetGain.gain, amount / 100 * REVERB_MAX_WET_GAIN, this.#context.currentTime);
    }
    this.#switcher.select(bypassed ? 'off' : 'plate');
  }

  disconnect(): void {
    this.#switcher.dispose();
    this.input.disconnect();
    this.#wetGain.disconnect();
    this.output.disconnect();
    this.#impulse = undefined;
  }

  #createPath(model: 'off' | 'plate'): StagePath {
    if (model === 'off') {
      const silent = this.#context.createGain();
      silent.gain.value = 0;
      return { input: silent, output: silent, dispose: () => silent.disconnect() };
    }
    // Cache the data, never the convolver's history. Re-enabling starts a fresh
    // tail, and bypass never constructs a replacement processor to leave idle.
    this.#impulse ??= createPlateImpulse(this.#context);
    const convolver = this.#context.createConvolver();
    convolver.normalize = false;
    convolver.buffer = this.#impulse;
    return {
      input: convolver,
      output: convolver,
      stopInputOnSwitch: true,
      dispose: () => {
        convolver.disconnect();
        convolver.buffer = null;
      },
    };
  }
}

function randomNoise(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296 * 2 - 1;
  };
}

/** Builds a calibrated, deterministic stereo tail for the native ConvolverNode. */
export function createPlateImpulse(context: BaseAudioContext): AudioBuffer {
  const length = Math.round(context.sampleRate * IMPULSE_DURATION_SECONDS);
  const impulse = context.createBuffer(2, length, context.sampleRate);
  const preDelaySamples = Math.round(context.sampleRate * PRE_DELAY_SECONDS);

  for (let channel = 0; channel < impulse.numberOfChannels; channel += 1) {
    const samples = impulse.getChannelData(channel);
    const noise = randomNoise(0x504c4154 + channel * 0x1021);
    let filtered = 0;

    for (let index = 0; index < samples.length; index += 1) {
      if (index < preDelaySamples) {
        samples[index] = 0;
        continue;
      }
      filtered = LOW_PASS_MEMORY * filtered + (1 - LOW_PASS_MEMORY) * noise();
      const progress = (index - preDelaySamples) / Math.max(1, samples.length - preDelaySamples - 1);
      const envelope = (1 - progress) ** 2.2;
      samples[index] = filtered * envelope * IMPULSE_GAIN;
    }
  }

  return impulse;
}
