import type { AudioSnapshot } from '../../audio/types';
import { AMP_CONTROL_DEFINITIONS } from '../../signalChain/settings';
import { isConnected } from '../presentation';
import { bindContinuousControl, dbControl, escapeHtml, FIELD, FIELD_HELP, setCheckbox, setControlValue, stageToggle, unitControl } from './shared';
import type { WorkspaceSectionModule } from './types';

function connectionLabel(snapshot: AudioSnapshot): string {
  if (snapshot.lifecycle === 'connecting') return 'Connecting…';
  if (snapshot.lifecycle === 'monitoring') return 'Connected — monitoring';
  if (snapshot.lifecycle === 'connected-muted') return 'Connected — muted';
  if (snapshot.lifecycle === 'interrupted') return 'Audio interrupted';
  if (snapshot.lifecycle === 'error') return 'Connection interrupted';
  return 'Disconnected';
}

function connectionDescription(snapshot: AudioSnapshot): string {
  if (snapshot.lifecycle === 'monitoring') return 'Input is connected and Processed Monitoring is on.';
  if (snapshot.lifecycle === 'connected-muted') return 'Input is connected and metering. Processed Monitoring is off.';
  if (snapshot.lifecycle === 'interrupted') return 'Audio was interrupted. Resume Processed Monitoring when you are ready.';
  if (snapshot.lifecycle === 'connecting') return 'Waiting for browser permission.';
  return 'Start by connecting an audio interface or microphone visible to your browser.';
}

function unavailableDeviceOption(selectedDeviceId: string | undefined, devices: readonly { readonly id: string }[]): string {
  return selectedDeviceId !== undefined && !devices.some((device) => device.id === selectedDeviceId)
    ? `<option value="${escapeHtml(selectedDeviceId)}" selected>Unavailable input (selected)</option>`
    : '';
}

function deviceSelector(snapshot: AudioSnapshot): string {
  const selectedUnavailable = unavailableDeviceOption(snapshot.selectedInputDeviceId, snapshot.devices);
  const options = snapshot.devices.map((device) => `<option value="${escapeHtml(device.id)}" ${device.id === snapshot.selectedInputDeviceId ? 'selected' : ''}>${escapeHtml(device.label)}</option>`).join('');
  const disabled = snapshot.devices.length === 0 ? 'disabled' : '';
  const firstLabel = snapshot.devices.length === 0 ? 'Connect to discover inputs' : 'System default';
  return `<label class="${FIELD}" for="input-device">Input device</label><select id="input-device" aria-describedby="device-help" ${disabled}><option value="">${firstLabel}</option>${selectedUnavailable}${options}</select><span id="device-help" class="${FIELD_HELP}">Choose the interface or microphone feeding the amp.</span>`;
}

function channelSelector(snapshot: AudioSnapshot): string {
  const options = Array.from({ length: snapshot.inputChannelCount }, (_, channel) => `<option value="${channel}" ${channel === snapshot.inputChannel ? 'selected' : ''}>Channel ${channel + 1}</option>`).join('');
  return `<label class="${FIELD}" for="input-channel">Input Channel</label><select id="input-channel">${options}</select>`;
}

