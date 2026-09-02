import type {
  AmpModel, BlackfaceComboSettings, BritishChimeSettings, HighHeadroomAmericanSettings,
  JazzAmpSettings, SmallTweedComboSettings, StudioCleanSettings, WarmJazzComboSettings,
} from '../signalChain/ampModels';
import { studioGainDb } from '../signalChain/ampModels';
import { dbToLinearGain, smoothGainToDb, smoothGainToValue } from './gain';
import { StageSwitcher, type StagePath } from './stageSwitcher';

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
    const input = 2 * index / (curve.length - 1) - 1;
    curve[index] = (Math.tanh(drive * input + bias) - offset) / smallSignalSlope;
  }
  curves.set(key, curve);
  return curve;
}

function topologyKey(model: AmpModel, settings: JazzAmpSettings): string {
  switch (model) {
    case 'amp.studio-clean-v1': return `${model}/${settings[model].headroom}`;
    case 'amp.warm-jazz-combo-v1': return `${model}/${settings[model].color}/${settings[model].input}`;
    case 'amp.blackface-combo-v1': return `${model}/${settings[model].bright}`;
    case 'amp.high-headroom-american-v1': return `${model}/${settings[model].bright}/${settings[model].headroom}`;
    case 'amp.small-tweed-combo-v1': return `${model}/${settings[model].input}`;
    case 'amp.british-chime-v1': return `${model}/${settings[model].channel}`;
  }
}

/** Builds one selected amp graph and crossfades topology changes without reconnecting input. */
export class AmpModelStage {
  readonly input: GainNode;
  readonly output: GainNode;
  readonly #switcher: StageSwitcher<string>;
  #model: AmpModel;
  #settings: JazzAmpSettings;

  constructor(context: BaseAudioContext, model: AmpModel, settings: JazzAmpSettings) {
    this.#model = model;
    this.#settings = settings;
    this.#switcher = new StageSwitcher(context, topologyKey(model, settings), () => new AmpPath(
      context, this.#model, this.#settings[this.#model],
    ));
    this.input = this.#switcher.input;
    this.output = this.#switcher.output;
  }

  setControls(model: AmpModel, settings: JazzAmpSettings): void {
    this.#model = model;
    this.#settings = settings;
    const key = topologyKey(model, settings);
    this.#switcher.visitPaths((path, pathKey) => {
      if (pathKey === key) (path as AmpPath).setControls(settings[model]);
    });
    this.#switcher.select(key);
  }

  disconnect(): void { this.#switcher.dispose(); }
}

class AmpPath implements StagePath {
  readonly input: GainNode;
  readonly output: GainNode;
  readonly warmupSeconds: number;
  readonly #context: BaseAudioContext;
  readonly #model: AmpModel;
  readonly #nodes: AudioNode[] = [];
  readonly #controls = new Map<string, AudioParam>();

  constructor(context: BaseAudioContext, model: AmpModel, settings: JazzAmpSettings[AmpModel]) {
    this.#context = context;
    this.#model = model;
    this.input = this.#gain(1);
    this.output = this.#gain(1);
    this.warmupSeconds = model === 'amp.studio-clean-v1' ? 0 : 0.06;
    switch (model) {
      case 'amp.studio-clean-v1': this.#buildStudio(settings as StudioCleanSettings); break;
      case 'amp.warm-jazz-combo-v1': this.#buildWarmJazz(settings as WarmJazzComboSettings); break;
      case 'amp.blackface-combo-v1': this.#buildBlackface(settings as BlackfaceComboSettings); break;
      case 'amp.high-headroom-american-v1': this.#buildHighHeadroom(settings as HighHeadroomAmericanSettings); break;
      case 'amp.small-tweed-combo-v1': this.#buildSmallTweed(settings as SmallTweedComboSettings); break;
      case 'amp.british-chime-v1': this.#buildBritishChime(settings as BritishChimeSettings); break;
    }
  }

