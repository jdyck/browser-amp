import { AMP_REGISTRY, type AmpModel, type JazzAmpSettings } from '../amps';
import { StageSwitcher } from './stageSwitcher';
import type { AmpPath } from './amps/shared';

function topologyKey(model: AmpModel, settings: JazzAmpSettings): string {
  return `${model}/${AMP_REGISTRY[model].topologyKey(settings[model])}`;
}

function createAmpPath(
  context: BaseAudioContext,
  model: AmpModel,
  settings: JazzAmpSettings,
): AmpPath {
  return AMP_REGISTRY[model].createPath(context, settings[model]);
}

/** Builds one selected amp graph and crossfades topology changes without reconnecting input. */
export class AmpModelStage {
  readonly input: GainNode;
  readonly output: GainNode;
  readonly #switcher: StageSwitcher<string>;
  #model: AmpModel;
  #settings: JazzAmpSettings;

  constructor(
    context: BaseAudioContext,
    model: AmpModel,
    settings: JazzAmpSettings
  ) {
    this.#model = model;
    this.#settings = settings;
    this.#switcher = new StageSwitcher(
      context,
      topologyKey(model, settings),
      () => createAmpPath(context, this.#model, this.#settings),
    );
    this.input = this.#switcher.input;
    this.output = this.#switcher.output;
  }

  setControls(model: AmpModel, settings: JazzAmpSettings): void {
    this.#model = model;
    this.#settings = settings;
    const key = topologyKey(model, settings);
    this.#switcher.visitPaths((path, pathKey) => {
      if (pathKey === key) {
        (path as AmpPath).setControls(settings[model]);
      }
    });
    this.#switcher.select(key);
  }

  disconnect(): void {
    this.#switcher.dispose();
  }
}
