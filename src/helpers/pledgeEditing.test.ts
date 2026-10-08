import { comparePledgeDates, eventPledgeDate } from './pledgeEditing';

test('event dates replace pledge dates only when the linked event has a valid date', () => {
  const original = new Date('2026-10-08T12:00:00Z');
  const eventDate = new Date('2026-09-29T12:00:00Z');
  const events = [{ id: 'dated', date: eventDate }, { id: 'undated' }, { id: 'invalid', date: new Date('invalid') }];
  expect(eventPledgeDate('dated', original, events)).toBe(eventDate);
  expect(eventPledgeDate('dated', null, events)).toBe(eventDate);
  for (const id of ['', 'missing', 'undated', 'invalid']) expect(eventPledgeDate(id, original, events)).toBe(original);
});

test('pledge dates sort both ways and blank dates stay last', () => {
  const records = [{ id: 'blank', pledgeDate: null }, { id: 'late', pledgeDate: new Date(2026, 9, 7) }, { id: 'early', pledgeDate: new Date(2026, 9, 1) }];
  expect([...records].sort((a, b) => comparePledgeDates(a, b, 'asc')).map(item => item.id)).toEqual(['early', 'late', 'blank']);
  expect([...records].sort((a, b) => comparePledgeDates(a, b, 'desc')).map(item => item.id)).toEqual(['late', 'early', 'blank']);
});
