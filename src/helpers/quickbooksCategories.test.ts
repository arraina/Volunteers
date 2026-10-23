import { availableSplitCategories, splitCategory, splitColumnIndex, transactionSelectionTotal } from './quickbooksCategories';

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

test('totals only selected transaction amounts in cents, preserving signs and excluding summaries', () => {
  const row=(value:string,heading=false)=>({label:'date',values:[value],depth:0,heading});
  expect(transactionSelectionTotal([row('1,200.10'),row('(20.05)'),row('-10.00'),row('99999',true)], [{ColTitle:'Date'},{ColTitle:'Amount'}]).cents).toBe(117005);
  expect(transactionSelectionTotal([row('0.10'),row('0.20')],[{}, {MetaData:[{Name:'ColKey',Value:'amount'}]}]).cents).toBe(30);
  expect(transactionSelectionTotal([row('0.20')],[{}, {ColTitle:'Amount'}]).cents).toBe(20);
});

test('exposes missing or malformed amounts and does not use a balance column', () => {
  const row=(value:string)=>({label:'date',values:[value],depth:0,heading:false});
  for(const value of ['', 'n/a', '1,2', '2.345']) {
    const total=transactionSelectionTotal([row(value)],[{}, {ColTitle:'Amount'}]);
    expect(total.cents).toBe(0); expect(total.included).toBe(0); expect(total.missing).toBe(1);
    expect(total.excluded[0].rawAmount).toBe(value);
  }
  expect(transactionSelectionTotal([row('20')],[{}, {ColTitle:'Balance'}]).cents).toBeNull();
  expect(transactionSelectionTotal([],[{ColTitle:'Amount'}]).cents).toBe(0);
});

test('returns a partial total and detailed exclusions without losing valid values', () => {
  const row=(label:string,value:string)=>({label,values:[value],depth:0,heading:false});
  const total=transactionSelectionTotal([row('10/01','100.10'),row('10/02',''),row('10/03','n/a'),row('10/04','(5.05)')],[{ColTitle:'Date'},{ColTitle:'Amount'}]);
  expect(total.cents).toBe(9505); expect(total.included).toBe(2); expect(total.missing).toBe(2);
  expect(total.excluded.map(item=>[item.rowNumber,item.row.label,item.reason])).toEqual([[2,'10/02','Missing amount'],[3,'10/03','Unsupported amount format']]);
  expect(transactionSelectionTotal([row('10/04','(5.05)')],[{}, {ColTitle:'Amount'}]).missing).toBe(0);
});
