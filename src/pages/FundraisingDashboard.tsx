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
  id: crypto.randomUUID(), firstName: '', lastName: '', amount: 0,
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
  const [target, setTarget] = useState('0');
  const [startingCurrent, setStartingCurrent] = useState('0');
  const [entries, setEntries] = useState<FundraisingEntry[]>([blankEntry()]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!eventId && events.length) setEventId(events[0].id);
  }, [events, eventId]);

  useEffect(() => {
    if (!eventId || eventId === '__new__') return;
    setLoading(true);
    return subscribeFundraisingCampaign(eventId, (campaign) => {
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

  const updateEntry = (id: string, patch: Partial<FundraisingEntry>) => {
    setEntries((currentEntries) => currentEntries.map((entry) => entry.id === id ? { ...entry, ...patch } : entry));
    setMessage('');
  };

  const save = async () => {
    if (!eventId || eventId === '__new__') return setError('Select or create an event first.');
    if (targetAmount <= 0) return setError('Enter a fundraising target greater than zero.');
    const cleanEntries = entries.filter((entry) => entry.firstName.trim() || entry.lastName.trim() || entry.amount > 0);
    if (cleanEntries.some((entry) => !entry.firstName.trim() || !entry.lastName.trim() || entry.amount <= 0)) {
      return setError('Each donor row must include first name, last name, and an amount greater than zero.');
    }
    setSaving(true); setError(''); setMessage('');
    try {
      await saveFundraisingCampaign({
        eventId, targetAmount, startingCurrentAmount: Math.max(0, Number(startingCurrent) || 0),
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

  return <div className="fundraising-dashboard">
    <section className="fundraising-hero">
      <div>
        <p className="fundraising-kicker">Fundraising dashboard</p>
        <h2>{selectedEvent?.name || 'Choose an event'}</h2>
        <p>Track donations and pledges against the event goal in real time.</p>
      </div>
    </section>

    {eventId && eventId !== '__new__' && <>
      <section className="fundraising-metrics">
        <div className="fundraising-target-card"><span>Target</span><strong>{money.format(targetAmount)}</strong><small>Fundraising goal</small></div>
        <div className="fundraising-current-card"><span>Current total</span><strong>{money.format(current)}</strong><small>{percent >= 100 ? `${money.format(current - targetAmount)} above target` : `${money.format(remaining)} remaining`}</small></div>
      </section>

      <section className={`fundraising-progress-card ${percent >= 100 ? 'goal-reached' : ''}`}>
        <div className="fundraising-progress-heading"><div><span>Progress</span><strong>{Math.round(percent)}%</strong></div><span>{money.format(current)} of {money.format(targetAmount)}</span></div>
        <div className="fundraising-track" role="progressbar" aria-valuemin={0} aria-valuemax={Math.max(targetAmount, current)} aria-valuenow={current}>
          <div className="fundraising-fill" style={{ width: `${Math.min(100, percent)}%` }} />
        </div>
        {percent >= 100 && <div className="fundraising-celebration">🎉 Goal reached{percent > 100 ? ` — ${Math.round(percent - 100)}% beyond target!` : '!'}</div>}
      </section>

      <section className="panel fundraising-entries">
        <div className="panel-head"><div><h3>Donations and pledges</h3><p className="muted small">Each completed row contributes immediately to the live total.</p></div><button className="secondary-btn" onClick={() => setEntries((currentEntries) => [...currentEntries, blankEntry()])}>+ Add row</button></div>
        <div className="fundraising-entry-header"><span>First name</span><span>Last name</span><span>Amount donated/pledged</span><span /></div>
        {entries.map((entry, index) => <div className="fundraising-entry-row" key={entry.id}>
          <input aria-label={`First name row ${index + 1}`} value={entry.firstName} onChange={(event) => updateEntry(entry.id, { firstName: event.target.value })} placeholder="First name" />
          <input aria-label={`Last name row ${index + 1}`} value={entry.lastName} onChange={(event) => updateEntry(entry.id, { lastName: event.target.value })} placeholder="Last name" />
          <div className="money-input"><span>$</span><input aria-label={`Amount row ${index + 1}`} type="number" min="0" step="0.01" value={entry.amount || ''} onChange={(event) => updateEntry(entry.id, { amount: Math.max(0, Number(event.target.value) || 0) })} placeholder="0.00" /></div>
          <button className="link-btn danger" aria-label={`Remove row ${index + 1}`} onClick={() => setEntries((currentEntries) => currentEntries.length === 1 ? [blankEntry()] : currentEntries.filter((item) => item.id !== entry.id))}>Remove</button>
        </div>)}
        <div className="fundraising-entry-total"><span>Listed donations and pledges</span><strong>{money.format(entryTotal)}</strong></div>
      </section>
    </>}

    <section className="panel fundraising-settings">
      <div className="panel-head"><div><h3>Fundraising setup</h3><p className="muted small">Choose the event and maintain the amounts used by the dashboard.</p></div></div>
      <div className="fundraising-settings-grid">
        <label className="fundraising-event-select"><span>Fundraising event</span><select value={eventId} onChange={(event) => {
          const value = event.target.value;
          setEventId(value); setCreatingEvent(value === '__new__'); setMessage('');
        }}><option value="">Select an event…</option>{events.map((event) => <option value={event.id} key={event.id}>{event.name}</option>)}<option value="__new__">+ Create a new event</option></select></label>
        {eventId && eventId !== '__new__' && <>
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
      {eventId && eventId !== '__new__' && <button className="primary-btn fundraising-save" disabled={saving || loading} onClick={save}>{saving ? 'Saving…' : loading ? 'Loading…' : 'Save fundraising dashboard'}</button>}
    </section>
  </div>;
};

export default FundraisingDashboard;
