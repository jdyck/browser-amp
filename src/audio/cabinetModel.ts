import type { JazzCabinetId } from '../cabinetModels';
import { StageSwitcher, type StagePath } from './stageSwitcher';

const BUTTERWORTH_Q_DB = 20 * Math.log10(Math.SQRT1_2);

export interface CabinetFilterDefinition {
  readonly type: BiquadFilterType;
  readonly frequency: number;
  readonly gain?: number;
  readonly q?: number;
}

export interface CabinetRecipe {
  readonly filters: readonly CabinetFilterDefinition[];
  readonly trim: number;
}

/** Original, broad filter recipes tuned as useful cabinet characters rather than hardware captures. */
export const CABINET_RECIPES: Readonly<Record<JazzCabinetId, CabinetRecipe>> = {
  'cab.compact-jazz-1x12-v1': {
    filters: [
      { type: 'highpass', frequency: 62 },
      { type: 'peaking', frequency: 105, gain: 2.2, q: 1.15 },
      { type: 'peaking', frequency: 430, gain: 1.5, q: 0.75 },
      { type: 'peaking', frequency: 1_450, gain: -1.4, q: 0.85 },
      { type: 'peaking', frequency: 2_700, gain: 1.1, q: 1.05 },
      { type: 'lowpass', frequency: 6_400 },
    ],
    trim: 0.9,
  },
  'cab.american-open-1x12-v1': {
    filters: [
      { type: 'highpass', frequency: 55 },
      { type: 'peaking', frequency: 92, gain: 1.8, q: 0.9 },
      { type: 'peaking', frequency: 470, gain: -1.7, q: 0.7 },
      { type: 'peaking', frequency: 1_850, gain: 1.7, q: 0.9 },
      { type: 'peaking', frequency: 3_400, gain: 1.1, q: 1.15 },
      { type: 'lowpass', frequency: 7_900 },
    ],
    trim: 0.86,
  },
  'cab.american-open-2x12-v1': {
    filters: [
      { type: 'highpass', frequency: 48 },
      { type: 'peaking', frequency: 78, gain: 2.3, q: 0.8 },
      { type: 'peaking', frequency: 230, gain: 1.5, q: 0.72 },
      { type: 'peaking', frequency: 690, gain: -1.3, q: 0.7 },
      { type: 'peaking', frequency: 1_700, gain: 1.1, q: 0.9 },
      { type: 'lowpass', frequency: 7_100 },
    ],
    trim: 0.84,
  },
  'cab.open-4x10-v1': {
    filters: [
      { type: 'highpass', frequency: 72 },
      { type: 'peaking', frequency: 118, gain: 2.4, q: 1.55 },
      { type: 'peaking', frequency: 360, gain: -1.4, q: 0.9 },
      { type: 'peaking', frequency: 1_100, gain: 1.8, q: 1.05 },
      { type: 'peaking', frequency: 3_100, gain: 1.5, q: 1.2 },
      { type: 'lowpass', frequency: 8_400 },
    ],
    trim: 0.89,
  },
  'cab.direct-full-range-v1': { filters: [], trim: 1 },
};

/** Builds only the selected cabinet graph and crossfades replacements click-free. */
export class CabinetModelStage {
  readonly input: GainNode;
  readonly output: GainNode;
  readonly #switcher: StageSwitcher<JazzCabinetId>;

  constructor(context: BaseAudioContext, initial: JazzCabinetId) {
    this.#switcher = new StageSwitcher(context, initial, (id) => new CabinetPath(context, CABINET_RECIPES[id]));
    this.input = this.#switcher.input;
    this.output = this.#switcher.output;
  }

  setModel(id: JazzCabinetId): void {
    this.#switcher.select(id);
  }

  disconnect(): void {
    this.#switcher.dispose();
  }
}

class CabinetPath implements StagePath {
  readonly input: GainNode;
  readonly output: GainNode;
  readonly #nodes: AudioNode[];

  constructor(context: BaseAudioContext, recipe: CabinetRecipe) {
    this.input = context.createGain();
    this.output = context.createGain();
    const filters = recipe.filters.map((definition) => {
      const filter = context.createBiquadFilter();
      filter.type = definition.type;
      filter.frequency.value = Math.min(definition.frequency, context.sampleRate * 0.45);
      filter.gain.value = definition.gain ?? 0;
      filter.Q.value = definition.q ?? BUTTERWORTH_Q_DB;
      return filter;
    });
    const trim = recipe.trim === 1 ? undefined : context.createGain();
    if (trim !== undefined) trim.gain.value = recipe.trim;
    this.#nodes = [this.input, ...filters, ...(trim === undefined ? [] : [trim]), this.output];
    for (let index = 1; index < this.#nodes.length; index += 1) this.#nodes[index - 1].connect(this.#nodes[index]);
  }

  dispose(): void {
    for (const node of this.#nodes) node.disconnect();
  }
}
