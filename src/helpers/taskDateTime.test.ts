import { assertTaskStartNotPast, fromEasternDateTimeInput, toEasternDateTimeInput } from './taskDateTime';

describe('task date/time validation', () => {
  it('rejects partial years and invalid calendar dates instead of silently normalizing them', () => {
    for (const value of ['0027-10-04T19:04', '27-10-04T19:04', '2027-02-30T10:00', '2027-13-01T10:00', '2027-10-04T24:00']) {
      expect(Number.isNaN(fromEasternDateTimeInput(value).getTime())).toBe(true);
    }
    expect(fromEasternDateTimeInput('2027-10-04T19:04').getUTCFullYear()).toBe(2027);
    expect(fromEasternDateTimeInput('2028-02-29T10:00').toISOString()).toBe('2028-02-29T15:00:00.000Z');
  });
  it('interprets datetime-local values as Eastern Time', () => {
    expect(fromEasternDateTimeInput('2026-01-15T10:30').toISOString()).toBe('2026-01-15T15:30:00.000Z');
    expect(fromEasternDateTimeInput('2026-07-15T10:30').toISOString()).toBe('2026-07-15T14:30:00.000Z');
  });

  it('formats an instant as an Eastern datetime-local value', () => {
    expect(toEasternDateTimeInput(new Date('2026-07-15T14:30:00.000Z'))).toBe('2026-07-15T10:30');
  });

  it('rejects past starts while allowing the submission tolerance', () => {
    const now = new Date('2026-09-15T16:00:00.000Z');
    expect(() => assertTaskStartNotPast(new Date('2026-09-15T15:57:59.000Z'), now)).toThrow('cannot be in the past');
    expect(() => assertTaskStartNotPast(new Date('2026-09-15T15:58:01.000Z'), now)).not.toThrow();
  });
});
