const { createHash } = require('crypto');
const prefixes = { pledge: 'PLG', donation: 'DON', loan: 'LON' };
function identity(input) {
  if (!prefixes[input.kind]) throw new Error('Invalid financial record type.');
  const source = !!input.sourceCampaignEntryId;
  const parts = source ? [input.kind, 'source', input.eventId, input.sourceCampaignEntryId] : [input.kind, 'record', input.id];
  if (parts.some(part => typeof part !== 'string' || !part || part.length > 180 || part.includes('/'))) throw new Error('Invalid reconciliation record identity.');
  return { key: createHash('sha256').update(JSON.stringify(parts)).digest('hex'), prefix: prefixes[input.kind] };
}
function formatCode(kind, sequence) {
  if (!prefixes[kind] || !Number.isSafeInteger(sequence) || sequence < 1) throw new Error('Invalid reconciliation sequence.');
  return `${prefixes[kind]}-${String(sequence).padStart(4, '0')}`;
}
async function allocateCode(db, input, actor, timestamp) {
  const { key, prefix } = identity(input);
  const ref = db.doc(`fundraisingReconciliationKeys/${key}`);
  return db.runTransaction(async transaction => {
    const existing = await transaction.get(ref);
    if (existing.exists) {
      const value = existing.data();
      if (input.id && value.recordId && value.recordId !== input.id) throw new Error('Another record already uses this event entry. Review the duplicate before saving.');
      if (input.id && !value.recordId) {
        const binding = { recordId: input.id, updatedBy: actor, updatedAt: timestamp() };
        transaction.update(ref, binding);
        transaction.update(db.doc(`fundraisingReconciliationCodes/${value.code}`), binding);
      }
      return value.code;
    }
    const counter = db.doc(`fundraisingReconciliationCounters/${prefix}`);
    const snapshot = await transaction.get(counter);
    const next = (snapshot.exists ? snapshot.data().sequence : 0) + 1;
    const code = formatCode(input.kind, next);
    const codeRef = db.doc(`fundraisingReconciliationCodes/${code}`);
    const collision = await transaction.get(codeRef);
    if (collision.exists) throw new Error('Reconciliation counter conflict. Contact the Owner.');
    const data = { code, kind: input.kind, recordId: input.id || '', eventId: input.eventId || '', sourceCampaignEntryId: input.sourceCampaignEntryId || '', createdBy: actor, createdAt: timestamp() };
    transaction.set(counter, { sequence: next }); transaction.create(ref, data); transaction.create(codeRef, data);
    return code;
  });
}
async function ensureDocumentCodes(db, collection, id, actor, timestamp) {
  const ref = db.doc(`${collection}/${id}`); const snapshot = await ref.get();
  if (!snapshot.exists) return { assigned: 0 };
  const data = snapshot.data();
  if (collection === 'fundraisingCampaigns') {
    const codes = new Map();
    for (const entry of data.entries || []) {
      if (!prefixes[entry.type]) continue;
      if (entry.reconciliationCode?.startsWith(prefixes[entry.type] + '-')) continue;
      codes.set(`${entry.type}:${entry.id}`, await allocateCode(db, { kind: entry.type, eventId: id, sourceCampaignEntryId: entry.id }, actor, timestamp));
    }
    if (!codes.size) return { assigned: 0 };
    let assigned = 0;
    await db.runTransaction(async transaction => {
      const latest = await transaction.get(ref); if (!latest.exists) return;
      assigned = 0;
      const entries = (latest.data().entries || []).map(entry => {
        const code = codes.get(`${entry.type}:${entry.id}`);
        if (!code || entry.reconciliationCode === code) return entry;
        assigned++; return { ...entry, reconciliationCode: code };
      });
      if (assigned) transaction.update(ref, { entries, codesAssignedBy: actor, codesAssignedAt: timestamp() });
    });
    return { assigned };
  }
  if (data.reconciliationCode) return { assigned: 0 };
  const input = { kind: collection === 'fundraisingPledges' ? 'pledge' : data.kind, id, eventId: data.eventId || '', sourceCampaignEntryId: data.sourceCampaignEntryId || '' };
  const code = await allocateCode(db, input, actor, timestamp);
  await db.runTransaction(async transaction => {
    const latest = await transaction.get(ref); if (!latest.exists || latest.data().reconciliationCode) return;
    if ((latest.data().eventId || '') !== input.eventId || (latest.data().sourceCampaignEntryId || '') !== input.sourceCampaignEntryId) throw new Error('Record source changed during code allocation; retry.');
    transaction.update(ref, { reconciliationCode: code, codesAssignedBy: actor, codesAssignedAt: timestamp() });
  });
  return { assigned: 1 };
}
module.exports = { identity, formatCode, allocateCode, ensureDocumentCodes };
