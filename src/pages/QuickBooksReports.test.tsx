import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import QuickBooksReports from './QuickBooksReports';
jest.mock('../helpers/quickbooks', () => ({
  getQuickBooksStatus: async () => ({ connected: true, canManageConnection: false, companyId: 'test' }),
  getQuickBooksReport: async () => ({ report: { Header: { ReportName: 'Test report' }, Columns: { Column: [{ ColTitle: 'Account' }, { ColTitle: 'Amount' }] }, Rows: { Row: [{ ColData: [{ value: 'Account one' }, { value: '100' }] }] } } }),
}));

test('transaction checkboxes control letter contents and selection survives sorting but respects search', async () => {
  render(<QuickBooksReports setError={jest.fn()} />);
  fireEvent.change(await screen.findByRole('combobox'), { target: { value: 'TransactionList' } });
  fireEvent.click(screen.getByRole('button', { name: 'Run report' }));
  const checkbox = await screen.findByRole('checkbox', { name: /Select transaction/ });
  expect((screen.getByRole('button', { name: 'Print selected transactions (0)' }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(checkbox);
  fireEvent.click(screen.getByRole('button', { name: 'Sort by Amount' }));
  fireEvent.click(screen.getByRole('button', { name: 'Print selected transactions (1)' }));
  expect((screen.getByLabelText('Letter text *') as HTMLTextAreaElement).value).toContain('Account: Account one');
  fireEvent.change(screen.getByPlaceholderText('Search accounts, names, dates, or amounts'), { target: { value: 'no match' } });
  expect((screen.getByRole('button', { name: 'Print selected transactions (0)' }) as HTMLButtonElement).disabled).toBe(true);
});
test('indicates hidden columns, scrolls with buttons, and hides controls when everything fits', async () => {
  render(<QuickBooksReports setError={jest.fn()} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Run report' }));
  const viewport = await screen.findByRole('region', { name: /QuickBooks report/ });
  Object.defineProperties(viewport, { scrollWidth: { configurable: true, value: 1200 }, clientWidth: { configurable: true, value: 400 }, scrollLeft: { configurable: true, writable: true, value: 0 } });
  viewport.scrollBy = jest.fn();
  fireEvent(window, new Event('resize'));
  expect(await screen.findByText(/More columns to the right/)).toBeTruthy();
  const left = screen.getByRole('button', { name: 'Scroll report columns left' }) as HTMLButtonElement;
  expect(left.disabled).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Scroll report columns right' }));
  expect(viewport.scrollBy).toHaveBeenCalledWith({ left: 280, behavior: 'smooth' });
  viewport.scrollLeft = 800; fireEvent.scroll(viewport);
  expect(await screen.findByText(/More columns to the left/)).toBeTruthy();
  expect((screen.getByRole('button', { name: 'Scroll report columns right' }) as HTMLButtonElement).disabled).toBe(true);
  Object.defineProperty(viewport, 'scrollWidth', { value: 400 }); viewport.scrollLeft = 0;
  fireEvent(window, new Event('resize'));
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Scroll report columns right' })).toBeNull());
});
