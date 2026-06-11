import Link from 'next/link';
import { createServiceRoleClient } from '@/lib/supabase/service';
import { migrateContent } from '@/lib/study/reducer';
import { getHelpSeekingSystemPrompt } from '@/lib/llm/prompt-store';
import { HELP_SEEKING_SYSTEM_PROMPT } from '@/lib/llm/system-prompt';
import CreateNav from '../CreateNav';
import PilotConsole from './PilotConsole';

export const dynamic = 'force-dynamic';

// LLM pilot console: the first REAL-task (rideshare) scenario screen on the
// left — requirements, scenario, and an editable workspace the model "sees" —
// and the model's actual inputs (system prompt + context block) on the right.
// Nothing here persists to Supabase except an explicit system-prompt save.
export default async function PilotPage(props: {
  searchParams: Promise<{ p?: string }>;
}) {
  const { p } = await props.searchParams;
  const supabase = createServiceRoleClient();
  const { data: studies } = await supabase
    .from('studies')
    .select('id, name, visibility, authored_data, updated_at')
    .order('updated_at', { ascending: false });

  const rows = studies ?? [];
  const active =
    rows.find((s) => s.id === p) ??
    rows.find((s) => s.visibility === 'shown') ??
    rows[0] ??
    null;

  const content = active ? migrateContent(active.authored_data) : null;
  // The pilot pins the first REAL task module (the rideshare task in the live
  // study) — the same module the live assistant is gated to.
  const task = content?.modules.find((m) => m.type === 'task') ?? null;

  if (!active || !task || task.type !== 'task') {
    return (
      <main className="flex-1 px-6 py-10 max-w-5xl mx-auto w-full">
        <CreateNav current="pilot" />
        <p className="text-sm italic text-[var(--muted)]">
          No real task module to pilot against — add a module of type
          &ldquo;task&rdquo; in the{' '}
          <Link href="/create/formative" className="underline">
            editor
          </Link>{' '}
          first.
        </p>
      </main>
    );
  }

  const systemPrompt = await getHelpSeekingSystemPrompt();

  return (
    <main className="flex-1 flex flex-col px-6 py-6 w-full min-h-0">
      <CreateNav current="pilot" />
      <PilotConsole
        moduleId={task.id}
        moduleType={task.type}
        moduleTitle={task.title}
        studyContext={task.studyContext}
        requirements={task.requirements}
        scenario={task.scenarios[0] ?? null}
        initialSystemPrompt={systemPrompt}
        irbReference={HELP_SEEKING_SYSTEM_PROMPT}
      />
    </main>
  );
}
