import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/current-user';
import { getResearcherSession } from '@/lib/auth/researcher';

export default async function Home() {
  const [user, researcher] = await Promise.all([
    getCurrentUser(),
    getResearcherSession(),
  ]);
  const isResearcher = researcher.ok === true;
  const isParticipant = user !== null;

  // Both roles authenticated — show role picker so the researcher can choose
  // whether they're running the study or piloting it as a participant.
  if (isParticipant && isResearcher) {
    return (
      <main className="flex-1 flex items-center justify-center px-6 py-16">
        <div className="max-w-xl w-full">
          <header className="border-b border-[var(--rule)] pb-4 mb-8">
            <h1 className="text-2xl font-medium tracking-tight">
              Which side?
            </h1>
            <p className="text-sm text-[var(--muted)] mt-1">
              You&rsquo;re signed in to both the participant and the
              researcher session. Pick one.
            </p>
          </header>

          <div className="grid grid-cols-2 gap-3">
            <Link
              href="/create"
              className="border border-[var(--foreground)] p-5 hover:bg-[var(--foreground)] hover:text-[var(--background)] transition flex flex-col gap-2"
            >
              <span className="text-lg font-medium tracking-tight">
                Researcher
              </span>
              <span className="text-sm opacity-80">
                Console: questionnaire, protocol, script, walkthrough.
              </span>
            </Link>
            <Link
              href={user.has_onboarded ? '/study' : '/onboard'}
              className="border border-[var(--foreground)] p-5 hover:bg-[var(--foreground)] hover:text-[var(--background)] transition flex flex-col gap-2"
            >
              <span className="text-lg font-medium tracking-tight">
                Participant
              </span>
              <span className="text-sm opacity-80">
                Continue as {user.first_name} (PID {user.pid}).
              </span>
            </Link>
          </div>

          <section className="mt-10 border border-dashed border-[var(--rule)] bg-[var(--rule-soft)] p-4">
            <p className="text-xs uppercase tracking-[0.14em] text-[var(--muted)] mb-2">
              Researcher answer key · Think-aloud anagram
            </p>
            <p className="font-mono text-2xl tracking-[0.4em]">
              NPEPHA &nbsp;→&nbsp; HAPPEN
            </p>
          </section>
        </div>
      </main>
    );
  }

  // Existing single-role behavior.
  if (isParticipant) {
    redirect(user.has_onboarded ? '/study' : '/onboard');
  }
  if (isResearcher) {
    redirect('/create');
  }

  return (
    <main className="flex-1 flex items-center justify-center px-6 py-16">
      <div className="max-w-xl w-full">
        <header className="border-b border-[var(--rule)] pb-4 mb-8">
          <h1 className="text-2xl font-medium tracking-tight">
            Specification Design Study
          </h1>
          <p className="text-sm text-[var(--muted)] mt-1">
            Formative think-aloud protocol · Participant platform
          </p>
        </header>

        <section className="space-y-6">
          <p className="text-[15px] leading-relaxed">
            This platform supports a research study on specification design.
            New participants register with their name and email and receive a
            three-digit Participant ID; returning participants sign in with
            their PID and email.
          </p>

          <div className="grid grid-cols-2 gap-3 pt-2">
            <Link
              href="/register"
              className="block text-center border border-[var(--foreground)] py-3 hover:bg-[var(--foreground)] hover:text-[var(--background)] transition"
            >
              Register
            </Link>
            <Link
              href="/login"
              className="block text-center border border-[var(--foreground)] py-3 hover:bg-[var(--foreground)] hover:text-[var(--background)] transition"
            >
              Log in
            </Link>
          </div>

          <p className="text-xs text-[var(--muted)] italic pt-6">
            Researchers: enter through{' '}
            <Link href="/create/login" className="underline hover:no-underline">
              /create/login
            </Link>
            .
          </p>
        </section>
      </div>
    </main>
  );
}
