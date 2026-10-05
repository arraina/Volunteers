import React, { useEffect, useState } from 'react';
import { collection, doc, getDoc, getDocs, limit, orderBy, query, QueryDocumentSnapshot, startAfter, where } from 'firebase/firestore';
import { db } from '../config/firebase';

const display = (value: any): string => {
  if (value === undefined) return '(not set)';
  if (value === null) return '(blank / unknown)';
  if (value?.toDate) return value.toDate().toLocaleString();
  if (typeof value === 'object') return JSON.stringify(value, (_key, item) => item?.toDate ? item.toDate().toISOString() : item, 2);
  return String(value);
};

const FundraisingAuditHistory: React.FC<{ targetPath?: string }> = ({ targetPath }) => {
  const [records, setRecords] = useState<QueryDocumentSnapshot[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [more, setMore] = useState(false);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<QueryDocumentSnapshot | null>(null);
  const [snapshots, setSnapshots] = useState<{ before: any; after: any } | null>(null);
  const [currentLineage, setCurrentLineage] = useState<Record<string, any> | null>(null);
  const load = async (append = false) => {
    setLoading(true); setError('');
    try {
      const constraints = [...(targetPath ? [where('targetPath', '==', targetPath)] : []), orderBy('occurredAt', 'desc'), ...(append && records.length ? [startAfter(records[records.length - 1])] : []), limit(50)];
      const result = await getDocs(query(collection(db, 'fundraisingAuditLogs'), ...constraints));
      setRecords((current) => append ? [...current, ...result.docs] : result.docs); setMore(result.size === 50);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not load audit history.'); }
    finally { setLoading(false); }
  };
  useEffect(() => {
    let active = true;
    setRecords([]); setSelected(null); setSnapshots(null); setLoading(true); setError('');
    setCurrentLineage(null);
    if (targetPath) getDoc(doc(db, targetPath)).then((record) => {
      if (active && record.exists()) {
        const data = record.data();
        setCurrentLineage(Object.fromEntries(['donorId', 'pledgeId', 'eventId', 'sourceCampaignEntryId', 'sourceImportKey', 'openBalanceSource'].filter((key) => data[key] !== undefined).map((key) => [key, data[key]])));
      }
    }).catch((cause) => { if (active) setError(cause.message); });
    const constraints = [...(targetPath ? [where('targetPath', '==', targetPath)] : []), orderBy('occurredAt', 'desc'), limit(50)];
    getDocs(query(collection(db, 'fundraisingAuditLogs'), ...constraints)).then((result) => { if (active) { setRecords(result.docs); setMore(result.size === 50); } }).catch((cause) => { if (active) setError(cause.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [targetPath]);
  useEffect(() => {
    let active = true;
    setSnapshots(null);
    if (selected) Promise.all(['before', 'after'].map((version) => getDoc(doc(selected.ref, 'snapshots', version))))
      .then(([before, after]) => { if (active) setSnapshots({ before: before.data() || {}, after: after.data() || {} }); })
      .catch((cause) => { if (active) setError(cause.message || 'Could not load change details.'); });
    return () => { active = false; };
  }, [selected]);
  const open = (record: QueryDocumentSnapshot) => { setSelected(record); setSnapshots(null); setError(''); };
  const visible = records.filter((record) => { const data = record.data(); return [data.actorName, data.actorEmail, data.targetLabel, data.targetPath, data.action, ...(data.changedFields || [])].join(' ').toLowerCase().includes(search.toLowerCase()); });
  return <section className="panel full">
    <div className="panel-head"><div><h3>Audit &amp; data lineage</h3><p className="muted small">Read-only server history from deployment onward. Financial snapshots describe changes, not additional donations. Imported balances are not proof of money received.</p></div><button type="button" className="secondary-btn" disabled={loading} onClick={() => load()}>Refresh history</button></div>
    <label><span>Search loaded history by person, record, action, or field</span><input value={search} onChange={(event) => setSearch(event.target.value)} /></label>
    {error && <p role="alert" className="error-message">{error}</p>}{loading && <p>Loading audit history…</p>}
    {currentLineage && Object.keys(currentLineage).length > 0 && <details><summary>Current record source and lineage</summary><pre style={{ whiteSpace: 'pre-wrap' }}>{display(currentLineage)}</pre><p className="muted small">Current source metadata, not a reconstruction of past changes.</p></details>}
    {!loading && !records.length && <p className="muted">No audit entries yet. Past changes are not reconstructed; new changes may take a moment to appear.</p>}
    <div className="table-scroll"><table className="report-table"><thead><tr><th>When</th><th>Changed by</th><th>Record / action</th><th>Changed fields</th><th>Details</th></tr></thead><tbody>{visible.map((record) => { const data = record.data(); return <tr key={record.id}><td>{display(data.occurredAt)}</td><td>{data.actorName}<br /><small>{data.actorEmail}</small></td><td>{data.targetLabel}<br /><small>{data.targetCollection} · {data.action}</small></td><td>{data.changedFields.join(', ')}</td><td><button type="button" className="secondary-btn" onClick={() => open(record)}>View changes</button></td></tr>; })}</tbody></table></div>
    <p className="muted small">Showing {visible.length} of {records.length} loaded entries, newest first.</p>{more && <button type="button" className="secondary-btn" disabled={loading} onClick={() => load(true)}>Load older history</button>}
    {selected && <section className="panel"><div className="panel-head"><h3>Change details</h3><button type="button" className="link-btn" onClick={() => setSelected(null)}>Close details</button></div>
      <p>{selected.data().actorName} · {display(selected.data().occurredAt)} · {selected.data().action}</p><p className="muted small">Identity: {selected.data().attribution}. Record: {selected.data().targetPath}. Audit ID: {selected.id}.</p>
      <h4>Dollar-value context</h4><div className="table-scroll"><table className="report-table"><thead><tr><th>Before</th><th>After</th></tr></thead><tbody><tr><td><pre>{display(selected.data().beforeAmounts)}</pre></td><td><pre>{display(selected.data().afterAmounts)}</pre></td></tr></tbody></table></div>
      <h4>Source and linked records</h4><div className="table-scroll"><table className="report-table"><thead><tr><th>Before</th><th>After</th></tr></thead><tbody><tr><td><pre>{display(selected.data().beforeLineage)}</pre></td><td><pre>{display(selected.data().afterLineage)}</pre></td></tr></tbody></table></div>
      {selected.data().relatedLineage && Object.keys(selected.data().relatedLineage).length > 0 && <details><summary>Related pledge source at audit processing time</summary><pre>{display(selected.data().relatedLineage)}</pre></details>}
      {!snapshots ? <p>Loading original values…</p> : <div className="table-scroll"><table className="report-table"><thead><tr><th>Field</th><th>Before</th><th>After</th></tr></thead><tbody>{selected.data().changedFields.map((field: string) => <tr key={field}><th>{field}</th><td><pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', maxWidth: 450 }}>{display(snapshots.before[field])}</pre></td><td><pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', maxWidth: 450 }}>{display(snapshots.after[field])}</pre></td></tr>)}</tbody></table></div>}
    </section>}
  </section>;
};

export default FundraisingAuditHistory;

export const FundraisingRecordAudit: React.FC<{ targetPath: string }> = ({ targetPath }) => {
  const [open, setOpen] = useState(false);
  return <section className="full"><button type="button" className="secondary-btn" onClick={() => setOpen(!open)}>{open ? 'Hide audit history' : 'View record audit & lineage'}</button>{open && <FundraisingAuditHistory targetPath={targetPath} />}</section>;
};
