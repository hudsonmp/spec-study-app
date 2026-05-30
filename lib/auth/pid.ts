import 'server-only';
import { createServiceRoleClient } from '@/lib/supabase/service';

const MAX_ATTEMPTS = 50;

export async function generatePid(): Promise<string> {
  const supabase = createServiceRoleClient();
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    const pid = String(Math.floor(Math.random() * 1000)).padStart(3, '0');
    const { data, error } = await supabase
      .from('users')
      .select('pid')
      .eq('pid', pid)
      .maybeSingle();
    if (error) throw error;
    if (!data) return pid;
  }
  throw new Error(
    `Could not generate a unique 3-digit PID after ${MAX_ATTEMPTS} attempts — consider expanding to 4 digits`,
  );
}
