import { DEFAULT_AMP_CONTROLS, normalizeAmpControlSettings, type AmpControlSettings } from './signalChain/settings';

export const SAVED_CONTROL_SETTINGS_STORAGE_KEY = 'browser-amp.saved-control-settings';
export const LEGACY_CONTROLS_STORAGE_KEY = 'browser-amp.controls';
export const LEGACY_GUIDANCE_STORAGE_KEY = 'browser-amp.hardware-direct-monitoring-dismissed';

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface StoredWorkbenchPreferences {
  readonly version: 1;
  readonly controls: AmpControlSettings;
  readonly hardwareDirectMonitoringGuidanceDismissed: boolean;
}

export const DEFAULT_STORED_WORKBENCH_PREFERENCES: StoredWorkbenchPreferences = {
  version: 1,
  controls: DEFAULT_AMP_CONTROLS,
  hardwareDirectMonitoringGuidanceDismissed: false,
};

export function resetControls(preferences: StoredWorkbenchPreferences): StoredWorkbenchPreferences {
  return {
    version: 1,
    controls: DEFAULT_AMP_CONTROLS,
    hardwareDirectMonitoringGuidanceDismissed: preferences.hardwareDirectMonitoringGuidanceDismissed,
  };
}

function parseStoredWorkbenchPreferences(value: unknown): StoredWorkbenchPreferences {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return DEFAULT_STORED_WORKBENCH_PREFERENCES;
  const settings = value as Record<string, unknown>;
  if (settings.version !== 1) return DEFAULT_STORED_WORKBENCH_PREFERENCES;
  return {
    version: 1,
    controls: normalizeAmpControlSettings(settings.controls),
    hardwareDirectMonitoringGuidanceDismissed: settings.hardwareDirectMonitoringGuidanceDismissed === true,
  };
}

export class WorkbenchPreferencesStore {
  readonly #storage: StorageLike | undefined;

  public constructor(storage: StorageLike | undefined) {
    this.#storage = storage;
  }

  public load(): StoredWorkbenchPreferences {
    const saved = this.#read(SAVED_CONTROL_SETTINGS_STORAGE_KEY);
    if (saved !== undefined) {
      try {
        return parseStoredWorkbenchPreferences(JSON.parse(saved));
      } catch {
        return DEFAULT_STORED_WORKBENCH_PREFERENCES;
      }
    }

    return this.#migrateLegacySettings();
  }

  public save(preferences: StoredWorkbenchPreferences): void {
    const safePreferences: StoredWorkbenchPreferences = {
      version: 1,
      controls: normalizeAmpControlSettings(preferences.controls),
      hardwareDirectMonitoringGuidanceDismissed: preferences.hardwareDirectMonitoringGuidanceDismissed === true,
    };
    try {
      this.#storage?.setItem(SAVED_CONTROL_SETTINGS_STORAGE_KEY, JSON.stringify(safePreferences));
    } catch {
      // Controls remain usable when private browsing or policy blocks storage.
    }
  }

  #migrateLegacySettings(): StoredWorkbenchPreferences {
    const controlsJson = this.#read(LEGACY_CONTROLS_STORAGE_KEY);
    const guidance = this.#read(LEGACY_GUIDANCE_STORAGE_KEY);
    if (controlsJson === undefined && guidance === undefined) return DEFAULT_STORED_WORKBENCH_PREFERENCES;

    let controls: unknown;
    try {
      controls = controlsJson === undefined ? undefined : JSON.parse(controlsJson);
    } catch {
      controls = undefined;
    }
    const migrated: StoredWorkbenchPreferences = {
      version: 1,
      controls: normalizeAmpControlSettings(controls),
      hardwareDirectMonitoringGuidanceDismissed: guidance === 'true',
    };
    this.save(migrated);
    return migrated;
  }

  #read(key: string): string | undefined {
    try {
      return this.#storage?.getItem(key) ?? undefined;
    } catch {
      return undefined;
    }
  }
}
