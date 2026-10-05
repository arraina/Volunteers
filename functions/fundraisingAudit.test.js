const test = require('node:test');
const assert = require('node:assert/strict');
const { changes, financialValues, lineage, safeSnapshot, COLLECTIONS } = require('./fundraisingAudit');
test('raw donor imports are excluded from auditing; curated donors and pledges remain covered', () => {
  assert.equal(COLLECTIONS.has('fundraisingDonors'), false);
  assert.equal(COLLECTIONS.has('fundraisingCuratedDonors'), true);
  assert.equal(COLLECTIONS.has('fundraisingPledges'), true);
});
test('detects amounts, donor relinking and cancellations, ignores bookkeeping', () => {
  assert.deepEqual(changes({ paidAmount: 1, donorId: 'a', status: 'active', updatedBy: 'a' }, { paidAmount: 2, donorId: 'b', status: 'cancelled', updatedBy: 'b' }), ['paidAmount', 'donorId', 'status']);
});
test('voided commitments preserve historic amounts without active balance', () => {
  assert.deepEqual(financialValues('fundraisingPledges', { pledgedAmount: 100, paidAmount: 20, status: 'cancelled' }), { originalPledged: 100, paid: 20, activePledged: 0, remaining: 0 });
  assert.equal(financialValues('fundraisingPledges', { pledgedAmount: 100, openBalanceKnown: false }).remaining, null);
});
test('campaign amounts separate donations, loans and pledges', () => {
  assert.equal(financialValues('fundraisingCampaigns', { entries: [{ type: 'loan', amount: 50 }, { type: 'donation', amount: 25 }] }).loan, 50);
});
test('lineage retains source record and does not copy tokens', () => {
  assert.deepEqual(lineage({ donorId: 'd', sourceImportKey: 'file:row-2', token: 'private' }), { donorId: 'd', sourceImportKey: 'file:row-2' });
  assert.deepEqual(safeSnapshot('fundraisingShareLinks', { eventId: 'e', tokenHash: 'private', token: 'private' }), { eventId: 'e' });
});
