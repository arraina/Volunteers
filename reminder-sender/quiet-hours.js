const TIME_ZONE = 'America/New_York';
const QUIET_START_HOUR = 21;
const QUIET_END_HOUR = 8;
const PREVIOUS_EVENING_HOUR = 20;

function easternParts(date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(date);
  const value = (type) => Number(parts.find((part) => part.type === type)?.value);
  return { year: value('year'), month: value('month'), day: value('day'), hour: value('hour'), minute: value('minute') };
}

function easternWallTime(reference, hour, dayOffset = 0) {
  const parts = easternParts(reference);
  const targetWall = Date.UTC(parts.year, parts.month - 1, parts.day + dayOffset, hour);
  let result = new Date(targetWall);
  // Two passes safely resolve Eastern offsets on either side of DST changes.
  for (let pass = 0; pass < 2; pass += 1) {
    const represented = easternParts(result);
    const representedWall = Date.UTC(represented.year, represented.month - 1, represented.day, represented.hour);
    result = new Date(result.getTime() + targetWall - representedWall);
  }
  return result;
}

function isQuietHours(date) {
  const hour = easternParts(date).hour;
  return hour >= QUIET_START_HOUR || hour < QUIET_END_HOUR;
}

function adjustedReminderTime(requestedAt, taskStart) {
  const requestedParts = easternParts(requestedAt);
  // The job runs at :07. A due time after 8:07 PM would otherwise first be
  // processed after quiet hours begin, so release it at the final safe run.
  if (!isQuietHours(requestedAt) && !(requestedParts.hour === 20 && requestedParts.minute > 7)) {
    return { requestedAt, deliveryAt: requestedAt, adjusted: false, reason: null };
  }
  if (requestedParts.hour === 20) {
    return {
      requestedAt, deliveryAt: easternWallTime(requestedAt, PREVIOUS_EVENING_HOUR),
      adjusted: true, reason: 'quiet_hours_final_evening_run',
    };
  }
  const hour = requestedParts.hour;
  const morning = easternWallTime(requestedAt, QUIET_END_HOUR, hour >= QUIET_START_HOUR ? 1 : 0);
  if (morning < taskStart) {
    return { requestedAt, deliveryAt: morning, adjusted: true, reason: 'quiet_hours_next_morning' };
  }
  const evening = easternWallTime(requestedAt, PREVIOUS_EVENING_HOUR, hour < QUIET_END_HOUR ? -1 : 0);
  return { requestedAt, deliveryAt: evening, adjusted: true, reason: 'quiet_hours_previous_evening' };
}

module.exports = { adjustedReminderTime, isQuietHours };
