import type { ReverbProfile } from '../signalChain/settings';
import { reverbParameters, type ReverbParameters } from '../signalChain/reverbProfiles';

const IMPULSE_DURATION_SECONDS = 1.5;
const IMPULSE_GAIN = 0.22;
const LOW_PASS_MEMORY = 0.72;

// Adjustable, original voices. Only the selected impulse is generated, and live DSP
// stays in a native convolver. These are not captured spaces or hardware models.
const IMPULSE_FACTORIES = {
  'jazz-room': (context, parameters) => createRoomImpulse(context, false, parameters),
  'studio-chamber': (context, parameters) => createRoomImpulse(context, true, parameters),
  'studio-plate': createPlateImpulse,
  'fender-spring': (context, parameters) => createSpringImpulse(context, true, parameters),
  'polytone-spring': (context, parameters) => createSpringImpulse(context, false, parameters),
  'digital-room': (context, parameters) => createDigitalImpulse(context, false, parameters),
  'digital-hall': (context, parameters) => createDigitalImpulse(context, true, parameters),
} satisfies Record<ReverbProfile, (context: BaseAudioContext, parameters: ReverbParameters) => AudioBuffer>;

export function createReverbImpulse(
  context: BaseAudioContext,
  profile: ReverbProfile,
  parameters: ReverbParameters = reverbParameters(profile),
): AudioBuffer {
  let impulse = IMPULSE_FACTORIES[profile](context, parameters);
  if (profile === 'studio-chamber' && parameters.preDelayMs > 0) {
    const offset = Math.round(parameters.preDelayMs / 1000 * context.sampleRate);
    const delayed = context.createBuffer(2, impulse.length + offset, context.sampleRate);
    for (let channel = 0; channel < 2; channel += 1) delayed.getChannelData(channel).set(impulse.getChannelData(channel), offset);
    impulse = delayed;
  }
  if (parameters.toneDb !== 0) {
    const memory = Math.exp(-2 * Math.PI * 3_200 / context.sampleRate);
    const gain = 10 ** (parameters.toneDb / 20);
    for (let channel = 0; channel < 2; channel += 1) {
      const samples = impulse.getChannelData(channel);
      let low = 0;
      for (let index = 0; index < samples.length; index += 1) {
        low = memory * low + (1 - memory) * samples[index];
        samples[index] = low + (samples[index] - low) * gain;
      }
    }
  }
  return impulse;
}

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
function createPlateImpulse(context: BaseAudioContext, parameters: ReverbParameters): AudioBuffer {
  const length = Math.round(context.sampleRate * (parameters.decaySeconds + Math.max(0, parameters.preDelayMs / 1000 - 0.012)));
  const impulse = context.createBuffer(2, length, context.sampleRate);
  const preDelaySamples = Math.round(context.sampleRate * parameters.preDelayMs / 1000);

  for (let channel = 0; channel < impulse.numberOfChannels; channel += 1) {
    const samples = impulse.getChannelData(channel);
    const noise = randomNoise(0x504c4154 + channel * 0x1021);
    let filtered = 0;

    for (let index = 0; index < samples.length; index += 1) {
      if (index < preDelaySamples) {
        samples[index] = 0;
        continue;
      }
      const progress = (index - preDelaySamples) / Math.max(1, samples.length - preDelaySamples - 1);
      const damping = 2 ** ((50 - parameters.damping) / 25)
        * (1 - 0.8 * Math.max(0, parameters.damping - 50) / 50 * progress);
      const memory = LOW_PASS_MEMORY ** damping;
      filtered = memory * filtered + (1 - memory) * noise();
      const envelope = (1 - progress) ** 2.2;
      samples[index] = filtered * envelope * IMPULSE_GAIN * Math.sqrt(IMPULSE_DURATION_SECONDS / parameters.decaySeconds);
    }
  }

  return impulse;
}

/** Match the original plate's approximate broadband energy, not perceived loudness. */
function createSyntheticImpulse(
  context: BaseAudioContext,
  duration: number,
  render: (samples: Float32Array, channel: number, sampleRate: number) => void,
  lowCutHz = 90,
): AudioBuffer {
  const impulse = context.createBuffer(2, Math.round(context.sampleRate * duration), context.sampleRate);
  for (let channel = 0; channel < 2; channel += 1) {
    const samples = impulse.getChannelData(channel);
    render(samples, channel, context.sampleRate);
    // A gentle DC cut and terminal fade avoid low-frequency buildup and an
    // abrupt cutoff of the finite response. Plate remains byte-for-byte intact.
    const memory = Math.exp(-2 * Math.PI * lowCutHz / context.sampleRate);
    let previous = 0;
    let highpass = 0;
    let energy = 0;
    for (let index = 0; index < samples.length; index += 1) {
      highpass = memory * (highpass + samples[index] - previous);
      previous = samples[index];
      samples[index] = highpass * Math.min(1, (samples.length - 1 - index) / (context.sampleRate * 0.02));
      energy += samples[index] ** 2;
    }
    const gain = energy > 0 ? Math.sqrt(32 * (context.sampleRate / 48_000) / energy) : 0;
    for (let index = 0; index < samples.length; index += 1) samples[index] *= gain;
  }
  return impulse;
}

