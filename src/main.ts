import { AudioEngine } from './audio/AudioEngine';
import type { AudioSnapshot, InputMeterSnapshot } from './audio/types';
import { AMP_CONTROL_DEFINITIONS, AMP_MODELS, CABINET_MODELS, REVERB_PROFILES, isAmpModel, isCabinetModel, isReverbProfile, type AmpControlSettings, type ContinuousControlDefinition } from './controls';
import { AMP_MODEL_CONTROLS, type AmpChoiceDefinition, type AmpKnobDefinition, type JazzAmpState } from './ampModels';
import { WorkbenchPreferencesStore, resetControls, type StoredWorkbenchPreferences } from './settings';
import { DEFAULT_REVERB_SETTINGS, reverbControlEntries, reverbParameters, type ReverbControlDefinition } from './reverbSettings';
import './style.css';

// `panel`, `connection-state`, and the `#monitoring-state`/`#clip-indicator` ids below are kept as literal
// hooks (unstyled by CSS) because tests/app.spec.ts selects elements by these exact class/id strings.
const PANEL = 'panel p-2 my-4 bg-card text-card-foreground border border-border rounded-lg';
const PANEL_HEADING = 'flex justify-between gap-2 items-center mb-3 max-[34rem]:items-start max-[34rem]:flex-col max-[34rem]:gap-2';
const PANEL_TITLE = 'text-sm font-medium mb-0';
const ACTIONS = 'flex justify-between gap-2 items-center max-[34rem]:items-start max-[34rem]:flex-col max-[34rem]:gap-2';
const ACTION_BUTTON = 'max-[34rem]:w-full';
const SECONDARY_BUTTON = 'bg-secondary text-secondary-foreground';
const SECONDARY_ACTION_BUTTON = `${SECONDARY_BUTTON} ${ACTION_BUTTON}`;
const COMPACT_SECONDARY_BUTTON = `${SECONDARY_BUTTON} h-7 px-2 text-xs`;
const STAGE_TOGGLE = 'flex gap-[.6rem] items-center my-4 font-medium';
const STAGE_TOGGLE_CHECKBOX = 'w-4 h-4 accent-primary';
const FIELD = 'block mt-4 mb-[.35rem] font-medium text-sm';
const FIELD_HELP = 'block mt-[.35rem] text-muted-foreground text-xs font-normal';
const STATE_VALUE = 'text-positive font-semibold';

const preferencesStore = new WorkbenchPreferencesStore(browserStorage());
let workbenchPreferences = preferencesStore.load();
const engine = new AudioEngine();
engine.applyControls(workbenchPreferences.controls);

const app = document.querySelector<HTMLElement>('#app');
if (app === null) throw new Error('Application root is missing.');
const root = app;

let snapshot = engine.snapshot;
let guidanceOpen = false;
let guidanceDismissed = workbenchPreferences.hardwareDirectMonitoringGuidanceDismissed;
const reverbAccordionOpen = { main: true, advanced: false };

function meterRegion(dbfs: number): string {
  if (dbfs > -3) return 'red';
  if (dbfs >= -12) return 'yellow';
  return 'green';
}

function meterPositionPercent(dbfs: number): number {
  return Math.max(0, ((dbfs + 60) / 60) * 100);
}

function render(next: AudioSnapshot): void {
  const previous = snapshot;
  snapshot = next;
  if (previous.controls !== next.controls) updateStoredPreferences({ controls: next.controls });
  if (structureChanged(previous, next)) renderStructure(next);
  renderControls(next.controls);
  renderMeters(next);
}

function structureChanged(previous: AudioSnapshot, next: AudioSnapshot): boolean {
  return root.querySelector('#connect') === null
    || previous.lifecycle !== next.lifecycle
    || previous.monitoring !== next.monitoring
    || previous.devices !== next.devices
    || previous.selectedInputDeviceId !== next.selectedInputDeviceId
    || previous.inputChannel !== next.inputChannel
    || previous.inputChannelCount !== next.inputChannelCount
    || previous.rawCaptureWarnings !== next.rawCaptureWarnings
    || previous.outputRouting.mode !== next.outputRouting.mode
    || previous.outputRouting.devices !== next.outputRouting.devices
    || previous.outputRouting.selectedDeviceId !== next.outputRouting.selectedDeviceId
    || previous.outputRouting.error !== next.outputRouting.error
    || previous.error !== next.error
    || previous.recovery !== next.recovery;
}

