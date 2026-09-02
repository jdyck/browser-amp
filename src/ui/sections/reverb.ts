import { AMP_CONTROL_DEFINITIONS, REVERB_PROFILES, isReverbProfile } from '../../signalChain/settings';
import {
  DEFAULT_REVERB_SETTINGS,
  reverbControlEntries,
  reverbParameters,
  type ReverbControlDefinition,
} from '../../signalChain/reverbProfiles';
import { bindContinuousControl, choiceSelector, continuousControl, percentControl, setCheckbox, setControlValue, stageToggle, syncChoiceCards } from './shared';
import type { SectionRuntime, WorkspaceSectionModule } from './types';

export function createReverbSection(): WorkspaceSectionModule {
  const accordionOpen = { main: true, advanced: false };

  function accordions(controls: SectionRuntime['engine']['snapshot']['controls']): string {
    const parameters = reverbParameters(controls.reverbProfile, controls.reverbSettings);
    return (['main', 'advanced'] as const).map((section) => `
      <details id="reverb-${section}" class="reverb-accordion" ${accordionOpen[section] ? 'open' : ''}>
        <summary>${section === 'main' ? 'Main Controls' : 'Advanced Controls'}</summary>
        <div class="control-list">
          ${section === 'main' ? percentControl('reverb-amount', 'Reverb', controls.reverbAmount, AMP_CONTROL_DEFINITIONS.reverbAmount, 'Set how much ambience is mixed in.') : ''}
          ${reverbControlEntries(controls.reverbProfile, section).map(([key, definition]) => parameterControl(`reverb-${key}`, parameters[key], definition)).join('')}
        </div>
      </details>`).join('');
  }

  function parameterControl(id: string, value: number, definition: ReverbControlDefinition): string {
    return continuousControl(id, definition.label, value, definition, definition.unit, definition.help);
  }

  function bindControls(runtime: SectionRuntime): void {
    const current = () => runtime.engine.snapshot;
    bindContinuousControl(runtime.root, 'reverb-amount', (reverbAmount) => runtime.engine.applyControls({ ...current().controls, reverbAmount }), () => module.sync(runtime, current()));
    for (const section of ['main', 'advanced'] as const) {
      const details = runtime.root.querySelector<HTMLDetailsElement>(`#reverb-${section}`);
      details?.addEventListener('toggle', () => {
        if (details.isConnected) accordionOpen[section] = details.open;
      });
    }
    for (const [key] of reverbControlEntries(current().controls.reverbProfile)) {
      bindContinuousControl(runtime.root, `reverb-${key}`, (value) => {
        const controls = current().controls;
        runtime.engine.applyControls({ ...controls, reverbSettings: {
          ...controls.reverbSettings,
          [controls.reverbProfile]: { ...controls.reverbSettings[controls.reverbProfile], [key]: value },
        } });
      }, () => module.sync(runtime, current()));
    }
  }

  const module: WorkspaceSectionModule = {
    definition: {
      id: 'reverb',
      label: 'Reverb',
      title: 'Add some space',
      description: 'Choose a room, plate, spring, or hall and place your guitar inside it.',
    },

    action(snapshot) {
      return stageToggle('reverb-enabled', 'Enable Reverb', !snapshot.controls.reverbBypassed);
    },

    content(snapshot) {
      const controls = snapshot.controls;
      return `<div class="section-stack">
        <section class="panel reverb-choice-panel" aria-label="Reverb">
          <div class="panel-heading compact">
            <p class="panel-eyebrow">Reverb type</p>
            <button id="reset-reverb" type="button" class="text-action" title="Restore only this module's Main and Advanced settings. Amount and Enable Reverb stay unchanged.">Reset This Reverb</button>
          </div>
          ${choiceSelector('reverb-profile', 'Reverb Module', controls.reverbProfile, REVERB_PROFILES)}
          <span id="reverb-profile-help" class="choice-help">${REVERB_PROFILES[controls.reverbProfile].description}</span>
        </section>
        <section id="reverb-settings" class="panel control-panel reverb-control-panel" data-profile="${controls.reverbProfile}" aria-label="Reverb Controls">${accordions(controls)}</section>
      </div>`;
    },

    bind(runtime) {
      const current = () => runtime.engine.snapshot;
      runtime.root.querySelector<HTMLSelectElement>('#reverb-profile')?.addEventListener('change', (event) => {
        const reverbProfile = (event.currentTarget as HTMLSelectElement).value;
        if (isReverbProfile(reverbProfile)) runtime.engine.applyControls({ ...current().controls, reverbProfile });
      });
      runtime.root.querySelector<HTMLButtonElement>('#reset-reverb')?.addEventListener('click', () => {
        const controls = current().controls;
        runtime.engine.applyControls({ ...controls, reverbSettings: {
          ...controls.reverbSettings,
          [controls.reverbProfile]: { ...DEFAULT_REVERB_SETTINGS[controls.reverbProfile] },
        } });
      });
      runtime.root.querySelector<HTMLInputElement>('#reverb-enabled')?.addEventListener('change', (event) => {
        runtime.engine.applyControls({ ...current().controls, reverbBypassed: !(event.currentTarget as HTMLInputElement).checked });
      });
      bindControls(runtime);
    },

    sync(runtime, snapshot) {
      const { root } = runtime;
      const controls = snapshot.controls;
      const profile = root.querySelector<HTMLSelectElement>('#reverb-profile');
      if (profile !== null && profile.value !== controls.reverbProfile) profile.value = controls.reverbProfile;
      const help = root.querySelector<HTMLElement>('#reverb-profile-help');
      if (help !== null) help.textContent = REVERB_PROFILES[controls.reverbProfile].description;
      const settings = root.querySelector<HTMLElement>('#reverb-settings');
      if (settings !== null && settings.dataset.profile !== controls.reverbProfile) {
        for (const section of ['main', 'advanced'] as const) {
          const details = root.querySelector<HTMLDetailsElement>(`#reverb-${section}`);
          if (details !== null) accordionOpen[section] = details.open;
        }
        settings.innerHTML = accordions(controls);
        settings.dataset.profile = controls.reverbProfile;
        bindControls(runtime);
      }
      const parameters = reverbParameters(controls.reverbProfile, controls.reverbSettings);
      for (const [key, definition] of reverbControlEntries(controls.reverbProfile)) setControlValue(root, `reverb-${key}`, parameters[key], definition);
      setControlValue(root, 'reverb-amount', controls.reverbAmount, AMP_CONTROL_DEFINITIONS.reverbAmount);
      setCheckbox(root, 'reverb-enabled', !controls.reverbBypassed);
      syncChoiceCards(root, 'reverb-profile', controls.reverbProfile);
    },
  };

  return module;
}
