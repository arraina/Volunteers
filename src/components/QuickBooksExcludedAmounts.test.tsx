import React from 'react';
import { render, screen } from '@testing-library/react';
import QuickBooksExcludedAmounts from './QuickBooksExcludedAmounts';
import { transactionSelectionTotal } from '../helpers/quickbooksCategories';

test('shows a partial-total warning and collapsed details with original row values', () => {
  const columns=[{ColTitle:'Date'},{ColTitle:'Amount'},{ColTitle:'Name'}];
  const total=transactionSelectionTotal([
    {label:'10/01/2026',values:['50.00','Donor A'],heading:false,depth:0},
    {label:'10/02/2026',values:['n/a','Donor B'],heading:false,depth:0},
  ],columns);
  const {container}=render(<QuickBooksExcludedAmounts total={total} columns={columns} />);
  expect(screen.getByRole('note').textContent).toContain('includes 1 of 2');
  expect(container.querySelector('details')?.hasAttribute('open')).toBe(false);
  expect(screen.getByText('View excluded amount details (1)')).toBeTruthy();
  expect(screen.getByText('Donor B')).toBeTruthy();
  expect(screen.getByText('n/a')).toBeTruthy();
  expect(screen.queryByText('Donor A')).toBeNull();
});

test('does not show warnings for a complete total', () => {
  const columns=[{ColTitle:'Amount'}];
  const total=transactionSelectionTotal([{label:'0.00',values:[],heading:false,depth:0}],columns);
  const {container}=render(<QuickBooksExcludedAmounts total={total} columns={columns} />);
  expect(container.textContent).toBe('');
});
