import { AudioEngine } from './audio/AudioEngine';
import { DEFAULT_AMP_CONTROLS, type AmpControlSettings, type AudioSnapshot, type InputMeterSnapshot } from './audio/types';
import './style.css';

const CONTROLS_STORAGE_KEY = 'browser-amp.controls';
const GUIDANCE_STORAGE_KEY = 'browser-amp.hardware-direct-monitoring-dismissed';

const engine = new AudioEngine();
engine.applyControls(loadControls());

const app = document.querySelector<HTMLElement>('#app');
if (app === null) throw new Error('Application root is missing.');
const root = app;

let snapshot = engine.snapshot;
let guidanceOpen = false;
let guidanceDismissed = readStorage(GUIDANCE_STORAGE_KEY) === 'true';

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
  if (previous.controls !== next.controls) saveControls(next.controls);
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
    || previous.error !== next.error;
}

function renderStructure(current: AudioSnapshot): void {
  const connected = current.lifecycle === 'connected-muted' || current.lifecycle === 'monitoring';
  root.innerHTML = `
    <section class="workbench" aria-labelledby="page-title">
      <header>
        <p class="eyebrow">Clean Amp Workbench</p>
        <h1 id="page-title">Browser Amp</h1>
        <p>Connect a Live Guitar Input, shape a clean signal, then explicitly enable Processed Monitoring.</p>
      </header>

      <section class="panel" aria-labelledby="input-title">
        <div class="panel-heading">
          <h2 id="input-title">Live Guitar Input</h2>
          <output class="connection-state" role="status">${connectionLabel(current)}</output>
        </div>
        <p id="connection-description">${connectionDescription(current)}</p>
        <div class="actions">
          <button id="connect" type="button" ${current.lifecycle === 'connecting' ? 'disabled' : ''}>${connected ? 'Reconnect Input' : 'Connect Input'}</button>
          ${connected ? '<button id="disconnect" type="button" class="secondary">Disconnect</button>' : ''}
        </div>
        ${current.devices.length > 0 ? deviceSelector(current) : ''}
        ${current.inputChannelCount > 1 ? channelSelector(current) : ''}
        ${current.rawCaptureWarnings.map((warning) => `<p class="warning" role="alert">${escapeHtml(warning)}</p>`).join('')}
        ${current.error === undefined ? '' : `<p class="error" role="alert">${escapeHtml(current.error)}</p>`}
      </section>

      ${meterPanel('input', 'Input Level Meter', current.meter, 'Live Guitar Input before Clean Gain. Connecting and metering remain silent until Processed Monitoring is enabled.')}

      <section class="panel" aria-labelledby="clean-gain-title">
        <div class="panel-heading"><h2 id="clean-gain-title">Clean Gain</h2><span>Linear gain</span></div>
        <p>Raise or lower the clean signal without intentional saturation.</p>
        ${dbControl('clean-gain', 'Clean Gain', current.controls.cleanGainDb, -12, 24)}
      </section>

      <section class="panel" aria-labelledby="eq-title">
        <div class="panel-heading"><h2 id="eq-title">Three-Band EQ</h2><span>Clean Voice shaping</span></div>
        <p>Shape lows, mids, and highs around familiar musical centers.</p>
        <div class="control-stack">
          ${dbControl('bass', 'Bass', current.controls.bassDb, -12, 12)}
          ${dbControl('middle', 'Middle', current.controls.middleDb, -12, 12)}
          ${dbControl('treble', 'Treble', current.controls.trebleDb, -12, 12)}
        </div>
      </section>

      <section class="panel" aria-labelledby="compression-title">
        <div class="panel-heading"><h2 id="compression-title">Compression</h2><span id="compression-state">${current.controls.compressionBypassed ? 'Bypassed' : 'Active'}</span></div>
        <p>Raise Amount for progressively firmer dynamics control.</p>
        <label class="stage-toggle" for="compression-bypass">
          <input id="compression-bypass" type="checkbox" ${current.controls.compressionBypassed ? 'checked' : ''}>
          Compression Stage Bypass
        </label>
        ${percentControl('compression-amount', 'Compression Amount', current.controls.compressionAmount)}
      </section>

      <section class="panel" aria-labelledby="reverb-title">
        <div class="panel-heading"><h2 id="reverb-title">Reverb</h2><span id="reverb-state">${current.controls.reverbBypassed ? 'Bypassed' : 'Active'}</span></div>
        <p>Add a simple, plate-inspired spatial tail while keeping the dry attack immediate.</p>
        <label class="stage-toggle" for="reverb-bypass">
          <input id="reverb-bypass" type="checkbox" ${current.controls.reverbBypassed ? 'checked' : ''}>
          Reverb Stage Bypass
        </label>
        ${percentControl('reverb-amount', 'Reverb Amount', current.controls.reverbAmount)}
      </section>

      <section class="panel" aria-labelledby="master-volume-title">
        <div class="panel-heading"><h2 id="master-volume-title">Master Volume</h2><span>Attenuation only</span></div>
        <p>Sets the final Amp Chain level independently of the monitoring switch.</p>
        ${dbControl('master-volume', 'Master Volume', current.controls.masterVolumeDb, -60, 0)}
      </section>

      ${meterPanel('output', 'Output Level Meter', current.outputMeter, 'Post-Master signal before browser output.')}

      <section class="panel monitoring" aria-labelledby="monitoring-title">
        <div class="panel-heading"><h2 id="monitoring-title">Processed Monitoring</h2><strong id="monitoring-state">${current.monitoring ? 'On' : 'Off'}</strong></div>
        <p>${routingDescription(current)}</p>
        ${outputSelector(current, connected)}
        ${current.outputRouting.error === undefined ? '' : `<p class="error" role="alert">${escapeHtml(current.outputRouting.error)}</p>`}
        <button id="monitoring-toggle" type="button" ${connected ? '' : 'disabled'}>${current.monitoring ? 'Disable Monitoring' : 'Enable Monitoring'}</button>
        ${guidanceOpen ? hardwareGuidance() : ''}
      </section>
    </section>`;

  bindStructureEvents();
}

