import { browserAudio, type BrowserAudio } from './browserAudio';
import { dbfsFromSamples, METER_FLOOR_DBFS, nextPeakHold, type PeakHold } from './meter';
import type { AudioEngine as AudioEngineContract, AudioSnapshot, InputDevice, InputSettings } from './types';

const initialSettings: InputSettings = { selectedInputDeviceId: undefined, inputChannel: 0 };

function initialSnapshot(): AudioSnapshot {
  return {
    ...initialSettings,
    lifecycle: 'disconnected',
    monitoring: false,
    devices: [],
    inputChannelCount: 1,
    rawCaptureWarnings: [],
    meter: { dbfs: METER_FLOOR_DBFS, peakDbfs: METER_FLOOR_DBFS },
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

/** Owns browser capture and metering. It deliberately never routes to AudioContext.destination. */
export class AudioEngine implements AudioEngineContract {
  #environment: BrowserAudio;
  #snapshot = initialSnapshot();
  #listeners = new Set<(snapshot: AudioSnapshot) => void>();
  #context: AudioContext | undefined;
  #stream: MediaStream | undefined;
  #source: AudioNode | undefined;
  #splitter: ChannelSplitterNode | undefined;
  #analyser: AnalyserNode | undefined;
  #frame: number | undefined;
  #peak: PeakHold = { dbfs: METER_FLOOR_DBFS, heldAt: 0 };

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
    this.#update({ lifecycle: 'connecting', error: undefined, rawCaptureWarnings: [] });
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
      this.#analyser = this.#context.createAnalyser();
      this.#analyser.fftSize = 2048;
      const channelCount = Math.max(1, settings.channelCount ?? 1);
      const selectedChannel = 0;
      if (channelCount > 1) {
        this.#splitter = this.#context.createChannelSplitter(channelCount);
        this.#source.connect(this.#splitter);
        this.#splitter.connect(this.#analyser, selectedChannel);
      } else {
        this.#source.connect(this.#analyser);
      }
      const devices = await this.#devices();
      this.#update({
        lifecycle: 'connected-muted',
        devices,
        selectedInputDeviceId: settings.deviceId || command.deviceId,
        inputChannelCount: channelCount,
        inputChannel: selectedChannel,
        rawCaptureWarnings: rawCaptureWarnings(settings),
      });
      this.#scheduleMeter();
    } catch (error) {
      await this.#stopCapture();
      this.#update({ lifecycle: 'error', error: userFacingError(error), monitoring: false });
    }
  }

  public async disconnectInput(): Promise<void> {
    await this.#stopCapture();
    this.#update({ ...initialSnapshot(), devices: this.#snapshot.devices });
  }

  public applySettings(settings: InputSettings): void {
    if (this.#snapshot.lifecycle !== 'connected-muted') return;
    const channel = Math.min(Math.max(0, settings.inputChannel), this.#snapshot.inputChannelCount - 1);
    if (channel !== this.#snapshot.inputChannel && this.#splitter !== undefined && this.#analyser !== undefined) {
      this.#splitter.disconnect(this.#analyser);
      this.#splitter.connect(this.#analyser, channel);
    }
    this.#update({ ...settings, inputChannel: channel });
  }

  #refreshDevices = (): void => {
    void this.#devices().then((devices) => this.#update({ devices }));
  };

  async #devices(): Promise<readonly InputDevice[]> {
    const devices = await this.#environment.mediaDevices.enumerateDevices();
    return devices.filter((device) => device.kind === 'audioinput').map((device) => ({ id: device.deviceId, label: device.label || 'Unnamed input device' }));
  }

  #scheduleMeter(): void {
    this.#frame = this.#environment.requestAnimationFrame(() => {
      if (this.#analyser === undefined || this.#snapshot.lifecycle !== 'connected-muted') return;
      const samples = new Float32Array(this.#analyser.fftSize);
      this.#analyser.getFloatTimeDomainData(samples);
      const now = performance.now();
      const dbfs = dbfsFromSamples(samples);
      this.#peak = nextPeakHold(this.#peak, dbfs, now);
      this.#update({ meter: { dbfs, peakDbfs: this.#peak.dbfs } });
      this.#scheduleMeter();
    });
  }

  async #stopCapture(): Promise<void> {
    if (this.#frame !== undefined) this.#environment.cancelAnimationFrame(this.#frame);
    this.#frame = undefined;
    this.#source?.disconnect();
    this.#splitter?.disconnect();
    this.#analyser?.disconnect();
    this.#stream?.getTracks().forEach((track) => track.stop());
    if (this.#context !== undefined) await this.#context.close();
    this.#context = undefined;
    this.#stream = undefined;
    this.#source = undefined;
    this.#splitter = undefined;
    this.#analyser = undefined;
    this.#peak = { dbfs: METER_FLOOR_DBFS, heldAt: 0 };
  }

  #update(change: Partial<AudioSnapshot>): void {
    this.#snapshot = { ...this.#snapshot, ...change };
    this.#listeners.forEach((listener) => listener(this.snapshot));
  }
}
