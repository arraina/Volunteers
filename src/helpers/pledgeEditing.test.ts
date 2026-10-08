import { comparePledgeDates } from './pledgeEditing';

test('pledge dates sort both ways and blank dates stay last', () => {
  const records = [{ id: 'blank', pledgeDate: null }, { id: 'late', pledgeDate: new Date(2026, 9, 7) }, { id: 'early', pledgeDate: new Date(2026, 9, 1) }];
  expect([...records].sort((a, b) => comparePledgeDates(a, b, 'asc')).map(item => item.id)).toEqual(['early', 'late', 'blank']);
  expect([...records].sort((a, b) => comparePledgeDates(a, b, 'desc')).map(item => item.id)).toEqual(['late', 'early', 'blank']);
});
