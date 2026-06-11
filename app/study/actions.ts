'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { createServiceRoleClient } from '@/lib/supabase/service';
import { getCurrentUser } from '@/lib/auth/current-user';
import { getParticipantSession } from '@/lib/auth/session';
import type { Json } from '@/lib/types/db';

// Find the active "shown" project. Returns null if none.
async function getShownProjectId(): Promise<string | null> {
  const supabase = createServiceRoleClient();
  const { data } = await supabase
    .from('studies')
    .select('id')
    .eq('visibility', 'shown')
    .maybeSingle();
  return data?.id ?? null;
}

const eventSchema = z.object({
  moduleId: z.string().min(1),
  eventType: z.string().min(1).max(60),
  payload: z.unknown(),
  skipPersist: z.boolean().optional(), // for task_warmup, don't write to DB
});

export async function recordEventAction(input: {
  moduleId: string;
  eventType: string;
  payload: unknown;
  skipPersist?: boolean;
}): Promise<{ ok: boolean }> {
  const parsed = eventSchema.safeParse(input);
  if (!parsed.success) return { ok: false };
  if (parsed.data.skipPersist) return { ok: true };

  const user = await getCurrentUser();
  if (!user) return { ok: false };

  const studyId = await getShownProjectId();
  if (!studyId) return { ok: false };

  const supabase = createServiceRoleClient();
  const { error } = await supabase.from('study_events').insert({
    user_id: user.id,
    study_id: studyId,
    module_id: parsed.data.moduleId,
    event_type: parsed.data.eventType,
    payload: parsed.data.payload as Json,
  });
  if (error) {
    // eslint-disable-next-line no-console
    console.error('[study] recordEvent failed:', error.message);
    return { ok: false };
  }
  return { ok: true };
}

const responseSchema = z.object({
  moduleId: z.string().min(1),
  sectionKey: z.string().min(1).max(100),
  value: z.string().max(50_000),
  skipPersist: z.boolean().optional(),
});

