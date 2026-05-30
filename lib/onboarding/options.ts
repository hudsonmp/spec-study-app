// Shared option utilities used by both client (editor, participant form) and
// server (onboarding submit action). Kept in /lib so it has no "use client"
// directive — safe to import from server-only modules.

import type { Json } from '@/lib/types/db';

export const OTHER_VALUE = '__other__';
export const OTHER_LABEL_DEFAULT = 'Other (please specify)';

export type Option = {
  value: string;
  label: string;
  terminator?: boolean;
};

export function parseOptions(raw: Json | null): Option[] {
  if (!Array.isArray(raw)) return [];
  const out: Option[] = [];
  for (const o of raw) {
    if (
      o !== null &&
      typeof o === 'object' &&
      !Array.isArray(o) &&
      typeof (o as Record<string, unknown>).value === 'string' &&
      typeof (o as Record<string, unknown>).label === 'string'
    ) {
      const rec = o as Record<string, unknown>;
      out.push({
        value: rec.value as string,
        label: rec.label as string,
        terminator: rec.terminator === true ? true : undefined,
      });
    }
  }
  return out;
}
