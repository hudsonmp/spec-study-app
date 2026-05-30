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
