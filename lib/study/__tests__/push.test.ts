import { describe, it, expect } from 'vitest';
import {
  participantChannel,
  pushActionFor,
  parseRetroQuestionPayload,
  PUSH_SHOW_TIME,
  PUSH_OFFER_HELP,
  PUSH_RETRO_QUESTION,
} from '@/lib/study/push';

describe('participantChannel', () => {
  it('keys the channel on the 3-digit pid (cross-repo contract)', () => {
    expect(participantChannel('042')).toBe('live:participant:042');
  });

  it('does not mangle a pid that is not zero-padded', () => {
    expect(participantChannel('7')).toBe('live:participant:7');
  });
});

describe('pushActionFor', () => {
  it('maps show_time → show_time', () => {
    expect(pushActionFor(PUSH_SHOW_TIME)).toBe('show_time');
    expect(pushActionFor('show_time')).toBe('show_time');
  });

  it('maps offer_help → offer_help', () => {
    expect(pushActionFor(PUSH_OFFER_HELP)).toBe('offer_help');
    expect(pushActionFor('offer_help')).toBe('offer_help');
  });

  it('maps retro_question → retro_question (the payload-carrying push)', () => {
    expect(pushActionFor(PUSH_RETRO_QUESTION)).toBe('retro_question');
    expect(pushActionFor('retro_question')).toBe('retro_question');
  });

  it('returns null for an unrecognized event (no-op, never a crash)', () => {
    expect(pushActionFor('definitely_not_a_push')).toBeNull();
    expect(pushActionFor('')).toBeNull();
    // case-sensitivity matters: the wire contract is exact
    expect(pushActionFor('Show_Time')).toBeNull();
    expect(pushActionFor('Retro_Question')).toBeNull();
  });
});

describe('parseRetroQuestionPayload', () => {
  it('accepts a well-formed payload with a numeric scenarioIdx', () => {
    expect(
      parseRetroQuestionPayload({ text: 'What did you find hard?', scenarioIdx: 1 }),
    ).toEqual({ text: 'What did you find hard?', scenarioIdx: 1 });
  });

  it('accepts scenarioIdx === 0 (a falsy-but-valid index)', () => {
    expect(
      parseRetroQuestionPayload({ text: 'Why?', scenarioIdx: 0 }),
    ).toEqual({ text: 'Why?', scenarioIdx: 0 });
  });

  it('accepts an explicit null scenarioIdx (target current scenario)', () => {
    expect(
      parseRetroQuestionPayload({ text: 'Explain.', scenarioIdx: null }),
    ).toEqual({ text: 'Explain.', scenarioIdx: null });
  });

  it('treats a missing scenarioIdx key as null', () => {
    expect(parseRetroQuestionPayload({ text: 'Explain.' })).toEqual({
      text: 'Explain.',
      scenarioIdx: null,
    });
  });

  it('trims surrounding whitespace from text', () => {
    expect(
      parseRetroQuestionPayload({ text: '  trimmed  ', scenarioIdx: 2 }),
    ).toEqual({ text: 'trimmed', scenarioIdx: 2 });
  });

  it('rejects an empty or whitespace-only text (returns null)', () => {
    expect(parseRetroQuestionPayload({ text: '', scenarioIdx: 1 })).toBeNull();
    expect(parseRetroQuestionPayload({ text: '   ', scenarioIdx: 1 })).toBeNull();
  });

  it('rejects a non-string text (returns null, never throws)', () => {
    expect(parseRetroQuestionPayload({ text: 42, scenarioIdx: 1 })).toBeNull();
    expect(parseRetroQuestionPayload({ text: null, scenarioIdx: 1 })).toBeNull();
    expect(parseRetroQuestionPayload({ scenarioIdx: 1 })).toBeNull();
  });

  it('rejects a non-number, non-null scenarioIdx (returns null)', () => {
    expect(parseRetroQuestionPayload({ text: 'x', scenarioIdx: '1' })).toBeNull();
    expect(
      parseRetroQuestionPayload({ text: 'x', scenarioIdx: NaN }),
    ).toBeNull();
    expect(
      parseRetroQuestionPayload({ text: 'x', scenarioIdx: Infinity }),
    ).toBeNull();
  });

  it('rejects non-object / nullish payloads (the empty-payload pushes)', () => {
    expect(parseRetroQuestionPayload(null)).toBeNull();
    expect(parseRetroQuestionPayload(undefined)).toBeNull();
    expect(parseRetroQuestionPayload('retro_question')).toBeNull();
    expect(parseRetroQuestionPayload(123)).toBeNull();
    expect(parseRetroQuestionPayload([])).toBeNull();
  });
});
