import type { Module, ProjectContent } from '@/lib/types/study';

export type ScreenKind =
  | 'pre_system'
  | 'login'
  | 'questionnaire'
  // Think-aloud warmup, example variant (only emitted when module.example)
  | 'warmup_example_intro'
  | 'warmup_example_body'
  | 'warmup_example_revealed'
  // Think-aloud warmup, real
  | 'warmup_intro'
  | 'warmup_body'
  | 'warmup_revealed'
  // Task warmup example variant (only emitted when task_warmup.example)
  | 'task_example_initial_spec'
  | 'task_example_scenario_read'
  | 'task_example_scenario_ponder'
  | 'task_example_scenario_revise'
  // Task / task_warmup, real
  | 'task_intro'
  | 'task_context'
  | 'task_initial_spec'
  | 'task_scenario_read'
  | 'task_scenario_ponder'
  | 'task_scenario_revise'
  // Retrospective: one screen per question now
  | 'retrospective_question';

// Globals: not tied to any module. moduleId is a sentinel '_global', moduleType
// widened with 'global' to keep the Screen shape uniform.
const GLOBAL_KINDS = ['pre_system', 'login', 'questionnaire'] as const;
type GlobalKind = (typeof GLOBAL_KINDS)[number];

export type Screen = {
  key: string;
  moduleId: string;
  moduleType: Module['type'] | 'global';
  moduleNumber: number; // 0 for globals
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

const TASK_EXAMPLE_STEPS_PER_SCENARIO: ScreenKind[] = [
  'task_example_scenario_read',
  'task_example_scenario_ponder',
  'task_example_scenario_revise',
];

function snippet(s: string, max = 80): string {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length > max ? t.slice(0, max - 1) + '…' : t;
}

export function labelFor(kind: ScreenKind): string {
  switch (kind) {
    case 'pre_system':
      return 'Pre-system';
    case 'login':
      return 'Login / Register';
    case 'questionnaire':
      return 'Questionnaire';
    case 'warmup_example_intro':
      return 'Example · Think-aloud intro';
    case 'warmup_example_body':
      return 'Example · Warmup body';
    case 'warmup_example_revealed':
      return 'Example · Reveal';
    case 'warmup_intro':
      return 'Think-aloud intro';
    case 'warmup_body':
      return 'Warmup body';
    case 'warmup_revealed':
      return 'Reveal';
    case 'task_example_initial_spec':
      return 'Example · Initial spec';
    case 'task_example_scenario_read':
      return 'Example · Scenario read';
    case 'task_example_scenario_ponder':
      return 'Example · Scenario ponder';
    case 'task_example_scenario_revise':
      return 'Example · Scenario revise';
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
    case 'retrospective_question':
      return 'Retrospective';
  }
}

const GLOBAL_SUMMARIES: Record<GlobalKind, string> = {
  pre_system: 'Before the participant has joined or logged in — consent, setup, expectations.',
  login: 'Participant is on the / register/login screen.',
  questionnaire: 'Participant is filling out the /onboard questionnaire.',
};

export function enumerateScreens(content: ProjectContent): Screen[] {
  const out: Screen[] = [];

  GLOBAL_KINDS.forEach((kind) => {
    out.push({
      key: `_global:${kind}`,
      moduleId: '_global',
      moduleType: 'global',
      moduleNumber: 0,
      moduleLabel: 'Pre-study',
      kind,
      label: `Pre-study · ${labelFor(kind)}`,
      summary: GLOBAL_SUMMARIES[kind],
    });
  });

  content.modules.forEach((m, mi) => {
    const moduleNumber = mi + 1;
    if (m.type === 'think_aloud_warmup') {
      const moduleLabel = m.title || 'Think-aloud warmup';
      // Optional example variant first.
      if (m.example) {
        const ex = m.example;
        out.push({
          key: `${m.id}:warmup_example_intro`,
          moduleId: m.id,
          moduleType: m.type,
          moduleNumber,
          moduleLabel,
          kind: 'warmup_example_intro',
          label: `Module ${moduleNumber} · Example · Think-aloud intro`,
          summary: 'Example demo — researcher walks through this',
        });
        out.push({
          key: `${m.id}:warmup_example_body`,
          moduleId: m.id,
          moduleType: m.type,
          moduleNumber,
          moduleLabel,
          kind: 'warmup_example_body',
          label: `Module ${moduleNumber} · Example · Warmup body`,
          summary: snippet(ex.altBody || ex.altTaskDescription || ''),
        });
        out.push({
          key: `${m.id}:warmup_example_revealed`,
          moduleId: m.id,
          moduleType: m.type,
          moduleNumber,
          moduleLabel,
          kind: 'warmup_example_revealed',
          label: `Module ${moduleNumber} · Example · Reveal: ${snippet(ex.altRevealedTask || '', 24)}`,
          summary: ex.altRevealedTask || '(no revealed task)',
        });
      }
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
      // Optional example variant on task_warmup only.
      if (m.type === 'task_warmup' && m.example) {
        const ex = m.example;
        out.push({
          key: `${m.id}:task_example_initial_spec`,
          moduleId: m.id,
          moduleType: m.type,
          moduleNumber,
          moduleLabel,
          kind: 'task_example_initial_spec',
          label: `Module ${moduleNumber} · Example · Initial spec`,
          summary: snippet(ex.prefilled.initial || ex.initialSpec[0]?.prompt || ''),
        });
        ex.scenarios.forEach((sc, idx) => {
          TASK_EXAMPLE_STEPS_PER_SCENARIO.forEach((kind) => {
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
      }
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
      // One screen per question — previously a single retrospective screen.
      m.questions.forEach((q, idx) => {
        out.push({
          key: `${m.id}:retrospective:${idx}`,
          moduleId: m.id,
          moduleType: m.type,
          moduleNumber,
          moduleLabel,
          kind: 'retrospective_question',
          idx,
          label: `Module ${moduleNumber} · Retro Q${idx + 1}: ${snippet(q.text, 32)}`,
          summary: q.text,
        });
      });
    }
  });
  return out;
}
