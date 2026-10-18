const test = require('node:test'); const assert = require('node:assert/strict');
const { identity, formatCode } = require('./fundraisingReconciliation');
const { allocateCode } = require('./fundraisingReconciliation');
test('allocation is idempotent, binds converted records, and never reuses codes', async () => {
  const values = new Map();
  const db = { doc: path => ({ path }), runTransaction: work => work({
    get: async ref => ({ exists: values.has(ref.path), data: () => values.get(ref.path) }),
    create: (ref, data) => { assert.equal(values.has(ref.path), false); values.set(ref.path, data); },
    set: (ref, data) => values.set(ref.path, data),
    update: (ref, data) => values.set(ref.path, { ...values.get(ref.path), ...data }),
  }) };
  const source = { kind: 'pledge', eventId: 'event', sourceCampaignEntryId: 'entry' };
  const timestamp = () => 'test-time';
  assert.equal(await allocateCode(db, source, 'owner', timestamp), 'PLG-0001');
  assert.equal(await allocateCode(db, { ...source, id: 'saved' }, 'owner', timestamp), 'PLG-0001');
  assert.equal(await allocateCode(db, { ...source, id: 'saved' }, 'owner', timestamp), 'PLG-0001');
  await assert.rejects(allocateCode(db, { ...source, id: 'duplicate' }, 'owner', timestamp), /Another record/);
  assert.equal(await allocateCode(db, { kind: 'pledge', id: 'another' }, 'owner', timestamp), 'PLG-0002');
  assert.equal(await allocateCode(db, { kind: 'loan', id: 'loan' }, 'owner', timestamp), 'LON-0001');
});
test('codes have separate readable prefixes and expandable sequences', () => {
  assert.equal(formatCode('pledge', 1), 'PLG-0001'); assert.equal(formatCode('donation', 12), 'DON-0012'); assert.equal(formatCode('loan', 10000), 'LON-10000');
  assert.throws(() => formatCode('invalid', 1)); assert.throws(() => formatCode('loan', 0));
});
test('event entries retain identity when converted, while unrelated records stay distinct', () => {
  const source = { kind: 'pledge', eventId: 'e', sourceCampaignEntryId: 'entry' };
  assert.equal(identity(source).key, identity({ ...source, id: 'saved' }).key);
  assert.notEqual(identity(source).key, identity({ ...source, kind: 'loan' }).key);
  assert.notEqual(identity({ kind: 'pledge', id: 'one' }).key, identity({ kind: 'pledge', id: 'two' }).key);
  assert.throws(() => identity({ kind: 'pledge', id: '../invalid' }));
});
