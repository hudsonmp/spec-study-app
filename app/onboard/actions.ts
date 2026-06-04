'use server';

import { redirect } from 'next/navigation';
import { createServiceRoleClient } from '@/lib/supabase/service';
import { getCurrentUser } from '@/lib/auth/current-user';
import { getParticipantSession } from '@/lib/auth/session';
import { parseOptions } from '@/lib/onboarding/options';
import type { Database, Json } from '@/lib/types/db';

type FieldType = Database['public']['Enums']['onboarding_field_type'];

export type OnboardState = { error?: string };

function coerceValue(type: FieldType, raw: FormDataEntryValue[]): Json {
  switch (type) {
    case 'short_text':
    case 'long_text':
    case 'select':
      return raw[0]?.toString() ?? '';
    case 'multi_select':
      return raw.map((v) => v.toString());
    case 'number': {
      const s = raw[0]?.toString() ?? '';
      const n = Number(s);
      return Number.isFinite(n) ? n : null;
    }
  }
}

export async function submitOnboardingAction(
  _prev: OnboardState,
  formData: FormData,
): Promise<OnboardState> {
  const user = await getCurrentUser();
  if (!user) return { error: 'Not signed in.' };

  const supabase = createServiceRoleClient();
  const { data: fields, error: fieldsErr } = await supabase
    .from('onboarding_fields')
    .select('id, field_key, type, options, required')
    .order('position', { ascending: true });
  if (fieldsErr) return { error: 'Could not load fields.' };

  // Completeness guard: reject submissions missing a value for any REQUIRED
  // field. Optional fields (required=false) may be left blank. Runs BEFORE the
  // terminator loop so empty submissions can't bypass screening.
  const missing: string[] = [];
  for (const f of fields ?? []) {
    if (!f.required) continue;
    const vals = formData
      .getAll(`f_${f.id}`)
      .map((v) => v.toString().trim())
      .filter(Boolean);
    if (vals.length === 0) missing.push(f.field_key);
  }
  if (missing.length > 0) {
    return { error: `Please answer every required question. Missing: ${missing.join(', ')}.` };
  }

  // Terminator check: if any submitted value matches a terminator option,
  // delete the user (cascade deletes any responses), destroy the session,
  // and redirect to /terminate. Performed BEFORE writing responses so the
  // ineligible participant leaves no trace.
  // Note: only predefined option values can terminate. "Other" free-text
  // entries do not, because the submitted value is the typed text, not the
  // sentinel.
  let shouldTerminate = false;
  for (const f of fields ?? []) {
    if (f.type !== 'select' && f.type !== 'multi_select') continue;
    const opts = parseOptions(f.options);
    const submitted = formData
      .getAll(`f_${f.id}`)
      .map((v) => v.toString());
    for (const opt of opts) {
      if (opt.terminator && submitted.includes(opt.value)) {
        shouldTerminate = true;
        break;
      }
    }
    if (shouldTerminate) break;
  }

  if (shouldTerminate) {
    // Cascade: onboarding_responses, study_responses (if any) drop via FK.
    await supabase.from('users').delete().eq('id', user.id);
    const session = await getParticipantSession();
    session.destroy();
    redirect('/terminate');
  }

  const rows = (fields ?? []).map((f) => ({
    user_id: user.id,
    field_id: f.id,
    value: coerceValue(f.type, formData.getAll(`f_${f.id}`)),
  }));

  if (rows.length > 0) {
    const { error: upErr } = await supabase
      .from('onboarding_responses')
      .upsert(rows, { onConflict: 'user_id,field_id' });
    if (upErr) return { error: 'Could not save responses: ' + upErr.message };
  }

  const { error: markErr } = await supabase
    .from('users')
    .update({ has_onboarded: true })
    .eq('id', user.id);
  if (markErr) return { error: 'Could not finalize onboarding.' };

  redirect('/onboard');
}