function renderStructure(current: AudioSnapshot): void {
  const connected = current.lifecycle === 'connected-muted' || current.lifecycle === 'monitoring' || current.lifecycle === 'interrupted';
  const recovery = recoveryPresentation(current, connected);
  root.innerHTML = `
    <section class="w-[min(100%-2rem,46rem)] max-[34rem]:w-[min(100%-1.25rem,46rem)] mx-auto py-12 max-[34rem]:py-6" aria-labelledby="page-title">
      <header class="mb-6">
        <h1 id="page-title" class="text-[clamp(2rem,6vw,3.5rem)] mb-1">Browser Amp</h1>
        <button id="reset-controls" type="button" class="${SECONDARY_BUTTON}">Reset Controls</button>
      </header>

      <section class="${PANEL}" aria-labelledby="input-title">
        <div class="${PANEL_HEADING}">
          <h2 id="input-title" class="${PANEL_TITLE}">Live Guitar Input</h2>
          <output class="connection-state ${STATE_VALUE}" role="status">${connectionLabel(current)}</output>
        </div>
        <p id="connection-description">${connectionDescription(current)}</p>
        <div class="${ACTIONS}">
          <button id="connect" type="button" class="${ACTION_BUTTON}" ${current.lifecycle === 'connecting' ? 'disabled' : ''}>${recovery.connectButtonLabel}</button>
          ${connected ? `<button id="disconnect" type="button" class="${SECONDARY_ACTION_BUTTON}">Disconnect</button>` : ''}
        </div>
        ${current.devices.length > 0 ? deviceSelector(current) : ''}
        ${current.inputChannelCount > 1 ? channelSelector(current) : ''}
        ${current.rawCaptureWarnings.map((warning) => `<p class="text-warning text-sm" role="alert">${escapeHtml(warning)}</p>`).join('')}
        ${recovery.inputMessage === undefined ? '' : `<p class="text-destructive font-medium text-sm" role="alert">${escapeHtml(recovery.inputMessage)}</p>`}
      </section>

      <section class="${PANEL}" aria-labelledby="monitoring-title">
        <div class="${PANEL_HEADING}"><h2 id="monitoring-title" class="${PANEL_TITLE}">Processed Monitoring</h2><strong id="monitoring-state" class="${STATE_VALUE}">${current.monitoring ? 'On' : 'Off'}</strong></div>
        <p>${routingDescription(current)}</p>
        <p id="latency-value" class="text-muted-foreground text-xs" ${current.latency === undefined ? 'hidden' : ''}>${latencyDescription(current.latency)}</p>
        ${outputSelector(current, connected)}
        ${current.outputRouting.error === undefined ? '' : `<p class="text-destructive font-medium text-sm" role="alert">${escapeHtml(current.outputRouting.error)}</p>`}
        ${recovery.monitoringMessage === undefined ? '' : `<p class="text-destructive font-medium text-sm" role="alert">${escapeHtml(recovery.monitoringMessage)}</p>`}
        <div class="${ACTIONS}">
          ${recovery.retrySelectedOutput ? `<button id="retry-output" type="button" class="${SECONDARY_ACTION_BUTTON}">Retry Selected Output</button>` : ''}
          <button id="monitoring-toggle" type="button" class="${ACTION_BUTTON}" ${recovery.monitoringDisabled ? 'disabled' : ''}>${recovery.monitoringButtonLabel}</button>
        </div>
        ${guidanceOpen ? hardwareGuidance() : ''}
      </section>

      ${meterPanel('input', 'Input Level Meter', current.meter, 'Live Guitar Input before Input Trim and the amp model. Connecting and metering remain silent until Processed Monitoring is enabled.')}

      ${meterPanel('output', 'Output Level Meter', current.outputMeter, 'Post-Master signal before browser output.')}

      <section class="${PANEL}" aria-label="Amp Model">
        ${dbControl('input-trim', 'Input Trim', current.controls.inputTrimDb, AMP_CONTROL_DEFINITIONS.inputTrimDb)}
        <div class="mb-3">
          <label for="amp-model" class="block mb-[.35rem] font-medium text-sm">Amp Model</label>
          <select id="amp-model" aria-describedby="amp-model-help">
            ${Object.entries(AMP_MODELS).map(([id, model]) => `<option value="${id}" ${id === current.controls.ampModel ? 'selected' : ''}>${model.label}</option>`).join('')}
          </select>
          <span id="amp-model-help" class="${FIELD_HELP}">${AMP_MODELS[current.controls.ampModel].description}</span>
        </div>
        <div id="amp-model-controls" class="grid gap-3 mt-4" data-model="${current.controls.ampModel}">${ampModelControls(current.controls)}</div>
      </section>

      <section class="${PANEL}" aria-label="Cabinet">
        <label for="cabinet-model" class="block mb-[.35rem] font-medium text-sm">Cabinet</label>
        <select id="cabinet-model" aria-describedby="cabinet-model-help">
          ${Object.entries(CABINET_MODELS).map(([id, model]) => `<option value="${id}" ${id === current.controls.cabinetModel ? 'selected' : ''}>${model.label}</option>`).join('')}
        </select>
        <span id="cabinet-model-help" class="${FIELD_HELP}">${CABINET_MODELS[current.controls.cabinetModel].description}</span>
      </section>

      <section class="${PANEL}" aria-label="Three-Band EQ">
        <label class="${STAGE_TOGGLE}" for="eq-enabled">
          <input id="eq-enabled" type="checkbox" class="${STAGE_TOGGLE_CHECKBOX}" ${current.controls.eqBypassed ? '' : 'checked'}>
          Enable EQ
        </label>
        <div class="grid gap-2">
          ${dbControl('bass', 'Bass', current.controls.bassDb, AMP_CONTROL_DEFINITIONS.bassDb)}
          ${dbControl('middle', 'Middle', current.controls.middleDb, AMP_CONTROL_DEFINITIONS.middleDb)}
          ${dbControl('treble', 'Treble', current.controls.trebleDb, AMP_CONTROL_DEFINITIONS.trebleDb)}
        </div>
      </section>

      <section class="${PANEL}" aria-label="Compression">
        <label class="${STAGE_TOGGLE}" for="compression-enabled">
          <input id="compression-enabled" type="checkbox" class="${STAGE_TOGGLE_CHECKBOX}" ${current.controls.compressionBypassed ? '' : 'checked'}>
          Enable Compression
        </label>
        ${percentControl('compression-amount', 'Compression', current.controls.compressionAmount, AMP_CONTROL_DEFINITIONS.compressionAmount)}
      </section>

      <section class="${PANEL}" aria-label="Reverb">
        <div class="mb-3">
          <div class="flex flex-wrap items-center justify-between gap-2 mb-[.35rem]">
            <label for="reverb-profile" class="font-medium text-sm">Reverb Module</label>
            <button id="reset-reverb" type="button" class="${COMPACT_SECONDARY_BUTTON}" title="Restore only this module's Main and Advanced settings. Amount and Enable Reverb stay unchanged.">Reset This Reverb</button>
          </div>
          <select id="reverb-profile" aria-describedby="reverb-profile-help">
            ${Object.entries(REVERB_PROFILES).map(([id, profile]) => `<option value="${id}" ${id === current.controls.reverbProfile ? 'selected' : ''}>${profile.label}</option>`).join('')}
          </select>
          <span id="reverb-profile-help" class="${FIELD_HELP}">${REVERB_PROFILES[current.controls.reverbProfile].description}</span>
        </div>
        <label class="${STAGE_TOGGLE}" for="reverb-enabled">
          <input id="reverb-enabled" type="checkbox" class="${STAGE_TOGGLE_CHECKBOX}" ${current.controls.reverbBypassed ? '' : 'checked'}>
          Enable Reverb
        </label>
        <div id="reverb-settings" data-profile="${current.controls.reverbProfile}">${reverbAccordions(current.controls)}</div>
      </section>

      <section class="${PANEL}" aria-label="Master Volume">
        ${dbControl('master-volume', 'Master', current.controls.masterVolumeDb, AMP_CONTROL_DEFINITIONS.masterVolumeDb)}
      </section>
    </section>`;

  bindStructureEvents();
}

