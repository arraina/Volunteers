import React, { useMemo, useState } from 'react';
import AutoCommitDateInput from '../components/AutoCommitDateInput';
import { EventCalendarAction, EventCalendarPlan, isAiConfigured, parseEventCalendarRequest } from '../helpers/ai';
import { createEvent, trashRecord, updateEventCalendarFields } from '../helpers/store';
import { assertTaskStartNotPast, fromEasternDateTimeInput, toEasternDateTimeInput } from '../helpers/taskDateTime';
import { TempleEvent, VolunteerProfile, VolunteerTask } from '../helpers/types';
import './EventCalendar.css';

type CalendarView = 'year' | 'month' | 'week' | 'day';
type EventStatus = 'planned' | 'confirmed' | 'cancelled';

interface Props {
  events: TempleEvent[];
  tasks: VolunteerTask[];
  volunteers: VolunteerProfile[];
  uid?: string;
  setError: (message: string) => void;
  canManage: boolean;
  ownerNames?: Record<string, string>;
}

const COLORS = ['#2f7d32', '#2563eb', '#9333ea', '#dc2626', '#d97706', '#0891b2'];
const DAY_MS = 86_400_000;
const emptyForm = {
  name: '', start: '', end: '', owner: '', description: '', location: '', color: COLORS[0],
  status: 'planned' as EventStatus,
};

const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
const addDays = (date: Date, days: number) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const eventEnd = (event: TempleEvent) => event.endDate || new Date((event.date?.getTime() || 0) + 60 * 60_000);
const volunteerName = (volunteer: VolunteerProfile) => volunteer.name || `${volunteer.firstName} ${volunteer.lastName}`.trim() || volunteer.email;

