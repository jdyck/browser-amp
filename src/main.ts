import { AudioEngine } from './audio/AudioEngine';
import type { AudioSnapshot, InputMeterSnapshot } from './audio/types';
import { WorkbenchPreferencesStore, resetControls, type StoredWorkbenchPreferences } from './preferences';
import { recoveryPresentation } from './ui/presentation';
import {
  createWorkspaceSections,
  type SectionRuntime,
  type WorkspaceSection,
  type WorkspaceSectionModule,
} from './ui/sections';
import { bindChoiceCards } from './ui/sections/shared';
import './styles/index.css';

const preferencesStore = new WorkbenchPreferencesStore(browserStorage());
let workbenchPreferences = preferencesStore.load();
const engine = new AudioEngine();
engine.applyControls(workbenchPreferences.controls);

const app = document.querySelector<HTMLElement>('#app');
if (app === null) throw new Error('Application root is missing.');
const root = app;

const sectionModules = createWorkspaceSections();
const sections = [...sectionModules.values()];
let snapshot = engine.snapshot;
let activeSection = sectionFromHash();
let guidanceOpen = false;
let guidanceDismissed = workbenchPreferences.hardwareDirectMonitoringGuidanceDismissed;

const sectionRuntime: SectionRuntime = {
  root,
  engine,
  resetControls: resetStoredControls,
};

function activeSectionModule(): WorkspaceSectionModule {
  return sectionModules.get(activeSection) ?? sections[0];
}

function render(next: AudioSnapshot): void {
  const previous = snapshot;
  snapshot = next;
  if (previous.controls !== next.controls) updateStoredPreferences({ controls: next.controls });
  if (structureChanged(previous, next)) renderStructure(next);
  activeSectionModule().sync(sectionRuntime, next);
  renderMeters(next);
}

function structureChanged(previous: AudioSnapshot, next: AudioSnapshot): boolean {
  return root.querySelector('#workspace-shell') === null
    || previous.lifecycle !== next.lifecycle
    || previous.monitoring !== next.monitoring
    || previous.devices !== next.devices
    || previous.selectedInputDeviceId !== next.selectedInputDeviceId
    || previous.inputChannel !== next.inputChannel
    || previous.inputChannelCount !== next.inputChannelCount
    || previous.rawCaptureWarnings !== next.rawCaptureWarnings
    || previous.outputRouting.mode !== next.outputRouting.mode
    || previous.outputRouting.devices !== next.outputRouting.devices
    || previous.outputRouting.selectedDeviceId !== next.outputRouting.selectedDeviceId
    || previous.outputRouting.error !== next.outputRouting.error
    || previous.error !== next.error
    || previous.recovery !== next.recovery;
}

function renderStructure(current: AudioSnapshot): void {
  const recovery = recoveryPresentation(current);
  const section = activeSectionModule();
  const definition = section.definition;

  root.innerHTML = `
    <div id="workspace-shell" class="workspace-shell">
      ${topBar(current)}
      <div class="workspace-body">
        ${sidebar()}
        <main class="workspace-main" aria-labelledby="section-title">
          <section class="section-view" data-section="${definition.id}">
            <div class="section-heading">
              <div>
                <p class="section-kicker">${String(sectionNumber(definition.id)).padStart(2, '0')} / ${String(sections.length).padStart(2, '0')}</p>
                <h1 id="section-title">${definition.title}</h1>
                <p>${definition.description}</p>
              </div>
              ${section.action(current, recovery)}
            </div>
            ${section.content(current, recovery)}
            ${workspaceFooter(definition.id)}
          </section>
        </main>
      </div>
      ${guidanceOpen ? hardwareGuidance() : ''}
    </div>`;

  bindShellEvents();
  bindChoiceCards(root);
  section.bind(sectionRuntime);
}

