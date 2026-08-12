const IMPULSE_DURATION_SECONDS = 1.5;
const IMPULSE_GAIN = 0.22;
const LOW_PASS_MEMORY = 0.72;
const PRE_DELAY_SECONDS = 0.012;

function randomNoise(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296 * 2 - 1;
  };
}

/** Builds a calibrated, deterministic stereo tail for the native ConvolverNode. */
export function createPlateImpulse(context: BaseAudioContext): AudioBuffer {
  const length = Math.round(context.sampleRate * IMPULSE_DURATION_SECONDS);
  const impulse = context.createBuffer(2, length, context.sampleRate);
  const preDelaySamples = Math.round(context.sampleRate * PRE_DELAY_SECONDS);

  for (let channel = 0; channel < impulse.numberOfChannels; channel += 1) {
    const samples = impulse.getChannelData(channel);
    const noise = randomNoise(0x504c4154 + channel * 0x1021);
    let filtered = 0;

    for (let index = 0; index < samples.length; index += 1) {
      if (index < preDelaySamples) {
        samples[index] = 0;
        continue;
      }
      filtered = LOW_PASS_MEMORY * filtered + (1 - LOW_PASS_MEMORY) * noise();
      const progress = (index - preDelaySamples) / Math.max(1, samples.length - preDelaySamples - 1);
      const envelope = (1 - progress) ** 2.2;
      samples[index] = filtered * envelope * IMPULSE_GAIN;
    }
  }

  return impulse;
}
