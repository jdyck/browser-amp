import type { BrowserAudio } from './browserAudio';
import type { NoiseGateSettings, NoiseGateState } from './noiseGateDsp';

const WORKLET_URL = new URL('./noiseGate.worklet.ts', import.meta.url);

export class NoiseGateStage {
  public readonly input: GainNode;
  public readonly detectorInput: GainNode;
  public readonly output: AudioWorkletNode;
  readonly #node: AudioWorkletNode;

  private constructor(
    context: BaseAudioContext,
    environment: BrowserAudio,
    settings: NoiseGateSettings,
    onState: (state: NoiseGateState) => void,
  ) {
    this.input = context.createGain();
    this.detectorInput = context.createGain();
    this.#node = environment.createAudioWorkletNode(context, 'browser-amp-noise-gate', {
      numberOfInputs: 2,
      numberOfOutputs: 1,
      channelCount: 1,
      channelCountMode: 'explicit',
      channelInterpretation: 'discrete',
      outputChannelCount: [1],
      processorOptions: settings,
    });
    this.output = this.#node;
    this.input.connect(this.#node, 0, 0);
    this.detectorInput.connect(this.#node, 0, 1);
    this.#node.port.onmessage = (event: MessageEvent<NoiseGateState>) => onState(event.data);
  }

  public static async create(
    context: BaseAudioContext,
    environment: BrowserAudio,
    settings: NoiseGateSettings,
    onState: (state: NoiseGateState) => void,
  ): Promise<NoiseGateStage> {
    await context.audioWorklet.addModule(WORKLET_URL);
    return new NoiseGateStage(context, environment, settings, onState);
  }

  public setControls(settings: NoiseGateSettings): void {
    this.#node.port.postMessage(settings);
  }

  public disconnect(): void {
    this.#node.port.onmessage = null;
    this.input.disconnect();
    this.detectorInput.disconnect();
    this.#node.disconnect();
  }
}
