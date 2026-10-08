import React, { useEffect, useState } from 'react';
import { addDonorInteraction, DonorContactInteraction, FundraisingPledge } from '../helpers/fundraisingCrm';
import { PledgeFollowUp, savePledgeFollowUp, setPledgeFollowUpStatus, subscribePledgeFollowUps } from '../helpers/pledgeFollowUps';
import { fromEasternDateTimeInput, toEasternDateTimeInput } from '../helpers/taskDateTime';
import { FundraisingRecordAudit } from './FundraisingAuditHistory';

const dateLabel = (date: Date) => date.toLocaleString('en-US', { timeZone: 'America/New_York' });

const PledgeFollowUpPanel: React.FC<{ pledge?: FundraisingPledge; uid?: string; contacts?: DonorContactInteraction[]; onOpenPledge?: (id: string) => void }> = ({ pledge, uid, contacts = [], onOpenPledge }) => {
  const [records, setRecords] = useState<PledgeFollowUp[]>([]);
  const [error, setError] = useState(''); const [message, setMessage] = useState(''); const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<PledgeFollowUp | null>(null);
  const [kind, setKind] = useState<'task' | 'reminder'>('task'); const [title, setTitle] = useState(''); const [details, setDetails] = useState('');
  const [due, setDue] = useState(''); const [assignee, setAssignee] = useState(''); const [showCompleted, setShowCompleted] = useState(false);
  const [contactTime, setContactTime] = useState(toEasternDateTimeInput(new Date())); const [method, setMethod] = useState('phone');
  const [outcome, setOutcome] = useState('connected'); const [contactedBy, setContactedBy] = useState(''); const [notes, setNotes] = useState('');
  const recordId = pledge?.id; const inPledge = !!pledge;
  useEffect(() => {
    if (inPledge && (!recordId || recordId.startsWith('dashboard:'))) { setRecords([]); return; }
    return subscribePledgeFollowUps(recordId, setRecords, (cause) => setError(cause.message));
  }, [recordId, inPledge]);
  const saved = !!pledge?.id && !pledge.id.startsWith('dashboard:') && !!pledge.donorId;
  const writable = saved && pledge?.status !== 'cancelled';
  const reset = () => { setEditing(null); setTitle(''); setDetails(''); setDue(''); setAssignee(''); setKind('task'); };
  const run = async (work: () => Promise<void>, success: string) => {
    setBusy(true); setError(''); setMessage('');
    try { await work(); setMessage(success); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save this change.'); }
    finally { setBusy(false); }
  };
  const save = () => run(async () => {
    if (!pledge || !uid || !writable) throw new Error('Save and link an active pledge first.');
    await savePledgeFollowUp({ id: editing?.id || '', pledgeId: pledge.id, donorId: pledge.donorId, donorName: [pledge.donorFirstName, pledge.donorLastName].filter(Boolean).join(' '), kind, title, details, dueAt: fromEasternDateTimeInput(due), assignedTo: assignee }, uid);
    reset();
  }, 'Pledge follow-up saved.');
  const contact = () => run(async () => {
    if (!pledge || !uid || !saved || !notes.trim()) throw new Error('Save and link the pledge, and enter contact notes.');
    await addDonorInteraction(pledge.donorId, fromEasternDateTimeInput(contactTime), notes, uid, { pledgeId: pledge.id, method, outcome, contactedBy: contactedBy.trim() });
    setNotes(''); setContactTime(toEasternDateTimeInput(new Date()));
  }, 'Contact recorded in pledge and donor history.');
  return <section className="panel full">
    <h3>{pledge ? 'Pledge tasks, reminders & contact history' : 'Pledge follow-ups'}</h3>
    <p className="muted small">Private fundraising follow-ups. In-app reminders are highlighted when due; they do not send WhatsApp or email. All dates and times are Eastern.</p>
    {error && <p className="error-message" role="alert">{error}</p>}{message && <p className="success-message" role="status">{message}</p>}
    {pledge && !saved && <p>Save this pledge and link a donor before adding tasks or contact history.</p>}
    {writable && <div className="fundraising-donor-form">
      <h4 className="full">{editing ? 'Edit follow-up' : 'Create a task or reminder'}</h4>
      <label><span>Type</span><select value={kind} onChange={(event) => setKind(event.target.value as 'task' | 'reminder')}><option value="task">To-do task</option><option value="reminder">Reminder</option></select></label>
      <label><span>Title *</span><input maxLength={180} value={title} onChange={(event) => setTitle(event.target.value)} /></label>
      <label><span>Due date and time (Eastern) *</span><input type="datetime-local" value={due} onChange={(event) => setDue(event.target.value)} /></label>
      <label><span>Assigned fundraiser</span><input list="fundraising-admin-name-options" value={assignee} onChange={(event) => setAssignee(event.target.value)} placeholder="Choose admin or enter a name" /></label>
      <label className="full"><span>Details</span><textarea rows={4} maxLength={5000} value={details} onChange={(event) => setDetails(event.target.value)} /></label>
      <div className="full row"><button type="button" className="primary-btn" disabled={busy || !title.trim() || !due} onClick={save}>{editing ? 'Save follow-up changes' : 'Create follow-up'}</button>{editing && <button type="button" className="secondary-btn" onClick={reset}>Cancel edit</button>}</div>
    </div>}
    <label className="checkbox-label"><input type="checkbox" checked={showCompleted} onChange={(event) => setShowCompleted(event.target.checked)} /> Show completed follow-ups</label>
    {records.filter((item) => showCompleted || item.status !== 'completed').map((item) => <article className="panel" key={item.id}>
      <strong>{item.title}</strong><p>{item.kind} · {item.status} · {item.donorName}</p><p>{dateLabel(item.dueAt)} · {item.assignedTo || 'Unassigned'}{item.status === 'open' && item.dueAt < new Date() ? ' · DUE / OVERDUE' : ''}</p><p style={{ whiteSpace: 'pre-wrap' }}>{item.details}</p>
      <div className="row"><button type="button" className="secondary-btn" disabled={busy || !uid} onClick={() => run(() => setPledgeFollowUpStatus(item, item.status !== 'completed', uid!), 'Follow-up status updated.')}>{item.status === 'completed' ? 'Reopen' : 'Mark completed'}</button>
      {writable && <button type="button" className="secondary-btn" onClick={() => { setEditing(item); setKind(item.kind); setTitle(item.title); setDetails(item.details); setDue(toEasternDateTimeInput(item.dueAt)); setAssignee(item.assignedTo); }}>Edit follow-up</button>}
      {onOpenPledge && <button type="button" className="secondary-btn" onClick={() => onOpenPledge(item.pledgeId)}>Open pledge</button>}</div>
      <FundraisingRecordAudit targetPath={`fundraisingPledgeFollowUps/${item.id}`} />
    </article>)}
    {!records.some((item) => showCompleted || item.status !== 'completed') && <p className="muted">No {showCompleted ? '' : 'open '}follow-ups.</p>}
    {saved && pledge && <>
      <h4>Record donor contact for this pledge</h4><div className="fundraising-donor-form">
        <label><span>Contact date and time (Eastern) *</span><input type="datetime-local" max={toEasternDateTimeInput(new Date())} value={contactTime} onChange={(event) => setContactTime(event.target.value)} /></label>
        <label><span>Contact method</span><select value={method} onChange={(event) => setMethod(event.target.value)}>{['phone', 'email', 'whatsapp', 'in-person', 'other'].map(value => <option key={value} value={value}>{value}</option>)}</select></label>
        <label><span>Contacted by</span><input list="fundraising-admin-name-options" value={contactedBy} onChange={(event) => setContactedBy(event.target.value)} placeholder="Choose admin or enter a name" /></label>
        <label><span>Outcome</span><select value={outcome} onChange={(event) => setOutcome(event.target.value)}>{['connected', 'no-answer', 'message-left', 'follow-up-needed', 'other'].map(value => <option key={value} value={value}>{value}</option>)}</select></label>
        <label className="full"><span>Contact notes *</span><textarea rows={4} maxLength={5000} value={notes} onChange={(event) => setNotes(event.target.value)} /></label>
        <button type="button" className="primary-btn" disabled={busy || !notes.trim() || !contactTime} onClick={contact}>Record pledge contact</button>
      </div><h4>Contact history for this pledge</h4>
      {contacts.filter(item => item.pledgeId === pledge.id).map(item => <article className="panel" key={item.id}><strong>{dateLabel(item.calledAt)} · {item.method || 'phone'}</strong><p>{item.contactedBy || 'No contact-person name entered'} · {item.outcome || 'No outcome entered'}</p><p style={{ whiteSpace: 'pre-wrap' }}>{item.notes}</p><FundraisingRecordAudit targetPath={`fundraisingDonorInteractions/${item.id}`} /></article>)}
      {!contacts.some(item => item.pledgeId === pledge.id) && <p className="muted">No contacts recorded for this pledge. General donor notes are available in the full donor record.</p>}
    </>}
  </section>;
};
export default PledgeFollowUpPanel;
