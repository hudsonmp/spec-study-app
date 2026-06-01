import Link from 'next/link';
import { createServiceRoleClient } from '@/lib/supabase/service';
import FieldsEditor from '../FieldsEditor';
import { addFieldAction, researcherLogoutAction } from '../actions';

export const dynamic = 'force-dynamic';

export default async function QuestionnairePage() {
  const supabase = createServiceRoleClient();
  const { data: fields } = await supabase
    .from('onboarding_fields')
    .select('id, field_key, label, type, options, position')
    .order('position', { ascending: true });

  return (
    <main className="flex-1 px-6 py-10 max-w-3xl mx-auto w-full">
      <header className="border-b border-[var(--rule)] pb-4 mb-8 flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-medium tracking-tight">Questionnaire</h1>
          <p className="text-sm text-[var(--muted)] mt-1">
            Each field becomes a question on <code>/onboard</code>.
          </p>
        </div>
        <nav className="flex gap-4 text-sm">
          <Link href="/create" className="underline hover:no-underline">
            ← Hub
          </Link>
          <form action={researcherLogoutAction}>
            <button
              type="submit"
              className="text-[var(--muted)] hover:text-[var(--foreground)] underline hover:no-underline"
            >
              Log out
            </button>
          </form>
        </nav>
      </header>

      <FieldsEditor fields={fields ?? []} />

      <form action={addFieldAction} className="mt-6">
        <button
          type="submit"
          className="border border-dashed border-[var(--rule)] text-[var(--muted)] italic px-4 py-2 hover:text-[var(--foreground)] hover:border-[var(--foreground)] transition"
        >
          + add question
        </button>
      </form>
    </main>
  );
}
