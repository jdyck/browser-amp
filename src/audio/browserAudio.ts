export interface BrowserAudio {
  readonly mediaDevices: MediaDevices;
  readonly createAudioContext: () => AudioContext;
  readonly createAudioWorkletNode: (context: BaseAudioContext, name: string, options?: AudioWorkletNodeOptions) => AudioWorkletNode;
  readonly requestAnimationFrame: (callback: FrameRequestCallback) => number;
  readonly cancelAnimationFrame: (handle: number) => void;
}

export function browserAudio(): BrowserAudio {
  return {
    mediaDevices: navigator.mediaDevices,
    createAudioContext: () => new AudioContext(),
    createAudioWorkletNode: (context, name, options) => new AudioWorkletNode(context, name, options),
    requestAnimationFrame: requestAnimationFrame.bind(window),
    cancelAnimationFrame: cancelAnimationFrame.bind(window),
  };
}
