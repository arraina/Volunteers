import { availableSplitCategories, splitCategory, splitColumnIndex } from './quickbooksCategories';

test('finds Split by title or API column key, not by fixed position', () => {
  expect(splitColumnIndex([{ColTitle:'Date'},{ColTitle:'Split'}])).toBe(1);
  expect(splitColumnIndex([{MetaData:[{Name:'ColKey',Value:'split_acc'}]}])).toBe(0);
  expect(splitColumnIndex([{ColTitle:'Account'}])).toBe(-1);
});
test('matches requested account aliases and respects parent context', () => {
  expect(splitCategory('Activities Income:Govinda Snacks').key).toBe('Active income/Govinda Snacks');
  expect(splitCategory('General Donation Income').key).toBe('General donation/General donation');
  expect(splitCategory('General Expenses:Utilities').key).toBe('General Expenses/Utility');
  expect(splitCategory('Active Income:Other').key).not.toBe(splitCategory('General Expenses:Other').key);
  expect(splitCategory('Other').key).toBe('raw:Other');
  expect(splitCategory('New Temple:Donation').key).toBe('New Temple/New Temple Donation');
  expect(splitCategory('New Temple Expense').key).toBe('New Temple/New Temple Expense');
});
test('keeps unknown, blank and multiple-account values visible without guessing', () => {
  expect(splitCategory('-Split-').key).toBe('multiple');
  expect(splitCategory('').key).toBe('blank');
  expect(splitCategory('Unrelated insurance refund').key).toBe('raw:Unrelated insurance refund');
});
test('offers only categories present in returned rows, excludes report headings', () => {
  const rows=[{label:'date',values:['Catering'],heading:false,depth:0},{label:'date2',values:['Catering'],heading:false,depth:0},{label:'Total',values:['Insurance'],heading:true,depth:0}];
  expect(availableSplitCategories(rows,1)).toEqual([{key:'Active income/Catering',group:'Active income',label:'Catering',count:2,accounts:['Catering']}]);
  expect(availableSplitCategories(rows,-1)).toEqual([]);
});
