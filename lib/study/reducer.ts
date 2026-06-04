import type {
  ProjectContent,
  Module,
  TaskContent,
  TaskExample,
  ThinkAloudExample,
  ThinkAloudWarmupModule,
  ThinkAloudExampleModule,
  TaskExampleModule,
} from '@/lib/types/study';
import { emptyContent, uid } from '@/lib/types/study';

export type ContentAction =
  | { type: 'set'; content: ProjectContent }
  | { type: 'patch'; fn: (c: ProjectContent) => void };

export function contentReducer(
  state: ProjectContent,
  action: ContentAction,
): ProjectContent {
  if (action.type === 'set') return action.content;
  const draft = structuredClone(state);
  action.fn(draft);
  return draft;
}

// Legacy module shapes carried an optional `example` sub-field. These two
// aliases let migrateModule read it before it's stripped.
type LegacyWarmup = ThinkAloudWarmupModule & { example?: ThinkAloudExample };
type LegacyTaskWarmup = TaskContent & {
  id: string;
  type: 'task_warmup';
  example?: TaskExample;
};

const EMPTY_PREFILLED: TaskExample['prefilled'] = {
  initial: { spec: '', entities: [] },
  perScenario: [],
};

// Split a single (possibly legacy) module into one or more current-shape
// modules. A legacy `example` sub-field becomes a standalone worked-example
// module inserted IMMEDIATELY BEFORE its parent, preserving sequence and all
// authored content. Lossless: nothing is dropped, only re-homed.
function migrateModule(m: Module): Module[] {
  if (m.type === 'think_aloud_warmup') {
    const w = m as LegacyWarmup;
    const out: Module[] = [];
    if (w.example) {
      const ex = w.example;
      const exampleModule: ThinkAloudExampleModule = {
        id: uid(),
        type: 'think_aloud_example',
        title: w.title ? `${w.title} — worked example` : 'Worked example',
        taskDescription: ex.altTaskDescription ?? '',
        body: ex.altBody ?? '',
        revealedTask: ex.altRevealedTask ?? '',
        revealedAnswer: '',
        walkthroughText: ex.walkthroughText ?? '',
      };
      out.push(exampleModule);
    }
    // Strip the legacy example field and backfill required string fields.
    const { example: _drop, ...rest } = w;
    void _drop;
    const warmup: ThinkAloudWarmupModule = {
      ...rest,
      revealedTask:
        typeof rest.revealedTask === 'string' ? rest.revealedTask : '',
      revealedAnswer:
        typeof rest.revealedAnswer === 'string' ? rest.revealedAnswer : '',
    };
    out.push(warmup);
    return out;
  }

  if (m.type === 'task_warmup') {
    const w = m as LegacyTaskWarmup;
    const out: Module[] = [];
    if (w.example) {
      const ex = w.example;
      const exampleModule: TaskExampleModule = {
        ...ex,
        prefilled: ex.prefilled ?? EMPTY_PREFILLED,
        id: uid(),
        type: 'task_example',
        title:
          ex.title ||
          (w.title ? `${w.title} — worked example` : 'Worked example task'),
        walkthroughText: '',
      };
      out.push(exampleModule);
    }
    const { example: _drop, ...rest } = w;
    void _drop;
    out.push(rest as Module);
    return out;
  }

  // All current-shape modules (incl. think_aloud_example / task_example /
  // task / retrospective_report) pass through unchanged.
  return [m];
}

// Migration: handle legacy authored_data shapes by normalizing them into the
// current modules array. Splits any legacy `example` sub-field into its own
// module. Unknown shapes return empty content.
export function migrateContent(input: unknown): ProjectContent {
  if (!input || typeof input !== 'object') return emptyContent();
  const obj = input as Record<string, unknown>;

  // New shape: { modules: [...] }
  if (Array.isArray(obj.modules)) {
    const modules = (obj.modules as Module[]).flatMap(migrateModule);
    return { modules };
  }

  // Legacy shape: { templates, domains } — no longer supported; start clean.
  return emptyContent();
}

export function moveInArray<T>(arr: T[], idx: number, dir: -1 | 1): boolean {
  const j = idx + dir;
  if (j < 0 || j >= arr.length) return false;
  const tmp = arr[idx];
  arr[idx] = arr[j];
  arr[j] = tmp;
  return true;
}

// Type guards — easier than `if (m.type === 'task') as TaskContent`
export function isTaskLike(
  m: Module,
): m is Extract<Module, { type: 'task' | 'task_warmup' }> {
  return m.type === 'task' || m.type === 'task_warmup';
}

// Apply a function to a task-shaped module without losing its discriminator.
export function patchTaskLike(
  m: Module,
  fn: (t: TaskContent) => void,
): void {
  if (!isTaskLike(m)) return;
  fn(m);
}
