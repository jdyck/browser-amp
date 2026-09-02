import { ampSection } from './amp';
import { compressionSection } from './compression';
import { eqSection } from './eq';
import { inputSection } from './input';
import { masterSection } from './master';
import { createReverbSection } from './reverb';
import type { WorkspaceSection, WorkspaceSectionModule } from './types';

export type { RecoveryPresentation, SectionRuntime, WorkspaceSection, WorkspaceSectionModule } from './types';

export function createWorkspaceSections(): ReadonlyMap<WorkspaceSection, WorkspaceSectionModule> {
  const sections = [inputSection, ampSection, compressionSection, eqSection, createReverbSection(), masterSection];
  return new Map(sections.map((section) => [section.definition.id, section]));
}
