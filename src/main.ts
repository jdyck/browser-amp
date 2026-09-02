import { AudioEngine } from './audio/AudioEngine';
import type { AudioSnapshot, InputMeterSnapshot } from './audio/types';
import {
  AMP_CONTROL_DEFINITIONS,
  AMP_MODELS,
  CABINET_MODELS,
  REVERB_PROFILES,
  isAmpModel,
  isCabinetModel,
  isReverbProfile,
  type AmpControlSettings,
  type ContinuousControlDefinition,
} from './controls';
import {
  AMP_MODEL_CONTROLS,
  type AmpChoiceDefinition,
  type AmpKnobDefinition,
  type JazzAmpState,
} from './ampModels';
import { WorkbenchPreferencesStore, resetControls, type StoredWorkbenchPreferences } from './settings';
import {
  DEFAULT_REVERB_SETTINGS,
  reverbControlEntries,
  reverbParameters,
  type ReverbControlDefinition,
} from './reverbSettings';
import './style.css';

type WorkspaceSection = 'input' | 'amp' | 'compression' | 'eq' | 'reverb' | 'master';

interface SectionDefinition {
  readonly id: WorkspaceSection;
  readonly label: string;
  readonly title: string;
  readonly description: string;
}

const SECTIONS: readonly SectionDefinition[] = [
  { id: 'input', label: 'Input', title: 'Start with a clean signal', description: 'Connect your guitar, set the input level, and quiet the gaps before shaping your tone.' },
  { id: 'amp', label: 'Amp + Cabinet', title: 'Choose your voice', description: 'Pair an amp character with a cabinet response, then tune the model to your playing.' },
  { id: 'compression', label: 'Compression', title: 'Control the dynamics', description: 'Bring quiet notes forward and smooth hard peaks without flattening your touch.' },
  { id: 'eq', label: 'EQ', title: 'Shape the spectrum', description: 'Balance lows, focus the mids, and add or remove air from the finished amp sound.' },
  { id: 'reverb', label: 'Reverb', title: 'Add some space', description: 'Choose a room, plate, spring, or hall and place your guitar inside it.' },
  { id: 'master', label: 'Master', title: 'Set the final level', description: 'Choose the listening output, set the final volume, and check the signal before you play.' },
] as const;

const FIELD = 'field-label';
const FIELD_HELP = 'field-help';

const preferencesStore = new WorkbenchPreferencesStore(browserStorage());
let workbenchPreferences = preferencesStore.load();
const engine = new AudioEngine();
engine.applyControls(workbenchPreferences.controls);

const app = document.querySelector<HTMLElement>('#app');
if (app === null) throw new Error('Application root is missing.');
const root = app;

let snapshot = engine.snapshot;
let activeSection: WorkspaceSection = sectionFromHash();
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
  return root.querySelector('#workspace-shell') === null
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
  const connected = isConnected(current);
  const recovery = recoveryPresentation(current, connected);
  const section = SECTIONS.find((item) => item.id === activeSection) ?? SECTIONS[0];

  root.innerHTML = `
    <div id="workspace-shell" class="workspace-shell">
      ${topBar(current, recovery)}
      <div class="workspace-body">
        ${sidebar()}
        <main class="workspace-main" aria-labelledby="section-title">
          <section class="section-view" data-section="${section.id}">
            <div class="section-heading">
              <div>
                <p class="section-kicker">${String(sectionNumber(section.id)).padStart(2, '0')} / ${String(SECTIONS.length).padStart(2, '0')}</p>
                <h1 id="section-title">${section.title}</h1>
                <p>${section.description}</p>
              </div>
              ${sectionAction(section.id, current, recovery)}
            </div>
            ${sectionContent(section.id, current, recovery)}
            ${workspaceFooter(section.id)}
          </section>
        </main>
      </div>
      ${guidanceOpen ? hardwareGuidance() : ''}
    </div>`;

  bindStructureEvents();
}

function topBar(current: AudioSnapshot, recovery: RecoveryPresentation): string {
  return `<header class="topbar">
    <div class="brand" aria-label="Browser Amp">
      <span class="brand-art" aria-hidden="true">[img]</span>
      <span>Browser Amp</span>
    </div>
    <div class="monitor-control">
      <span>Monitoring <strong id="monitoring-state">${current.monitoring ? 'On' : 'Off'}</strong></span>
      <button
        id="monitoring-toggle"
        type="button"
        class="toggle-button ${current.monitoring ? 'is-on' : ''}"
        aria-label="${recovery.monitoringButtonLabel}"
        aria-pressed="${String(current.monitoring)}"
        ${recovery.monitoringDisabled ? 'disabled' : ''}
      ><span aria-hidden="true"></span></button>
    </div>
    <div class="topbar-meters">
      ${topMeter('input', 'Input', current.meter)}
      ${topMeter('output', 'Output', current.outputMeter)}
    </div>
  </header>`;
}

