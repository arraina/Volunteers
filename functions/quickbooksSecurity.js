'use strict';

const QUICKBOOKS_LOG_RETENTION_DAYS = 30;

function intuitTid(response) {
  return String(response?.headers?.get?.('intuit_tid') || '').slice(0, 200);
}

function quickBooksErrorCode(payload) {
  return String(
    payload?.error
      || payload?.Fault?.Error?.[0]?.code
      || payload?.Fault?.type
      || 'unknown_error'
  ).slice(0, 120);
}

function quickBooksEvent({ operation, response, payload, actorUid = '', outcome = 'failed' }) {
  return {
    category: 'quickbooks',
    operation: String(operation || 'unknown').slice(0, 80),
    outcome: String(outcome).slice(0, 40),
    httpStatus: Number(response?.status || 0),
    intuitTid: intuitTid(response),
    errorCode: quickBooksErrorCode(payload),
    actorUid: String(actorUid || '').slice(0, 128),
  };
}

function accessTokenUsable(connection, nowMillis = Date.now()) {
  return (connection?.accessTokenExpiresAt?.toMillis?.() || 0) > nowMillis + 120000;
}

function refreshLeaseActive(connection, nowMillis = Date.now()) {
  return (connection?.refreshLeaseExpiresAt?.toMillis?.() || 0) > nowMillis;
}

module.exports = {
  QUICKBOOKS_LOG_RETENTION_DAYS,
  accessTokenUsable,
  intuitTid,
  quickBooksErrorCode,
  quickBooksEvent,
  refreshLeaseActive,
};
