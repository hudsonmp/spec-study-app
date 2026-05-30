import 'server-only';
import { getIronSession, type SessionOptions } from 'iron-session';
import { cookies } from 'next/headers';

export type ParticipantSession = {
  pid?: string;
};

export const PARTICIPANT_COOKIE = 'specstudy_session';

export const participantSessionOptions: SessionOptions = {
  cookieName: PARTICIPANT_COOKIE,
  password: process.env.COOKIE_SECRET!,
  cookieOptions: {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
  },
};

export async function getParticipantSession() {
  const cookieStore = await cookies();
  return getIronSession<ParticipantSession>(
    cookieStore,
    participantSessionOptions,
  );
}
