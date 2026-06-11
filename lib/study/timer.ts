// Cumulative carryover timer logic (pure; no React/DOM) so it can be unit-
// reasoned and persisted independently of the component.
//
// Model: the participant earns a 15-minute budget for each scenario they enter
// in the real task(s). The running "time remaining" is the SUM of granted
// budgets minus the elapsed wall-clock time since the timer started. Time saved
// on an earlier scenario therefore rolls forward — finishing scenario 1 in 10
// minutes leaves scenario 2 with the unspent 5 minutes on top of its own 15.
//
// The clock keeps counting past zero (no hard cut at 60 min cumulative): the
// remaining value is allowed to go negative ("over"). The 2-minute warning and
// the red styling are derived from `remainingMs`, not enforced as a stop.

export const SCENARIO_BUDGET_MS = 15 * 60 * 1000; // 15 minutes per scenario
export const WARN_THRESHOLD_MS = 2 * 60 * 1000; // 2-minute warning

export type TimerState = {
  // Wall-clock epoch ms when the timer started (first scenario entered).
  startedAt: number | null;
  // How many scenarios have been entered (each grants SCENARIO_BUDGET_MS).
  scenariosEntered: number;
  // Scenario keys already counted, so re-mounts / back-navigation don't
  // double-grant. A key is `${moduleId}:${scenarioIdx}`.
  countedKeys: string[];
  // Whether the participant has dismissed the 2-minute warning (don't re-nag).
  warnedDismissed: boolean;
};

export function initialTimerState(): TimerState {
  return {
    startedAt: null,
    scenariosEntered: 0,
    countedKeys: [],
    warnedDismissed: false,
  };
}

// Grant a scenario's budget the first time that scenario is entered. Starts the
// clock on the first grant. Idempotent per `key`.
export function grantScenario(state: TimerState, key: string): TimerState {
  if (state.countedKeys.includes(key)) return state;
  return {
    ...state,
    startedAt: state.startedAt ?? Date.now(),
    scenariosEntered: state.scenariosEntered + 1,
    countedKeys: [...state.countedKeys, key],
  };
}

// Total budget granted so far, in ms.
export function grantedBudgetMs(state: TimerState): number {
  return state.scenariosEntered * SCENARIO_BUDGET_MS;
}

// Remaining time in ms at wall-clock `now`. Negative => over the suggested
// budget. Before the clock starts, the full first-grant budget isn't yet
// counted, so remaining is 0 (display shows the budget once a scenario starts).
export function remainingMs(state: TimerState, now: number): number {
  if (state.startedAt === null) return 0;
  const elapsed = now - state.startedAt;
  return grantedBudgetMs(state) - elapsed;
}

// mm:ss (no sign). Used together with `isOver` for the leading "-".
export function formatRemaining(ms: number): string {
  const abs = Math.abs(ms);
  const totalSec = Math.floor(abs / 1000);
  const mm = Math.floor(totalSec / 60);
  const ss = totalSec % 60;
  return `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}
