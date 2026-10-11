import { compareDonorFields, DonorSortField } from './donorSorting';
test('raw fields sort both ways with blanks last', () => {
  for (const field of ['firstName', 'lastName', 'email', 'address'] as DonorSortField[]) {
    const blank = { id: 'blank', firstName: '', lastName: '', phone: '', email: '', address: '' };
    const rows = [{ ...blank, id: 'z', [field]: 'Zulu' }, blank, { ...blank, id: 'a', [field]: 'alpha' }];
    expect([...rows].sort((a, b) => compareDonorFields(a, b, field, 'asc')).map(row => row.id)).toEqual(['a', 'z', 'blank']);
    expect([...rows].sort((a, b) => compareDonorFields(a, b, field, 'desc')).map(row => row.id)).toEqual(['z', 'a', 'blank']);
  }
});