function bindStructureEvents(): void {
  root.querySelector<HTMLButtonElement>('#reset-controls')?.addEventListener('click', () => {
    workbenchPreferences = resetControls(workbenchPreferences);
    preferencesStore.save(workbenchPreferences);
    engine.applyControls(workbenchPreferences.controls);
  });
  root.querySelector<HTMLButtonElement>('#connect')?.addEventListener('click', () => void engine.connectInput({ deviceId: snapshot.selectedInputDeviceId }));
  root.querySelector<HTMLButtonElement>('#disconnect')?.addEventListener('click', () => void engine.disconnectInput());
  root.querySelector<HTMLSelectElement>('#input-device')?.addEventListener('change', (event) => {
    const deviceId = (event.currentTarget as HTMLSelectElement).value;
    void engine.connectInput({ deviceId: deviceId === '' ? undefined : deviceId });
  });
  root.querySelector<HTMLSelectElement>('#input-channel')?.addEventListener('change', (event) => {
    engine.applySettings({
      selectedInputDeviceId: snapshot.selectedInputDeviceId,
      inputChannel: Number((event.currentTarget as HTMLSelectElement).value),
    });
  });
  root.querySelector<HTMLSelectElement>('#output-device')?.addEventListener('change', (event) => {
    const deviceId = (event.currentTarget as HTMLSelectElement).value;
    void engine.selectOutput(deviceId === '' ? undefined : deviceId);
  });
  root.querySelector<HTMLButtonElement>('#retry-output')?.addEventListener('click', () => {
    void engine.selectOutput(snapshot.outputRouting.selectedDeviceId);
  });
  bindContinuousControl('input-trim', (inputTrimDb) => engine.applyControls({ ...snapshot.controls, inputTrimDb }));
  root.querySelector<HTMLSelectElement>('#amp-model')?.addEventListener('change', (event) => {
    const ampModel = (event.currentTarget as HTMLSelectElement).value;
    if (isAmpModel(ampModel)) engine.applyControls({ ...snapshot.controls, ampModel });
  });
  bindAmpModelControls();
  root.querySelector<HTMLSelectElement>('#cabinet-model')?.addEventListener('change', (event) => {
    const cabinetModel = (event.currentTarget as HTMLSelectElement).value;
    if (isCabinetModel(cabinetModel)) engine.applyControls({ ...snapshot.controls, cabinetModel });
  });
  root.querySelector<HTMLInputElement>('#eq-enabled')?.addEventListener('change', (event) => {
    engine.applyControls({ ...snapshot.controls, eqBypassed: !(event.currentTarget as HTMLInputElement).checked });
  });
  bindContinuousControl('bass', (bassDb) => engine.applyControls({ ...snapshot.controls, bassDb }));
  bindContinuousControl('middle', (middleDb) => engine.applyControls({ ...snapshot.controls, middleDb }));
  bindContinuousControl('treble', (trebleDb) => engine.applyControls({ ...snapshot.controls, trebleDb }));
  bindContinuousControl('compression-amount', (compressionAmount) => engine.applyControls({ ...snapshot.controls, compressionAmount }));
  root.querySelector<HTMLInputElement>('#compression-enabled')?.addEventListener('change', (event) => {
    engine.applyControls({ ...snapshot.controls, compressionBypassed: !(event.currentTarget as HTMLInputElement).checked });
  });
  bindReverbControls();
  root.querySelector<HTMLSelectElement>('#reverb-profile')?.addEventListener('change', (event) => {
    const reverbProfile = (event.currentTarget as HTMLSelectElement).value;
    if (isReverbProfile(reverbProfile)) engine.applyControls({ ...snapshot.controls, reverbProfile });
  });
  root.querySelector<HTMLButtonElement>('#reset-reverb')?.addEventListener('click', () => {
    const controls = snapshot.controls;
    engine.applyControls({ ...controls, reverbSettings: {
      ...controls.reverbSettings,
      [controls.reverbProfile]: { ...DEFAULT_REVERB_SETTINGS[controls.reverbProfile] },
    } });
  });
  root.querySelector<HTMLInputElement>('#reverb-enabled')?.addEventListener('change', (event) => {
    engine.applyControls({ ...snapshot.controls, reverbBypassed: !(event.currentTarget as HTMLInputElement).checked });
  });
  bindContinuousControl('master-volume', (masterVolumeDb) => engine.applyControls({ ...snapshot.controls, masterVolumeDb }));
  root.querySelector<HTMLButtonElement>('#monitoring-toggle')?.addEventListener('click', () => {
    if (snapshot.monitoring) {
      void engine.setMonitoring(false);
    } else if (!guidanceDismissed) {
      guidanceOpen = true;
      rerenderStructure();
    } else {
      void engine.setMonitoring(true);
    }
  });
  root.querySelector<HTMLButtonElement>('#confirm-monitoring')?.addEventListener('click', () => {
    dismissGuidance();
    void engine.setMonitoring(true);
  });
  root.querySelector<HTMLButtonElement>('#dismiss-guidance')?.addEventListener('click', () => {
    dismissGuidance();
  });
  root.querySelector<HTMLButtonElement>('#clear-clip')?.addEventListener('click', () => engine.clearClip());
}

