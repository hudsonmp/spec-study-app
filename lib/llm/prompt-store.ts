import 'server-only';
import { createServiceRoleClient } from '@/lib/supabase/service';
import { HELP_SEEKING_SYSTEM_PROMPT } from './system-prompt';

// DB-backed system prompt for the help-seeking assistant. The live /study
// route reads this row on every call; /create/pilot edits it. The hardcoded
// HELP_SEEKING_SYSTEM_PROMPT remains the IRB-approved reference: it seeds the
// row on first read and is the fallback if the DB is unreachable.

export const HELP_SEEKING_PROMPT_KEY = 'help_seeking';

export async function getHelpSeekingSystemPrompt(): Promise<string> {
  const supabase = createServiceRoleClient();
  try {
    const { data, error } = await supabase
      .from('llm_prompts')
      .select('content')
      .eq('key', HELP_SEEKING_PROMPT_KEY)
      .maybeSingle();
    if (error) throw error;
    if (data?.content) return data.content;
    // Self-seed: first read inserts the IRB-approved text byte-for-byte, so
    // no SQL-escaped copy of the prompt ever has to exist.
    await supabase.from('llm_prompts').upsert({
      key: HELP_SEEKING_PROMPT_KEY,
      content: HELP_SEEKING_SYSTEM_PROMPT,
      updated_at: new Date().toISOString(),
    });
    return HELP_SEEKING_SYSTEM_PROMPT;
  } catch {
    return HELP_SEEKING_SYSTEM_PROMPT;
  }
}

export async function saveHelpSeekingSystemPrompt(
  content: string,
): Promise<void> {
  const supabase = createServiceRoleClient();
  const { error } = await supabase.from('llm_prompts').upsert({
    key: HELP_SEEKING_PROMPT_KEY,
    content,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}
