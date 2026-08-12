import { describe, expect, it, vi } from 'vitest';
import { AudioEngine } from './AudioEngine';
import type { BrowserAudio } from './browserAudio';

function audioNode(properties: Record<string, unknown> = {}): AudioNode {
  return { connect: vi.fn(), disconnect: vi.fn(), ...properties } as unknown as AudioNode;
}

function audioContext(overrides: Record<string, unknown> = {}): AudioContext {
  return Object.assign(new EventTarget(), {
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
  }) as unknown as AudioContext;
}

function capture(trackSettings: MediaTrackSettings = {}): { readonly stream: MediaStream; readonly track: MediaStreamTrack } {
  const track = Object.assign(new EventTarget(), {
    getSettings: () => ({ channelCount: 2, deviceId: 'guitar-interface', echoCancellation: false, noiseSuppression: false, autoGainControl: false, ...trackSettings }),
    stop: vi.fn(),
  }) as unknown as MediaStreamTrack;
  const stream = { getAudioTracks: () => [track], getTracks: () => [track] } as unknown as MediaStream;
  return { stream, track };
}

function testMediaDevices(overrides: Record<string, unknown> = {}): MediaDevices {
  const { stream } = capture();
  return Object.assign(new EventTarget(), {
    getUserMedia: vi.fn().mockResolvedValue(stream),
    enumerateDevices: vi.fn().mockResolvedValue([
      { deviceId: 'guitar-interface', kind: 'audioinput', label: 'Guitar interface' },
      { deviceId: 'headphones', kind: 'audiooutput', label: 'Studio headphones' },
    ]),
    ...overrides,
  }) as unknown as MediaDevices;
}

