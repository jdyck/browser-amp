import type { AmpModel } from '../controls';
import { StageSwitcher, type StagePath } from './stageSwitcher';

// Original, tube-inspired voicings; not fitted triode circuits or named amp replicas.
// See docs/clean-tube-model.md for the tuning and validation boundaries.
const BUTTERWORTH_Q_DB = 20 * Math.log10(Math.SQRT1_2);
const curves = new Map<string, Float32Array<ArrayBuffer>>();

function tubeCurve(inputRange: number, drive: number, bias: number): Float32Array<ArrayBuffer> {
  const key = `${inputRange}/${drive}/${bias}`;
  const cached = curves.get(key);
  if (cached !== undefined) return cached;
  const curve = new Float32Array(65_537);
  const offset = Math.tanh(bias);
  const smallSignalSlope = drive * (1 - offset * offset);
  for (let index = 0; index < curve.length; index += 1) {
    const input = (2 * index / (curve.length - 1) - 1) * inputRange;
    // Zero maps to zero, small signals have unity gain, and opposite polarities
    // saturate slightly differently to introduce low-order even harmonics.
    curve[index] = (Math.tanh(drive * input + bias) - offset) / smallSignalSlope;
  }
  curves.set(key, curve);
  return curve;
}

/** Builds only the selected amp, with bounded overlap while switching voices. */
export class AmpModelStage {
  readonly input: GainNode;
  readonly output: GainNode;
  readonly #switcher: StageSwitcher<AmpModel>;

  constructor(context: BaseAudioContext, model: AmpModel) {
    this.#switcher = new StageSwitcher(context, model, (selected) => new AmpPath(context, selected));
    this.input = this.#switcher.input;
    this.output = this.#switcher.output;
  }

  setModel(model: AmpModel): void {
    this.#switcher.select(model);
  }

  disconnect(): void {
    this.#switcher.dispose();
  }
}

class AmpPath implements StagePath {
  readonly input: GainNode;
  readonly output: GainNode;
  readonly warmupSeconds: number;
  readonly #context: BaseAudioContext;
  readonly #nodes: AudioNode[] = [];

  constructor(context: BaseAudioContext, model: AmpModel) {
    this.#context = context;
    this.input = this.#gain(1);
    this.output = this.#gain(1);
    // Let the cascaded DC blockers settle before making a newly fed path audible.
    this.warmupSeconds = model === 'clean-voice' ? 0 : 0.1;
    if (model === 'clean-voice') {
      this.input.connect(this.output);
      return;
    }
    if (model === 'clean-tube') {
      this.#buildTube();
    } else {
      this.#buildWarmTube();
    }
  }

  dispose(): void {
    this.#nodes.forEach((node) => node.disconnect());
  }

  #buildTube(): void {
    const midContour = this.#filter('peaking', 650);
    midContour.Q.value = 0.7;
    midContour.gain.value = -1.5;
    const tubePath = [
      this.input,
      this.#filter('highpass', 45),
      this.#filter('lowpass', 10_000),
      // WaveShaper lookup inputs clamp at +/-1. Scale into a wider curve domain
      // so +24 dB Clean Gain reaches soft saturation instead of a hard lookup edge.
      this.#gain(1 / 32),
      this.#shaper(32, 1.4, 0.12),
      this.#filter('highpass', 20),
      midContour,
      this.#gain(1 / 4),
      this.#shaper(4, 0.7, -0.08),
      this.#filter('highpass', 20),
      this.#filter('lowpass', 5_500),
      this.output,
    ];
    this.#connectPath(tubePath);
  }

  #buildWarmTube(): void {
    const warmContour = this.#filter('peaking', 400);
    warmContour.Q.value = 0.65;
    warmContour.gain.value = 2;
    const warmTubePath = [
      this.input,
      this.#filter('highpass', 35),
      this.#filter('lowpass', 8_000),
      this.#gain(1 / 32),
      this.#shaper(32, 2, 0.08),
      this.#filter('highpass', 20),
      warmContour,
      this.#gain(1 / 4),
      this.#shaper(4, 1, 0.02),
      this.#filter('highpass', 20),
      this.#filter('lowpass', 4_200),
      // Offset the added low-mid body without changing the shapers' drive.
      this.#gain(0.9),
      this.output,
    ];
    this.#connectPath(warmTubePath);
  }

  #connectPath(path: AudioNode[]): void {
    for (let index = 1; index < path.length; index += 1) {
      path[index - 1].connect(path[index]);
    }
  }

  #gain(value: number): GainNode {
    const node = this.#context.createGain();
    node.gain.value = value;
    this.#nodes.push(node);
    return node;
  }

  #filter(type: BiquadFilterType, frequency: number): BiquadFilterNode {
    const node = this.#context.createBiquadFilter();
    node.type = type;
    node.frequency.value = Math.min(frequency, this.#context.sampleRate * 0.45);
    // Web Audio low/high-pass Q is in dB, unlike peaking-filter Q.
    if (type === 'highpass' || type === 'lowpass') node.Q.value = BUTTERWORTH_Q_DB;
    this.#nodes.push(node);
    return node;
  }

  #shaper(inputRange: number, drive: number, bias: number): WaveShaperNode {
    const node = this.#context.createWaveShaper();
    node.curve = tubeCurve(inputRange, drive, bias);
    node.oversample = '4x';
    this.#nodes.push(node);
    return node;
  }
}