function topBar(current: AudioSnapshot): string {
  const recovery = recoveryPresentation(current);
  return `<header class="topbar">
    <div class="brand" aria-label="Browser Amp">
      <span class="brand-art" aria-hidden="true">[img]</span>
      <span>Browser Amp</span>
    </div>
    <div class="monitor-control">
      <span>Monitoring <strong id="monitoring-state">${current.monitoring ? 'On' : 'Off'}</strong></span>
      <button
        id="monitoring-toggle"
        type="button"
        class="toggle-button ${current.monitoring ? 'is-on' : ''}"
        aria-label="${recovery.monitoringButtonLabel}"
        aria-pressed="${String(current.monitoring)}"
        ${recovery.monitoringDisabled ? 'disabled' : ''}
      ><span aria-hidden="true"></span></button>
    </div>
    <div class="topbar-meters">
      ${topMeter('input', 'Input', current.meter)}
      ${topMeter('output', 'Output', current.outputMeter)}
    </div>
  </header>`;
}

function topMeter(id: 'input' | 'output', label: string, reading: InputMeterSnapshot): string {
  return `<section class="top-meter" aria-labelledby="${id}-meter-title">
    <div class="top-meter-heading">
      <h2 id="${id}-meter-title">${label}</h2>
      <span id="${id}-meter-value">${reading.dbfs.toFixed(1)} dBFS</span>
    </div>
    <div id="${id}-meter" class="meter-track" aria-label="${label} level" aria-valuemin="-60" aria-valuemax="0" aria-valuenow="${reading.dbfs}" role="progressbar">
      <div class="meter-scale" aria-hidden="true"></div>
      <div id="${id}-meter-fill" class="meter-fill ${meterRegion(reading.dbfs)}" style="width: ${100 - meterPositionPercent(reading.dbfs)}%"></div>
      <div id="${id}-meter-peak" class="meter-peak" style="left: ${meterPositionPercent(reading.peakDbfs)}%"></div>
    </div>
  </section>`;
}

function sidebar(): string {
  return `<aside class="sidebar" aria-label="Amp sections">
    <nav class="stage-nav">
      ${sections.map((section, index) => `<button
        type="button"
        class="stage-link ${section.definition.id === activeSection ? 'is-active' : ''}"
        data-section-target="${section.definition.id}"
        aria-current="${section.definition.id === activeSection ? 'step' : 'false'}"
      ><span class="stage-marker" aria-hidden="true">${index + 1}</span><span>${section.definition.label}</span></button>`).join('')}
    </nav>
  </aside>`;
}

function workspaceFooter(id: WorkspaceSection): string {
  const index = sectionNumber(id) - 1;
  const previous = sections[index - 1]?.definition;
  const next = sections[index + 1]?.definition;
  return `<footer class="workspace-footer">
    <div>${previous === undefined ? '' : `<button type="button" class="secondary-action footer-action" data-section-target="${previous.id}">Back: ${previous.label}</button>`}</div>
    <div class="progress-dots" aria-label="Section progress">
      ${sections.map(({ definition }) => `<button type="button" class="progress-dot ${definition.id === id ? 'is-active' : ''}" data-section-target="${definition.id}" aria-label="Go to ${definition.label}" aria-current="${definition.id === id ? 'step' : 'false'}"></button>`).join('')}
    </div>
    <div>${next === undefined ? '' : `<button type="button" class="primary-action footer-action" data-section-target="${next.id}">Next: ${next.label}</button>`}</div>
  </footer>`;
}

