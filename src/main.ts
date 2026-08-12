import { AudioEngine } from './audio/AudioEngine';
import type { AudioSnapshot, InputMeterSnapshot } from './audio/types';
import { AMP_CONTROL_DEFINITIONS, type AmpControlSettings, type ContinuousControlDefinition } from './controls';
import { WorkbenchPreferencesStore, resetControls, type StoredWorkbenchPreferences } from './settings';
import './style.css';

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
  return (root.querySelector('#input-device') === null && root.querySelector('.workbench') === null)
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
  const connected = current.lifecycle === 'connected-muted' || current.lifecycle === 'monitoring';
  const recovery = recoveryPresentation(current, connected);
  root.innerHTML = `
    <section class="workbench" aria-labelledby="page-title">
      <header>
        <p class="eyebrow">Clean Amp Workbench</p>
        <h1 id="page-title">Browser Amp</h1>
        <p>Connect a Live Guitar Input, shape a clean signal, then explicitly enable Processed Monitoring.</p>
        <button id="reset-controls" type="button" class="secondary">Reset Controls</button>
      </header>

      <section class="panel" aria-labelledby="input-title">
        <div class="panel-heading">
          <h2 id="input-title">Live Guitar Input</h2>
          <output class="connection-state" role="status">${connectionLabel(current)}</output>
        </div>
        <p id="connection-description">${connectionDescription(current)}</p>
        <div class="actions">
          <button id="connect" type="button" ${current.lifecycle === 'connecting' ? 'disabled' : ''}>${recovery.connectButtonLabel}</button>
          ${connected ? '<button id="disconnect" type="button" class="secondary">Disconnect</button>' : ''}
        </div>
        ${current.devices.length > 0 ? deviceSelector(current) : ''}
        ${current.inputChannelCount > 1 ? channelSelector(current) : ''}
        ${current.rawCaptureWarnings.map((warning) => `<p class="warning" role="alert">${escapeHtml(warning)}</p>`).join('')}
        ${recovery.inputMessage === undefined ? '' : `<p class="error" role="alert">${escapeHtml(recovery.inputMessage)}</p>`}
      </section>

      ${meterPanel('input', 'Input Level Meter', current.meter, 'Live Guitar Input before Clean Gain. Connecting and metering remain silent until Processed Monitoring is enabled.')}

      <section class="panel" aria-labelledby="clean-gain-title">
        <div class="panel-heading"><h2 id="clean-gain-title">Clean Gain</h2><span>Linear gain</span></div>
        <p>Raise or lower the clean signal without intentional saturation.</p>
        ${dbControl('clean-gain', 'Clean Gain', current.controls.cleanGainDb, AMP_CONTROL_DEFINITIONS.cleanGainDb)}
      </section>

      <section class="panel" aria-labelledby="eq-title">
        <div class="panel-heading"><h2 id="eq-title">Three-Band EQ</h2><span>Clean Voice shaping</span></div>
        <p>Shape lows, mids, and highs around familiar musical centers.</p>
        <div class="control-stack">
          ${dbControl('bass', 'Bass', current.controls.bassDb, AMP_CONTROL_DEFINITIONS.bassDb)}
          ${dbControl('middle', 'Middle', current.controls.middleDb, AMP_CONTROL_DEFINITIONS.middleDb)}
          ${dbControl('treble', 'Treble', current.controls.trebleDb, AMP_CONTROL_DEFINITIONS.trebleDb)}
        </div>
      </section>

      <section class="panel" aria-labelledby="compression-title">
        <div class="panel-heading"><h2 id="compression-title">Compression</h2><span id="compression-state">${current.controls.compressionBypassed ? 'Bypassed' : 'Active'}</span></div>
        <p>Raise Amount for progressively firmer dynamics control.</p>
        <label class="stage-toggle" for="compression-bypass">
          <input id="compression-bypass" type="checkbox" ${current.controls.compressionBypassed ? 'checked' : ''}>
          Compression Stage Bypass
        </label>
        ${percentControl('compression-amount', 'Compression Amount', current.controls.compressionAmount, AMP_CONTROL_DEFINITIONS.compressionAmount)}
      </section>

      <section class="panel" aria-labelledby="reverb-title">
        <div class="panel-heading"><h2 id="reverb-title">Reverb</h2><span id="reverb-state">${current.controls.reverbBypassed ? 'Bypassed' : 'Active'}</span></div>
        <p>Add a simple, plate-inspired spatial tail while keeping the dry attack immediate.</p>
        <label class="stage-toggle" for="reverb-bypass">
          <input id="reverb-bypass" type="checkbox" ${current.controls.reverbBypassed ? 'checked' : ''}>
          Reverb Stage Bypass
        </label>
        ${percentControl('reverb-amount', 'Reverb Amount', current.controls.reverbAmount, AMP_CONTROL_DEFINITIONS.reverbAmount)}
      </section>

      <section class="panel" aria-labelledby="master-volume-title">
        <div class="panel-heading"><h2 id="master-volume-title">Master Volume</h2><span>Attenuation only</span></div>
        <p>Sets the final Amp Chain level independently of the monitoring switch.</p>
        ${dbControl('master-volume', 'Master Volume', current.controls.masterVolumeDb, AMP_CONTROL_DEFINITIONS.masterVolumeDb)}
      </section>

      ${meterPanel('output', 'Output Level Meter', current.outputMeter, 'Post-Master signal before browser output.')}

      <section class="panel monitoring" aria-labelledby="monitoring-title">
        <div class="panel-heading"><h2 id="monitoring-title">Processed Monitoring</h2><strong id="monitoring-state">${current.monitoring ? 'On' : 'Off'}</strong></div>
        <p>${routingDescription(current)}</p>
        ${outputSelector(current, connected)}
        ${current.outputRouting.error === undefined ? '' : `<p class="error" role="alert">${escapeHtml(current.outputRouting.error)}</p>`}
        ${recovery.monitoringMessage === undefined ? '' : `<p class="error" role="alert">${escapeHtml(recovery.monitoringMessage)}</p>`}
        <div class="actions">
          ${recovery.retrySelectedOutput ? '<button id="retry-output" type="button" class="secondary">Retry Selected Output</button>' : ''}
          <button id="monitoring-toggle" type="button" ${recovery.monitoringDisabled ? 'disabled' : ''}>${recovery.monitoringButtonLabel}</button>
        </div>
        ${guidanceOpen ? hardwareGuidance() : ''}
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
  bindContinuousControl('clean-gain', (cleanGainDb) => engine.applyControls({ ...snapshot.controls, cleanGainDb }));
  bindContinuousControl('bass', (bassDb) => engine.applyControls({ ...snapshot.controls, bassDb }));
  bindContinuousControl('middle', (middleDb) => engine.applyControls({ ...snapshot.controls, middleDb }));
  bindContinuousControl('treble', (trebleDb) => engine.applyControls({ ...snapshot.controls, trebleDb }));
  bindContinuousControl('compression-amount', (compressionAmount) => engine.applyControls({ ...snapshot.controls, compressionAmount }));
  root.querySelector<HTMLInputElement>('#compression-bypass')?.addEventListener('change', (event) => {
    engine.applyControls({ ...snapshot.controls, compressionBypassed: (event.currentTarget as HTMLInputElement).checked });
  });
  bindContinuousControl('reverb-amount', (reverbAmount) => engine.applyControls({ ...snapshot.controls, reverbAmount }));
  root.querySelector<HTMLInputElement>('#reverb-bypass')?.addEventListener('change', (event) => {
    engine.applyControls({ ...snapshot.controls, reverbBypassed: (event.currentTarget as HTMLInputElement).checked });
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

function renderControls(controls: AmpControlSettings): void {
  setControlValue('clean-gain', controls.cleanGainDb, AMP_CONTROL_DEFINITIONS.cleanGainDb);
  setControlValue('bass', controls.bassDb, AMP_CONTROL_DEFINITIONS.bassDb);
  setControlValue('middle', controls.middleDb, AMP_CONTROL_DEFINITIONS.middleDb);
  setControlValue('treble', controls.trebleDb, AMP_CONTROL_DEFINITIONS.trebleDb);
  setControlValue('compression-amount', controls.compressionAmount, AMP_CONTROL_DEFINITIONS.compressionAmount);
  const compressionBypass = root.querySelector<HTMLInputElement>('#compression-bypass');
  const compressionState = root.querySelector<HTMLElement>('#compression-state');
  if (compressionBypass !== null) compressionBypass.checked = controls.compressionBypassed;
  if (compressionState !== null) compressionState.textContent = controls.compressionBypassed ? 'Bypassed' : 'Active';
  setControlValue('reverb-amount', controls.reverbAmount, AMP_CONTROL_DEFINITIONS.reverbAmount);
  const reverbBypass = root.querySelector<HTMLInputElement>('#reverb-bypass');
  const reverbState = root.querySelector<HTMLElement>('#reverb-state');
  if (reverbBypass !== null) reverbBypass.checked = controls.reverbBypassed;
  if (reverbState !== null) reverbState.textContent = controls.reverbBypassed ? 'Bypassed' : 'Active';
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
    indicator.classList.toggle('active', current.clipLatched);
    indicator.setAttribute('aria-hidden', String(!current.clipLatched));
  }
  if (clear !== null) clear.disabled = !current.clipLatched;
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

function meterPanel(id: 'input' | 'output', title: string, reading: InputMeterSnapshot, hint: string): string {
  const clip = id === 'output' ? `
    <div class="clip-controls">
      <span id="clip-indicator" class="clip-indicator" role="status" aria-hidden="true">CLIP</span>
      <button id="clear-clip" type="button" class="secondary compact" disabled>Clear CLIP</button>
    </div>` : '';
  return `<section class="panel" aria-labelledby="${id}-meter-title">
    <div class="panel-heading">
      <h2 id="${id}-meter-title">${title}</h2>
      <span id="${id}-meter-value">${reading.dbfs.toFixed(1)} dBFS</span>
    </div>
    <div id="${id}-meter" class="meter" aria-label="${id === 'input' ? 'Input' : 'Output'} level" aria-valuemin="-60" aria-valuemax="0" aria-valuenow="${reading.dbfs}" role="progressbar">
      <div id="${id}-meter-fill" class="meter-fill ${meterRegion(reading.dbfs)}" style="width: ${100 - meterPositionPercent(reading.dbfs)}%"></div>
      <div id="${id}-meter-peak" class="peak" style="left: ${meterPositionPercent(reading.peakDbfs)}%"></div>
    </div>
    <div class="meter-scale" aria-hidden="true"><span>−60</span><span>−12</span><span>−3</span><span>0 dBFS</span></div>
    <div class="meter-footer"><p class="hint">${hint}</p>${clip}</div>
  </section>`;
}

function dbControl(id: string, label: string, value: number, definition: ContinuousControlDefinition): string {
  return `<div class="continuous-control">
    <label for="${id}-slider">${label}</label>
    <input id="${id}-slider" aria-label="${label} slider" type="range" min="${definition.minimum}" max="${definition.maximum}" step="${definition.step}" value="${value}">
    <div class="numeric-control">
      <input id="${id}-value" aria-label="${label} value" type="number" inputmode="decimal" min="${definition.minimum}" max="${definition.maximum}" step="${definition.step}" value="${value.toFixed(definition.fractionDigits)}">
      <span aria-hidden="true">dB</span>
    </div>
  </div>`;
}

function percentControl(id: string, label: string, value: number, definition: ContinuousControlDefinition): string {
  return `<div class="continuous-control">
    <label for="${id}-slider">${label}</label>
    <input id="${id}-slider" aria-label="${label} slider" type="range" min="${definition.minimum}" max="${definition.maximum}" step="${definition.step}" value="${value}">
    <div class="numeric-control">
      <input id="${id}-value" aria-label="${label} value" type="number" inputmode="numeric" min="${definition.minimum}" max="${definition.maximum}" step="${definition.step}" value="${value.toFixed(definition.fractionDigits)}">
      <span aria-hidden="true">%</span>
    </div>
  </div>`;
}

function connectionLabel(current: AudioSnapshot): string {
  if (current.lifecycle === 'connecting') return 'Connecting…';
  if (current.lifecycle === 'monitoring') return 'Connected — monitoring';
  if (current.lifecycle === 'connected-muted') return 'Connected — muted';
  if (current.lifecycle === 'error') return 'Connection interrupted';
  return 'Disconnected';
}

function connectionDescription(current: AudioSnapshot): string {
  if (current.lifecycle === 'monitoring') return 'Input is connected and Processed Monitoring is on.';
  if (current.lifecycle === 'connected-muted') return 'Input is connected and metering. Processed Monitoring is off.';
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
  return `<label class="field" for="input-device">Input device</label><select id="input-device" aria-describedby="device-help"><option value="">System default</option>${selectedUnavailable}${options}</select><span id="device-help" class="field-help">Choose a device to reconnect to it explicitly.</span>`;
}

function channelSelector(current: AudioSnapshot): string {
  const options = Array.from({ length: current.inputChannelCount }, (_, channel) => `<option value="${channel}" ${channel === current.inputChannel ? 'selected' : ''}>Channel ${channel + 1}</option>`).join('');
  return `<label class="field" for="input-channel">Input Channel</label><select id="input-channel">${options}</select>`;
}

function outputSelector(current: AudioSnapshot, connected: boolean): string {
  if (!connected || current.outputRouting.mode !== 'selectable') return '';
  const selectedUnavailable = unavailableDeviceOption(current.outputRouting.selectedDeviceId, current.outputRouting.devices, 'output');
  const options = current.outputRouting.devices.map((device) => `<option value="${escapeHtml(device.id)}" ${device.id === current.outputRouting.selectedDeviceId ? 'selected' : ''}>${escapeHtml(device.label)}</option>`).join('');
  return `<label class="field" for="output-device">Output device</label><select id="output-device"><option value="">System default</option>${selectedUnavailable}${options}</select>`;
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
  return `<aside class="guidance" aria-labelledby="guidance-title">
    <h3 id="guidance-title">Before you monitor</h3>
    <p>Disable Hardware Direct Monitoring on your audio interface so you hear the processed path, and use headphones.</p>
    <div class="actions">
      <button id="confirm-monitoring" type="button">Checked — Enable Monitoring</button>
      <button id="dismiss-guidance" type="button" class="secondary">Dismiss reminder</button>
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
