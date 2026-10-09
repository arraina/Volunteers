import type { CampaignSummary, FundraisingPledge, FundraisingPledgePayment } from './fundraisingCrm';
import type { FundraisingReceipt } from './fundraisingReceipts';
import type { TempleEvent } from './types';
import { toEasternDateTimeInput } from './taskDateTime';
export interface FundingActivity { id: string; date: string; type: 'Donation received' | 'Loan received' | 'Pledge committed' | 'Pledge payment received' | 'Loan returned'; name: string; eventId: string; amount: number; reference: string; source: string; }
export interface FundingRecord { id: string; type: 'Donation' | 'Loan' | 'Pledge'; name: string; eventId: string; date: string; amount: number; received: number | null; returned: number | null; remaining: number | null; source: string; }
const day = (date: Date | null | undefined) => date && Number.isFinite(date.getTime()) ? toEasternDateTimeInput(date).slice(0, 10) : '';
const cents = (amount: number) => Math.round(amount * 100) / 100;
export function buildFundingReport(receipts: FundraisingReceipt[], pledges: FundraisingPledge[], payments: FundraisingPledgePayment[], campaigns: CampaignSummary[], events: TempleEvent[]) {
  const records: FundingRecord[] = []; const activities: FundingActivity[] = [];
  receipts.forEach(receipt => {
    const date = receipt.kind === 'donation' ? day(events.find(event => event.id === receipt.eventId)?.date) || receipt.receivedDate : receipt.receivedDate;
    const loan = receipt.kind === 'loan';
    records.push({ id: receipt.id, type: loan ? 'Loan' : 'Donation', name: receipt.donorName, eventId: receipt.eventId, date, amount: receipt.amount, received: receipt.amount, returned: loan ? receipt.repaidAmount : 0, remaining: loan ? cents(receipt.amount - receipt.repaidAmount) : 0, source: 'Verified receipt' });
    activities.push({ id: receipt.id, date, type: loan ? 'Loan received' : 'Donation received', name: receipt.donorName, eventId: receipt.eventId, amount: receipt.amount, reference: receipt.reference, source: 'Saved receipt' });
    if (loan) receipt.repayments.forEach(payment => activities.push({ id: `${receipt.id}:${payment.id}`, date: payment.paidDate, type: 'Loan returned', name: receipt.donorName, eventId: receipt.eventId, amount: payment.amount, reference: payment.reference, source: 'Recorded repayment' }));
  });
  const knownSources = new Set(receipts.map(receipt => `${receipt.eventId}:${receipt.sourceCampaignEntryId}:${receipt.kind}`));
  campaigns.forEach(campaign => campaign.entries.filter(entry => ['donation', 'loan'].includes(entry.type) && !knownSources.has(`${campaign.eventId}:${entry.id}:${entry.type}`)).forEach(entry => {
    const id = `dashboard:${campaign.eventId}:${entry.id}`;
    const name = `${entry.firstName} ${entry.lastName}`.trim();
    const date = day(events.find(event => event.id === campaign.eventId)?.date);
    const loan = entry.type === 'loan';
    records.push({ id, type: loan ? 'Loan' : 'Donation', name, eventId: campaign.eventId, date, amount: entry.amount, received: entry.amount, returned: loan ? null : 0, remaining: loan ? null : 0, source: 'Event dashboard entry' });
    activities.push({ id, date, type: loan ? 'Loan received' : 'Donation received', name, eventId: campaign.eventId, amount: entry.amount, reference: '', source: 'Event dashboard · event date' });
  }));
  pledges.filter(pledge => pledge.status !== 'cancelled').forEach(pledge => {
    const name = `${pledge.donorFirstName} ${pledge.donorLastName}`.trim();
    const date = day(pledge.pledgeDate);
    records.push({ id: pledge.id, type: 'Pledge', name, eventId: pledge.eventId, date, amount: pledge.pledgedAmount, received: pledge.openBalanceKnown ? pledge.paidAmount : null, returned: 0, remaining: pledge.openBalanceKnown ? Math.max(0, cents(pledge.pledgedAmount - pledge.paidAmount)) : null, source: pledge.id.startsWith('dashboard:') ? 'Dashboard commitment' : 'Tracked pledge' });
    activities.push({ id: pledge.id, date, type: 'Pledge committed', name, eventId: pledge.eventId, amount: pledge.pledgedAmount, reference: '', source: pledge.id.startsWith('dashboard:') ? 'Event dashboard commitment' : 'Tracked pledge' });
  });
  // Actual receipts remain financial activity even if the commitment is cancelled.
  payments.forEach(payment => {
    const pledge = pledges.find(pledge => pledge.id === payment.pledgeId);
    activities.push({ id: payment.id, date: day(payment.receivedAt), type: 'Pledge payment received', name: pledge ? `${pledge.donorFirstName} ${pledge.donorLastName}`.trim() : 'Unlinked pledge payment', eventId: pledge?.eventId || '', amount: payment.amount, reference: payment.reference, source: 'Recorded pledge payment' });
  });
  return { records, activities };
}
export function fundingActivityTotals(activities: FundingActivity[]) {
  const sum = (type: FundingActivity['type']) => cents(activities.filter(activity => activity.type === type).reduce((total, activity) => total + activity.amount, 0));
  const donations = sum('Donation received'); const loans = sum('Loan received'); const pledgePayments = sum('Pledge payment received'); const returns = sum('Loan returned');
  return { donations, loans, pledgePayments, returns, pledged: sum('Pledge committed'), received: cents(donations + loans + pledgePayments), net: cents(donations + loans + pledgePayments - returns) };
}
