import React, { useEffect, useMemo, useState } from 'react';
import { TempleEvent } from '../helpers/types';
import { CampaignSummary, donorDuplicateKeys, FundraisingDonor, FundraisingPledge, loadCampaignSummaries, saveFundraisingDonor, saveFundraisingPledge, subscribeFundraisingDonors, subscribeFundraisingPledges } from '../helpers/fundraisingCrm';
import { isAiConfigured, parseDonorQuestion } from '../helpers/ai';
import QuickBooksReports from './QuickBooksReports';

const blankDonor = (): FundraisingDonor => ({ id: '', firstName: '', lastName: '', initiatedName: '', email: '', phone: '', organization: '', address: '', status: 'active', tags: [], notes: '', nextFollowUp: null, assignedTo: '', archived: false, createdAt: null, updatedAt: null });
const blankPledge = (): FundraisingPledge => ({ id: '', donorId: '', eventId: '', pledgedAmount: 0, paidAmount: 0, dueDate: null, notes: '', createdAt: null, updatedAt: null });
const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const dateValue = (date: Date | null) => date ? date.toISOString().slice(0, 10) : '';
const csvCell = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
const donorName = (donor?: FundraisingDonor) => donor ? [donor.firstName, donor.lastName].filter(Boolean).join(' ') || donor.organization : 'Unknown donor';
const duplicateText = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9]/g, '');

function possibleDuplicateKeys(donor: FundraisingDonor): string[] {
  const keys = donorDuplicateKeys(donor);
  const legalName = duplicateText(`${donor.firstName} ${donor.lastName}`);
  const initiatedName = duplicateText(donor.initiatedName);
  if (legalName.length >= 5) keys.push(`name:${legalName}`);
  if (initiatedName.length >= 5) keys.push(`initiated:${initiatedName}`);
  return Array.from(new Set(keys));
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = []; let cell = ''; let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]; const next = text[index + 1];
    if (char === '"' && quoted && next === '"') { cell += '"'; index += 1; }
    else if (char === '"') quoted = !quoted;
    else if (char === ',' && !quoted) { row.push(cell.trim()); cell = ''; }
    else if ((char === '\n' || char === '\r') && !quoted) { if (char === '\r' && next === '\n') index += 1; row.push(cell.trim()); if (row.some(Boolean)) rows.push(row); row = []; cell = ''; }
    else cell += char;
  }
  row.push(cell.trim()); if (row.some(Boolean)) rows.push(row); return rows;
}

const normalizeCsvHeader = (header: string) => header.replace(/^\uFEFF/, '').toLowerCase().replace(/[^a-z0-9]/g, '');

