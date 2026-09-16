import { assertTaskStartNotPast, fromEasternDateTimeInput, toEasternDateTimeInput } from './taskDateTime';

describe('task date/time validation', () => {
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