  setControls(settings: JazzAmpSettings[AmpModel]): void {
    const now = this.#context.currentTime;
    const set = (name: string, value: number) => {
      const parameter = this.#controls.get(name);
      if (parameter !== undefined) smoothGainToValue(parameter, value, now);
    };
    const setDb = (name: string, value: number) => {
      const parameter = this.#controls.get(name);
      if (parameter !== undefined) smoothGainToDb(parameter, value, now);
    };
    switch (this.#model) {
      case 'amp.studio-clean-v1': {
        const state = settings as StudioCleanSettings;
        setDb('drive', studioGainDb(state.gain));
        set('bass', toneDb(state.bass, 12)); set('middle', toneDb(state.middle, 12)); set('treble', toneDb(state.treble, 12));
        break;
      }
      case 'amp.warm-jazz-combo-v1': {
        const state = settings as WarmJazzComboSettings;
        setDb('drive', (state.volume - 4) * 3);
        set('bass', toneDb(state.bass, 10)); set('middle', toneDb(state.middle, 9)); set('treble', toneDb(state.treble, 10));
        break;
      }
      case 'amp.blackface-combo-v1': {
        const state = settings as BlackfaceComboSettings;
        setDb('drive', (state.volume - 4) * 3.3);
        set('bass', (state.bass - 4) * 1.7); set('treble', (state.treble - 5.5) * 1.7);
        set('bright', state.bright === 'on' ? Math.max(0, 7 * (1 - state.volume / 10)) : 0);
        break;
      }
      case 'amp.high-headroom-american-v1': {
        const state = settings as HighHeadroomAmericanSettings;
        setDb('drive', (state.volume - 4) * 3);
        set('bass', (state.bass - 4) * 1.6); set('middle', toneDb(state.middle, 8)); set('treble', (state.treble - 5.5) * 1.6);
        set('bright', state.bright === 'on' ? Math.max(0, 5 * (1 - state.volume / 12)) : 0);
        break;
      }
      case 'amp.small-tweed-combo-v1': {
        const state = settings as SmallTweedComboSettings;
        setDb('drive', (state.volume - 3.5) * 4); set('tone', toneDb(state.tone, 10));
        break;
      }
      case 'amp.british-chime-v1': {
        const state = settings as BritishChimeSettings;
        setDb('drive', (state.volume - 4) * 3.5);
        set('bass', (state.bass - 4) * 1.7); set('treble', toneDb(state.treble, 10)); set('cut', -state.cut * 1.2);
        break;
      }
    }
  }

  dispose(): void {
    for (const node of this.#nodes) {
      if ('curve' in node) (node as WaveShaperNode).curve = null;
      node.disconnect();
    }
  }

  #buildStudio(state: StudioCleanSettings): void {
    const path: AudioNode[] = [
      this.input,
      this.#controlledGain('drive', dbToLinearGain(studioGainDb(state.gain))),
      this.#controlledFilter('bass', 'lowshelf', 120, toneDb(state.bass, 12)),
      this.#controlledFilter('middle', 'peaking', 800, toneDb(state.middle, 12), 0.8),
      this.#controlledFilter('treble', 'highshelf', 3_200, toneDb(state.treble, 12)),
    ];
    if (state.headroom === 'high') path.push(this.#gain(0.28), this.#shaper(0.55), this.#gain(3.6));
    path.push(this.output);
    this.#connectPath(path);
  }

