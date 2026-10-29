import { calculatePledgeTotals } from './pledgeTotals';

test('includes commitments with unknown source balances without modifying records', () => {
  const pledges = [
    { pledgedAmount: 1000, paidAmount: 200, status: 'active', openBalanceKnown: true },
    { pledgedAmount: 500, paidAmount: 50, status: 'active', openBalanceKnown: false },
    { pledgedAmount: 100, paidAmount: 100, status: 'fulfilled', openBalanceKnown: true },
    { pledgedAmount: 900, paidAmount: 20, status: 'cancelled', openBalanceKnown: true },
  ];
  const before = JSON.stringify(pledges);
  expect(calculatePledgeTotals(pledges)).toEqual({ pledged: 1600, paid: 350, remaining: 1250 });
  expect(JSON.stringify(pledges)).toBe(before);
});

test('cent precision and overpayments do not create reconciliation gaps', () => {
  expect(calculatePledgeTotals([{ pledgedAmount: 10.10, paidAmount: 0.20, status: 'active' }]))
    .toEqual({ pledged: 10.10, paid: 0.20, remaining: 9.90 });
  expect(calculatePledgeTotals([{ pledgedAmount: 10, paidAmount: 12, status: 'active' }]))
    .toEqual({ pledged: 10, paid: 12, remaining: -2 });
  expect(calculatePledgeTotals([])).toEqual({ pledged: 0, paid: 0, remaining: 0 });
});
