import { browserAudio, type BrowserAudio } from './browserAudio';
import { DEFAULT_AMP_CONTROLS, normalizeAmpControlSettings, normalizePercentAmount } from '../controls';
import { dbToLinearGain, GAIN_SMOOTHING_SECONDS, smoothGainToDb, smoothGainToValue } from './gain';
import { meterReadingFromSamples, METER_FLOOR_DBFS, nextPeakHold, type PeakHold } from './meter';
import { createPlateImpulse } from './reverb';
import type { AmpControlSettings, AudioEngine as AudioEngineContract, AudioRecoverySnapshot, AudioSnapshot, InputDevice, InputSettings, OutputDevice } from './types';

const initialSettings: InputSettings = { selectedInputDeviceId: undefined, inputChannel: 0 };
// Bound full-scale Amount to a strong but usable wet return (about -20 dB).
const REVERB_MAX_WET_GAIN = 0.0975;

interface ReverbPath {
  readonly convolver: ConvolverNode;
  readonly wetGain: GainNode;
}

interface RetiredReverbPath extends ReverbPath {
  readonly timer: ReturnType<typeof setTimeout>;
}

export interface CompressionSettings {
  readonly thresholdDb: number;
  readonly ratio: number;
  readonly attackSeconds: number;
  readonly releaseSeconds: number;
  readonly kneeDb: number;
}

export function compressionSettings(amount: number): CompressionSettings {
  const normalizedAmount = normalizePercentAmount(amount);
  const proportion = normalizedAmount / 100;
  return {
    thresholdDb: normalizedAmount === 0 ? 0 : -36 * proportion,
    ratio: 1 + 5 * proportion,
    attackSeconds: 0.01,
    releaseSeconds: 0.15,
    kneeDb: 12,
  };
}

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
    recovery: undefined,
  };
}

const RECOVERIES = {
  permissionDenied: {
    code: 'permission-denied',
    action: 'reconnect-input',
    message: 'Microphone access is blocked. Allow access in browser settings, then choose Try Again.',
  },
  noInputDevices: {
    code: 'no-input-devices',
    action: 'reconnect-input',
    message: 'No audio input is available. Connect an audio interface or microphone, then choose Try Again.',
  },
  inputSelectionFailed: {
    code: 'input-selection-failed',
    action: 'reconnect-input',
    message: 'The selected input device is unavailable. Reconnect it or choose another input, then try again.',
  },
  inputConnectionFailed: {
    code: 'input-connection-failed',
    action: 'reconnect-input',
    message: 'The input connection failed. Check the device and browser audio settings, then choose Try Again.',
  },
  inputDeviceLost: {
    code: 'input-device-lost',
    action: 'reconnect-input',
    message: 'The active input device was disconnected. Reconnect it or choose another input, then reconnect explicitly.',
  },
  outputDeviceLost: {
    code: 'output-device-lost',
    action: 'choose-output',
    message: 'The selected output device was disconnected. Choose an available output, then enable monitoring again.',
  },
  outputRoutingFailed: {
    code: 'output-routing-failed',
    action: 'choose-output',
    message: 'The browser could not route audio to that output. Choose an available output, then enable monitoring again.',
  },
  audioContextSuspended: {
    code: 'audio-context-suspended',
    action: 'resume-monitoring',
    message: 'Audio was suspended by the browser. Return to this tab, then choose Resume Monitoring.',
  },
  audioContextResumeFailed: {
    code: 'audio-context-resume-failed',
    action: 'resume-monitoring',
    message: 'Audio was not resumed. Return to this tab, then choose Resume Monitoring.',
  },
} as const satisfies Record<string, AudioRecoverySnapshot>;

function connectionRecovery(error: unknown, exactDeviceRequested: boolean): AudioRecoverySnapshot {
  if (error instanceof DOMException && error.name === 'NotAllowedError') return RECOVERIES.permissionDenied;
  if (error instanceof DOMException && error.name === 'NotFoundError' && exactDeviceRequested) return RECOVERIES.inputSelectionFailed;
  if (error instanceof DOMException && error.name === 'NotFoundError') return RECOVERIES.noInputDevices;
  return RECOVERIES.inputConnectionFailed;
}

