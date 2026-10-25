import { visibleQuickBooksLines, QuickBooksReportLine, quickBooksReportLines } from './quickbooksReport';

const lines: QuickBooksReportLine[] = [
  { label: 'Catering', values: ['5,132.00'], depth: 1, heading: false },
  { label: 'Facility Income', values: ['10,815.00'], depth: 1, heading: false },
  { label: 'Refund', values: ['(25.00)'], depth: 1, heading: false },
];

test('searches labels and values without changing QuickBooks order', () => {
  expect(visibleQuickBooksLines(lines, 'facility', null).map(line => line.label)).toEqual(['Facility Income']);
  expect(visibleQuickBooksLines(lines, '5,132', null).map(line => line.label)).toEqual(['Catering']);
});

test('sorts accounting values numerically and restores original order without a sort', () => {
  expect(visibleQuickBooksLines(lines, '', { column: 1, direction: 'asc' }).map(line => line.label)).toEqual(['Refund', 'Catering', 'Facility Income']);
  expect(visibleQuickBooksLines(lines, '', { column: 0, direction: 'desc' }).map(line => line.label)).toEqual(['Refund', 'Facility Income', 'Catering']);
  expect(visibleQuickBooksLines(lines, '', null)).toEqual(lines);
});

test('emits summaries once and identifies them as non-transaction rows', () => {
  expect(quickBooksReportLines([{Summary:{ColData:[{value:'Total'},{value:'100'}]}}])).toEqual([
    {label:'Total',values:['100'],depth:0,heading:true},
  ]);
});

test('keeps A/R memo and pledge codes aligned with all other returned columns', () => {
  const cells=['11/01/2026','Invoice','22','Manu Kunjappan','11/01/2028','10000.00','10000.00','PLG-0026'];
  const lines=quickBooksReportLines([{type:'Data',ColData:cells.map(value=>({value}))}]);
  expect([lines[0].label,...lines[0].values]).toEqual(cells);
  expect(visibleQuickBooksLines(lines,'PLG-0026',null)).toEqual(lines);
});