function bindContinuousControl(id: string, apply: (value: number) => void): void {
  const slider = root.querySelector<HTMLInputElement>(`#${id}-slider`);
  const numeric = root.querySelector<HTMLInputElement>(`#${id}-value`);
  slider?.addEventListener('input', () => apply(slider.valueAsNumber));
  numeric?.addEventListener('input', () => {
    if (Number.isFinite(numeric.valueAsNumber)) apply(numeric.valueAsNumber);
  });
  numeric?.addEventListener('change', () => {
    if (Number.isFinite(numeric.valueAsNumber)) apply(numeric.valueAsNumber);
    else renderControls(snapshot.controls);
  });
}

function ampModelControls(controls: AmpControlSettings): string {
  const definitions = AMP_MODEL_CONTROLS[controls.ampModel] as Readonly<Record<string, AmpKnobDefinition | AmpChoiceDefinition>>;
  const state = controls.ampSettings[controls.ampModel] as unknown as Readonly<Record<string, number | string>>;
  return Object.entries(definitions).map(([key, definition]) => {
    const id = `amp-control-${key}`;
    const value = state[key];
    if (definition.kind === 'knob') return knobControl(id, definition.label, value as number, definition);
    return `<div>
      <label for="${id}" class="${FIELD}">${definition.label}</label>
      <select id="${id}" data-amp-control="${key}">
        ${definition.options.map(([option, label]) => `<option value="${option}" ${option === value ? 'selected' : ''}>${label}</option>`).join('')}
      </select>
    </div>`;
  }).join('');
}

function bindAmpModelControls(): void {
  const definitions = AMP_MODEL_CONTROLS[snapshot.controls.ampModel] as Readonly<Record<string, AmpKnobDefinition | AmpChoiceDefinition>>;
  for (const [key, definition] of Object.entries(definitions)) {
    const apply = (value: number | string) => {
      const controls = snapshot.controls;
      const selected = controls.ampModel;
      engine.applyControls({ ...controls, ampSettings: {
        ...controls.ampSettings,
        [selected]: { ...controls.ampSettings[selected], [key]: value } as JazzAmpState,
      } });
    };
    if (definition.kind === 'knob') bindContinuousControl(`amp-control-${key}`, apply);
    else root.querySelector<HTMLSelectElement>(`#amp-control-${key}`)?.addEventListener('change', (event) => {
      const value = (event.currentTarget as HTMLSelectElement).value;
      if (definition.options.some(([option]) => option === value)) apply(value);
    });
  }
}

function reverbAccordions(controls: AmpControlSettings): string {
  const parameters = reverbParameters(controls.reverbProfile, controls.reverbSettings);
  return (['main', 'advanced'] as const).map((section) => `
    <details id="reverb-${section}" class="border-t border-border py-2" ${reverbAccordionOpen[section] ? 'open' : ''}>
      <summary class="cursor-pointer rounded-md py-2 text-sm font-medium">${section === 'main' ? 'Main Controls' : 'Advanced Controls'}</summary>
      <div class="grid gap-4 pt-2 pb-3">
        ${section === 'main' ? percentControl('reverb-amount', 'Reverb', controls.reverbAmount, AMP_CONTROL_DEFINITIONS.reverbAmount) : ''}
        ${reverbControlEntries(controls.reverbProfile, section).map(([key, definition]) => reverbParameterControl(`reverb-${key}`, parameters[key], definition)).join('')}
      </div>
    </details>`).join('');
}

