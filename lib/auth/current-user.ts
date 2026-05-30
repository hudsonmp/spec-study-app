import 'server-only';
import { getParticipantSession } from './session';
import { createServiceRoleClient } from '@/lib/supabase/service';
import type { Database } from '@/lib/types/db';

export type CurrentUser = Database['public']['Tables']['users']['Row'];

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const session = await getParticipantSession();
  if (!session.pid) return null;
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('pid', session.pid)
    .maybeSingle();
  if (error) throw error;
  return data;
}
