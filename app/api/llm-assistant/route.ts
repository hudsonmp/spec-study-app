import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { HELP_SEEKING_SYSTEM_PROMPT } from '@/lib/llm/system-prompt';
import { isAssistantEnabled } from '@/lib/llm/gating';
import { getCurrentUser } from '@/lib/auth/current-user';
import { getResearcherSession } from '@/lib/auth/researcher';
import { recordAssistantMessageAction } from '@/app/study/actions';

// Route Handlers are uncached by default (Next 16). This one is request-time:
// it reads the participant session, calls Anthropic, and writes to the DB.
// Keep it on the Node runtime so the Anthropic SDK + service-role client work.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MODEL = 'claude-sonnet-4-6';

// The model the participant chats with. We keep the transcript short (the
// study turns are brief) and let the server own the system prompt.
const turnSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().max(20_000),
});

const entitySchema = z.object({
  id: z.string(),
  name: z.string(),
  elements: z.array(z.object({ id: z.string(), name: z.string() })).default([]),
});

const requirementSchema = z.object({
  id: z.string().optional(),
  role: z.string().optional().default(''),
  want: z.string().optional().default(''),
  so: z.string().optional().default(''),
});

const clauseSchema = z.object({
  type: z.string().optional().default(''),
  text: z.string().optional().default(''),
});

const bodySchema = z.object({
  // Researcher preview: authorized via the researcher session (not a
  // participant), and NOTHING is written to study_assistant_messages.
  preview: z.boolean().optional().default(false),
  moduleId: z.string().min(1),
  moduleType: z.string().min(1),
  moduleTitle: z.string().optional().default(''),
  scenarioIdx: z.number().int().nullable().default(null),
  // The conversation so far (UI-owned). Last entry must be the new user turn.
  messages: z.array(turnSchema).min(1).max(60),
  // The participant's CURRENT state, assembled into the context the model sees.
  spec: z.string().max(50_000).default(''),
  entities: z.array(entitySchema).max(200).default([]),
  requirements: z.array(requirementSchema).max(100).default([]),
  scenarioTitle: z.string().max(2_000).optional().default(''),
  scenarioClauses: z.array(clauseSchema).max(100).default([]),
  studyContext: z.string().max(20_000).optional().default(''),
});

// Render the per-turn context block the model sees alongside the (cached)
// system prompt. Per the spec: scenario + requirement(s) + entities/elements +
// the scenario text + the participant's CURRENT specification text.
function buildContextBlock(b: z.infer<typeof bodySchema>): string {
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

export async function POST(request: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { ok: false, error: 'assistant_unconfigured' },
      { status: 500 },
    );
  }

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await request.json());
  } catch {
    return NextResponse.json(
      { ok: false, error: 'bad_request' },
      { status: 400 },
    );
  }

  // Authn: either an authenticated participant (live /study) or, when the
  // preview flag is set, an authenticated researcher (editor preview). A
  // preview request never reads or writes participant state — even if a
  // participant cookie also exists in the same browser.
  let isPreview = false;
  if (body.preview) {
    const researcher = await getResearcherSession();
    if (!researcher.ok) {
      return NextResponse.json(
        { ok: false, error: 'unauthorized' },
        { status: 401 },
      );
    }
    isPreview = true;
  } else {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { ok: false, error: 'unauthorized' },
        { status: 401 },
      );
    }
  }

  // Authz: the assistant is gated to specific modules (vending warmup + real
  // task; NOT parking). Enforce server-side too, not just in the UI.
  if (!isAssistantEnabled({ moduleType: body.moduleType, moduleTitle: body.moduleTitle })) {
    return NextResponse.json(
      { ok: false, error: 'assistant_not_available_here' },
      { status: 403 },
    );
  }

  const lastTurn = body.messages[body.messages.length - 1];
  if (lastTurn.role !== 'user') {
    return NextResponse.json(
      { ok: false, error: 'last_turn_must_be_user' },
      { status: 400 },
    );
  }

  const entitiesJson = JSON.stringify(body.entities);

  // Persist the participant's turn FIRST (linked to their state at send time),
  // so the transcript is complete even if the model call fails. Preview turns
  // are never persisted.
  if (!isPreview) {
    await recordAssistantMessageAction({
      moduleId: body.moduleId,
      scenarioIdx: body.scenarioIdx,
      role: 'user',
      content: lastTurn.content,
      stateSpec: body.spec,
      stateEntities: entitiesJson,
    });
  }

  // Assemble the messages: prior turns verbatim, then the final user turn with
  // the current-state context prepended (so the model always sees fresh state).
  const priorTurns = body.messages.slice(0, -1).map((m) => ({
    role: m.role,
    content: m.content,
  }));
  const contextBlock = buildContextBlock(body);
  const messages: Anthropic.MessageParam[] = [
    ...priorTurns,
    {
      role: 'user',
      content: `${contextBlock}\n\n----\nParticipant message:\n${lastTurn.content}`,
    },
  ];

  const client = new Anthropic({ apiKey });

  let assistantText = '';
  try {
    const resp = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      // Medium reasoning for sonnet-4-6.
      output_config: { effort: 'medium' },
      thinking: { type: 'adaptive' },
      // Long IRB-approved system prompt — cache it so repeat turns are cheap.
      system: [
        {
          type: 'text',
          text: HELP_SEEKING_SYSTEM_PROMPT,
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages,
    });
    assistantText = resp.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[llm-assistant] Anthropic call failed:', (err as Error)?.message);
    return NextResponse.json(
      { ok: false, error: 'assistant_error' },
      { status: 502 },
    );
  }

  if (!assistantText) {
    assistantText =
      "I'm sorry — I couldn't produce a reply just now. Try asking a targeted question about the task.";
  }

  // Persist the assistant reply, linked to the same state (never in preview).
  if (!isPreview) {
    await recordAssistantMessageAction({
      moduleId: body.moduleId,
      scenarioIdx: body.scenarioIdx,
      role: 'assistant',
      content: assistantText,
      stateSpec: body.spec,
      stateEntities: entitiesJson,
    });
  }

  return NextResponse.json({ ok: true, reply: assistantText });
}
