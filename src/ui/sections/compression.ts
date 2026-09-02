import { AMP_CONTROL_DEFINITIONS } from '../../signalChain/settings';
import { bindContinuousControl, percentControl, setCheckbox, setControlValue, stageToggle } from './shared';
import type { WorkspaceSectionModule } from './types';

export const compressionSection: WorkspaceSectionModule = {
  definition: {
    id: 'compression',
    label: 'Compression',
    title: 'Control the dynamics',
    description: 'Bring quiet notes forward and smooth hard peaks without flattening your touch.',
  },

  action(snapshot) {
    return stageToggle('compression-enabled', 'Enable Compression', !snapshot.controls.compressionBypassed);
  },

  content(snapshot) {
    return `<div class="section-stack">
      <section class="panel hero-panel" aria-label="Compression">
        <div class="hero-copy"><p class="panel-eyebrow">Studio compressor</p><h2>Even out the performance</h2><p>Move from transparent control to a more forward, sustained feel.</p></div>
        <span class="placeholder-art large" aria-hidden="true">[img]</span>
      </section>
      <section class="panel control-panel" aria-label="Compression Controls">
        <div class="control-list">
          ${percentControl('compression-amount', 'Amount', snapshot.controls.compressionAmount, AMP_CONTROL_DEFINITIONS.compressionAmount, 'Blend in more control and sustain.')}
        </div>
        <div class="option-row">
          <label class="check-option" for="compression-level-match"><input id="compression-level-match" type="checkbox" ${snapshot.controls.compressionLevelMatch ? 'checked' : ''}><span>Level Match</span></label>
          <div class="live-readout"><span>Gain reduction</span><strong id="compression-reduction" aria-label="Compression reduction">${snapshot.compressionReductionDb.toFixed(1)} dB</strong></div>
        </div>
      </section>
    </div>`;
  },

  bind(runtime) {
    const current = () => runtime.engine.snapshot;
    const restore = () => this.sync(runtime, current());
    bindContinuousControl(runtime.root, 'compression-amount', (compressionAmount) => runtime.engine.applyControls({ ...current().controls, compressionAmount }), restore);
    runtime.root.querySelector<HTMLInputElement>('#compression-enabled')?.addEventListener('change', (event) => {
      runtime.engine.applyControls({ ...current().controls, compressionBypassed: !(event.currentTarget as HTMLInputElement).checked });
    });
    runtime.root.querySelector<HTMLInputElement>('#compression-level-match')?.addEventListener('change', (event) => {
      runtime.engine.applyControls({ ...current().controls, compressionLevelMatch: (event.currentTarget as HTMLInputElement).checked });
    });
  },

  sync(runtime, snapshot) {
    const { root } = runtime;
    setControlValue(root, 'compression-amount', snapshot.controls.compressionAmount, AMP_CONTROL_DEFINITIONS.compressionAmount);
    setCheckbox(root, 'compression-enabled', !snapshot.controls.compressionBypassed);
    setCheckbox(root, 'compression-level-match', snapshot.controls.compressionLevelMatch);
    const reduction = root.querySelector<HTMLElement>('#compression-reduction');
    if (reduction !== null) reduction.textContent = `${snapshot.compressionReductionDb.toFixed(1)} dB`;
  },
};
