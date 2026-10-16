const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  accessTokenUsable,
  intuitTid,
  quickBooksErrorCode,
  quickBooksEvent,
  refreshLeaseActive,
} = require('./quickbooksSecurity');

const timestamp = value => ({ toMillis: () => value });

test('extracts Intuit troubleshooting IDs without recording response data', () => {
  const response = { status: 401, headers: { get: name => name === 'intuit_tid' ? 'tid-123' : '' } };
  assert.equal(intuitTid(response), 'tid-123');
  assert.deepEqual(quickBooksEvent({ operation: 'report', response, payload: { Fault: { Error: [{ code: '3200', Message: 'private' }] } } }), {
    category: 'quickbooks', operation: 'report', outcome: 'failed', httpStatus: 401,
    intuitTid: 'tid-123', errorCode: '3200', actorUid: '',
  });
});

test('normalizes OAuth and Accounting API error codes', () => {
  assert.equal(quickBooksErrorCode({ error: 'invalid_grant' }), 'invalid_grant');
  assert.equal(quickBooksErrorCode({ Fault: { Error: [{ code: '6000' }] } }), '6000');
  assert.equal(quickBooksErrorCode({}), 'unknown_error');
});

test('requires a two-minute access-token safety window and honors refresh leases', () => {
  assert.equal(accessTokenUsable({ accessTokenExpiresAt: timestamp(1_000_000) }, 880_001), false);
  assert.equal(accessTokenUsable({ accessTokenExpiresAt: timestamp(1_000_000) }, 880_000), false);
  assert.equal(accessTokenUsable({ accessTokenExpiresAt: timestamp(1_000_001) }, 880_000), true);
  assert.equal(refreshLeaseActive({ refreshLeaseExpiresAt: timestamp(900_000) }, 899_999), true);
  assert.equal(refreshLeaseActive({ refreshLeaseExpiresAt: timestamp(900_000) }, 900_000), false);
});