function topMeter(id: 'input' | 'output', label: string, reading: InputMeterSnapshot): string {
  return `<section class="top-meter" aria-labelledby="${id}-meter-title">
    <div class="top-meter-heading">
      <h2 id="${id}-meter-title">${label}</h2>
      <span id="${id}-meter-value">${reading.dbfs.toFixed(1)} dBFS</span>
    </div>
    <div id="${id}-meter" class="meter-track" aria-label="${label} level" aria-valuemin="-60" aria-valuemax="0" aria-valuenow="${reading.dbfs}" role="progressbar">
      <div class="meter-scale" aria-hidden="true"></div>
      <div id="${id}-meter-fill" class="meter-fill ${meterRegion(reading.dbfs)}" style="width: ${100 - meterPositionPercent(reading.dbfs)}%"></div>
      <div id="${id}-meter-peak" class="meter-peak" style="left: ${meterPositionPercent(reading.peakDbfs)}%"></div>
    </div>
  </section>`;
}

function sidebar(): string {
  return `<aside class="sidebar" aria-label="Amp sections">
    <nav class="stage-nav">
      ${SECTIONS.map((section, index) => `<button
        type="button"
        class="stage-link ${section.id === activeSection ? 'is-active' : ''}"
        data-section-target="${section.id}"
        aria-current="${section.id === activeSection ? 'step' : 'false'}"
      ><span class="stage-marker" aria-hidden="true">${index + 1}</span><span>${section.label}</span></button>`).join('')}
    </nav>
  </aside>`;
}

function sectionAction(id: WorkspaceSection, current: AudioSnapshot, recovery: RecoveryPresentation): string {
  if (id === 'input') {
    return `<div class="section-action">
      <output class="connection-state" role="status">${connectionLabel(current)}</output>
      <button id="connect" type="button" class="primary-action" ${current.lifecycle === 'connecting' ? 'disabled' : ''}>${recovery.connectButtonLabel}</button>
      ${isConnected(current) ? '<button id="disconnect" type="button" class="secondary-action">Disconnect</button>' : ''}
    </div>`;
  }
  if (id === 'compression') return stageToggle('compression-enabled', 'Enable Compression', !current.controls.compressionBypassed);
  if (id === 'eq') return stageToggle('eq-enabled', 'Enable Studio EQ', !current.controls.eqBypassed);
  if (id === 'reverb') return stageToggle('reverb-enabled', 'Enable Reverb', !current.controls.reverbBypassed);
  if (id === 'master') return '<button id="reset-controls" type="button" class="secondary-action">Reset Controls</button>';
  return '<span class="always-on">Signal stage always on</span>';
}

function stageToggle(id: string, label: string, checked: boolean): string {
  return `<label class="stage-toggle" for="${id}">
    <span>${label}</span>
    <input id="${id}" type="checkbox" ${checked ? 'checked' : ''}>
    <span class="toggle-track" aria-hidden="true"><span></span></span>
  </label>`;
}

function sectionContent(id: WorkspaceSection, current: AudioSnapshot, recovery: RecoveryPresentation): string {
  switch (id) {
    case 'input': return inputSection(current, recovery);
    case 'amp': return ampSection(current.controls);
    case 'compression': return compressionSection(current);
    case 'eq': return eqSection(current.controls);
    case 'reverb': return reverbSection(current.controls);
    case 'master': return masterSection(current, recovery);
  }
}

