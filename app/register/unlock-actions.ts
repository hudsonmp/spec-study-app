'use server';

import { redirect } from 'next/navigation';
import {
  getRegisterUnlockSession,
  verifyRegistrationPassword,
} from '@/lib/auth/register-gate';

export type UnlockState = { error?: string };

// Landing-page gate: verify the shared registration password, set the
// short-lived unlock cookie, and forward to the real /register form. On a wrong
// password nothing is set and the visitor stays on the landing page. Demo
// visitors never need this — they use /demo.
export async function unlockRegistrationAction(
  _prev: UnlockState,
  formData: FormData,
): Promise<UnlockState> {
  const password = (formData.get('password') ?? '').toString();
  if (!verifyRegistrationPassword(password)) {
    return { error: 'Incorrect password.' };
  }
  const session = await getRegisterUnlockSession();
  session.ok = true;
  session.at = Date.now();
  await session.save();
  redirect('/register');
}
