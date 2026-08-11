export interface BrowserAudio {
  readonly mediaDevices: MediaDevices;
  readonly createAudioContext: () => AudioContext;
  readonly requestAnimationFrame: (callback: FrameRequestCallback) => number;
  readonly cancelAnimationFrame: (handle: number) => void;
}

export function browserAudio(): BrowserAudio {
  return {
    mediaDevices: navigator.mediaDevices,
    createAudioContext: () => new AudioContext(),
    requestAnimationFrame: requestAnimationFrame.bind(window),
    cancelAnimationFrame: cancelAnimationFrame.bind(window),
  };
}
