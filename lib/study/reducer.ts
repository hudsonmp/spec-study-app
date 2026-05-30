import type {
  ProjectContent,
  Module,
  TaskContent,
} from '@/lib/types/study';
import { emptyContent } from '@/lib/types/study';

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

// Lightweight migration: handle legacy authored_data shapes by collapsing
// them into the new modules array. If anything looks recognizable from the
// old templates+domains shape, we keep it as best-effort. Otherwise we
// return an empty project content.
export function migrateContent(input: unknown): ProjectContent {
  if (!input || typeof input !== 'object') return emptyContent();
  const obj = input as Record<string, unknown>;

  // New shape: { modules: [...] }
  if (Array.isArray(obj.modules)) {
    return { modules: obj.modules as Module[] };
  }

  // Legacy shape: { templates, domains } — convert each domain to a Task
  // module, drop the templates wrapper.
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
