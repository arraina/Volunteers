import { validateReminderHours } from './reminderValidation';

describe('validateReminderHours', () => {
  it('accepts a single reminder at any positive time before a task', () => {
    expect(validateReminderHours([0.5])).toEqual([0.5]);
    expect(validateReminderHours([12])).toEqual([12]);
  });

  it('rejects a reminder that is not before the task', () => {
    expect(() => validateReminderHours([0])).toThrow('positive number of hours');
  });

  it('requires two reminders to be at least 24 hours apart', () => {
    expect(() => validateReminderHours([48, 36])).toThrow('at least 24 hours apart');
    expect(validateReminderHours([48, 24])).toEqual([48, 24]);
    expect(validateReminderHours([24.5, 0.5])).toEqual([24.5, 0.5]);
  });
});
