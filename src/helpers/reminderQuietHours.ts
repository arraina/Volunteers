import { fromEasternDateTimeInput } from './taskDateTime';

export const QUIET_HOURS_LABEL = '9:00 PM–8:00 AM Eastern Time';

export type ReminderDeliveryPreview = {
  hoursBefore: number;
  requestedAt: Date;
  deliveryAt: Date;
  adjusted: boolean;
  unavailable: boolean;
  reason?: string;
};

const easternParts = (date: Date) => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value);
  return { year: value('year'), month: value('month'), day: value('day'), hour: value('hour'), minute: value('minute') };
};

const easternWallTime = (reference: Date, hour: number, dayOffset = 0) => {
  const parts = easternParts(reference);
  const dateKey = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + dayOffset));
  const year = dateKey.getUTCFullYear();
  const month = String(dateKey.getUTCMonth() + 1).padStart(2, '0');
  const day = String(dateKey.getUTCDate()).padStart(2, '0');
  return fromEasternDateTimeInput(`${year}-${month}-${day}T${String(hour).padStart(2, '0')}:00`);
};

const isQuiet = (date: Date) => {
  const hour = easternParts(date).hour;
  return hour >= 21 || hour < 8;
};

export function reminderDeliveryPreviews(taskStart: Date, hours: number[], now = new Date()): ReminderDeliveryPreview[] {
  const uniqueDeliveries = new Set<number>();
  return hours.map((hoursBefore) => {
    const requestedAt = new Date(taskStart.getTime() - hoursBefore * 3_600_000);
    let deliveryAt = requestedAt;
    let adjusted = false;
    let reason: string | undefined;
    const requestedParts = easternParts(requestedAt);
    if (isQuiet(requestedAt) || (requestedParts.hour === 20 && requestedParts.minute > 7)) {
      adjusted = true;
      const requestedHour = requestedParts.hour;
      if (requestedHour === 20) {
        deliveryAt = easternWallTime(requestedAt, 20);
        reason = 'Moved to the final evening delivery run because the next hourly run falls in quiet hours.';
      } else {
      const morning = easternWallTime(requestedAt, 8, requestedHour >= 21 ? 1 : 0);
      if (morning < taskStart) {
        deliveryAt = morning;
        reason = 'Moved to 8:00 AM because of quiet hours.';
      } else {
        deliveryAt = easternWallTime(requestedAt, 20, requestedHour < 8 ? -1 : 0);
        reason = 'Moved to 8:00 PM the previous evening because the task starts during quiet hours.';
      }
      }
    }
    const duplicate = uniqueDeliveries.has(deliveryAt.getTime());
    uniqueDeliveries.add(deliveryAt.getTime());
    return {
      hoursBefore, requestedAt, deliveryAt, adjusted,
      unavailable: deliveryAt <= now || deliveryAt >= taskStart || duplicate,
      reason: duplicate ? 'Combined with another reminder adjusted to the same delivery time.' : reason,
    };
  });
}