function inputSection(current: AudioSnapshot, recovery: RecoveryPresentation): string {
  return `<div class="section-stack">
    <section class="panel" aria-labelledby="input-title">
      <div class="panel-heading">
        <div><p class="panel-eyebrow">Source</p><h2 id="input-title">Live Guitar Input</h2></div>
        <span class="placeholder-art" aria-hidden="true">[img]</span>
      </div>
      <p id="connection-description" class="panel-description">${connectionDescription(current)}</p>
      <div class="select-grid">
        <div>${deviceSelector(current)}</div>
        ${current.inputChannelCount > 1 ? `<div>${channelSelector(current)}</div>` : ''}
      </div>
      ${current.rawCaptureWarnings.map((warning) => `<p class="message warning" role="alert">${escapeHtml(warning)}</p>`).join('')}
      ${recovery.inputMessage === undefined ? '' : `<p class="message error" role="alert">${escapeHtml(recovery.inputMessage)}</p>`}
    </section>

    <section class="panel control-panel" aria-label="Input Trim">
      <div class="panel-heading compact"><div><p class="panel-eyebrow">Level</p><h2>Input Trim</h2></div></div>
      ${dbControl('input-trim', 'Input Trim', current.controls.inputTrimDb, AMP_CONTROL_DEFINITIONS.inputTrimDb, 'Set the level feeding the amp without clipping the input.')}
    </section>

    <section class="panel control-panel" aria-label="Noise Suppression">
      <div class="panel-heading">
        <div><p class="panel-eyebrow">Cleanup</p><h2>Noise Gate</h2></div>
        ${stageToggle('noise-gate-enabled', 'Enable Noise Suppression', !current.controls.noiseGateBypassed)}
      </div>
      <div class="control-list">
        ${dbControl('noise-gate-threshold', 'Threshold', current.controls.noiseGateThresholdDb, AMP_CONTROL_DEFINITIONS.noiseGateThresholdDb, 'Choose when the gate opens.')}
        ${dbControl('noise-gate-range', 'Range', current.controls.noiseGateRangeDb, AMP_CONTROL_DEFINITIONS.noiseGateRangeDb, 'Set the maximum reduction during quiet passages.')}
        ${unitControl('noise-gate-release', 'Release', current.controls.noiseGateReleaseMs, AMP_CONTROL_DEFINITIONS.noiseGateReleaseMs, 'ms', 'Control how gradually the gate settles.')}
      </div>
      <div class="live-readout"><span>Current reduction</span><strong id="noise-gate-reduction" aria-label="Noise suppression reduction">${current.noiseGateReductionDb.toFixed(1)} dB</strong></div>
    </section>
  </div>`;
}

function ampSection(controls: AmpControlSettings): string {
  return `<div class="section-stack">
    <section class="panel" aria-label="Amp Model">
      <div class="panel-heading compact"><div><p class="panel-eyebrow">Amp model</p><h2>Pick an amplifier</h2></div></div>
      ${choiceSelector('amp-model', 'Amp Model', controls.ampModel, AMP_MODELS)}
      <span id="amp-model-help" class="choice-help">${AMP_MODELS[controls.ampModel].description}</span>
      <div id="amp-model-controls" class="model-controls" data-model="${controls.ampModel}">${ampModelControls(controls)}</div>
    </section>

    <section class="panel" aria-label="Cabinet">
      <div class="panel-heading compact"><div><p class="panel-eyebrow">Cabinet</p><h2>Choose the speaker response</h2></div></div>
      ${choiceSelector('cabinet-model', 'Cabinet', controls.cabinetModel, CABINET_MODELS)}
      <span id="cabinet-model-help" class="choice-help">${CABINET_MODELS[controls.cabinetModel].description}</span>
    </section>
  </div>`;
}

function compressionSection(current: AudioSnapshot): string {
  return `<div class="section-stack">
    <section class="panel hero-panel" aria-label="Compression">
      <div class="hero-copy"><p class="panel-eyebrow">Studio compressor</p><h2>Even out the performance</h2><p>Move from transparent control to a more forward, sustained feel.</p></div>
      <span class="placeholder-art large" aria-hidden="true">[img]</span>
    </section>
    <section class="panel control-panel" aria-label="Compression Controls">
      <div class="control-list">
        ${percentControl('compression-amount', 'Amount', current.controls.compressionAmount, AMP_CONTROL_DEFINITIONS.compressionAmount, 'Blend in more control and sustain.')}
      </div>
      <div class="option-row">
        <label class="check-option" for="compression-level-match"><input id="compression-level-match" type="checkbox" ${current.controls.compressionLevelMatch ? 'checked' : ''}><span>Level Match</span></label>
        <div class="live-readout"><span>Gain reduction</span><strong id="compression-reduction" aria-label="Compression reduction">${current.compressionReductionDb.toFixed(1)} dB</strong></div>
      </div>
    </section>
  </div>`;
}

function eqSection(controls: AmpControlSettings): string {
  return `<section class="panel control-panel" aria-label="Studio EQ">
    <div class="panel-heading"><div><p class="panel-eyebrow">Four-band studio EQ</p><h2>Fine tune the tone</h2></div><span class="placeholder-art" aria-hidden="true">[img]</span></div>
    <div class="control-list eq-controls">
      ${dbControl('low-shelf', 'Low', controls.lowShelfDb, AMP_CONTROL_DEFINITIONS.lowShelfDb, 'Broad shelf fixed at 120 Hz.')}
      ${unitControl('low-mid-frequency', 'Low Mid Frequency', controls.lowMidFrequencyHz, AMP_CONTROL_DEFINITIONS.lowMidFrequencyHz, 'Hz', 'Choose the center of the lower-mid band.')}
      ${dbControl('low-mid', 'Low Mid', controls.lowMidDb, AMP_CONTROL_DEFINITIONS.lowMidDb, 'Cut mud or add body around the selected frequency.')}
      ${unitControl('upper-mid-frequency', 'Upper Mid Frequency', controls.upperMidFrequencyHz, AMP_CONTROL_DEFINITIONS.upperMidFrequencyHz, 'Hz', 'Choose the center of the upper-mid band.')}
      ${dbControl('upper-mid', 'Upper Mid', controls.upperMidDb, AMP_CONTROL_DEFINITIONS.upperMidDb, 'Shape presence around the selected frequency.')}
      ${dbControl('high-shelf', 'High', controls.highShelfDb, AMP_CONTROL_DEFINITIONS.highShelfDb, 'Broad shelf fixed at 3.2 kHz.')}
    </div>
  </section>`;
}

