'use server';

import { z } from 'zod';
import { createServiceRoleClient } from '@/lib/supabase/service';
import { getResearcherSession } from '@/lib/auth/researcher';

async function assertResearcher() {
  const session = await getResearcherSession();
  if (!session.ok) throw new Error('Researcher access required');
}

const upsertSchema = z.object({
  studyId: z.string().uuid(),
  screenKey: z.string().min(1).max(200),
  scriptText: z.string().max(20_000),
});

export async function upsertScriptAction(input: {
  studyId: string;
  screenKey: string;
  scriptText: string;
}): Promise<{ ok: boolean; error?: string }> {
  await assertResearcher();
  const parsed = upsertSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Invalid input' };
  const supabase = createServiceRoleClient();
  const { error } = await supabase
    .from('study_scripts')
    .upsert(
      {
        study_id: parsed.data.studyId,
        screen_key: parsed.data.screenKey,
        script_text: parsed.data.scriptText,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'study_id,screen_key' },
    );
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function listScriptsForStudy(
  studyId: string,
): Promise<Record<string, string>> {
  const supabase = createServiceRoleClient();
  const { data } = await supabase
    .from('study_scripts')
    .select('screen_key, script_text')
    .eq('study_id', studyId);
  const out: Record<string, string> = {};
  for (const r of data ?? []) out[r.screen_key] = r.script_text;
  return out;
}