  #buildWarmJazz(state: WarmJazzComboSettings): void {
    const colorDb = state.color === 'dark' ? -4 : state.color === 'bright' ? 3 : 0;
    this.#connectPath([
      this.input, this.#filter('highpass', 38), this.#gain(state.input === 'low' ? 0.5 : 1), this.#filter('lowpass', state.input === 'low' ? 7_000 : 10_000),
      this.#controlledGain('drive', dbToLinearGain((state.volume - 4) * 3)), this.#filter('highshelf', 2_200, colorDb),
      this.#controlledFilter('bass', 'lowshelf', 110, toneDb(state.bass, 10)),
      this.#controlledFilter('middle', 'peaking', 650, toneDb(state.middle, 9), 0.75),
      this.#controlledFilter('treble', 'highshelf', 3_000, toneDb(state.treble, 10)),
      this.#gain(0.42), this.#shaper(1.1), this.#gain(2.25), this.#filter('lowpass', 7_500), this.#gain(1.06), this.output,
    ]);
  }

  #buildBlackface(state: BlackfaceComboSettings): void {
    this.#connectPath([
      this.input, this.#filter('highpass', 42), this.#controlledGain('drive', dbToLinearGain((state.volume - 4) * 3.3)),
      this.#controlledFilter('bright', 'highshelf', 2_700, state.bright === 'on' ? 7 * (1 - state.volume / 10) : 0),
      this.#gain(0.38), this.#shaper(1.15, 0.07), this.#filter('highpass', 18),
      this.#gain(0.58), this.#controlledFilter('bass', 'lowshelf', 105, (state.bass - 4) * 1.7),
      this.#filter('peaking', 680, -4.2, 0.65), this.#controlledFilter('treble', 'highshelf', 2_800, (state.treble - 5.5) * 1.7),
      this.#gain(0.48), this.#shaper(0.9, -0.04), this.#filter('highpass', 18), this.#filter('lowpass', 6_800), this.#gain(10.4), this.output,
    ]);
  }

  #buildHighHeadroom(state: HighHeadroomAmericanSettings): void {
    const thresholdScale = state.headroom === 'ultra' ? 0.18 : 0.27;
    this.#connectPath([
      this.input, this.#filter('highpass', 48), this.#controlledGain('drive', dbToLinearGain((state.volume - 4) * 3)),
      this.#controlledFilter('bright', 'highshelf', 3_000, state.bright === 'on' ? 5 * (1 - state.volume / 12) : 0),
      this.#controlledFilter('bass', 'lowshelf', 95, (state.bass - 4) * 1.6),
      this.#controlledFilter('middle', 'peaking', 720, toneDb(state.middle, 8), 0.7),
      this.#controlledFilter('treble', 'highshelf', 3_100, (state.treble - 5.5) * 1.6),
      this.#gain(thresholdScale), this.#shaper(0.5, 0.01), this.#filter('highpass', 20),
      this.#gain(1 / thresholdScale), this.#filter('lowpass', 7_200), this.#gain(1), this.output,
    ]);
  }

  #buildSmallTweed(state: SmallTweedComboSettings): void {
    this.#connectPath([
      this.input, this.#filter('highpass', 45), this.#gain(state.input === 'low' ? 0.52 : 1),
      this.#controlledGain('drive', dbToLinearGain((state.volume - 3.5) * 4)),
      this.#gain(0.72), this.#shaper(1.55, 0.12), this.#filter('highpass', 22),
      this.#filter('highpass', 105), this.#controlledFilter('tone', 'highshelf', 1_700, toneDb(state.tone, 10)),
      this.#gain(0.9), this.#shaper(1.25, -0.08), this.#filter('highpass', 22),
      this.#filter('peaking', 720, 2.4, 0.7), this.#filter('lowpass', 5_400), this.#gain(1.54), this.output,
    ]);
  }

  #buildBritishChime(state: BritishChimeSettings): void {
    const topBoost = state.channel === 'top-boost';
    this.#connectPath([
      this.input, this.#filter('highpass', topBoost ? 95 : 75), this.#controlledGain('drive', dbToLinearGain((state.volume - 4) * 3.5)),
      this.#controlledFilter('bass', 'lowshelf', 120, (state.bass - 4) * 1.7 - (topBoost ? 1 : 0)),
      this.#filter('peaking', topBoost ? 1_800 : 1_350, topBoost ? 3.5 : 1.8, 0.85),
      this.#controlledFilter('treble', 'highshelf', topBoost ? 2_200 : 2_800, toneDb(state.treble, 10) + (topBoost ? 1.5 : 0)),
      this.#gain(topBoost ? 0.62 : 0.48), this.#shaper(topBoost ? 1.4 : 1.1, 0.055), this.#filter('highpass', 20),
      this.#controlledFilter('cut', 'highshelf', 3_200, -state.cut * 1.2), this.#filter('lowpass', 7_800),
      this.#gain(topBoost ? 1.78 : 2.09), this.output,
    ]);
  }

  #connectPath(path: AudioNode[]): void {
    for (let index = 1; index < path.length; index += 1) path[index - 1].connect(path[index]);
  }

  #controlledGain(name: string, value: number): GainNode {
    const node = this.#gain(value); this.#controls.set(name, node.gain); return node;
  }

  #gain(value: number): GainNode {
    const node = this.#context.createGain(); node.gain.value = value; this.#nodes.push(node); return node;
  }

  #controlledFilter(name: string, type: BiquadFilterType, frequency: number, gain: number, q?: number): BiquadFilterNode {
    const node = this.#filter(type, frequency, gain, q); this.#controls.set(name, node.gain); return node;
  }

  #filter(type: BiquadFilterType, frequency: number, gain = 0, q?: number): BiquadFilterNode {
    const node = this.#context.createBiquadFilter();
    node.type = type; node.frequency.value = Math.min(frequency, this.#context.sampleRate * 0.45); node.gain.value = gain;
    if (q !== undefined) node.Q.value = q;
    else if (type === 'highpass' || type === 'lowpass') node.Q.value = BUTTERWORTH_Q_DB;
    this.#nodes.push(node); return node;
  }

  #shaper(drive: number, bias = 0): WaveShaperNode {
    const node = this.#context.createWaveShaper(); node.curve = saturationCurve(drive, bias); node.oversample = '4x'; this.#nodes.push(node); return node;
  }
}

function toneDb(knob: number, range: number): number { return (knob - 5) * range / 5; }
