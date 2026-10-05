import React from 'react';
import { render, screen } from '@testing-library/react';
import { onSnapshot } from 'firebase/firestore';
import { FundraisingPaymentAudit } from './FundraisingAuditHistory';

jest.mock('../config/firebase', () => ({ db: {} }));
jest.mock('firebase/firestore', () => ({
  collection: jest.fn(), query: jest.fn(), where: jest.fn(), orderBy: jest.fn(), limit: jest.fn(),
  onSnapshot: jest.fn(),
}));

test('shows changer name and direct audit control without opening the editor', () => {
  (onSnapshot as jest.Mock).mockImplementation((_query, callback) => {
    callback({ docs: [{ data: () => ({ action: 'updated', actorName: 'Fundraising Admin', actorEmail: 'admin@example.com', occurredAt: { toDate: () => new Date(2026, 9, 5, 12) } }) }] });
    return jest.fn();
  });
  render(<FundraisingPaymentAudit paymentId="payment-1" />);
  expect(screen.getByText('Last changed by: Fundraising Admin')).toBeTruthy();
  expect(screen.getByText(/admin@example.com/)).toBeTruthy();
  expect(screen.getByRole('button', { name: 'View record audit & lineage' })).toBeTruthy();
});

test('does not invent a changer for payments predating audit tracking', () => {
  (onSnapshot as jest.Mock).mockImplementation((_query, callback) => { callback({ docs: [] }); return jest.fn(); });
  render(<FundraisingPaymentAudit paymentId="old-payment" />);
  expect(screen.getByText(/No audit entry yet/)).toBeTruthy();
});
