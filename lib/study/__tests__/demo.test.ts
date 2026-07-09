import { describe, expect, it } from 'vitest';
import type { Module, ModuleType, ProjectContent } from '@/lib/types/study';
import {
  DEMO_PROJECT_ID,
  demoContent,
  demoModules,
  isDemoHiddenModule,
} from '@/lib/study/demo';

// The filter only inspects `type`; a minimal stub keyed by type is enough to
// pin the drop/keep behavior without dragging in each module type's full shape.
function mod(id: string, type: ModuleType): Module {
  return { id, type } as unknown as Module;
}

// Mirrors the live "shown" study's authored module order (2026-07-08).
const LIVE_ORDER: Array<[string, ModuleType]> = [
  ['m1', 'think_aloud_example'],
  ['m2', 'think_aloud_warmup'],
  ['m3', 'task_example'],
  ['m4', 'task_warmup'],
  ['m5', 'task'],
  ['m6', 'retrospective_report'],
];

describe('isDemoHiddenModule', () => {
  it('hides the four warmup / worked-example types', () => {
    expect(isDemoHiddenModule('think_aloud_example')).toBe(true);
    expect(isDemoHiddenModule('think_aloud_warmup')).toBe(true);
    expect(isDemoHiddenModule('task_example')).toBe(true);
    expect(isDemoHiddenModule('task_warmup')).toBe(true);
  });

  it('keeps the real task, the retrospective, and standalone instructions', () => {
    expect(isDemoHiddenModule('task')).toBe(false);
    expect(isDemoHiddenModule('retrospective_report')).toBe(false);
    expect(isDemoHiddenModule('instructions')).toBe(false);
  });
});

describe('demoModules', () => {
  it('drops warmups from the live study, leaving task → retrospective in order', () => {
    const kept = demoModules(LIVE_ORDER.map(([id, t]) => mod(id, t)));
    expect(kept.map((m) => m.type)).toEqual(['task', 'retrospective_report']);
    expect(kept.map((m) => m.id)).toEqual(['m5', 'm6']);
  });

  it('preserves the relative order and ids of surviving modules', () => {
    const input = [
      mod('a', 'instructions'),
      mod('b', 'task_warmup'),
      mod('c', 'task'),
      mod('d', 'task_example'),
      mod('e', 'retrospective_report'),
    ];
    const kept = demoModules(input);
    expect(kept.map((m) => m.id)).toEqual(['a', 'c', 'e']);
  });

  it('returns a new array (does not mutate the input)', () => {
    const input = LIVE_ORDER.map(([id, t]) => mod(id, t));
    const before = input.length;
    demoModules(input);
    expect(input.length).toBe(before);
  });
});

describe('demoContent', () => {
  it('filters modules while carrying the rest of the content object', () => {
    const content: ProjectContent = {
      modules: LIVE_ORDER.map(([id, t]) => mod(id, t)),
    };
    const out = demoContent(content);
    expect(out.modules.map((m) => m.type)).toEqual([
      'task',
      'retrospective_report',
    ]);
    // original untouched
    expect(content.modules).toHaveLength(6);
  });
});

describe('DEMO_PROJECT_ID', () => {
  it('is a stable, non-UUID sentinel so it cannot collide with a real study', () => {
    expect(DEMO_PROJECT_ID).toBe('demo');
    // A real study id is a UUID; the sentinel must not look like one.
    expect(DEMO_PROJECT_ID).not.toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });
});
