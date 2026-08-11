import { AudioEngine } from './audio/AudioEngine';
import type { AudioSnapshot, InputSettings } from './audio/types';
import './style.css';

const engine = new AudioEngine();
const app = document.querySelector<HTMLElement>('#app');
if (app === null) throw new Error('Application root is missing.');
const root = app;

let snapshot = engine.snapshot;

function meterRegion(dbfs: number): string {
  if (dbfs > -3) return 'red';
  if (dbfs >= -12) return 'yellow';
  return 'green';
}

function meterPositionPercent(dbfs: number): number {
  return Math.max(0, ((dbfs + 60) / 60) * 100);
}

function render(next: AudioSnapshot): void {
  snapshot = next;
  const connected = snapshot.lifecycle === 'connected-muted';
  const settings: InputSettings = { selectedInputDeviceId: snapshot.selectedInputDeviceId, inputChannel: snapshot.inputChannel };
  root.innerHTML = `
    <section class="workbench" aria-labelledby="page-title">
      <header><p class="eyebrow">Clean Amp Workbench</p><h1 id="page-title">Browser Amp</h1><p>Connect a Live Guitar Input to inspect its level before the Amp Chain.</p></header>
      <section class="panel" aria-labelledby="input-title">
        <div class="panel-heading"><h2 id="input-title">Live Guitar Input</h2><output class="connection-state" role="status">${connectionLabel(snapshot)}</output></div>
        <p id="connection-description">${connectionDescription(snapshot)}</p>
        <div class="actions">
          <button id="connect" type="button" ${snapshot.lifecycle === 'connecting' ? 'disabled' : ''}>${connected ? 'Reconnect Input' : 'Connect Input'}</button>
          ${connected ? '<button id="disconnect" type="button" class="secondary">Disconnect</button>' : ''}
        </div>
        ${snapshot.devices.length > 0 ? deviceSelector(snapshot) : ''}
        ${snapshot.inputChannelCount > 1 ? channelSelector(snapshot) : ''}
        ${snapshot.rawCaptureWarnings.map((warning) => `<p class="warning" role="alert">${warning}</p>`).join('')}
        ${snapshot.error === undefined ? '' : `<p class="error" role="alert">${snapshot.error} Reconnect to try again.</p>`}
      </section>
      <section class="panel" aria-labelledby="meter-title">
        <div class="panel-heading"><h2 id="meter-title">Input Level Meter</h2><span>${snapshot.meter.dbfs.toFixed(1)} dBFS</span></div>
        <div class="meter" aria-label="Input level" aria-valuemin="-60" aria-valuemax="0" aria-valuenow="${snapshot.meter.dbfs}" role="progressbar">
          <div class="meter-fill ${meterRegion(snapshot.meter.dbfs)}" style="width: ${100 - meterPositionPercent(snapshot.meter.dbfs)}%"></div>
          <div class="peak" style="left: ${meterPositionPercent(snapshot.meter.peakDbfs)}%"></div>
        </div>
        <div class="meter-scale" aria-hidden="true"><span>−60</span><span>−12</span><span>−3</span><span>0 dBFS</span></div>
        <p class="hint">Pre-chain signal only. Connecting and metering do not send audio to your speakers or headphones.</p>
      </section>
      <section class="panel monitoring" aria-labelledby="monitoring-title">
        <h2 id="monitoring-title">Processed Monitoring</h2>
        <p>Monitoring arrives in the next Amp Chain slice. This page remains silent.</p>
        <button type="button" disabled>Enable Monitoring</button>
      </section>
    </section>`;

  document.querySelector<HTMLButtonElement>('#connect')?.addEventListener('click', () => void engine.connectInput({ deviceId: snapshot.selectedInputDeviceId }));
  document.querySelector<HTMLButtonElement>('#disconnect')?.addEventListener('click', () => void engine.disconnectInput());
  document.querySelector<HTMLSelectElement>('#input-device')?.addEventListener('change', (event) => {
    const deviceId = (event.currentTarget as HTMLSelectElement).value;
    if (deviceId !== '') void engine.connectInput({ deviceId });
  });
  document.querySelector<HTMLSelectElement>('#input-channel')?.addEventListener('change', (event) => {
    engine.applySettings({ ...settings, inputChannel: Number((event.currentTarget as HTMLSelectElement).value) });
  });
}

function connectionLabel(current: AudioSnapshot): string {
  if (current.lifecycle === 'connecting') return 'Connecting…';
  if (current.lifecycle === 'connected-muted') return 'Connected — muted';
  if (current.lifecycle === 'error') return 'Connection interrupted';
  return 'Disconnected';
}

function connectionDescription(current: AudioSnapshot): string {
  if (current.lifecycle === 'connected-muted') return 'Input is connected and metering. Processed Monitoring is off.';
  if (current.lifecycle === 'connecting') return 'Waiting for browser permission.';
  return 'Start by connecting an audio interface or microphone visible to your browser.';
}

function deviceSelector(current: AudioSnapshot): string {
  const options = current.devices.map((device) => `<option value="${device.id}" ${device.id === current.selectedInputDeviceId ? 'selected' : ''}>${device.label}</option>`).join('');
  return `<label class="field">Input device<select id="input-device" aria-describedby="device-help"><option value="">System default</option>${options}</select><span id="device-help">Choose a device to reconnect to it explicitly.</span></label>`;
}

function channelSelector(current: AudioSnapshot): string {
  const options = Array.from({ length: current.inputChannelCount }, (_, channel) => `<option value="${channel}" ${channel === current.inputChannel ? 'selected' : ''}>Channel ${channel + 1}</option>`).join('');
  return `<label class="field">Input Channel<select id="input-channel">${options}</select></label>`;
}

engine.subscribe(render);
