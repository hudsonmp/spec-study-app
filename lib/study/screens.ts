import type { Module, ProjectContent } from '@/lib/types/study';

export type ScreenKind =
  | 'warmup_intro'
  | 'warmup_body'
  | 'warmup_revealed'
  | 'task_intro'
  | 'task_context'
  | 'task_initial_spec'
  | 'task_scenario_read'
  | 'task_scenario_ponder'
  | 'task_scenario_revise'
  | 'retrospective';

export type Screen = {
  key: string;
  moduleId: string;
  moduleType: Module['type'];
  moduleNumber: number;
  moduleLabel: string;
  kind: ScreenKind;
  idx?: number;
  label: string;
  summary: string;
};

const TASK_STEPS_BASE: ScreenKind[] = [
  'task_intro',
  'task_context',
  'task_initial_spec',
];

const TASK_STEPS_PER_SCENARIO: ScreenKind[] = [
  'task_scenario_read',
  'task_scenario_ponder',
  'task_scenario_revise',
];

function snippet(s: string, max = 80): string {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length > max ? t.slice(0, max - 1) + '…' : t;
}

export function labelFor(kind: ScreenKind): string {
  switch (kind) {
    case 'warmup_intro':
      return 'Think-aloud intro';
    case 'warmup_body':
      return 'Warmup body';
    case 'warmup_revealed':
      return 'Reveal';
    case 'task_intro':
      return 'Task intro';
    case 'task_context':
      return 'Context';
    case 'task_initial_spec':
      return 'Initial spec';
    case 'task_scenario_read':
      return 'Scenario read';
    case 'task_scenario_ponder':
      return 'Scenario ponder';
    case 'task_scenario_revise':
      return 'Scenario revise';
    case 'retrospective':
      return 'Retrospective';
  }
}

export function enumerateScreens(content: ProjectContent): Screen[] {
  const out: Screen[] = [];
  content.modules.forEach((m, mi) => {
    const moduleNumber = mi + 1;
    if (m.type === 'think_aloud_warmup') {
      const moduleLabel = m.title || 'Think-aloud warmup';
      out.push({
        key: `${m.id}:warmup_intro`,
        moduleId: m.id,
        moduleType: m.type,
        moduleNumber,
        moduleLabel,
        kind: 'warmup_intro',
        label: `Module ${moduleNumber} · Think-aloud intro`,
        summary: 'Centered: "Think-Aloud Instructions"',
      });
      out.push({
        key: `${m.id}:warmup_body`,
        moduleId: m.id,
        moduleType: m.type,
        moduleNumber,
        moduleLabel,
        kind: 'warmup_body',
        label: `Module ${moduleNumber} · Warmup body`,
        summary: snippet(m.body || m.taskDescription || ''),
      });
      out.push({
        key: `${m.id}:warmup_revealed`,
        moduleId: m.id,
        moduleType: m.type,
        moduleNumber,
        moduleLabel,
        kind: 'warmup_revealed',
        label: `Module ${moduleNumber} · Reveal: ${snippet(m.revealedTask || '', 24)}`,
        summary: m.revealedTask || '(no revealed task)',
      });
      return;
    }
    if (m.type === 'task' || m.type === 'task_warmup') {
      const moduleLabel =
        m.title || (m.type === 'task_warmup' ? 'Task warmup' : 'Task');
      TASK_STEPS_BASE.forEach((kind) => {
        out.push({
          key: `${m.id}:${kind}`,
          moduleId: m.id,
          moduleType: m.type,
          moduleNumber,
          moduleLabel,
          kind,
          label: `Module ${moduleNumber} · ${labelFor(kind)}`,
          summary:
            kind === 'task_context'
              ? snippet(m.studyContext)
              : kind === 'task_initial_spec'
              ? snippet(m.initialSpec[0]?.prompt ?? '')
              : moduleLabel,
        });
      });
      m.scenarios.forEach((sc, idx) => {
        TASK_STEPS_PER_SCENARIO.forEach((kind) => {
          out.push({
            key: `${m.id}:${kind}:${idx}`,
            moduleId: m.id,
            moduleType: m.type,
            moduleNumber,
            moduleLabel,
            kind,
            idx,
            label: `Module ${moduleNumber} · ${labelFor(kind)} (${sc.title})`,
            summary: snippet(
              sc.clauses.map((c) => `${c.type} ${c.text}`).join('; '),
            ),
          });
        });
      });
      return;
    }
    if (m.type === 'retrospective_report') {
      const moduleLabel = m.title || 'Retrospective';
      out.push({
        key: `${m.id}:retrospective`,
        moduleId: m.id,
        moduleType: m.type,
        moduleNumber,
        moduleLabel,
        kind: 'retrospective',
        label: `Module ${moduleNumber} · Retrospective`,
        summary: snippet(m.questions.map((q) => q.text).join(' | ')),
      });
    }
  });
  return out;
}