function reverbParameterControl(id: string, value: number, definition: ReverbControlDefinition): string {
  return `<div>
    <div class="grid grid-cols-[1fr_auto] max-[34rem]:grid-cols-1 gap-x-4 items-center">
      <label for="${id}-slider" class="col-span-2 max-[34rem]:col-span-1 font-medium text-sm">${definition.label}</label>
      <input id="${id}-slider" aria-label="${definition.label} slider" aria-describedby="${id}-help" type="range" class="w-full accent-primary" min="${definition.minimum}" max="${definition.maximum}" step="${definition.step}" value="${value}">
      <div class="flex items-center gap-[.35rem] max-[34rem]:justify-end">
        <input id="${id}-value" aria-label="${definition.label} value" aria-describedby="${id}-help" type="number" inputmode="decimal" class="w-20 rounded-md border border-input bg-input-fill text-foreground text-right text-sm" min="${definition.minimum}" max="${definition.maximum}" step="${definition.step}" value="${value.toFixed(definition.fractionDigits)}">
        <span aria-hidden="true">${definition.unit}</span>
      </div>
    </div>
    <span id="${id}-help" class="${FIELD_HELP}">${definition.help} (${definition.unit})</span>
  </div>`;
}

function bindReverbControls(): void {
  bindContinuousControl('reverb-amount', (reverbAmount) => engine.applyControls({ ...snapshot.controls, reverbAmount }));
  for (const section of ['main', 'advanced'] as const) {
    const details = root.querySelector<HTMLDetailsElement>(`#reverb-${section}`);
    details?.addEventListener('toggle', () => {
      if (details.isConnected) reverbAccordionOpen[section] = details.open;
    });
  }
  for (const [key] of reverbControlEntries(snapshot.controls.reverbProfile)) {
    bindContinuousControl(`reverb-${key}`, (value) => {
      const controls = snapshot.controls;
      engine.applyControls({ ...controls, reverbSettings: {
        ...controls.reverbSettings,
        [controls.reverbProfile]: { ...controls.reverbSettings[controls.reverbProfile], [key]: value },
      } });
    });
  }
}

function renderControls(controls: AmpControlSettings): void {
  setControlValue('input-trim', controls.inputTrimDb, AMP_CONTROL_DEFINITIONS.inputTrimDb);
  const ampModel = root.querySelector<HTMLSelectElement>('#amp-model');
  if (ampModel !== null && ampModel.value !== controls.ampModel) ampModel.value = controls.ampModel;
  const ampModelHelp = root.querySelector<HTMLElement>('#amp-model-help');
  const modelDescription = AMP_MODELS[controls.ampModel].description;
  if (ampModelHelp !== null && ampModelHelp.textContent !== modelDescription) ampModelHelp.textContent = modelDescription;
  const ampControls = root.querySelector<HTMLElement>('#amp-model-controls');
  if (ampControls !== null && ampControls.dataset.model !== controls.ampModel) {
    ampControls.innerHTML = ampModelControls(controls);
    ampControls.dataset.model = controls.ampModel;
    bindAmpModelControls();
  }
  const definitions = AMP_MODEL_CONTROLS[controls.ampModel] as Readonly<Record<string, AmpKnobDefinition | AmpChoiceDefinition>>;
  const ampState = controls.ampSettings[controls.ampModel] as unknown as Readonly<Record<string, number | string>>;
  for (const [key, definition] of Object.entries(definitions)) {
    if (definition.kind === 'knob') setControlValue(`amp-control-${key}`, ampState[key] as number, definition);
    else {
      const select = root.querySelector<HTMLSelectElement>(`#amp-control-${key}`);
      if (select !== null && select.value !== ampState[key]) select.value = ampState[key] as string;
    }
  }
  const cabinetModel = root.querySelector<HTMLSelectElement>('#cabinet-model');
  if (cabinetModel !== null && cabinetModel.value !== controls.cabinetModel) cabinetModel.value = controls.cabinetModel;
  const cabinetModelHelp = root.querySelector<HTMLElement>('#cabinet-model-help');
  const cabinetDescription = CABINET_MODELS[controls.cabinetModel].description;
  if (cabinetModelHelp !== null && cabinetModelHelp.textContent !== cabinetDescription) cabinetModelHelp.textContent = cabinetDescription;
  const eqEnabled = root.querySelector<HTMLInputElement>('#eq-enabled');
  if (eqEnabled !== null) eqEnabled.checked = !controls.eqBypassed;
  setControlValue('bass', controls.bassDb, AMP_CONTROL_DEFINITIONS.bassDb);
  setControlValue('middle', controls.middleDb, AMP_CONTROL_DEFINITIONS.middleDb);
  setControlValue('treble', controls.trebleDb, AMP_CONTROL_DEFINITIONS.trebleDb);
  setControlValue('compression-amount', controls.compressionAmount, AMP_CONTROL_DEFINITIONS.compressionAmount);
  const compressionEnabled = root.querySelector<HTMLInputElement>('#compression-enabled');
  if (compressionEnabled !== null) compressionEnabled.checked = !controls.compressionBypassed;
  const reverbProfile = root.querySelector<HTMLSelectElement>('#reverb-profile');
  if (reverbProfile !== null && reverbProfile.value !== controls.reverbProfile) reverbProfile.value = controls.reverbProfile;
  const reverbProfileHelp = root.querySelector<HTMLElement>('#reverb-profile-help');
  const reverbDescription = REVERB_PROFILES[controls.reverbProfile].description;
  if (reverbProfileHelp !== null && reverbProfileHelp.textContent !== reverbDescription) reverbProfileHelp.textContent = reverbDescription;
  const reverbSettings = root.querySelector<HTMLElement>('#reverb-settings');
  if (reverbSettings !== null && reverbSettings.dataset.profile !== controls.reverbProfile) {
    // Replace only the module's controls, keeping the selector, focus, meters,
    // and capture UI mounted while preserving the accordion state.
    for (const section of ['main', 'advanced'] as const) {
      const details = root.querySelector<HTMLDetailsElement>(`#reverb-${section}`);
      if (details !== null) reverbAccordionOpen[section] = details.open;
    }
    reverbSettings.innerHTML = reverbAccordions(controls);
    reverbSettings.dataset.profile = controls.reverbProfile;
    bindReverbControls();
  }
  const parameters = reverbParameters(controls.reverbProfile, controls.reverbSettings);
  for (const [key, definition] of reverbControlEntries(controls.reverbProfile)) {
    setControlValue(`reverb-${key}`, parameters[key], definition);
  }
  setControlValue('reverb-amount', controls.reverbAmount, AMP_CONTROL_DEFINITIONS.reverbAmount);
  const reverbEnabled = root.querySelector<HTMLInputElement>('#reverb-enabled');
  if (reverbEnabled !== null) reverbEnabled.checked = !controls.reverbBypassed;
  setControlValue('master-volume', controls.masterVolumeDb, AMP_CONTROL_DEFINITIONS.masterVolumeDb);
}

