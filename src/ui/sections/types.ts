import type { AudioEngine, AudioSnapshot } from '../../audio/types';

export type WorkspaceSection = 'input' | 'amp' | 'compression' | 'eq' | 'reverb' | 'master';

export interface SectionDefinition {
  readonly id: WorkspaceSection;
  readonly label: string;
  readonly title: string;
  readonly description: string;
}

export interface RecoveryPresentation {
  readonly connectButtonLabel: string;
  readonly inputMessage: string | undefined;
  readonly monitoringMessage: string | undefined;
  readonly monitoringButtonLabel: string;
  readonly monitoringDisabled: boolean;
  readonly retrySelectedOutput: boolean;
}

export interface SectionRuntime {
  readonly root: HTMLElement;
  readonly engine: AudioEngine;
  resetControls(): void;
}

/** Everything the workspace shell needs to host one signal-chain section. */
export interface WorkspaceSectionModule {
  readonly definition: SectionDefinition;
  action(snapshot: AudioSnapshot, recovery: RecoveryPresentation): string;
  content(snapshot: AudioSnapshot, recovery: RecoveryPresentation): string;
  bind(runtime: SectionRuntime): void;
  sync(runtime: SectionRuntime, snapshot: AudioSnapshot): void;
}