const EventCalendar: React.FC<Props> = ({ events, tasks, volunteers, uid, setError, canManage, ownerNames }) => {
  const [view, setView] = useState<CalendarView>('month');
  const [cursor, setCursor] = useState(startOfDay(new Date()));
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState('');
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [aiText, setAiText] = useState('');
  const [aiPlan, setAiPlan] = useState<EventCalendarPlan | null>(null);
  const [aiBusy, setAiBusy] = useState(false);

  const datedEvents = useMemo(() => events.filter((event) => event.date).sort((a, b) => a.date!.getTime() - b.date!.getTime()), [events]);
  const undatedEvents = useMemo(() => events.filter((event) => !event.date).sort((a, b) => a.name.localeCompare(b.name)), [events]);
  const ownerName = (event: TempleEvent) => (event.owner ? ownerNames?.[event.owner] : '') || volunteers.find((volunteer) => volunteer.uid === event.owner)?.name || volunteers.find((volunteer) => volunteer.uid === event.owner)?.email || 'Not assigned';
  const eventLabel = (event: TempleEvent) => `${event.name}${event.date ? ` — ${event.allDay ? event.date.toLocaleDateString() : event.date.toLocaleString()}` : ''} · Owner: ${ownerName(event)}`;
  const visibleEvents = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return datedEvents.filter((event) => !needle || [event.name, event.description, event.location]
      .some((value) => value?.toLowerCase().includes(needle)));
  }, [datedEvents, search]);
  const visibleUndatedEvents = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return undatedEvents.filter((event) => !needle || [event.name, event.description, event.location]
      .some((value) => value?.toLowerCase().includes(needle)));
  }, [undatedEvents, search]);

  const conflicts = useMemo(() => {
    const rows: Array<{ key: string; first: TempleEvent; second?: TempleEvent; reason: string }> = [];
    for (let i = 0; i < datedEvents.length; i += 1) {
      const first = datedEvents[i];
      if (first.status === 'cancelled') continue;
      for (let j = i + 1; j < datedEvents.length; j += 1) {
        const second = datedEvents[j];
        if (second.status === 'cancelled' || second.date!.getTime() >= eventEnd(first).getTime()) break;
        if (eventEnd(second).getTime() > first.date!.getTime()) {
          const sameLocation = first.location && second.location && first.location.toLowerCase() === second.location.toLowerCase();
          rows.push({ key: `${first.id}:${second.id}`, first, second, reason: sameLocation ? `Overlapping at ${first.location}` : 'Event times overlap' });
        }
      }
      const linked = tasks.filter((task) => task.eventId === first.id);
      const completion = first.endDate || first.date!;
      const taskCutoff = first.allDay
        ? new Date(completion.getFullYear(), completion.getMonth(), completion.getDate() + 2)
        : new Date(eventEnd(first).getTime() + DAY_MS);
      const tooLate = linked.filter((task) => task.startDateTime >= taskCutoff);
      if (tooLate.length) rows.push({ key: `${first.id}:tasks`, first, reason: `${tooLate.length} linked task(s) start more than one day after the event ends` });
    }
    return rows;
  }, [datedEvents, tasks]);

  const setForEdit = (event: TempleEvent) => {
    setEditingId(event.id);
    setForm({
      name: event.name, start: toEasternDateTimeInput(event.date), end: toEasternDateTimeInput(event.endDate), owner: event.owner || '',
      description: event.description || '', location: event.location || '', color: event.color || COLORS[0],
      status: event.status || 'planned',
    });
    setMessage('');
  };

  const resetForm = () => { setEditingId(''); setForm(emptyForm); };

  const saveEvent = async (event: React.FormEvent) => {
    event.preventDefault(); setError(''); setMessage(''); setSaving(true);
    try {
      if (!form.name.trim() || !form.start) throw new Error('Event name and start date/time are required.');
      const start = fromEasternDateTimeInput(form.start);
      const end = form.end ? fromEasternDateTimeInput(form.end) : undefined;
      if (!editingId || form.start !== toEasternDateTimeInput(events.find((item) => item.id === editingId)?.date)) assertTaskStartNotPast(start);
      if (end && end <= start) throw new Error('Event end must be after its start.');
      const fields = {
        name: form.name, date: start, endDate: end, owner: form.owner, description: form.description, location: form.location,
        color: form.color, status: form.status,
      };
      if (editingId) await updateEventCalendarFields(editingId, fields);
      else await createEvent({ ...fields, createdBy: uid });
      setMessage(editingId ? 'Event updated.' : 'Event added.'); resetForm();
    } catch (error) { setError(error instanceof Error ? error.message : 'Could not save event.'); }
    finally { setSaving(false); }
  };

  const removeEvent = async (event: TempleEvent) => {
    if (!window.confirm(`Move "${event.name}" to Trash? Linked tasks will remain.`)) return;
    await trashRecord('events', event.id, uid); if (editingId === event.id) resetForm();
  };

  const inferEventDatesFromTasks = async (event: TempleEvent) => {
    const linked = tasks
      .filter((task) => task.eventId === event.id && task.startDateTime >= new Date())
      .sort((a, b) => a.startDateTime.getTime() - b.startDateTime.getTime());
    if (!linked.length) {
      setForEdit(event);
      setError('This event has no future linked tasks to infer dates from. Enter its date manually.');
      return;
    }
    const start = linked[0].startDateTime;
    const end = linked.reduce((latest, task) => {
      const taskEnd = task.endDateTime || task.startDateTime;
      return taskEnd > latest ? taskEnd : latest;
    }, linked[0].endDateTime || linked[0].startDateTime);
    try {
      await updateEventCalendarFields(event.id, { date: start, endDate: end > start ? end : undefined });
      setMessage(`Added dates to ${event.name} from its linked tasks.`);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not infer event dates.');
    }
  };

  const parseAi = async () => {
    if (!aiText.trim()) return; setAiBusy(true); setError(''); setAiPlan(null);
    try { setAiPlan(await parseEventCalendarRequest(aiText, events)); }
    catch (error) { setError(error instanceof Error ? error.message : 'Could not create an event plan.'); }
    finally { setAiBusy(false); }
  };

  const applyAi = async () => {
    if (!aiPlan) return; setAiBusy(true); setError('');
    try {
      for (const action of aiPlan.actions) await applyAiAction(action);
      setMessage(`Applied ${aiPlan.actions.length} AI event action(s).`); setAiPlan(null); setAiText('');
    } catch (error) { setError(error instanceof Error ? error.message : 'Could not apply the event plan.'); }
    finally { setAiBusy(false); }
  };

  const applyAiAction = async (action: EventCalendarAction) => {
    if (action.type === 'delete_event') return trashRecord('events', action.eventId, uid);
    const source = action.type === 'create_event' ? action.event : action.changes;
    const date = source.date ? new Date(source.date) : undefined;
    const endDate = source.endDate ? new Date(source.endDate) : source.endDate === null ? undefined : undefined;
    if (action.type === 'create_event' && !date) throw new Error('AI-created events require a date. Add a date to the request and preview it again.');
    if (date) assertTaskStartNotPast(date);
    const fields = {
      ...(source.name !== undefined ? { name: source.name } : {}),
      ...(date ? { date } : {}),
      ...(Object.prototype.hasOwnProperty.call(source, 'endDate') ? { endDate } : {}),
      ...(source.description !== undefined ? { description: source.description } : {}),
      ...(source.location !== undefined ? { location: source.location } : {}),
      ...(source.status !== undefined ? { status: source.status } : {}),
    };
    if (action.type === 'create_event') await createEvent({ ...fields, name: action.event.name, date: date!, createdBy: uid });
    else await updateEventCalendarFields(action.eventId, fields);
  };

  const move = (direction: number) => {
    if (view === 'year') setCursor(new Date(cursor.getFullYear() + direction, cursor.getMonth(), 1));
    else if (view === 'month') setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + direction, 1));
    else setCursor(addDays(cursor, direction * (view === 'week' ? 7 : 1)));
  };

  const monthStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const gridStart = addDays(monthStart, -monthStart.getDay());
  const weekStart = addDays(cursor, -cursor.getDay());
  const days = view === 'month' ? Array.from({ length: 42 }, (_, index) => addDays(gridStart, index))
    : view === 'week' ? Array.from({ length: 7 }, (_, index) => addDays(weekStart, index)) : [cursor];

  return <div className={`event-calendar-page${canManage ? '' : ' read-only'}`}>
    <div className="panel-head analytics-heading"><div><h2>Event Calendar</h2><p className="muted small">{canManage ? 'Plan accountable events and detect scheduling conflicts. Reminders are managed on linked tasks.' : 'View the event schedule, owners, and detected conflicts.'}</p></div></div>
    {message && <div className="success-message">{message}</div>}

    {canManage && <section className="panel calendar-ai">
      <div className="panel-head"><div><h2>AI event planner</h2><p className="muted small">Describe event additions, changes, or deletions. Owners are assigned manually from the volunteer list. Nothing is applied until you approve the preview.</p></div></div>
      <div className="ai-calendar-input"><textarea value={aiText} onChange={(event) => setAiText(event.target.value)} placeholder='Example: "Add Rath Yatra on October 18 from 10 AM to 4 PM at the temple"' /><button className="primary-btn" disabled={aiBusy || !isAiConfigured} onClick={parseAi}>{aiBusy ? 'Planning…' : 'Preview changes'}</button></div>
      {!isAiConfigured && <p className="muted small">Configure the existing AI endpoint to enable this planner.</p>}
      {aiPlan && <div className="ai-plan"><strong>{aiPlan.summary}</strong><ol>{aiPlan.actions.map((action, index) => <li key={index}>{action.type.replace(/_/g, ' ')}: {action.type === 'create_event' ? action.event.name : events.find((item) => item.id === action.eventId)?.name || action.eventId}</li>)}</ol><div className="row"><button className="primary-btn" disabled={aiBusy || !aiPlan.actions.length} onClick={applyAi}>Approve and apply</button><button className="secondary-btn" onClick={() => setAiPlan(null)}>Discard</button></div></div>}
    </section>}

    <div className="calendar-layout">
      <section className="panel calendar-main">
        <div className="calendar-toolbar"><div className="row"><button className="secondary-btn" onClick={() => move(-1)}>‹</button><button className="secondary-btn" onClick={() => setCursor(startOfDay(new Date()))}>Today</button><button className="secondary-btn" onClick={() => move(1)}>›</button></div><h2>{view === 'year' ? cursor.getFullYear() : cursor.toLocaleDateString('en-US', { month: 'long', year: 'numeric', ...(view === 'day' ? { day: 'numeric' } : {}) })}</h2><div className="view-switch">{(['year', 'month', 'week', 'day'] as CalendarView[]).map((item) => <button key={item} className={view === item ? 'active' : ''} onClick={() => setView(item)}>{item}</button>)}</div></div>
        <input className="calendar-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search events, location, or description" />
        {view === 'year' ? <div className="year-grid">{Array.from({ length: 12 }, (_, month) => <button key={month} className="year-month" onClick={() => { setCursor(new Date(cursor.getFullYear(), month, 1)); setView('month'); }}><strong>{new Date(cursor.getFullYear(), month, 1).toLocaleDateString('en-US', { month: 'long' })}</strong><span>{visibleEvents.filter((event) => event.date!.getFullYear() === cursor.getFullYear() && event.date!.getMonth() === month).length} event(s)</span></button>)}</div>
          : <div className={`calendar-grid calendar-${view}`}>{days.map((day) => <div key={day.toISOString()} className={`calendar-day ${sameDay(day, new Date()) ? 'today' : ''} ${view === 'month' && day.getMonth() !== cursor.getMonth() ? 'outside' : ''}`}><button className="day-number" onClick={() => { setCursor(day); setView('day'); }}>{day.toLocaleDateString('en-US', { weekday: view === 'month' ? undefined : 'short', day: 'numeric', month: view === 'month' ? undefined : 'short' })}</button><div className="day-events">{visibleEvents.filter((event) => sameDay(event.date!, day)).map((event) => <button key={event.id} className={`calendar-event status-${event.status}`} style={{ borderLeftColor: event.color }} onClick={() => canManage && setForEdit(event)}><strong>{event.allDay ? '' : `${event.date!.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} `}{event.name}</strong>{view !== 'month' && <><span>{event.allDay ? 'All day' : event.location || 'Location not set'}</span><span>Owner: {ownerName(event)}</span></>}</button>)}</div></div>)}</div>}
      </section>

      <aside className="calendar-sidebar">
        {visibleUndatedEvents.length > 0 && <section className="panel missing-date-panel">
          <h2>Date missing ({visibleUndatedEvents.length})</h2>
          <p className="muted small">These events were saved without a date. Add one so they appear normally in the calendar and event selectors.</p>
          <ul className="attention-list">
            {visibleUndatedEvents.map((event) => <li key={event.id}>
              <strong>{event.name}</strong><br />
              <span>Owner: {ownerName(event)}</span>
              {canManage && <div className="row missing-date-actions">
                <button className="secondary-btn" onClick={() => setForEdit(event)}>Edit date</button>
                <button className="link-btn" onClick={() => inferEventDatesFromTasks(event)}>Use linked task dates</button>
              </div>}
            </li>)}
          </ul>
        </section>}
        <section className="panel calendar-editor">
          <h2>{editingId ? 'Edit event' : 'Add event'}</h2>
          <form className="stacked-form" onSubmit={saveEvent}>
            <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Event name" required />
            <label><span>Event owner</span><select value={form.owner} onChange={(event) => setForm({ ...form, owner: event.target.value })}><option value="">Not assigned</option>{volunteers.filter((volunteer) => volunteer.participationStatus !== 'inactive' && !volunteer.deleted).sort((a, b) => volunteerName(a).localeCompare(volunteerName(b))).map((volunteer) => <option key={volunteer.uid} value={volunteer.uid}>{volunteerName(volunteer)}</option>)}</select></label>
            <label><span>Starts (Eastern Time)</span><AutoCommitDateInput type="datetime-local" value={form.start} min={toEasternDateTimeInput(new Date())} onValueChange={(start) => setForm({ ...form, start })} required /></label>
            <label><span>Ends (Eastern Time)</span><AutoCommitDateInput type="datetime-local" value={form.end} onValueChange={(end) => setForm({ ...form, end })} /></label>
            <input value={form.location} onChange={(event) => setForm({ ...form, location: event.target.value })} placeholder="Location" />
            <textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="Description and planning notes" />
            <div className="row"><select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as EventStatus })}><option value="planned">Planned</option><option value="confirmed">Confirmed</option><option value="cancelled">Cancelled</option></select><input type="color" aria-label="Calendar color" value={form.color} onChange={(event) => setForm({ ...form, color: event.target.value })} /></div>
            <p className="field-hint">WhatsApp reminders are configured on linked tasks and sent to each task's assigned volunteers.</p>
            <div className="row"><button className="primary-btn" disabled={saving}>{saving ? 'Saving…' : editingId ? 'Save event' : 'Add event'}</button>{editingId && <><button type="button" className="secondary-btn" onClick={resetForm}>Cancel</button><button type="button" className="danger-btn" onClick={() => removeEvent(events.find((item) => item.id === editingId)!)}>Trash</button></>}</div>
          </form>
        </section>
        <section className="panel"><h2>Conflict alerts ({conflicts.length})</h2>{!conflicts.length ? <p className="success-text">No scheduling conflicts detected.</p> : <ul className="attention-list">{conflicts.map((conflict) => <li key={conflict.key}><strong>{conflict.first.name}{conflict.second ? ` / ${conflict.second.name}` : ''}</strong><br />{conflict.reason}</li>)}</ul>}</section>
        <section className="panel"><h2>Upcoming</h2><ul className="attention-list">{datedEvents.filter((event) => event.date! >= new Date() && event.status !== 'cancelled').slice(0, 8).map((event) => <li key={event.id}><button className="link-btn" onClick={() => canManage && setForEdit(event)}>{eventLabel(event)}</button></li>)}</ul></section>
      </aside>
    </div>
  </div>;
};

export default EventCalendar;