function setControlValue(id: string, value: number, definition: ContinuousControlDefinition): void {
  const slider = root.querySelector<HTMLInputElement>(`#${id}-slider`);
  const numeric = root.querySelector<HTMLInputElement>(`#${id}-value`);
  if (slider !== null && slider.valueAsNumber !== value) slider.value = String(value);
  const formatted = value.toFixed(definition.fractionDigits);
  if (numeric !== null && numeric.value !== formatted) numeric.value = formatted;
}

function renderMeters(current: AudioSnapshot): void {
  updateMeter('input', current.meter);
  updateMeter('output', current.outputMeter);
  const indicator = root.querySelector<HTMLElement>('#clip-indicator');
  const clear = root.querySelector<HTMLButtonElement>('#clear-clip');
  if (indicator !== null) {
    indicator.className = clipIndicatorClass(current.clipLatched);
    indicator.setAttribute('aria-hidden', String(!current.clipLatched));
  }
  if (clear !== null) clear.disabled = !current.clipLatched;
  const latency = root.querySelector<HTMLElement>('#latency-value');
  if (latency !== null) {
    latency.hidden = current.latency === undefined;
    latency.textContent = latencyDescription(current.latency);
  }
}

function latencyDescription(latency: AudioSnapshot['latency']): string {
  if (latency === undefined) return '';
  const baseMs = latency.baseSeconds * 1_000;
  if (latency.outputSeconds === undefined) return `Browser output latency: ~${baseMs.toFixed(1)} ms processing buffer (device output latency not reported by this browser). Input capture latency is not measurable and adds to the total.`;
  const outputMs = latency.outputSeconds * 1_000;
  return `Browser output latency: ~${(baseMs + outputMs).toFixed(1)} ms (${baseMs.toFixed(1)} ms processing buffer + ${outputMs.toFixed(1)} ms device output). Input capture latency is not measurable and adds to the total.`;
}

function clipIndicatorClass(active: boolean): string {
  return active
    ? 'font-black tracking-[.08em] text-destructive [text-shadow:0_0_.7rem_oklch(0.704_0.191_22.216_/_70%)]'
    : 'font-black tracking-[.08em] text-muted-foreground';
}

function updateMeter(id: string, reading: InputMeterSnapshot): void {
  const meter = root.querySelector<HTMLElement>(`#${id}-meter`);
  const fill = root.querySelector<HTMLElement>(`#${id}-meter-fill`);
  const peak = root.querySelector<HTMLElement>(`#${id}-meter-peak`);
  const value = root.querySelector<HTMLElement>(`#${id}-meter-value`);
  if (meter === null || fill === null || peak === null || value === null) return;
  meter.setAttribute('aria-valuenow', String(reading.dbfs));
  fill.className = `${METER_FILL} ${meterRegion(reading.dbfs)}`;
  fill.style.width = `${100 - meterPositionPercent(reading.dbfs)}%`;
  peak.style.left = `${meterPositionPercent(reading.peakDbfs)}%`;
  value.textContent = `${reading.dbfs.toFixed(1)} dBFS`;
}

const METER_FILL = 'absolute inset-y-0 right-0 bg-black/60';

