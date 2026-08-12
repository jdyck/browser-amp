import { describe, expect, it, vi } from 'vitest';
import { AudioEngine } from './AudioEngine';
import type { BrowserAudio } from './browserAudio';

function audioNode(properties: Record<string, unknown> = {}): AudioNode {
  return { connect: vi.fn(), disconnect: vi.fn(), ...properties } as unknown as AudioNode;
}

function audioContext(overrides: Record<string, unknown> = {}): AudioContext {
  return {
    currentTime: 1,
    sampleRate: 48_000,
    destination: audioNode(),
    state: 'running',
    createMediaStreamSource: vi.fn(() => audioNode()),
    createChannelSplitter: vi.fn(() => audioNode()),
    createAnalyser: vi.fn(() => audioNode({ fftSize: 2048, getFloatTimeDomainData: vi.fn() })),
    createGain: vi.fn(() => audioNode({ gain: { value: 1, cancelScheduledValues: vi.fn(), setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() } })),
    createBiquadFilter: vi.fn(() => audioNode({
      type: 'peaking',
      frequency: { value: 0 },
      Q: { value: 0 },
      gain: { value: 0, cancelScheduledValues: vi.fn(), setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() },
    })),
    createDynamicsCompressor: vi.fn(() => audioNode({
      threshold: { value: -24, cancelScheduledValues: vi.fn(), setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() },
      ratio: { value: 12, cancelScheduledValues: vi.fn(), setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() },
      attack: { value: 0.003, cancelScheduledValues: vi.fn(), setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() },
      release: { value: 0.25, cancelScheduledValues: vi.fn(), setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() },
      knee: { value: 30, cancelScheduledValues: vi.fn(), setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() },
    })),
    createBuffer: vi.fn((channels: number, length: number, sampleRate: number) => {
      const data = Array.from({ length: channels }, () => new Float32Array(length));
      return {
        duration: length / sampleRate,
        length,
        numberOfChannels: channels,
        sampleRate,
        getChannelData: (channel: number) => data[channel],
      };
    }),
    createConvolver: vi.fn(() => audioNode({ buffer: null, normalize: true })),
    resume: vi.fn(),
    close: vi.fn(),
    ...overrides,
  } as unknown as AudioContext;
}

