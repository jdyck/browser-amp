import { browserAudio, type BrowserAudio } from './browserAudio';
import { DEFAULT_AMP_CONTROLS, normalizeAmpControlSettings, normalizePercentAmount } from '../signalChain/settings';
import { dbToLinearGain, smoothGainToDb, smoothGainToValue } from './gain';
import { meterReadingFromSamples, METER_FLOOR_DBFS, nextPeakHold, type PeakHold } from './meter';
import { ReverbStage } from './reverb';
import { reverbParameters } from '../signalChain/reverbProfiles';
import { AmpModelStage } from './ampModel';
import { CabinetModelStage } from './cabinetModel';
import { NoiseGateStage } from './noiseGate';
import type { AmpControlSettings, AudioEngine as AudioEngineContract, AudioRecoverySnapshot, AudioSnapshot, InputDevice, InputSettings, LatencySnapshot, OutputDevice } from './types';

const initialSettings: InputSettings = { selectedInputDeviceId: undefined, inputChannel: 0 };
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

/** Stable, capped compensation trim for useful bypass comparisons without signal-following pumping. */
export function compressionLevelMatchDb(amount: number): number {
  const normalizedAmount = normalizePercentAmount(amount);
  // Web Audio's compressor includes its own level compensation, so the host
  // trim is not a monotonic makeup curve. These fixed calibration anchors keep
  // representative guitar program close to bypass without following the live signal.
  const anchors = [
    [0, 0],
    [25, -1],
    [50, -3.5],
    [75, -2],
    [100, 0.5],
  ] as const;
  const upperIndex = anchors.findIndex(([anchorAmount]) => anchorAmount >= normalizedAmount);
  if (upperIndex <= 0) return anchors[0][1];
  const [lowerAmount, lowerDb] = anchors[upperIndex - 1];
  const [upperAmount, upperDb] = anchors[upperIndex];
  const proportion = (normalizedAmount - lowerAmount) / (upperAmount - lowerAmount);
  return lowerDb + (upperDb - lowerDb) * proportion;
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
    compressionReductionDb: 0,
    noiseGateReductionDb: 0,
    clipLatched: false,
    latency: undefined,
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
  #inputTrim: GainNode | undefined;
  #ampModel: AmpModelStage | undefined;
  #cabinetModel: CabinetModelStage | undefined;
  #noiseGate: NoiseGateStage | undefined;
  #lowShelfEq: BiquadFilterNode | undefined;
  #lowMidEq: BiquadFilterNode | undefined;
  #upperMidEq: BiquadFilterNode | undefined;
  #highShelfEq: BiquadFilterNode | undefined;
  #compressor: DynamicsCompressorNode | undefined;
  #compressionLevelMatchGain: GainNode | undefined;
  #compressionDryGain: GainNode | undefined;
  #compressionWetGain: GainNode | undefined;
  #reverb: ReverbStage | undefined;
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
      latency: undefined,
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
      this.#inputTrim = this.#context.createGain();
      this.#lowShelfEq = this.#context.createBiquadFilter();
      this.#lowMidEq = this.#context.createBiquadFilter();
      this.#upperMidEq = this.#context.createBiquadFilter();
      this.#highShelfEq = this.#context.createBiquadFilter();
      this.#compressor = this.#context.createDynamicsCompressor();
      this.#compressionLevelMatchGain = this.#context.createGain();
      this.#compressionDryGain = this.#context.createGain();
      this.#compressionWetGain = this.#context.createGain();
      this.#masterGain = this.#context.createGain();
      this.#outputAnalyser = this.#context.createAnalyser();
      this.#outputAnalyser.fftSize = 2048;
      this.#monitorGain = this.#context.createGain();
      this.#ampModel = new AmpModelStage(this.#context, this.#snapshot.controls.ampModel, this.#snapshot.controls.ampSettings);
      this.#cabinetModel = new CabinetModelStage(this.#context, this.#snapshot.controls.cabinetModel);
      this.#noiseGate = await NoiseGateStage.create(
        this.#context,
        this.#environment,
        {
          thresholdDb: this.#snapshot.controls.noiseGateThresholdDb,
          rangeDb: this.#snapshot.controls.noiseGateRangeDb,
          releaseSeconds: this.#snapshot.controls.noiseGateReleaseMs / 1_000,
          bypassed: this.#snapshot.controls.noiseGateBypassed,
        },
        (state) => this.#update({
          noiseGateReductionDb: this.#snapshot.controls.noiseGateBypassed ? 0 : state.reductionDb,
        }),
      );
      this.#inputTrim.gain.value = dbToLinearGain(this.#snapshot.controls.inputTrimDb);
      this.#lowShelfEq.type = 'lowshelf';
      this.#lowShelfEq.frequency.value = 120;
      this.#lowShelfEq.gain.value = this.#snapshot.controls.eqBypassed ? 0 : this.#snapshot.controls.lowShelfDb;
      this.#lowMidEq.type = 'peaking';
      this.#lowMidEq.frequency.value = this.#snapshot.controls.lowMidFrequencyHz;
      this.#lowMidEq.Q.value = 0.8;
      this.#lowMidEq.gain.value = this.#snapshot.controls.eqBypassed ? 0 : this.#snapshot.controls.lowMidDb;
      this.#upperMidEq.type = 'peaking';
      this.#upperMidEq.frequency.value = this.#snapshot.controls.upperMidFrequencyHz;
      this.#upperMidEq.Q.value = 0.8;
      this.#upperMidEq.gain.value = this.#snapshot.controls.eqBypassed ? 0 : this.#snapshot.controls.upperMidDb;
      this.#highShelfEq.type = 'highshelf';
      this.#highShelfEq.frequency.value = 3_200;
      this.#highShelfEq.gain.value = this.#snapshot.controls.eqBypassed ? 0 : this.#snapshot.controls.highShelfDb;
      const compression = compressionSettings(this.#snapshot.controls.compressionAmount);
      this.#compressor.threshold.value = compression.thresholdDb;
      this.#compressor.ratio.value = compression.ratio;
      this.#compressor.attack.value = compression.attackSeconds;
      this.#compressor.release.value = compression.releaseSeconds;
      this.#compressor.knee.value = compression.kneeDb;
      this.#compressionLevelMatchGain.gain.value = dbToLinearGain(
        this.#snapshot.controls.compressionLevelMatch
          ? compressionLevelMatchDb(this.#snapshot.controls.compressionAmount)
          : 0,
      );
      this.#compressionDryGain.gain.value = this.#snapshot.controls.compressionBypassed ? 1 : 0;
      this.#compressionWetGain.gain.value = this.#snapshot.controls.compressionBypassed ? 0 : 1;
      this.#reverb = new ReverbStage(
        this.#context,
        this.#snapshot.controls.reverbAmount,
        this.#snapshot.controls.reverbBypassed,
        this.#snapshot.controls.reverbProfile,
        reverbParameters(this.#snapshot.controls.reverbProfile, this.#snapshot.controls.reverbSettings),
      );
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
      this.#inputAnalyser.connect(this.#inputTrim);
      this.#inputTrim.connect(this.#ampModel.input);
      this.#inputTrim.connect(this.#noiseGate.detectorInput);
      this.#ampModel.output.connect(this.#cabinetModel.input);
      this.#cabinetModel.output.connect(this.#noiseGate.input);
      this.#noiseGate.output.connect(this.#compressionDryGain);
      this.#noiseGate.output.connect(this.#compressor);
      this.#compressor.connect(this.#compressionLevelMatchGain);
      this.#compressionLevelMatchGain.connect(this.#compressionWetGain);
      this.#compressionDryGain.connect(this.#lowShelfEq);
      this.#compressionWetGain.connect(this.#lowShelfEq);
      this.#lowShelfEq.connect(this.#lowMidEq);
      this.#lowMidEq.connect(this.#upperMidEq);
      this.#upperMidEq.connect(this.#highShelfEq);
      this.#highShelfEq.connect(this.#reverb.input);
      this.#reverb.output.connect(this.#masterGain);
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
        latency: this.#latency(),
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
    if (this.#snapshot.lifecycle !== 'connected-muted' && this.#snapshot.lifecycle !== 'monitoring' && this.#snapshot.lifecycle !== 'interrupted') return;
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
      this.#ampModel?.setControls(controls.ampModel, controls.ampSettings);
      this.#cabinetModel?.setModel(controls.cabinetModel);
      this.#noiseGate?.setControls({
        thresholdDb: controls.noiseGateThresholdDb,
        rangeDb: controls.noiseGateRangeDb,
        releaseSeconds: controls.noiseGateReleaseMs / 1_000,
        bypassed: controls.noiseGateBypassed,
      });
      if (this.#inputTrim !== undefined) smoothGainToDb(this.#inputTrim.gain, controls.inputTrimDb, this.#context.currentTime);
      // Zero-gain shelves and peaking filters pass the signal unchanged while preserving the saved band settings.
      if (this.#lowShelfEq !== undefined) smoothGainToValue(this.#lowShelfEq.gain, controls.eqBypassed ? 0 : controls.lowShelfDb, this.#context.currentTime);
      if (this.#lowMidEq !== undefined) {
        smoothGainToValue(this.#lowMidEq.frequency, controls.lowMidFrequencyHz, this.#context.currentTime);
        smoothGainToValue(this.#lowMidEq.gain, controls.eqBypassed ? 0 : controls.lowMidDb, this.#context.currentTime);
      }
      if (this.#upperMidEq !== undefined) {
        smoothGainToValue(this.#upperMidEq.frequency, controls.upperMidFrequencyHz, this.#context.currentTime);
        smoothGainToValue(this.#upperMidEq.gain, controls.eqBypassed ? 0 : controls.upperMidDb, this.#context.currentTime);
      }
      if (this.#highShelfEq !== undefined) smoothGainToValue(this.#highShelfEq.gain, controls.eqBypassed ? 0 : controls.highShelfDb, this.#context.currentTime);
      if (this.#compressor !== undefined && controls.compressionAmount !== previousControls.compressionAmount) {
        const compression = compressionSettings(controls.compressionAmount);
        smoothGainToValue(this.#compressor.threshold, compression.thresholdDb, this.#context.currentTime);
        smoothGainToValue(this.#compressor.ratio, compression.ratio, this.#context.currentTime);
        smoothGainToValue(this.#compressor.attack, compression.attackSeconds, this.#context.currentTime);
        smoothGainToValue(this.#compressor.release, compression.releaseSeconds, this.#context.currentTime);
        smoothGainToValue(this.#compressor.knee, compression.kneeDb, this.#context.currentTime);
      }
      if (this.#compressionLevelMatchGain !== undefined
        && (controls.compressionAmount !== previousControls.compressionAmount
          || controls.compressionLevelMatch !== previousControls.compressionLevelMatch)) {
        smoothGainToDb(
          this.#compressionLevelMatchGain.gain,
          controls.compressionLevelMatch ? compressionLevelMatchDb(controls.compressionAmount) : 0,
          this.#context.currentTime,
        );
      }
      if (controls.compressionBypassed !== previousControls.compressionBypassed) {
        if (this.#compressionDryGain !== undefined) {
          smoothGainToValue(this.#compressionDryGain.gain, controls.compressionBypassed ? 1 : 0, this.#context.currentTime);
        }
        if (this.#compressionWetGain !== undefined) {
          smoothGainToValue(this.#compressionWetGain.gain, controls.compressionBypassed ? 0 : 1, this.#context.currentTime);
        }
      }
      this.#reverb?.setControls(controls.reverbAmount, controls.reverbBypassed, controls.reverbProfile,
        reverbParameters(controls.reverbProfile, controls.reverbSettings));
      if (this.#masterGain !== undefined) smoothGainToDb(this.#masterGain.gain, controls.masterVolumeDb, this.#context.currentTime);
    }
    this.#update({
      controls,
      noiseGateReductionDb: controls.noiseGateBypassed ? 0 : this.#snapshot.noiseGateReductionDb,
      compressionReductionDb: controls.compressionBypassed ? 0 : this.#snapshot.compressionReductionDb,
    });
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
      const connected = this.#snapshot.lifecycle === 'connected-muted' || this.#snapshot.lifecycle === 'monitoring' || this.#snapshot.lifecycle === 'interrupted';
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
    if (this.#snapshot.lifecycle !== 'connected-muted' && this.#snapshot.lifecycle !== 'monitoring' && this.#snapshot.lifecycle !== 'interrupted') return;
    this.#enterRecovery(RECOVERIES.inputDeviceLost, { lifecycle: 'error' });
    void this.#stopCapture();
  };

  #handleContextStateChange = (): void => {
    if (this.#context === undefined) return;
    if (this.#snapshot.lifecycle !== 'connected-muted' && this.#snapshot.lifecycle !== 'monitoring') return;
    if (this.#context.state === 'running') return;
    this.#enterRecovery(RECOVERIES.audioContextSuspended, { lifecycle: 'interrupted' });
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

  // outputLatency settles after playback starts and can change with the routed device,
  // so this is re-read on every meter frame. The previous snapshot is reused when the
  // values are unchanged to keep renders cheap.
  #latency(): LatencySnapshot | undefined {
    if (this.#context === undefined) return undefined;
    const baseSeconds = this.#context.baseLatency;
    const outputSeconds = 'outputLatency' in this.#context ? this.#context.outputLatency : undefined;
    const previous = this.#snapshot.latency;
    return previous !== undefined && previous.baseSeconds === baseSeconds && previous.outputSeconds === outputSeconds
      ? previous
      : { baseSeconds, outputSeconds };
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
      const compressorReduction = this.#compressor?.reduction;
      const compressionReductionDb = this.#snapshot.controls.compressionBypassed
        || compressorReduction === undefined
        || !Number.isFinite(compressorReduction)
        ? 0
        : Math.max(0, -compressorReduction);
      this.#inputPeak = nextPeakHold(this.#inputPeak, input.dbfs, now);
      this.#outputPeak = nextPeakHold(this.#outputPeak, output.dbfs, now);
      this.#update({
        meter: { dbfs: input.dbfs, peakDbfs: this.#inputPeak.dbfs },
        outputMeter: { dbfs: output.dbfs, peakDbfs: this.#outputPeak.dbfs },
        compressionReductionDb,
        clipLatched: this.#snapshot.clipLatched || output.clipped,
        latency: this.#latency(),
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
    this.#inputTrim?.disconnect();
    this.#ampModel?.disconnect();
    this.#cabinetModel?.disconnect();
    this.#noiseGate?.disconnect();
    this.#lowShelfEq?.disconnect();
    this.#lowMidEq?.disconnect();
    this.#upperMidEq?.disconnect();
    this.#highShelfEq?.disconnect();
    this.#compressor?.disconnect();
    this.#compressionLevelMatchGain?.disconnect();
    this.#compressionDryGain?.disconnect();
    this.#compressionWetGain?.disconnect();
    this.#reverb?.disconnect();
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
    this.#inputTrim = undefined;
    this.#ampModel = undefined;
    this.#cabinetModel = undefined;
    this.#noiseGate = undefined;
    this.#lowShelfEq = undefined;
    this.#lowMidEq = undefined;
    this.#upperMidEq = undefined;
    this.#highShelfEq = undefined;
    this.#compressor = undefined;
    this.#compressionLevelMatchGain = undefined;
    this.#compressionDryGain = undefined;
    this.#compressionWetGain = undefined;
    this.#reverb = undefined;
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
