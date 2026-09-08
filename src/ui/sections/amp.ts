import {
  AMP_MODEL_CONTROLS,
  type AmpChoiceDefinition,
  type AmpKnobDefinition,
  type JazzAmpState,
} from '../../signalChain/ampModels';

import {
  AMP_MODELS,
  CABINET_MODELS,
  isAmpModel,
  isCabinetModel,
  type AmpControlSettings,
} from '../../signalChain/settings';

import {
  bindContinuousControl,
  choiceSelector,
  knobControl,
  setControlValue,
  syncChoiceCards
} from './shared';

import type { SectionRuntime, WorkspaceSectionModule } from './types';

function ampModelControls(controls: AmpControlSettings): string {
  const definitions = AMP_MODEL_CONTROLS[controls.ampModel] as Readonly<
    Record<string, AmpKnobDefinition | AmpChoiceDefinition>
  >;
  const state = controls.ampSettings[controls.ampModel] as unknown as Readonly<
    Record<string, number | string>
  >;

  return Object.entries(definitions)
    .map(([key, definition]) => {
      const id = `amp-control-${key}`;
      const value = state[key];

      if (definition.kind === 'knob') {
        return knobControl(id, definition.label, value as number, definition);
      }

      const options = definition.options
        .map(
          ([option, label]) =>
            `<option value="${option}" ${option === value ? 'selected' : ''}>${label}</option>`
        )
        .join('');

      return `
        <div class="select-control">
          <label for="${id}" class="field-label">${definition.label}</label>
          <select id="${id}" data-amp-control="${key}">
            ${options}
          </select>
        </div>
      `.trim();
    })
    .join('\n  ');
}

function bindAmpModelControls(runtime: SectionRuntime): void {
  const current = () => runtime.engine.snapshot;
  const definitions = AMP_MODEL_CONTROLS[current().controls.ampModel] as Readonly<
    Record<string, AmpKnobDefinition | AmpChoiceDefinition>
  >;

  for (const [key, definition] of Object.entries(definitions)) {
    const apply = (value: number | string) => {
      const controls = current().controls;
      const selected = controls.ampModel;

      runtime.engine.applyControls({
        ...controls,
        ampSettings: {
          ...controls.ampSettings,
          [selected]: {
            ...controls.ampSettings[selected],
            [key]: value
          } as JazzAmpState,
        },
      });
    };

    if (definition.kind === 'knob') {
      bindContinuousControl(
        runtime.root,
        `amp-control-${key}`,
        apply,
        () => ampSection.sync(runtime, current())
      );
    } else {
      const selectElement = runtime.root.querySelector<HTMLSelectElement>(
        `#amp-control-${key}`
      );
      selectElement?.addEventListener('change', (event) => {
        const value = (event.currentTarget as HTMLSelectElement).value;
        if (definition.options.some(([option]) => option === value)) {
          apply(value);
        }
      });
    }
  }
}

export const ampSection: WorkspaceSectionModule = {
  definition: {
    id: 'amp',
    label: 'Amplifier',
    title: 'Amplifier'
  },

  action() {
    return '';
  },

  content(snapshot) {
    const controls = snapshot.controls;
    return `<div class="section-stack">
      <section class="panel" aria-label="Amp Model">
<!--        <div class="panel-heading compact"><div><p class="panel-eyebrow">Amp model</p><h2>Pick an amplifier</h2></div></div>-->
        ${choiceSelector('amp-model', 'Amp Model', controls.ampModel, AMP_MODELS)}
        <span id="amp-model-help" class="choice-help">${AMP_MODELS[controls.ampModel].description}</span>
        <div id="amp-model-controls" class="model-controls" data-model="${controls.ampModel}">${ampModelControls(controls)}</div>
      </section>

      <section class="panel" aria-label="Cabinet">
<!--        <div class="panel-heading compact"><div><p class="panel-eyebrow">Cabinet</p><h2>Choose the speaker response</h2></div></div>-->
        ${choiceSelector('cabinet-model', 'Cabinet', controls.cabinetModel, CABINET_MODELS)}
        <span id="cabinet-model-help" class="choice-help">${CABINET_MODELS[controls.cabinetModel].description}</span>
      </section>
    </div>`;
  },

  bind(runtime) {
    const current = () => runtime.engine.snapshot;

    // Amp model selection
    runtime.root.querySelector<HTMLSelectElement>('#amp-model')?.addEventListener('change', (event) => {
      const ampModel = (event.currentTarget as HTMLSelectElement).value;
      if (isAmpModel(ampModel)) {
        runtime.engine.applyControls({ ...current().controls, ampModel });
      }
    });

    // Cabinet model selection
    runtime.root.querySelector<HTMLSelectElement>('#cabinet-model')?.addEventListener('change', (event) => {
      const cabinetModel = (event.currentTarget as HTMLSelectElement).value;
      if (isCabinetModel(cabinetModel)) {
        runtime.engine.applyControls({ ...current().controls, cabinetModel });
      }
    });

    // Bind individual amp model controls
    bindAmpModelControls(runtime);
  },

  sync(runtime, snapshot) {
    const { root } = runtime;
    const controls = snapshot.controls;

    // Sync amp model selector
    const ampModel = root.querySelector<HTMLSelectElement>('#amp-model');
    if (ampModel !== null && ampModel.value !== controls.ampModel) {
      ampModel.value = controls.ampModel;
    }

    // Sync amp model help text
    const ampModelHelp = root.querySelector<HTMLElement>('#amp-model-help');
    if (ampModelHelp !== null) {
      ampModelHelp.textContent = AMP_MODELS[controls.ampModel].description;
    }

    // Sync amp model controls (rebuild if model changed)
    const ampControls = root.querySelector<HTMLElement>('#amp-model-controls');
    if (ampControls !== null && ampControls.dataset.model !== controls.ampModel) {
      ampControls.innerHTML = ampModelControls(controls);
      ampControls.dataset.model = controls.ampModel;
      bindAmpModelControls(runtime);
    }

    // Sync individual control values
    const definitions = AMP_MODEL_CONTROLS[controls.ampModel] as Readonly<
      Record<string, AmpKnobDefinition | AmpChoiceDefinition>
    >;
    const ampState = controls.ampSettings[controls.ampModel] as unknown as Readonly<
      Record<string, number | string>
    >;

    for (const [key, definition] of Object.entries(definitions)) {
      if (definition.kind === 'knob') {
        setControlValue(root, `amp-control-${key}`, ampState[key] as number, definition);
      } else {
        const select = root.querySelector<HTMLSelectElement>(`#amp-control-${key}`);
        if (select !== null && select.value !== ampState[key]) {
          select.value = ampState[key] as string;
        }
      }
    }

    // Sync cabinet model selector
    const cabinetModel = root.querySelector<HTMLSelectElement>('#cabinet-model');
    if (cabinetModel !== null && cabinetModel.value !== controls.cabinetModel) {
      cabinetModel.value = controls.cabinetModel;
    }

    // Sync cabinet help text
    const cabinetHelp = root.querySelector<HTMLElement>('#cabinet-model-help');
    if (cabinetHelp !== null) {
      cabinetHelp.textContent = CABINET_MODELS[controls.cabinetModel].description;
    }

    // Sync choice card selection states
    syncChoiceCards(root, 'amp-model', controls.ampModel);
    syncChoiceCards(root, 'cabinet-model', controls.cabinetModel);
  },
};
