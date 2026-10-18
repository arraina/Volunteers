// Read-only unless --apply is supplied. Uses the existing Firebase CLI login;
// never stores or prints credentials. Safe to rerun: codes are never reassigned.
const auth = require('../node_modules/firebase-tools/lib/auth');
const { ensureDocumentCodes, identity } = require('../functions/fundraisingReconciliation');
const collections = ['fundraisingPledges', 'fundraisingReceipts', 'fundraisingCampaigns'];
(async () => {
  const account = auth.getGlobalDefaultAccount(); if (!account) throw new Error('Firebase login required.');
  const token = await auth.getAccessToken(account.tokens.refresh_token, ['https://www.googleapis.com/auth/cloud-platform']);
  const root = 'https://firestore.googleapis.com/v1/projects/temple-volunteers-8ff23/databases/(default)/documents';
  const nameRoot = 'projects/temple-volunteers-8ff23/databases/(default)/documents/';
  const call = async (path, body) => {
    const response = await fetch(root + path, { method: body ? 'POST' : 'GET', headers: { Authorization: 'Bearer ' + token.access_token, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const data = await response.json();
    if (!response.ok && response.status !== 404) { const error = new Error(`Firestore ${response.status}: ${data.error?.message || 'request failed'}`); error.status = response.status; throw error; }
    return response.status === 404 ? null : data;
  };
  const decode = value => 'stringValue' in value ? value.stringValue : 'integerValue' in value ? Number(value.integerValue) : 'doubleValue' in value ? value.doubleValue : 'booleanValue' in value ? value.booleanValue : 'timestampValue' in value ? value.timestampValue : 'arrayValue' in value ? (value.arrayValue.values || []).map(decode) : 'mapValue' in value ? Object.fromEntries(Object.entries(value.mapValue.fields || {}).map(([key, value]) => [key, decode(value)])) : null;
  const encode = value => value === null ? { nullValue: null } : typeof value === 'string' ? { stringValue: value } : typeof value === 'boolean' ? { booleanValue: value } : typeof value === 'number' ? Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value } : Array.isArray(value) ? { arrayValue: { values: value.map(encode) } } : { mapValue: { fields: Object.fromEntries(Object.entries(value).map(([key, value]) => [key, encode(value)])) } };
  const snapshotOf = (document, id) => ({ id, exists: !!document, data: () => Object.fromEntries(Object.entries(document?.fields || {}).map(([key, value]) => [key, decode(value)])) });
  const db = {
    doc: path => ({ path, get: async () => snapshotOf(await call('/' + path), path.split('/').pop()) }),
    collection: path => ({ get: async () => { const docs = []; let page = ''; do { const data = await call('/' + path + '?pageSize=1000' + (page ? '&pageToken=' + encodeURIComponent(page) : '')); docs.push(...(data?.documents || []).map(document => snapshotOf(document, document.name.split('/').pop()))); page = data?.nextPageToken; } while (page); return { docs }; } }),
    runTransaction: async work => {
      for (let attempt = 0; attempt < 8; attempt++) {
        const { transaction } = await call(':beginTransaction', {}); const writes = [];
        const write = (ref, data, mode) => {
          const fields = {}; const updateTransforms = [];
          for (const [key, value] of Object.entries(data)) { if (value?.__serverTimestamp) updateTransforms.push({ fieldPath: key, setToServerValue: 'REQUEST_TIME' }); else fields[key] = encode(value); }
          writes.push({ update: { name: nameRoot + ref.path, fields }, ...(mode === 'update' ? { updateMask: { fieldPaths: Object.keys(fields) }, currentDocument: { exists: true } } : mode === 'create' ? { currentDocument: { exists: false } } : {}), ...(updateTransforms.length ? { updateTransforms } : {}) });
        };
        try {
          const result = await work({ get: async ref => snapshotOf(await call('/' + ref.path + '?transaction=' + encodeURIComponent(transaction)), ref.path.split('/').pop()), set: (ref, data) => write(ref, data, 'set'), create: (ref, data) => write(ref, data, 'create'), update: (ref, data) => write(ref, data, 'update') });
          await call(':commit', { transaction, writes }); return result;
        } catch (error) { await call(':rollback', { transaction }).catch(() => {}); if (error.status !== 409 || attempt === 7) throw error; }
      }
    },
  };
  const snapshots = await Promise.all(collections.map(collection => db.collection(collection).get()));
  const identities = new Set(); const counts = { pledges: 0, donations: 0, loans: 0, sourceEntries: 0, alreadyCoded: 0 };
  snapshots.forEach((snapshot, index) => snapshot.docs.forEach(document => {
    const data = document.data();
    if (index === 2) {
      for (const entry of data.entries || []) {
        identity({ kind: entry.type, eventId: document.id, sourceCampaignEntryId: entry.id });
        counts.sourceEntries++; if (entry.reconciliationCode) counts.alreadyCoded++;
      }
      return;
    }
    const kind = index === 0 ? 'pledge' : data.kind;
    const key = identity({ kind, id: document.id, eventId: data.eventId || '', sourceCampaignEntryId: data.sourceCampaignEntryId || '' }).key;
    if (identities.has(key)) throw new Error('Duplicate saved source records found; resolve before assigning codes.');
    identities.add(key); counts[kind === 'pledge' ? 'pledges' : kind === 'donation' ? 'donations' : 'loans']++;
    if (data.reconciliationCode) counts.alreadyCoded++;
  }));
  console.log(JSON.stringify({ mode: process.argv.includes('--apply') ? 'apply' : 'preview', counts }));
  if (!process.argv.includes('--apply')) return;
  let assigned = 0;
  // Bind saved records first; event entries then reuse the same code.
  for (let index = 0; index < collections.length; index++) for (const document of snapshots[index].docs.sort((a, b) => a.id.localeCompare(b.id))) {
    assigned += (await ensureDocumentCodes(db, collections[index], document.id, account.user.email, () => ({ __serverTimestamp: true }))).assigned;
  }
  const verified = await Promise.all(collections.map(collection => db.collection(collection).get()));
  let missing = 0; const codeToIdentity = new Map(); let uniqueCodes = 0;
  verified.forEach((snapshot, index) => snapshot.docs.forEach(document => {
    const data = document.data();
    const values = index === 2 ? (data.entries || []).map(entry => ({ code: entry.reconciliationCode, input: { kind: entry.type, eventId: document.id, sourceCampaignEntryId: entry.id } })) : [{ code: data.reconciliationCode, input: { kind: index === 0 ? 'pledge' : data.kind, id: document.id, eventId: data.eventId || '', sourceCampaignEntryId: data.sourceCampaignEntryId || '' } }];
    values.forEach(({ code, input }) => {
      if (!code) { missing++; return; }
      const key = identity(input).key;
      if (codeToIdentity.has(code) && codeToIdentity.get(code) !== key) throw new Error('Code collision detected.');
      if (!codeToIdentity.has(code)) uniqueCodes++;
      codeToIdentity.set(code, key);
    });
    const original = snapshots[index].docs.find(item => item.id === document.id)?.data();
    if (original) {
      const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
      const financial = value => JSON.stringify(canonical(Object.fromEntries(Object.entries(value).filter(([key]) => !['reconciliationCode', 'codesAssignedAt', 'codesAssignedBy'].includes(key)).map(([key, value]) => [key, key === 'entries' ? value.map(({ reconciliationCode, ...rest }) => rest) : value]))));
      if (financial(original) !== financial(data)) throw new Error('Financial/source data changed during migration; review concurrent changes.');
    }
  }));
  console.log(JSON.stringify({ assigned, uniqueCodes, missing, financialFieldsUnchanged: true }));
  if (missing) throw new Error('Some codes are missing.');
})().catch(error => { console.error(error.message); process.exitCode = 1; });
