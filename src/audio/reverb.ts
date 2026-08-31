import type { ReverbProfile } from '../controls';
import { reverbParameters, type ReverbParameters } from '../reverbSettings';
import { createReverbImpulse } from './reverbImpulses';
import { smoothGainToValue } from './gain';
import { StageSwitcher, type StagePath } from './stageSwitcher';

// Bound full-scale Amount to the existing calibrated wet return (about -20 dB).
const REVERB_MAX_WET_GAIN = 0.0975;

interface Selection {
  readonly key: string;
  readonly profile: ReverbProfile;
  readonly parameters: ReverbParameters;
}

/** Constant dry path plus a lazily constructed, switchable wet effect. */
export class ReverbStage {
  readonly input: GainNode;
  readonly output: GainNode;
  readonly #context: BaseAudioContext;
  readonly #wetGain: GainNode;
  readonly #switcher: StageSwitcher<'off' | Selection>;
  readonly #impulses = new Map<ReverbProfile, { key: string; buffer: AudioBuffer }>();
  #selection: Selection;
  #amount: number;

  constructor(context: BaseAudioContext, amount: number, bypassed: boolean, profile: ReverbProfile, parameters = reverbParameters(profile)) {
    this.#context = context;
    this.#amount = amount;
    this.input = context.createGain();
    this.output = context.createGain();
    this.#wetGain = context.createGain();
    this.#wetGain.gain.value = amount / 100 * REVERB_MAX_WET_GAIN;
    this.#selection = { key: JSON.stringify([profile, parameters]), profile, parameters };
    this.#switcher = new StageSwitcher(context, bypassed ? 'off' : this.#selection, (selection) => this.#createPath(selection));
    this.input.connect(this.output);
    this.input.connect(this.#switcher.input);
    this.#switcher.output.connect(this.#wetGain);
    this.#wetGain.connect(this.output);
  }

  setControls(amount: number, bypassed: boolean, profile: ReverbProfile, parameters = reverbParameters(profile)): void {
    if (amount !== this.#amount) {
      this.#amount = amount;
      smoothGainToValue(this.#wetGain.gain, amount / 100 * REVERB_MAX_WET_GAIN, this.#context.currentTime);
    }
    const key = JSON.stringify([profile, parameters]);
    if (key !== this.#selection.key) this.#selection = { key, profile, parameters };
    this.#switcher.select(bypassed ? 'off' : this.#selection);
  }

  disconnect(): void {
    this.#switcher.dispose();
    this.input.disconnect();
    this.#wetGain.disconnect();
    this.output.disconnect();
    this.#impulses.clear();
  }

  #createPath(selection: 'off' | Selection): StagePath {
    if (selection === 'off') {
      const silent = this.#context.createGain();
      silent.gain.value = 0;
      return { input: silent, output: silent, dispose: () => silent.disconnect() };
    }
    // Cache the data, never the convolver's history. Re-enabling starts a fresh
    // tail, and bypass never constructs a replacement processor to leave idle.
    const { profile, parameters } = selection;
    // Drive and modulation use live nodes, so changing them can reuse the IR.
    const { dwell: _dwell, modulationDepth: _depth, modulationRateHz: _rate, ...impulseParameters } = parameters;
    const impulseKey = JSON.stringify(impulseParameters);
    let cached = this.#impulses.get(profile);
    if (cached?.key !== impulseKey) {
      cached = { key: impulseKey, buffer: createReverbImpulse(this.#context, profile, parameters) };
      // Keep only the latest response per module, never every slider position.
      this.#impulses.set(profile, cached);
    }
    const convolver = this.#context.createConvolver();
    convolver.normalize = false;
    convolver.buffer = cached.buffer;
    const nodes: AudioNode[] = [convolver];
    let input: AudioNode = convolver;
    let output: AudioNode = convolver;
    let shaper: WaveShaperNode | undefined;
    let oscillator: OscillatorNode | undefined;
    if (profile === 'fender-spring' && parameters.dwell > 0) {
      const send = this.#context.createGain();
      send.gain.value = 1 / 8;
      shaper = this.#context.createWaveShaper();
      const curve = new Float32Array(16_385);
      const blend = parameters.dwell / 100;
      const drive = 1 + 14 * blend;
      for (let index = 0; index < curve.length; index += 1) {
        const value = (2 * index / (curve.length - 1) - 1) * 8;
        curve[index] = (1 - blend) * value + blend * Math.tanh(drive * value) / Math.sqrt(drive);
      }
      shaper.curve = curve;
      shaper.oversample = '4x';
      send.connect(shaper);
      shaper.connect(convolver);
      input = send;
      nodes.push(send, shaper);
    }
    if (profile === 'digital-hall' && parameters.modulationDepth > 0) {
      const splitter = this.#context.createChannelSplitter(2);
      const merger = this.#context.createChannelMerger(2);
      oscillator = this.#context.createOscillator();
      oscillator.frequency.value = parameters.modulationRateHz;
      convolver.connect(splitter);
      nodes.push(splitter, merger, oscillator);
      for (let channel = 0; channel < 2; channel += 1) {
        const delay = this.#context.createDelay(0.02);
        const depth = this.#context.createGain();
        delay.delayTime.value = 0.006;
        depth.gain.value = parameters.modulationDepth / 100 * 0.003 * (channel === 0 ? 1 : -1);
        oscillator.connect(depth);
        depth.connect(delay.delayTime);
        splitter.connect(delay, channel);
        delay.connect(merger, 0, channel);
        nodes.push(delay, depth);
      }
      oscillator.start();
      output = merger;
    }
    return {
      input,
      output,
      stopInputOnSwitch: true,
      dispose: () => {
        oscillator?.stop();
        for (const node of nodes) node.disconnect();
        if (shaper !== undefined) shaper.curve = null;
        convolver.buffer = null;
      },
    };
  }
}