function browser(overrides: Partial<BrowserAudio> = {}, trackSettings: MediaTrackSettings = {}): BrowserAudio {
  const { stream } = capture(trackSettings);

  return {
    mediaDevices: testMediaDevices({
      getUserMedia: vi.fn().mockResolvedValue(stream),
    }),
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
      outputRouting: {
        selectedDeviceId: 'missing-output',
        error: 'The browser could not route audio to that output. Choose an available output, then enable monitoring again.',
      },
      recovery: { code: 'output-routing-failed', action: 'choose-output' },
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

  it('rejects a capture that does not match the exact input selection', async () => {
    const environment = browser({}, { deviceId: 'built-in' });
    const engine = new AudioEngine(environment);

    await engine.connectInput({ deviceId: 'guitar-interface' });

    expect(environment.mediaDevices.getUserMedia).toHaveBeenCalledTimes(1);
    expect(engine.snapshot).toMatchObject({
      lifecycle: 'error',
      monitoring: false,
      selectedInputDeviceId: 'guitar-interface',
      recovery: { code: 'input-selection-failed', action: 'reconnect-input' },
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

    expect(engine.snapshot.rawCaptureWarnings).toEqual([
      'Noise suppression could not be confirmed disabled. Check browser or system input settings before monitoring.',
    ]);
  });

  it('reports a permission failure and remains muted', async () => {
    const baseline = browser();
    const environment = browser({
      mediaDevices: testMediaDevices({
        enumerateDevices: baseline.mediaDevices.enumerateDevices,
        getUserMedia: vi.fn().mockRejectedValue(new DOMException('Denied', 'NotAllowedError')),
      }),
    });
    const engine = new AudioEngine(environment);

    await engine.connectInput();

    expect(engine.snapshot).toMatchObject({
      lifecycle: 'error',
      monitoring: false,
      recovery: { code: 'permission-denied', action: 'reconnect-input' },
    });
  });

  it('distinguishes a missing input from an unavailable exact selection', async () => {
    const noInputDevices = testMediaDevices({
      getUserMedia: vi.fn().mockRejectedValue(new DOMException('No inputs', 'NotFoundError')),
      enumerateDevices: vi.fn().mockResolvedValue([]),
    });
    const missingInputEngine = new AudioEngine(browser({ mediaDevices: noInputDevices }));

    await missingInputEngine.connectInput();

    expect(missingInputEngine.snapshot).toMatchObject({
      lifecycle: 'error',
      monitoring: false,
      recovery: { code: 'no-input-devices', action: 'reconnect-input' },
    });

    const exactSelection = testMediaDevices({
      getUserMedia: vi.fn().mockRejectedValue(new DOMException('Gone', 'NotFoundError')),
      enumerateDevices: vi.fn().mockResolvedValue([
        { deviceId: 'built-in', kind: 'audioinput', label: 'Built-in microphone' },
      ]),
    });
    const exactSelectionEngine = new AudioEngine(browser({ mediaDevices: exactSelection }));

    await exactSelectionEngine.connectInput({ deviceId: 'guitar-interface' });

    expect(exactSelection.getUserMedia).toHaveBeenCalledTimes(1);
    expect(exactSelectionEngine.snapshot).toMatchObject({
      lifecycle: 'error',
      monitoring: false,
      selectedInputDeviceId: 'guitar-interface',
      devices: [{ id: 'built-in', label: 'Built-in microphone' }],
      recovery: { code: 'input-selection-failed', action: 'reconnect-input' },
    });
  });

  it('silences Processed Monitoring when the active input is lost and waits for an explicit reconnect', async () => {
    const activeCapture = capture();
    const replacementCapture = capture();
    const getUserMedia = vi.fn()
      .mockResolvedValueOnce(activeCapture.stream)
      .mockResolvedValueOnce(replacementCapture.stream);
    const environment = browser({
      mediaDevices: testMediaDevices({ getUserMedia }),
    });
    const engine = new AudioEngine(environment);
    engine.applyControls({ ...engine.snapshot.controls, cleanGainDb: 9, masterVolumeDb: -12 });
    await engine.connectInput({ deviceId: 'guitar-interface' });
    await engine.setMonitoring(true);

    activeCapture.track.dispatchEvent(new Event('ended'));

    expect(engine.snapshot).toMatchObject({
      lifecycle: 'error',
      monitoring: false,
      controls: { cleanGainDb: 9, masterVolumeDb: -12 },
      recovery: {
        code: 'input-device-lost',
        action: 'reconnect-input',
      },
    });
    expect(getUserMedia).toHaveBeenCalledTimes(1);

    await engine.connectInput({ deviceId: 'guitar-interface' });
    expect(getUserMedia).toHaveBeenCalledTimes(2);
    expect(engine.snapshot).toMatchObject({ lifecycle: 'connected-muted', monitoring: false, recovery: undefined });
  });

  it('preserves a valid input channel and output route across explicit input reconnection', async () => {
    const activeCapture = capture({ channelCount: 2 });
    const replacementCapture = capture({ channelCount: 2 });
    const getUserMedia = vi.fn()
      .mockResolvedValueOnce(activeCapture.stream)
      .mockResolvedValueOnce(replacementCapture.stream);
    const setSinkId = vi.fn().mockResolvedValue(undefined);
    const engine = new AudioEngine(browser({
      mediaDevices: testMediaDevices({ getUserMedia }),
      createAudioContext: () => audioContext({ setSinkId }),
    }));
    await engine.connectInput({ deviceId: 'guitar-interface' });
    engine.applySettings({ selectedInputDeviceId: 'guitar-interface', inputChannel: 1 });
    await engine.selectOutput('headphones');
    await engine.setMonitoring(true);

    activeCapture.track.dispatchEvent(new Event('ended'));
    await engine.connectInput({ deviceId: 'guitar-interface' });

    expect(setSinkId).toHaveBeenNthCalledWith(1, 'headphones');
    expect(setSinkId).toHaveBeenNthCalledWith(2, 'headphones');
    expect(engine.snapshot).toMatchObject({
      lifecycle: 'connected-muted',
      monitoring: false,
      inputChannel: 1,
      outputRouting: { selectedDeviceId: 'headphones', error: undefined },
      recovery: undefined,
    });
  });

  it('silences a suspended AudioContext and only resumes after a player action', async () => {
    const context = audioContext();
    const resume = vi.mocked(context.resume).mockImplementation(async () => {
      Object.assign(context, { state: 'running' });
    });
    const engine = new AudioEngine(browser({ createAudioContext: () => context }));
    await engine.connectInput();
    await engine.setMonitoring(true);
    expect(resume).toHaveBeenCalledTimes(1);

    Object.assign(context, { state: 'suspended' });
    context.dispatchEvent(new Event('statechange'));

    expect(engine.snapshot).toMatchObject({
      lifecycle: 'connected-muted',
      monitoring: false,
      recovery: {
        code: 'audio-context-suspended',
        action: 'resume-monitoring',
      },
    });
    expect(resume).toHaveBeenCalledTimes(1);

    await engine.setMonitoring(true);
    expect(resume).toHaveBeenCalledTimes(2);
    expect(engine.snapshot).toMatchObject({ lifecycle: 'monitoring', monitoring: true, recovery: undefined });
  });

  it('surfaces AudioContext suspension while connected and already muted', async () => {
    const context = audioContext();
    const engine = new AudioEngine(browser({ createAudioContext: () => context }));
    await engine.connectInput();

    Object.assign(context, { state: 'suspended' });
    context.dispatchEvent(new Event('statechange'));

    expect(engine.snapshot).toMatchObject({
      lifecycle: 'connected-muted',
      monitoring: false,
      recovery: { code: 'audio-context-suspended', action: 'resume-monitoring' },
    });
  });

  it('refreshes device capabilities without changing a valid active route', async () => {
    let devices: MediaDeviceInfo[] = [
      { deviceId: 'guitar-interface', kind: 'audioinput', label: 'Guitar interface' } as MediaDeviceInfo,
      { deviceId: 'headphones', kind: 'audiooutput', label: 'Studio headphones' } as MediaDeviceInfo,
    ];
    const mediaDevices = testMediaDevices({ enumerateDevices: vi.fn(async () => devices) });
    const setSinkId = vi.fn().mockResolvedValue(undefined);
    const engine = new AudioEngine(browser({
      mediaDevices,
      createAudioContext: () => audioContext({ setSinkId }),
    }));
    engine.applyControls({ ...engine.snapshot.controls, cleanGainDb: 6 });
    await engine.connectInput({ deviceId: 'guitar-interface' });
    engine.applySettings({ selectedInputDeviceId: 'guitar-interface', inputChannel: 1 });
    await engine.selectOutput('headphones');
    await engine.setMonitoring(true);

    devices = [
      ...devices,
      { deviceId: 'usb-cable', kind: 'audioinput', label: 'USB cable' } as MediaDeviceInfo,
      { deviceId: 'speakers', kind: 'audiooutput', label: 'Studio speakers' } as MediaDeviceInfo,
    ];
    mediaDevices.dispatchEvent(new Event('devicechange'));

    await vi.waitFor(() => expect(engine.snapshot.devices).toHaveLength(2));
    expect(engine.snapshot).toMatchObject({
      lifecycle: 'monitoring',
      monitoring: true,
      selectedInputDeviceId: 'guitar-interface',
      inputChannel: 1,
      controls: { cleanGainDb: 6 },
      outputRouting: { selectedDeviceId: 'headphones' },
    });
    expect(engine.snapshot.outputRouting.devices).toHaveLength(2);
  });

  it('mutes an invalid active output route and preserves it for explicit recovery', async () => {
    let devices: MediaDeviceInfo[] = [
      { deviceId: 'guitar-interface', kind: 'audioinput', label: 'Guitar interface' } as MediaDeviceInfo,
      { deviceId: 'headphones', kind: 'audiooutput', label: 'Studio headphones' } as MediaDeviceInfo,
    ];
    const mediaDevices = testMediaDevices({ enumerateDevices: vi.fn(async () => devices) });
    const engine = new AudioEngine(browser({
      mediaDevices,
      createAudioContext: () => audioContext({ setSinkId: vi.fn().mockResolvedValue(undefined) }),
    }));
    engine.applyControls({ ...engine.snapshot.controls, masterVolumeDb: -9 });
    await engine.connectInput({ deviceId: 'guitar-interface' });
    await engine.selectOutput('headphones');
    await engine.setMonitoring(true);

    devices = devices.filter((device) => device.deviceId !== 'headphones');
    mediaDevices.dispatchEvent(new Event('devicechange'));

    await vi.waitFor(() => expect(engine.snapshot.monitoring).toBe(false));
    expect(engine.snapshot).toMatchObject({
      lifecycle: 'connected-muted',
      controls: { masterVolumeDb: -9 },
      outputRouting: { selectedDeviceId: 'headphones' },
      recovery: { code: 'output-device-lost', action: 'choose-output' },
    });
  });

  it('does not fall back after unplug and replug of the active input', async () => {
    let devices: MediaDeviceInfo[] = [
      { deviceId: 'guitar-interface', kind: 'audioinput', label: 'Guitar interface' } as MediaDeviceInfo,
      { deviceId: 'headphones', kind: 'audiooutput', label: 'Studio headphones' } as MediaDeviceInfo,
    ];
    const mediaDevices = testMediaDevices({ enumerateDevices: vi.fn(async () => devices) });
    const engine = new AudioEngine(browser({ mediaDevices }));
    await engine.connectInput({ deviceId: 'guitar-interface' });
    await engine.setMonitoring(true);

    devices = devices.filter((device) => device.deviceId !== 'guitar-interface');
    mediaDevices.dispatchEvent(new Event('devicechange'));

    await vi.waitFor(() => expect(engine.snapshot.lifecycle).toBe('error'));
    expect(engine.snapshot).toMatchObject({
      monitoring: false,
      selectedInputDeviceId: 'guitar-interface',
      recovery: { code: 'input-device-lost', action: 'reconnect-input' },
    });
    expect(mediaDevices.getUserMedia).toHaveBeenCalledTimes(1);

    devices = [
      { deviceId: 'guitar-interface', kind: 'audioinput', label: 'Guitar interface' } as MediaDeviceInfo,
      ...devices,
    ];
    mediaDevices.dispatchEvent(new Event('devicechange'));

    await vi.waitFor(() => expect(engine.snapshot.devices).toContainEqual({ id: 'guitar-interface', label: 'Guitar interface' }));
    expect(engine.snapshot).toMatchObject({ lifecycle: 'error', monitoring: false });
    expect(mediaDevices.getUserMedia).toHaveBeenCalledTimes(1);

    await engine.connectInput({ deviceId: 'guitar-interface' });
    expect(mediaDevices.getUserMedia).toHaveBeenCalledTimes(2);
    expect(engine.snapshot).toMatchObject({ lifecycle: 'connected-muted', monitoring: false });
  });
});
