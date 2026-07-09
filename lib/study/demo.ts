// Public-demo shaping of a study. The demo reuses the real participant flow
// (ParticipantFlow with participantId=null → every DB write is a no-op), so all
// this module does is (a) drop the warmup / worked-example modules so a visitor
// lands directly on the real task, and (b) hand out a stable UI-state namespace
// that can never collide with a genuine /study session.
//
// Kept pure (no server-only, no I/O) so the filter is unit-testable and can run
// on either side.

import type { Module, ModuleType, ProjectContent } from '@/lib/types/study';

// Stable localStorage / carryover-timer namespace for the demo. ParticipantFlow
// keys all of its client-side state (module index, typed spec, timer, last-spec
// pointer) on `project.id`. Giving the demo a sentinel id — distinct from any
// real study UUID — guarantees a demo visitor's typed work on a shared machine
// never bleeds into (or reads) a real participant's /study session, even though
// the demo itself persists nothing to the database.
export const DEMO_PROJECT_ID = 'demo';

// The warmup / worked-example module types. The demo drops exactly these so the
// visitor starts on the real task. Verified against the live "shown" study on
// 2026-07-08: the six authored modules are think-aloud example, think-aloud
// warmup, parking-meter worked example (task_example), vending-machine warmup
// (task_warmup), the Rideshare task, and the retrospective — so dropping these
// four leaves the Rideshare task followed by the retrospective.
const DEMO_HIDDEN_TYPES: ReadonlySet<ModuleType> = new Set<ModuleType>([
  'think_aloud_example',
  'think_aloud_warmup',
  'task_example',
  'task_warmup',
]);

/** True when `type` is a warmup / worked-example module hidden from the demo. */
export function isDemoHiddenModule(type: ModuleType): boolean {
  return DEMO_HIDDEN_TYPES.has(type);
}

/** Keep only demo-visible modules, preserving order and each module's own id
 *  (used downstream as React keys and no-op save-adapter module ids). */
export function demoModules(modules: Module[]): Module[] {
  return modules.filter((m) => !isDemoHiddenModule(m.type));
}

/** Same as {@link demoModules} at the ProjectContent level. */
export function demoContent(content: ProjectContent): ProjectContent {
  return { ...content, modules: demoModules(content.modules) };
}
