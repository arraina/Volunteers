import React, { useState } from 'react';
import { TempleEvent, VolunteerProfile, VolunteerTask } from '../helpers/types';
import {
  isAiConfigured,
  parseEventRequest,
  parseTaskManagementRequest,
  ParsedTask,
  TaskManagementAction,
  TaskManagementPlan,
} from '../helpers/ai';
import {
  assignVolunteerToTask,
  createEvent,
  createTask,
  removeVolunteerFromTask,
  updateTaskManagementFields,
  updateTaskStatus,
} from '../helpers/store';

interface EditableTask extends ParsedTask {
  startDateTime: string; // datetime-local value
  location: string;
  openForSignup: boolean;
}

interface Props {
  uid?: string;
  events: TempleEvent[];
  tasks: VolunteerTask[];
  volunteers: VolunteerProfile[];
  setError: (s: string) => void;
}

type Mode = 'new' | 'existing' | 'manage';

const AICreateTab: React.FC<Props> = ({ uid, events, tasks: existingTasks, volunteers, setError }) => {
  const [mode, setMode] = useState<Mode>('new');
  const [existingEventId, setExistingEventId] = useState('');
  const [text, setText] = useState('');
  const [parsing, setParsing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [eventName, setEventName] = useState('');
  const [eventDate, setEventDate] = useState(''); // date value
  const [tasks, setTasks] = useState<EditableTask[] | null>(null);
  const [managementPlan, setManagementPlan] = useState<TaskManagementPlan | null>(null);
  const [done, setDone] = useState('');

  const example =
    'Create Janmashtami on Aug 26 evening with tasks: pot washing 4 people, parking 6 people, stalls 3 people, decoration 2 people';

  const handleParse = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setDone('');
    setParsing(true);
    try {
      if (mode === 'manage') {
        const plan = await parseTaskManagementRequest(text, existingTasks, volunteers);
        setManagementPlan(plan);
        setTasks(null);
        return;
      }
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

  const actionLabel = (action: TaskManagementAction) => {
    const task = existingTasks.find((t) => t.id === action.taskId);
    const taskName = task ? `${task.title} (${task.startDateTime.toLocaleString()})` : action.taskId;
    if (action.type === 'update_task') {
      return `Update ${taskName}: ${Object.entries(action.changes).map(([key, value]) => `${key} = ${value ?? 'none'}`).join(', ')}`;
    }
    if (action.type === 'set_cancelled') return `${action.cancelled ? 'Cancel' : 'Reopen'} ${taskName}`;
    const volunteer = volunteers.find((v) => v.uid === action.volunteerId);
    return `${action.type === 'assign_volunteer' ? 'Assign' : 'Remove'} ${volunteer?.name || action.volunteerId} ${action.type === 'assign_volunteer' ? 'to' : 'from'} ${taskName}`;
  };

  const handleApplyManagement = async () => {
    if (!managementPlan?.actions.length) return;
    setError('');
    setCreating(true);
    try {
      for (const action of managementPlan.actions) {
        const task = existingTasks.find((t) => t.id === action.taskId);
        if (!task) throw new Error('A selected task no longer exists. Please generate the plan again.');
        if (action.type === 'assign_volunteer' || action.type === 'remove_volunteer') {
          const volunteer = volunteers.find((v) => v.uid === action.volunteerId);
          if (!volunteer) throw new Error('A selected volunteer no longer exists.');
          if (action.type === 'assign_volunteer') await assignVolunteerToTask(task, volunteer);
          else await removeVolunteerFromTask(task, volunteer.uid);
        } else if (action.type === 'set_cancelled') {
          await updateTaskStatus(task.id, action.cancelled ? 'cancelled' : 'open');
        } else {
          const changes = action.changes;
          const newStart = changes.startDateTime ? new Date(changes.startDateTime) : undefined;
          let newEnd = changes.endDateTime === null
            ? null
            : changes.endDateTime ? new Date(changes.endDateTime) : undefined;
          if (newStart && changes.endDateTime === undefined && task.endDateTime) {
            newEnd = new Date(newStart.getTime() + task.endDateTime.getTime() - task.startDateTime.getTime());
          }
          await updateTaskManagementFields(task.id, {
            title: changes.title,
            description: changes.description,
            startDateTime: newStart,
            endDateTime: newEnd,
            location: changes.location,
            volunteersNeeded: changes.volunteersNeeded === undefined
              ? undefined
              : Math.max(changes.volunteersNeeded, task.assignedVolunteers.length, 1),
            openForSignup: changes.openForSignup,
            reminderHoursBefore: changes.reminderHoursBefore,
          });
        }
      }
      setDone(`Applied ${managementPlan.actions.length} approved change(s).`);
      setManagementPlan(null);
      setText('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not apply the proposed changes.');
    } finally {
      setCreating(false);
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
      <h2>AI Task Assistant</h2>
      <p className="muted">Create events and tasks, or safely update dates, details, and volunteer assignments.</p>
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
          <button
            type="button"
            className={`chip ${mode === 'manage' ? 'chip-on' : ''}`}
            onClick={() => setMode('manage')}
            disabled={existingTasks.length === 0}
          >
            Manage tasks &amp; assignments
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
          aria-label="AI task request"
          placeholder={
            mode === 'manage'
              ? 'e.g. move kitchen prep on September 14 to 3 PM and assign Priya; remove John from parking'
              : mode === 'existing'
              ? 'e.g. add tasks: flower garlands 2 people, sound check 1 person'
              : example
          }
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
        />
        <button type="submit" className="primary-btn" disabled={parsing || !text.trim()}>
          {parsing ? 'Thinking…' : mode === 'manage' ? 'Review proposed changes' : 'Generate tasks'}
        </button>
        <small className="field-hint">
          {mode === 'manage'
            ? 'Include the task name, date, and volunteer name when possible. Nothing changes until you approve the preview.'
            : `Example: ${example}`}
        </small>
      </form>

      {mode === 'manage' && managementPlan && (
        <div className="ai-preview">
          <h3>Review before applying</h3>
          <p>{managementPlan.summary}</p>
          {managementPlan.actions.length === 0 ? (
            <div className="error-message">No safe changes were proposed. Add the exact task, date, or volunteer name and try again.</div>
          ) : (
            <ol className="occurrence-list">
              {managementPlan.actions.map((action, index) => (
                <li key={`${action.type}-${action.taskId}-${index}`} className="occurrence-row">
                  {actionLabel(action)}
                </li>
              ))}
            </ol>
          )}
          <div className="row" style={{ marginTop: '0.75rem' }}>
            <button type="button" className="primary-btn" disabled={creating || managementPlan.actions.length === 0} onClick={handleApplyManagement}>
              {creating ? 'Applying…' : `Apply ${managementPlan.actions.length} change(s)`}
            </button>
            <button type="button" className="secondary-btn" onClick={() => setManagementPlan(null)}>
              Discard
            </button>
          </div>
        </div>
      )}

      {mode !== 'manage' && tasks && (
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
