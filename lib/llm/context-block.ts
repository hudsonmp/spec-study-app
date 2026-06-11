// The per-turn context block the assistant model sees alongside the system
// prompt. Pure and isomorphic ON PURPOSE: the /api/llm-assistant route builds
// it server-side for live participant turns, and /create/pilot renders the
// SAME function client-side so the researcher sees exactly what the model
// would receive. Keep it dependency-free.

export type ContextBlockInput = {
  studyContext: string;
  requirements: { role?: string; want?: string; so?: string }[];
  scenarioTitle: string;
  scenarioClauses: { type?: string; text?: string }[];
  entities: { name: string; elements: { name: string }[] }[];
  spec: string;
};

export function buildContextBlock(b: ContextBlockInput): string {
  const reqs = b.requirements.length
    ? b.requirements
        .map(
          (r, i) =>
            `  ${i + 1}. As a ${r.role}, I want ${r.want}${
              r.so ? `, so that ${r.so}` : ''
            }.`,
        )
        .join('\n')
    : '  (none provided)';

  const scenarioClauses = b.scenarioClauses.length
    ? b.scenarioClauses.map((c) => `  ${c.type} ${c.text}`.trim()).join('\n')
    : '  (no scenario revealed yet)';

  const entities = b.entities.length
    ? b.entities
        .map((e) => {
          const els = e.elements
            .map((el) => el.name)
            .filter(Boolean)
            .join(', ');
          return `  - ${e.name || '(unnamed)'}${els ? `: ${els}` : ''}`;
        })
        .join('\n')
    : '  (none recorded)';

  return [
    'CONTEXT (read-only; for your reference — the participant cannot see this block):',
    '',
    b.studyContext ? `System under specification:\n${b.studyContext}\n` : '',
    'Requirements:',
    reqs,
    '',
    `Current scenario${b.scenarioTitle ? ` — ${b.scenarioTitle}` : ''}:`,
    scenarioClauses,
    '',
    "Participant's entities & elements so far:",
    entities,
    '',
    "Participant's CURRENT specification text:",
    b.spec.trim() ? b.spec : '  (empty)',
  ]
    .filter((s) => s !== '')
    .join('\n');
}
