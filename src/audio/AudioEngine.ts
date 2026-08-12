import { browserAudio, type BrowserAudio } from './browserAudio';
import { dbToLinearGain, normalizeDb, smoothGainToDb, smoothGainToValue } from './gain';
import { meterReadingFromSamples, METER_FLOOR_DBFS, nextPeakHold, type PeakHold } from './meter';
import { DEFAULT_AMP_CONTROLS, type AmpControlSettings, type AudioEngine as AudioEngineContract, type AudioSnapshot, type InputDevice, type InputSettings, type OutputDevice } from './types';

const initialSettings: InputSettings = { selectedInputDeviceId: undefined, inputChannel: 0 };

function initialSnapshot(): AudioSnapshot {
  return {
    ...initialSettings,
    lifecycle: 'disconnected',
    monitoring: false,
    controls: DEFAULT_AMP_CONTROLS,
    outputRouting: { mode: 'pending', devices: [], selectedDeviceId: undefined, error: undefined },
    devices: [],
    inputChannelCount: 1,
    rawCaptureWarnings: [],
    meter: { dbfs: METER_FLOOR_DBFS, peakDbfs: METER_FLOOR_DBFS },
    outputMeter: { dbfs: METER_FLOOR_DBFS, peakDbfs: METER_FLOOR_DBFS },
    clipLatched: false,
    error: undefined,
  };
}

function userFacingError(error: unknown): string {
  if (error instanceof DOMException && error.name === 'NotAllowedError') return 'Microphone permission was not granted.';
  if (error instanceof DOMException && error.name === 'NotFoundError') return 'The selected input device is not available.';
  return 'Could not connect the selected input device.';
}

function rawCaptureWarnings(settings: MediaTrackSettings): string[] {
  const requested: ReadonlyArray<[keyof Pick<MediaTrackSettings, 'echoCancellation' | 'noiseSuppression' | 'autoGainControl'>, string]> = [
    ['echoCancellation', 'Echo cancellation'],
    ['noiseSuppression', 'Noise suppression'],
    ['autoGainControl', 'Automatic gain control'],
  ];
  return requested.flatMap(([key, label]) => settings[key] !== false ? [`${label} could not be confirmed disabled by this browser.`] : []);
}

/** Owns capture, the Clean Gain path, metering, output routing, and the explicit monitoring mute. */
export class AudioEngine implements AudioEngineContract {
  #environment: BrowserAudio;
  #snapshot = initialSnapshot();
  #listeners = new Set<(snapshot: AudioSnapshot) => void>();
  #context: AudioContext | undefined;
  #stream: MediaStream | undefined;
  #source: AudioNode | undefined;
  #splitter: ChannelSplitterNode | undefined;
  #inputAnalyser: AnalyserNode | undefined;
  #cleanGain: GainNode | undefined;
  #masterGain: GainNode | undefined;
  #outputAnalyser: AnalyserNode | undefined;
  #monitorGain: GainNode | undefined;
  #frame: number | undefined;
  #inputPeak: PeakHold = { dbfs: METER_FLOOR_DBFS, heldAt: 0 };
  #outputPeak: PeakHold = { dbfs: METER_FLOOR_DBFS, heldAt: 0 };

  public constructor(environment: BrowserAudio = browserAudio()) {
    this.#environment = environment;
    this.#environment.mediaDevices.addEventListener('devicechange', this.#refreshDevices);
  }

  public get snapshot(): AudioSnapshot {
    return this.#snapshot;
  }

  public subscribe(listener: (snapshot: AudioSnapshot) => void): () => void {
    this.#listeners.add(listener);
    listener(this.snapshot);
    return () => this.#listeners.delete(listener);
  }

