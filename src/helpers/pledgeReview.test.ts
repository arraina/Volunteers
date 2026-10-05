import { pledgeReviewReasons } from './pledgeReview';
import type { FundraisingPledge } from './fundraisingCrm';

const pledge = { id: 'p1', donorId: 'd1', donorFirstName: 'John', donorLastName: 'Doe', eventId: '', purpose: 'Building', pledgedAmount: 1000, paidAmount: 200, openBalanceKnown: true, status: 'active', pledgeDate: new Date(2026, 8, 1), dueDate: null, nextPaymentDate: null } as FundraisingPledge;
const now = new Date(2026, 9, 5, 12);

test('historical paid amounts without receipts do not cause false conflicts', () => {
  expect(pledgeReviewReasons(pledge, [pledge], [], 14, now)).toEqual([]);
});
test('cancelled pledges are excluded from review', () => {
  expect(pledgeReviewReasons({ ...pledge, status: 'cancelled', openBalanceKnown: false }, [], [], 14, now)).toEqual([]);
});
test('unknown balances and overdue dates explain actionable issues', () => {
  expect(pledgeReviewReasons({ ...pledge, openBalanceKnown: false, openBalanceSource: 'blank' }, [], [], 14, now)[0]).toContain('blank');
  expect(pledgeReviewReasons({ ...pledge, dueDate: new Date(2026, 9, 4) }, [], [], 14, now)[0]).toContain('$800.00');
  expect(pledgeReviewReasons({ ...pledge, dueDate: new Date(2026, 9, 5) }, [], [], 14, now)).toEqual([]);
});
test('duplicate requires matching donor, purpose, amount, and date', () => {
  expect(pledgeReviewReasons(pledge, [pledge, { ...pledge, id: 'p2' }], [], 14, now)[0]).toContain('Possible duplicate');
  expect(pledgeReviewReasons(pledge, [pledge, { ...pledge, id: 'p2', purpose: 'Other' }], [], 14, now)).toEqual([]);
});