function rawCaptureWarnings(settings: MediaTrackSettings): string[] {
  const requested: ReadonlyArray<[keyof Pick<MediaTrackSettings, 'echoCancellation' | 'noiseSuppression' | 'autoGainControl'>, string]> = [
    ['echoCancellation', 'Echo cancellation'],
    ['noiseSuppression', 'Noise suppression'],
    ['autoGainControl', 'Automatic gain control'],
  ];
  return requested.flatMap(([key, label]) => settings[key] !== false
    ? [`${label} could not be confirmed disabled. Check browser or system input settings before monitoring.`]
    : []);
}

/** Owns capture, the native Amp Chain, metering, output routing, and the explicit monitoring mute. */
export class AudioEngine implements AudioEngineContract {
  #environment: BrowserAudio;
  #snapshot = initialSnapshot();
  #listeners = new Set<(snapshot: AudioSnapshot) => void>();
  #context: AudioContext | undefined;
  #stream: MediaStream | undefined;
  #track: MediaStreamTrack | undefined;
  #source: AudioNode | undefined;
  #splitter: ChannelSplitterNode | undefined;
  #inputAnalyser: AnalyserNode | undefined;
  #cleanGain: GainNode | undefined;
  #bassEq: BiquadFilterNode | undefined;
  #middleEq: BiquadFilterNode | undefined;
  #trebleEq: BiquadFilterNode | undefined;
  #compressor: DynamicsCompressorNode | undefined;
  #compressionDryGain: GainNode | undefined;
  #compressionWetGain: GainNode | undefined;
  #reverbInput: GainNode | undefined;
  #reverbDryGain: GainNode | undefined;
  #reverbPath: ReverbPath | undefined;
  #reverbInputConnected = false;
  #retiredReverbPaths = new Set<RetiredReverbPath>();
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
    const preservedInputChannel = this.#snapshot.inputChannel;
    const preservedOutputDeviceId = this.#snapshot.outputRouting.selectedDeviceId;
    await this.#stopCapture();
    this.#update({
      lifecycle: 'connecting',
      monitoring: false,
      error: undefined,
      recovery: undefined,
      selectedInputDeviceId: command.deviceId,
      rawCaptureWarnings: [],
      meter: { dbfs: METER_FLOOR_DBFS, peakDbfs: METER_FLOOR_DBFS },
      outputMeter: { dbfs: METER_FLOOR_DBFS, peakDbfs: METER_FLOOR_DBFS },
      outputRouting: { mode: 'pending', devices: [], selectedDeviceId: preservedOutputDeviceId, error: undefined },
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
      this.#track = track;
      if (command.deviceId !== undefined && settings.deviceId !== command.deviceId) {
        throw new DOMException('Exact input selection was not honored', 'NotFoundError');
      }
      track.addEventListener('ended', this.#handleInputEnded);
      this.#context = this.#environment.createAudioContext();
      this.#context.addEventListener('statechange', this.#handleContextStateChange);
      this.#source = this.#context.createMediaStreamSource(stream);
      this.#inputAnalyser = this.#context.createAnalyser();
      this.#inputAnalyser.fftSize = 2048;
      this.#cleanGain = this.#context.createGain();
      this.#bassEq = this.#context.createBiquadFilter();
      this.#middleEq = this.#context.createBiquadFilter();
      this.#trebleEq = this.#context.createBiquadFilter();
      this.#compressor = this.#context.createDynamicsCompressor();
      this.#compressionDryGain = this.#context.createGain();
      this.#compressionWetGain = this.#context.createGain();
      this.#reverbInput = this.#context.createGain();
      this.#reverbDryGain = this.#context.createGain();
      this.#masterGain = this.#context.createGain();
      this.#outputAnalyser = this.#context.createAnalyser();
      this.#outputAnalyser.fftSize = 2048;
      this.#monitorGain = this.#context.createGain();
      this.#cleanGain.gain.value = dbToLinearGain(this.#snapshot.controls.cleanGainDb);
      this.#bassEq.type = 'lowshelf';
      this.#bassEq.frequency.value = 120;
      this.#bassEq.gain.value = this.#snapshot.controls.bassDb;
      this.#middleEq.type = 'peaking';
      this.#middleEq.frequency.value = 800;
      this.#middleEq.Q.value = 0.8;
      this.#middleEq.gain.value = this.#snapshot.controls.middleDb;
      this.#trebleEq.type = 'highshelf';
      this.#trebleEq.frequency.value = 3_200;
      this.#trebleEq.gain.value = this.#snapshot.controls.trebleDb;
      const compression = compressionSettings(this.#snapshot.controls.compressionAmount);
      this.#compressor.threshold.value = compression.thresholdDb;
      this.#compressor.ratio.value = compression.ratio;
      this.#compressor.attack.value = compression.attackSeconds;
      this.#compressor.release.value = compression.releaseSeconds;
      this.#compressor.knee.value = compression.kneeDb;
      this.#compressionDryGain.gain.value = this.#snapshot.controls.compressionBypassed ? 1 : 0;
      this.#compressionWetGain.gain.value = this.#snapshot.controls.compressionBypassed ? 0 : 1;
      this.#reverbDryGain.gain.value = 1;
      this.#reverbPath = this.#createReverbPath(this.#snapshot.controls.reverbBypassed
        ? 0
        : this.#snapshot.controls.reverbAmount / 100 * REVERB_MAX_WET_GAIN);
      this.#masterGain.gain.value = dbToLinearGain(this.#snapshot.controls.masterVolumeDb);
      this.#monitorGain.gain.value = 0;
      const channelCount = Math.max(1, settings.channelCount ?? 1);
      const selectedChannel = Math.min(preservedInputChannel, channelCount - 1);
      if (channelCount > 1) {
        this.#splitter = this.#context.createChannelSplitter(channelCount);
        this.#source.connect(this.#splitter);
        this.#splitter.connect(this.#inputAnalyser, selectedChannel);
      } else {
        this.#source.connect(this.#inputAnalyser);
      }
      this.#inputAnalyser.connect(this.#cleanGain);
      this.#cleanGain.connect(this.#bassEq);
      this.#bassEq.connect(this.#middleEq);
      this.#middleEq.connect(this.#trebleEq);
      this.#trebleEq.connect(this.#compressionDryGain);
      this.#trebleEq.connect(this.#compressor);
      this.#compressor.connect(this.#compressionWetGain);
      this.#compressionDryGain.connect(this.#reverbInput);
      this.#compressionWetGain.connect(this.#reverbInput);
      this.#reverbInput.connect(this.#reverbDryGain);
      this.#reverbDryGain.connect(this.#masterGain);
      if (!this.#snapshot.controls.reverbBypassed) {
        this.#reverbInput.connect(this.#reverbPath.convolver);
        this.#reverbInputConnected = true;
      }
      this.#masterGain.connect(this.#outputAnalyser);
      this.#outputAnalyser.connect(this.#monitorGain);
      this.#monitorGain.connect(this.#context.destination);
      const { inputs: devices, outputs } = await this.#devices();
      const sinkContext = this.#sinkContext();
      let outputRecovery: AudioRecoverySnapshot | undefined;
      if (sinkContext !== undefined && preservedOutputDeviceId !== undefined) {
        if (!outputs.some((device) => device.id === preservedOutputDeviceId)) {
          outputRecovery = RECOVERIES.outputDeviceLost;
        } else {
          try {
            await sinkContext.setSinkId(preservedOutputDeviceId);
          } catch {
            outputRecovery = RECOVERIES.outputRoutingFailed;
          }
        }
      }
      const outputRouting = sinkContext === undefined
        ? { mode: 'system' as const, devices: [], selectedDeviceId: undefined, error: undefined }
        : {
          mode: 'selectable' as const,
          devices: outputs,
          selectedDeviceId: preservedOutputDeviceId,
          error: outputRecovery?.message,
        };
      this.#update({
        lifecycle: 'connected-muted',
        monitoring: false,
        devices,
        selectedInputDeviceId: settings.deviceId || command.deviceId,
        inputChannelCount: channelCount,
        inputChannel: selectedChannel,
        rawCaptureWarnings: rawCaptureWarnings(settings),
        outputRouting,
        error: outputRecovery?.message,
        recovery: outputRecovery,
      });
      this.#scheduleMeter();
    } catch (error) {
      await this.#stopCapture();
      const recovery = connectionRecovery(error, command.deviceId !== undefined);
      let devices = this.#snapshot.devices;
      try {
        devices = (await this.#devices()).inputs;
      } catch {
        // Keep the last known choices when device enumeration also fails.
      }
      this.#enterRecovery(recovery, { lifecycle: 'error', devices });
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
    if (enabled && this.#snapshot.recovery?.action === 'choose-output') return;
    try {
      if (enabled) await this.#context.resume();
      if (enabled && this.#context.state !== 'running') throw new DOMException('AudioContext did not resume', 'InvalidStateError');
      smoothGainToValue(this.#monitorGain.gain, enabled ? 1 : 0, this.#context.currentTime);
      this.#update({
        lifecycle: enabled ? 'monitoring' : 'connected-muted',
        monitoring: enabled,
        error: enabled ? undefined : this.#snapshot.error,
        recovery: enabled ? undefined : this.#snapshot.recovery,
      });
    } catch {
      this.#enterRecovery(RECOVERIES.audioContextResumeFailed);
    }
  }

  public applyControls(settings: AmpControlSettings): void {
    const previousControls = this.#snapshot.controls;
    const controls = normalizeAmpControlSettings(settings, previousControls);
    if (this.#context !== undefined) {
      if (this.#cleanGain !== undefined) smoothGainToDb(this.#cleanGain.gain, controls.cleanGainDb, this.#context.currentTime);
      if (this.#bassEq !== undefined) smoothGainToValue(this.#bassEq.gain, controls.bassDb, this.#context.currentTime);
      if (this.#middleEq !== undefined) smoothGainToValue(this.#middleEq.gain, controls.middleDb, this.#context.currentTime);
      if (this.#trebleEq !== undefined) smoothGainToValue(this.#trebleEq.gain, controls.trebleDb, this.#context.currentTime);
      if (this.#compressor !== undefined && controls.compressionAmount !== previousControls.compressionAmount) {
        const compression = compressionSettings(controls.compressionAmount);
        smoothGainToValue(this.#compressor.threshold, compression.thresholdDb, this.#context.currentTime);
        smoothGainToValue(this.#compressor.ratio, compression.ratio, this.#context.currentTime);
        smoothGainToValue(this.#compressor.attack, compression.attackSeconds, this.#context.currentTime);
        smoothGainToValue(this.#compressor.release, compression.releaseSeconds, this.#context.currentTime);
        smoothGainToValue(this.#compressor.knee, compression.kneeDb, this.#context.currentTime);
      }
      if (controls.compressionBypassed !== previousControls.compressionBypassed) {
        if (this.#compressionDryGain !== undefined) {
          smoothGainToValue(this.#compressionDryGain.gain, controls.compressionBypassed ? 1 : 0, this.#context.currentTime);
        }
        if (this.#compressionWetGain !== undefined) {
          smoothGainToValue(this.#compressionWetGain.gain, controls.compressionBypassed ? 0 : 1, this.#context.currentTime);
        }
      }
      if (this.#reverbPath !== undefined
        && (controls.reverbAmount !== previousControls.reverbAmount || controls.reverbBypassed !== previousControls.reverbBypassed)) {
        const wetGain = controls.reverbBypassed ? 0 : controls.reverbAmount / 100 * REVERB_MAX_WET_GAIN;
        smoothGainToValue(this.#reverbPath.wetGain.gain, wetGain, this.#context.currentTime);
      }
      if (controls.reverbBypassed !== previousControls.reverbBypassed
        && this.#reverbInput !== undefined
        && this.#reverbPath !== undefined) {
        if (controls.reverbBypassed && this.#reverbInputConnected) {
          this.#reverbInput.disconnect(this.#reverbPath.convolver);
          this.#reverbInputConnected = false;
          this.#replaceReverbPathAfterBypass();
        } else if (!controls.reverbBypassed && !this.#reverbInputConnected) {
          this.#reverbInput.connect(this.#reverbPath.convolver);
          this.#reverbInputConnected = true;
        }
      }
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
      const resolvesOutputRecovery = this.#snapshot.recovery?.action === 'choose-output';
      this.#update({
        outputRouting: { ...this.#snapshot.outputRouting, selectedDeviceId: deviceId, error: undefined },
        error: resolvesOutputRecovery ? undefined : this.#snapshot.error,
        recovery: resolvesOutputRecovery ? undefined : this.#snapshot.recovery,
      });
    } catch {
      this.#enterRecovery(RECOVERIES.outputRoutingFailed, {
        outputRouting: {
          ...this.#snapshot.outputRouting,
          selectedDeviceId: deviceId,
          error: RECOVERIES.outputRoutingFailed.message,
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
    void this.#devices().then(({ inputs: devices, outputs }) => {
      const connected = this.#snapshot.lifecycle === 'connected-muted' || this.#snapshot.lifecycle === 'monitoring';
      const selectedInputDeviceId = this.#snapshot.selectedInputDeviceId;
      const visibleOutputs = this.#sinkContext() === undefined ? [] : outputs;
      const outputRouting = { ...this.#snapshot.outputRouting, devices: visibleOutputs };

      if (connected
        && selectedInputDeviceId !== undefined
        && !devices.some((device) => device.id === selectedInputDeviceId)) {
        this.#handleInputEnded();
        this.#update({ devices, outputRouting });
        return;
      }

      const selectedOutputDeviceId = this.#snapshot.outputRouting.selectedDeviceId;
      if (connected
        && this.#snapshot.outputRouting.mode === 'selectable'
        && selectedOutputDeviceId !== undefined
        && !outputs.some((device) => device.id === selectedOutputDeviceId)) {
        this.#enterRecovery(RECOVERIES.outputDeviceLost, {
          devices,
          outputRouting: { ...outputRouting, error: RECOVERIES.outputDeviceLost.message },
        });
        return;
      }

      this.#update({ devices, outputRouting });
    });
  };

  #handleInputEnded = (): void => {
    if (this.#snapshot.lifecycle !== 'connected-muted' && this.#snapshot.lifecycle !== 'monitoring') return;
    this.#enterRecovery(RECOVERIES.inputDeviceLost, { lifecycle: 'error' });
    void this.#stopCapture();
  };

  #handleContextStateChange = (): void => {
    if (this.#context === undefined) return;
    if (this.#snapshot.lifecycle !== 'connected-muted' && this.#snapshot.lifecycle !== 'monitoring') return;
    if (this.#context.state === 'running') return;
    this.#enterRecovery(RECOVERIES.audioContextSuspended);
  };

  #enterRecovery(recovery: AudioRecoverySnapshot, change: Partial<AudioSnapshot> = {}): void {
    this.#silenceMonitoring();
    this.#update({
      lifecycle: 'connected-muted',
      monitoring: false,
      error: recovery.message,
      recovery,
      ...change,
    });
  }

  #silenceMonitoring(): void {
    if (this.#monitorGain === undefined) return;
    if (this.#context !== undefined) {
      this.#monitorGain.gain.cancelScheduledValues(this.#context.currentTime);
      this.#monitorGain.gain.setValueAtTime(0, this.#context.currentTime);
    }
    this.#monitorGain.gain.value = 0;
  }

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

  #createReverbPath(wetGainValue: number): ReverbPath {
    if (this.#context === undefined || this.#masterGain === undefined) {
      throw new Error('Cannot create Reverb without an active audio graph.');
    }
    const convolver = this.#context.createConvolver();
    convolver.normalize = false;
    convolver.buffer = createPlateImpulse(this.#context);
    const wetGain = this.#context.createGain();
    wetGain.gain.value = wetGainValue;
    convolver.connect(wetGain);
    wetGain.connect(this.#masterGain);
    return { convolver, wetGain };
  }

  #replaceReverbPathAfterBypass(): void {
    if (this.#reverbPath === undefined) return;

    const retiredConvolver = this.#reverbPath.convolver;
    const retiredWetGain = this.#reverbPath.wetGain;
    const retiredPath = {
      convolver: retiredConvolver,
      wetGain: retiredWetGain,
      timer: setTimeout(() => {
        retiredConvolver.disconnect();
        retiredWetGain.disconnect();
        this.#retiredReverbPaths.delete(retiredPath);
      }, GAIN_SMOOTHING_SECONDS * 1_000 + 5),
    } satisfies RetiredReverbPath;
    this.#retiredReverbPaths.add(retiredPath);
    this.#reverbPath = this.#createReverbPath(0);
  }

  async #stopCapture(): Promise<void> {
    if (this.#frame !== undefined) this.#environment.cancelAnimationFrame(this.#frame);
    this.#frame = undefined;
    this.#source?.disconnect();
    this.#splitter?.disconnect();
    this.#inputAnalyser?.disconnect();
    this.#cleanGain?.disconnect();
    this.#bassEq?.disconnect();
    this.#middleEq?.disconnect();
    this.#trebleEq?.disconnect();
    this.#compressor?.disconnect();
    this.#compressionDryGain?.disconnect();
    this.#compressionWetGain?.disconnect();
    this.#reverbInput?.disconnect();
    this.#reverbDryGain?.disconnect();
    this.#reverbPath?.convolver.disconnect();
    this.#reverbPath?.wetGain.disconnect();
    this.#retiredReverbPaths.forEach((path) => {
      clearTimeout(path.timer);
      path.convolver.disconnect();
      path.wetGain.disconnect();
    });
    this.#retiredReverbPaths.clear();
    this.#masterGain?.disconnect();
    this.#outputAnalyser?.disconnect();
    this.#monitorGain?.disconnect();
    const context = this.#context;
    const stream = this.#stream;
    this.#track?.removeEventListener('ended', this.#handleInputEnded);
    context?.removeEventListener('statechange', this.#handleContextStateChange);
    stream?.getTracks().forEach((track) => track.stop());
    this.#context = undefined;
    this.#stream = undefined;
    this.#track = undefined;
    this.#source = undefined;
    this.#splitter = undefined;
    this.#inputAnalyser = undefined;
    this.#cleanGain = undefined;
    this.#bassEq = undefined;
    this.#middleEq = undefined;
    this.#trebleEq = undefined;
    this.#compressor = undefined;
    this.#compressionDryGain = undefined;
    this.#compressionWetGain = undefined;
    this.#reverbInput = undefined;
    this.#reverbDryGain = undefined;
    this.#reverbPath = undefined;
    this.#reverbInputConnected = false;
    this.#masterGain = undefined;
    this.#outputAnalyser = undefined;
    this.#monitorGain = undefined;
    this.#inputPeak = { dbfs: METER_FLOOR_DBFS, heldAt: 0 };
    this.#outputPeak = { dbfs: METER_FLOOR_DBFS, heldAt: 0 };
    if (context !== undefined) await context.close();
  }

  #update(change: Partial<AudioSnapshot>): void {
    this.#snapshot = { ...this.#snapshot, ...change };
    this.#listeners.forEach((listener) => listener(this.snapshot));
  }
}
