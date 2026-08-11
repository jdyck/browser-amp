export type ConnectionLifecycle = 'disconnected' | 'connecting' | 'connected-muted' | 'error';

export interface InputDevice {
  readonly id: string;
  readonly label: string;
}

export interface InputSettings {
  readonly selectedInputDeviceId: string | undefined;
  readonly inputChannel: number;
}

export interface InputMeterSnapshot {
  readonly dbfs: number;
  readonly peakDbfs: number;
}

export interface AudioSnapshot extends InputSettings {
  readonly lifecycle: ConnectionLifecycle;
  readonly monitoring: false;
  readonly devices: readonly InputDevice[];
  readonly inputChannelCount: number;
  readonly rawCaptureWarnings: readonly string[];
  readonly meter: InputMeterSnapshot;
  readonly error: string | undefined;
}

export interface AudioEngine {
  readonly snapshot: AudioSnapshot;
  connectInput(command?: { readonly deviceId?: string }): Promise<void>;
  disconnectInput(): Promise<void>;
  applySettings(settings: InputSettings): void;
  subscribe(listener: (snapshot: AudioSnapshot) => void): () => void;
}