function bindShellEvents(): void {
  root.querySelectorAll<HTMLButtonElement>('[data-section-target]').forEach((button) => {
    button.addEventListener('click', () => {
      const target = button.dataset.sectionTarget;
      if (!isWorkspaceSection(target) || target === activeSection) return;
      activeSection = target;
      window.history.replaceState(null, '', `#${target}`);
      rerenderStructure();
      root.querySelector<HTMLElement>('#section-title')?.focus({ preventScroll: true });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  });
  root.querySelector<HTMLButtonElement>('#monitoring-toggle')?.addEventListener('click', () => {
    if (snapshot.monitoring) void engine.setMonitoring(false);
    else if (!guidanceDismissed) {
      guidanceOpen = true;
      rerenderStructure();
    } else void engine.setMonitoring(true);
  });
  root.querySelector<HTMLButtonElement>('#confirm-monitoring')?.addEventListener('click', () => {
    dismissGuidance();
    void engine.setMonitoring(true);
  });
  root.querySelector<HTMLButtonElement>('#dismiss-guidance')?.addEventListener('click', dismissGuidance);
}

function renderMeters(current: AudioSnapshot): void {
  updateMeter('input', current.meter);
  updateMeter('output', current.outputMeter);
}

function updateMeter(id: string, reading: InputMeterSnapshot): void {
  const meter = root.querySelector<HTMLElement>(`#${id}-meter`);
  const fill = root.querySelector<HTMLElement>(`#${id}-meter-fill`);
  const peak = root.querySelector<HTMLElement>(`#${id}-meter-peak`);
  const value = root.querySelector<HTMLElement>(`#${id}-meter-value`);
  if (meter === null || fill === null || peak === null || value === null) return;
  meter.setAttribute('aria-valuenow', String(reading.dbfs));
  fill.className = `meter-fill ${meterRegion(reading.dbfs)}`;
  fill.style.width = `${100 - meterPositionPercent(reading.dbfs)}%`;
  peak.style.left = `${meterPositionPercent(reading.peakDbfs)}%`;
  value.textContent = `${reading.dbfs.toFixed(1)} dBFS`;
}

function meterRegion(dbfs: number): string {
  if (dbfs > -3) return 'red';
  if (dbfs >= -12) return 'yellow';
  return 'green';
}

function meterPositionPercent(dbfs: number): number {
  return Math.max(0, ((dbfs + 60) / 60) * 100);
}

function hardwareGuidance(): string {
  return `<div class="modal-backdrop" role="presentation"><aside class="guidance-modal" aria-labelledby="guidance-title">
    <p class="panel-eyebrow">Quick check</p><h2 id="guidance-title">Before you monitor</h2>
    <p>Disable Hardware Direct Monitoring on your audio interface so you hear the processed path, and use headphones.</p>
    <div class="modal-actions"><button id="dismiss-guidance" type="button" class="secondary-action">Dismiss reminder</button><button id="confirm-monitoring" type="button" class="primary-action">Checked — Enable Monitoring</button></div>
  </aside></div>`;
}

function dismissGuidance(): void {
  guidanceDismissed = true;
  guidanceOpen = false;
  updateStoredPreferences({ hardwareDirectMonitoringGuidanceDismissed: true });
  rerenderStructure();
}

function resetStoredControls(): void {
  workbenchPreferences = resetControls(workbenchPreferences);
  preferencesStore.save(workbenchPreferences);
  engine.applyControls(workbenchPreferences.controls);
}

function rerenderStructure(): void {
  renderStructure(snapshot);
  activeSectionModule().sync(sectionRuntime, snapshot);
  renderMeters(snapshot);
}

function sectionNumber(id: WorkspaceSection): number {
  return Math.max(0, sections.findIndex((section) => section.definition.id === id)) + 1;
}

function isWorkspaceSection(value: unknown): value is WorkspaceSection {
  return typeof value === 'string' && sectionModules.has(value as WorkspaceSection);
}

function sectionFromHash(): WorkspaceSection {
  const value = window.location.hash.slice(1);
  return isWorkspaceSection(value) ? value : 'input';
}

function updateStoredPreferences(change: Partial<Omit<StoredWorkbenchPreferences, 'version'>>): void {
  workbenchPreferences = { ...workbenchPreferences, ...change };
  preferencesStore.save(workbenchPreferences);
}

function browserStorage(): Storage | undefined {
  try { return window.localStorage; } catch { return undefined; }
}

engine.subscribe(render);
