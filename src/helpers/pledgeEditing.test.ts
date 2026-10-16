import { comparePledgeDates, comparePledgeDisplayOrder, eventPledgeDate } from './pledgeEditing';

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

test('cancelled pledges stay below every non-cancelled pledge regardless of date direction', () => {
  const records = [
    { id: 'cancelled-new', status: 'cancelled', pledgeDate: new Date(2026, 9, 12) },
    { id: 'active-old', status: 'active', pledgeDate: new Date(2026, 9, 1) },
    { id: 'cancelled-old', status: 'cancelled', pledgeDate: new Date(2026, 9, 2) },
    { id: 'fulfilled', status: 'fulfilled', pledgeDate: new Date(2026, 9, 5) },
  ];
  expect([...records].sort((a, b) => comparePledgeDisplayOrder(a, b, 'desc')).map(item => item.id)).toEqual(['fulfilled', 'active-old', 'cancelled-new', 'cancelled-old']);
  expect([...records].sort((a, b) => comparePledgeDisplayOrder(a, b, 'asc')).map(item => item.id)).toEqual(['active-old', 'fulfilled', 'cancelled-old', 'cancelled-new']);
});
