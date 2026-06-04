import { createServiceRoleClient } from '@/lib/supabase/service';
import FieldsEditor from '../FieldsEditor';
import { addFieldAction } from '../actions';
import CreateNav from '../CreateNav';

export const dynamic = 'force-dynamic';

export default async function QuestionnairePage() {
  const supabase = createServiceRoleClient();
  const { data: fields } = await supabase
    .from('onboarding_fields')
    .select('id, field_key, label, type, options, position, required')
    .order('position', { ascending: true });

  return (
    <main className="flex-1 px-6 py-10 max-w-3xl mx-auto w-full">
      <CreateNav current="questionnaire" />
      <header className="pb-4 mb-6">
        <h1 className="text-2xl font-medium tracking-tight">Questionnaire</h1>
        <p className="text-sm text-[var(--muted)] mt-1">
          Each field becomes a question on <code>/onboard</code>.
        </p>
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
