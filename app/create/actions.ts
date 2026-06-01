'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { createServiceRoleClient } from '@/lib/supabase/service';
import { getResearcherSession } from '@/lib/auth/researcher';
import type { Database, Json } from '@/lib/types/db';

type FieldType = Database['public']['Enums']['onboarding_field_type'];

async function assertResearcher() {
  const session = await getResearcherSession();
  if (!session.ok) throw new Error('Researcher access required');
}

function makeKey(): string {
  return 'q_' + Math.random().toString(36).slice(2, 8);
}

const optionSchema = z.object({
  value: z.string().min(1).max(120),
  label: z.string().min(1).max(200),
  terminator: z.boolean().optional(),
});

function parseOptionsJson(raw: string): Json {
  if (!raw) return [];
  let arr: unknown;
  try {
    arr = JSON.parse(raw);
  } catch {
    throw new Error('Options were not valid JSON.');
  }
  if (!Array.isArray(arr)) throw new Error('Options must be a JSON array.');
  const validated = arr.map((o) => {
    const parsed = optionSchema.safeParse(o);
    if (!parsed.success) throw new Error('Each option needs value + label.');
    return parsed.data;
  });
  return validated;
}

export async function addFieldAction(): Promise<void> {
  await assertResearcher();
  const supabase = createServiceRoleClient();
  const { data: max } = await supabase
    .from('onboarding_fields')
    .select('position')
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextPos = (max?.position ?? -1) + 1;
  const { error } = await supabase.from('onboarding_fields').insert({
    field_key: makeKey(),
    label: 'New question',
    type: 'short_text',
    position: nextPos,
  });
  if (error) throw error;
  revalidatePath('/create/questionnaire');
}

const updateSchema = z.object({
  id: z.string().uuid(),
  field_key: z.string().min(1).max(80),
  label: z.string().trim().min(1).max(200),
  type: z.enum(['short_text', 'long_text', 'select', 'multi_select', 'number']),
  options: z.string().max(8000).optional().default(''),
});

export async function updateFieldAction(formData: FormData): Promise<void> {
  await assertResearcher();
  const parsed = updateSchema.safeParse({
    id: formData.get('id'),
    field_key: formData.get('field_key'),
    label: formData.get('label'),
    type: formData.get('type'),
    options: formData.get('options') ?? '',
  });
  if (!parsed.success) throw new Error(parsed.error.message);

  const supabase = createServiceRoleClient();
  const t: FieldType = parsed.data.type;
  const options: Json | null =
    t === 'select' || t === 'multi_select'
      ? parseOptionsJson(parsed.data.options ?? '')
      : null;

  const { error } = await supabase
    .from('onboarding_fields')
    .update({
      field_key: parsed.data.field_key,
      label: parsed.data.label,
      type: t,
      options,
      updated_at: new Date().toISOString(),
    })
    .eq('id', parsed.data.id);
  if (error) throw error;
  revalidatePath('/create/questionnaire');
}

export async function duplicateFieldAction(formData: FormData): Promise<void> {
  await assertResearcher();
  const id = (formData.get('id') ?? '').toString();
  if (!id) return;
  const supabase = createServiceRoleClient();

  const { data: src, error: getErr } = await supabase
    .from('onboarding_fields')
    .select('field_key, label, type, options')
    .eq('id', id)
    .single();
  if (getErr) throw getErr;

  const { data: max } = await supabase
    .from('onboarding_fields')
    .select('position')
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextPos = (max?.position ?? -1) + 1;

  const { error: insErr } = await supabase.from('onboarding_fields').insert({
    field_key: makeKey(),
    label: src.label + ' (copy)',
    type: src.type,
    options: src.options,
    position: nextPos,
  });
  if (insErr) throw insErr;
  revalidatePath('/create/questionnaire');
}

export async function deleteFieldAction(formData: FormData): Promise<void> {
  await assertResearcher();
  const id = (formData.get('id') ?? '').toString();
  if (!id) return;
  const supabase = createServiceRoleClient();
  const { error } = await supabase
    .from('onboarding_fields')
    .delete()
    .eq('id', id);
  if (error) throw error;
  revalidatePath('/create/questionnaire');
}

export async function moveFieldAction(formData: FormData): Promise<void> {
  await assertResearcher();
  const id = (formData.get('id') ?? '').toString();
  const dir = Number(formData.get('dir')) === -1 ? -1 : 1;
  if (!id) return;
  const supabase = createServiceRoleClient();
  const { data: rows, error: listErr } = await supabase
    .from('onboarding_fields')
    .select('id, position')
    .order('position', { ascending: true });
  if (listErr) throw listErr;
  const list = rows ?? [];
  const idx = list.findIndex((r) => r.id === id);
  if (idx < 0) return;
  const swapIdx = idx + dir;
  if (swapIdx < 0 || swapIdx >= list.length) return;

  // Swap positions
  const a = list[idx];
  const b = list[swapIdx];
  // Use a temp value to avoid the unique-ish ordering collision on a transient state.
  // Postgres allows duplicate positions but we keep the swap atomic via two updates.
  const tmp = -1 * (Date.now() % 1000000);
  const { error: e1 } = await supabase
    .from('onboarding_fields')
    .update({ position: tmp })
    .eq('id', a.id);
  if (e1) throw e1;
  const { error: e2 } = await supabase
    .from('onboarding_fields')
    .update({ position: a.position })
    .eq('id', b.id);
  if (e2) throw e2;
  const { error: e3 } = await supabase
    .from('onboarding_fields')
    .update({ position: b.position })
    .eq('id', a.id);
  if (e3) throw e3;

  revalidatePath('/create/questionnaire');
}

export async function researcherLogoutAction(): Promise<void> {
  const session = await getResearcherSession();
  session.destroy();
  redirect('/');
}
