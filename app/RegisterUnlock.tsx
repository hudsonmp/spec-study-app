'use client';

import { useActionState } from 'react';
import {
  unlockRegistrationAction,
  type UnlockState,
} from '@/app/register/unlock-actions';

const initial: UnlockState = {};

// Landing-page password gate for creating a real account. A correct password
// sets the unlock cookie (server action) and forwards to /register; a wrong one
// keeps the visitor here. Demo visitors ignore this entirely and use "Try the
// demo". The server action is the real boundary — this form is just its UI.
export default function RegisterUnlock() {
  const [state, formAction, isPending] = useActionState(
    unlockRegistrationAction,
    initial,
  );

  return (
    <form
      action={formAction}
      className="border border-[var(--rule)] p-4 flex flex-col gap-2"
    >
      <span className="text-sm font-medium tracking-tight">
        Create an account
      </span>
      <span className="text-xs text-[var(--muted)]">
        For enrolled participants. Enter the study password to continue.
      </span>
      <input
        type="password"
        name="password"
        required
        autoComplete="off"
        placeholder="Study password"
        aria-label="Study password"
        className="mt-1 w-full border border-[var(--rule)] px-3 py-2 bg-[var(--panel)] focus:outline-none focus:border-[var(--accent)]"
      />
      {state.error && (
        <p className="text-sm text-[var(--danger)]">{state.error}</p>
      )}
      <button
        type="submit"
        disabled={isPending}
        className="mt-1 w-full border border-[var(--foreground)] py-2 hover:bg-[var(--foreground)] hover:text-[var(--background)] transition disabled:opacity-50"
      >
        {isPending ? 'Checking…' : 'Continue to registration'}
      </button>
    </form>
  );
}
