import { describe, it, expect } from 'vitest';
import {
  participantChannel,
  pushActionFor,
  PUSH_SHOW_TIME,
  PUSH_OFFER_HELP,
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

  it('returns null for an unrecognized event (no-op, never a crash)', () => {
    expect(pushActionFor('definitely_not_a_push')).toBeNull();
    expect(pushActionFor('')).toBeNull();
    // case-sensitivity matters: the wire contract is exact
    expect(pushActionFor('Show_Time')).toBeNull();
  });
});
