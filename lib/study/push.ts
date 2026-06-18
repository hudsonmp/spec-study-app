// Researcher→participant realtime push contract (participant side). PURE — no
// React/Supabase/DOM — so the name→action mapping is unit-testable in isolation
// even though the socket round-trip itself is not. Design:
// docs/superpowers/specs/2026-06-18-live-timer-and-push-design.md.
//
// CROSS-REPO CONTRACT. The researcher `/live` sender (thematic-analysis, task
// T2) broadcasts on the channel `live:participant:<pid>` using EXACTLY these two
// event names. Changing a string here breaks the other repo silently — the
// broadcast just stops being recognized.

// The Supabase Realtime broadcast channel a participant joins. Keyed on the
// 3-digit `pid` both apps share (NOT the user UUID). Public broadcast (see the
// design's authz gate): `config.private` is left false on both ends.
export function participantChannel(pid: string): string {
  return `live:participant:${pid}`;
}

// The two broadcast event names (the wire contract). The researcher sends one
// of these; the payload is empty (for `show_time` the number is computed locally
// on the participant from its own timer state, never carried on the wire).
export const PUSH_SHOW_TIME = 'show_time' as const;
export const PUSH_OFFER_HELP = 'offer_help' as const;

// The participant-side action a recognized push maps to. `show_time` opens a
// popup of the participant's OWN cumulative remaining; `offer_help` opens a
// popup whose button opens the LLM assistant.
export type PushAction = 'show_time' | 'offer_help';

// Map a broadcast event name → a participant action, or null if unrecognized
// (defensive: an unknown/garbled event must be a no-op, never a crash). This is
// the one piece behind the socket worth testing; the listener below dispatches
// on its result.
export function pushActionFor(eventName: string): PushAction | null {
  switch (eventName) {
    case PUSH_SHOW_TIME:
      return 'show_time';
    case PUSH_OFFER_HELP:
      return 'offer_help';
    default:
      return null;
  }
}
