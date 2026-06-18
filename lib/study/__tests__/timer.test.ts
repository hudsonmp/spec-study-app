import { describe, it, expect } from 'vitest';
import {
  computeTimer,
  REQUIREMENTS_BUDGET_MS,
  SCENARIO_BUDGET_MS,
  type TimerInput,
} from '@/lib/study/timer';
import {
  TIMER_CASES,
  FIXTURE_REQUIREMENTS_BUDGET_MS,
  FIXTURE_SCENARIO_BUDGET_MS,
  type TimerCase,
} from '@/lib/study/__fixtures__/timer-cases';

// Translate a shared cross-repo fixture case into this repo's `computeTimer`
// input. The fixtures are budget/boundary-shaped (no app event types) precisely
// so both repos can adapt them to their own pure function.
function inputFor(c: TimerCase): TimerInput {
  return {
    budgets: {
      requirementsMs: c.budgets.requirementsMs,
      scenarioMs: c.budgets.scenarioMs,
    },
    scenarioCount: c.scenarioCount,
    phaseStartsMs: {
      requirements: c.phaseStartsMs.requirements,
      scenarios: c.phaseStartsMs.scenarios,
    },
    nowMs: c.nowMs,
  };
}

describe('budget constants match the cross-repo contract', () => {
  it('REQUIREMENTS_BUDGET_MS = 10 min', () => {
    expect(REQUIREMENTS_BUDGET_MS).toBe(10 * 60 * 1000);
    expect(REQUIREMENTS_BUDGET_MS).toBe(FIXTURE_REQUIREMENTS_BUDGET_MS);
  });
  it('SCENARIO_BUDGET_MS = 15 min', () => {
    expect(SCENARIO_BUDGET_MS).toBe(15 * 60 * 1000);
    expect(SCENARIO_BUDGET_MS).toBe(FIXTURE_SCENARIO_BUDGET_MS);
  });
});

describe('computeTimer — advisory buckets + carryover pool (shared fixtures)', () => {
  for (const c of TIMER_CASES) {
    it(c.name, () => {
      const out = computeTimer(inputFor(c));
      expect(out.currentPhase).toEqual(c.expect.currentPhase);
      expect(out.taskRemainingMs).toBe(c.expect.taskRemainingMs);
      expect(out.cumulativeRemainingMs).toBe(c.expect.cumulativeRemainingMs);
    });
  }
});

describe('computeTimer — invariants beyond the named fixtures', () => {
  it('cumulativeRemainingMs is the carryover pool — signed, goes negative once the whole budget is spent', () => {
    // On the named fixtures the pool is still positive (finite numbers).
    for (const c of TIMER_CASES) {
      const out = computeTimer(inputFor(c));
      expect(Number.isFinite(out.cumulativeRemainingMs)).toBe(true);
    }
    // Spend the whole pool + 1 min → cumulative is NEGATIVE. The model is NOT
    // floored (carryover); only the mm:ss display clamps at 0.
    const total = REQUIREMENTS_BUDGET_MS + 1 * SCENARIO_BUDGET_MS;
    const spent = computeTimer({
      budgets: { requirementsMs: REQUIREMENTS_BUDGET_MS, scenarioMs: SCENARIO_BUDGET_MS },
      scenarioCount: 1,
      phaseStartsMs: { requirements: 0, scenarios: [REQUIREMENTS_BUDGET_MS] },
      nowMs: total + 60_000,
    });
    expect(spent.cumulativeRemainingMs).toBe(-60_000);
  });

  it('taskRemainingMs keeps its sign (overrun cases go negative)', () => {
    const overrun = TIMER_CASES.filter((c) => c.expect.taskRemainingMs < 0);
    expect(overrun.length).toBeGreaterThan(0);
    for (const c of overrun) {
      const out = computeTimer(inputFor(c));
      expect(out.taskRemainingMs).toBeLessThan(0);
    }
  });

  it('current phase = the latest entered phase (greatest start instant)', () => {
    // scenario1 entered after scenario0 → current is scenario1, even though
    // scenario0 was entered.
    const out = computeTimer({
      budgets: { requirementsMs: REQUIREMENTS_BUDGET_MS, scenarioMs: SCENARIO_BUDGET_MS },
      scenarioCount: 2,
      phaseStartsMs: { requirements: 0, scenarios: [100, 200] },
      nowMs: 200,
      // ^ now == scenario1 start → task = full scenario budget. Cumulative is the
      //   carryover pool: totalBudget − (now − firstPhaseStart) = (R + 2S) − 200.
    });
    expect(out.currentPhase).toEqual({ kind: 'scenario', idx: 1 });
    expect(out.taskRemainingMs).toBe(SCENARIO_BUDGET_MS);
    expect(out.cumulativeRemainingMs).toBe(
      REQUIREMENTS_BUDGET_MS + 2 * SCENARIO_BUDGET_MS - 200,
    );
  });

  it('before requirements is entered, no phase has started (idle clock)', () => {
    const out = computeTimer({
      budgets: { requirementsMs: REQUIREMENTS_BUDGET_MS, scenarioMs: SCENARIO_BUDGET_MS },
      scenarioCount: 2,
      phaseStartsMs: { scenarios: [] },
      nowMs: 123,
    });
    expect(out.currentPhase).toBeNull();
    // Idle: full study budget remains, task shows the requirements budget.
    expect(out.taskRemainingMs).toBe(REQUIREMENTS_BUDGET_MS);
    expect(out.cumulativeRemainingMs).toBe(
      REQUIREMENTS_BUDGET_MS + 2 * SCENARIO_BUDGET_MS,
    );
  });
});
