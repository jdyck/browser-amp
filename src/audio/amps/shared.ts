import { smoothGainToDb, smoothGainToValue } from '../gain';
import type { StagePath } from '../stageSwitcher';

const BUTTERWORTH_Q_DB = 20 * Math.log10(Math.SQRT1_2);

const curves = new Map<string, Float32Array<ArrayBuffer>>();

function saturationCurve(drive: number, bias = 0): Float32Array<ArrayBuffer> {
  const key = `${drive}/${bias}`;
  const cached = curves.get(key);
  if (cached !== undefined) return cached;

  const curve = new Float32Array(65_537);
  const offset = Math.tanh(bias);
  const smallSignalSlope = drive * (1 - offset * offset);

  for (let index = 0; index < curve.length; index += 1) {
    const input = (2 * index) / (curve.length - 1) - 1;
    curve[index] = (Math.tanh(drive * input + bias) - offset) / smallSignalSlope;
  }

  curves.set(key, curve);
  return curve;
}

export interface AmpPath extends StagePath {
  setControls(settings: unknown): void;
}

/** Shared Web Audio implementation for one concrete amp topology. */
export abstract class AmpPathBase implements AmpPath {
  readonly input: GainNode;
  readonly output: GainNode;
  readonly warmupSeconds: number;
  protected readonly context: BaseAudioContext;
  readonly #nodes: AudioNode[] = [];
  readonly #controls = new Map<string, AudioParam>();

  protected constructor(context: BaseAudioContext, warmupSeconds = 0.06) {
    this.context = context;
    this.warmupSeconds = warmupSeconds;
    this.input = this.gain(1);
    this.output = this.gain(1);
  }

  abstract setControls(settings: unknown): void;

  dispose(): void {
    for (const node of this.#nodes) {
      if ('curve' in node) {
        (node as WaveShaperNode).curve = null;
      }
      node.disconnect();
    }
  }

  protected connectPath(path: readonly AudioNode[]): void {
    for (let index = 1; index < path.length; index += 1) {
      path[index - 1].connect(path[index]);
    }
  }

  protected setControl(name: string, value: number): void {
    const parameter = this.#controls.get(name);
    if (parameter !== undefined) smoothGainToValue(parameter, value, this.context.currentTime);
  }

  protected setControlDb(name: string, value: number): void {
    const parameter = this.#controls.get(name);
    if (parameter !== undefined) smoothGainToDb(parameter, value, this.context.currentTime);
  }

  protected controlledGain(name: string, value: number): GainNode {
    const node = this.gain(value);
    this.#controls.set(name, node.gain);
    return node;
  }

  protected gain(value: number): GainNode {
    const node = this.context.createGain();
    node.gain.value = value;
    this.#nodes.push(node);
    return node;
  }

  protected controlledFilter(
    name: string,
    type: BiquadFilterType,
    frequency: number,
    gain: number,
    q?: number
  ): BiquadFilterNode {
    const node = this.filter(type, frequency, gain, q);
    this.#controls.set(name, node.gain);
    return node;
  }

  protected filter(
    type: BiquadFilterType,
    frequency: number,
    gain = 0,
    q?: number
  ): BiquadFilterNode {
    const node = this.context.createBiquadFilter();
    node.type = type;
    node.frequency.value = Math.min(frequency, this.context.sampleRate * 0.45);
    node.gain.value = gain;
    if (q !== undefined) {
      node.Q.value = q;
    } else if (type === 'highpass' || type === 'lowpass') {
      node.Q.value = BUTTERWORTH_Q_DB;
    }
    this.#nodes.push(node);
    return node;
  }

  protected shaper(drive: number, bias = 0): WaveShaperNode {
    const node = this.context.createWaveShaper();
    node.curve = saturationCurve(drive, bias);
    node.oversample = '4x';
    this.#nodes.push(node);
    return node;
  }
}

export function toneDb(knob: number, range: number): number {
  return ((knob - 5) * range) / 5;
}