export const inputSection: WorkspaceSectionModule = {
  definition: {
    id: 'input',
    label: 'Input',
    title: 'Start with a clean signal',
    description: 'Connect your guitar, set the input level, and quiet the gaps before shaping your tone.',
  },

  action(snapshot, recovery) {
    return `<div class="section-action">
      <output class="connection-state" role="status">${connectionLabel(snapshot)}</output>
      <button id="connect" type="button" class="primary-action" ${snapshot.lifecycle === 'connecting' ? 'disabled' : ''}>${recovery.connectButtonLabel}</button>
      ${isConnected(snapshot) ? '<button id="disconnect" type="button" class="secondary-action">Disconnect</button>' : ''}
    </div>`;
  },

  content(snapshot, recovery) {
    return `<div class="section-stack">
      <section class="panel" aria-labelledby="input-title">
        <div class="panel-heading">
          <div><p class="panel-eyebrow">Source</p><h2 id="input-title">Live Guitar Input</h2></div>
          <span class="placeholder-art" aria-hidden="true">[img]</span>
        </div>
        <p id="connection-description" class="panel-description">${connectionDescription(snapshot)}</p>
        <div class="select-grid">
          <div>${deviceSelector(snapshot)}</div>
          ${snapshot.inputChannelCount > 1 ? `<div>${channelSelector(snapshot)}</div>` : ''}
        </div>
        ${snapshot.rawCaptureWarnings.map((warning) => `<p class="message warning" role="alert">${escapeHtml(warning)}</p>`).join('')}
        ${recovery.inputMessage === undefined ? '' : `<p class="message error" role="alert">${escapeHtml(recovery.inputMessage)}</p>`}
      </section>

      <section class="panel control-panel" aria-label="Input Trim">
        <div class="panel-heading compact"><div><p class="panel-eyebrow">Level</p><h2>Input Trim</h2></div></div>
        ${dbControl('input-trim', 'Input Trim', snapshot.controls.inputTrimDb, AMP_CONTROL_DEFINITIONS.inputTrimDb, 'Set the level feeding the amp without clipping the input.')}
      </section>

      <section class="panel control-panel" aria-label="Noise Suppression">
        <div class="panel-heading">
          <div><p class="panel-eyebrow">Cleanup</p><h2>Noise Gate</h2></div>
          ${stageToggle('noise-gate-enabled', 'Enable Noise Suppression', !snapshot.controls.noiseGateBypassed)}
        </div>
        <div class="control-list">
          ${dbControl('noise-gate-threshold', 'Threshold', snapshot.controls.noiseGateThresholdDb, AMP_CONTROL_DEFINITIONS.noiseGateThresholdDb, 'Choose when the gate opens.')}
          ${dbControl('noise-gate-range', 'Range', snapshot.controls.noiseGateRangeDb, AMP_CONTROL_DEFINITIONS.noiseGateRangeDb, 'Set the maximum reduction during quiet passages.')}
          ${unitControl('noise-gate-release', 'Release', snapshot.controls.noiseGateReleaseMs, AMP_CONTROL_DEFINITIONS.noiseGateReleaseMs, 'ms', 'Control how gradually the gate settles.')}
        </div>
        <div class="live-readout"><span>Current reduction</span><strong id="noise-gate-reduction" aria-label="Noise suppression reduction">${snapshot.noiseGateReductionDb.toFixed(1)} dB</strong></div>
      </section>
    </div>`;
  },

  bind(runtime) {
    const current = () => runtime.engine.snapshot;
    const restore = () => this.sync(runtime, current());
    runtime.root.querySelector<HTMLButtonElement>('#connect')?.addEventListener('click', () => void runtime.engine.connectInput({ deviceId: current().selectedInputDeviceId }));
    runtime.root.querySelector<HTMLButtonElement>('#disconnect')?.addEventListener('click', () => void runtime.engine.disconnectInput());
    runtime.root.querySelector<HTMLSelectElement>('#input-device')?.addEventListener('change', (event) => {
      const deviceId = (event.currentTarget as HTMLSelectElement).value;
      void runtime.engine.connectInput({ deviceId: deviceId === '' ? undefined : deviceId });
    });
    runtime.root.querySelector<HTMLSelectElement>('#input-channel')?.addEventListener('change', (event) => {
      runtime.engine.applySettings({
        selectedInputDeviceId: current().selectedInputDeviceId,
        inputChannel: Number((event.currentTarget as HTMLSelectElement).value),
      });
    });
    bindContinuousControl(runtime.root, 'input-trim', (inputTrimDb) => runtime.engine.applyControls({ ...current().controls, inputTrimDb }), restore);
    bindContinuousControl(runtime.root, 'noise-gate-threshold', (noiseGateThresholdDb) => runtime.engine.applyControls({ ...current().controls, noiseGateThresholdDb }), restore);
    bindContinuousControl(runtime.root, 'noise-gate-range', (noiseGateRangeDb) => runtime.engine.applyControls({ ...current().controls, noiseGateRangeDb }), restore);
    bindContinuousControl(runtime.root, 'noise-gate-release', (noiseGateReleaseMs) => runtime.engine.applyControls({ ...current().controls, noiseGateReleaseMs }), restore);
    runtime.root.querySelector<HTMLInputElement>('#noise-gate-enabled')?.addEventListener('change', (event) => {
      runtime.engine.applyControls({ ...current().controls, noiseGateBypassed: !(event.currentTarget as HTMLInputElement).checked });
    });
  },

  sync(runtime, snapshot) {
    const { root } = runtime;
    setControlValue(root, 'input-trim', snapshot.controls.inputTrimDb, AMP_CONTROL_DEFINITIONS.inputTrimDb);
    setControlValue(root, 'noise-gate-threshold', snapshot.controls.noiseGateThresholdDb, AMP_CONTROL_DEFINITIONS.noiseGateThresholdDb);
    setControlValue(root, 'noise-gate-range', snapshot.controls.noiseGateRangeDb, AMP_CONTROL_DEFINITIONS.noiseGateRangeDb);
    setControlValue(root, 'noise-gate-release', snapshot.controls.noiseGateReleaseMs, AMP_CONTROL_DEFINITIONS.noiseGateReleaseMs);
    setCheckbox(root, 'noise-gate-enabled', !snapshot.controls.noiseGateBypassed);
    const reduction = root.querySelector<HTMLElement>('#noise-gate-reduction');
    if (reduction !== null) reduction.textContent = `${snapshot.noiseGateReductionDb.toFixed(1)} dB`;
  },
};
