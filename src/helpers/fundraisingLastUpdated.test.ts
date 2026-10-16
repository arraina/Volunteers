import { compareOptionalDates, recordLastUpdated } from './fundraisingLastUpdatedUtils';

test('uses the newest record or audit timestamp', () => {
  const created = new Date('2026-09-01T12:00:00Z');
  const updated = new Date('2026-10-01T12:00:00Z');
  const audited = new Date('2026-10-05T12:00:00Z');
  expect(recordLastUpdated(updated, created, audited)).toEqual(audited);
  expect(recordLastUpdated(updated, created, null)).toEqual(updated);
  expect(recordLastUpdated(null, null, null)).toBeNull();
});

test('sorts known timestamps in either direction and leaves unknown timestamps last', () => {
  const early = new Date('2026-10-01T12:00:00Z');
  const late = new Date('2026-10-05T12:00:00Z');
  expect([null, late, early].sort((a, b) => compareOptionalDates(a, b, 'asc'))).toEqual([early, late, null]);
  expect([null, early, late].sort((a, b) => compareOptionalDates(a, b, 'desc'))).toEqual([late, early, null]);
});
