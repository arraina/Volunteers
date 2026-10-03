import React, { useEffect, useMemo, useState } from 'react';
import { TempleEvent } from '../helpers/types';
import { CampaignSummary, donorDuplicateKeys, FundraisingDonor, loadCampaignSummaries, saveFundraisingDonor, subscribeFundraisingDonors } from '../helpers/fundraisingCrm';

const blankDonor = (): FundraisingDonor => ({ id: '', firstName: '', lastName: '', email: '', phone: '', organization: '', address: '', status: 'active', tags: [], notes: '', nextFollowUp: null, assignedTo: '', archived: false, createdAt: null, updatedAt: null });
const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const dateValue = (date: Date | null) => date ? date.toISOString().slice(0, 10) : '';

const FundraisingCrm: React.FC<{ events: TempleEvent[]; uid?: string; setError: (message: string) => void }> = ({ events, uid, setError }) => {
  const [donors, setDonors] = useState<FundraisingDonor[]>([]);
  const [campaigns, setCampaigns] = useState<CampaignSummary[]>([]);
  const [view, setView] = useState<'donors' | 'campaigns' | 'followups' | 'reports'>('donors');
  const [editing, setEditing] = useState<FundraisingDonor | null>(null);
  const [search, setSearch] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => subscribeFundraisingDonors(setDonors, (error) => setError(error.message)), [setError]);
  useEffect(() => { loadCampaignSummaries(Object.fromEntries(events.map((event) => [event.id, event.name]))).then(setCampaigns).catch((error) => setError(error.message)); }, [events, setError]);

  const duplicateIds = useMemo(() => {
    const seen = new Map<string, string[]>();
    donors.filter((donor) => !donor.archived).forEach((donor) => donorDuplicateKeys(donor).forEach((key) => seen.set(key, [...(seen.get(key) || []), donor.id])));
    return new Set(Array.from(seen.values()).filter((ids) => ids.length > 1).flat());
  }, [donors]);
  const filtered = donors.filter((donor) => (showArchived || !donor.archived) && `${donor.firstName} ${donor.lastName} ${donor.email} ${donor.phone} ${donor.organization} ${donor.address} ${donor.tags.join(' ')}`.toLowerCase().includes(search.toLowerCase()));
  const followups = donors.filter((donor) => !donor.archived && donor.nextFollowUp).sort((a, b) => Number(a.nextFollowUp) - Number(b.nextFollowUp));
  const totals = campaigns.reduce((result, campaign) => ({ current: result.current + campaign.current, target: result.target + campaign.target, pledges: result.pledges + campaign.pledges, donations: result.donations + campaign.donations, loans: result.loans + campaign.loans }), { current: 0, target: 0, pledges: 0, donations: 0, loans: 0 });

  const save = async () => {
    if (!editing?.firstName.trim() && !editing?.organization.trim()) return setError('Enter a first name or organization name.');
    if (editing.email && !/^\S+@\S+\.\S+$/.test(editing.email)) return setError('Enter a valid email address or leave it blank.');
    const keys = donorDuplicateKeys(editing);
    const duplicate = donors.find((donor) => donor.id !== editing.id && !donor.archived && donorDuplicateKeys(donor).some((key) => keys.includes(key)));
    if (duplicate && !window.confirm(`Possible duplicate: ${duplicate.firstName} ${duplicate.lastName}. Save this donor anyway?`)) return;
    setSaving(true); setError(''); setMessage('');
    try { await saveFundraisingDonor(editing, uid); setEditing(null); setMessage('Donor profile saved.'); }
    catch (error) { setError(error instanceof Error ? error.message : 'Could not save donor.'); }
    finally { setSaving(false); }
  };

  return <div className="fundraising-crm">
    <section className="fundraising-crm-summary">
      <div><span>Donors</span><strong>{donors.filter((donor) => !donor.archived).length}</strong></div>
      <div><span>Raised & pledged</span><strong>{money.format(totals.current)}</strong></div>
      <div><span>Open follow-ups</span><strong>{followups.length}</strong></div>
      <div className={duplicateIds.size ? 'attention' : ''}><span>Possible duplicates</span><strong>{duplicateIds.size}</strong></div>
    </section>
    <nav className="fundraising-crm-tabs" aria-label="Fundraising CRM sections">
      <button className={view === 'donors' ? 'active' : ''} onClick={() => setView('donors')}>Donors</button>
      <button className={view === 'campaigns' ? 'active' : ''} onClick={() => setView('campaigns')}>Campaigns</button>
      <button className={view === 'followups' ? 'active' : ''} onClick={() => setView('followups')}>Stewardship</button>
      <button className={view === 'reports' ? 'active' : ''} onClick={() => setView('reports')}>Reports</button>
    </nav>
    {message && <div className="success-message">{message}</div>}
    {view === 'donors' && <section className="panel">
      <div className="panel-head"><div><h2>Donor CRM</h2><p className="muted small">Contact details, ownership, notes, tags, and next follow-up.</p></div><button className="primary-btn" onClick={() => setEditing(blankDonor())}>Add donor</button></div>
      <div className="fundraising-crm-filters"><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search donors, contact details, or tags" /><label><input type="checkbox" checked={showArchived} onChange={(event) => setShowArchived(event.target.checked)} /> Show archived</label></div>
      <div className="fundraising-crm-list">
        {filtered.map((donor) => <button className="fundraising-donor-card" onClick={() => setEditing({ ...donor })} key={donor.id}>
          <span><strong>{[donor.firstName, donor.lastName].filter(Boolean).join(' ') || donor.organization}</strong>{donor.organization && <small>{donor.organization}</small>}</span>
          <span>{donor.email || donor.phone || 'No contact information'}</span><span className="status-pill">{donor.status}</span>{duplicateIds.has(donor.id) && <b>Possible duplicate</b>}
        </button>)}
        {!filtered.length && <div className="empty-state"><strong>No donors found</strong><span>Add a donor or change the search.</span></div>}
      </div>
    </section>}
    {view === 'campaigns' && <section className="panel"><div className="panel-head"><div><h2>Campaigns</h2><p className="muted small">Live totals from the existing fundraising dashboards.</p></div></div><div className="fundraising-campaign-list">{campaigns.map((campaign) => <article key={campaign.eventId}><div><strong>{campaign.name}</strong><span>{campaign.donorCount} entries · {campaign.locked ? 'Frozen' : 'Open'}</span></div><b>{money.format(campaign.current)}</b><small>of {money.format(campaign.target)} target</small></article>)}</div></section>}
    {view === 'followups' && <section className="panel"><div className="panel-head"><div><h2>Stewardship</h2><p className="muted small">Upcoming donor calls, acknowledgements, and follow-ups.</p></div></div><div className="fundraising-followups">{followups.map((donor) => <button onClick={() => { setView('donors'); setEditing({ ...donor }); }} key={donor.id}><span><strong>{donor.firstName} {donor.lastName}</strong><small>{donor.assignedTo ? `Assigned to ${donor.assignedTo}` : 'Unassigned'}</small></span><b>{donor.nextFollowUp?.toLocaleDateString()}</b></button>)}{!followups.length && <div className="empty-state"><strong>No follow-ups scheduled</strong><span>Add a date to a donor profile.</span></div>}</div></section>}
    {view === 'reports' && <section className="panel"><div className="panel-head"><div><h2>Fundraising reports</h2><p className="muted small">Summary across all saved event campaigns.</p></div></div><div className="fundraising-report-grid"><div><span>Total target</span><strong>{money.format(totals.target)}</strong></div><div><span>Donations</span><strong>{money.format(totals.donations)}</strong></div><div><span>Pledges</span><strong>{money.format(totals.pledges)}</strong></div><div><span>Loans</span><strong>{money.format(totals.loans)}</strong></div><div><span>Overall progress</span><strong>{totals.target ? Math.round(totals.current / totals.target * 100) : 0}%</strong></div></div></section>}
    {editing && <div className="modal-backdrop"><section className="panel fundraising-donor-editor" role="dialog" aria-modal="true" aria-label="Donor profile"><div className="panel-head"><h2>{editing.id ? 'Edit donor' : 'Add donor'}</h2><button className="link-btn" onClick={() => setEditing(null)}>Close</button></div><div className="fundraising-donor-form">
      <label><span>First name</span><input value={editing.firstName} onChange={(event) => setEditing({ ...editing, firstName: event.target.value })} /></label><label><span>Last name</span><input value={editing.lastName} onChange={(event) => setEditing({ ...editing, lastName: event.target.value })} /></label>
      <label><span>Organization</span><input value={editing.organization} onChange={(event) => setEditing({ ...editing, organization: event.target.value })} /></label><label><span>Status</span><select value={editing.status} onChange={(event) => setEditing({ ...editing, status: event.target.value as FundraisingDonor['status'] })}><option value="active">Active</option><option value="prospect">Prospect</option><option value="inactive">Inactive</option></select></label>
      <label><span>Email</span><input type="email" value={editing.email} onChange={(event) => setEditing({ ...editing, email: event.target.value })} /></label><label><span>Phone</span><input type="tel" value={editing.phone} onChange={(event) => setEditing({ ...editing, phone: event.target.value })} /></label>
      <label className="full"><span>Address (optional)</span><textarea rows={3} value={editing.address} onChange={(event) => setEditing({ ...editing, address: event.target.value })} placeholder="Street address, city, state, ZIP code" /></label>
      <label><span>Tags (comma separated)</span><input value={editing.tags.join(', ')} onChange={(event) => setEditing({ ...editing, tags: event.target.value.split(',') })} /></label><label><span>Assigned fundraiser</span><input value={editing.assignedTo} onChange={(event) => setEditing({ ...editing, assignedTo: event.target.value })} /></label>
      <label><span>Next follow-up</span><input type="date" value={dateValue(editing.nextFollowUp)} onChange={(event) => setEditing({ ...editing, nextFollowUp: event.target.value ? new Date(`${event.target.value}T12:00:00`) : null })} /></label><label className="checkbox-label"><input type="checkbox" checked={editing.archived} onChange={(event) => setEditing({ ...editing, archived: event.target.checked })} /> Archive this donor</label>
      <label className="full"><span>Private stewardship notes</span><textarea rows={5} value={editing.notes} onChange={(event) => setEditing({ ...editing, notes: event.target.value })} /></label>
    </div><div className="modal-actions"><button className="secondary-btn" onClick={() => setEditing(null)}>Cancel</button><button className="primary-btn" disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save donor'}</button></div></section></div>}
  </div>;
};

export default FundraisingCrm;
