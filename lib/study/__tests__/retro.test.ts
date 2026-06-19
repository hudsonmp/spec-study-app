import { describe, it, expect } from 'vitest';
import {
  resolveEffectiveRetro,
  freezeRetroList,
  retroListForStep,
  isRetroQuestionInRange,
  type AuthoredRetro,
} from '@/lib/study/retro';

// A small authored set (two questions) reused across cases.
const authored: AuthoredRetro[] = [
  { text: 'A0: what did you find hard?' },
  { text: 'A1: what would you change?' },
];

describe('resolveEffectiveRetro', () => {
  it('falls back to the authored set when the scenario has no queued questions', () => {
    expect(resolveEffectiveRetro({}, authored, 0)).toEqual([
      { text: 'A0: what did you find hard?' },
      { text: 'A1: what would you change?' },
    ]);
    expect(resolveEffectiveRetro(undefined, authored, 0)).toEqual([
      { text: 'A0: what did you find hard?' },
      { text: 'A1: what would you change?' },
    ]);
  });

  it('overrides with queued questions when the scenario has a non-empty queue', () => {
    const q = { 0: ['Q0: queued one', 'Q1: queued two', 'Q2: queued three'] };
    expect(resolveEffectiveRetro(q, authored, 0)).toEqual([
      { text: 'Q0: queued one' },
      { text: 'Q1: queued two' },
      { text: 'Q2: queued three' },
    ]);
  });

  it('treats an empty queue array as "no override" (authored wins)', () => {
    expect(resolveEffectiveRetro({ 0: [] }, authored, 0)).toEqual([
      { text: 'A0: what did you find hard?' },
      { text: 'A1: what would you change?' },
    ]);
  });

  it('keys the override by scenario index (a queue for M does not leak into N)', () => {
    const q = { 2: ['only for scenario 2'] };
    // scenario 0 sees authored; scenario 2 sees the override.
    expect(resolveEffectiveRetro(q, authored, 0)).toEqual([
      { text: 'A0: what did you find hard?' },
      { text: 'A1: what would you change?' },
    ]);
    expect(resolveEffectiveRetro(q, authored, 2)).toEqual([
      { text: 'only for scenario 2' },
    ]);
  });
});

describe('freezeRetroList (the snapshot taken at retro entry)', () => {
  // Property (a): zero queued at entry → authored questions + count unchanged.
  it('(a) zero queued at entry snapshots the authored set, count unchanged', () => {
    const frozen = freezeRetroList({}, authored, 0);
    expect(frozen).toEqual([
      { text: 'A0: what did you find hard?' },
      { text: 'A1: what would you change?' },
    ]);
    expect(frozen.length).toBe(authored.length);
  });

  // Property (b): a question for scenario N arriving AFTER N's retro is entered
  // does NOT change N's active list/count. We model this exactly as the step
  // machine does: the snapshot is taken once at entry and carried; the queue
  // then mutates; the carried snapshot is unaffected.
  it('(b) a queue mutation after entry does not change the frozen list/count', () => {
    // Entry: scenario 0 has nothing queued → snapshot = authored (2 items).
    const queueAtEntry: Record<number, string[]> = {};
    const frozen = freezeRetroList(queueAtEntry, authored, 0);
    expect(frozen.length).toBe(2);

    // Researcher broadcasts DURING scenario 0's retro → a NEW queue object that
    // would, if read live, SHRINK the list to a single queued question.
    const queueAfterBroadcast: Record<number, string[]> = {
      0: ['LATE: arrived mid-retro'],
    };

    // The frozen snapshot is untouched: still the 2 authored items.
    expect(frozen).toEqual([
      { text: 'A0: what did you find hard?' },
      { text: 'A1: what would you change?' },
    ]);
    expect(frozen.length).toBe(2);

    // And reading the in-progress step via the frozen list IGNORES the new
    // queue entirely (this is what render + next() now do).
    const list = retroListForStep(
      { list: frozen, idx: 0 },
      queueAfterBroadcast,
      authored,
    );
    expect(list).toBe(frozen); // identity preserved → no shrink, no key shift
    expect(list.length).toBe(2);
  });

  it('(b-collision) frozen authored answer keys do not collide with a late queued question', () => {
    // With the freeze, the active list for scenario 0 stays the authored set,
    // so answerKey "0:0"/"0:1" continue to address the SAME authored questions
    // even though a queued question for scenario 0 now exists. (Were it read
    // live, "0:0" would silently switch from authored A0 to the queued one.)
    const frozen = freezeRetroList({}, authored, 0);
    const lateQueue = { 0: ['LATE'] };
    const list = retroListForStep({ list: frozen, idx: 0 }, lateQueue, authored);
    expect(list[0].text).toBe('A0: what did you find hard?');
    expect(list[1].text).toBe('A1: what would you change?');
  });

  // Property (c): a question for a NOT-YET-ENTERED scenario M DOES apply when
  // M's retro is later entered (freeze is per-entry, not global).
  it('(c) a queue present at a later scenario\'s entry IS applied (freeze is per-entry)', () => {
    // Scenario 0 was entered with no queue → authored.
    const frozen0 = freezeRetroList({}, authored, 0);
    expect(frozen0.length).toBe(2);

    // Before scenario 1's retro is entered, the researcher queued for it.
    const queueWhenEnteringS1 = { 1: ['M-only Q1', 'M-only Q2'] };
    const frozen1 = freezeRetroList(queueWhenEnteringS1, authored, 1);
    expect(frozen1).toEqual([{ text: 'M-only Q1' }, { text: 'M-only Q2' }]);

    // Scenario 0's earlier snapshot is unaffected by the later queue.
    expect(frozen0).toEqual([
      { text: 'A0: what did you find hard?' },
      { text: 'A1: what would you change?' },
    ]);
  });
});

