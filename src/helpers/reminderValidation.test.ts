import { validateReminderHours } from './reminderValidation';

describe('validateReminderHours', () => {
  it('rejects a reminder less than 24 hours before a task with a clear message', () => {
    expect(() => validateReminderHours([12])).toThrow('at least 24 hours before the task');
  });

  it('accepts one reminder at exactly 24 hours', () => {
    expect(validateReminderHours([24])).toEqual([24]);
  });

  it('continues to require two reminders to be 24 hours apart', () => {
    expect(() => validateReminderHours([48, 36])).toThrow('at least 24 hours apart');
    expect(validateReminderHours([48, 24])).toEqual([48, 24]);
  });
});
