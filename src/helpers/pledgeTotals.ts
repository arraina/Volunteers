// Missing source balances do not exclude commitments from summary arithmetic.
// Keep recorded payments intact; remaining is the net unpaid commitment.
export function calculatePledgeTotals(pledges: Array<{ pledgedAmount: number; paidAmount: number; status: string }>) {
  let pledgedCents = 0;
  let paidCents = 0;
  for (const pledge of pledges) {
    if (pledge.status === 'cancelled') continue;
    pledgedCents += Math.round(pledge.pledgedAmount * 100);
    paidCents += Math.round(pledge.paidAmount * 100);
  }
  return { pledged: pledgedCents / 100, paid: paidCents / 100, remaining: (pledgedCents - paidCents) / 100 };
}
