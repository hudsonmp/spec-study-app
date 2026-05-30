'use server';

import { z } from 'zod';
import { redirect } from 'next/navigation';
import { createServiceRoleClient } from '@/lib/supabase/service';
import { getParticipantSession } from '@/lib/auth/session';

const schema = z.object({
  pid: z.string().trim().regex(/^\d{3}$/, 'PID must be 3 digits'),
  email: z.string().trim().email('Enter a valid email address'),
});

export type LoginState = { error?: string };

export async function loginAction(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const parsed = schema.safeParse({
    pid: formData.get('pid'),
    email: formData.get('email'),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid input.' };
  }

  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from('users')
    .select('id, pid, email, has_onboarded')
    .eq('pid', parsed.data.pid)
    .eq('email', parsed.data.email)
    .maybeSingle();
  if (error) return { error: 'Lookup failed: ' + error.message };
  if (!data) return { error: 'PID and email do not match an account.' };

  const session = await getParticipantSession();
  session.pid = data.pid;
  await session.save();

  redirect(data.has_onboarded ? '/study' : '/onboard');
}
