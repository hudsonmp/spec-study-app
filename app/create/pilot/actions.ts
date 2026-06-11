'use server';

import { z } from 'zod';
import { getResearcherSession } from '@/lib/auth/researcher';
import {
  getHelpSeekingSystemPrompt,
  saveHelpSeekingSystemPrompt,
} from '@/lib/llm/prompt-store';
import { HELP_SEEKING_SYSTEM_PROMPT } from '@/lib/llm/system-prompt';

async function assertResearcher() {
  const session = await getResearcherSession();
  if (!session.ok) throw new Error('Researcher access required');
}

export async function loadSystemPromptAction(): Promise<{
  content: string;
  irbReference: string;
}> {
  await assertResearcher();
  return {
    content: await getHelpSeekingSystemPrompt(),
    irbReference: HELP_SEEKING_SYSTEM_PROMPT,
  };
}

const saveSchema = z.object({ content: z.string().min(1).max(50_000) });

// The ONLY thing the pilot console persists. This row is what live /study
// participants get on their next assistant turn.
export async function saveSystemPromptAction(input: {
  content: string;
}): Promise<{ ok: boolean }> {
  await assertResearcher();
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) return { ok: false };
  try {
    await saveHelpSeekingSystemPrompt(parsed.data.content);
    return { ok: true };
  } catch (err) {
     
    console.error('[pilot] save prompt failed:', (err as Error)?.message);
    return { ok: false };
  }
}
