import { describe, expect, it, vi } from 'vitest';
import { AudioEngine } from './AudioEngine';
import type { BrowserAudio } from './browserAudio';

function browser(overrides: Partial<BrowserAudio> = {}): BrowserAudio {
  const track = {
    getSettings: () => ({ channelCount: 2, deviceId: 'guitar-interface', echoCancellation: false, noiseSuppression: false, autoGainControl: false }),
    stop: vi.fn(),
  } as unknown as MediaStreamTrack;
  const stream = { getAudioTracks: () => [track] } as unknown as MediaStream;

  return {
    mediaDevices: {
      getUserMedia: vi.fn().mockResolvedValue(stream),
      enumerateDevices: vi.fn().mockResolvedValue([
        { deviceId: 'guitar-interface', kind: 'audioinput', label: 'Guitar interface' },
      ]),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as MediaDevices,
    createAudioContext: vi.fn(() => ({
      createMediaStreamSource: vi.fn(() => ({ connect: vi.fn(), disconnect: vi.fn() })),
      createChannelSplitter: vi.fn(() => ({ connect: vi.fn(), disconnect: vi.fn() })),
      createAnalyser: vi.fn(() => ({ fftSize: 2048, getFloatTimeDomainData: vi.fn() })),
      close: vi.fn(),
    })) as unknown as BrowserAudio['createAudioContext'],
    requestAnimationFrame: vi.fn(() => 1),
    cancelAnimationFrame: vi.fn(),
    ...overrides,
  };
}

describe('AudioEngine', () => {
  it('starts disconnected and never connects its input graph to output', () => {
    const environment = browser();
    const engine = new AudioEngine(environment);

    expect(engine.snapshot.lifecycle).toBe('disconnected');
    expect(engine.snapshot.monitoring).toBe(false);
    expect(environment.createAudioContext).not.toHaveBeenCalled();
  });

  it('requests raw capture, enumerates devices after permission, and exposes an input channel', async () => {
    const environment = browser();
    const engine = new AudioEngine(environment);

    await engine.connectInput();

    expect(environment.mediaDevices.getUserMedia).toHaveBeenCalledWith({
      audio: { autoGainControl: false, channelCount: { ideal: 2 }, echoCancellation: false, noiseSuppression: false },
    });
    expect(environment.mediaDevices.enumerateDevices).toHaveBeenCalled();
    expect(engine.snapshot).toMatchObject({
      lifecycle: 'connected-muted',
      inputChannelCount: 2,
      selectedInputDeviceId: 'guitar-interface',
    });
  });

  it('uses an exact device id when the player explicitly selects an input', async () => {
    const environment = browser();
    const engine = new AudioEngine(environment);

    await engine.connectInput({ deviceId: 'guitar-interface' });

    expect(environment.mediaDevices.getUserMedia).toHaveBeenCalledWith({
      audio: {
        autoGainControl: false,
        channelCount: { ideal: 2 },
        deviceId: { exact: 'guitar-interface' },
        echoCancellation: false,
        noiseSuppression: false,
      },
    });
  });

  it('reports a permission failure and remains muted', async () => {
    const baseline = browser();
    const environment = browser({
      mediaDevices: { ...baseline.mediaDevices, getUserMedia: vi.fn().mockRejectedValue(new DOMException('Denied', 'NotAllowedError')) } as unknown as MediaDevices,
    });
    const engine = new AudioEngine(environment);

    await engine.connectInput();

    expect(engine.snapshot).toMatchObject({ lifecycle: 'error', monitoring: false, error: 'Microphone permission was not granted.' });
  });
});