describe('retroListForStep', () => {
  it('prefers the frozen snapshot carried on the step over the live queue', () => {
    const frozen = [{ text: 'frozen-only' }];
    const liveQueue = { 0: ['live-would-override'] };
    expect(retroListForStep({ list: frozen, idx: 0 }, liveQueue, authored)).toBe(
      frozen,
    );
  });

  it('falls back to a live resolve when no snapshot is present (controlled/preview path)', () => {
    // No `list` on the step (preview builds steps via screenToTaskStep, which
    // carries no snapshot) and no live queue → authored set, exactly as before.
    expect(retroListForStep({ idx: 0 }, undefined, authored)).toEqual([
      { text: 'A0: what did you find hard?' },
      { text: 'A1: what would you change?' },
    ]);
  });
});

describe('isRetroQuestionInRange (dead-guard helper)', () => {
  // Property (d): an out-of-range qIdx is detectable WITHOUT triggering any
  // completion side effect — the renderer branches on this to advance via the
  // normal scenario-completion path instead of calling onComplete() in render.
  it('reports in-range / out-of-range correctly for the frozen list', () => {
    const list = [{ text: 'q0' }, { text: 'q1' }];
    expect(isRetroQuestionInRange(list, 0)).toBe(true);
    expect(isRetroQuestionInRange(list, 1)).toBe(true);
    expect(isRetroQuestionInRange(list, 2)).toBe(false); // past the end
    expect(isRetroQuestionInRange(list, -1)).toBe(false);
    expect(isRetroQuestionInRange([], 0)).toBe(false); // empty list
  });

  it('the frozen-list count never produces a spurious out-of-range under a late queue', () => {
    // (d) Concretely: a participant on the LAST authored question (qIdx 1 of 2).
    // A broadcast shrinks the LIVE list to 1. With the live read, qIdx 1 would
    // be out of range → the old code called onComplete() in render. With the
    // frozen list, qIdx 1 is still valid.
    const frozen = freezeRetroList({}, authored, 0); // length 2
    const lateQueue = { 0: ['shrinks-to-one'] };
    const list = retroListForStep({ list: frozen, idx: 0 }, lateQueue, authored);
    expect(isRetroQuestionInRange(list, 1)).toBe(true); // would be false if read live
  });
});
