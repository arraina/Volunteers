const test = require('node:test');
const assert = require('node:assert/strict');
const { adjustedReminderTime, isQuietHours } = require('./quiet-hours');

test('leaves daytime reminder unchanged', () => {
  const due = new Date('2026-10-01T16:00:00Z'); // noon ET
  const result = adjustedReminderTime(due, new Date('2026-10-04T10:00:00Z'));
  assert.equal(result.deliveryAt.toISOString(), due.toISOString());
  assert.equal(result.adjusted, false);
});

test('moves early-morning reminder to previous evening for an early task', () => {
  const result = adjustedReminderTime(
    new Date('2026-10-04T08:00:00Z'), // 4 AM ET
    new Date('2026-10-04T10:00:00Z') // 6 AM ET
  );
  assert.equal(result.deliveryAt.toISOString(), '2026-10-04T00:00:00.000Z'); // prior 8 PM ET
  assert.equal(result.reason, 'quiet_hours_previous_evening');
});

test('moves overnight reminder to next morning when task is later', () => {
  const result = adjustedReminderTime(
    new Date('2026-10-04T06:00:00Z'), // 2 AM ET
    new Date('2026-10-04T16:00:00Z') // noon ET
  );
  assert.equal(result.deliveryAt.toISOString(), '2026-10-04T12:00:00.000Z'); // 8 AM ET
});

test('reserves final evening run when next hourly run would enter quiet hours', () => {
  const result = adjustedReminderTime(
    new Date('2026-10-04T00:30:00Z'), // 8:30 PM ET
    new Date('2026-10-04T14:00:00Z')
  );
  assert.equal(result.deliveryAt.toISOString(), '2026-10-04T00:00:00.000Z');
  assert.equal(result.reason, 'quiet_hours_final_evening_run');
});

test('handles daylight-saving fallback using Eastern wall time', () => {
  const result = adjustedReminderTime(
    new Date('2026-11-01T09:00:00Z'), // 4 AM EST
    new Date('2026-11-01T11:00:00Z') // 6 AM EST
  );
  assert.equal(result.deliveryAt.toISOString(), '2026-11-01T00:00:00.000Z'); // prior 8 PM EDT
  assert.equal(isQuietHours(result.deliveryAt), false);
});
