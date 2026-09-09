import React, { useState } from 'react';
import { TempleEvent } from '../helpers/types';
import { isAiConfigured, parseEventRequest, ParsedTask } from '../helpers/ai';
import { createEvent, createTask } from '../helpers/store';

interface EditableTask extends ParsedTask {
  startDateTime: string; // datetime-local value
  location: string;
  openForSignup: boolean;
}

interface Props {
  uid?: string;
  events: TempleEvent[];
  setError: (s: string) => void;
}

type Mode = 'new' | 'existing';

const AICreateTab: React.FC<Props> = ({ uid, events, setError }) => {
  const [mode, setMode] = useState<Mode>('new');
  const [existingEventId, setExistingEventId] = useState('');
  const [text, setText] = useState('');
  const [parsing, setParsing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [eventName, setEventName] = useState('');
  const [eventDate, setEventDate] = useState(''); // date value
  const [tasks, setTasks] = useState<EditableTask[] | null>(null);
  const [done, setDone] = useState('');

  const example =
    'Create Janmashtami on Aug 26 evening with tasks: pot washing 4 people, parking 6 people, stalls 3 people, decoration 2 people';

  const handleParse = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setDone('');
    setParsing(true);
    try {
      if (mode === 'existing' && !existingEventId) {
        throw new Error('Pick an event to add tasks to.');
      }
      const plan = await parseEventRequest(text);
      if (mode === 'new') {
        setEventName(plan.event.name);
        setEventDate('');
      }
      setTasks(
        plan.tasks.map((t) => ({
          ...t,
          startDateTime: '',
          location: '',
          openForSignup: true,
        }))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not understand that request.');
    } finally {
      setParsing(false);
    }
  };

  const updateTask = (i: number, patch: Partial<EditableTask>) => {
    setTasks((prev) => (prev ? prev.map((t, idx) => (idx === i ? { ...t, ...patch } : t)) : prev));
  };

  const removeTask = (i: number) => {
    setTasks((prev) => (prev ? prev.filter((_, idx) => idx !== i) : prev));
  };

  const handleCreateAll = async () => {
    if (!tasks || tasks.length === 0) return;
    setError('');
    setCreating(true);
    try {
      const missingTimes = tasks.filter((t) => !t.startDateTime);
      if (missingTimes.length > 0) {
        throw new Error('Please set a date/time for every task before creating.');
      }

      let eventId: string;
      let targetEventName: string;

      if (mode === 'existing') {
        const ev = events.find((e) => e.id === existingEventId);
        if (!ev) throw new Error('Please pick a valid event.');
        eventId = ev.id;
        targetEventName = ev.name;
      } else {
        if (!eventName.trim()) throw new Error('Event name is required.');
        targetEventName = eventName.trim();
        eventId = await createEvent({
          name: targetEventName,
          date: eventDate ? new Date(eventDate) : null,
          createdBy: uid,
        });
      }

      for (const t of tasks) {
        await createTask({
          title: t.title,
          startDateTime: new Date(t.startDateTime),
          location: t.location,
          skillsNeeded: [],
          volunteersNeeded: t.volunteersNeeded,
          openForSignup: t.openForSignup,
          recurrence: 'none',
          reminderHoursBefore: [24],
          eventId,
          eventName: targetEventName,
          createdBy: uid,
        });
      }

      const pastCount = tasks.filter((t) => new Date(t.startDateTime) < new Date()).length;
      const pastNote = pastCount
        ? ` Note: ${pastCount} task(s) are dated in the past and may be hidden in the Tasks list — edit their date to a future time to see them.`
        : '';
      const verb = mode === 'existing' ? 'Added' : 'Created';
      setDone(
        `${verb} ${tasks.length} task(s) ${mode === 'existing' ? 'to' : 'under'} "${targetEventName}".${pastNote}`
      );
      setTasks(null);
      setText('');
      setEventName('');
      setEventDate('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create event and tasks.');
    } finally {
      setCreating(false);
    }
  };

  if (!isAiConfigured) {
    return (
      <section className="panel">
        <h2>AI Create</h2>
        <p className="muted">
          AI create isn't set up yet. Add a Gemini endpoint or key to enable it — see
          SETUP.md (AI Create). You can still create events and tasks manually from the Tasks
          tab.
        </p>
      </section>
    );
  }

  return (
    <section className="panel">
      <h2>AI Create — describe an event and its tasks</h2>
      {done && <div className="success-message">{done}</div>}

      <form onSubmit={handleParse} className="stacked-form">
        <div className="chip-group">
          <button
            type="button"
            className={`chip ${mode === 'new' ? 'chip-on' : ''}`}
            onClick={() => setMode('new')}
          >
            Create new event
          </button>
          <button
            type="button"
            className={`chip ${mode === 'existing' ? 'chip-on' : ''}`}
            onClick={() => setMode('existing')}
            disabled={events.length === 0}
          >
            Add to existing event
          </button>
        </div>
        {mode === 'existing' && (
          <select
            value={existingEventId}
            onChange={(e) => setExistingEventId(e.target.value)}
          >
            <option value="">Choose an event…</option>
            {events.map((ev) => (
              <option key={ev.id} value={ev.id}>
                {ev.name}
              </option>
            ))}
          </select>
        )}
        <textarea
          placeholder={
            mode === 'existing'
              ? 'e.g. add tasks: flower garlands 2 people, sound check 1 person'
              : example
          }
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
        />
        <button type="submit" className="primary-btn" disabled={parsing || !text.trim()}>
          {parsing ? 'Thinking…' : 'Generate tasks'}
        </button>
        <small className="field-hint">Example: {example}</small>
      </form>

      {tasks && (
        <div className="ai-preview">
          <h3>Review before creating</h3>
          {mode === 'existing' ? (
            <p className="muted">
              Adding to event:{' '}
              <strong>{events.find((e) => e.id === existingEventId)?.name || '—'}</strong>
            </p>
          ) : (
            <div className="row">
              <div style={{ flex: 2 }}>
                <label className="field-label">Event name</label>
                <input value={eventName} onChange={(e) => setEventName(e.target.value)} />
              </div>
              <div>
                <label className="field-label">Event date (optional)</label>
                <input
                  type="date"
                  value={eventDate}
                  onChange={(e) => setEventDate(e.target.value)}
                />
              </div>
            </div>
          )}

          <div className="occurrence-list">
            {tasks.map((t, i) => (
              <div key={i} className="occurrence-row">
                <div className="row">
                  <input
                    style={{ flex: 2 }}
                    value={t.title}
                    onChange={(e) => updateTask(i, { title: e.target.value })}
                  />
                  <input
                    type="number"
                    min={1}
                    style={{ width: 90 }}
                    value={t.volunteersNeeded}
                    onChange={(e) =>
                      updateTask(i, { volunteersNeeded: Math.max(1, parseInt(e.target.value, 10) || 1) })
                    }
                  />
                  <button type="button" className="link-btn danger" onClick={() => removeTask(i)}>
                    remove
                  </button>
                </div>
                <div className="row">
                  <div style={{ flex: 1 }}>
                    <label className="field-label">
                      When{t.timeHint ? ` (AI hint: ${t.timeHint})` : ''}
                    </label>
                    <input
                      type="datetime-local"
                      value={t.startDateTime}
                      onChange={(e) => updateTask(i, { startDateTime: e.target.value })}
                    />
                    {t.startDateTime && new Date(t.startDateTime) < new Date() && (
                      <small className="field-hint" style={{ color: '#b45309' }}>
                        This date is in the past — it won't show in the Tasks list.
                      </small>
                    )}
                  </div>
                  <div style={{ flex: 1 }}>
                    <label className="field-label">Location</label>
                    <input
                      value={t.location}
                      onChange={(e) => updateTask(i, { location: e.target.value })}
                    />
                  </div>
                </div>
                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={t.openForSignup}
                    onChange={(e) => updateTask(i, { openForSignup: e.target.checked })}
                  />
                  Let volunteers sign themselves up
                </label>
              </div>
            ))}
          </div>

          <div className="row" style={{ marginTop: '0.75rem' }}>
            <button className="primary-btn" onClick={handleCreateAll} disabled={creating}>
              {creating ? 'Creating…' : `Create event + ${tasks.length} task(s)`}
            </button>
            <button className="secondary-btn" onClick={() => setTasks(null)}>
              Discard
            </button>
          </div>
        </div>
      )}
    </section>
  );
};

export default AICreateTab;
