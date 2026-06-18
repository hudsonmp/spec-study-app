// Participant task timer — HARD PER-PHASE BUCKETS, NO CARRYOVER (pure; no
// React/DOM, so it can be unit-reasoned and persisted independently of the
// component). Design: docs/superpowers/specs/2026-06-18-live-timer-and-push-
// design.md. The SAME model + the SAME shared fixtures (`__fixtures__/timer-
// cases.ts`) are mirrored in thematic-analysis's `/live` view — this is a
// cross-repo contract; both repos must agree number-for-number.
//
// ---------------------------------------------------------------------------
// MODEL
//
// Phases, in order, for a `task` module:
//   REQUIREMENTS (budget REQUIREMENTS_BUDGET_MS) = intro + initial_spec
//   SCENARIO idx (budget SCENARIO_BUDGET_MS)     = scenario_read → [ponder] →
//                                                  revise → [retro × q]
//   Phase sequence = [requirements, scenario0, …, scenario(N-1)], N = scenarios.
//
// HARD BUCKETS, NO CARRYOVER. Each phase is walled off:
//   • overrunning a task never touches another task's budget;
//   • finishing early FORFEITS the unused time (it is NOT rolled forward).
//
//   phaseStart(p)        = wall-clock instant phase p was ENTERED (requirements
//                          = initial_spec entry; scenario idx = that scenario's
//                          scenario_read entry).
//   currentPhase         = the phase of the latest entry.
//   taskRemainingMs      = B_current − (now − phaseStart(current))   // MAY be < 0
//   cumulativeRemainingMs= max(0, taskRemainingMs)
//                          + Σ B_p over phases STRICTLY AFTER current
//                          // completed phases contribute 0 (no carryover); an
//                          // overrun is floored at 0, never refunded.
//
// Logic keeps the sign of taskRemainingMs (drives the later 2-min warning and
// the at-0 popup — NOT built in S1). The mm:ss DISPLAY clamps at 0 via
// `formatRemaining` + the clamping helpers below; the underlying signed values
// are preserved for those thresholds.

export const REQUIREMENTS_BUDGET_MS = 10 * 60 * 1000; // 10 min (intro + initial_spec)
export const SCENARIO_BUDGET_MS = 15 * 60 * 1000; // 15 min per scenario
export const WARN_THRESHOLD_MS = 2 * 60 * 1000; // 2-minute warning (used by a later task, S2)

// ============================ Pure timer model ============================

export type TimerPhase =
  | { kind: 'requirements' }
  | { kind: 'scenario'; idx: number };

export type TimerInput = {
  // Per-phase budgets. Defaults are the constants above; passed explicitly so
  // the model is fully pure and the shared fixtures can vary them.
  budgets: { requirementsMs: number; scenarioMs: number };
  // N = number of scenarios in the task (1–3). Determines how many SCENARIO
  // phases exist and therefore what "phases after current" sums to.
  scenarioCount: number;
  // Wall-clock instants (ms epoch) each ENTERED phase began. A field/slot left
  // undefined means that phase has not been entered. `scenarios` is sparse by
  // index: scenarios[idx] is scenario idx's entry instant. The latest entered
  // phase (greatest start instant) is the current phase.
  phaseStartsMs: { requirements?: number; scenarios: (number | undefined)[] };
  // "Now" (ms epoch).
  nowMs: number;
};

export type TimerOutput = {
  // The phase of the latest entry, or null if no phase has been entered yet.
  currentPhase: TimerPhase | null;
  // B_current − elapsedInCurrentPhase. MAY be negative. When no phase has been
  // entered, this is the requirements budget at rest (the first thing the
  // participant will spend).
  taskRemainingMs: number;
  // max(0, taskRemainingMs) + Σ budgets of phases strictly after current. Never
  // negative. When no phase has been entered, this is the whole study budget.
  cumulativeRemainingMs: number;
};

// Budget of a given phase under the supplied budgets.
function budgetOf(phase: TimerPhase, budgets: TimerInput['budgets']): number {
  return phase.kind === 'requirements'
    ? budgets.requirementsMs
    : budgets.scenarioMs;
}

// Sum of budgets for the phases STRICTLY AFTER `current` in the canonical
// sequence [requirements, scenario0, …, scenario(N-1)].
function budgetAfter(
  current: TimerPhase,
  scenarioCount: number,
  budgets: TimerInput['budgets'],
): number {
  if (current.kind === 'requirements') {
    // All N scenarios are still ahead.
    return scenarioCount * budgets.scenarioMs;
  }
  // Scenarios with index > current.idx are still ahead.
  const remainingScenarios = Math.max(0, scenarioCount - 1 - current.idx);
  return remainingScenarios * budgets.scenarioMs;
}

// Pick the latest-entered phase from the recorded start instants. Ties (equal
// instants) resolve to the later phase in the sequence — a scenario entered at
// the same instant as requirements is treated as the more-advanced current
// phase. Returns null with the entry instant absent when nothing has started.
function currentPhaseOf(
  phaseStartsMs: TimerInput['phaseStartsMs'],
): { phase: TimerPhase; startedAt: number } | null {
  let best: { phase: TimerPhase; startedAt: number } | null = null;
  const consider = (phase: TimerPhase, startedAt: number | undefined) => {
    if (typeof startedAt !== 'number') return;
    // `>=` so a later phase entered at an equal instant wins (sequence order is
    // requirements, then scenarios ascending — we iterate in that order).
    if (best === null || startedAt >= best.startedAt) {
      best = { phase, startedAt };
    }
  };
  consider({ kind: 'requirements' }, phaseStartsMs.requirements);
  phaseStartsMs.scenarios.forEach((startedAt, idx) =>
    consider({ kind: 'scenario', idx }, startedAt),
  );
  return best;
}

