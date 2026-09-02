import { DEFAULT_REVERB_SETTINGS } from '../signalChain/reverbProfiles';
import { describe, expect, it, vi } from 'vitest';
import { AudioEngine } from './AudioEngine';
import type { BrowserAudio } from './browserAudio';
import { DEFAULT_AMP_CONTROLS, REVERB_PROFILES, type ReverbProfile } from '../signalChain/settings';

function audioNode(properties: Record<string, unknown> = {}): AudioNode {
  return { connect: vi.fn(), disconnect: vi.fn(), ...properties } as unknown as AudioNode;
}

function audioContext(overrides: Record<string, unknown> = {}): AudioContext {
  return Object.assign(new EventTarget(), {
    currentTime: 1,
    sampleRate: 48_000,
    destination: audioNode(),
    state: 'running',
    audioWorklet: { addModule: vi.fn().mockResolvedValue(undefined) },
    createMediaStreamSource: vi.fn(() => audioNode()),
    createChannelSplitter: vi.fn(() => audioNode()),
    createChannelMerger: vi.fn(() => audioNode()),
    createDelay: vi.fn(() => audioNode({ delayTime: { value: 0 } })),
    createOscillator: vi.fn(() => audioNode({ frequency: { value: 0 }, start: vi.fn(), stop: vi.fn() })),
    createAnalyser: vi.fn(() => audioNode({ fftSize: 2048, getFloatTimeDomainData: vi.fn() })),
    createGain: vi.fn(() => audioNode({ gain: { value: 1, cancelScheduledValues: vi.fn(), setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() } })),
    createBiquadFilter: vi.fn(() => audioNode({
      type: 'peaking',
      frequency: { value: 0, cancelScheduledValues: vi.fn(), setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() },
      Q: { value: 0 },
      gain: { value: 0, cancelScheduledValues: vi.fn(), setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() },
    })),
    createWaveShaper: vi.fn(() => audioNode({ curve: null, oversample: 'none' })),
    createConstantSource: vi.fn(() => audioNode({ offset: { value: 1 }, start: vi.fn(), stop: vi.fn(), onended: null })),
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
    createAudioWorkletNode: vi.fn(() => audioNode({
      port: { onmessage: null, postMessage: vi.fn() },
    }) as AudioWorkletNode),
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

  it('detects before the amp, applies the worklet after Cabinet, meters reduction, and disposes it', async () => {
    const context = audioContext();
    const port = {
      onmessage: null as ((event: MessageEvent) => void) | null,
      postMessage: vi.fn(),
    };
    const worklet = audioNode({ port }) as AudioWorkletNode;
    const createAudioWorkletNode = vi.fn(() => worklet);
    const engine = new AudioEngine(browser({ createAudioContext: () => context, createAudioWorkletNode }));

    await engine.connectInput();

    expect(context.audioWorklet.addModule).toHaveBeenCalledOnce();
    expect(createAudioWorkletNode).toHaveBeenCalledWith(context, 'browser-amp-noise-gate', expect.objectContaining({
      numberOfInputs: 2,
      numberOfOutputs: 1,
      processorOptions: { thresholdDb: -55, rangeDb: 9, releaseSeconds: 0.2, bypassed: false },
    }));
    const gains = vi.mocked(context.createGain).mock.results.map(({ value }) => value);
    const signalInput = gains.find((gain) => vi.mocked(gain.connect).mock.calls.some((call: [AudioNode, number?, number?]) => call[0] === worklet && call[2] === 0));
    const detectorInput = gains.find((gain) => vi.mocked(gain.connect).mock.calls.some((call: [AudioNode, number?, number?]) => call[0] === worklet && call[2] === 1));
    expect(signalInput).toBeDefined();
    expect(detectorInput).toBeDefined();
    const inputAnalyser = vi.mocked(context.createAnalyser).mock.results[0].value;
    const inputTrim = vi.mocked(inputAnalyser.connect).mock.calls[0][0] as AudioNode;
    expect(inputTrim.connect).toHaveBeenCalledWith(detectorInput);
    expect(gains.some((gain) => vi.mocked(gain.connect).mock.calls.some((call: [AudioNode, number?, number?]) => call[0] === signalInput))).toBe(true);
    expect(worklet.connect).toHaveBeenCalledTimes(2);

    port.onmessage?.(new MessageEvent('message', { data: { open: false, envelopeDb: -70, reductionDb: 8.5 } }));
    expect(engine.snapshot.noiseGateReductionDb).toBe(8.5);
    engine.applyControls({ ...engine.snapshot.controls, noiseGateThresholdDb: -45.2, noiseGateBypassed: true });
    expect(port.postMessage).toHaveBeenLastCalledWith({
      thresholdDb: -45.2,
      rangeDb: 9,
      releaseSeconds: 0.2,
      bypassed: true,
    });
    expect(engine.snapshot.noiseGateReductionDb).toBe(0);

    await engine.disconnectInput();
    expect(port.onmessage).toBeNull();
    expect(worklet.disconnect).toHaveBeenCalledOnce();
  });

  it('keeps at most two amp paths live and disposes unselected shapers without recapturing', async () => {
    let now = 0;
    const context = audioContext();
    Object.defineProperty(context, 'currentTime', { get: () => now });
    const environment = browser({ createAudioContext: () => context });
    const engine = new AudioEngine(environment);
    const finish = () => {
      const clock = vi.mocked(context.createConstantSource).mock.results.at(-1)!.value;
      now = vi.mocked(clock.stop).mock.calls[0][0]!;
      clock.onended?.call(clock, new Event('ended'));
    };
    await engine.connectInput();
    expect(context.createWaveShaper).not.toHaveBeenCalled();
    expect(context.createConvolver).not.toHaveBeenCalled();
    engine.applyControls({ ...engine.snapshot.controls, ampModel: 'amp.blackface-combo-v1' });
    engine.applyControls({ ...engine.snapshot.controls, ampModel: 'amp.small-tweed-combo-v1' });
    expect(context.createWaveShaper).toHaveBeenCalledTimes(2);
    finish();
    expect(context.createWaveShaper).toHaveBeenCalledTimes(4);
    finish();
    const shapers = vi.mocked(context.createWaveShaper).mock.results.map(({ value }) => value);
    for (const shaper of shapers.slice(0, 2)) expect(shaper.disconnect).toHaveBeenCalledOnce();
    for (const shaper of shapers.slice(2)) expect(shaper.disconnect).not.toHaveBeenCalled();
    engine.applyControls({ ...engine.snapshot.controls, ampModel: 'amp.studio-clean-v1' });
    finish();
    for (const shaper of shapers) expect(shaper.disconnect).toHaveBeenCalledOnce();
    expect(environment.mediaDevices.getUserMedia).toHaveBeenCalledOnce();
    expect(engine.snapshot.monitoring).toBe(false);
    await engine.disconnectInput();
  });

  it('creates reverb only when enabled, caches its impulse, and never revives retired tails', async () => {
    let now = 0;
    const context = audioContext();
    Object.defineProperty(context, 'currentTime', { get: () => now });
    const engine = new AudioEngine(browser({ createAudioContext: () => context }));
    const finish = () => {
      const clock = vi.mocked(context.createConstantSource).mock.results.at(-1)!.value;
      now = vi.mocked(clock.stop).mock.calls[0][0]!;
      clock.onended?.call(clock, new Event('ended'));
    };
    await engine.connectInput();
    engine.applyControls({ ...engine.snapshot.controls, reverbAmount: 80 });
    expect(context.createConvolver).not.toHaveBeenCalled();
    expect(context.createBuffer).not.toHaveBeenCalled();
    engine.applyControls({ ...engine.snapshot.controls, reverbBypassed: false });
    finish();
    const first = vi.mocked(context.createConvolver).mock.results[0].value;
    const impulse = first.buffer;
    engine.applyControls({ ...engine.snapshot.controls, reverbBypassed: true });
    engine.applyControls({ ...engine.snapshot.controls, reverbBypassed: false });
    expect(context.createConvolver).toHaveBeenCalledOnce();
    finish();
    expect(first.disconnect).toHaveBeenCalled();
    expect(first.buffer).toBeNull();
    expect(context.createConvolver).toHaveBeenCalledTimes(2);
    expect(vi.mocked(context.createConvolver).mock.results[1].value.buffer).toBe(impulse);
    expect(context.createBuffer).toHaveBeenCalledOnce();
    expect(engine.snapshot.controls.reverbAmount).toBe(80);
    finish();
    engine.applyControls({ ...engine.snapshot.controls, reverbBypassed: true });
    finish();
    expect(context.createConvolver).toHaveBeenCalledTimes(2);
    for (const { value } of vi.mocked(context.createConvolver).mock.results) expect(value.buffer).toBeNull();
    engine.applyControls({ ...engine.snapshot.controls, reverbBypassed: false });
    // Disconnect during a pending fade cancels its clock and both live paths.
    const clocks = vi.mocked(context.createConstantSource).mock.results.map(({ value }) => value);
    await engine.disconnectInput();
    for (const clock of clocks) expect(clock.onended).toBeNull();
    for (const { value } of vi.mocked(context.createConvolver).mock.results) {
      expect(value.buffer).toBeNull();
      expect(value.disconnect).toHaveBeenCalled();
    }
    expect(context.close).toHaveBeenCalledOnce();
  });

  it('switches every reverb module lazily with bounded overlap, cached data, and fresh history', async () => {
    let now = 0;
    const context = audioContext();
    Object.defineProperty(context, 'currentTime', { get: () => now });
    const environment = browser({ createAudioContext: () => context });
    const engine = new AudioEngine(environment);
    const finish = () => {
      const clock = vi.mocked(context.createConstantSource).mock.results.at(-1)!.value;
      now = vi.mocked(clock.stop).mock.calls[0][0]!;
      clock.onended?.call(clock, new Event('ended'));
    };
    const convolvers = () => vi.mocked(context.createConvolver).mock.results.map(({ value }) => value);
    const live = () => convolvers().filter((convolver) => convolver.buffer !== null);
    const profiles = Object.keys(REVERB_PROFILES) as ReverbProfile[];
    engine.applyControls({ ...engine.snapshot.controls, reverbProfile: 'digital-hall' });
    await engine.connectInput();
    for (const reverbProfile of profiles) engine.applyControls({ ...engine.snapshot.controls, reverbProfile });
    expect(context.createBuffer).not.toHaveBeenCalled();
    expect(context.createConvolver).not.toHaveBeenCalled();

    engine.applyControls({ ...engine.snapshot.controls, reverbBypassed: false, reverbAmount: 63 });
    finish();
    await engine.setMonitoring(true);
    const buffers = new Map<ReverbProfile, AudioBuffer>();
    buffers.set('digital-hall', live()[0].buffer!);
    for (const reverbProfile of profiles) {
      const previous = live()[0];
      engine.applyControls({ ...engine.snapshot.controls, reverbProfile });
      expect(live()).toHaveLength(2);
      finish();
      expect(previous.buffer).toBeNull();
      expect(previous.disconnect).toHaveBeenCalled();
      expect(live()).toHaveLength(1);
      const current = live()[0];
      expect(current.normalize).toBe(false);
      if (buffers.has(reverbProfile)) expect(current.buffer).toBe(buffers.get(reverbProfile));
      else buffers.set(reverbProfile, current.buffer!);
      engine.applyControls({ ...engine.snapshot.controls, reverbAmount: 64 });
      expect(live()).toEqual([current]);
    }
    expect(context.createBuffer).toHaveBeenCalledTimes(7);
    expect(new Set(buffers.values()).size).toBe(7);

    // Only the latest queued choice is built; returning to the outgoing model
    // must never revive its history, even when its impulse data is cached.
    const outgoing = live()[0];
    engine.applyControls({ ...engine.snapshot.controls, reverbProfile: 'jazz-room' });
    engine.applyControls({ ...engine.snapshot.controls, reverbProfile: 'studio-chamber' });
    engine.applyControls({ ...engine.snapshot.controls, reverbProfile: 'digital-hall' });
    expect(live()).toHaveLength(2);
    finish();
    expect(outgoing.buffer).toBeNull();
    expect(live()).toHaveLength(2);
    finish();
    expect(live()).toHaveLength(1);
    expect(live()[0]).not.toBe(outgoing);
    expect(live()[0].buffer).toBe(buffers.get('digital-hall'));
    expect(context.createBuffer).toHaveBeenCalledTimes(7);
    expect(environment.mediaDevices.getUserMedia).toHaveBeenCalledOnce();
    expect(engine.snapshot.monitoring).toBe(true);
    expect(engine.snapshot.controls.reverbAmount).toBe(64);

    engine.applyControls({ ...engine.snapshot.controls, reverbProfile: 'bright-spring' });
    engine.applyControls({ ...engine.snapshot.controls, reverbProfile: 'dark-spring' });
    await engine.disconnectInput();
    expect(live()).toHaveLength(0);
    for (const { value } of vi.mocked(context.createConstantSource).mock.results) expect(value.onended).toBeNull();
    await engine.connectInput();
    expect(live()).toHaveLength(1);
    expect(live()[0].buffer).not.toBe(buffers.get('dark-spring'));
    expect(engine.snapshot.controls.reverbProfile).toBe('dark-spring');
    expect(engine.snapshot.monitoring).toBe(false);
    await engine.disconnectInput();
  });

  it('coalesces parameter edits, reuses impulses for live effects, and disposes modulation and drive', async () => {
    let now = 0;
    const context = audioContext();
    Object.defineProperty(context, 'currentTime', { get: () => now });
    const engine = new AudioEngine(browser({ createAudioContext: () => context }));
    const finish = () => {
      const clock = vi.mocked(context.createConstantSource).mock.results.at(-1)!.value;
      now = vi.mocked(clock.stop).mock.calls[0][0]!;
      clock.onended?.call(clock, new Event('ended'));
    };
    const changeHall = (values: Partial<typeof DEFAULT_REVERB_SETTINGS['digital-hall']>) => engine.applyControls({
      ...engine.snapshot.controls,
      reverbSettings: { ...engine.snapshot.controls.reverbSettings,
        'digital-hall': { ...engine.snapshot.controls.reverbSettings['digital-hall'], ...values },
      },
    });
    engine.applyControls({ ...engine.snapshot.controls, reverbProfile: 'digital-hall' });
    await engine.connectInput();
    changeHall({ modulationDepth: 60 });
    expect(context.createBuffer).not.toHaveBeenCalled();
    expect(context.createOscillator).not.toHaveBeenCalled();
    engine.applyControls({ ...engine.snapshot.controls, reverbBypassed: false });
    finish();
    const oscillator = vi.mocked(context.createOscillator).mock.results[0].value;
    expect(oscillator.start).toHaveBeenCalledOnce();
    expect(context.createDelay).toHaveBeenCalledTimes(2);
    const impulse = vi.mocked(context.createConvolver).mock.results[0].value.buffer;
    changeHall({ modulationRateHz: 0.7 });
    finish();
    expect(context.createBuffer).toHaveBeenCalledOnce();
    expect(vi.mocked(context.createConvolver).mock.results.at(-1)!.value.buffer).toBe(impulse);
    expect(oscillator.stop).toHaveBeenCalledOnce();
    expect(oscillator.disconnect).toHaveBeenCalled();
    changeHall({ decaySeconds: 1 });
    changeHall({ decaySeconds: 2 });
    changeHall({ decaySeconds: 3 });
    expect(context.createBuffer).toHaveBeenCalledTimes(2);
    finish();
    expect(context.createBuffer).toHaveBeenCalledTimes(3);
    finish();
    expect(vi.mocked(context.createConvolver).mock.results.filter(({ value }) => value.buffer !== null)).toHaveLength(1);
    changeHall({ modulationDepth: 0 });
    finish();
    for (const { value } of vi.mocked(context.createOscillator).mock.results) expect(value.stop).toHaveBeenCalledOnce();
    engine.applyControls({ ...engine.snapshot.controls, reverbProfile: 'bright-spring', reverbSettings: {
      ...engine.snapshot.controls.reverbSettings,
      'bright-spring': { ...DEFAULT_REVERB_SETTINGS['bright-spring'], dwell: 90 },
    } });
    finish();
    const shaper = vi.mocked(context.createWaveShaper).mock.results[0].value;
    expect(shaper.curve).not.toBeNull();
    expect(shaper.oversample).toBe('4x');
    await engine.disconnectInput();
    expect(shaper.curve).toBeNull();
    expect(shaper.disconnect).toHaveBeenCalled();
    for (const { value } of vi.mocked(context.createDelay).mock.results) expect(value.disconnect).toHaveBeenCalled();
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

  it('routes both compression paths through Studio EQ before Reverb', async () => {
    const context = audioContext();
    const engine = new AudioEngine(browser({ createAudioContext: () => context }));

    await engine.connectInput();

    const [lowShelfEq, lowMidEq, upperMidEq, highShelfEq] = vi.mocked(context.createBiquadFilter).mock.results.map(({ value }) => value);
    const compressor = vi.mocked(context.createDynamicsCompressor).mock.results[0].value;
    const levelMatchGain = vi.mocked(compressor.connect).mock.calls[0][0] as unknown as GainNode;
    const compressionWetGain = vi.mocked(levelMatchGain.connect).mock.calls[0][0] as unknown as GainNode;
    const eqInputs = vi.mocked(context.createGain).mock.results
      .map(({ value }) => value)
      .filter((gain) => vi.mocked(gain.connect).mock.calls.some((call: [AudioNode]) => call[0] === lowShelfEq));

    expect(eqInputs).toHaveLength(2);
    expect(eqInputs).toContain(compressionWetGain);
    expect(compressor.connect).toHaveBeenCalledWith(levelMatchGain);
    expect(lowShelfEq.connect).toHaveBeenCalledWith(lowMidEq);
    expect(lowMidEq.connect).toHaveBeenCalledWith(upperMidEq);
    expect(upperMidEq.connect).toHaveBeenCalledWith(highShelfEq);
    expect(highShelfEq.connect).toHaveBeenCalledOnce();
    expect(highShelfEq.connect).not.toHaveBeenCalledWith(compressor);
  });

  it('reports gain reduction only while Compression is active and smooths Level Match changes', async () => {
    let renderFrame: FrameRequestCallback | undefined;
    const compressor = audioNode({
      reduction: -6.25,
      threshold: { value: -24, cancelScheduledValues: vi.fn(), setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() },
      ratio: { value: 12, cancelScheduledValues: vi.fn(), setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() },
      attack: { value: 0.003, cancelScheduledValues: vi.fn(), setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() },
      release: { value: 0.25, cancelScheduledValues: vi.fn(), setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() },
      knee: { value: 30, cancelScheduledValues: vi.fn(), setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() },
    }) as DynamicsCompressorNode;
    const context = audioContext({ createDynamicsCompressor: vi.fn(() => compressor) });
    const engine = new AudioEngine(browser({
      createAudioContext: () => context,
      requestAnimationFrame: (callback) => { renderFrame = callback; return 1; },
    }));
    engine.applyControls({ ...engine.snapshot.controls, compressionBypassed: false });

    await engine.connectInput();
    renderFrame?.(1_000);

    expect(engine.snapshot.compressionReductionDb).toBe(6.25);
    const levelMatchGain = vi.mocked(compressor.connect).mock.calls[0][0] as unknown as GainNode;
    engine.applyControls({ ...engine.snapshot.controls, compressionLevelMatch: false });
    expect(levelMatchGain.gain.linearRampToValueAtTime).toHaveBeenCalledWith(1, 1.02);

    engine.applyControls({ ...engine.snapshot.controls, compressionBypassed: true });
    expect(engine.snapshot.compressionReductionDb).toBe(0);
  });

  it('clamps model-specific and studio controls while monitoring stops', async () => {
    const engine = new AudioEngine(browser());
    expect(engine.snapshot.controls).toEqual(DEFAULT_AMP_CONTROLS);

    engine.applyControls({
      ...engine.snapshot.controls,
      ampModel: 'amp.small-tweed-combo-v1',
      ampSettings: {
        ...engine.snapshot.controls.ampSettings,
        'amp.small-tweed-combo-v1': { volume: 30, tone: 3.26, input: 'low' },
      },
      lowShelfDb: -20,
      lowMidFrequencyHz: 100,
      lowMidDb: -20,
      upperMidFrequencyHz: 3_000,
      upperMidDb: 3.26,
      highShelfDb: 20,
      eqBypassed: true,
      compressionAmount: 74.6,
      compressionBypassed: false,
      reverbProfile: 'jazz-room',
      reverbSettings: DEFAULT_REVERB_SETTINGS,
      reverbAmount: 101,
      reverbBypassed: false,
      masterVolumeDb: -12.26,
    });
    await engine.connectInput();
    await engine.setMonitoring(true);
    await engine.setMonitoring(false);

    expect(engine.snapshot.controls).toEqual({
      ...DEFAULT_AMP_CONTROLS,
      ampModel: 'amp.small-tweed-combo-v1',
      ampSettings: {
        ...DEFAULT_AMP_CONTROLS.ampSettings,
        'amp.small-tweed-combo-v1': { volume: 10, tone: 3.3, input: 'low' },
      },
      lowShelfDb: -12,
      lowMidFrequencyHz: 180,
      lowMidDb: -12,
      upperMidFrequencyHz: 2_000,
      upperMidDb: 3.3,
      highShelfDb: 12,
      eqBypassed: true,
      compressionAmount: 75,
      compressionBypassed: false,
      reverbProfile: 'jazz-room',
      reverbSettings: DEFAULT_REVERB_SETTINGS,
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
    engine.applyControls({ ...engine.snapshot.controls, lowShelfDb: 6, masterVolumeDb: -12 });
    await engine.connectInput();
    await engine.setMonitoring(true);

    await engine.selectOutput('missing-output');

    expect(engine.snapshot).toMatchObject({
      lifecycle: 'connected-muted',
      monitoring: false,
      controls: { lowShelfDb: 6, masterVolumeDb: -12 },
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
    engine.applyControls({ ...engine.snapshot.controls, lowShelfDb: 9, masterVolumeDb: -12 });
    await engine.connectInput({ deviceId: 'guitar-interface' });
    await engine.setMonitoring(true);

    activeCapture.track.dispatchEvent(new Event('ended'));

    expect(engine.snapshot).toMatchObject({
      lifecycle: 'error',
      monitoring: false,
      controls: { lowShelfDb: 9, masterVolumeDb: -12 },
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
      lifecycle: 'interrupted',
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
      lifecycle: 'interrupted',
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
    engine.applyControls({ ...engine.snapshot.controls, lowShelfDb: 6 });
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
      controls: { lowShelfDb: 6 },
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
    const context = audioContext();
    const engine = new AudioEngine(browser({ mediaDevices, createAudioContext: () => context }));
    await engine.connectInput({ deviceId: 'guitar-interface' });
    await engine.setMonitoring(true);

    Object.assign(context, { state: 'suspended' });
    context.dispatchEvent(new Event('statechange'));
    expect(engine.snapshot.lifecycle).toBe('interrupted');

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
