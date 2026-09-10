import type { AudioSnapshot } from '../../audio/types';

import { AMP_CONTROL_DEFINITIONS } from '../../signalChain/settings';

import { isConnected, latencyDescription } from '../presentation';

import {
  bindContinuousControl,
  dbControl,
  escapeHtml,
  FIELD,
  FIELD_HELP,
  setControlValue,
} from './shared';

import type { WorkspaceSectionModule } from './types';

function routingDescription(snapshot: AudioSnapshot): string {
  if (snapshot.outputRouting.mode === 'selectable') {
    return 'Choose a permitted browser-visible output, or keep the system default.';
  }

  if (snapshot.outputRouting.mode === 'system') {
    return 'This browser does not expose output selection. Output follows your browser and system sound settings.';
  }

  return 'Output routing will be identified after an input connects.';
}

function unavailableOutputOption(snapshot: AudioSnapshot): string {
  const selectedDeviceId = snapshot.outputRouting.selectedDeviceId;
  const isUnavailable =
    selectedDeviceId !== undefined &&
    !snapshot.outputRouting.devices.some(
      (device) => device.id === selectedDeviceId,
    );

  if (!isUnavailable) return '';

  return `
    <option value="${escapeHtml(selectedDeviceId)}" selected>
      Unavailable output (selected)
    </option>
  `;
}

function disabledOutputSelector(optionLabel: string): string {
  return `
    <label class="${FIELD}" for="output-device">
      Output device
    </label>

    <select id="output-device" disabled>
      <option>${optionLabel}</option>
    </select>
  `;
}

function outputSelector(snapshot: AudioSnapshot): string {
  if (!isConnected(snapshot)) {
    return disabledOutputSelector('Connect an input to choose an output');
  }

  if (snapshot.outputRouting.mode !== 'selectable') {
    return disabledOutputSelector('System output (browser managed)');
  }

  const options = snapshot.outputRouting.devices
    .map((device) => {
      const selected = device.id === snapshot.outputRouting.selectedDeviceId;

      return `
        <option
          value="${escapeHtml(device.id)}"
          ${selected ? 'selected' : ''}
        >
          ${escapeHtml(device.label)}
        </option>
      `;
    })
    .join('');

  return `
    <label class="${FIELD}" for="output-device">
      Output device
    </label>

    <select id="output-device">
      <option value="">System default</option>
      ${unavailableOutputOption(snapshot)}
      ${options}
    </select>
  `;
}

function errorMessage(message: string | undefined): string {
  if (message === undefined) return '';

  return `
    <p class="message error" role="alert">
      ${escapeHtml(message)}
    </p>
  `;
}

function retryOutputButton(shouldShow: boolean): string {
  if (!shouldShow) return '';

  return `
    <button
      id="retry-output"
      type="button"
      class="secondary-action"
    >
      Retry Selected Output
    </button>
  `;
}

export const masterSection: WorkspaceSectionModule = {
  definition: {
    id: 'master',
    label: 'Master',
    title: 'Master',
  },

  action() {
    return `
      <button
        id="reset-controls"
        type="button"
        class="secondary-action"
      >
        Reset Controls
      </button>
    `;
  },

  content(snapshot, recovery) {
    const controls = snapshot.controls;

    return `
      <div class="section-stack">
        <section class="panel" aria-labelledby="monitoring-title">
          <!--
          <div class="panel-heading">
            <div>
              <p class="panel-eyebrow">Output routing</p>
              <h2 id="monitoring-title">Processed Monitoring</h2>
            </div>
            <span class="placeholder-art" aria-hidden="true">[img]</span>
          </div>
          -->

          <p class="panel-description">
            ${routingDescription(snapshot)}
          </p>

          ${outputSelector(snapshot)}

          <p
            id="latency-value"
            class="${FIELD_HELP}"
            ${snapshot.latency === undefined ? 'hidden' : ''}
          >
            ${latencyDescription(snapshot.latency)}
          </p>

          ${errorMessage(snapshot.outputRouting.error)}
          ${errorMessage(recovery.monitoringMessage)}
          ${retryOutputButton(recovery.retrySelectedOutput)}
        </section>

        <section class="panel control-panel" aria-label="Master Volume">
          <div class="panel-heading compact">
            <div>
              <p class="panel-eyebrow">Final gain</p>
              <h2>Master Volume</h2>
            </div>
          </div>

          ${dbControl(
            'master-volume',
            'Master',
            controls.masterVolumeDb,
            AMP_CONTROL_DEFINITIONS.masterVolumeDb,
            'Set the final level sent to the browser output.',
          )}

          <div class="clip-row">
            <span
              id="clip-indicator"
              class="clip-indicator"
              role="status"
              aria-hidden="true"
            >
              CLIP
            </span>
            <button
              id="clear-clip"
              type="button"
              class="secondary-action compact"
              disabled
            >
              Clear CLIP
            </button>
          </div>
        </section>
      </div>
    `;
  },

  bind(runtime) {
    const current = () => runtime.engine.snapshot;

    // Reset controls button
    runtime.root
      .querySelector<HTMLButtonElement>('#reset-controls')
      ?.addEventListener('click', runtime.resetControls);

    // Output device selection
    runtime.root
      .querySelector<HTMLSelectElement>('#output-device')
      ?.addEventListener('change', (event) => {
        const deviceId = (event.currentTarget as HTMLSelectElement).value;

        void runtime.engine.selectOutput(
          deviceId === '' ? undefined : deviceId,
        );
      });

    // Retry output selection
    runtime.root
      .querySelector<HTMLButtonElement>('#retry-output')
      ?.addEventListener('click', () => {
        void runtime.engine.selectOutput(
          current().outputRouting.selectedDeviceId,
        );
      });

    // Master volume control
    bindContinuousControl(
      runtime.root,
      'master-volume',
      (masterVolumeDb) =>
        runtime.engine.applyControls({
          ...current().controls,
          masterVolumeDb,
        }),
      () => this.sync(runtime, current()),
    );

    // Clear clip button
    runtime.root
      .querySelector<HTMLButtonElement>('#clear-clip')
      ?.addEventListener('click', () => {
        runtime.engine.clearClip();
      });
  },

  sync(runtime, snapshot) {
    const { root } = runtime;

    // Update master volume
    setControlValue(
      root,
      'master-volume',
      snapshot.controls.masterVolumeDb,
      AMP_CONTROL_DEFINITIONS.masterVolumeDb,
    );

    // Update clip indicator
    const indicator = root.querySelector<HTMLElement>('#clip-indicator');

    if (indicator !== null) {
      indicator.classList.toggle('is-active', snapshot.clipLatched);
      indicator.setAttribute('aria-hidden', String(!snapshot.clipLatched));
    }

    // Update clear clip button
    const clear = root.querySelector<HTMLButtonElement>('#clear-clip');

    if (clear !== null) {
      clear.disabled = !snapshot.clipLatched;
    }

    // Update latency display
    const latency = root.querySelector<HTMLElement>('#latency-value');

    if (latency !== null) {
      latency.hidden = snapshot.latency === undefined;
      latency.textContent = latencyDescription(snapshot.latency);
    }
  },
};
