import type { Page } from '@playwright/test';
import type { AmpControlSettings } from '../../src/audio/types';

interface RenderOptions {
  readonly frequency: number;
  readonly amplitude?: number;
  readonly controls?: Partial<AmpControlSettings>;
}

export async function renderAmp(page: Page, options: RenderOptions): Promise<number> {
  return page.evaluate(async ({ frequency, amplitude = 0.1, controls = {} }) => {
    const harnessPath = './tests/support/offlineAudioHarness.ts';
    const { connectOfflineEngine, rms } = await import(harnessPath) as typeof import('./offlineAudioHarness');
    const sampleRate = 48_000;
    const context = new OfflineAudioContext(1, sampleRate, sampleRate);
    const source = context.createOscillator();
    const inputGain = context.createGain();
    source.frequency.value = frequency;
    inputGain.gain.value = amplitude;
    source.connect(inputGain);
    await connectOfflineEngine(context, inputGain, controls);
    source.start();

    const rendered = await context.startRendering();
    const channel = rendered.getChannelData(0);
    return rms(channel, sampleRate, 0.75, 1) / amplitude;
  }, options);
}