  public async connectInput(command: { readonly deviceId?: string } = {}): Promise<void> {
    await this.#stopCapture();
    this.#update({
      lifecycle: 'connecting',
      monitoring: false,
      error: undefined,
      rawCaptureWarnings: [],
      meter: { dbfs: METER_FLOOR_DBFS, peakDbfs: METER_FLOOR_DBFS },
      outputMeter: { dbfs: METER_FLOOR_DBFS, peakDbfs: METER_FLOOR_DBFS },
      outputRouting: { mode: 'pending', devices: [], selectedDeviceId: undefined, error: undefined },
    });
    const audio: MediaTrackConstraints = {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
      channelCount: { ideal: 2 },
      ...(command.deviceId === undefined ? {} : { deviceId: { exact: command.deviceId } }),
    };

    try {
      const stream = await this.#environment.mediaDevices.getUserMedia({ audio });
      const track = stream.getAudioTracks()[0];
      if (track === undefined) throw new DOMException('No audio track', 'NotFoundError');
      const settings = track.getSettings();
      this.#stream = stream;
      this.#context = this.#environment.createAudioContext();
      this.#source = this.#context.createMediaStreamSource(stream);
      this.#inputAnalyser = this.#context.createAnalyser();
      this.#inputAnalyser.fftSize = 2048;
      this.#cleanGain = this.#context.createGain();
      this.#masterGain = this.#context.createGain();
      this.#outputAnalyser = this.#context.createAnalyser();
      this.#outputAnalyser.fftSize = 2048;
      this.#monitorGain = this.#context.createGain();
      this.#cleanGain.gain.value = dbToLinearGain(this.#snapshot.controls.cleanGainDb);
      this.#masterGain.gain.value = dbToLinearGain(this.#snapshot.controls.masterVolumeDb);
      this.#monitorGain.gain.value = 0;
      const channelCount = Math.max(1, settings.channelCount ?? 1);
      const selectedChannel = 0;
      if (channelCount > 1) {
        this.#splitter = this.#context.createChannelSplitter(channelCount);
        this.#source.connect(this.#splitter);
        this.#splitter.connect(this.#inputAnalyser, selectedChannel);
      } else {
        this.#source.connect(this.#inputAnalyser);
      }
      this.#inputAnalyser.connect(this.#cleanGain);
      this.#cleanGain.connect(this.#masterGain);
      this.#masterGain.connect(this.#outputAnalyser);
      this.#outputAnalyser.connect(this.#monitorGain);
      this.#monitorGain.connect(this.#context.destination);
      const { inputs: devices, outputs } = await this.#devices();
      const sinkContext = this.#sinkContext();
      const outputRouting = {
        mode: sinkContext === undefined ? 'system' as const : 'selectable' as const,
        devices: sinkContext === undefined ? [] : outputs,
        selectedDeviceId: undefined,
        error: undefined,
      };
      this.#update({
        lifecycle: 'connected-muted',
        devices,
        selectedInputDeviceId: settings.deviceId || command.deviceId,
        inputChannelCount: channelCount,
        inputChannel: selectedChannel,
        rawCaptureWarnings: rawCaptureWarnings(settings),
        outputRouting,
      });
      this.#scheduleMeter();
    } catch (error) {
      await this.#stopCapture();
      this.#update({ lifecycle: 'error', error: userFacingError(error), monitoring: false });
    }
  }

  public async disconnectInput(): Promise<void> {
    await this.#stopCapture();
    this.#update({
      ...initialSnapshot(),
      controls: this.#snapshot.controls,
      devices: this.#snapshot.devices,
      clipLatched: this.#snapshot.clipLatched,
    });
  }

  public async setMonitoring(enabled: boolean): Promise<void> {
    if (this.#snapshot.lifecycle !== 'connected-muted' && this.#snapshot.lifecycle !== 'monitoring') return;
    if (this.#context === undefined || this.#monitorGain === undefined) return;
    try {
      if (enabled) await this.#context.resume();
      smoothGainToValue(this.#monitorGain.gain, enabled ? 1 : 0, this.#context.currentTime);
      this.#update({ lifecycle: enabled ? 'monitoring' : 'connected-muted', monitoring: enabled, error: undefined });
    } catch {
      this.#monitorGain.gain.value = 0;
      this.#update({ lifecycle: 'connected-muted', monitoring: false, error: 'Processed Monitoring could not be started.' });
    }
  }

  public applyControls(settings: AmpControlSettings): void {
    const controls = {
      cleanGainDb: Number.isFinite(settings.cleanGainDb) ? normalizeDb(settings.cleanGainDb, -12, 24) : this.#snapshot.controls.cleanGainDb,
      masterVolumeDb: Number.isFinite(settings.masterVolumeDb) ? normalizeDb(settings.masterVolumeDb, -60, 0) : this.#snapshot.controls.masterVolumeDb,
    };
    if (this.#context !== undefined) {
      if (this.#cleanGain !== undefined) smoothGainToDb(this.#cleanGain.gain, controls.cleanGainDb, this.#context.currentTime);
      if (this.#masterGain !== undefined) smoothGainToDb(this.#masterGain.gain, controls.masterVolumeDb, this.#context.currentTime);
    }
    this.#update({ controls });
  }

  public clearClip(): void {
    this.#update({ clipLatched: false });
  }

  public async selectOutput(deviceId?: string): Promise<void> {
    const context = this.#sinkContext();
    if (context === undefined || this.#snapshot.outputRouting.mode !== 'selectable') return;
    try {
      await context.setSinkId(deviceId ?? '');
      this.#update({ outputRouting: { ...this.#snapshot.outputRouting, selectedDeviceId: deviceId, error: undefined } });
    } catch {
      await this.setMonitoring(false);
      this.#update({
        outputRouting: {
          ...this.#snapshot.outputRouting,
          error: 'The browser could not route audio to that output. Monitoring was muted.',
        },
      });
    }
  }

  public applySettings(settings: InputSettings): void {
    if (this.#snapshot.lifecycle !== 'connected-muted' && this.#snapshot.lifecycle !== 'monitoring') return;
    const channel = Math.min(Math.max(0, settings.inputChannel), this.#snapshot.inputChannelCount - 1);
    if (channel !== this.#snapshot.inputChannel && this.#splitter !== undefined && this.#inputAnalyser !== undefined) {
      this.#splitter.disconnect(this.#inputAnalyser);
      this.#splitter.connect(this.#inputAnalyser, channel);
    }
    this.#update({ ...settings, inputChannel: channel });
  }

  #refreshDevices = (): void => {
    void this.#devices().then(({ inputs: devices, outputs }) => this.#update({
      devices,
      outputRouting: { ...this.#snapshot.outputRouting, devices: this.#sinkContext() === undefined ? [] : outputs },
    }));
  };

  async #devices(): Promise<{ readonly inputs: readonly InputDevice[]; readonly outputs: readonly OutputDevice[] }> {
    const devices = await this.#environment.mediaDevices.enumerateDevices();
    return {
      inputs: devices.filter((device) => device.kind === 'audioinput').map((device) => ({ id: device.deviceId, label: device.label || 'Unnamed input device' })),
      outputs: devices.filter((device) => device.kind === 'audiooutput').map((device) => ({ id: device.deviceId, label: device.label || 'Unnamed output device' })),
    };
  }

  #sinkContext(): (AudioContext & { setSinkId(deviceId: string): Promise<void> }) | undefined {
    const context = this.#context as (AudioContext & { setSinkId?: (deviceId: string) => Promise<void> }) | undefined;
    return context !== undefined && typeof context.setSinkId === 'function'
      ? context as AudioContext & { setSinkId(deviceId: string): Promise<void> }
      : undefined;
  }

  #scheduleMeter(): void {
    this.#frame = this.#environment.requestAnimationFrame((now) => {
      if (this.#inputAnalyser === undefined || this.#outputAnalyser === undefined) return;
      if (this.#snapshot.lifecycle !== 'connected-muted' && this.#snapshot.lifecycle !== 'monitoring') return;
      const inputSamples = new Float32Array(this.#inputAnalyser.fftSize);
      const outputSamples = new Float32Array(this.#outputAnalyser.fftSize);
      this.#inputAnalyser.getFloatTimeDomainData(inputSamples);
      this.#outputAnalyser.getFloatTimeDomainData(outputSamples);
      const input = meterReadingFromSamples(inputSamples);
      const output = meterReadingFromSamples(outputSamples);
      this.#inputPeak = nextPeakHold(this.#inputPeak, input.dbfs, now);
      this.#outputPeak = nextPeakHold(this.#outputPeak, output.dbfs, now);
      this.#update({
        meter: { dbfs: input.dbfs, peakDbfs: this.#inputPeak.dbfs },
        outputMeter: { dbfs: output.dbfs, peakDbfs: this.#outputPeak.dbfs },
        clipLatched: this.#snapshot.clipLatched || output.clipped,
      });
      this.#scheduleMeter();
    });
  }

  async #stopCapture(): Promise<void> {
    if (this.#frame !== undefined) this.#environment.cancelAnimationFrame(this.#frame);
    this.#frame = undefined;
    this.#source?.disconnect();
    this.#splitter?.disconnect();
    this.#inputAnalyser?.disconnect();
    this.#cleanGain?.disconnect();
    this.#masterGain?.disconnect();
    this.#outputAnalyser?.disconnect();
    this.#monitorGain?.disconnect();
    this.#stream?.getTracks().forEach((track) => track.stop());
    if (this.#context !== undefined) await this.#context.close();
    this.#context = undefined;
    this.#stream = undefined;
    this.#source = undefined;
    this.#splitter = undefined;
    this.#inputAnalyser = undefined;
    this.#cleanGain = undefined;
    this.#masterGain = undefined;
    this.#outputAnalyser = undefined;
    this.#monitorGain = undefined;
    this.#inputPeak = { dbfs: METER_FLOOR_DBFS, heldAt: 0 };
    this.#outputPeak = { dbfs: METER_FLOOR_DBFS, heldAt: 0 };
  }

  #update(change: Partial<AudioSnapshot>): void {
    this.#snapshot = { ...this.#snapshot, ...change };
    this.#listeners.forEach((listener) => listener(this.snapshot));
  }
}
