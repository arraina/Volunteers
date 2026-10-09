import { buildFundingReport, fundingActivityTotals } from './fundraisingReporting';
import type { FundraisingReceipt } from './fundraisingReceipts';
import type { CampaignSummary, FundraisingPledge, FundraisingPledgePayment } from './fundraisingCrm';

test('September includes dashboard loans and donations alongside non-event receipts', () => {
  const campaigns = [{ eventId: 'september', entries: [{ id: 'donation', type: 'donation', amount: 333710.01 }, { id: 'loan', type: 'loan', amount: 500 }] }] as CampaignSummary[];
  const receipts = [{ id: 'standalone', kind: 'donation', eventId: '', amount: 20, receivedDate: '2026-09-10', repayments: [] }, { id: 'october', kind: 'loan', eventId: '', amount: 100, receivedDate: '2026-10-01', repaidAmount: 0, repayments: [] }] as unknown as FundraisingReceipt[];
  const report = buildFundingReport(receipts, [], [], campaigns, [{ id: 'september', name: 'Event', createdAt: new Date(), date: new Date('2026-09-25T12:00:00Z') }]);
  const totals = fundingActivityTotals(report.activities.filter(item => item.date.startsWith('2026-09')));
  expect(totals.donations).toBe(333730.01);
  expect(totals.loans).toBe(500);
  expect(totals.received).toBe(334230.01);
  expect(report.activities.find(item => item.id.endsWith(':loan'))?.source).toBe('Event dashboard · event date');
});

test('includes event and non-event records without duplicating linked receipts or counting commitments as cash', () => {
  const receipts = [{ id: 'loan', kind: 'loan', donorName: 'Lender', eventId: 'e', sourceCampaignEntryId: 'source', amount: 100, receivedDate: '2026-09-01', repaidAmount: 30, repayments: [{ id: 'return', paidDate: '2026-10-01', amount: 30 }] }, { id: 'donation', kind: 'donation', donorName: 'Donor', eventId: 'e', amount: 50, receivedDate: '2026-10-01', repayments: [] }] as FundraisingReceipt[];
  const pledges = [{ id: 'pledge', status: 'active', donorFirstName: 'John', donorLastName: 'Doe', eventId: 'e', pledgeDate: new Date('2026-09-29T12:00:00Z'), pledgedAmount: 200, paidAmount: 20, openBalanceKnown: true }, { id: 'cancelled', status: 'cancelled', pledgedAmount: 999 }] as FundraisingPledge[];
  const payments = [{ id: 'payment', pledgeId: 'pledge', receivedAt: new Date('2026-10-05T12:00:00Z'), amount: 20 }] as FundraisingPledgePayment[];
  const campaigns = [{ eventId: 'e', entries: [{ id: 'source', type: 'loan', amount: 100 }, { id: 'unverified', type: 'donation', amount: 1000 }] }] as CampaignSummary[];
  const report = buildFundingReport(receipts, pledges, payments, campaigns, [{ id: 'e', name: 'Event', createdAt: new Date('2026-09-01T12:00:00Z'), date: new Date('2026-09-29T12:00:00Z') }]);
  expect(report.records).toHaveLength(4);
  expect(report.records.find(item => item.id === 'loan')?.remaining).toBe(70);
  expect(report.records.find(item => item.id.includes('unverified'))?.received).toBe(1000);
  expect(fundingActivityTotals(report.activities)).toEqual({ donations: 1050, loans: 100, pledgePayments: 20, returns: 30, pledged: 200, received: 1170, net: 1140 });
  expect(fundingActivityTotals(report.activities.filter(item => item.date.startsWith('2026-09')))).toEqual({ donations: 1050, loans: 100, pledgePayments: 0, returns: 0, pledged: 200, received: 1150, net: 1150 });
  expect(fundingActivityTotals(report.activities.filter(item => item.date.startsWith('2026-10')))).toEqual({ donations: 0, loans: 0, pledgePayments: 20, returns: 30, pledged: 0, received: 20, net: -10 });
});

test('preserves unknown pledge balances and includes actual receipts on cancelled pledges', () => {
  const pledges = [{ id: 'unknown', status: 'active', pledgedAmount: 100, paidAmount: 0, openBalanceKnown: false, pledgeDate: null }, { id: 'cancelled', status: 'cancelled', donorFirstName: 'Donor' }] as unknown as FundraisingPledge[];
  const payments = [{ id: 'payment', pledgeId: 'cancelled', amount: 5, receivedAt: new Date('2026-10-01T12:00:00Z') }] as FundraisingPledgePayment[];
  const report = buildFundingReport([], pledges, payments, [], []);
  expect(report.records[0].remaining).toBeNull();
  expect(report.records).toHaveLength(1);
  expect(fundingActivityTotals(report.activities).received).toBe(5);
  expect(report.activities.find(item => item.type === 'Pledge committed')?.date).toBe('');
});
