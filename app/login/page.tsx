'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { loginAction, type LoginState } from './actions';

const initial: LoginState = {};

export default function LoginPage() {
  const [state, formAction, isPending] = useActionState(loginAction, initial);

  return (
    <main className="flex-1 flex items-center justify-center px-6 py-16">
      <div className="max-w-md w-full">
        <header className="border-b border-[var(--rule)] pb-4 mb-8">
          <h1 className="text-2xl font-medium tracking-tight">Log in</h1>
          <p className="text-sm text-[var(--muted)] mt-1">
            Enter the three-digit Participant ID you received at registration,
            along with the email you registered with.
          </p>
        </header>

        <form action={formAction} className="space-y-5">
          <label className="block">
            <span className="text-xs uppercase tracking-wider text-[var(--muted)]">
              Participant ID (3 digits)
            </span>
            <input
              type="text"
              name="pid"
              inputMode="numeric"
              pattern="[0-9]{3}"
              maxLength={3}
              required
              autoComplete="off"
              className="mt-1 w-full border border-[var(--rule)] px-3 py-2 bg-[var(--panel)] focus:outline-none focus:border-[var(--accent)] font-mono tracking-widest"
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
            {isPending ? 'Signing in…' : 'Log in'}
          </button>
        </form>

        <p className="text-xs text-[var(--muted)] italic pt-8">
          Don&rsquo;t have a PID yet?{' '}
          <Link href="/register" className="underline hover:no-underline">
            Register
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