function createRoomImpulse(context: BaseAudioContext, chamber: boolean, parameters: ReverbParameters): AudioBuffer {
  const duration = parameters.decaySeconds;
  const size = 0.5 + parameters.size / 100;
  const earlyGain = 2 * (1 - parameters.earlyLate / 100);
  const lateGain = 2 * parameters.earlyLate / 100;
  const reflections = chamber ? [0.009, 0.016, 0.027, 0.043, 0.061] : [0.005, 0.011, 0.019, 0.029];
  return createSyntheticImpulse(context, duration, (samples, channel, sampleRate) => {
    const noise = randomNoise((chamber ? 0x4348414d : 0x524f4f4d) + channel * 0x1021);
    const densityNoise = randomNoise(0x44494646 + channel);
    const density = Math.min(1, 0.02 + 0.98 * (parameters.diffusion / 70) ** 2);
    const onset = (chamber ? 0.022 : 0.018) * size;
    let filtered = 0;
    for (let index = Math.round(onset * sampleRate); index < samples.length; index += 1) {
      const time = index / sampleRate - onset;
      const memory = Math.exp(-2 * Math.PI * (chamber ? 2_800 : 1_800) / (sampleRate * (1 + 4 * time)));
      const value = noise();
      filtered = memory * filtered + (1 - memory) * (densityNoise() < 2 * density - 1 ? value / Math.sqrt(density) : 0);
      const attack = Math.min(1, time / (0.025 * 70 / Math.max(10, parameters.diffusion)));
      samples[index] = filtered * attack * Math.exp(-6.9 * time / duration) * 0.18 * lateGain;
    }
    reflections.forEach((time, reflection) => {
      const start = Math.round((time + channel * (reflection + 1) * 0.0007) * size * sampleRate);
      const width = Math.round(sampleRate * 0.0015);
      for (let index = 0; index < width && start + index < samples.length; index += 1) {
        samples[start + index] += (reflection % 2 === 0 ? 1 : -1) * 0.45 ** (reflection / 2)
          * Math.exp(-index / (sampleRate * 0.00025)) * earlyGain;
      }
    });
  }, parameters.lowCutHz);
}

/** Dispersive chirp echoes give the springs a different structure from a noise tail. */
function createSpringImpulse(context: BaseAudioContext, bright: boolean, parameters: ReverbParameters): AudioBuffer {
  const duration = parameters.decaySeconds;
  return createSyntheticImpulse(context, duration, (samples, channel, sampleRate) => {
    const roundTrips = bright ? [0.037, 0.043, 0.053] : [0.031, 0.039, 0.047];
    roundTrips.forEach((roundTrip, spring) => {
      const travel = roundTrip + channel * 0.0004 * (spring + 1);
      for (let echo = 0; ; echo += 1) {
        const onset = 0.009 + spring * 0.002 + echo * travel;
        if (onset >= duration) break;
        const start = Math.round(onset * sampleRate);
        const width = Math.round((0.055 + spring * 0.008) * sampleRate);
        const amplitude = Math.exp(-6.9 * onset / duration) / (1 + spring * 0.3);
        for (let index = 0; index < width && start + index < samples.length; index += 1) {
          const time = index / sampleRate;
          const dispersion = 0.006 + spring * 0.002 + echo * 0.0001;
          const sweep = (bright ? 4_200 : 2_100) / (1 + echo * 0.04);
          const phase = 2 * Math.PI * ((bright ? 520 : 340) * time
            + sweep * dispersion * (1 - Math.exp(-time / dispersion)));
          const envelope = Math.sin(Math.PI * index / width) ** 2 * Math.exp(-time * 65);
          samples[start + index] += Math.sin(phase) * envelope * amplitude;
        }
      }
    });
  }, parameters.lowCutHz);
}

/** Render a fixed Schroeder-style network once; no idle delay graph or worklet. */
function createDigitalImpulse(context: BaseAudioContext, hall: boolean, parameters: ReverbParameters): AudioBuffer {
  const decay = parameters.decaySeconds;
  const duration = decay * (hall ? 3.4 / 2.8 : 1.1 / 0.85) + Math.max(0, parameters.preDelayMs / 1000 - (hall ? 0.028 : 0.008));
  const predelay = parameters.preDelayMs / 1000;
  return createSyntheticImpulse(context, duration, (samples, channel, sampleRate) => {
    const size = (hall ? 1.45 : 0.75) * (0.5 + parameters.size / 100);
    const delays = [0.0297, 0.0371, 0.0411, 0.0437];
    for (const [comb, seconds] of delays.entries()) {
      const delay = Math.round((seconds * size + channel * 0.0007 * (comb + 1)) * sampleRate);
      const line = new Float32Array(delay);
      const feedback = 10 ** (-3 * delay / sampleRate / decay);
      const damping = Math.exp(-2 * Math.PI * (hall ? 3_800 : 5_200) * 2 ** ((50 - parameters.damping) / 25) / sampleRate);
      let filtered = 0;
      for (let index = 0; index < samples.length; index += 1) {
        const position = index % delay;
        const delayed = line[position];
        filtered = damping * filtered + (1 - damping) * delayed;
        line[position] = (index === 0 ? 1 : 0) + filtered * feedback;
        samples[index] += delayed / delays.length;
      }
    }
    const diffusion = parameters.diffusion / 100 * (0.6 / 0.7);
    for (const seconds of [0.005, 0.0017, 0.0006]) {
      const delay = Math.max(1, Math.round((seconds * size + channel * 0.00013) * sampleRate));
      const line = new Float32Array(delay);
      for (let index = 0; index < samples.length; index += 1) {
        const position = index % delay;
        const input = samples[index];
        const output = line[position] - diffusion * input;
        line[position] = input + diffusion * output;
        samples[index] = output;
      }
    }
    const offset = Math.round(predelay * sampleRate);
    samples.copyWithin(offset, 0, samples.length - offset);
    samples.fill(0, 0, offset);
  });
}
