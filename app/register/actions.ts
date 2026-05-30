'use server';

import { z } from 'zod';
import { redirect } from 'next/navigation';
import { createServiceRoleClient } from '@/lib/supabase/service';
import { generatePid } from '@/lib/auth/pid';
import { getParticipantSession } from '@/lib/auth/session';

const schema = z.object({
  first_name: z.string().trim().min(1, 'First name is required').max(60),
  email: z.string().trim().email('Enter a valid email address').max(120),
});

export type RegisterState = { error?: string };

export async function registerAction(
  _prev: RegisterState,
  formData: FormData,
): Promise<RegisterState> {
  const parsed = schema.safeParse({
    first_name: formData.get('first_name'),
    email: formData.get('email'),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid input.' };
  }

  const supabase = createServiceRoleClient();

  const { data: existing, error: lookupErr } = await supabase
    .from('users')
    .select('id')
    .eq('email', parsed.data.email)
    .maybeSingle();
  if (lookupErr) return { error: 'Lookup failed: ' + lookupErr.message };
  if (existing) {
    return {
      error:
        'A participant with this email is already registered. Use Log in with your PID instead.',
    };
  }

  let pid: string;
  try {
    pid = await generatePid();
  } catch {
    return {
      error:
        'Could not allocate a Participant ID. Please contact the researcher.',
    };
  }

  const { error: insErr } = await supabase.from('users').insert({
    first_name: parsed.data.first_name,
    email: parsed.data.email,
    pid,
  });
  if (insErr) return { error: 'Could not register: ' + insErr.message };

  const session = await getParticipantSession();
  session.pid = pid;
  await session.save();

  redirect('/onboard');
}
