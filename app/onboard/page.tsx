import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/current-user';
import { createServiceRoleClient } from '@/lib/supabase/service';
import { participantLogoutAction } from '@/app/study/actions';
import OnboardForm from './OnboardForm';

export default async function OnboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/');

  const supabase = createServiceRoleClient();
  const { data: fields } = await supabase
    .from('onboarding_fields')
    .select('id, field_key, label, type, options, position')
    .order('position', { ascending: true });

  if (user.has_onboarded) {
    redirect('/study');
  }

  return (
    <main className="flex-1 flex items-center justify-center px-6 py-16">
      <div className="max-w-xl w-full">
        <header className="border-b border-[var(--rule)] pb-4 mb-8 flex justify-between items-baseline gap-4">
          <div>
            <h1 className="text-2xl font-medium tracking-tight">
              Welcome, {user.first_name}
            </h1>
            <p className="text-sm text-[var(--muted)] mt-1">
              Your Participant ID is{' '}
              <span className="font-mono text-[var(--foreground)]">
                {user.pid}
              </span>
              . Save it — you&rsquo;ll use it to log in next time.
            </p>
          </div>
          <form action={participantLogoutAction}>
            <button
              type="submit"
              className="text-xs text-[var(--muted)] hover:text-[var(--foreground)] underline hover:no-underline"
            >
              Sign out
            </button>
          </form>
        </header>

        <section className="mb-6">
          <h2 className="text-xs font-medium tracking-[0.14em] uppercase text-[var(--muted)] mb-2">
            Onboarding
          </h2>
          <p className="text-[14px] text-[var(--muted)] leading-relaxed">
            A few questions before the study begins.
          </p>
        </section>

        <OnboardForm fields={fields ?? []} />
      </div>
    </main>
  );
}
