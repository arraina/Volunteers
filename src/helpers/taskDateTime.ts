export const EASTERN_TIME_ZONE = 'America/New_York';
export const TASK_START_PAST_TOLERANCE_MS = 2 * 60 * 1000;

/** Convert a timezone-free datetime input into the matching Eastern Time instant. */
export function fromEasternDateTimeInput(value: string): Date {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!match) return new Date(NaN);
  const [, year, month, day, hour, minute] = match.map(Number);
  const wallClockUtc = Date.UTC(year, month - 1, day, hour, minute);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: EASTERN_TIME_ZONE,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(wallClockUtc));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((item) => item.type === type)?.value);
  const representedUtc = Date.UTC(
    part('year'), part('month') - 1, part('day'), part('hour'), part('minute')
  );
  return new Date(wallClockUtc - (representedUtc - wallClockUtc));
}

/** Format an absolute instant for an Eastern Time datetime-local input. */
export function toEasternDateTimeInput(date?: Date): string {
  if (!date) return '';
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: EASTERN_TIME_ZONE,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value || '';
  return `${part('year')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}`;
}

export function assertTaskStartNotPast(start: Date, now = new Date()): void {
  if (Number.isNaN(start.getTime())) throw new Error('Enter a valid task start date and time.');
  if (start.getTime() < now.getTime() - TASK_START_PAST_TOLERANCE_MS) {
    throw new Error('Task start date and time cannot be in the past.');
  }
}
