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

// Initialize preferences and audio engine
const preferencesStore = new WorkbenchPreferencesStore(browserStorage());
let workbenchPreferences = preferencesStore.load();

const engine = new AudioEngine();
engine.applyControls(workbenchPreferences.controls);

// Set up root element
const app = document.querySelector<HTMLElement>('#app');
if (app === null) throw new Error('Application root is missing.');
const root = app;

// Initialize sections and state
const sectionModules = createWorkspaceSections();
const sections = [...sectionModules.values()];

let snapshot = engine.snapshot;
let activeSection = sectionFromHash();
let guidanceOpen = false;
let guidanceDismissed = workbenchPreferences.hardwareDirectMonitoringGuidanceDismissed;

// Runtime context passed to section modules
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
  // Check if DOM structure needs rebuilding
  if (root.querySelector('#workspace-shell') === null) return true;

  // Check lifecycle and connection state
  if (previous.lifecycle !== next.lifecycle) return true;
  if (previous.monitoring !== next.monitoring) return true;
  if (previous.devices !== next.devices) return true;

  // Check input settings
  if (previous.selectedInputDeviceId !== next.selectedInputDeviceId) return true;
  if (previous.inputChannel !== next.inputChannel) return true;
  if (previous.inputChannelCount !== next.inputChannelCount) return true;
  if (previous.rawCaptureWarnings !== next.rawCaptureWarnings) return true;

  // Check output routing
  if (previous.outputRouting.mode !== next.outputRouting.mode) return true;
  if (previous.outputRouting.devices !== next.outputRouting.devices) return true;
  if (previous.outputRouting.selectedDeviceId !== next.outputRouting.selectedDeviceId) return true;
  if (previous.outputRouting.error !== next.outputRouting.error) return true;

  // Check errors and recovery state
  if (previous.error !== next.error) return true;
  if (previous.recovery !== next.recovery) return true;

  return false;
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
                <h1 id="section-title">${definition.title}</h1>
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

function topMeter(
  id: 'input' | 'output',
  label: string,
  reading: InputMeterSnapshot
): string {
  const dbValue = reading.dbfs.toFixed(1);
  const fillWidth = 100 - meterPositionPercent(reading.dbfs);
  const peakPosition = meterPositionPercent(reading.peakDbfs);
  const region = meterRegion(reading.dbfs);

  return `
    <section class="top-meter" aria-labelledby="${id}-meter-title">
      <div class="top-meter-heading">
        <h2 id="${id}-meter-title">${label}</h2>
        <span id="${id}-meter-value">${dbValue} dBFS</span>
      </div>
      <div
        id="${id}-meter"
        class="meter-track"
        aria-label="${label} level"
        aria-valuemin="-60"
        aria-valuemax="0"
        aria-valuenow="${reading.dbfs}"
        role="progressbar"
      >
        <div class="meter-scale" aria-hidden="true"></div>
        <div
          id="${id}-meter-fill"
          class="meter-fill ${region}"
          style="width: ${fillWidth}%"
        ></div>
        <div
          id="${id}-meter-peak"
          class="meter-peak"
          style="left: ${peakPosition}%"
        ></div>
      </div>
    </section>
  `.trim();
}

function sidebar(): string {
  const navButtons = sections
    .map((section, index) => {
      const isActive = section.definition.id === activeSection;
      return `
        <button
          type="button"
          class="stage-link ${isActive ? 'is-active' : ''}"
          data-section-target="${section.definition.id}"
          aria-current="${isActive ? 'step' : 'false'}"
        >
          <span class="stage-marker" aria-hidden="true">${index + 1}</span>
          <span>${section.definition.label}</span>
        </button>
      `.trim();
    })
    .join('\n    ');

  return `
    <aside class="sidebar" aria-label="Amp sections">
      <nav class="stage-nav">
        ${navButtons}
      </nav>
    </aside>
  `.trim();
}

function workspaceFooter(id: WorkspaceSection): string {
  const index = sectionNumber(id) - 1;
  const previous = sections[index - 1]?.definition;
  const next = sections[index + 1]?.definition;

  const backButton = previous === undefined
    ? ''
    : `<button type="button" class="secondary-action footer-action" data-section-target="${previous.id}">Back: ${previous.label}</button>`;

  const progressDots = sections
    .map(({ definition }) => {
      const isActive = definition.id === id;
      return `
        <button
          type="button"
          class="progress-dot ${isActive ? 'is-active' : ''}"
          data-section-target="${definition.id}"
          aria-label="Go to ${definition.label}"
          aria-current="${isActive ? 'step' : 'false'}"
        ></button>
      `.trim();
    })
    .join('\n      ');

  const nextButton = next === undefined
    ? ''
    : `<button type="button" class="primary-action footer-action" data-section-target="${next.id}">Next: ${next.label}</button>`;

  return `
    <footer class="workspace-footer">
      <div>${backButton}</div>
      <div class="progress-dots" aria-label="Section progress">
        ${progressDots}
      </div>
      <div>${nextButton}</div>
    </footer>
  `.trim();
}

function bindShellEvents(): void {
  // Section navigation buttons
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

  // Monitoring toggle
  root.querySelector<HTMLButtonElement>('#monitoring-toggle')?.addEventListener('click', () => {
    if (snapshot.monitoring) {
      void engine.setMonitoring(false);
    } else if (!guidanceDismissed) {
      guidanceOpen = true;
      rerenderStructure();
    } else {
      void engine.setMonitoring(true);
    }
  });

  // Monitoring guidance confirmation
  root.querySelector<HTMLButtonElement>('#confirm-monitoring')?.addEventListener('click', () => {
    dismissGuidance();
    void engine.setMonitoring(true);
  });

  // Guidance dismissal
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
  return `
    <div class="modal-backdrop" role="presentation">
      <aside class="guidance-modal" aria-labelledby="guidance-title">
        <p class="panel-eyebrow">Quick check</p>
        <h2 id="guidance-title">Before you monitor</h2>
        <p>Disable Hardware Direct Monitoring on your audio interface so you hear the processed path, and use headphones.</p>
        <div class="modal-actions">
            <button id="dismiss-guidance" type="button" class="secondary-action">Dismiss reminder</button>
            <button id="confirm-monitoring" type="button" class="primary-action">Checked — Enable Monitoring</button>
        </div>
      </aside>
    </div>
  `;
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