function reverbSection(controls: AmpControlSettings): string {
  return `<div class="section-stack">
    <section class="panel reverb-choice-panel" aria-label="Reverb">
      <div class="panel-heading compact">
        <p class="panel-eyebrow">Reverb type</p>
        <button id="reset-reverb" type="button" class="text-action" title="Restore only this module's Main and Advanced settings. Amount and Enable Reverb stay unchanged.">Reset This Reverb</button>
      </div>
      ${choiceSelector('reverb-profile', 'Reverb Module', controls.reverbProfile, REVERB_PROFILES)}
      <span id="reverb-profile-help" class="choice-help">${REVERB_PROFILES[controls.reverbProfile].description}</span>
    </section>
    <section id="reverb-settings" class="panel control-panel reverb-control-panel" data-profile="${controls.reverbProfile}" aria-label="Reverb Controls">${reverbAccordions(controls)}</section>
  </div>`;
}

function masterSection(current: AudioSnapshot, recovery: RecoveryPresentation): string {
  const connected = isConnected(current);
  return `<div class="section-stack">
    <section class="panel" aria-labelledby="monitoring-title">
      <div class="panel-heading"><div><p class="panel-eyebrow">Output routing</p><h2 id="monitoring-title">Processed Monitoring</h2></div><span class="placeholder-art" aria-hidden="true">[img]</span></div>
      <p class="panel-description">${routingDescription(current)}</p>
      ${outputSelector(current, connected)}
      <p id="latency-value" class="${FIELD_HELP}" ${current.latency === undefined ? 'hidden' : ''}>${latencyDescription(current.latency)}</p>
      ${current.outputRouting.error === undefined ? '' : `<p class="message error" role="alert">${escapeHtml(current.outputRouting.error)}</p>`}
      ${recovery.monitoringMessage === undefined ? '' : `<p class="message error" role="alert">${escapeHtml(recovery.monitoringMessage)}</p>`}
      ${recovery.retrySelectedOutput ? '<button id="retry-output" type="button" class="secondary-action">Retry Selected Output</button>' : ''}
    </section>
    <section class="panel control-panel" aria-label="Master Volume">
      <div class="panel-heading compact"><div><p class="panel-eyebrow">Final gain</p><h2>Master Volume</h2></div></div>
      ${dbControl('master-volume', 'Master', current.controls.masterVolumeDb, AMP_CONTROL_DEFINITIONS.masterVolumeDb, 'Set the final level sent to the browser output.')}
      <div class="clip-row"><span id="clip-indicator" class="clip-indicator" role="status" aria-hidden="true">CLIP</span><button id="clear-clip" type="button" class="secondary-action compact" disabled>Clear CLIP</button></div>
    </section>
  </div>`;
}

function choiceSelector(
  id: string,
  label: string,
  selected: string,
  options: Readonly<Record<string, { readonly label: string; readonly description: string }>>,
): string {
  return `<label class="visually-hidden" for="${id}">${label}</label>
    <select id="${id}" class="visually-hidden" aria-describedby="${id}-help">
      ${Object.entries(options).map(([value, option]) => `<option value="${value}" ${value === selected ? 'selected' : ''}>${option.label}</option>`).join('')}
    </select>
    <div class="choice-grid" role="list" aria-label="${label} choices">
      ${Object.entries(options).map(([value, option]) => `<button type="button" class="choice-card ${value === selected ? 'is-selected' : ''}" data-select-id="${id}" data-select-value="${value}" aria-pressed="${String(value === selected)}"><span class="choice-art" aria-hidden="true">[img]</span><span>${option.label}</span></button>`).join('')}
    </div>`;
}

function workspaceFooter(id: WorkspaceSection): string {
  const index = sectionNumber(id) - 1;
  const previous = SECTIONS[index - 1];
  const next = SECTIONS[index + 1];
  return `<footer class="workspace-footer">
    <div>${previous === undefined ? '' : `<button type="button" class="secondary-action footer-action" data-section-target="${previous.id}">Back: ${previous.label}</button>`}</div>
    <div class="progress-dots" aria-label="Section progress">
      ${SECTIONS.map((section) => `<button type="button" class="progress-dot ${section.id === id ? 'is-active' : ''}" data-section-target="${section.id}" aria-label="Go to ${section.label}" aria-current="${section.id === id ? 'step' : 'false'}"></button>`).join('')}
    </div>
    <div>${next === undefined ? '' : `<button type="button" class="primary-action footer-action" data-section-target="${next.id}">Next: ${next.label}</button>`}</div>
  </footer>`;
}

