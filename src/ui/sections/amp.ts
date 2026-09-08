import {
  AMP_MODEL_CONTROLS,
  type AmpChoiceDefinition,
  type AmpKnobDefinition,
  type AmpSwitchDefinition,
  type JazzAmpState,
} from '../../amps';

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
  syncChoiceCards,
} from './shared';

import type { SectionRuntime, WorkspaceSectionModule } from './types';

function ampSwitchControl(key: string, label: string, selected: boolean): string {
  return `
    <div class="amp-control amp-switch-control">
      <label class="field-label">${label}</label>
      <button
        type="button"
        class="amp-binary-switch ${selected ? 'is-on' : ''}"
        data-amp-switch-toggle="${key}"
        role="switch"
        aria-checked="${String(selected)}"
        aria-label="${label}"
      >
        <span class="toggle-track" aria-hidden="true"><span></span></span>
      </button>
    </div>
  `.trim();
}

function ampChoiceControl(
  key: string,
  label: string,
  selected: string,
  definition: AmpChoiceDefinition,
): string {
  const id = `amp-control-${key}`;
  const options = definition.options
    .map(
      ([option, optionLabel]) =>
        `<option value="${option}" ${option === selected ? 'selected' : ''}>${optionLabel}</option>`,
    )
    .join('');

  const tabs = definition.options
    .map(
      ([option, optionLabel]) => `
        <button
          type="button"
          class="amp-choice-tab ${option === selected ? 'is-selected' : ''}"
          data-amp-choice-key="${key}"
          data-amp-choice-value="${option}"
          role="radio"
          aria-checked="${String(option === selected)}"
        >${optionLabel}</button>
      `,
    )
    .join('');

  return `
    <div class="amp-control amp-choice-control">
      <label class="field-label">${label}</label>
      <div class="amp-choice-tabs" role="radiogroup" aria-label="${label}">
        ${tabs}
      </div>
      <select
        id="${id}"
        class="visually-hidden"
        data-amp-control="${key}"
        tabindex="-1"
        aria-hidden="true"
      >
        ${options}
      </select>
    </div>
  `.trim();
}

function ampModelControls(controls: AmpControlSettings): string {
  const definitions = AMP_MODEL_CONTROLS[controls.ampModel] as Readonly<
    Record<string, AmpKnobDefinition | AmpSwitchDefinition | AmpChoiceDefinition>
  >;
  const state = controls.ampSettings[controls.ampModel] as unknown as Readonly<
    Record<string, number | string | boolean>
  >;

  return Object.entries(definitions)
    .map(([key, definition]) => {
      const id = `amp-control-${key}`;
      const value = state[key];

      if (definition.kind === 'knob') {
        return knobControl(id, definition.label, value as number, definition);
      }

      if (definition.kind === 'switch') {
        return ampSwitchControl(key, definition.label, value as boolean);
      }

      return ampChoiceControl(key, definition.label, value as string, definition);
    })
    .join('\n  ');
}

function bindAmpModelControls(runtime: SectionRuntime): void {
  const current = () => runtime.engine.snapshot;
  const definitions = AMP_MODEL_CONTROLS[current().controls.ampModel] as Readonly<
    Record<string, AmpKnobDefinition | AmpSwitchDefinition | AmpChoiceDefinition>
  >;

  for (const [key, definition] of Object.entries(definitions)) {
    const apply = (value: number | string | boolean) => {
      const controls = current().controls;
      const selected = controls.ampModel;

      runtime.engine.applyControls({
        ...controls,
        ampSettings: {
          ...controls.ampSettings,
          [selected]: {
            ...controls.ampSettings[selected],
            [key]: value,
          } as JazzAmpState,
        },
      });
    };

    if (definition.kind === 'knob') {
      bindContinuousControl(
        runtime.root,
        `amp-control-${key}`,
        apply,
        () => ampSection.sync(runtime, current()),
      );
    } else if (definition.kind === 'switch') {
      const toggle = runtime.root.querySelector<HTMLButtonElement>(
        `[data-amp-switch-toggle="${key}"]`,
      );
      toggle?.addEventListener('click', () => {
        apply(toggle.getAttribute('aria-checked') !== 'true');
      });
    } else {
      const selectElement = runtime.root.querySelector<HTMLSelectElement>(
        `#amp-control-${key}`,
      );
      const applyChoice = (value: string) => {
        if (definition.options.some(([option]) => option === value)) {
          if (selectElement !== null) selectElement.value = value;
          apply(value);
        }
      };

      selectElement?.addEventListener('change', () => {
        applyChoice(selectElement.value);
      });

      runtime.root
        .querySelectorAll<HTMLButtonElement>(`[data-amp-choice-key="${key}"]`)
        .forEach((button) => {
          button.addEventListener('click', () => {
            const value = button.dataset.ampChoiceValue;
            if (value !== undefined) applyChoice(value);
          });
        });
    }
  }
}

function syncAmpSwitchControl(root: HTMLElement, key: string, value: boolean): void {
  const toggle = root.querySelector<HTMLButtonElement>(
    `[data-amp-switch-toggle="${key}"]`,
  );
  if (toggle === null) return;
  toggle.classList.toggle('is-on', value);
  toggle.setAttribute('aria-checked', String(value));
}

function syncAmpChoiceControl(root: HTMLElement, key: string, value: string): void {
  const select = root.querySelector<HTMLSelectElement>(`#amp-control-${key}`);
  if (select !== null && select.value !== value) select.value = value;

  root
    .querySelectorAll<HTMLButtonElement>(`[data-amp-choice-key="${key}"]`)
    .forEach((button) => {
      const selected = button.dataset.ampChoiceValue === value;
      button.classList.toggle('is-selected', selected);
      button.setAttribute('aria-checked', String(selected));
    });
}

export const ampSection: WorkspaceSectionModule = {
  definition: {
    id: 'amp',
    label: 'Amplifier',
    title: 'Amplifier',
  },

  action() {
    return '';
  },

  content(snapshot) {
    const controls = snapshot.controls;
    return `<div class="section-stack">
      <section class="panel" aria-label="Amp Model">
        ${choiceSelector('amp-model', 'Amp Model', controls.ampModel, AMP_MODELS)}
        <span id="amp-model-help" class="choice-help">${AMP_MODELS[controls.ampModel].description}</span>
        <div
          id="amp-model-controls"
          class="model-controls"
          data-model="${controls.ampModel}"
        >${ampModelControls(controls)}</div>
      </section>

      <section class="panel" aria-label="Cabinet">
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
      Record<string, AmpKnobDefinition | AmpSwitchDefinition | AmpChoiceDefinition>
    >;
    const ampState = controls.ampSettings[controls.ampModel] as unknown as Readonly<
      Record<string, number | string | boolean>
    >;

    for (const [key, definition] of Object.entries(definitions)) {
      if (definition.kind === 'knob') {
        setControlValue(root, `amp-control-${key}`, ampState[key] as number, definition);
      } else if (definition.kind === 'switch') {
        syncAmpSwitchControl(root, key, ampState[key] as boolean);
      } else {
        syncAmpChoiceControl(root, key, ampState[key] as string);
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
