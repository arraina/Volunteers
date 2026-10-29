import type { FundraisingPledge, FundraisingPledgePayment } from './fundraisingCrm';

export function pledgeReviewFingerprint(pledge: FundraisingPledge, pledges: FundraisingPledge[], payments: FundraisingPledgePayment[]): string {
  const date = (value: Date | null) => value instanceof Date && Number.isFinite(value.getTime()) ? value.toISOString() : null;
  const name = (value: FundraisingPledge) => `${value.donorFirstName} ${value.donorLastName}`.toLowerCase().replace(/\s+/g, ' ').trim();
  const duplicates = pledges.filter(other => other.id !== pledge.id && other.status !== 'cancelled'
    && ((pledge.donorId && pledge.donorId === other.donorId) || (name(pledge) && name(pledge) === name(other)))
    && (pledge.eventId || pledge.purpose) === (other.eventId || other.purpose)
    && pledge.pledgedAmount === other.pledgedAmount
    && pledge.pledgeDate && other.pledgeDate && pledge.pledgeDate.toLocaleDateString() === other.pledgeDate.toLocaleDateString())
    .map(other => other.id).sort();
  return JSON.stringify([pledge.pledgedAmount, pledge.paidAmount, pledge.openBalanceKnown, pledge.openBalanceSource,
    pledge.status, pledge.donorId, pledge.eventId, pledge.purpose, date(pledge.pledgeDate), date(pledge.dueDate), date(pledge.nextPaymentDate), duplicates,
    payments.filter(payment => payment.pledgeId === pledge.id).map(payment => [payment.id, payment.amount, date(payment.receivedAt), payment.method, payment.status, payment.reference])
      .sort((a, b) => String(a[0]).localeCompare(String(b[0])))]);
}

export function isPledgeReviewConfirmed(pledge: FundraisingPledge, pledges: FundraisingPledge[], payments: FundraisingPledgePayment[]): boolean {
  return Boolean(pledge.reviewConfirmation?.confirmedBy && pledge.reviewConfirmation.fingerprint === pledgeReviewFingerprint(pledge, pledges, payments));
}

export function pledgeReviewReasons(pledge: FundraisingPledge, pledges: FundraisingPledge[], payments: FundraisingPledgePayment[], checkDays: number, now = new Date()): string[] {
  if (pledge.status === 'cancelled') return [];
  const reasons: string[] = [];
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const receipts = payments.filter((payment) => payment.pledgeId === pledge.id);
  const format = (amount: number) => amount.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
  if (!pledge.openBalanceKnown) reasons.push(`Open balance was ${pledge.openBalanceSource === 'blank' ? 'blank' : `recorded as “${pledge.openBalanceSource || 'unknown'}”`} in the source. Confirm the amount already received and the remaining balance.`);
  if (pledge.openBalanceKnown && pledge.paidAmount < pledge.pledgedAmount) {
    const due = [pledge.dueDate, pledge.nextPaymentDate].filter((date): date is Date => Boolean(date)).sort((a, b) => Number(a) - Number(b))[0];
    if (due && due < today) reasons.push(`Payment was due ${due.toLocaleDateString()} and ${format(pledge.pledgedAmount - pledge.paidAmount)} remains. Follow up with the donor or update the payment schedule.`);
  }
  const receiptTotal = receipts.reduce((sum, payment) => sum + payment.amount, 0);
  // Imported pledges can have historical paid amounts without dated receipts.
  // A lower receipt total alone is therefore not evidence of a conflict.
  if (receiptTotal > pledge.paidAmount + 0.005 || pledge.paidAmount > pledge.pledgedAmount + 0.005) reasons.push(`Amounts conflict: pledge ${format(pledge.pledgedAmount)}, recorded paid ${format(pledge.paidAmount)}, receipts ${format(receiptTotal)}. Reconcile the recorded amounts.`);
  const nameKey = (item: FundraisingPledge) => `${item.donorFirstName} ${item.donorLastName}`.toLowerCase().replace(/\s+/g, ' ').trim();
  const sameDay = (a: Date | null, b: Date | null) => Boolean(a && b && a.toLocaleDateString() === b.toLocaleDateString());
  if (pledges.some((other) => other.id !== pledge.id && other.status !== 'cancelled'
    && ((pledge.donorId && pledge.donorId === other.donorId) || (nameKey(pledge) && nameKey(pledge) === nameKey(other)))
    && (pledge.eventId || pledge.purpose) === (other.eventId || other.purpose)
    && pledge.pledgedAmount === other.pledgedAmount && sameDay(pledge.pledgeDate, other.pledgeDate))) reasons.push('Possible duplicate: another pledge has the same donor, event/purpose, amount, and pledge date. Compare both records before making changes.');
  receipts.forEach((payment) => {
    const validDate = payment.receivedAt instanceof Date && Number.isFinite(payment.receivedAt.getTime());
    if (!validDate || !payment.method) reasons.push(`Receipt of ${format(payment.amount)} is missing ${!validDate ? 'a valid received date' : 'a payment mode'}. Complete the receipt details.`);
    if (validDate && payment.method === 'check' && payment.status !== 'cleared' && (Number(today) - Number(payment.receivedAt)) / 86400000 >= checkDays) reasons.push(`Check for ${format(payment.amount)} received ${payment.receivedAt.toLocaleDateString()} has not been marked cleared after ${checkDays} days. Verify its clearing status${payment.reference ? ` (reference ${payment.reference})` : ''}.`);
  });
  return isPledgeReviewConfirmed(pledge, pledges, payments) ? reasons.filter(reason => !pledge.reviewConfirmation!.reasons.includes(reason)) : reasons;
}