function browser(overrides: Partial<BrowserAudio> = {}, trackSettings: MediaTrackSettings = {}): BrowserAudio {
  const track = {
    getSettings: () => ({ channelCount: 2, deviceId: 'guitar-interface', echoCancellation: false, noiseSuppression: false, autoGainControl: false, ...trackSettings }),
    stop: vi.fn(),
  } as unknown as MediaStreamTrack;
  const stream = { getAudioTracks: () => [track], getTracks: () => [track] } as unknown as MediaStream;

  return {
    mediaDevices: {
      getUserMedia: vi.fn().mockResolvedValue(stream),
      enumerateDevices: vi.fn().mockResolvedValue([
        { deviceId: 'guitar-interface', kind: 'audioinput', label: 'Guitar interface' },
        { deviceId: 'headphones', kind: 'audiooutput', label: 'Studio headphones' },
      ]),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as MediaDevices,
    createAudioContext: vi.fn(() => audioContext()),
    requestAnimationFrame: vi.fn(() => 1),
    cancelAnimationFrame: vi.fn(),
    ...overrides,
  };
}

describe('AudioEngine', () => {
  it('starts disconnected and muted without creating an audio graph', () => {
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

  it('keeps a connected input silent until the player explicitly enables Processed Monitoring', async () => {
    const engine = new AudioEngine(browser());

    await engine.connectInput();
    expect(engine.snapshot).toMatchObject({ lifecycle: 'connected-muted', monitoring: false });

    await engine.setMonitoring(true);
    expect(engine.snapshot).toMatchObject({ lifecycle: 'monitoring', monitoring: true });

    await engine.setMonitoring(false);
    expect(engine.snapshot).toMatchObject({ lifecycle: 'connected-muted', monitoring: false });
  });

  it('clamps exact controls and preserves settings when monitoring stops', async () => {
    const engine = new AudioEngine(browser());
    expect(engine.snapshot.controls).toEqual({
      cleanGainDb: 0,
      bassDb: 0,
      middleDb: 0,
      trebleDb: 0,
      compressionAmount: 25,
      compressionBypassed: true,
      reverbAmount: 20,
      reverbBypassed: true,
      masterVolumeDb: -18,
    });

    engine.applyControls({
      cleanGainDb: 30,
      bassDb: -20,
      middleDb: 3.26,
      trebleDb: 20,
      compressionAmount: 74.6,
      compressionBypassed: false,
      reverbAmount: 101,
      reverbBypassed: false,
      masterVolumeDb: -12.26,
    });
    await engine.connectInput();
    await engine.setMonitoring(true);
    await engine.setMonitoring(false);

    expect(engine.snapshot.controls).toEqual({
      cleanGainDb: 24,
      bassDb: -12,
      middleDb: 3.3,
      trebleDb: 12,
      compressionAmount: 75,
      compressionBypassed: false,
      reverbAmount: 100,
      reverbBypassed: false,
      masterVolumeDb: -12.3,
    });
  });

  it('routes to a permitted browser-visible output when the AudioContext supports selection', async () => {
    const setSinkId = vi.fn().mockResolvedValue(undefined);
    const engine = new AudioEngine(browser({ createAudioContext: () => audioContext({ setSinkId }) }));

    await engine.connectInput();
    expect(engine.snapshot.outputRouting).toMatchObject({
      mode: 'selectable',
      devices: [{ id: 'headphones', label: 'Studio headphones' }],
    });

    await engine.selectOutput('headphones');
    expect(setSinkId).toHaveBeenCalledWith('headphones');
    expect(engine.snapshot.outputRouting.selectedDeviceId).toBe('headphones');
  });

  it('honestly identifies system routing when output selection is unavailable', async () => {
    const engine = new AudioEngine(browser());

    await engine.connectInput();

    expect(engine.snapshot.outputRouting).toMatchObject({ mode: 'system', devices: [] });
  });

  it('mutes a routing failure without changing Master Volume', async () => {
    const setSinkId = vi.fn().mockRejectedValue(new DOMException('Unavailable', 'NotFoundError'));
    const engine = new AudioEngine(browser({ createAudioContext: () => audioContext({ setSinkId }) }));
    engine.applyControls({ ...engine.snapshot.controls, cleanGainDb: 6, masterVolumeDb: -12 });
    await engine.connectInput();
    await engine.setMonitoring(true);

    await engine.selectOutput('missing-output');

    expect(engine.snapshot).toMatchObject({
      lifecycle: 'connected-muted',
      monitoring: false,
      controls: { cleanGainDb: 6, masterVolumeDb: -12 },
      outputRouting: { error: 'The browser could not route audio to that output. Monitoring was muted.' },
    });
  });

  it('latches a post-Master full-scale output until the player explicitly clears CLIP', async () => {
    let renderFrame: FrameRequestCallback | undefined;
    const inputAnalyser = audioNode({
      fftSize: 4,
      getFloatTimeDomainData: vi.fn((samples: Float32Array) => samples.fill(0.25)),
    });
    const outputAnalyser = audioNode({
      fftSize: 4,
      getFloatTimeDomainData: vi.fn((samples: Float32Array) => samples.set([0.5, -1, 0.2, 0])),
    });
    const context = audioContext({
      createAnalyser: vi.fn()
        .mockReturnValueOnce(inputAnalyser)
        .mockReturnValueOnce(outputAnalyser),
    });
    const engine = new AudioEngine(browser({
      createAudioContext: () => context,
      requestAnimationFrame: (callback) => { renderFrame = callback; return 1; },
    }));

    await engine.connectInput();
    renderFrame?.(1_000);

    expect(engine.snapshot.outputMeter.dbfs).toBe(0);
    expect(engine.snapshot.clipLatched).toBe(true);

    engine.clearClip();
    expect(engine.snapshot.clipLatched).toBe(false);
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

  it('keeps mono input mono and hides the input-channel capability', async () => {
    const environment = browser({}, { channelCount: 1 });
    const engine = new AudioEngine(environment);

    await engine.connectInput();

    expect(engine.snapshot).toMatchObject({ inputChannelCount: 1, inputChannel: 0 });
  });

  it('warns when the browser cannot confirm raw capture settings', async () => {
    const environment = browser({}, { noiseSuppression: undefined });
    const engine = new AudioEngine(environment);

    await engine.connectInput();

    expect(engine.snapshot.rawCaptureWarnings).toEqual(['Noise suppression could not be confirmed disabled by this browser.']);
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
