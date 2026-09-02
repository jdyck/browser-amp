import type { AmpKnobDefinition } from '../../signalChain/ampModels';
import type { ContinuousControlDefinition } from '../../signalChain/settings';

export const FIELD = 'field-label';
export const FIELD_HELP = 'field-help';

export function stageToggle(id: string, label: string, checked: boolean): string {
  return `<label class="stage-toggle" for="${id}">
    <span>${label}</span>
    <input id="${id}" type="checkbox" ${checked ? 'checked' : ''}>
    <span class="toggle-track" aria-hidden="true"><span></span></span>
  </label>`;
}

export function choiceSelector(
  id: string,
  label: string,
  selected: string,
  options: Readonly<Record<string, { readonly label: string; readonly description: string }>>,
): string {
  return `<label class="visually-hidden" for="${id}">${label}</label>
    <select id="${id}" class="visually-hidden" aria-describedby="${id}-help">
      ${Object.entries(options).map(([value, option]) => `<option value="${value}" ${value === selected ? 'selected' : ''}>${option.label}</option>`).join('')}
    </select>
    <div class="choice-grid" role="list" aria-label="${label} choices">
      ${Object.entries(options).map(([value, option]) => `<button type="button" class="choice-card ${value === selected ? 'is-selected' : ''}" data-select-id="${id}" data-select-value="${value}" aria-pressed="${String(value === selected)}"><span class="choice-art" aria-hidden="true">[img]</span><span>${option.label}</span></button>`).join('')}
    </div>`;
}

export function bindChoiceCards(root: HTMLElement): void {
  root.querySelectorAll<HTMLButtonElement>('[data-select-id]').forEach((button) => {
    button.addEventListener('click', () => {
      const select = root.querySelector<HTMLSelectElement>(`#${button.dataset.selectId ?? ''}`);
      if (select === null || button.dataset.selectValue === undefined) return;
      select.value = button.dataset.selectValue;
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
  });
}

export function bindContinuousControl(
  root: HTMLElement,
  id: string,
  apply: (value: number) => void,
  restoreInvalid?: () => void,
): void {
  const slider = root.querySelector<HTMLInputElement>(`#${id}-slider`);
  const numeric = root.querySelector<HTMLInputElement>(`#${id}-value`);
  slider?.addEventListener('input', () => apply(slider.valueAsNumber));
  numeric?.addEventListener('input', () => {
    if (Number.isFinite(numeric.valueAsNumber)) apply(numeric.valueAsNumber);
  });
  numeric?.addEventListener('change', () => {
    if (Number.isFinite(numeric.valueAsNumber)) apply(numeric.valueAsNumber);
    else restoreInvalid?.();
  });
}

export function setCheckbox(root: HTMLElement, id: string, checked: boolean): void {
  const input = root.querySelector<HTMLInputElement>(`#${id}`);
  if (input !== null) input.checked = checked;
}

export function syncChoiceCards(root: HTMLElement, id: string, value: string): void {
  root.querySelectorAll<HTMLButtonElement>(`[data-select-id="${id}"]`).forEach((button) => {
    const selected = button.dataset.selectValue === value;
    button.classList.toggle('is-selected', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
}

export function setControlValue(root: HTMLElement, id: string, value: number, definition: ContinuousControlDefinition): void {
  const slider = root.querySelector<HTMLInputElement>(`#${id}-slider`);
  const numeric = root.querySelector<HTMLInputElement>(`#${id}-value`);
  if (slider !== null && slider.valueAsNumber !== value) slider.value = String(value);
  const formatted = value.toFixed(definition.fractionDigits);
  if (numeric !== null && numeric.value !== formatted) numeric.value = formatted;
}

export function dbControl(id: string, label: string, value: number, definition: ContinuousControlDefinition, help = ''): string {
  return continuousControl(id, label, value, definition, 'dB', help);
}

export function unitControl(id: string, label: string, value: number, definition: ContinuousControlDefinition, unit: string, help = ''): string {
  return continuousControl(id, label, value, definition, unit, help);
}

export function percentControl(id: string, label: string, value: number, definition: ContinuousControlDefinition, help = ''): string {
  return continuousControl(id, label, value, definition, '%', help);
}

export function knobControl(id: string, label: string, value: number, definition: AmpKnobDefinition): string {
  return continuousControl(id, label, value, definition, '', 'Tune this amplifier parameter.');
}

export function continuousControl(
  id: string,
  label: string,
  value: number,
  definition: ContinuousControlDefinition,
  unit: string,
  help: string,
): string {
  const helpId = `${id}-help`;
  return `<div class="continuous-control">
    <div class="control-copy"><label for="${id}-slider">${label}</label>${help === '' ? '' : `<span id="${helpId}">${help}</span>`}</div>
    <input id="${id}-slider" aria-label="${label} slider" ${help === '' ? '' : `aria-describedby="${helpId}"`} type="range" min="${definition.minimum}" max="${definition.maximum}" step="${definition.step}" value="${value}">
    <div class="value-field"><input id="${id}-value" aria-label="${label} value" ${help === '' ? '' : `aria-describedby="${helpId}"`} type="number" inputmode="decimal" min="${definition.minimum}" max="${definition.maximum}" step="${definition.step}" value="${value.toFixed(definition.fractionDigits)}"><span aria-hidden="true">${unit}</span></div>
  </div>`;
}

export function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}