function meterPanel(id: 'input' | 'output', title: string, reading: InputMeterSnapshot, hint: string): string {
  const clip = id === 'output' ? `
    <div class="flex flex-none items-center gap-2">
      <span id="clip-indicator" class="${clipIndicatorClass(false)}" role="status" aria-hidden="true">CLIP</span>
      <button id="clear-clip" type="button" class="${COMPACT_SECONDARY_BUTTON}" disabled>Clear CLIP</button>
    </div>` : '';
  return `<section class="${PANEL}" aria-labelledby="${id}-meter-title">
    <div class="${PANEL_HEADING}">
      <h2 id="${id}-meter-title" class="${PANEL_TITLE}">${title}</h2>
      <span id="${id}-meter-value" class="text-muted-foreground text-xs">${reading.dbfs.toFixed(1)} dBFS</span>
    </div>
    <div id="${id}-meter" class="relative h-2 overflow-hidden rounded-[.2rem] bg-[linear-gradient(90deg,#2b9b53_0_80%,#d4bb45_80%_95%,#df5252_95%)]" aria-label="${id === 'input' ? 'Input' : 'Output'} level" aria-valuemin="-60" aria-valuemax="0" aria-valuenow="${reading.dbfs}" role="progressbar">
      <div id="${id}-meter-fill" class="${METER_FILL} ${meterRegion(reading.dbfs)}" style="width: ${100 - meterPositionPercent(reading.dbfs)}%"></div>
      <div id="${id}-meter-peak" class="absolute top-0 bottom-0 w-[2px] bg-white" style="left: ${meterPositionPercent(reading.peakDbfs)}%"></div>
    </div>
    <div class="flex justify-between gap-4 items-center text-muted-foreground text-xs mt-1" aria-hidden="true"><span>−60</span><span>−12</span><span>−3</span><span>0 dBFS</span></div>
    <div class="flex justify-between gap-4 items-end mt-3 max-[34rem]:items-start max-[34rem]:flex-col max-[34rem]:gap-2"><p class="text-muted-foreground text-xs">${hint}</p>${clip}</div>
  </section>`;
}

function dbControl(id: string, label: string, value: number, definition: ContinuousControlDefinition): string {
  return `<div class="grid grid-cols-[1fr_auto] max-[34rem]:grid-cols-1 gap-x-4 items-center">
    <label for="${id}-slider" class="col-span-2 max-[34rem]:col-span-1 font-medium text-sm">${label}</label>
    <input id="${id}-slider" aria-label="${label} slider" type="range" class="w-full accent-primary" min="${definition.minimum}" max="${definition.maximum}" step="${definition.step}" value="${value}">
    <div class="flex items-center gap-[.35rem] max-[34rem]:justify-end">
      <input id="${id}-value" aria-label="${label} value" type="number" inputmode="decimal" class="${NUMERIC_INPUT}" min="${definition.minimum}" max="${definition.maximum}" step="${definition.step}" value="${value.toFixed(definition.fractionDigits)}">
      <span aria-hidden="true">dB</span>
    </div>
  </div>`;
}

function knobControl(id: string, label: string, value: number, definition: AmpKnobDefinition): string {
  return `<div class="grid grid-cols-[1fr_auto] max-[34rem]:grid-cols-1 gap-x-4 items-center">
    <label for="${id}-slider" class="col-span-2 max-[34rem]:col-span-1 font-medium text-sm">${label}</label>
    <input id="${id}-slider" aria-label="${label} slider" type="range" class="w-full accent-primary" min="${definition.minimum}" max="${definition.maximum}" step="${definition.step}" value="${value}">
    <input id="${id}-value" aria-label="${label} value" type="number" inputmode="decimal" class="${NUMERIC_INPUT}" min="${definition.minimum}" max="${definition.maximum}" step="${definition.step}" value="${value.toFixed(definition.fractionDigits)}">
  </div>`;
}

const NUMERIC_INPUT = 'w-14 rounded-md border border-input bg-input-fill text-foreground text-right text-sm';

function percentControl(id: string, label: string, value: number, definition: ContinuousControlDefinition): string {
  return `<div class="grid grid-cols-[1fr_auto] max-[34rem]:grid-cols-1 gap-x-4 items-center">
    <label for="${id}-slider" class="col-span-2 max-[34rem]:col-span-1 font-medium text-sm">${label}</label>
    <input id="${id}-slider" aria-label="${label} slider" type="range" class="w-full accent-primary" min="${definition.minimum}" max="${definition.maximum}" step="${definition.step}" value="${value}">
    <div class="flex items-center gap-[.35rem] max-[34rem]:justify-end">
      <input id="${id}-value" aria-label="${label} value" type="number" inputmode="numeric" class="${NUMERIC_INPUT}" min="${definition.minimum}" max="${definition.maximum}" step="${definition.step}" value="${value.toFixed(definition.fractionDigits)}">
      <span aria-hidden="true">%</span>
    </div>
  </div>`;
}

function connectionLabel(current: AudioSnapshot): string {
  if (current.lifecycle === 'connecting') return 'Connecting…';
  if (current.lifecycle === 'monitoring') return 'Connected — monitoring';
  if (current.lifecycle === 'connected-muted') return 'Connected — muted';
  if (current.lifecycle === 'interrupted') return 'Audio interrupted';
  if (current.lifecycle === 'error') return 'Connection interrupted';
  return 'Disconnected';
}

function connectionDescription(current: AudioSnapshot): string {
  if (current.lifecycle === 'monitoring') return 'Input is connected and Processed Monitoring is on.';
  if (current.lifecycle === 'connected-muted') return 'Input is connected and metering. Processed Monitoring is off.';
  if (current.lifecycle === 'interrupted') return 'Audio was interrupted. Resume Processed Monitoring when you are ready.';
  if (current.lifecycle === 'connecting') return 'Waiting for browser permission.';
  return 'Start by connecting an audio interface or microphone visible to your browser.';
}

interface RecoveryPresentation {
  readonly connectButtonLabel: string;
  readonly inputMessage: string | undefined;
  readonly monitoringMessage: string | undefined;
  readonly monitoringButtonLabel: string;
  readonly monitoringDisabled: boolean;
  readonly retrySelectedOutput: boolean;
}

