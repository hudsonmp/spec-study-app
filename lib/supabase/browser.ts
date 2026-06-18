'use client';

// The FIRST browser-side Supabase client in this app. Used ONLY for Supabase
// Realtime (researcher→participant broadcast on `live:participant:<pid>`) — no
// DB reads/writes go through it (the read-only-from-the-client invariant is
// preserved; persistence still goes via the server actions in app/study/
// actions.ts). It runs in the browser with the PUBLIC anon key, which is
// already inlined into the client bundle (NEXT_PUBLIC_*), so nothing secret is
// exposed here that wasn't already.
//
// Singleton: one client per tab. createBrowserClient/createClient open a
// realtime websocket lazily on the first .channel().subscribe(); making more
// than one client would open redundant sockets. Design:
// docs/superpowers/specs/2026-06-18-live-timer-and-push-design.md.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/types/db';

let client: SupabaseClient<Database> | null = null;

export function getBrowserClient(): SupabaseClient<Database> {
  if (client) return client;
  client = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      // The anon participant client has no auth session; it only joins a PUBLIC
      // broadcast channel. Don't persist or refresh a (nonexistent) session.
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
  return client;
}
