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

// The broadcast event names (the wire contract). The researcher sends one of
// these. `show_time` / `offer_help` carry an EMPTY payload (for `show_time` the
// number is computed locally on the participant from its own timer state, never
// carried on the wire). `retro_question` is the FIRST payload-carrying push: it
// carries the researcher's custom retrospective question (see below).
export const PUSH_SHOW_TIME = 'show_time' as const;
export const PUSH_OFFER_HELP = 'offer_help' as const;
export const PUSH_RETRO_QUESTION = 'retro_question' as const;

// The participant-side action a recognized push maps to. `show_time` opens a
// popup of the participant's OWN cumulative remaining; `offer_help` opens a
// popup whose button opens the LLM assistant; `retro_question` queues a custom
// retrospective question for a scenario (consumed at that scenario's retro step,
// NOT a popup).
export type PushAction = 'show_time' | 'offer_help' | 'retro_question';

// Map a broadcast event name → a participant action, or null if unrecognized
// (defensive: an unknown/garbled event must be a no-op, never a crash). This is
// the one piece behind the socket worth testing; the listener below dispatches
// on its result. NOTE: the action alone is not enough for `retro_question` — the
// listener must additionally parse the payload with `parseRetroQuestionPayload`.
export function pushActionFor(eventName: string): PushAction | null {
  switch (eventName) {
    case PUSH_SHOW_TIME:
      return 'show_time';
    case PUSH_OFFER_HELP:
      return 'offer_help';
    case PUSH_RETRO_QUESTION:
      return 'retro_question';
    default:
      return null;
  }
}

// The `retro_question` wire payload. CROSS-REPO CONTRACT: the `/live` sender
// broadcasts `{ text, scenarioIdx }` on the `retro_question` event.
//   - `text`        the question shown to the participant (NON-EMPTY).
//   - `scenarioIdx` the 0-based scenario the question is queued for, or `null`
//                   to target the participant's CURRENT scenario at receipt.
export type RetroQuestionPayload = {
  text: string;
  scenarioIdx: number | null;
};

// Parse + validate a `retro_question` broadcast payload. PURE and defensive: a
// malformed payload (missing/empty `text`, non-number/non-null `scenarioIdx`,
// not an object, etc.) returns null — NEVER throws — so a garbled push is a
// no-op on the participant. The listener appends the result to the per-scenario
// queue; a null result is dropped.
export function parseRetroQuestionPayload(
  payload: unknown,
): RetroQuestionPayload | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const p = payload as Record<string, unknown>;

  // `text` must be a non-empty (post-trim) string.
  if (typeof p.text !== 'string') return null;
  const text = p.text.trim();
  if (text.length === 0) return null;

  // `scenarioIdx` must be a FINITE number or null. `undefined` (key absent) is
  // treated as null. NaN/Infinity are rejected as malformed (they can't key a
  // scenario). A finite-but-out-of-range index is accepted here and simply
  // never matches a real scenario downstream (the consumer ignores it).
  const raw = p.scenarioIdx;
  let scenarioIdx: number | null;
  if (raw === null || raw === undefined) {
    scenarioIdx = null;
  } else if (typeof raw === 'number' && Number.isFinite(raw)) {
    scenarioIdx = raw;
  } else {
    return null;
  }

  return { text, scenarioIdx };
}
