// Per-scenario retrospective list resolution + FREEZE semantics. PURE — no
// React/Supabase/DOM — so the "what questions does this scenario's retro show"
// decision is unit-testable in isolation, and (critically) so the FREEZE-at-
// entry rule can be proven without rendering the component.
//
// WHY THIS EXISTS (participant-data-integrity, CRITICAL):
// A scenario's retrospective can be sourced two ways:
//   1. the AUTHORED `perScenarioRetrospective` set (static, from the project), or
//   2. researcher-broadcast `retro_question`s queued LIVE during the scenario
//      (these OVERRIDE the authored set for that scenario).
// The queue (`retroQueue`) is mutable: a researcher can broadcast at any moment.
// If the effective list were re-derived LIVE on every render, a broadcast that
// lands while a participant is mid-retro for scenario N would SHRINK/replace
// N's in-progress list under them — stranding the participant (an out-of-range
// `qIdx` used to fire `onComplete()` as a render side effect, skipping the whole
// task) or contaminating data (an authored answer keyed `N:qIdx` colliding with
// a now-queued question at the same key).
//
// THE RULE: a scenario's effective retro list is FROZEN at the instant the
// participant ENTERS that scenario's retrospective. A `retro_question` arriving
// DURING N's retro does NOT mutate N's active list; it only affects scenarios
// whose retro has not yet been entered. This matches intended usage (researchers
// queue during the scenario/spec screens, BEFORE the retro).

// A single retrospective question, normalized to a uniform shape across the two
// sources (authored `RetrospectiveItem` carries more fields; a queued question
// is a bare string). The render and step machine only ever need `text`.
export type RetroItem = { text: string };

// Minimal shape of an authored retrospective question this module reads. Kept
// structural (not importing `RetrospectiveItem`) so the helper has no coupling
// beyond the one field it uses.
export type AuthoredRetro = { text: string };

// Resolve the EFFECTIVE retro list for a scenario AT A POINT IN TIME: queued
// (researcher) questions if the scenario has a non-empty queue, else the
// authored set. PURE. This is the value that gets SNAPSHOTTED at retro entry —
// callers must capture its result once (via `freezeRetroList`) and then never
// call it again for an in-progress scenario.
export function resolveEffectiveRetro(
  retroQueue: Record<number, string[]> | undefined,
  authored: AuthoredRetro[],
  scenarioIdx: number,
): RetroItem[] {
  const queued = retroQueue?.[scenarioIdx];
  if (queued && queued.length > 0) return queued.map((text) => ({ text }));
  return authored.map((q) => ({ text: q.text }));
}

// Snapshot the effective list for a scenario at the instant its retro is
// entered. Semantically identical to `resolveEffectiveRetro`, but named for
// intent: the RETURNED ARRAY is the immutable list to carry on the step state
// for the entire duration of that scenario's retrospective. A later mutation of
// `retroQueue` cannot affect an already-returned snapshot (it's a fresh array
// of fresh objects), which is exactly the freeze guarantee.
export function freezeRetroList(
  retroQueue: Record<number, string[]> | undefined,
  authored: AuthoredRetro[],
  scenarioIdx: number,
): RetroItem[] {
  return resolveEffectiveRetro(retroQueue, authored, scenarioIdx);
}

// Read the active list for an in-progress `scenario_retro` step. Prefers the
// FROZEN snapshot carried on the step (`step.list`); falls back to a live
// resolve only when no snapshot is present (the controlled/preview path, where
// there is no live queue and the authored set is stable). The live participant
// path ALWAYS carries a frozen list, so it never re-reads `retroQueue`.
export function retroListForStep(
  step: { list?: RetroItem[]; idx: number },
  retroQueue: Record<number, string[]> | undefined,
  authored: AuthoredRetro[],
): RetroItem[] {
  if (step.list) return step.list;
  return resolveEffectiveRetro(retroQueue, authored, step.idx);
}

// Is `qIdx` a valid index into the (frozen) list? Used by the render's dead
// guard: if this is false the renderer must NOT call `onComplete()` as a side
// effect — it must advance via the normal scenario-completion path instead.
export function isRetroQuestionInRange(
  list: RetroItem[],
  qIdx: number,
): boolean {
  return qIdx >= 0 && qIdx < list.length;
}