// THE pure model. Given per-phase budgets, the scenario count, each entered
// phase's start instant, and `now`, returns the current phase, the (signed)
// current-task remaining, and the (floored) cumulative remaining.
export function computeTimer(input: TimerInput): TimerOutput {
  const { budgets, scenarioCount, phaseStartsMs, nowMs } = input;
  const current = currentPhaseOf(phaseStartsMs);

  // Idle: nothing entered yet. The first phase the participant will spend is
  // requirements, so the task number shows its full budget and the cumulative
  // shows the whole study (requirements + every scenario).
  if (current === null) {
    return {
      currentPhase: null,
      taskRemainingMs: budgets.requirementsMs,
      cumulativeRemainingMs:
        budgets.requirementsMs + scenarioCount * budgets.scenarioMs,
    };
  }

  const elapsed = nowMs - current.startedAt;
  const taskRemainingMs = budgetOf(current.phase, budgets) - elapsed;
  const cumulativeRemainingMs =
    Math.max(0, taskRemainingMs) +
    budgetAfter(current.phase, scenarioCount, budgets);

  return { currentPhase: current.phase, taskRemainingMs, cumulativeRemainingMs };
}

// ============================ Grant / keying ============================
// The idempotent grant/keying idea from the old pooled clock, extended to track
// EACH entered phase's start instant (requirements + scenarios), not just a
// count. Re-mounts / back-navigation don't re-grant: a key is recorded once.
//   • requirements key = `${moduleId}:requirements`
//   • scenario idx key = `${moduleId}:${idx}`
// `phaseStartsMs` is the model input above; the component persists this state.

export type TimerState = {
  // Per-phase entry instants (ms epoch). Mirrors TimerInput.phaseStartsMs.
  phaseStartsMs: { requirements?: number; scenarios: (number | undefined)[] };
  // Keys already granted, so re-mounts / back-nav don't re-stamp a start.
  countedKeys: string[];
  // Number of scenarios in the task (set on first grant; lets the model sum the
  // phases-after budget without re-reading the module).
  scenarioCount: number;
  // Whether the participant dismissed the 2-minute warning (used by S2).
  warnedDismissed: boolean;
};

export function initialTimerState(): TimerState {
  return {
    phaseStartsMs: { scenarios: [] },
    countedKeys: [],
    scenarioCount: 0,
    warnedDismissed: false,
  };
}

export function requirementsKey(moduleId: string): string {
  return `${moduleId}:requirements`;
}

export function scenarioKey(moduleId: string, idx: number): string {
  return `${moduleId}:${idx}`;
}

// Stamp the requirements phase's start the first time it's entered (idempotent
// per key). `scenarioCount` is the task's N, recorded so the model can sum the
// phases-after budget.
export function grantRequirements(
  state: TimerState,
  key: string,
  scenarioCount: number,
  now: number = Date.now(),
): TimerState {
  if (state.countedKeys.includes(key)) return state;
  return {
    ...state,
    scenarioCount: scenarioCount || state.scenarioCount,
    phaseStartsMs: {
      ...state.phaseStartsMs,
      requirements: state.phaseStartsMs.requirements ?? now,
    },
    countedKeys: [...state.countedKeys, key],
  };
}

// Stamp a scenario's start the first time it's entered (idempotent per key).
export function grantScenario(
  state: TimerState,
  key: string,
  idx: number,
  scenarioCount: number,
  now: number = Date.now(),
): TimerState {
  if (state.countedKeys.includes(key)) return state;
  const scenarios = [...state.phaseStartsMs.scenarios];
  if (typeof scenarios[idx] !== 'number') scenarios[idx] = now;
  return {
    ...state,
    scenarioCount: scenarioCount || state.scenarioCount,
    phaseStartsMs: { ...state.phaseStartsMs, scenarios },
    countedKeys: [...state.countedKeys, key],
  };
}

// True once any phase has been entered (the clock is running).
export function hasStarted(state: TimerState): boolean {
  return (
    typeof state.phaseStartsMs.requirements === 'number' ||
    state.phaseStartsMs.scenarios.some((s) => typeof s === 'number')
  );
}

// Adapt persisted TimerState → the pure model input at `now`.
export function timerInput(state: TimerState, now: number): TimerInput {
  return {
    budgets: {
      requirementsMs: REQUIREMENTS_BUDGET_MS,
      scenarioMs: SCENARIO_BUDGET_MS,
    },
    scenarioCount: state.scenarioCount,
    phaseStartsMs: state.phaseStartsMs,
    nowMs: now,
  };
}

// Convenience: compute the model straight from persisted state at `now`.
export function timerFromState(state: TimerState, now: number): TimerOutput {
  return computeTimer(timerInput(state, now));
}

// ============================ Display helpers ============================

// mm:ss, sign-clamped to 0 (display never shows a negative). Use the signed
// `taskRemainingMs`/`cumulativeRemainingMs` from the model for thresholds.
export function formatRemaining(ms: number): string {
  const clamped = Math.max(0, ms);
  const totalSec = Math.floor(clamped / 1000);
  const mm = Math.floor(totalSec / 60);
  const ss = totalSec % 60;
  return `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}
