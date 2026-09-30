import React, { useEffect, useMemo, useState } from 'react';
import AutoCommitDateInput from '../components/AutoCommitDateInput';
import { TempleEvent } from '../helpers/types';
import {
  createEvent,
  FundraisingEntry,
  saveFundraisingCampaign,
  subscribeFundraisingCampaign,
} from '../helpers/store';
import { fromEasternDateTimeInput } from '../helpers/taskDateTime';

const blankEntry = (): FundraisingEntry => ({
  id: crypto.randomUUID(), firstName: '', lastName: '', type: 'donation', amount: 0, comments: '',
});

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

const FundraisingDashboard: React.FC<{
  events: TempleEvent[];
  uid?: string;
  setError: (message: string) => void;
}> = ({ events, uid, setError }) => {
  const [eventId, setEventId] = useState('');
  const [creatingEvent, setCreatingEvent] = useState(false);
  const [newEventName, setNewEventName] = useState('');
  const [newEventDate, setNewEventDate] = useState('');
  const [dashboardName, setDashboardName] = useState('');
  const [target, setTarget] = useState('0');
  const [startingCurrent, setStartingCurrent] = useState('0');
  const [entries, setEntries] = useState<FundraisingEntry[]>([blankEntry()]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [entryValidationMessage, setEntryValidationMessage] = useState('');
  const [invalidEntryIds, setInvalidEntryIds] = useState<string[]>([]);
  const [spotlightCycle, setSpotlightCycle] = useState(0);

  useEffect(() => {
    if (!eventId && events.length) setEventId(events[0].id);
  }, [events, eventId]);

  useEffect(() => {
    if (!eventId || eventId === '__new__') return;
    setLoading(true);
    return subscribeFundraisingCampaign(eventId, (campaign) => {
      const linkedEventName = events.find((event) => event.id === eventId)?.name || '';
      setDashboardName(campaign?.dashboardName || linkedEventName);
      setTarget(String(campaign?.targetAmount || 0));
      setStartingCurrent(String(campaign?.startingCurrentAmount || 0));
      setEntries(campaign?.entries.length ? campaign.entries : [blankEntry()]);
      setLoading(false);
    });
  }, [eventId]);

  const entryTotal = useMemo(() => entries.reduce((sum, entry) => sum + (Number(entry.amount) || 0), 0), [entries]);
  const current = Math.max(0, Number(startingCurrent) || 0) + entryTotal;
  const targetAmount = Math.max(0, Number(target) || 0);
  const percent = targetAmount > 0 ? current / targetAmount * 100 : 0;
  const remaining = Math.max(0, targetAmount - current);
  const selectedEvent = events.find((event) => event.id === eventId);
  const visibleContributions = entries.filter((entry) => entry.firstName.trim() || entry.lastName.trim() || entry.amount > 0);
  const spotlightDonors = visibleContributions.filter((entry) => entry.amount >= 15000);
  const spotlightSignature = spotlightDonors.map((entry) => `${entry.id}:${entry.amount}:${entry.firstName}:${entry.lastName}`).join('|');

  useEffect(() => {
    setSpotlightCycle(0);
    if (!spotlightDonors.length) return;
    const timer = window.setInterval(() => {
      setSpotlightCycle((current) => current + 1);
    }, 24000);
    return () => window.clearInterval(timer);
  // The signature resets the sequence when a qualifying donor's displayed data changes.
  }, [spotlightSignature]);

  const updateEntry = (id: string, patch: Partial<FundraisingEntry>) => {
    setEntries((currentEntries) => currentEntries.map((entry) => entry.id === id ? { ...entry, ...patch } : entry));
    setInvalidEntryIds((currentIds) => currentIds.filter((entryId) => entryId !== id));
    setEntryValidationMessage('');
    setMessage('');
  };

  const save = async () => {
    if (!eventId || eventId === '__new__') return setError('Select or create an event first.');
    if (!dashboardName.trim()) return setError('Enter a fundraising dashboard name.');
    if (targetAmount <= 0) return setError('Enter a fundraising target greater than zero.');
    const cleanEntries = entries.filter((entry) => entry.firstName.trim() || entry.lastName.trim() || entry.amount > 0);
    const invalidEntries = cleanEntries.map((entry) => ({
      entry,
      rowNumber: entries.findIndex((candidate) => candidate.id === entry.id) + 1,
      missing: [!entry.firstName.trim() ? 'first name' : '', entry.amount <= 0 ? 'amount greater than zero' : ''].filter(Boolean),
    })).filter(({ missing }) => missing.length > 0);
    if (invalidEntries.length) {
      setInvalidEntryIds(invalidEntries.map(({ entry }) => entry.id));
      setEntryValidationMessage(invalidEntries.map(({ rowNumber, missing }) => `Row ${rowNumber}: enter ${missing.join(' and ')}.`).join(' '));
      return setError('Please correct the highlighted fundraising entries before saving.');
    }
    setInvalidEntryIds([]); setEntryValidationMessage('');
    setSaving(true); setError(''); setMessage('');
    try {
      await saveFundraisingCampaign({
        eventId, dashboardName: dashboardName.trim(), targetAmount, startingCurrentAmount: Math.max(0, Number(startingCurrent) || 0),
        entries: cleanEntries, updatedBy: uid,
      });
      setEntries(cleanEntries.length ? cleanEntries : [blankEntry()]);
      setMessage('Fundraising dashboard saved.');
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not save fundraising dashboard.');
    } finally { setSaving(false); }
  };

  const createNewEvent = async () => {
    if (!newEventName.trim()) return setError('Enter the new event name.');
    setSaving(true); setError('');
    try {
      const createdId = await createEvent({
        name: newEventName,
        date: newEventDate ? fromEasternDateTimeInput(`${newEventDate}T12:00`) : null,
        allDay: true,
        createdBy: uid,
      });
      setCreatingEvent(false); setNewEventName(''); setNewEventDate(''); setEventId(createdId);
      setMessage('Event created. You can now save its fundraising goal.');
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not create the event.');
    } finally { setSaving(false); }
  };

  const exportToExcel = () => {
    if (!eventId || eventId === '__new__') return setError('Select an event before exporting.');
    const csvCell = (value: string | number) => `"${String(value).replace(/"/g, '""')}"`;
    const exportEntries = entries.filter((entry) => entry.firstName.trim() || entry.lastName.trim() || entry.amount > 0 || entry.comments.trim());
    const rows: Array<Array<string | number>> = [
      ['Fundraising dashboard', dashboardName || selectedEvent?.name || ''],
      ['Linked event', selectedEvent?.name || ''],
      ['Target', targetAmount],
      ['Current before entries', Math.max(0, Number(startingCurrent) || 0)],
      ['Listed entry total', entryTotal],
      ['Current total', current],
      ['Progress', `${Math.round(percent)}%`],
      [],
      ['First name', 'Last name', 'Type', 'Amount', 'Comments'],
      ...exportEntries.map((entry) => [entry.firstName, entry.lastName, entry.type, entry.amount, entry.comments]),
    ];
    const csv = `\uFEFF${rows.map((row) => row.map(csvCell).join(',')).join('\r\n')}`;
    const fileNameBase = (dashboardName || selectedEvent?.name || 'fundraising-dashboard')
      .replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'fundraising-dashboard';
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `${fileNameBase}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  return <div className="fundraising-dashboard">
    <section className="fundraising-hero">
      <div>
        <p className="fundraising-kicker">Fundraising dashboard</p>
        <h2>{dashboardName || selectedEvent?.name || 'Choose an event'}</h2>
      </div>
    </section>

    {eventId && eventId !== '__new__' && <>
      <section className="fundraising-donor-ticker" aria-label="Donor names and amounts">
        <div className={`fundraising-donor-ticker-track ${visibleContributions.length ? '' : 'is-empty'}`}>
          <div className="fundraising-donor-ticker-group">
            {visibleContributions.length ? visibleContributions.map((entry) => <span key={`primary-${entry.id}`}><strong>{[entry.firstName, entry.lastName].filter(Boolean).join(' ') || 'Anonymous'}</strong><b>{money.format(entry.amount)}</b></span>) : <span><strong>Donors will appear here as entries are added</strong></span>}
          </div>
          {visibleContributions.length > 0 && <div className="fundraising-donor-ticker-group" aria-hidden="true">
            {visibleContributions.map((entry) => <span key={`repeat-${entry.id}`}><strong>{[entry.firstName, entry.lastName].filter(Boolean).join(' ') || 'Anonymous'}</strong><b>{money.format(entry.amount)}</b></span>)}
          </div>}
        </div>
      </section>
      <section className={`fundraising-display-board ${percent >= 100 ? 'goal-reached' : ''}`}>
        {spotlightDonors.length > 0 && <div className="fundraising-donor-spotlight" key={`${spotlightDonors[spotlightCycle % spotlightDonors.length].id}-${spotlightCycle}`} aria-live="polite">
          <span>Donor spotlight</span>
          <strong>{[spotlightDonors[spotlightCycle % spotlightDonors.length].firstName, spotlightDonors[spotlightCycle % spotlightDonors.length].lastName].filter(Boolean).join(' ') || 'Anonymous'}</strong>
          <b>{money.format(spotlightDonors[spotlightCycle % spotlightDonors.length].amount)}</b>
        </div>}
        <div className="fundraising-contribution-board">
          <div className="fundraising-board-label">Donors</div>
          <div className="fundraising-supporter-list">
            {visibleContributions.length ? visibleContributions.map((entry) => <div className="fundraising-supporter" key={entry.id}>
              <span><strong>{[entry.firstName, entry.lastName].filter(Boolean).join(' ') || 'Anonymous'}</strong><small>{entry.type}</small></span>
              <b>{money.format(entry.amount)}</b>
            </div>) : <p className="fundraising-empty-supporters">Add pledges, loans, or donations below to see donors here.</p>}
          </div>
        </div>

        <div className="fundraising-goal-meter" role="progressbar" aria-label="Fundraising progress" aria-valuemin={0} aria-valuemax={Math.max(targetAmount, current)} aria-valuenow={current}>
          <div className="fundraising-meter-scale"><span>100%</span><span>75%</span><span>50%</span><span>25%</span><span>0%</span></div>
          <div className="fundraising-meter-track">
            <div className="fundraising-meter-fill" style={{ height: `${Math.min(100, percent)}%` }} />
            <strong>{Math.round(percent)}%</strong>
          </div>
          <span className="fundraising-meter-caption">Goal progress</span>
        </div>

        <div className="fundraising-scorecards">
          <div><span>Target</span><strong>{money.format(targetAmount)}</strong></div>
          <div><span>Current</span><strong>{money.format(current)}</strong><small>{percent >= 100 ? `${money.format(current - targetAmount)} above goal` : `${money.format(remaining)} to go`}</small></div>
          <div><span>Progress</span><strong>{Math.round(percent)}%</strong></div>
          <div><span>Donors</span><strong>{visibleContributions.length}</strong></div>
        </div>
        {percent >= 100 && <div className="fundraising-board-celebration">Goal reached!</div>}
      </section>

      <section className="panel fundraising-entries">
        <div className="panel-head"><div><h3>Pledges, loans, and donations</h3><p className="muted small">First name, type, and an amount greater than zero are required. Last name and comments are optional.</p></div></div>
        {entryValidationMessage && <div className="fundraising-validation-message" role="alert"><strong>Unable to save:</strong> {entryValidationMessage}</div>}
        <div className="fundraising-entry-header"><span>First name *</span><span>Last name (optional)</span><span>Type *</span><span>Amount *</span><span>Comments (optional)</span><span /></div>
        {entries.map((entry, index) => <div className={`fundraising-entry-row ${invalidEntryIds.includes(entry.id) ? 'has-error' : ''}`} key={entry.id}>
          <input aria-label={`First name row ${index + 1}`} aria-invalid={invalidEntryIds.includes(entry.id) && !entry.firstName.trim()} value={entry.firstName} onChange={(event) => updateEntry(entry.id, { firstName: event.target.value })} placeholder="First name *" />
          <input aria-label={`Last name row ${index + 1}`} value={entry.lastName} onChange={(event) => updateEntry(entry.id, { lastName: event.target.value })} placeholder="Last name (optional)" />
          <select aria-label={`Type row ${index + 1}`} value={entry.type} onChange={(event) => updateEntry(entry.id, { type: event.target.value as FundraisingEntry['type'] })}>
            <option value="pledge">Pledge</option>
            <option value="loan">Loan</option>
            <option value="donation">Donation</option>
          </select>
          <div className="money-input"><span>$</span><input aria-label={`Amount row ${index + 1}`} aria-invalid={invalidEntryIds.includes(entry.id) && entry.amount <= 0} type="number" min="0.01" step="0.01" value={entry.amount || ''} onChange={(event) => updateEntry(entry.id, { amount: Math.max(0, Number(event.target.value) || 0) })} placeholder="0.00 *" /></div>
          <input aria-label={`Comments row ${index + 1}`} value={entry.comments} onChange={(event) => updateEntry(entry.id, { comments: event.target.value })} placeholder="Comments" />
          <button className="link-btn danger" aria-label={`Remove row ${index + 1}`} onClick={() => { setEntries((currentEntries) => currentEntries.length === 1 ? [blankEntry()] : currentEntries.filter((item) => item.id !== entry.id)); setInvalidEntryIds((currentIds) => currentIds.filter((entryId) => entryId !== entry.id)); setEntryValidationMessage(''); }}>Remove</button>
        </div>)}
        <div className="fundraising-entry-footer">
          <div className="fundraising-entry-total"><span>Listed pledges, loans, and donations</span><strong>{money.format(entryTotal)}</strong></div>
          <button className="secondary-btn" onClick={() => setEntries((currentEntries) => [...currentEntries, blankEntry()])}>+ Add row</button>
        </div>
      </section>
    </>}

    {eventId && eventId !== '__new__' && <button className="primary-btn fundraising-save" disabled={saving || loading} onClick={save}>{saving ? 'Saving…' : loading ? 'Loading…' : 'Save fundraising dashboard'}</button>}

    <section className="panel fundraising-settings">
      <div className="panel-head"><div><h3>Fundraising setup</h3><p className="muted small">Choose the event and maintain the amounts used by the dashboard.</p></div></div>
      <div className="fundraising-settings-grid">
        <label className="fundraising-event-select"><span>Fundraising event</span><select value={eventId} onChange={(event) => {
          const value = event.target.value;
          setEventId(value); setCreatingEvent(value === '__new__'); setMessage('');
        }}><option value="">Select an event…</option>{events.map((event) => <option value={event.id} key={event.id}>{event.name}</option>)}<option value="__new__">+ Create a new event</option></select></label>
        {eventId && eventId !== '__new__' && <>
          <label><span>Dashboard name</span><input value={dashboardName} onChange={(event) => { setDashboardName(event.target.value); setMessage(''); }} placeholder="Fundraising dashboard name" /></label>
          <label><span>Target</span><div className="money-input"><span>$</span><input type="number" min="0" step="0.01" value={target} onChange={(event) => setTarget(event.target.value)} /></div></label>
          <label><span>Current before entries</span><div className="money-input"><span>$</span><input type="number" min="0" step="0.01" value={startingCurrent} onChange={(event) => setStartingCurrent(event.target.value)} /></div><small>Funds collected before the list above.</small></label>
        </>}
      </div>
      {creatingEvent && <div className="fundraising-new-event">
        <h3>Create a new fundraising event</h3>
        <div className="fundraising-new-event-fields">
          <label><span>Event name</span><input value={newEventName} onChange={(event) => setNewEventName(event.target.value)} placeholder="Event name" /></label>
          <label><span>Event date (optional)</span><AutoCommitDateInput type="date" value={newEventDate} onValueChange={setNewEventDate} /></label>
          <button className="primary-btn" disabled={saving} onClick={createNewEvent}>Create event</button>
        </div>
      </div>}
      {message && <div className="success-message">{message}</div>}
    </section>
    {eventId && eventId !== '__new__' && <button className="secondary-btn fundraising-export" onClick={exportToExcel}>Export all data to Excel</button>}
  </div>;
};

export default FundraisingDashboard;
