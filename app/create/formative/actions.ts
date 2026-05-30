'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createServiceRoleClient } from '@/lib/supabase/service';
import { getResearcherSession } from '@/lib/auth/researcher';
import { emptyContent } from '@/lib/types/study';
import { migrateContent } from '@/lib/study/reducer';
import type {
  LoadedProject,
  ProjectContent,
  ProjectVisibility,
} from '@/lib/types/study';
import type { Json } from '@/lib/types/db';

async function assertResearcher() {
  const session = await getResearcherSession();
  if (!session.ok) throw new Error('Researcher access required');
}

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 60) || 'project'
  );
}

export async function listProjects(): Promise<LoadedProject[]> {
  await assertResearcher();
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from('studies')
    .select('id, slug, name, visibility, authored_data, updated_at')
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id,
    slug: row.slug,
    name: row.name,
    visibility: row.visibility,
    content: migrateContent(row.authored_data),
    updated_at: row.updated_at,
  }));
}

export async function createProjectAction(formData: FormData): Promise<void> {
  await assertResearcher();
  const name = ((formData.get('name') ?? '').toString() || 'Untitled project').trim();
  const supabase = createServiceRoleClient();
  let slug = slugify(name);
  // Avoid slug collision by adding short suffix on conflict
  const { data: existing } = await supabase
    .from('studies')
    .select('id')
    .eq('slug', slug)
    .maybeSingle();
  if (existing) slug = slug + '-' + Math.random().toString(36).slice(2, 6);

  const blank: ProjectContent = emptyContent();
  const { error } = await supabase.from('studies').insert({
    name,
    slug,
    visibility: 'hidden',
    authored_data: blank as unknown as Json,
  });
  if (error) throw error;
  revalidatePath('/create/formative');
}

export async function deleteProjectAction(formData: FormData): Promise<void> {
  await assertResearcher();
  const id = (formData.get('id') ?? '').toString();
  if (!id) return;
  const supabase = createServiceRoleClient();
  const { error } = await supabase.from('studies').delete().eq('id', id);
  if (error) throw error;
  revalidatePath('/create/formative');
}

const visibilitySchema = z.enum(['shown', 'hidden', 'archived']);

export async function setVisibilityAction(formData: FormData): Promise<void> {
  await assertResearcher();
  const id = (formData.get('id') ?? '').toString();
  const target = visibilitySchema.parse(formData.get('visibility'));
  if (!id) return;
  const supabase = createServiceRoleClient();

  // If toggling to 'shown', clear any other 'shown' project first (partial
  // unique index would otherwise reject the update).
  if (target === 'shown') {
    await supabase
      .from('studies')
      .update({ visibility: 'hidden' as ProjectVisibility })
      .neq('id', id)
      .eq('visibility', 'shown');
  }
  const { error } = await supabase
    .from('studies')
    .update({ visibility: target })
    .eq('id', id);
  if (error) throw error;
  revalidatePath('/create/formative');
}

const saveSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(120),
  content: z.unknown(),
});

export async function saveProjectAction(payload: {
  id: string;
  name: string;
  content: ProjectContent;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  await assertResearcher();
  const parsed = saveSchema.safeParse(payload);
  if (!parsed.success) return { ok: false, error: parsed.error.message };

  const supabase = createServiceRoleClient();
  const { error } = await supabase
    .from('studies')
    .update({
      name: parsed.data.name,
      slug: slugify(parsed.data.name),
      authored_data: parsed.data.content as unknown as Json,
      updated_at: new Date().toISOString(),
    })
    .eq('id', parsed.data.id);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/create/formative');
  revalidatePath('/create/formative/preview');
  return { ok: true };
}
