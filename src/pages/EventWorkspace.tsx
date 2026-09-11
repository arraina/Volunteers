import React, { useEffect, useMemo, useState } from 'react';
import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { createEvent, createTask, trashRecord } from '../helpers/store';
import { TempleEvent, VolunteerTask, formatDate } from '../helpers/types';

interface Props {
  events: TempleEvent[];
  tasks: VolunteerTask[];
  uid?: string;
  setError: (message: string) => void;
}

interface Meeting {
  id: string;
  title: string;
  meetingDate?: Date;
  attendees: string;
  notes: string;
  decisions: string;
  actionItems: string;
  createdAt?: Date;
}

interface Feedback {
  id: string;
  feedbackText?: string;
  wentWell?: string;
  improve?: string;
  comments?: string;
  anonymous: boolean;
}

interface EventTemplate {
  id: string;
  name: string;
  description: string;
  tasks: Array<{
    title: string;
    description: string;
    location: string;
    volunteersNeeded: number;
    offsetMs: number;
    durationMs: number;
  }>;
}

type ActionStatus = 'open' | 'blocked' | 'done';

interface EventActionItem {
  id: string;
  title: string;
  owner: string;
  dueDate?: Date;
  status: ActionStatus;
  notes: string;
  createdAt?: Date;
}

const emptyPlanningDoc = {
  purpose: '',
  masterNotes: '',
  nextAgenda: '',
  logistics: '',
  risks: '',
};

const emptyAction = { title: '', owner: '', dueDate: '', notes: '' };

const emptyMeeting = {
  title: '',
  meetingDate: '',
  attendees: '',
  notes: '',
  decisions: '',
  actionItems: '',
};

const toDateTimeInput = (date?: Date) => {
  if (!date) return '';
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
};

