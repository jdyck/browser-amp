import { AudioEngine } from '../../src/audio/AudioEngine';
import type { AmpControlSettings } from '../../src/audio/types';

export async function connectOfflineEngine(
  context: OfflineAudioContext,
  input: AudioNode,
  controls: Partial<AmpControlSettings> = {},
): Promise<AudioEngine> {
  Object.defineProperty(context, 'createMediaStreamSource', { value: () => input });
  Object.defineProperty(context, 'resume', { value: async () => undefined });
  Object.defineProperty(context, 'state', { value: 'running', configurable: true });

  const track = Object.assign(new EventTarget(), {
    getSettings: () => ({ channelCount: 1, echoCancellation: false, noiseSuppression: false, autoGainControl: false }),
    stop: () => undefined,
  });
  const stream = { getAudioTracks: () => [track], getTracks: () => [track] };
  const engine = new AudioEngine({
    mediaDevices: {
      getUserMedia: async () => stream,
      enumerateDevices: async () => [],
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    } as unknown as MediaDevices,
    createAudioContext: () => context as unknown as AudioContext,
    createAudioWorkletNode: (workletContext, name, options) => new AudioWorkletNode(workletContext, name, options),
    requestAnimationFrame: () => 1,
    cancelAnimationFrame: () => undefined,
  });
  // Most callers measure one downstream module in isolation. Keep the test
  // harness full-range and disable level-dependent suppression unless either
  // stage is explicitly part of the scenario.
  engine.applyControls({
    ...engine.snapshot.controls,
    cabinetModel: 'cab.direct-full-range-v1',
    noiseGateBypassed: true,
    ...controls,
  });
  await engine.connectInput();
  await engine.setMonitoring(true);
  return engine;
}

export function rms(samples: Float32Array, sampleRate: number, startSeconds: number, endSeconds: number): number {
  const start = Math.floor(startSeconds * sampleRate);
  const end = Math.floor(endSeconds * sampleRate);
  let squared = 0;
  for (let index = start; index < end; index += 1) squared += samples[index] ** 2;
  return Math.sqrt(squared / (end - start));
}

export function peak(samples: Float32Array, sampleRate: number, startSeconds: number, endSeconds: number): number {
  let maximum = 0;
  for (let index = Math.floor(startSeconds * sampleRate); index < Math.floor(endSeconds * sampleRate); index += 1) {
    maximum = Math.max(maximum, Math.abs(samples[index]));
  }
  return maximum;
}

export function stereoDifference(
  left: Float32Array,
  right: Float32Array,
  sampleRate: number,
  startSeconds: number,
  endSeconds: number,
): number {
  const start = Math.floor(startSeconds * sampleRate);
  const end = Math.floor(endSeconds * sampleRate);
  let squared = 0;
  for (let index = start; index < end; index += 1) squared += (left[index] - right[index]) ** 2;
  return Math.sqrt(squared / (end - start));
}

export function maximumSampleStep(
  samples: Float32Array,
  sampleRate: number,
  startSeconds: number,
  endSeconds: number,
): number {
  let maximum = 0;
  for (let index = Math.floor(startSeconds * sampleRate); index < Math.floor(endSeconds * sampleRate); index += 1) {
    maximum = Math.max(maximum, Math.abs(samples[index] - samples[index - 1]));
  }
  return maximum;
}
