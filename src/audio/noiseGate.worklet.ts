import { DEFAULT_NOISE_GATE_SETTINGS, NoiseGateDsp, type NoiseGateSettings } from './noiseGateDsp';

declare const sampleRate: number;
declare abstract class AudioWorkletProcessor {
  public readonly port: MessagePort;
  public constructor(options?: AudioWorkletNodeOptions);
  public abstract process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean;
}
declare function registerProcessor(name: string, processorCtor: typeof AudioWorkletProcessor): void;

interface NoiseGateProcessorOptions extends AudioWorkletNodeOptions {
  readonly processorOptions?: NoiseGateSettings;
}

class BrowserAmpNoiseGateProcessor extends AudioWorkletProcessor {
  readonly #dsp: NoiseGateDsp;
  #meterCountdown = 0;

  public constructor(options: NoiseGateProcessorOptions) {
    super(options);
    this.#dsp = new NoiseGateDsp(sampleRate, options.processorOptions ?? DEFAULT_NOISE_GATE_SETTINGS);
    this.port.onmessage = (event: MessageEvent<NoiseGateSettings>) => this.#dsp.setSettings(event.data);
  }

  public process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const signalChannels = inputs[0] ?? [];
    const detector = inputs[1]?.[0];
    const outputChannels = outputs[0] ?? [];
    for (let channel = 0; channel < outputChannels.length; channel += 1) {
      const signal = signalChannels[channel] ?? signalChannels[0];
      const output = outputChannels[channel];
      for (let index = 0; index < output.length; index += 1) {
        output[index] = this.#dsp.processSample(signal?.[index] ?? 0, detector?.[index] ?? 0);
      }
    }
    this.#meterCountdown -= outputChannels[0]?.length ?? 128;
    if (this.#meterCountdown <= 0) {
      this.port.postMessage(this.#dsp.state);
      this.#meterCountdown = Math.round(sampleRate / 30);
    }
    return true;
  }
}

registerProcessor('browser-amp-noise-gate', BrowserAmpNoiseGateProcessor);
