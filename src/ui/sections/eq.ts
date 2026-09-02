import { AMP_CONTROL_DEFINITIONS } from '../../signalChain/settings';
import { bindContinuousControl, dbControl, setCheckbox, setControlValue, stageToggle, unitControl } from './shared';
import type { WorkspaceSectionModule } from './types';

export const eqSection: WorkspaceSectionModule = {
  definition: {
    id: 'eq',
    label: 'EQ',
    title: 'Shape the spectrum',
    description: 'Balance lows, focus the mids, and add or remove air from the finished amp sound.',
  },

  action(snapshot) {
    return stageToggle('eq-enabled', 'Enable Studio EQ', !snapshot.controls.eqBypassed);
  },

  content(snapshot) {
    const controls = snapshot.controls;
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
  },

  bind(runtime) {
    const current = () => runtime.engine.snapshot;
    const restore = () => this.sync(runtime, current());
    runtime.root.querySelector<HTMLInputElement>('#eq-enabled')?.addEventListener('change', (event) => {
      runtime.engine.applyControls({ ...current().controls, eqBypassed: !(event.currentTarget as HTMLInputElement).checked });
    });
    bindContinuousControl(runtime.root, 'low-shelf', (lowShelfDb) => runtime.engine.applyControls({ ...current().controls, lowShelfDb }), restore);
    bindContinuousControl(runtime.root, 'low-mid-frequency', (lowMidFrequencyHz) => runtime.engine.applyControls({ ...current().controls, lowMidFrequencyHz }), restore);
    bindContinuousControl(runtime.root, 'low-mid', (lowMidDb) => runtime.engine.applyControls({ ...current().controls, lowMidDb }), restore);
    bindContinuousControl(runtime.root, 'upper-mid-frequency', (upperMidFrequencyHz) => runtime.engine.applyControls({ ...current().controls, upperMidFrequencyHz }), restore);
    bindContinuousControl(runtime.root, 'upper-mid', (upperMidDb) => runtime.engine.applyControls({ ...current().controls, upperMidDb }), restore);
    bindContinuousControl(runtime.root, 'high-shelf', (highShelfDb) => runtime.engine.applyControls({ ...current().controls, highShelfDb }), restore);
  },

  sync(runtime, snapshot) {
    const { root } = runtime;
    const controls = snapshot.controls;
    setCheckbox(root, 'eq-enabled', !controls.eqBypassed);
    setControlValue(root, 'low-shelf', controls.lowShelfDb, AMP_CONTROL_DEFINITIONS.lowShelfDb);
    setControlValue(root, 'low-mid-frequency', controls.lowMidFrequencyHz, AMP_CONTROL_DEFINITIONS.lowMidFrequencyHz);
    setControlValue(root, 'low-mid', controls.lowMidDb, AMP_CONTROL_DEFINITIONS.lowMidDb);
    setControlValue(root, 'upper-mid-frequency', controls.upperMidFrequencyHz, AMP_CONTROL_DEFINITIONS.upperMidFrequencyHz);
    setControlValue(root, 'upper-mid', controls.upperMidDb, AMP_CONTROL_DEFINITIONS.upperMidDb);
    setControlValue(root, 'high-shelf', controls.highShelfDb, AMP_CONTROL_DEFINITIONS.highShelfDb);
  },
};
