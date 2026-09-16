export const MAX_REMINDERS_PER_TASK = 2;
export const MIN_REMINDER_SPACING_HOURS = 24;
export const MIN_REMINDER_LEAD_HOURS = 0;

export function validateReminderHours(values: number[]): number[] {
  if (values.some((value) => !Number.isFinite(value) || value <= MIN_REMINDER_LEAD_HOURS)) {
    throw new Error('Each scheduled reminder must be a positive number of hours before the task.');
  }
  const reminders = Array.from(new Set(values)).sort((a, b) => b - a);
  if (reminders.length > MAX_REMINDERS_PER_TASK) {
    throw new Error(`A task can have no more than ${MAX_REMINDERS_PER_TASK} scheduled reminders.`);
  }
  if (reminders.length === 2 && Math.abs(reminders[0] - reminders[1]) < MIN_REMINDER_SPACING_HOURS) {
    throw new Error(`Scheduled reminders must be at least ${MIN_REMINDER_SPACING_HOURS} hours apart.`);
  }
  return reminders;
}
