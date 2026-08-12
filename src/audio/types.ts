export type ConnectionLifecycle = 'disconnected' | 'connecting' | 'connected-muted' | 'monitoring' | 'error';

export interface InputDevice {
  readonly id: string;
  readonly label: string;
}

export interface OutputDevice {
  readonly id: string;
  readonly label: string;
}

export interface OutputRoutingSnapshot {
  readonly mode: 'pending' | 'selectable' | 'system';
  readonly devices: readonly OutputDevice[];
  readonly selectedDeviceId: string | undefined;
  readonly error: string | undefined;
}

export interface InputSettings {
  readonly selectedInputDeviceId: string | undefined;
  readonly inputChannel: number;
}

export interface AmpControlSettings {
  readonly cleanGainDb: number;
  readonly bassDb: number;
  readonly middleDb: number;
  readonly trebleDb: number;
  readonly compressionAmount: number;
  readonly compressionBypassed: boolean;
  readonly reverbAmount: number;
  readonly reverbBypassed: boolean;
  readonly masterVolumeDb: number;
}

export const DEFAULT_AMP_CONTROLS: AmpControlSettings = {
  cleanGainDb: 0,
  bassDb: 0,
  middleDb: 0,
  trebleDb: 0,
  compressionAmount: 25,
  compressionBypassed: true,
  reverbAmount: 20,
  reverbBypassed: true,
  masterVolumeDb: -18,
};

export interface InputMeterSnapshot {
  readonly dbfs: number;
  readonly peakDbfs: number;
}

export interface AudioSnapshot extends InputSettings {
  readonly lifecycle: ConnectionLifecycle;
  readonly monitoring: boolean;
  readonly controls: AmpControlSettings;
  readonly outputRouting: OutputRoutingSnapshot;
  readonly devices: readonly InputDevice[];
  readonly inputChannelCount: number;
  readonly rawCaptureWarnings: readonly string[];
  readonly meter: InputMeterSnapshot;
  readonly outputMeter: InputMeterSnapshot;
  readonly clipLatched: boolean;
  readonly error: string | undefined;
}

export interface AudioEngine {
  readonly snapshot: AudioSnapshot;
  connectInput(command?: { readonly deviceId?: string }): Promise<void>;
  disconnectInput(): Promise<void>;
  setMonitoring(enabled: boolean): Promise<void>;
  applyControls(settings: AmpControlSettings): void;
  selectOutput(deviceId?: string): Promise<void>;
  clearClip(): void;
  applySettings(settings: InputSettings): void;
  subscribe(listener: (snapshot: AudioSnapshot) => void): () => void;
}