export async function upsertResponseAction(input: {
  moduleId: string;
  sectionKey: string;
  value: string;
  skipPersist?: boolean;
}): Promise<{ ok: boolean }> {
  const parsed = responseSchema.safeParse(input);
  if (!parsed.success) return { ok: false };
  if (parsed.data.skipPersist) return { ok: true };

  const user = await getCurrentUser();
  if (!user) return { ok: false };

  const studyId = await getShownProjectId();
  if (!studyId) return { ok: false };

  const fullKey = `${parsed.data.moduleId}:${parsed.data.sectionKey}`;

  const supabase = createServiceRoleClient();
  const { error } = await supabase
    .from('study_responses')
    .upsert(
      {
        user_id: user.id,
        study_id: studyId,
        section_key: fullKey,
        value: parsed.data.value,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,study_id,section_key' },
    );
  if (error) {
    // eslint-disable-next-line no-console
    console.error('[study] upsertResponse failed:', error.message);
    return { ok: false };
  }
  return { ok: true };
}

// Per-(participant, module, scenario, phase) snapshot of the spec + entity
// table. Unlike the rolling `:current` response row (which a later scenario
// overwrites) and the `spec_snapshot` event (buried in payload JSON), this
// writes a queryable row — one per scenario boundary — so post-hoc process
// coding can read the spec's evolution across scenarios directly. Append-only.
const snapshotSchema = z.object({
  moduleId: z.string().min(1),
  scenarioIdx: z.number().int().nullable(),
  phase: z.enum(['initial', 'after_scenario', 'final']),
  spec: z.string().max(50_000),
  entities: z.string().max(200_000), // JSON-encoded Entity[]
  clientTs: z.string().max(40).optional(),
  skipPersist: z.boolean().optional(),
});

export async function recordSnapshotAction(input: {
  moduleId: string;
  scenarioIdx: number | null;
  phase: 'initial' | 'after_scenario' | 'final';
  spec: string;
  entities: string;
  clientTs?: string;
  skipPersist?: boolean;
}): Promise<{ ok: boolean }> {
  const parsed = snapshotSchema.safeParse(input);
  if (!parsed.success) return { ok: false };
  if (parsed.data.skipPersist) return { ok: true };

  const user = await getCurrentUser();
  if (!user) return { ok: false };
  const studyId = await getShownProjectId();
  if (!studyId) return { ok: false };

  let entitiesJson: Json = [];
  try {
    entitiesJson = JSON.parse(parsed.data.entities) as Json;
  } catch {
    entitiesJson = [];
  }

  const supabase = createServiceRoleClient();
  const { error } = await supabase.from('study_snapshots').insert({
    user_id: user.id,
    study_id: studyId,
    module_id: parsed.data.moduleId,
    scenario_idx: parsed.data.scenarioIdx,
    phase: parsed.data.phase,
    spec: parsed.data.spec,
    entities: entitiesJson,
    client_ts: parsed.data.clientTs ?? null,
  });
  if (error) {
    // eslint-disable-next-line no-console
    console.error('[study] recordSnapshot failed:', error.message);
    return { ok: false };
  }
  return { ok: true };
}

// One row of the LLM help-seeking assistant transcript, linked to the
// participant's CURRENT state (spec + entities + scenario) at send time. Called
// once per user turn and once per assistant reply by the /api/llm-assistant
// route handler (server→server). Mirrors recordSnapshotAction. Append-only.
const assistantMessageSchema = z.object({
  moduleId: z.string().min(1),
  scenarioIdx: z.number().int().nullable(),
  role: z.enum(['user', 'assistant']),
  content: z.string().max(100_000),
  stateSpec: z.string().max(50_000),
  stateEntities: z.string().max(200_000), // JSON-encoded Entity[]
});

export async function recordAssistantMessageAction(input: {
  moduleId: string;
  scenarioIdx: number | null;
  role: 'user' | 'assistant';
  content: string;
  stateSpec: string;
  stateEntities: string;
}): Promise<{ ok: boolean }> {
  const parsed = assistantMessageSchema.safeParse(input);
  if (!parsed.success) return { ok: false };

  const user = await getCurrentUser();
  if (!user) return { ok: false };
  const studyId = await getShownProjectId();
  if (!studyId) return { ok: false };

  let entitiesJson: Json = [];
  try {
    entitiesJson = JSON.parse(parsed.data.stateEntities) as Json;
  } catch {
    entitiesJson = [];
  }

  const supabase = createServiceRoleClient();
  const { error } = await supabase.from('study_assistant_messages').insert({
    user_id: user.id,
    study_id: studyId,
    module_id: parsed.data.moduleId,
    scenario_idx: parsed.data.scenarioIdx,
    role: parsed.data.role,
    content: parsed.data.content,
    state_spec: parsed.data.stateSpec,
    state_entities: entitiesJson,
  });
  if (error) {
    // eslint-disable-next-line no-console
    console.error('[study] recordAssistantMessage failed:', error.message);
    return { ok: false };
  }
  return { ok: true };
}

// Sign-out: destroy the participant session and redirect home.
export async function participantLogoutAction(): Promise<void> {
  const session = await getParticipantSession();
  session.destroy();
  redirect('/');
}

// Final "study complete" event. Idempotent — multiple calls just record
// additional events; researcher reads the last one for completion time.
export async function finishStudyAction(): Promise<{ ok: boolean }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false };
  const studyId = await getShownProjectId();
  if (!studyId) return { ok: false };
  const supabase = createServiceRoleClient();
  const { error } = await supabase.from('study_events').insert({
    user_id: user.id,
    study_id: studyId,
    module_id: '_study',
    event_type: 'study_complete',
    payload: {} as Json,
  });
  if (error) return { ok: false };
  return { ok: true };
}
