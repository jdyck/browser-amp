import { describe, expect, it } from 'vitest';
import { DEFAULT_AMP_CONTROLS } from './controls';
import {
  DEFAULT_STORED_WORKBENCH_PREFERENCES,
  LEGACY_CONTROLS_STORAGE_KEY,
  LEGACY_GUIDANCE_STORAGE_KEY,
  SAVED_CONTROL_SETTINGS_STORAGE_KEY,
  WorkbenchPreferencesStore,
  resetControls,
} from './settings';

class MemoryStorage {
  readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

describe('Saved Control Settings', () => {
  it('uses first-use defaults when saved data is missing, malformed, or from an unknown version', () => {
    const storage = new MemoryStorage();
    const store = new WorkbenchPreferencesStore(storage);

    expect(store.load()).toEqual(DEFAULT_STORED_WORKBENCH_PREFERENCES);

    storage.setItem(SAVED_CONTROL_SETTINGS_STORAGE_KEY, '{not json');
    expect(store.load()).toEqual(DEFAULT_STORED_WORKBENCH_PREFERENCES);

    storage.setItem(SAVED_CONTROL_SETTINGS_STORAGE_KEY, JSON.stringify({ version: 99, controls: DEFAULT_AMP_CONTROLS }));
    expect(store.load()).toEqual(DEFAULT_STORED_WORKBENCH_PREFERENCES);
  });

  it('restores valid fields while clamping ranges and replacing malformed fields with defaults', () => {
    const storage = new MemoryStorage();
    storage.setItem(SAVED_CONTROL_SETTINGS_STORAGE_KEY, JSON.stringify({
      version: 1,
      controls: {
        cleanGainDb: 30,
        bassDb: -13,
        middleDb: 3.26,
        trebleDb: 'bright',
        compressionAmount: 101,
        compressionBypassed: 'no',
        reverbAmount: -1,
        reverbBypassed: false,
        masterVolumeDb: null,
      },
      hardwareDirectMonitoringGuidanceDismissed: true,
    }));

    expect(new WorkbenchPreferencesStore(storage).load()).toEqual({
      version: 1,
      controls: {
        cleanGainDb: 24,
        bassDb: -12,
        middleDb: 3.3,
        trebleDb: 0,
        eqBypassed: false,
        compressionAmount: 100,
        compressionBypassed: true,
        reverbAmount: 0,
        reverbBypassed: false,
        masterVolumeDb: -18,
      },
      hardwareDirectMonitoringGuidanceDismissed: true,
    });
  });

  it('migrates the existing unversioned controls and guidance without retaining unsafe session state', () => {
    const storage = new MemoryStorage();
    storage.setItem(LEGACY_CONTROLS_STORAGE_KEY, JSON.stringify({
      ...DEFAULT_AMP_CONTROLS,
      cleanGainDb: 6,
      monitoring: true,
      selectedInputDeviceId: 'irig-hd-2',
      inputChannel: 1,
    }));
    storage.setItem(LEGACY_GUIDANCE_STORAGE_KEY, 'true');

    const migrated = new WorkbenchPreferencesStore(storage).load();

    expect(migrated).toEqual({
      version: 1,
      controls: { ...DEFAULT_AMP_CONTROLS, cleanGainDb: 6 },
      hardwareDirectMonitoringGuidanceDismissed: true,
    });
    expect(JSON.parse(storage.values.get(SAVED_CONTROL_SETTINGS_STORAGE_KEY) ?? '')).toEqual(migrated);
    expect(storage.values.get(SAVED_CONTROL_SETTINGS_STORAGE_KEY)).not.toContain('irig-hd-2');
    expect(storage.values.get(SAVED_CONTROL_SETTINGS_STORAGE_KEY)).not.toContain('monitoring');
  });

  it('keeps controls usable when browser storage is unavailable', () => {
    const storage = {
      getItem: () => { throw new DOMException('Blocked', 'SecurityError'); },
      setItem: () => { throw new DOMException('Blocked', 'SecurityError'); },
    };
    const store = new WorkbenchPreferencesStore(storage);

    expect(store.load()).toEqual(DEFAULT_STORED_WORKBENCH_PREFERENCES);
    expect(() => store.save(DEFAULT_STORED_WORKBENCH_PREFERENCES)).not.toThrow();
  });

  it('resets every sound control while preserving dismissed guidance', () => {
    const reset = resetControls({
      version: 1,
      controls: {
        cleanGainDb: 12,
        bassDb: -4,
        middleDb: 5,
        trebleDb: 7,
        eqBypassed: true,
        compressionAmount: 80,
        compressionBypassed: false,
        reverbAmount: 60,
        reverbBypassed: false,
        masterVolumeDb: -3,
      },
      hardwareDirectMonitoringGuidanceDismissed: true,
    });

    expect(reset).toEqual({
      version: 1,
      controls: DEFAULT_AMP_CONTROLS,
      hardwareDirectMonitoringGuidanceDismissed: true,
    });
  });
});
