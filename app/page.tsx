import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/current-user';

export default async function Home() {
  const user = await getCurrentUser();
  if (user) {
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
