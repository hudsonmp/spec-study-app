import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/current-user';
import { getResearcherSession } from '@/lib/auth/researcher';
import RegisterUnlock from '@/app/RegisterUnlock';

export default async function Home() {
  const [user, researcher] = await Promise.all([
    getCurrentUser(),
    getResearcherSession(),
  ]);
  const isResearcher = researcher.ok === true;
  const isParticipant = user !== null;

  // Researcher session present → always show the picker so the researcher
  // can hop into /create or pilot the participant flow without getting
  // bounced back to /create. The participant card adapts: continue when
  // a participant cookie is also set, register/login otherwise.
  if (isResearcher) {
    return (
      <main className="flex-1 flex items-center justify-center px-6 py-16">
        <div className="max-w-xl w-full">
          <header className="border-b border-[var(--rule)] pb-4 mb-8">
            <h1 className="text-2xl font-medium tracking-tight">
              Which side?
            </h1>
            <p className="text-sm text-[var(--muted)] mt-1">
              You&rsquo;re signed in as researcher. Open the console or
              walk through the study as a participant.
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
            {isParticipant ? (
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
            ) : (
              <div className="border border-[var(--foreground)] p-5 flex flex-col gap-2">
                <span className="text-lg font-medium tracking-tight">
                  Participant
                </span>
                <span className="text-sm opacity-80">
                  Pilot the study as a participant.
                </span>
                <div className="grid grid-cols-2 gap-2 pt-2">
                  <Link
                    href="/register"
                    className="text-center border border-[var(--foreground)] py-2 text-sm hover:bg-[var(--foreground)] hover:text-[var(--background)] transition"
                  >
                    Register
                  </Link>
                  <Link
                    href="/login"
                    className="text-center border border-[var(--foreground)] py-2 text-sm hover:bg-[var(--foreground)] hover:text-[var(--background)] transition"
                  >
                    Log in
                  </Link>
                </div>
              </div>
            )}
          </div>

        </div>
      </main>
    );
  }

  // Participant-only — auto-route to their next screen.
  if (isParticipant) {
    redirect(user.has_onboarded ? '/study' : '/onboard');
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
            This platform supports a research study on specification design. Try
            the interactive demo to walk through the task with no account — or,
            if you&rsquo;re an enrolled participant, create an account or sign in.
          </p>

          {/* Primary CTA: the public demo. No sign-up, warmups skipped, and
              nothing is saved. */}
          <Link
            href="/demo"
            className="block text-center border border-[var(--foreground)] bg-[var(--foreground)] text-[var(--background)] py-3 hover:opacity-90 transition font-medium"
          >
            Try the interactive demo
          </Link>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
            {/* Real account creation is password-gated (server-enforced) so
                demo traffic can't register into the live study. */}
            <RegisterUnlock />
            <Link
              href="/login"
              className="border border-[var(--rule)] p-4 flex flex-col gap-2 hover:border-[var(--foreground)] transition"
            >
              <span className="text-sm font-medium tracking-tight">Log in</span>
              <span className="text-xs text-[var(--muted)]">
                Returning participants sign in with their three-digit PID and
                email.
              </span>
              <span className="mt-1 w-full text-center border border-[var(--foreground)] py-2">
                Sign in
              </span>
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
