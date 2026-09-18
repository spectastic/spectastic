import { afterEach, describe, expect, it, vi } from 'vitest';
import { localIsoDate } from '../src/dates.js';

/**
 * The shared local-calendar-date stamp (inbox I-080). Every verb that dates an
 * artifact with "today" used `new Date().toISOString().slice(0, 10)` — UTC —
 * at 13 sites. An evening run west of Greenwich (or an early-morning run east
 * of it) then dates the artifact a day off from the author's own calendar,
 * which is what every existing date in the estate assumes.
 */
describe('localIsoDate', () => {
  afterEach(() => vi.restoreAllMocks());

  it('formats the local calendar date as YYYY-MM-DD', () => {
    const now = new Date(2026, 8, 18, 22, 15, 0); // 18 Sep 2026, 22:15 — local components
    expect(localIsoDate(now)).toBe('2026-09-18');
  });

  it('pads single-digit months and days', () => {
    expect(localIsoDate(new Date(2026, 0, 5, 12, 0, 0))).toBe('2026-01-05');
  });

  it('defaults to the current instant when no date is given', () => {
    expect(localIsoDate()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('reads the LOCAL calendar getters, never the UTC ones or toISOString — the regression this exists to close', () => {
    // Host-timezone-independent regression guard: assert the *mechanism*
    // (which getters are called), not a specific instant's formatted output,
    // since the bug and the fix agree on the output in a UTC-timezone CI
    // runner and only diverge elsewhere.
    const now = new Date(2026, 8, 18, 22, 15, 0);
    const utcSpy = vi.spyOn(now, 'getUTCFullYear');
    const isoSpy = vi.spyOn(now, 'toISOString');
    localIsoDate(now);
    expect(utcSpy).not.toHaveBeenCalled();
    expect(isoSpy).not.toHaveBeenCalled();
  });
});