function bindStructureEvents(): void {
  root.querySelector<HTMLButtonElement>('#connect')?.addEventListener('click', () => void engine.connectInput({ deviceId: snapshot.selectedInputDeviceId }));
  root.querySelector<HTMLButtonElement>('#disconnect')?.addEventListener('click', () => void engine.disconnectInput());
  root.querySelector<HTMLSelectElement>('#input-device')?.addEventListener('change', (event) => {
    const deviceId = (event.currentTarget as HTMLSelectElement).value;
    if (deviceId !== '') void engine.connectInput({ deviceId });
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
  setControlValue('clean-gain', controls.cleanGainDb);
  setControlValue('bass', controls.bassDb);
  setControlValue('middle', controls.middleDb);
  setControlValue('treble', controls.trebleDb);
  setControlValue('compression-amount', controls.compressionAmount, 0);
  const compressionBypass = root.querySelector<HTMLInputElement>('#compression-bypass');
  const compressionState = root.querySelector<HTMLElement>('#compression-state');
  if (compressionBypass !== null) compressionBypass.checked = controls.compressionBypassed;
  if (compressionState !== null) compressionState.textContent = controls.compressionBypassed ? 'Bypassed' : 'Active';
  setControlValue('reverb-amount', controls.reverbAmount, 0);
  const reverbBypass = root.querySelector<HTMLInputElement>('#reverb-bypass');
  const reverbState = root.querySelector<HTMLElement>('#reverb-state');
  if (reverbBypass !== null) reverbBypass.checked = controls.reverbBypassed;
  if (reverbState !== null) reverbState.textContent = controls.reverbBypassed ? 'Bypassed' : 'Active';
  setControlValue('master-volume', controls.masterVolumeDb);
}

function setControlValue(id: string, value: number, fractionDigits = 1): void {
  const slider = root.querySelector<HTMLInputElement>(`#${id}-slider`);
  const numeric = root.querySelector<HTMLInputElement>(`#${id}-value`);
  if (slider !== null && slider.valueAsNumber !== value) slider.value = String(value);
  if (numeric !== null && numeric.value !== value.toFixed(fractionDigits)) numeric.value = value.toFixed(fractionDigits);
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

function dbControl(id: string, label: string, value: number, minimum: number, maximum: number): string {
  return `<div class="continuous-control">
    <label for="${id}-slider">${label}</label>
    <input id="${id}-slider" aria-label="${label} slider" type="range" min="${minimum}" max="${maximum}" step="0.1" value="${value}">
    <div class="numeric-control">
      <input id="${id}-value" aria-label="${label} value" type="number" inputmode="decimal" min="${minimum}" max="${maximum}" step="0.1" value="${value.toFixed(1)}">
      <span aria-hidden="true">dB</span>
    </div>
  </div>`;
}

function percentControl(id: string, label: string, value: number): string {
  return `<div class="continuous-control">
    <label for="${id}-slider">${label}</label>
    <input id="${id}-slider" aria-label="${label} slider" type="range" min="0" max="100" step="1" value="${value}">
    <div class="numeric-control">
      <input id="${id}-value" aria-label="${label} value" type="number" inputmode="numeric" min="0" max="100" step="1" value="${value}">
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

function routingDescription(current: AudioSnapshot): string {
  if (current.outputRouting.mode === 'selectable') return 'Choose a permitted browser-visible output, or keep the system default.';
  if (current.outputRouting.mode === 'system') return 'This browser does not expose output selection. Output follows your browser and system sound settings.';
  return 'Output routing will be identified after an input connects.';
}

function deviceSelector(current: AudioSnapshot): string {
  const options = current.devices.map((device) => `<option value="${escapeHtml(device.id)}" ${device.id === current.selectedInputDeviceId ? 'selected' : ''}>${escapeHtml(device.label)}</option>`).join('');
  return `<label class="field" for="input-device">Input device</label><select id="input-device" aria-describedby="device-help"><option value="">System default</option>${options}</select><span id="device-help" class="field-help">Choose a device to reconnect to it explicitly.</span>`;
}

function channelSelector(current: AudioSnapshot): string {
  const options = Array.from({ length: current.inputChannelCount }, (_, channel) => `<option value="${channel}" ${channel === current.inputChannel ? 'selected' : ''}>Channel ${channel + 1}</option>`).join('');
  return `<label class="field" for="input-channel">Input Channel</label><select id="input-channel">${options}</select>`;
}

function outputSelector(current: AudioSnapshot, connected: boolean): string {
  if (!connected || current.outputRouting.mode !== 'selectable') return '';
  const options = current.outputRouting.devices.map((device) => `<option value="${escapeHtml(device.id)}" ${device.id === current.outputRouting.selectedDeviceId ? 'selected' : ''}>${escapeHtml(device.label)}</option>`).join('');
  return `<label class="field" for="output-device">Output device</label><select id="output-device"><option value="">System default</option>${options}</select>`;
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
  writeStorage(GUIDANCE_STORAGE_KEY, 'true');
  rerenderStructure();
}

function rerenderStructure(): void {
  renderStructure(snapshot);
  renderControls(snapshot.controls);
  renderMeters(snapshot);
}

function loadControls(): AmpControlSettings {
  const raw = readStorage(CONTROLS_STORAGE_KEY);
  if (raw === undefined) return DEFAULT_AMP_CONTROLS;
  try {
    const parsed = JSON.parse(raw) as Partial<AmpControlSettings>;
    return {
      cleanGainDb: typeof parsed.cleanGainDb === 'number' ? parsed.cleanGainDb : DEFAULT_AMP_CONTROLS.cleanGainDb,
      bassDb: typeof parsed.bassDb === 'number' ? parsed.bassDb : DEFAULT_AMP_CONTROLS.bassDb,
      middleDb: typeof parsed.middleDb === 'number' ? parsed.middleDb : DEFAULT_AMP_CONTROLS.middleDb,
      trebleDb: typeof parsed.trebleDb === 'number' ? parsed.trebleDb : DEFAULT_AMP_CONTROLS.trebleDb,
      compressionAmount: typeof parsed.compressionAmount === 'number' ? parsed.compressionAmount : DEFAULT_AMP_CONTROLS.compressionAmount,
      compressionBypassed: typeof parsed.compressionBypassed === 'boolean' ? parsed.compressionBypassed : DEFAULT_AMP_CONTROLS.compressionBypassed,
      reverbAmount: typeof parsed.reverbAmount === 'number' ? parsed.reverbAmount : DEFAULT_AMP_CONTROLS.reverbAmount,
      reverbBypassed: typeof parsed.reverbBypassed === 'boolean' ? parsed.reverbBypassed : DEFAULT_AMP_CONTROLS.reverbBypassed,
      masterVolumeDb: typeof parsed.masterVolumeDb === 'number' ? parsed.masterVolumeDb : DEFAULT_AMP_CONTROLS.masterVolumeDb,
    };
  } catch {
    return DEFAULT_AMP_CONTROLS;
  }
}

function saveControls(controls: AmpControlSettings): void {
  writeStorage(CONTROLS_STORAGE_KEY, JSON.stringify(controls));
}

function readStorage(key: string): string | undefined {
  try {
    return localStorage.getItem(key) ?? undefined;
  } catch {
    return undefined;
  }
}

function writeStorage(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // The controls still work when private browsing or policy blocks storage.
  }
}

function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}

engine.subscribe(render);