function csvDate(value: string): Date | null {
  if (!value.trim()) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function csvBoolean(value: string): boolean {
  return ['true', 'yes', 'y', '1', 'archived'].includes(value.trim().toLowerCase());
}

const FundraisingCrm: React.FC<{ events: TempleEvent[]; uid?: string; setError: (message: string) => void }> = ({ events, uid, setError }) => {
  const [donors, setDonors] = useState<FundraisingDonor[]>([]);
  const [campaigns, setCampaigns] = useState<CampaignSummary[]>([]);
  const [pledges, setPledges] = useState<FundraisingPledge[]>([]);
  const [view, setView] = useState<'donors' | 'pledges' | 'campaigns' | 'followups' | 'reports'>('donors');
  const [editing, setEditing] = useState<FundraisingDonor | null>(null);
  const [editingPledge, setEditingPledge] = useState<FundraisingPledge | null>(null);
  const [search, setSearch] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [donorDisplayLimit, setDonorDisplayLimit] = useState(100);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [donorLoadComplete, setDonorLoadComplete] = useState(false);
  const [donorRefresh, setDonorRefresh] = useState(0);
  const [donorQuestion, setDonorQuestion] = useState('');
  const [donorAnswer, setDonorAnswer] = useState('');
  const [donorQueryResults, setDonorQueryResults] = useState<FundraisingDonor[]>([]);
  const [donorQueryLoading, setDonorQueryLoading] = useState(false);

  useEffect(() => {
    setDonors([]); setDonorLoadComplete(false);
    return subscribeFundraisingDonors((records, complete) => { setDonors(records); setDonorLoadComplete(complete); }, (error) => setError(error.message));
  }, [setError, donorRefresh]);
  useEffect(() => subscribeFundraisingPledges(setPledges, (error) => setError(error.message)), [setError]);
  useEffect(() => { loadCampaignSummaries(Object.fromEntries(events.map((event) => [event.id, event.name]))).then(setCampaigns).catch((error) => setError(error.message)); }, [events, setError]);

  const duplicateIds = useMemo(() => {
    const seen = new Map<string, string[]>();
    donors.filter((donor) => !donor.archived).forEach((donor) => possibleDuplicateKeys(donor).forEach((key) => seen.set(key, [...(seen.get(key) || []), donor.id])));
    return new Set(Array.from(seen.values()).filter((ids) => ids.length > 1).flat());
  }, [donors]);
  const filtered = donors.filter((donor) => (showArchived || !donor.archived) && `${donor.firstName} ${donor.lastName} ${donor.initiatedName} ${donor.email} ${donor.phone} ${donor.organization} ${donor.address} ${donor.tags.join(' ')}`.toLowerCase().includes(search.toLowerCase()));
  const visibleDonors = filtered.slice(0, donorDisplayLimit);
  const followups = donors.filter((donor) => !donor.archived && donor.nextFollowUp).sort((a, b) => Number(a.nextFollowUp) - Number(b.nextFollowUp));
  const totals = campaigns.reduce((result, campaign) => ({ current: result.current + campaign.current, target: result.target + campaign.target, pledges: result.pledges + campaign.pledges, donations: result.donations + campaign.donations, loans: result.loans + campaign.loans }), { current: 0, target: 0, pledges: 0, donations: 0, loans: 0 });
  const pledgeTotals = pledges.reduce((total, pledge) => ({ pledged: total.pledged + pledge.pledgedAmount, paid: total.paid + pledge.paidAmount }), { pledged: 0, paid: 0 });

  const save = async () => {
    if (!editing?.firstName.trim() && !editing?.organization.trim()) return setError('Enter a first name or organization name.');
    if (editing.email && !/^\S+@\S+\.\S+$/.test(editing.email)) return setError('Enter a valid email address or leave it blank.');
    const keys = possibleDuplicateKeys(editing);
    const duplicate = donors.find((donor) => donor.id !== editing.id && !donor.archived && possibleDuplicateKeys(donor).some((key) => keys.includes(key)));
    if (duplicate && !window.confirm(`Possible duplicate: ${duplicate.firstName} ${duplicate.lastName}. Save this donor anyway?`)) return;
    setSaving(true); setError(''); setMessage('');
    try { await saveFundraisingDonor(editing, uid); setEditing(null); setMessage('Donor profile saved.'); setDonorRefresh((value) => value + 1); }
    catch (error) { setError(error instanceof Error ? error.message : 'Could not save donor.'); }
    finally { setSaving(false); }
  };

  const setDonorArchived = async (donor: FundraisingDonor, archived: boolean) => {
    const action = archived ? 'remove' : 'restore';
    if (archived && !window.confirm(`Remove ${donorName(donor)} from the active donor list? The record and fundraising history will be preserved.`)) return;
    setSaving(true); setError(''); setMessage('');
    try {
      await saveFundraisingDonor({ ...donor, archived }, uid);
      setMessage(`${donorName(donor)} was ${action === 'remove' ? 'removed from the active donor list' : 'restored'}.`);
      setDonorRefresh((value) => value + 1);
    } catch (error) { setError(error instanceof Error ? error.message : `Could not ${action} donor.`); }
    finally { setSaving(false); }
  };

  const importDonors = async (file: File) => {
    setSaving(true); setError(''); setMessage('');
    try {
      const rows = parseCsv(await file.text());
      if (rows.length < 2) throw new Error('The CSV must contain a header row and at least one donor.');
      const headers = rows[0].map(normalizeCsvHeader);
      const column = (...names: string[]) => headers.findIndex((header) => names.includes(header));
      const columns = {
        firstName: column('firstname', 'first', 'givenname'),
        lastName: column('lastname', 'last', 'surname', 'familyname'),
        initiatedName: column('initiatedname', 'spiritualname', 'devotionalname'),
        organization: column('organization', 'organisation', 'company', 'companyname'),
        email: column('email', 'emailaddress', 'emailid'),
        phone: column('phone', 'phonenumber', 'mobile', 'mobilenumber', 'cell', 'cellphone'),
        address: column('address', 'mailingaddress', 'fulladdress'),
        street: column('street', 'streetaddress', 'address1', 'addressline1'),
        city: column('city', 'town'),
        state: column('state', 'province', 'region'),
        postalCode: column('zip', 'zipcode', 'postalcode', 'postcode'),
        status: column('status', 'donorstatus'),
        tags: column('tags', 'tag', 'categories', 'category'),
        assignedTo: column('assignedfundraiser', 'assignedto', 'owner', 'fundraiser'),
        nextFollowUp: column('nextfollowup', 'followupdate', 'nextfollowupdate'),
        notes: column('notes', 'comments', 'comment'),
        archived: column('archived', 'isarchived'),
      };
      const firstIndex = columns.firstName; const organizationIndex = columns.organization;
      if (firstIndex < 0 && organizationIndex < 0) throw new Error('CSV requires a First Name or Organization column.');
      const existingKeys = new Set(donors.flatMap(donorDuplicateKeys)); let imported = 0; let skipped = 0;
      for (const row of rows.slice(1, 501)) {
        const value = (index: number) => index >= 0 ? String(row[index] || '').trim() : '';
        const directAddress = value(columns.address);
        const combinedAddress = [value(columns.street), value(columns.city), value(columns.state), value(columns.postalCode)].filter(Boolean).join(', ');
        const statusValue = value(columns.status).toLowerCase();
        const donor: FundraisingDonor = {
          ...blankDonor(), firstName: value(firstIndex), lastName: value(columns.lastName),
          initiatedName: value(columns.initiatedName), organization: value(organizationIndex),
          email: value(columns.email), phone: value(columns.phone), address: directAddress || combinedAddress,
          status: ['active', 'prospect', 'inactive'].includes(statusValue) ? statusValue as FundraisingDonor['status'] : 'active',
          tags: value(columns.tags).split(/[;,|]/).map((tag) => tag.trim()).filter(Boolean),
          assignedTo: value(columns.assignedTo), nextFollowUp: csvDate(value(columns.nextFollowUp)),
          notes: value(columns.notes), archived: csvBoolean(value(columns.archived)),
        };
        if (!donor.firstName && !donor.organization) { skipped += 1; continue; }
        const keys = donorDuplicateKeys(donor);
        if (keys.some((key) => existingKeys.has(key))) { skipped += 1; continue; }
        await saveFundraisingDonor(donor, uid); keys.forEach((key) => existingKeys.add(key)); imported += 1;
      }
      setMessage(`${imported} donor${imported === 1 ? '' : 's'} imported. Recognized donor fields were mapped; missing fields were left blank. ${skipped} skipped as duplicates or incomplete rows.`);
      setDonorRefresh((value) => value + 1);
    } catch (error) { setError(error instanceof Error ? error.message : 'Could not import donor CSV.'); }
    finally { setSaving(false); }
  };

  const exportDonors = () => {
    const contributionFor = (donor: FundraisingDonor, type: 'pledge' | 'loan' | 'donation') => {
      const name = `${donor.firstName} ${donor.lastName}`.trim().toLowerCase();
      return campaigns.flatMap((campaign) => campaign.entries).filter((entry) => `${entry.firstName} ${entry.lastName}`.trim().toLowerCase() === name && entry.type === type).reduce((sum, entry) => sum + entry.amount, 0);
    };
    const rows: unknown[][] = [['First name', 'Last name', 'Initiated name', 'Organization', 'Email', 'Phone', 'Address', 'Status', 'Tags', 'Assigned fundraiser', 'Next follow-up', 'Dashboard donations', 'Dashboard loans', 'Dashboard pledges', 'Tracked pledge amount', 'Pledge paid', 'Pledge remaining', 'Next pledge due', 'Notes']];
    donors.filter((donor) => !donor.archived).forEach((donor) => {
      const donorPledges = pledges.filter((pledge) => pledge.donorId === donor.id);
      const pledged = donorPledges.reduce((sum, pledge) => sum + pledge.pledgedAmount, 0); const paid = donorPledges.reduce((sum, pledge) => sum + pledge.paidAmount, 0);
      const dueDates = donorPledges.filter((pledge) => pledge.pledgedAmount > pledge.paidAmount && pledge.dueDate).map((pledge) => pledge.dueDate as Date).sort((a, b) => Number(a) - Number(b));
      rows.push([donor.firstName, donor.lastName, donor.initiatedName, donor.organization, donor.email, donor.phone, donor.address, donor.status, donor.tags.join('; '), donor.assignedTo, dateValue(donor.nextFollowUp), contributionFor(donor, 'donation'), contributionFor(donor, 'loan'), contributionFor(donor, 'pledge'), pledged, paid, Math.max(0, pledged - paid), dateValue(dueDates[0] || null), donor.notes]);
    });
    const url = URL.createObjectURL(new Blob([`\uFEFF${rows.map((row) => row.map(csvCell).join(',')).join('\r\n')}`], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = `fundraising-donors-${new Date().toISOString().slice(0, 10)}.csv`; document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url);
  };

  const askDonorAssistant = async () => {
    if (!donorQuestion.trim()) return;
    if (!donorLoadComplete) return setError('Please wait until the donor directory finishes loading before asking a question.');
    setDonorQueryLoading(true); setError(''); setDonorAnswer(''); setDonorQueryResults([]);
    try {
      const plan = await parseDonorQuestion(donorQuestion.trim());
      const now = new Date();
      const from = plan.dateFrom ? new Date(`${plan.dateFrom}T00:00:00`) : null;
      const to = plan.dateTo ? new Date(`${plan.dateTo}T23:59:59`) : null;
      const matched = donors.filter((donor) => {
        if (donor.archived) return false;
        const haystack = `${donor.firstName} ${donor.lastName} ${donor.initiatedName} ${donor.email} ${donor.phone} ${donor.organization} ${donor.address} ${donor.tags.join(' ')} ${donor.notes}`.toLowerCase();
        if (plan.terms.length && !plan.terms.every((term) => haystack.includes(term.toLowerCase()))) return false;
        if (plan.assignedFundraiser && !donor.assignedTo.toLowerCase().includes(plan.assignedFundraiser.toLowerCase())) return false;
        if (plan.status !== 'any' && donor.status !== plan.status) return false;
        if (plan.hasEmail === 'yes' && !donor.email) return false;
        if (plan.hasEmail === 'no' && donor.email) return false;
        if (plan.duplicatesOnly && !duplicateIds.has(donor.id)) return false;
        if (plan.followUp === 'missing' && donor.nextFollowUp) return false;
        if (plan.followUp === 'scheduled' && !donor.nextFollowUp) return false;
        if (plan.followUp === 'overdue' && (!donor.nextFollowUp || donor.nextFollowUp >= now)) return false;
        if (plan.followUp === 'upcoming' && (!donor.nextFollowUp || donor.nextFollowUp < now)) return false;
        if (from && (!donor.nextFollowUp || donor.nextFollowUp < from)) return false;
        if (to && (!donor.nextFollowUp || donor.nextFollowUp > to)) return false;
        return true;
      });
      setDonorAnswer(plan.intent === 'count' ? `${matched.length.toLocaleString()} donor${matched.length === 1 ? '' : 's'} matched your question.` : `${matched.length.toLocaleString()} donor${matched.length === 1 ? '' : 's'} matched. Showing up to ${plan.limit}.`);
      setDonorQueryResults(matched.slice(0, plan.limit));
    } catch (error) { setError(error instanceof Error ? error.message : 'The donor assistant could not answer that question.'); }
    finally { setDonorQueryLoading(false); }
  };

  const savePledge = async () => {
    if (!editingPledge?.donorId) return setError('Choose a donor.');
    if (editingPledge.pledgedAmount <= 0) return setError('Enter a pledged amount greater than zero.');
    if (editingPledge.paidAmount < 0 || editingPledge.paidAmount > editingPledge.pledgedAmount) return setError('Paid amount must be between zero and the pledged amount.');
    setSaving(true); setError(''); setMessage('');
    try { await saveFundraisingPledge(editingPledge, uid); setEditingPledge(null); setMessage('Pledge saved.'); }
    catch (error) { setError(error instanceof Error ? error.message : 'Could not save pledge.'); }
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
      <button className={view === 'pledges' ? 'active' : ''} onClick={() => setView('pledges')}>Pledges</button>
      <button className={view === 'campaigns' ? 'active' : ''} onClick={() => setView('campaigns')}>Campaigns</button>
      <button className={view === 'followups' ? 'active' : ''} onClick={() => setView('followups')}>Stewardship</button>
      <button className={view === 'reports' ? 'active' : ''} onClick={() => setView('reports')}>Reports</button>
    </nav>
    {message && <div className="success-message">{message}</div>}
    {view === 'donors' && <section className="panel">
      <div className="panel-head"><div><h2>Donor CRM</h2><p className="muted small">Contact details, ownership, notes, tags, and next follow-up.</p></div><div className="row"><label className="secondary-btn fundraising-import-btn">{saving ? 'Importing…' : 'Import donors'}<input type="file" accept=".csv,text/csv" disabled={saving} onChange={(event) => { const file = event.target.files?.[0]; if (file) importDonors(file); event.target.value = ''; }} /></label><button className="secondary-btn" onClick={exportDonors}>Export donor data</button><button className="primary-btn" onClick={() => setEditing(blankDonor())}>Add donor</button></div></div>
      <section className="fundraising-donor-assistant" aria-label="Donor assistant"><div><h3>Ask about donors</h3><p className="muted small">Gemini interprets your question; donor records stay in this authenticated page.</p></div><div className="fundraising-donor-question"><input value={donorQuestion} onChange={(event) => setDonorQuestion(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') askDonorAssistant(); }} placeholder="Example: Which donors assigned to Priya have an overdue follow-up?" /><button className="primary-btn" disabled={!isAiConfigured || !donorLoadComplete || donorQueryLoading} onClick={askDonorAssistant}>{donorQueryLoading ? 'Searching…' : 'Ask'}</button></div><p className="muted small">{donorLoadComplete ? `${donors.length.toLocaleString()} donor records ready to search.` : `Loading donor directory… ${donors.length.toLocaleString()} records available.`}</p>{donorAnswer && <div className="fundraising-donor-answer"><strong>{donorAnswer}</strong>{donorQueryResults.map((donor) => <button key={donor.id} onClick={() => setEditing({ ...donor })}><span><b>{donorName(donor)}</b><small>{donor.initiatedName || donor.email || donor.phone || 'No contact information'}</small></span><span><small>Assigned fundraiser</small><b>{donor.assignedTo || 'Unassigned'}</b></span><span><small>Next follow-up</small><b>{donor.nextFollowUp?.toLocaleDateString() || 'Not scheduled'}</b></span></button>)}</div>}</section>
      <div className="fundraising-crm-filters"><input value={search} onChange={(event) => { setSearch(event.target.value); setDonorDisplayLimit(100); }} placeholder="Search donors, contact details, or tags" /><label><input type="checkbox" checked={showArchived} onChange={(event) => { setShowArchived(event.target.checked); setDonorDisplayLimit(100); }} /> Show archived</label><span className="muted small">Showing {Math.min(visibleDonors.length, filtered.length).toLocaleString()} of {filtered.length.toLocaleString()} donors</span></div>
      <div className="fundraising-crm-list">
        {visibleDonors.map((donor) => <article className={`fundraising-donor-card${duplicateIds.has(donor.id) ? ' possible-duplicate' : ''}`} key={donor.id}>
          <span><strong>{[donor.firstName, donor.lastName].filter(Boolean).join(' ') || donor.organization}</strong>{donor.initiatedName && <small>{donor.initiatedName}</small>}{donor.organization && <small>{donor.organization}</small>}</span>
          <span>{donor.email || donor.phone || 'No contact information'}</span>
          <span className="fundraising-donor-ownership"><small>Assigned fundraiser</small><strong>{donor.assignedTo || 'Unassigned'}</strong><small>Next follow-up</small><strong>{donor.nextFollowUp ? donor.nextFollowUp.toLocaleDateString() : 'Not scheduled'}</strong></span>
          <div className="fundraising-donor-state"><span className="status-pill">{donor.archived ? 'Archived' : donor.status}</span>{duplicateIds.has(donor.id) && <b className="duplicate-warning">Possible duplicate</b>}</div>
          <div className="fundraising-donor-actions"><button className="secondary-btn" onClick={() => setEditing({ ...donor })}>Edit</button><button className={donor.archived ? 'secondary-btn' : 'danger-btn'} disabled={saving} onClick={() => setDonorArchived(donor, !donor.archived)}>{donor.archived ? 'Restore' : 'Remove'}</button></div>
        </article>)}
        {!filtered.length && <div className="empty-state"><strong>No donors found</strong><span>Add a donor or change the search.</span></div>}
        {visibleDonors.length < filtered.length && <button className="secondary-btn" onClick={() => setDonorDisplayLimit((limit) => limit + 100)}>Load 100 more donors</button>}
      </div>
    </section>}
    {view === 'pledges' && <section className="panel"><div className="panel-head"><div><h2>Pledge tracking</h2><p className="muted small">Track the original commitment, payments received, remaining balance, and due date.</p></div><button className="primary-btn" onClick={() => setEditingPledge(blankPledge())}>Add pledge</button></div>
      <div className="fundraising-report-grid fundraising-pledge-totals"><div><span>Total pledged</span><strong>{money.format(pledgeTotals.pledged)}</strong></div><div><span>Paid</span><strong>{money.format(pledgeTotals.paid)}</strong></div><div><span>Remaining</span><strong>{money.format(Math.max(0, pledgeTotals.pledged - pledgeTotals.paid))}</strong></div><div><span>Open pledges</span><strong>{pledges.filter((pledge) => pledge.paidAmount < pledge.pledgedAmount).length}</strong></div></div>
      <div className="fundraising-pledge-list">{pledges.map((pledge) => { const remaining = Math.max(0, pledge.pledgedAmount - pledge.paidAmount); const overdue = Boolean(remaining > 0 && pledge.dueDate && pledge.dueDate < new Date()); return <button className={overdue ? 'overdue' : ''} onClick={() => setEditingPledge({ ...pledge })} key={pledge.id}><span><strong>{donorName(donors.find((donor) => donor.id === pledge.donorId))}</strong><small>{events.find((event) => event.id === pledge.eventId)?.name || 'General pledge'}</small></span><span><small>Pledged</small><b>{money.format(pledge.pledgedAmount)}</b></span><span><small>Paid</small><b>{money.format(pledge.paidAmount)}</b></span><span><small>Remaining</small><b>{money.format(remaining)}</b></span><span><small>{overdue ? 'Overdue' : 'Due'}</small><b>{pledge.dueDate?.toLocaleDateString() || 'No date'}</b></span></button>; })}{!pledges.length && <div className="empty-state"><strong>No pledges tracked yet</strong><span>Add a pledge to begin tracking payments and due dates.</span></div>}</div>
    </section>}
    {view === 'campaigns' && <section className="panel"><div className="panel-head"><div><h2>Campaigns</h2><p className="muted small">Live totals from the existing fundraising dashboards.</p></div></div><div className="fundraising-campaign-list">{campaigns.map((campaign) => <article key={campaign.eventId}><div><strong>{campaign.name}</strong><span>{campaign.donorCount} entries · {campaign.locked ? 'Frozen' : 'Open'}</span></div><b>{money.format(campaign.current)}</b><small>of {money.format(campaign.target)} target</small></article>)}</div></section>}
    {view === 'followups' && <section className="panel"><div className="panel-head"><div><h2>Stewardship</h2><p className="muted small">Upcoming donor calls, acknowledgements, and follow-ups.</p></div></div><div className="fundraising-followups">{followups.map((donor) => <button onClick={() => { setView('donors'); setEditing({ ...donor }); }} key={donor.id}><span><strong>{donor.firstName} {donor.lastName}</strong><small>{donor.assignedTo ? `Assigned to ${donor.assignedTo}` : 'Unassigned'}</small></span><b>{donor.nextFollowUp?.toLocaleDateString()}</b></button>)}{!followups.length && <div className="empty-state"><strong>No follow-ups scheduled</strong><span>Add a date to a donor profile.</span></div>}</div></section>}
    {view === 'reports' && <><section className="panel"><div className="panel-head"><div><h2>Fundraising reports</h2><p className="muted small">Summary across all saved event campaigns.</p></div></div><div className="fundraising-report-grid"><div><span>Total target</span><strong>{money.format(totals.target)}</strong></div><div><span>Donations</span><strong>{money.format(totals.donations)}</strong></div><div><span>Pledges</span><strong>{money.format(totals.pledges)}</strong></div><div><span>Loans</span><strong>{money.format(totals.loans)}</strong></div><div><span>Overall progress</span><strong>{totals.target ? Math.round(totals.current / totals.target * 100) : 0}%</strong></div></div></section><QuickBooksReports setError={setError} /></>}
    {editing && <div className="modal-backdrop"><section className="panel fundraising-donor-editor" role="dialog" aria-modal="true" aria-label="Donor profile"><div className="panel-head"><h2>{editing.id ? 'Edit donor' : 'Add donor'}</h2><button className="link-btn" onClick={() => setEditing(null)}>Close</button></div><div className="fundraising-donor-form">
      <label><span>First name</span><input value={editing.firstName} onChange={(event) => setEditing({ ...editing, firstName: event.target.value })} /></label><label><span>Last name</span><input value={editing.lastName} onChange={(event) => setEditing({ ...editing, lastName: event.target.value })} /></label>
      <label><span>Initiated name (optional)</span><input value={editing.initiatedName} onChange={(event) => setEditing({ ...editing, initiatedName: event.target.value })} /></label>
      <label><span>Organization</span><input value={editing.organization} onChange={(event) => setEditing({ ...editing, organization: event.target.value })} /></label><label><span>Status</span><select value={editing.status} onChange={(event) => setEditing({ ...editing, status: event.target.value as FundraisingDonor['status'] })}><option value="active">Active</option><option value="prospect">Prospect</option><option value="inactive">Inactive</option></select></label>
      <label><span>Email</span><input type="email" value={editing.email} onChange={(event) => setEditing({ ...editing, email: event.target.value })} /></label><label><span>Phone</span><input type="tel" value={editing.phone} onChange={(event) => setEditing({ ...editing, phone: event.target.value })} /></label>
      <label className="full"><span>Address (optional)</span><textarea rows={3} value={editing.address} onChange={(event) => setEditing({ ...editing, address: event.target.value })} placeholder="Street address, city, state, ZIP code" /></label>
      <label><span>Tags (comma separated)</span><input value={editing.tags.join(', ')} onChange={(event) => setEditing({ ...editing, tags: event.target.value.split(',') })} /></label><label><span>Assigned fundraiser</span><input value={editing.assignedTo} onChange={(event) => setEditing({ ...editing, assignedTo: event.target.value })} /></label>
      <label><span>Next follow-up</span><input type="date" value={dateValue(editing.nextFollowUp)} onChange={(event) => setEditing({ ...editing, nextFollowUp: event.target.value ? new Date(`${event.target.value}T12:00:00`) : null })} /></label><label className="checkbox-label"><input type="checkbox" checked={editing.archived} onChange={(event) => setEditing({ ...editing, archived: event.target.checked })} /> Archive this donor</label>
      <label className="full"><span>Private stewardship notes</span><textarea rows={5} value={editing.notes} onChange={(event) => setEditing({ ...editing, notes: event.target.value })} /></label>
    </div><div className="modal-actions"><button className="secondary-btn" onClick={() => setEditing(null)}>Cancel</button><button className="primary-btn" disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save donor'}</button></div></section></div>}
    {editingPledge && <div className="modal-backdrop"><section className="panel fundraising-donor-editor" role="dialog" aria-modal="true" aria-label="Pledge"><div className="panel-head"><h2>{editingPledge.id ? 'Update pledge' : 'Add pledge'}</h2><button className="link-btn" onClick={() => setEditingPledge(null)}>Close</button></div><div className="fundraising-donor-form">
      <label><span>Donor *</span><select value={editingPledge.donorId} onChange={(event) => setEditingPledge({ ...editingPledge, donorId: event.target.value })}><option value="">Choose donor…</option>{donors.filter((donor) => !donor.archived).map((donor) => <option value={donor.id} key={donor.id}>{donorName(donor)}{donor.initiatedName ? ` (${donor.initiatedName})` : ''}</option>)}</select></label>
      <label><span>Campaign</span><select value={editingPledge.eventId} onChange={(event) => setEditingPledge({ ...editingPledge, eventId: event.target.value })}><option value="">General / no campaign</option>{events.map((event) => <option value={event.id} key={event.id}>{event.name}</option>)}</select></label>
      <label><span>Amount pledged *</span><div className="money-input"><span>$</span><input type="number" min="0.01" step="0.01" value={editingPledge.pledgedAmount || ''} onChange={(event) => setEditingPledge({ ...editingPledge, pledgedAmount: Number(event.target.value) || 0 })} /></div></label>
      <label><span>Amount paid</span><div className="money-input"><span>$</span><input type="number" min="0" step="0.01" value={editingPledge.paidAmount || ''} onChange={(event) => setEditingPledge({ ...editingPledge, paidAmount: Number(event.target.value) || 0 })} /></div></label>
      <label><span>Due date</span><input type="date" value={dateValue(editingPledge.dueDate)} onChange={(event) => setEditingPledge({ ...editingPledge, dueDate: event.target.value ? new Date(`${event.target.value}T12:00:00`) : null })} /></label>
      <label className="full"><span>Notes</span><textarea rows={4} value={editingPledge.notes} onChange={(event) => setEditingPledge({ ...editingPledge, notes: event.target.value })} /></label>
    </div><div className="modal-actions"><button className="secondary-btn" onClick={() => setEditingPledge(null)}>Cancel</button><button className="primary-btn" disabled={saving} onClick={savePledge}>{saving ? 'Saving…' : 'Save pledge'}</button></div></section></div>}
  </div>;
};

export default FundraisingCrm;
