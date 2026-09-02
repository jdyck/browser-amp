import type { AudioSnapshot } from '../../audio/types';
import { AMP_CONTROL_DEFINITIONS } from '../../signalChain/settings';
import { isConnected, latencyDescription } from '../presentation';
import { bindContinuousControl, dbControl, escapeHtml, FIELD, FIELD_HELP, setControlValue } from './shared';
import type { WorkspaceSectionModule } from './types';

function routingDescription(snapshot: AudioSnapshot): string {
  if (snapshot.outputRouting.mode === 'selectable') return 'Choose a permitted browser-visible output, or keep the system default.';
  if (snapshot.outputRouting.mode === 'system') return 'This browser does not expose output selection. Output follows your browser and system sound settings.';
  return 'Output routing will be identified after an input connects.';
}

function unavailableOutputOption(snapshot: AudioSnapshot): string {
  const selected = snapshot.outputRouting.selectedDeviceId;
  return selected !== undefined && !snapshot.outputRouting.devices.some((device) => device.id === selected)
    ? `<option value="${escapeHtml(selected)}" selected>Unavailable output (selected)</option>`
    : '';
}

function outputSelector(snapshot: AudioSnapshot): string {
  if (!isConnected(snapshot)) return `<label class="${FIELD}" for="output-device">Output device</label><select id="output-device" disabled><option>Connect an input to choose an output</option></select>`;
  if (snapshot.outputRouting.mode !== 'selectable') return `<label class="${FIELD}" for="output-device">Output device</label><select id="output-device" disabled><option>System output (browser managed)</option></select>`;
  const options = snapshot.outputRouting.devices.map((device) => `<option value="${escapeHtml(device.id)}" ${device.id === snapshot.outputRouting.selectedDeviceId ? 'selected' : ''}>${escapeHtml(device.label)}</option>`).join('');
  return `<label class="${FIELD}" for="output-device">Output device</label><select id="output-device"><option value="">System default</option>${unavailableOutputOption(snapshot)}${options}</select>`;
}

export const masterSection: WorkspaceSectionModule = {
  definition: {
    id: 'master',
    label: 'Master',
    title: 'Set the final level',
    description: 'Choose the listening output, set the final volume, and check the signal before you play.',
  },

  action() {
    return '<button id="reset-controls" type="button" class="secondary-action">Reset Controls</button>';
  },

  content(snapshot, recovery) {
    return `<div class="section-stack">
      <section class="panel" aria-labelledby="monitoring-title">
        <div class="panel-heading"><div><p class="panel-eyebrow">Output routing</p><h2 id="monitoring-title">Processed Monitoring</h2></div><span class="placeholder-art" aria-hidden="true">[img]</span></div>
        <p class="panel-description">${routingDescription(snapshot)}</p>
        ${outputSelector(snapshot)}
        <p id="latency-value" class="${FIELD_HELP}" ${snapshot.latency === undefined ? 'hidden' : ''}>${latencyDescription(snapshot.latency)}</p>
        ${snapshot.outputRouting.error === undefined ? '' : `<p class="message error" role="alert">${escapeHtml(snapshot.outputRouting.error)}</p>`}
        ${recovery.monitoringMessage === undefined ? '' : `<p class="message error" role="alert">${escapeHtml(recovery.monitoringMessage)}</p>`}
        ${recovery.retrySelectedOutput ? '<button id="retry-output" type="button" class="secondary-action">Retry Selected Output</button>' : ''}
      </section>
      <section class="panel control-panel" aria-label="Master Volume">
        <div class="panel-heading compact"><div><p class="panel-eyebrow">Final gain</p><h2>Master Volume</h2></div></div>
        ${dbControl('master-volume', 'Master', snapshot.controls.masterVolumeDb, AMP_CONTROL_DEFINITIONS.masterVolumeDb, 'Set the final level sent to the browser output.')}
        <div class="clip-row"><span id="clip-indicator" class="clip-indicator" role="status" aria-hidden="true">CLIP</span><button id="clear-clip" type="button" class="secondary-action compact" disabled>Clear CLIP</button></div>
      </section>
    </div>`;
  },

  bind(runtime) {
    const current = () => runtime.engine.snapshot;
    runtime.root.querySelector<HTMLButtonElement>('#reset-controls')?.addEventListener('click', runtime.resetControls);
    runtime.root.querySelector<HTMLSelectElement>('#output-device')?.addEventListener('change', (event) => {
      const deviceId = (event.currentTarget as HTMLSelectElement).value;
      void runtime.engine.selectOutput(deviceId === '' ? undefined : deviceId);
    });
    runtime.root.querySelector<HTMLButtonElement>('#retry-output')?.addEventListener('click', () => void runtime.engine.selectOutput(current().outputRouting.selectedDeviceId));
    bindContinuousControl(runtime.root, 'master-volume', (masterVolumeDb) => runtime.engine.applyControls({ ...current().controls, masterVolumeDb }), () => this.sync(runtime, current()));
    runtime.root.querySelector<HTMLButtonElement>('#clear-clip')?.addEventListener('click', () => runtime.engine.clearClip());
  },

  sync(runtime, snapshot) {
    const { root } = runtime;
    setControlValue(root, 'master-volume', snapshot.controls.masterVolumeDb, AMP_CONTROL_DEFINITIONS.masterVolumeDb);
    const indicator = root.querySelector<HTMLElement>('#clip-indicator');
    const clear = root.querySelector<HTMLButtonElement>('#clear-clip');
    if (indicator !== null) {
      indicator.classList.toggle('is-active', snapshot.clipLatched);
      indicator.setAttribute('aria-hidden', String(!snapshot.clipLatched));
    }
    if (clear !== null) clear.disabled = !snapshot.clipLatched;
    const latency = root.querySelector<HTMLElement>('#latency-value');
    if (latency !== null) {
      latency.hidden = snapshot.latency === undefined;
      latency.textContent = latencyDescription(snapshot.latency);
    }
  },
};