function bindStructureEvents(): void {
  root.querySelectorAll<HTMLButtonElement>('[data-section-target]').forEach((button) => {
    button.addEventListener('click', () => {
      const target = button.dataset.sectionTarget;
      if (!isWorkspaceSection(target) || target === activeSection) return;
      activeSection = target;
      window.history.replaceState(null, '', `#${target}`);
      rerenderStructure();
      root.querySelector<HTMLElement>('#section-title')?.focus({ preventScroll: true });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  });
  bindChoiceCards();
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
  root.querySelector<HTMLButtonElement>('#retry-output')?.addEventListener('click', () => void engine.selectOutput(snapshot.outputRouting.selectedDeviceId));
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
  bindContinuousControl('noise-gate-threshold', (noiseGateThresholdDb) => engine.applyControls({ ...snapshot.controls, noiseGateThresholdDb }));
  bindContinuousControl('noise-gate-range', (noiseGateRangeDb) => engine.applyControls({ ...snapshot.controls, noiseGateRangeDb }));
  bindContinuousControl('noise-gate-release', (noiseGateReleaseMs) => engine.applyControls({ ...snapshot.controls, noiseGateReleaseMs }));
  root.querySelector<HTMLInputElement>('#noise-gate-enabled')?.addEventListener('change', (event) => {
    engine.applyControls({ ...snapshot.controls, noiseGateBypassed: !(event.currentTarget as HTMLInputElement).checked });
  });
  root.querySelector<HTMLInputElement>('#eq-enabled')?.addEventListener('change', (event) => {
    engine.applyControls({ ...snapshot.controls, eqBypassed: !(event.currentTarget as HTMLInputElement).checked });
  });
  bindContinuousControl('low-shelf', (lowShelfDb) => engine.applyControls({ ...snapshot.controls, lowShelfDb }));
  bindContinuousControl('low-mid-frequency', (lowMidFrequencyHz) => engine.applyControls({ ...snapshot.controls, lowMidFrequencyHz }));
  bindContinuousControl('low-mid', (lowMidDb) => engine.applyControls({ ...snapshot.controls, lowMidDb }));
  bindContinuousControl('upper-mid-frequency', (upperMidFrequencyHz) => engine.applyControls({ ...snapshot.controls, upperMidFrequencyHz }));
  bindContinuousControl('upper-mid', (upperMidDb) => engine.applyControls({ ...snapshot.controls, upperMidDb }));
  bindContinuousControl('high-shelf', (highShelfDb) => engine.applyControls({ ...snapshot.controls, highShelfDb }));
  bindContinuousControl('compression-amount', (compressionAmount) => engine.applyControls({ ...snapshot.controls, compressionAmount }));
  root.querySelector<HTMLInputElement>('#compression-enabled')?.addEventListener('change', (event) => {
    engine.applyControls({ ...snapshot.controls, compressionBypassed: !(event.currentTarget as HTMLInputElement).checked });
  });
  root.querySelector<HTMLInputElement>('#compression-level-match')?.addEventListener('change', (event) => {
    engine.applyControls({ ...snapshot.controls, compressionLevelMatch: (event.currentTarget as HTMLInputElement).checked });
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
    if (snapshot.monitoring) void engine.setMonitoring(false);
    else if (!guidanceDismissed) {
      guidanceOpen = true;
      rerenderStructure();
    } else void engine.setMonitoring(true);
  });
  root.querySelector<HTMLButtonElement>('#confirm-monitoring')?.addEventListener('click', () => {
    dismissGuidance();
    void engine.setMonitoring(true);
  });
  root.querySelector<HTMLButtonElement>('#dismiss-guidance')?.addEventListener('click', dismissGuidance);
  root.querySelector<HTMLButtonElement>('#clear-clip')?.addEventListener('click', () => engine.clearClip());
}

function bindChoiceCards(): void {
  root.querySelectorAll<HTMLButtonElement>('[data-select-id]').forEach((button) => {
    button.addEventListener('click', () => {
      const select = root.querySelector<HTMLSelectElement>(`#${button.dataset.selectId ?? ''}`);
      if (select === null || button.dataset.selectValue === undefined) return;
      select.value = button.dataset.selectValue;
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
  });
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
    return `<div class="select-control"><label for="${id}" class="${FIELD}">${definition.label}</label><select id="${id}" data-amp-control="${key}">${definition.options.map(([option, label]) => `<option value="${option}" ${option === value ? 'selected' : ''}>${label}</option>`).join('')}</select></div>`;
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
    <details id="reverb-${section}" class="reverb-accordion" ${reverbAccordionOpen[section] ? 'open' : ''}>
      <summary>${section === 'main' ? 'Main Controls' : 'Advanced Controls'}</summary>
      <div class="control-list">
        ${section === 'main' ? percentControl('reverb-amount', 'Reverb', controls.reverbAmount, AMP_CONTROL_DEFINITIONS.reverbAmount, 'Set how much ambience is mixed in.') : ''}
        ${reverbControlEntries(controls.reverbProfile, section).map(([key, definition]) => reverbParameterControl(`reverb-${key}`, parameters[key], definition)).join('')}
      </div>
    </details>`).join('');
}

function reverbParameterControl(id: string, value: number, definition: ReverbControlDefinition): string {
  return continuousControl(id, definition.label, value, definition, definition.unit, definition.help);
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
  if (ampModelHelp !== null) ampModelHelp.textContent = AMP_MODELS[controls.ampModel].description;
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
  const cabinetHelp = root.querySelector<HTMLElement>('#cabinet-model-help');
  if (cabinetHelp !== null) cabinetHelp.textContent = CABINET_MODELS[controls.cabinetModel].description;
  setControlValue('noise-gate-threshold', controls.noiseGateThresholdDb, AMP_CONTROL_DEFINITIONS.noiseGateThresholdDb);
  setControlValue('noise-gate-range', controls.noiseGateRangeDb, AMP_CONTROL_DEFINITIONS.noiseGateRangeDb);
  setControlValue('noise-gate-release', controls.noiseGateReleaseMs, AMP_CONTROL_DEFINITIONS.noiseGateReleaseMs);
  setCheckbox('noise-gate-enabled', !controls.noiseGateBypassed);
  setCheckbox('eq-enabled', !controls.eqBypassed);
  setControlValue('low-shelf', controls.lowShelfDb, AMP_CONTROL_DEFINITIONS.lowShelfDb);
  setControlValue('low-mid-frequency', controls.lowMidFrequencyHz, AMP_CONTROL_DEFINITIONS.lowMidFrequencyHz);
  setControlValue('low-mid', controls.lowMidDb, AMP_CONTROL_DEFINITIONS.lowMidDb);
  setControlValue('upper-mid-frequency', controls.upperMidFrequencyHz, AMP_CONTROL_DEFINITIONS.upperMidFrequencyHz);
  setControlValue('upper-mid', controls.upperMidDb, AMP_CONTROL_DEFINITIONS.upperMidDb);
  setControlValue('high-shelf', controls.highShelfDb, AMP_CONTROL_DEFINITIONS.highShelfDb);
  setControlValue('compression-amount', controls.compressionAmount, AMP_CONTROL_DEFINITIONS.compressionAmount);
  setCheckbox('compression-enabled', !controls.compressionBypassed);
  setCheckbox('compression-level-match', controls.compressionLevelMatch);
  const reverbProfile = root.querySelector<HTMLSelectElement>('#reverb-profile');
  if (reverbProfile !== null && reverbProfile.value !== controls.reverbProfile) reverbProfile.value = controls.reverbProfile;
  const reverbHelp = root.querySelector<HTMLElement>('#reverb-profile-help');
  if (reverbHelp !== null) reverbHelp.textContent = REVERB_PROFILES[controls.reverbProfile].description;
  const reverbSettings = root.querySelector<HTMLElement>('#reverb-settings');
  if (reverbSettings !== null && reverbSettings.dataset.profile !== controls.reverbProfile) {
    for (const section of ['main', 'advanced'] as const) {
      const details = root.querySelector<HTMLDetailsElement>(`#reverb-${section}`);
      if (details !== null) reverbAccordionOpen[section] = details.open;
    }
    reverbSettings.innerHTML = reverbAccordions(controls);
    reverbSettings.dataset.profile = controls.reverbProfile;
    bindReverbControls();
  }
  const parameters = reverbParameters(controls.reverbProfile, controls.reverbSettings);
  for (const [key, definition] of reverbControlEntries(controls.reverbProfile)) setControlValue(`reverb-${key}`, parameters[key], definition);
  setControlValue('reverb-amount', controls.reverbAmount, AMP_CONTROL_DEFINITIONS.reverbAmount);
  setCheckbox('reverb-enabled', !controls.reverbBypassed);
  setControlValue('master-volume', controls.masterVolumeDb, AMP_CONTROL_DEFINITIONS.masterVolumeDb);
  syncChoiceCards('amp-model', controls.ampModel);
  syncChoiceCards('cabinet-model', controls.cabinetModel);
  syncChoiceCards('reverb-profile', controls.reverbProfile);
}

function setCheckbox(id: string, checked: boolean): void {
  const input = root.querySelector<HTMLInputElement>(`#${id}`);
  if (input !== null) input.checked = checked;
}

function syncChoiceCards(id: string, value: string): void {
  root.querySelectorAll<HTMLButtonElement>(`[data-select-id="${id}"]`).forEach((button) => {
    const selected = button.dataset.selectValue === value;
    button.classList.toggle('is-selected', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
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
  const noiseGateReduction = root.querySelector<HTMLElement>('#noise-gate-reduction');
  if (noiseGateReduction !== null) noiseGateReduction.textContent = `${current.noiseGateReductionDb.toFixed(1)} dB`;
  const compressionReduction = root.querySelector<HTMLElement>('#compression-reduction');
  if (compressionReduction !== null) compressionReduction.textContent = `${current.compressionReductionDb.toFixed(1)} dB`;
  const indicator = root.querySelector<HTMLElement>('#clip-indicator');
  const clear = root.querySelector<HTMLButtonElement>('#clear-clip');
  if (indicator !== null) {
    indicator.classList.toggle('is-active', current.clipLatched);
    indicator.setAttribute('aria-hidden', String(!current.clipLatched));
  }
  if (clear !== null) clear.disabled = !current.clipLatched;
  const latency = root.querySelector<HTMLElement>('#latency-value');
  if (latency !== null) {
    latency.hidden = current.latency === undefined;
    latency.textContent = latencyDescription(current.latency);
  }
}

function updateMeter(id: string, reading: InputMeterSnapshot): void {
  const meter = root.querySelector<HTMLElement>(`#${id}-meter`);
  const fill = root.querySelector<HTMLElement>(`#${id}-meter-fill`);
  const peak = root.querySelector<HTMLElement>(`#${id}-meter-peak`);
  const value = root.querySelector<HTMLElement>(`#${id}-meter-value`);
  if (meter === null || fill === null || peak === null || value === null) return;
  meter.setAttribute('aria-valuenow', String(reading.dbfs));
  fill.className = `meter-fill ${meterRegion(reading.dbfs)}`;
  fill.style.width = `${100 - meterPositionPercent(reading.dbfs)}%`;
  peak.style.left = `${meterPositionPercent(reading.peakDbfs)}%`;
  value.textContent = `${reading.dbfs.toFixed(1)} dBFS`;
}

function dbControl(id: string, label: string, value: number, definition: ContinuousControlDefinition, help = ''): string {
  return continuousControl(id, label, value, definition, 'dB', help);
}

function unitControl(id: string, label: string, value: number, definition: ContinuousControlDefinition, unit: string, help = ''): string {
  return continuousControl(id, label, value, definition, unit, help);
}

function percentControl(id: string, label: string, value: number, definition: ContinuousControlDefinition, help = ''): string {
  return continuousControl(id, label, value, definition, '%', help);
}

function knobControl(id: string, label: string, value: number, definition: AmpKnobDefinition): string {
  return continuousControl(id, label, value, definition, '', 'Tune this amplifier parameter.');
}

function continuousControl(
  id: string,
  label: string,
  value: number,
  definition: ContinuousControlDefinition,
  unit: string,
  help: string,
): string {
  const helpId = `${id}-help`;
  return `<div class="continuous-control">
    <div class="control-copy"><label for="${id}-slider">${label}</label>${help === '' ? '' : `<span id="${helpId}">${help}</span>`}</div>
    <input id="${id}-slider" aria-label="${label} slider" ${help === '' ? '' : `aria-describedby="${helpId}"`} type="range" min="${definition.minimum}" max="${definition.maximum}" step="${definition.step}" value="${value}">
    <div class="value-field"><input id="${id}-value" aria-label="${label} value" ${help === '' ? '' : `aria-describedby="${helpId}"`} type="number" inputmode="decimal" min="${definition.minimum}" max="${definition.maximum}" step="${definition.step}" value="${value.toFixed(definition.fractionDigits)}"><span aria-hidden="true">${unit}</span></div>
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
    case 'reconnect-input': return {
      ...presentation,
      connectButtonLabel: current.recovery.code === 'permission-denied' || current.recovery.code === 'no-input-devices' || current.recovery.code === 'input-connection-failed' ? 'Try Again' : 'Reconnect Input',
      inputMessage: current.recovery.message,
    };
    case 'resume-monitoring': return { ...presentation, monitoringMessage: current.recovery.message, monitoringButtonLabel: 'Resume Monitoring' };
    case 'choose-output': return {
      ...presentation,
      monitoringButtonLabel: 'Choose Output Before Monitoring',
      monitoringDisabled: true,
      retrySelectedOutput: current.outputRouting.selectedDeviceId !== undefined && current.outputRouting.devices.some((device) => device.id === current.outputRouting.selectedDeviceId),
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
  const disabled = current.devices.length === 0 ? 'disabled' : '';
  const firstLabel = current.devices.length === 0 ? 'Connect to discover inputs' : 'System default';
  return `<label class="${FIELD}" for="input-device">Input device</label><select id="input-device" aria-describedby="device-help" ${disabled}><option value="">${firstLabel}</option>${selectedUnavailable}${options}</select><span id="device-help" class="${FIELD_HELP}">Choose the interface or microphone feeding the amp.</span>`;
}

function channelSelector(current: AudioSnapshot): string {
  const options = Array.from({ length: current.inputChannelCount }, (_, channel) => `<option value="${channel}" ${channel === current.inputChannel ? 'selected' : ''}>Channel ${channel + 1}</option>`).join('');
  return `<label class="${FIELD}" for="input-channel">Input Channel</label><select id="input-channel">${options}</select>`;
}

function outputSelector(current: AudioSnapshot, connected: boolean): string {
  if (!connected) return `<label class="${FIELD}" for="output-device">Output device</label><select id="output-device" disabled><option>Connect an input to choose an output</option></select>`;
  if (current.outputRouting.mode !== 'selectable') return `<label class="${FIELD}" for="output-device">Output device</label><select id="output-device" disabled><option>System output (browser managed)</option></select>`;
  const selectedUnavailable = unavailableDeviceOption(current.outputRouting.selectedDeviceId, current.outputRouting.devices, 'output');
  const options = current.outputRouting.devices.map((device) => `<option value="${escapeHtml(device.id)}" ${device.id === current.outputRouting.selectedDeviceId ? 'selected' : ''}>${escapeHtml(device.label)}</option>`).join('');
  return `<label class="${FIELD}" for="output-device">Output device</label><select id="output-device"><option value="">System default</option>${selectedUnavailable}${options}</select>`;
}

function unavailableDeviceOption(selectedDeviceId: string | undefined, devices: readonly { readonly id: string }[], kind: 'input' | 'output'): string {
  return selectedDeviceId !== undefined && !devices.some((device) => device.id === selectedDeviceId)
    ? `<option value="${escapeHtml(selectedDeviceId)}" selected>Unavailable ${kind} (selected)</option>`
    : '';
}

function latencyDescription(latency: AudioSnapshot['latency']): string {
  if (latency === undefined) return '';
  const baseMs = latency.baseSeconds * 1_000;
  if (latency.outputSeconds === undefined) return `Browser output latency: ~${baseMs.toFixed(1)} ms processing buffer (device output latency not reported by this browser). Input capture latency is not measurable and adds to the total.`;
  const outputMs = latency.outputSeconds * 1_000;
  return `Browser output latency: ~${(baseMs + outputMs).toFixed(1)} ms (${baseMs.toFixed(1)} ms processing buffer + ${outputMs.toFixed(1)} ms device output). Input capture latency is not measurable and adds to the total.`;
}

function hardwareGuidance(): string {
  return `<div class="modal-backdrop" role="presentation"><aside class="guidance-modal" aria-labelledby="guidance-title">
    <p class="panel-eyebrow">Quick check</p><h2 id="guidance-title">Before you monitor</h2>
    <p>Disable Hardware Direct Monitoring on your audio interface so you hear the processed path, and use headphones.</p>
    <div class="modal-actions"><button id="dismiss-guidance" type="button" class="secondary-action">Dismiss reminder</button><button id="confirm-monitoring" type="button" class="primary-action">Checked — Enable Monitoring</button></div>
  </aside></div>`;
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

function isConnected(current: AudioSnapshot): boolean {
  return current.lifecycle === 'connected-muted' || current.lifecycle === 'monitoring' || current.lifecycle === 'interrupted';
}

function sectionNumber(id: WorkspaceSection): number {
  return Math.max(0, SECTIONS.findIndex((section) => section.id === id)) + 1;
}

function isWorkspaceSection(value: unknown): value is WorkspaceSection {
  return typeof value === 'string' && SECTIONS.some((section) => section.id === value);
}

function sectionFromHash(): WorkspaceSection {
  const value = window.location.hash.slice(1);
  return isWorkspaceSection(value) ? value : 'input';
}

function updateStoredPreferences(change: Partial<Omit<StoredWorkbenchPreferences, 'version'>>): void {
  workbenchPreferences = { ...workbenchPreferences, ...change };
  preferencesStore.save(workbenchPreferences);
}

function browserStorage(): Storage | undefined {
  try { return window.localStorage; } catch { return undefined; }
}

function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}

engine.subscribe(render);
