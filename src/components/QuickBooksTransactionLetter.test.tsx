import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import QuickBooksTransactionLetter, { transactionLetterBody } from './QuickBooksTransactionLetter';

const columns = [{ ColTitle: 'Date' }, { ColTitle: 'Name' }, { ColTitle: 'Amount' }, { ColTitle: 'Memo' }];
const rows = [{ label: '10/29/2026', values: ['John Doe', '125.00', '<script>not HTML</script>'], depth: 0, heading: false }];

test('letter includes every provided transaction field and supports full editing before safe printing', () => {
  const print = jest.fn(); const doc = document.implementation.createHTMLDocument();
  const open = jest.spyOn(window, 'open').mockReturnValue({ document: doc, focus: jest.fn(), print } as unknown as Window);
  render(<QuickBooksTransactionLetter columns={columns} rows={rows} reportName="Transaction List" currency="USD" period="October 2026" onClose={jest.fn()} />);
  expect((screen.getByLabelText('Recipient name *') as HTMLInputElement).value).toBe('John Doe');
  expect(transactionLetterBody(columns, rows, 'Report', 'USD', 'October')).toContain('Amount: 125.00');
  fireEvent.change(screen.getByLabelText('Recipient name *'), { target: { value: 'Jane Doe' } });
  fireEvent.change(screen.getByLabelText('Letter text *'), { target: { value: 'Edited details <script>not HTML</script>' } });
  fireEvent.click(screen.getByRole('button', { name: 'Print letter' }));
  expect(doc.body.textContent).toContain('Dear Jane Doe,');
  expect(doc.body.textContent).toContain('Edited details <script>not HTML</script>');
  expect(doc.querySelector('script')).toBeNull();
  expect(print).toHaveBeenCalledTimes(1);
  open.mockRestore();
});

test('multiple recipients require explicit name and blocked popups show a useful error', () => {
  const open = jest.spyOn(window, 'open').mockReturnValue(null);
  render(<QuickBooksTransactionLetter columns={columns} rows={[...rows, { ...rows[0], values: ['Jane Doe', '50', ''] }]} reportName="Report" currency="USD" period="October" onClose={jest.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Print letter' }));
  expect(open).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText('Recipient name *'), { target: { value: 'John and Jane' } });
  fireEvent.click(screen.getByRole('button', { name: 'Print letter' }));
  expect(screen.getByRole('alert').textContent).toContain('Allow pop-ups');
  open.mockRestore();
});