const EventWorkspace: React.FC<Props> = ({ events, tasks, uid, setError }) => {
  const [eventId, setEventId] = useState(events[0]?.id || '');
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [feedback, setFeedback] = useState<Feedback[]>([]);
  const [templates, setTemplates] = useState<EventTemplate[]>([]);
  const [actions, setActions] = useState<EventActionItem[]>([]);
  const [meeting, setMeeting] = useState(emptyMeeting);
  const [editingMeetingId, setEditingMeetingId] = useState('');
  const [meetingSearch, setMeetingSearch] = useState('');
  const [lessons, setLessons] = useState('');
  const [templateDate, setTemplateDate] = useState('');
  const [planningDoc, setPlanningDoc] = useState(emptyPlanningDoc);
  const [planningSaving, setPlanningSaving] = useState(false);
  const [planningSaved, setPlanningSaved] = useState('');
  const [action, setAction] = useState(emptyAction);
  const [actionFilter, setActionFilter] = useState<'active' | 'all' | ActionStatus>('active');
  const [actionSearch, setActionSearch] = useState('');

  useEffect(() => {
    if (!eventId && events[0]) setEventId(events[0].id);
  }, [events, eventId]);

  const event = events.find((item) => item.id === eventId);
  const eventTasks = useMemo(() => tasks.filter((task) => task.eventId === eventId), [tasks, eventId]);

  useEffect(() => {
    if (!eventId) return;
    const unsubMeetings = onSnapshot(
      query(collection(db, 'eventMeetings'), where('eventId', '==', eventId)),
      (snap) => setMeetings(snap.docs.filter((item) => item.data().deleted !== true).map((item) => {
        const data = item.data();
        return { id: item.id, ...data, meetingDate: data.meetingDate?.toDate?.(), createdAt: data.createdAt?.toDate?.() } as Meeting;
      }))
    );
    const unsubFeedback = onSnapshot(
      query(collection(db, 'eventFeedback'), where('eventId', '==', eventId)),
      (snap) => setFeedback(snap.docs.filter((item) => item.data().deleted !== true).map((item) => ({ id: item.id, ...item.data() } as Feedback)))
    );
    const unsubActions = onSnapshot(
      query(collection(db, 'eventActionItems'), where('eventId', '==', eventId)),
      (snap) => setActions(snap.docs.filter((item) => item.data().deleted !== true).map((item) => {
        const data = item.data();
        return {
          id: item.id,
          ...data,
          dueDate: data.dueDate?.toDate?.(),
          createdAt: data.createdAt?.toDate?.(),
        } as EventActionItem;
      }))
    );
    return () => { unsubMeetings(); unsubFeedback(); unsubActions(); };
  }, [eventId]);

  useEffect(() => onSnapshot(collection(db, 'eventTemplates'), (snap) => {
    setTemplates(snap.docs.filter((item) => item.data().deleted !== true).map((item) => ({ id: item.id, ...item.data() } as EventTemplate)));
  }), []);

  useEffect(() => setLessons(event?.lessonsLearned || ''), [event]);

  useEffect(() => {
    setPlanningDoc({ ...emptyPlanningDoc, ...(event?.planningDoc || {}) });
    setPlanningSaved('');
  }, [eventId]); // Load the selected event's living document without replacing in-progress typing.

  useEffect(() => {
    setMeeting(emptyMeeting);
    setEditingMeetingId('');
    setMeetingSearch('');
    setAction(emptyAction);
    setActionSearch('');
    setActionFilter('active');
  }, [eventId]);

  const visibleActions = useMemo(() => {
    const term = actionSearch.trim().toLowerCase();
    return actions.filter((item) => {
      const matchesStatus = actionFilter === 'all'
        || (actionFilter === 'active' ? item.status !== 'done' : item.status === actionFilter);
      const matchesTerm = !term || [item.title, item.owner, item.notes]
        .some((value) => value?.toLowerCase().includes(term));
      return matchesStatus && matchesTerm;
    }).sort((a, b) => {
      if (a.status === 'done' && b.status !== 'done') return 1;
      if (b.status === 'done' && a.status !== 'done') return -1;
      return (a.dueDate?.getTime() || Number.MAX_SAFE_INTEGER) - (b.dueDate?.getTime() || Number.MAX_SAFE_INTEGER);
    });
  }, [actions, actionFilter, actionSearch]);

  const visibleMeetings = useMemo(() => {
    const term = meetingSearch.trim().toLowerCase();
    return meetings.filter((item) => !term || [item.title, item.attendees, item.notes, item.decisions, item.actionItems]
      .some((value) => value?.toLowerCase().includes(term)))
      .sort((a, b) => (b.meetingDate || b.createdAt || new Date(0)).getTime()
        - (a.meetingDate || a.createdAt || new Date(0)).getTime());
  }, [meetings, meetingSearch]);

  const startNewMeeting = () => {
    setEditingMeetingId('');
    setMeeting(emptyMeeting);
  };

  const startEditingMeeting = (item: Meeting) => {
    setEditingMeetingId(item.id);
    setMeeting({
      title: item.title || '',
      meetingDate: toDateTimeInput(item.meetingDate),
      attendees: item.attendees || '',
      notes: item.notes || '',
      decisions: item.decisions || '',
      actionItems: item.actionItems || '',
    });
    window.scrollTo({ top: 300, behavior: 'smooth' });
  };

  const addMeeting = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!eventId || !meeting.title.trim()) return;
    try {
      const payload = {
        eventId,
        ...meeting,
        meetingDate: meeting.meetingDate ? Timestamp.fromDate(new Date(meeting.meetingDate)) : null,
        updatedAt: serverTimestamp(),
      };
      if (editingMeetingId) {
        await updateDoc(doc(db, 'eventMeetings', editingMeetingId), payload);
      } else {
        await addDoc(collection(db, 'eventMeetings'), { ...payload, createdBy: uid || null, createdAt: serverTimestamp() });
      }
      startNewMeeting();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not save meeting notes.');
    }
  };

  const saveLessons = async () => {
    if (!eventId) return;
    await updateDoc(doc(db, 'events', eventId), { lessonsLearned: lessons.trim(), updatedAt: serverTimestamp() });
    window.alert('Lessons saved.');
  };

  const savePlanningDocument = async () => {
    if (!eventId) return;
    setPlanningSaving(true);
    setPlanningSaved('');
    try {
      await updateDoc(doc(db, 'events', eventId), {
        planningDoc,
        planningUpdatedAt: serverTimestamp(),
        planningUpdatedBy: uid || null,
        updatedAt: serverTimestamp(),
      });
      setPlanningSaved(`Saved ${new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not save the planning document.');
    } finally {
      setPlanningSaving(false);
    }
  };

  const addActionItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!eventId || !action.title.trim()) return;
    try {
      await addDoc(collection(db, 'eventActionItems'), {
        eventId,
        title: action.title.trim(),
        owner: action.owner.trim(),
        notes: action.notes.trim(),
        dueDate: action.dueDate ? Timestamp.fromDate(new Date(`${action.dueDate}T12:00:00`)) : null,
        status: 'open',
        createdBy: uid || null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setAction(emptyAction);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not add the action item.');
    }
  };

  const updateActionStatus = async (item: EventActionItem, status: ActionStatus) => {
    try {
      await updateDoc(doc(db, 'eventActionItems', item.id), {
        status,
        completedAt: status === 'done' ? serverTimestamp() : null,
        updatedAt: serverTimestamp(),
        updatedBy: uid || null,
      });
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not update the action item.');
    }
  };

  const moveToTrash = async (collectionName: 'events' | 'eventMeetings' | 'eventTemplates' | 'eventFeedback' | 'eventActionItems', id: string, label: string) => {
    if (!window.confirm(`Move ${label} to Trash? The Owner can restore it for 30 days.`)) return;
    try {
      await trashRecord(collectionName, id, uid);
    } catch (error) {
      setError(error instanceof Error ? error.message : `Could not move ${label} to Trash.`);
    }
  };

  const saveTemplate = async () => {
    if (!event || eventTasks.length === 0) return;
    const base = Math.min(...eventTasks.map((task) => task.startDateTime.getTime()));
    await addDoc(collection(db, 'eventTemplates'), {
      name: event.name,
      description: event.description || '',
      tasks: eventTasks.map((task) => ({
        title: task.title,
        description: task.description || '',
        location: task.location || '',
        volunteersNeeded: task.volunteersNeeded,
        offsetMs: task.startDateTime.getTime() - base,
        durationMs: task.endDateTime ? task.endDateTime.getTime() - task.startDateTime.getTime() : 0,
      })),
      createdBy: uid || null,
      createdAt: serverTimestamp(),
    });
    window.alert('Event template saved.');
  };

  const createFromTemplate = async (template: EventTemplate) => {
    if (!templateDate) return setError('Choose a date and time for the new event.');
    const base = new Date(templateDate);
    const newEventId = await createEvent({ name: template.name, date: base, description: template.description, createdBy: uid });
    for (const task of template.tasks) {
      const start = new Date(base.getTime() + task.offsetMs);
      await createTask({
        ...task,
        startDateTime: start,
        endDateTime: task.durationMs ? new Date(start.getTime() + task.durationMs) : null,
        volunteersNeeded: task.volunteersNeeded,
        openForSignup: true,
        recurrence: 'none',
        reminderHoursBefore: [24],
        eventId: newEventId,
        eventName: template.name,
        createdBy: uid,
      });
    }
    window.alert('Event created from template.');
  };

  const exportCalendar = () => {
    if (!event) return;
    const stamp = (date: Date) => date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const escape = (value: string) => value.replace(/([,;\\])/g, '\\$1').replace(/\n/g, '\\n');
    const items = eventTasks.map((task) => [
      'BEGIN:VEVENT', `UID:${task.id}@temple-volunteers`, `DTSTART:${stamp(task.startDateTime)}`,
      task.endDateTime ? `DTEND:${stamp(task.endDateTime)}` : '', `SUMMARY:${escape(task.title)}`,
      `DESCRIPTION:${escape(task.description || '')}`, `LOCATION:${escape(task.location || '')}`, 'END:VEVENT',
    ].filter(Boolean).join('\r\n')).join('\r\n');
    const blob = new Blob([`BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//ISKCON Towaco//Volunteers//EN\r\n${items}\r\nEND:VCALENDAR\r\n`], { type: 'text/calendar' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob); link.download = `${event.name.replace(/[^a-z0-9]+/gi, '-')}.ics`; link.click();
    URL.revokeObjectURL(link.href);
  };

  return <div className="stacked-form">
    <section className="panel">
      <h2>Event Workspace</h2>
      <select value={eventId} onChange={(e) => setEventId(e.target.value)}>
        <option value="">Select an event</option>
        {events.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select>
      {event && <div className="row">
        <button className="secondary-btn" onClick={exportCalendar}>Download calendar (.ics)</button>
        <button className="secondary-btn" onClick={saveTemplate} disabled={!eventTasks.length}>Save as template</button>
        <button className="danger-btn" onClick={() => moveToTrash('events', event.id, `event “${event.name}”`)}>Move event to Trash</button>
      </div>}
    </section>

    {event && <>
      <section className="panel planning-overview">
        <div className="panel-head">
          <div>
            <h2>Living event plan</h2>
            <p className="muted small">Your shared working document. Update it throughout weekly planning calls.</p>
          </div>
          <span className="save-state" aria-live="polite">{planningSaved}</span>
        </div>
        <div className="planning-stats" aria-label="Event planning summary">
          <div><strong>{eventTasks.length}</strong><span>event tasks</span></div>
          <div><strong>{actions.filter((item) => item.status !== 'done').length}</strong><span>open actions</span></div>
          <div><strong>{actions.filter((item) => item.status === 'blocked').length}</strong><span>blocked</span></div>
          <div><strong>{meetings.length}</strong><span>meetings saved</span></div>
        </div>
        <div className="planning-document">
          <label>
            <span>Purpose and success measures</span>
            <textarea value={planningDoc.purpose} onChange={(e) => setPlanningDoc({ ...planningDoc, purpose: e.target.value })} placeholder="Why are we holding this event? What would make it successful?" />
          </label>
          <label className="planning-wide">
            <span>Master planning notes</span>
            <textarea className="document-editor" value={planningDoc.masterNotes} onChange={(e) => setPlanningDoc({ ...planningDoc, masterNotes: e.target.value })} placeholder="Keep the evolving event plan here—program, schedule, responsibilities, dependencies, links, and anything the team needs in one place." />
          </label>
          <label>
            <span>Agenda for the next planning call</span>
            <textarea value={planningDoc.nextAgenda} onChange={(e) => setPlanningDoc({ ...planningDoc, nextAgenda: e.target.value })} placeholder="Items to discuss next week" />
          </label>
          <label>
            <span>Logistics, supplies and contacts</span>
            <textarea value={planningDoc.logistics} onChange={(e) => setPlanningDoc({ ...planningDoc, logistics: e.target.value })} placeholder="Rooms, food, equipment, vendors, contacts, permits…" />
          </label>
          <label className="planning-wide">
            <span>Open questions, risks and blockers</span>
            <textarea value={planningDoc.risks} onChange={(e) => setPlanningDoc({ ...planningDoc, risks: e.target.value })} placeholder="What still needs an answer? What could prevent success?" />
          </label>
        </div>
        <div className="row planning-save-row">
          <button className="primary-btn" type="button" onClick={savePlanningDocument} disabled={planningSaving}>{planningSaving ? 'Saving…' : 'Save planning document'}</button>
          <span className="muted small">Saved content is immediately available to every Admin and Owner.</span>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <div><h2>Action tracker</h2><p className="muted small">Keep commitments from every weekly call in one accountable list.</p></div>
          <span className="status-pill">{actions.filter((item) => item.status !== 'done').length} active</span>
        </div>
        <form className="action-entry" onSubmit={addActionItem}>
          <input aria-label="Action item" placeholder="Action item" value={action.title} onChange={(e) => setAction({ ...action, title: e.target.value })} required />
          <input aria-label="Action owner" placeholder="Owner" value={action.owner} onChange={(e) => setAction({ ...action, owner: e.target.value })} />
          <input aria-label="Action due date" type="date" value={action.dueDate} onChange={(e) => setAction({ ...action, dueDate: e.target.value })} />
          <input aria-label="Action notes" placeholder="Notes or link (optional)" value={action.notes} onChange={(e) => setAction({ ...action, notes: e.target.value })} />
          <button className="primary-btn" type="submit">Add action</button>
        </form>
        <div className="action-toolbar">
          <input className="search" aria-label="Search action items" placeholder="Search actions or owners…" value={actionSearch} onChange={(e) => setActionSearch(e.target.value)} />
          <select aria-label="Filter action items" value={actionFilter} onChange={(e) => setActionFilter(e.target.value as typeof actionFilter)}>
            <option value="active">Active actions</option>
            <option value="open">Open</option>
            <option value="blocked">Blocked</option>
            <option value="done">Completed</option>
            <option value="all">All actions</option>
          </select>
        </div>
        {visibleActions.length === 0 ? <div className="empty-state"><strong>No matching actions</strong><span>Add the next commitment from your planning call.</span></div> :
          <div className="action-list">{visibleActions.map((item) => {
            const overdue = item.status !== 'done' && item.dueDate && item.dueDate.getTime() < new Date().setHours(0, 0, 0, 0);
            return <article className={`action-card ${item.status}`} key={item.id}>
              <button className={`action-check ${item.status === 'done' ? 'checked' : ''}`} type="button" onClick={() => updateActionStatus(item, item.status === 'done' ? 'open' : 'done')} aria-label={item.status === 'done' ? 'Reopen action' : 'Complete action'}>{item.status === 'done' ? '✓' : ''}</button>
              <div className="action-body">
                <strong>{item.title}</strong>
                <div className="action-meta">
                  <span>{item.owner || 'Unassigned'}</span>
                  {item.dueDate && <span className={overdue ? 'overdue' : ''}>{overdue ? 'Overdue · ' : 'Due · '}{item.dueDate.toLocaleDateString()}</span>}
                  {item.notes && <span>{item.notes}</span>}
                </div>
              </div>
              <select aria-label={`Status for ${item.title}`} value={item.status} onChange={(e) => updateActionStatus(item, e.target.value as ActionStatus)}>
                <option value="open">Open</option><option value="blocked">Blocked</option><option value="done">Done</option>
              </select>
              <button className="link-btn danger" type="button" onClick={() => moveToTrash('eventActionItems', item.id, `action “${item.title}”`)}>Remove</button>
            </article>;
          })}</div>}
      </section>

      <section className="panel">
        <div className="panel-head">
          <div><h2>Planning meetings ({meetings.length})</h2><p className="muted small">Save as many meetings as needed for this event.</p></div>
          <button className="secondary-btn" type="button" onClick={startNewMeeting}>Add another meeting</button>
        </div>
        <form className="stacked-form" onSubmit={addMeeting}>
          <h3>{editingMeetingId ? 'Edit meeting' : 'New meeting'}</h3>
          <input aria-label="Meeting title" placeholder="Meeting title" value={meeting.title} onChange={(e) => setMeeting({ ...meeting, title: e.target.value })} required />
          <input type="datetime-local" value={meeting.meetingDate} onChange={(e) => setMeeting({ ...meeting, meetingDate: e.target.value })} />
          <input aria-label="Meeting attendees" placeholder="Attendees" value={meeting.attendees} onChange={(e) => setMeeting({ ...meeting, attendees: e.target.value })} />
          <textarea aria-label="Discussion notes" placeholder="Discussion notes" value={meeting.notes} onChange={(e) => setMeeting({ ...meeting, notes: e.target.value })} />
          <textarea aria-label="Decisions made" placeholder="Decisions made" value={meeting.decisions} onChange={(e) => setMeeting({ ...meeting, decisions: e.target.value })} />
          <textarea aria-label="Action items" placeholder="Action items — include owner and due date" value={meeting.actionItems} onChange={(e) => setMeeting({ ...meeting, actionItems: e.target.value })} />
          <div className="row">
            <button className="primary-btn" type="submit">{editingMeetingId ? 'Save meeting changes' : 'Save meeting notes'}</button>
            {editingMeetingId && <button className="secondary-btn" type="button" onClick={startNewMeeting}>Cancel editing</button>}
          </div>
        </form>
        {meetings.length > 0 && <input className="search" aria-label="Search meetings" placeholder="Search meetings, attendees, notes, decisions, or actions…" value={meetingSearch} onChange={(e) => setMeetingSearch(e.target.value)} />}
        {meetings.length > 0 && visibleMeetings.length === 0 && <div className="empty-state"><strong>No matching meetings</strong><span>Try a different search.</span></div>}
        <div className="meeting-list">{visibleMeetings.map((item, index) => <details className="task-card meeting-card" key={item.id} open={index === 0}>
          <summary><span><strong>{item.title}</strong>{item.meetingDate && <span className="muted small"> · {formatDate(item.meetingDate)}</span>}</span><span className="muted small">View notes</span></summary>
          <div className="meeting-content">
            {item.attendees && <p><strong>Attendees:</strong> {item.attendees}</p>}
            {item.notes && <p><strong>Notes:</strong> {item.notes}</p>}
            {item.decisions && <p><strong>Decisions:</strong> {item.decisions}</p>}
            {item.actionItems && <p><strong>Actions:</strong> {item.actionItems}</p>}
            <div className="row">
              <button className="secondary-btn" onClick={() => startEditingMeeting(item)}>Edit meeting</button>
              <button className="link-btn danger" onClick={() => moveToTrash('eventMeetings', item.id, `meeting “${item.title}”`)}>Move to Trash</button>
            </div>
          </div>
        </details>)}</div>
      </section>

      <section className="panel">
        <h2>Feedback</h2><p>{feedback.length} response(s)</p>
        {feedback.map((item) => <div className="task-card" key={item.id}>
          {item.anonymous && <strong>Anonymous</strong>}
          <p>{item.feedbackText || [item.wentWell, item.improve, item.comments].filter(Boolean).join('\n\n')}</p>
          <button className="link-btn danger" onClick={() => moveToTrash('eventFeedback', item.id, 'this feedback')}>Move to Trash</button>
        </div>)}
        <div className="stacked-form">
          <label className="field-label">Lessons for next time</label>
          <textarea aria-label="Lessons for next time" value={lessons} onChange={(e) => setLessons(e.target.value)} placeholder="Summarize improvements to carry into the next event" />
          <button className="primary-btn" onClick={saveLessons}>Save lessons</button>
        </div>
      </section>
    </>}

    <section className="panel">
      <h2>Event templates</h2>
      <p className="muted">Templates copy an event's task names, staffing, locations, and timing pattern. Choose when the new event should begin; each copied task is scheduled relative to that date and time.</p>
      {templates.length === 0 ? <div className="empty-state"><strong>No templates saved</strong><span>Select an event above and choose “Save as template.”</span></div> : <div className="stacked-form">
        <label className="field-label">New event start date and time</label>
        <input type="datetime-local" value={templateDate} onChange={(e) => setTemplateDate(e.target.value)} />
        {templates.map((template) => <div className="task-card" key={template.id}>
          <strong>{template.name}</strong><p className="muted small">{template.tasks.length} task(s)</p>
          <button className="secondary-btn" onClick={() => createFromTemplate(template)}>Create event from this template</button>
          <button className="link-btn danger" onClick={() => moveToTrash('eventTemplates', template.id, `template “${template.name}”`)}>Move to Trash</button>
        </div>)}
      </div>}
    </section>
  </div>;
};

export default EventWorkspace;
