'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { registerAction, type RegisterState } from './actions';

const initial: RegisterState = {};

export default function RegisterPage() {
  const [state, formAction, isPending] = useActionState(
    registerAction,
    initial,
  );

  return (
    <main className="flex-1 flex items-center justify-center px-6 py-16">
      <div className="max-w-md w-full">
        <header className="border-b border-[var(--rule)] pb-4 mb-8">
          <h1 className="text-2xl font-medium tracking-tight">Register</h1>
          <p className="text-sm text-[var(--muted)] mt-1">
            We&rsquo;ll assign you a three-digit Participant ID. Save it — you&rsquo;ll
            use it to log in later.
          </p>
        </header>

        <form action={formAction} className="space-y-5">
          <label className="block">
            <span className="text-xs uppercase tracking-wider text-[var(--muted)]">
              First name
            </span>
            <input
              type="text"
              name="first_name"
              required
              autoComplete="given-name"
              className="mt-1 w-full border border-[var(--rule)] px-3 py-2 bg-[var(--panel)] focus:outline-none focus:border-[var(--accent)]"
            />
          </label>
          <label className="block">
            <span className="text-xs uppercase tracking-wider text-[var(--muted)]">
              Email
            </span>
            <input
              type="email"
              name="email"
              required
              autoComplete="email"
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
            {isPending ? 'Registering…' : 'Register'}
          </button>
        </form>

        <p className="text-xs text-[var(--muted)] italic pt-8">
          Already registered?{' '}
          <Link href="/login" className="underline hover:no-underline">
            Log in
          </Link>
          .{' '}
          <Link href="/" className="underline hover:no-underline ml-2">
            Back
          </Link>
        </p>
      </div>
    </main>
  );
}