function recoveryPresentation(current: AudioSnapshot, connected: boolean): RecoveryPresentation {
  const presentation: RecoveryPresentation = {
    connectButtonLabel: connected ? 'Reconnect Input' : 'Connect Input',
    inputMessage: undefined,
    monitoringMessage: undefined,
    monitoringButtonLabel: current.monitoring ? 'Disable Monitoring' : 'Enable Monitoring',
    monitoringDisabled: !connected,
    retrySelectedOutput: false,
  };
  if (current.recovery === undefined) return presentation;

  switch (current.recovery.action) {
    case 'reconnect-input':
      return {
        ...presentation,
        connectButtonLabel: current.recovery.code === 'permission-denied'
          || current.recovery.code === 'no-input-devices'
          || current.recovery.code === 'input-connection-failed'
          ? 'Try Again'
          : 'Reconnect Input',
        inputMessage: current.recovery.message,
      };
    case 'resume-monitoring':
      return {
        ...presentation,
        monitoringMessage: current.recovery.message,
        monitoringButtonLabel: 'Resume Monitoring',
      };
    case 'choose-output':
      return {
        ...presentation,
        monitoringButtonLabel: 'Choose Output Before Monitoring',
        monitoringDisabled: true,
        retrySelectedOutput: current.outputRouting.selectedDeviceId !== undefined
          && current.outputRouting.devices.some((device) => device.id === current.outputRouting.selectedDeviceId),
      };
  }
}

function routingDescription(current: AudioSnapshot): string {
  if (current.outputRouting.mode === 'selectable') return 'Choose a permitted browser-visible output, or keep the system default.';
  if (current.outputRouting.mode === 'system') return 'This browser does not expose output selection. Output follows your browser and system sound settings.';
  return 'Output routing will be identified after an input connects.';
}

function deviceSelector(current: AudioSnapshot): string {
  const selectedUnavailable = unavailableDeviceOption(current.selectedInputDeviceId, current.devices, 'input');
  const options = current.devices.map((device) => `<option value="${escapeHtml(device.id)}" ${device.id === current.selectedInputDeviceId ? 'selected' : ''}>${escapeHtml(device.label)}</option>`).join('');
  return `<label class="${FIELD}" for="input-device">Input device</label><select id="input-device" aria-describedby="device-help"><option value="">System default</option>${selectedUnavailable}${options}</select><span id="device-help" class="${FIELD_HELP}">Choose a device to reconnect to it explicitly.</span>`;
}

function channelSelector(current: AudioSnapshot): string {
  const options = Array.from({ length: current.inputChannelCount }, (_, channel) => `<option value="${channel}" ${channel === current.inputChannel ? 'selected' : ''}>Channel ${channel + 1}</option>`).join('');
  return `<label class="${FIELD}" for="input-channel">Input Channel</label><select id="input-channel">${options}</select>`;
}

function outputSelector(current: AudioSnapshot, connected: boolean): string {
  if (!connected || current.outputRouting.mode !== 'selectable') return '';
  const selectedUnavailable = unavailableDeviceOption(current.outputRouting.selectedDeviceId, current.outputRouting.devices, 'output');
  const options = current.outputRouting.devices.map((device) => `<option value="${escapeHtml(device.id)}" ${device.id === current.outputRouting.selectedDeviceId ? 'selected' : ''}>${escapeHtml(device.label)}</option>`).join('');
  return `<label class="${FIELD}" for="output-device">Output device</label><select id="output-device"><option value="">System default</option>${selectedUnavailable}${options}</select>`;
}

function unavailableDeviceOption(
  selectedDeviceId: string | undefined,
  devices: readonly { readonly id: string }[],
  kind: 'input' | 'output',
): string {
  return selectedDeviceId !== undefined && !devices.some((device) => device.id === selectedDeviceId)
    ? `<option value="${escapeHtml(selectedDeviceId)}" selected>Unavailable ${kind} (selected)</option>`
    : '';
}

function hardwareGuidance(): string {
  return `<aside class="mt-4 p-4 border border-warning/30 rounded-lg bg-warning/10" aria-labelledby="guidance-title">
    <h3 id="guidance-title" class="text-sm font-medium mb-3">Before you monitor</h3>
    <p class="mb-3 text-sm">Disable Hardware Direct Monitoring on your audio interface so you hear the processed path, and use headphones.</p>
    <div class="${ACTIONS}">
      <button id="confirm-monitoring" type="button" class="${ACTION_BUTTON}">Checked — Enable Monitoring</button>
      <button id="dismiss-guidance" type="button" class="${SECONDARY_ACTION_BUTTON}">Dismiss reminder</button>
    </div>
  </aside>`;
}

function dismissGuidance(): void {
  guidanceDismissed = true;
  guidanceOpen = false;
  updateStoredPreferences({ hardwareDirectMonitoringGuidanceDismissed: true });
  rerenderStructure();
}

function rerenderStructure(): void {
  renderStructure(snapshot);
  renderControls(snapshot.controls);
  renderMeters(snapshot);
}

function updateStoredPreferences(change: Partial<Omit<StoredWorkbenchPreferences, 'version'>>): void {
  workbenchPreferences = { ...workbenchPreferences, ...change };
  preferencesStore.save(workbenchPreferences);
}

function browserStorage(): Storage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}

engine.subscribe(render);
