const { test } = require('node:test');
const assert = require('node:assert/strict');
const { receipt, repayment, returned } = require('./fundraisingReceipts');
const base = { kind: 'donation', donorId: 'donor', eventId: '', sourceCampaignEntryId: '', amount: 100, receivedDate: '2026-01-01', method: 'cash', reference: '', receivedBy: '', designation: '', receiptNumber: '', notes: '' };
test('donations are single receipts without loan terms', () => { assert.equal(receipt(base).amount, 100); assert.equal(receipt(base).dueDate, undefined); });
test('loans require final due date and installment terms', () => {
  const loan = { ...base, kind: 'loan', dueDate: '2027-01-01', repaymentMode: 'single', nextRepaymentDate: '' };
  assert.equal(receipt(loan).installmentAmount, 0);
  assert.throws(() => receipt({ ...loan, dueDate: '2025-01-01' }));
  assert.throws(() => receipt({ ...loan, repaymentMode: 'installments', frequency: 'monthly', installmentAmount: 10 }));
  assert.equal(receipt({ ...loan, repaymentMode: 'installments', frequency: 'monthly', installmentAmount: 10, nextRepaymentDate: '2026-02-01' }).installmentAmount, 10);
});
test('financial dates and amounts are validated and returns sum in cents', () => {
  assert.throws(() => receipt({ ...base, receivedDate: '2099-01-01' }));
  assert.throws(() => receipt({ ...base, receivedDate: '2026-02-30' }));
  assert.throws(() => receipt({ ...base, amount: -1 }));
  assert.throws(() => receipt({ ...base, amount: 0.001 }));
  assert.throws(() => repayment({ paidDate: '2099-01-01', amount: 1, method: 'cash' }));
  assert.equal(returned([{ amount: 0.1 }, { amount: 0.2 }]), 0.3);
});
