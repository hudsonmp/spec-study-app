'use server';

import { redirect } from 'next/navigation';
import {
  getResearcherSession,
  verifyResearcherPassword,
} from '@/lib/auth/researcher';

export type CreateLoginState = { error?: string };

export async function researcherLoginAction(
  _prev: CreateLoginState,
  formData: FormData,
): Promise<CreateLoginState> {
  const password = (formData.get('password') ?? '').toString();
  const nextRaw = (formData.get('next') ?? '').toString();
  const next = nextRaw.startsWith('/create') ? nextRaw : '/create';

  if (!verifyResearcherPassword(password)) {
    return { error: 'Incorrect password.' };
  }

  const session = await getResearcherSession();
  session.ok = true;
  session.at = Date.now();
  await session.save();

  redirect(next);
}
