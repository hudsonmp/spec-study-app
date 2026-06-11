import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { getHelpSeekingSystemPrompt } from '@/lib/llm/prompt-store';
import { buildContextBlock } from '@/lib/llm/context-block';
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
  // Pilot-only overrides (/create/pilot). Honored ONLY on researcher-
  // authorized preview requests; a participant request carrying them is
  // rejected outright.
  systemPromptOverride: z.string().max(50_000).optional(),
  contextOverride: z.string().max(100_000).optional(),
});


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

  // Prompt/context overrides exist for the researcher pilot only. A
  // participant request carrying them is malformed by construction.
  if (
    !isPreview &&
    (body.systemPromptOverride !== undefined ||
      body.contextOverride !== undefined)
  ) {
    return NextResponse.json(
      { ok: false, error: 'overrides_require_researcher_preview' },
      { status: 403 },
    );
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
  // Pilot mode may replace the auto-built context block verbatim; otherwise
  // build it from the participant's current state as usual.
  const contextBlock =
    isPreview && body.contextOverride !== undefined
      ? body.contextOverride
      : buildContextBlock(body);
  const messages: Anthropic.MessageParam[] = [
    ...priorTurns,
    {
      role: 'user',
      content: `${contextBlock}\n\n----\nParticipant message:\n${lastTurn.content}`,
    },
  ];

  const client = new Anthropic({ apiKey });

  // Live turns use the DB-backed prompt (seeded from the IRB-approved
  // constant); pilot turns may substitute an unsaved draft.
  const systemPrompt =
    isPreview && body.systemPromptOverride !== undefined
      ? body.systemPromptOverride
      : await getHelpSeekingSystemPrompt();

  let assistantText = '';
  try {
    const resp = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      // Medium reasoning for sonnet-4-6.
      output_config: { effort: 'medium' },
      thinking: { type: 'adaptive' },
      // Long system prompt — cache it so repeat turns are cheap.
      system: [
        {
          type: 'text',
          text: systemPrompt,
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
