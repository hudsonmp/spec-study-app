import 'server-only';
import { getIronSession, type SessionOptions } from 'iron-session';
import { cookies } from 'next/headers';
import { timingSafeEqual } from 'node:crypto';

// The shared secret that gates NEW participant registration. Public demo
// visitors walk the study at /demo WITHOUT it; only creating a real account —
// which writes a row to the live IRB `users` table — requires it. This is the
// server-side boundary: it is checked in registerAction, so navigating straight
// to /register cannot bypass it. Overridable via env; defaults to the value
// Hudson chose so no Vercel env change is needed to ship.
export function registrationPassword(): string {
  return process.env.REGISTER_PASSWORD ?? 'VirginiaTech';
}

/** Constant-time comparison of a submitted password against the gate secret. */
export function verifyRegistrationPassword(submitted: string): boolean {
  const expected = registrationPassword();
  if (!expected || !submitted) return false;
  const a = Buffer.from(submitted);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

// Short-lived, httpOnly flag proving the visitor cleared the password gate on
// the landing page. registerAction requires it (or an authenticated researcher
// session), so the landing page is the only way to unlock registration.
export type RegisterUnlockSession = { ok?: boolean; at?: number };

export const REGISTER_UNLOCK_COOKIE = 'specstudy_register_unlock';

export const registerUnlockOptions: SessionOptions = {
  cookieName: REGISTER_UNLOCK_COOKIE,
  password: process.env.COOKIE_SECRET!,
  cookieOptions: {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 30, // 30 min — enough to fill the short (name + email) form
  },
};

export async function getRegisterUnlockSession() {
  const cookieStore = await cookies();
  return getIronSession<RegisterUnlockSession>(
    cookieStore,
    registerUnlockOptions,
  );
}
