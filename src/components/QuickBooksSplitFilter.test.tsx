import React, { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import QuickBooksSplitFilter from './QuickBooksSplitFilter';

const categories = [
  {key:'New Temple/Donation',group:'New Temple',label:'Donation',count:2,accounts:['New Temple Donation']},
  {key:'New Temple/Expense',group:'New Temple',label:'Expense',count:1,accounts:['New Temple Expense']},
  {key:'Festival Income/Janmashtami',group:'Festival Income',label:'Janmashtami',count:3,accounts:['Festival Income:Janmashtami']},
];
function Picker() {
  const [selected,setSelected]=useState<string[]>([]);
  return <><QuickBooksSplitFilter categories={categories} selected={selected} onChange={setSelected} available /><output data-testid="selection">{JSON.stringify(selected)}</output></>;
}
test('selects multiple categories, toggles whole groups and clears filters', () => {
  render(<Picker />);
  fireEvent.click(screen.getByLabelText('Donation (2 rows)'));
  fireEvent.click(screen.getByLabelText('Janmashtami (3 rows)'));
  expect(JSON.parse(screen.getByTestId('selection').textContent || '')).toEqual(['New Temple/Donation','Festival Income/Janmashtami']);
  fireEvent.click(screen.getByLabelText('All New Temple (3 rows)'));
  expect(JSON.parse(screen.getByTestId('selection').textContent || '').length).toBe(3);
  fireEvent.click(screen.getByLabelText('Donation (2 rows)'));
  expect((screen.getByLabelText('All New Temple (3 rows)') as HTMLInputElement).indeterminate).toBe(true);
  fireEvent.click(screen.getByText('Clear filters / show all'));
  expect(screen.getByTestId('selection').textContent).toBe('[]');
});
