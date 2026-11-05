import { describe, it, expect } from 'vitest';
import {
  getTodayDateIST,
  getOffsetDateIST,
  getDateOptionLabelIST,
  isPastDateIST
} from '../utils/dateUtils';

describe('DEF-01: Indian Standard Time (IST) Date Utilities', () => {
  // Test reference date: 2026-11-05 in Indian Standard Time (UTC+05:30)
  // Corresponding UTC timestamps:
  // 00:05 IST = 2026-11-04 18:35:00 UTC
  // 01:00 IST = 2026-11-04 19:30:00 UTC
  // 05:29 IST = 2026-11-04 23:59:00 UTC
  // 05:30 IST = 2026-11-05 00:00:00 UTC
  // 12:00 IST = 2026-11-05 06:30:00 UTC
  // 23:59 IST = 2026-11-05 18:29:00 UTC

  it('1. 00:05 IST returns the current IST calendar date (2026-11-05)', () => {
    const timeAt0005IST = new Date('2026-11-04T18:35:00.000Z');
    expect(getTodayDateIST(timeAt0005IST)).toBe('2026-11-05');
  });

  it('2. 01:00 IST returns the current IST calendar date (2026-11-05)', () => {
    const timeAt0100IST = new Date('2026-11-04T19:30:00.000Z');
    expect(getTodayDateIST(timeAt0100IST)).toBe('2026-11-05');
  });

  it('3. 05:29 IST returns the current IST calendar date (2026-11-05)', () => {
    const timeAt0529IST = new Date('2026-11-04T23:59:00.000Z');
    expect(getTodayDateIST(timeAt0529IST)).toBe('2026-11-05');
  });

  it('4. 05:30 IST returns the current IST calendar date (2026-11-05)', () => {
    const timeAt0530IST = new Date('2026-11-05T00:00:00.000Z');
    expect(getTodayDateIST(timeAt0530IST)).toBe('2026-11-05');
  });

  it('5. 12:00 IST returns the current IST calendar date (2026-11-05)', () => {
    const timeAt1200IST = new Date('2026-11-05T06:30:00.000Z');
    expect(getTodayDateIST(timeAt1200IST)).toBe('2026-11-05');
  });

  it('6. 23:59 IST returns the current IST calendar date (2026-11-05)', () => {
    const timeAt2359IST = new Date('2026-11-05T18:29:00.000Z');
    expect(getTodayDateIST(timeAt2359IST)).toBe('2026-11-05');
  });

  it('7. UTC date differs from IST date in early-morning boundary case, while helper returns correct IST date', () => {
    // At 05:29 AM IST on 2026-11-05, UTC timestamp is 2026-11-04 23:59:00Z.
    const boundaryTime = new Date('2026-11-04T23:59:00.000Z');

    // Flawed legacy UTC behavior:
    const flawedUtcDate = boundaryTime.toISOString().split('T')[0];
    expect(flawedUtcDate).toBe('2026-11-04'); // Yesterday!

    // Correct IST date helper:
    const correctIstDate = getTodayDateIST(boundaryTime);
    expect(correctIstDate).toBe('2026-11-05'); // Today!

    // Verify divergence:
    expect(flawedUtcDate).not.toBe(correctIstDate);
  });

  it('8. calculates offset dates accurately in IST (Tomorrow and +2 days)', () => {
    const boundaryTime = new Date('2026-11-04T23:59:00.000Z'); // 05:29 AM IST on 2026-11-05
    expect(getOffsetDateIST(0, boundaryTime)).toBe('2026-11-05');
    expect(getOffsetDateIST(1, boundaryTime)).toBe('2026-11-06');
    expect(getOffsetDateIST(2, boundaryTime)).toBe('2026-11-07');
  });

  it('9. formats accessible date option labels in IST', () => {
    const boundaryTime = new Date('2026-11-04T23:59:00.000Z'); // 2026-11-05 is a Thursday
    expect(getDateOptionLabelIST(0, boundaryTime)).toBe('Today');
    expect(getDateOptionLabelIST(1, boundaryTime)).toBe('Tomorrow');
    expect(getDateOptionLabelIST(2, boundaryTime)).toMatch(/Sat,\s*7\s*Nov/i);
  });

  it('10. correctly detects past dates in IST', () => {
    const referenceDate = new Date('2026-11-04T23:59:00.000Z'); // 2026-11-05 in IST
    expect(isPastDateIST('2026-11-04', referenceDate)).toBe(true);
    expect(isPastDateIST('2026-11-05', referenceDate)).toBe(false);
    expect(isPastDateIST('2026-11-06', referenceDate)).toBe(false);
  });
});
