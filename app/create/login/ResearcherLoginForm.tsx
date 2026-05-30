'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { researcherLoginAction, type CreateLoginState } from './actions';

const initial: CreateLoginState = {};

export default function ResearcherLoginForm({ next }: { next: string }) {
  const [state, formAction, isPending] = useActionState(
    researcherLoginAction,
    initial,
  );

  return (
    <main className="flex-1 flex items-center justify-center px-6 py-16">
      <div className="max-w-md w-full">
        <header className="border-b border-[var(--rule)] pb-4 mb-8">
          <h1 className="text-2xl font-medium tracking-tight">
            Researcher access
          </h1>
          <p className="text-sm text-[var(--muted)] mt-1">
            Restricted to study authors.
          </p>
        </header>

        <form action={formAction} className="space-y-5">
          <input type="hidden" name="next" value={next} />
          <label className="block">
            <span className="text-xs uppercase tracking-wider text-[var(--muted)]">
              Password
            </span>
            <input
              type="password"
              name="password"
              required
              autoComplete="current-password"
              className="mt-1 w-full border border-[var(--rule)] px-3 py-2 bg-[var(--panel)] focus:outline-none focus:border-[var(--accent)]"
            />
          </label>

          {state.error && (
            <p className="text-sm text-[var(--danger)]">{state.error}</p>
          )}

          <button
            type="submit"
            disabled={isPending}
            className="w-full border border-[var(--foreground)] py-2.5 hover:bg-[var(--foreground)] hover:text-[var(--background)] transition disabled:opacity-50"
          >
            {isPending ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="text-xs text-[var(--muted)] italic pt-8">
          <Link href="/" className="underline hover:no-underline">
            Back to participant home
          </Link>
        </p>
      </div>
    </main>
  );
}
