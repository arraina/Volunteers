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
import { createEvent, createTask } from '../helpers/store';
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
}

interface Feedback {
  id: string;
  rating: number;
  wentWell: string;
  improve: string;
  comments: string;
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

const emptyMeeting = {
  title: '',
  meetingDate: '',
  attendees: '',
  notes: '',
  decisions: '',
  actionItems: '',
};

const EventWorkspace: React.FC<Props> = ({ events, tasks, uid, setError }) => {
  const [eventId, setEventId] = useState(events[0]?.id || '');
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [feedback, setFeedback] = useState<Feedback[]>([]);
  const [templates, setTemplates] = useState<EventTemplate[]>([]);
  const [meeting, setMeeting] = useState(emptyMeeting);
  const [lessons, setLessons] = useState('');
  const [templateDate, setTemplateDate] = useState('');

  useEffect(() => {
    if (!eventId && events[0]) setEventId(events[0].id);
  }, [events, eventId]);

  const event = events.find((item) => item.id === eventId);
  const eventTasks = useMemo(() => tasks.filter((task) => task.eventId === eventId), [tasks, eventId]);

  useEffect(() => {
    if (!eventId) return;
    const unsubMeetings = onSnapshot(
      query(collection(db, 'eventMeetings'), where('eventId', '==', eventId)),
      (snap) => setMeetings(snap.docs.map((item) => {
        const data = item.data();
        return { id: item.id, ...data, meetingDate: data.meetingDate?.toDate?.() } as Meeting;
      }))
    );
    const unsubFeedback = onSnapshot(
      query(collection(db, 'eventFeedback'), where('eventId', '==', eventId)),
      (snap) => setFeedback(snap.docs.map((item) => ({ id: item.id, ...item.data() } as Feedback)))
    );
    return () => { unsubMeetings(); unsubFeedback(); };
  }, [eventId]);

  useEffect(() => onSnapshot(collection(db, 'eventTemplates'), (snap) => {
    setTemplates(snap.docs.map((item) => ({ id: item.id, ...item.data() } as EventTemplate)));
  }), []);

  useEffect(() => setLessons(event?.lessonsLearned || ''), [event]);

  const addMeeting = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!eventId || !meeting.title.trim()) return;
    try {
      await addDoc(collection(db, 'eventMeetings'), {
        eventId,
        ...meeting,
        meetingDate: meeting.meetingDate ? Timestamp.fromDate(new Date(meeting.meetingDate)) : null,
        createdBy: uid || null,
        createdAt: serverTimestamp(),
      });
      setMeeting(emptyMeeting);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not save meeting notes.');
    }
  };

  const saveLessons = async () => {
    if (!eventId) return;
    await updateDoc(doc(db, 'events', eventId), { lessonsLearned: lessons.trim(), updatedAt: serverTimestamp() });
    window.alert('Lessons saved.');
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

  const average = feedback.length
    ? (feedback.reduce((sum, item) => sum + item.rating, 0) / feedback.length).toFixed(1)
    : '—';

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
      </div>}
    </section>

    {event && <>
      <section className="panel">
        <h2>Planning meetings</h2>
        <form className="stacked-form" onSubmit={addMeeting}>
          <input placeholder="Meeting title" value={meeting.title} onChange={(e) => setMeeting({ ...meeting, title: e.target.value })} required />
          <input type="datetime-local" value={meeting.meetingDate} onChange={(e) => setMeeting({ ...meeting, meetingDate: e.target.value })} />
          <input placeholder="Attendees" value={meeting.attendees} onChange={(e) => setMeeting({ ...meeting, attendees: e.target.value })} />
          <textarea placeholder="Discussion notes" value={meeting.notes} onChange={(e) => setMeeting({ ...meeting, notes: e.target.value })} />
          <textarea placeholder="Decisions made" value={meeting.decisions} onChange={(e) => setMeeting({ ...meeting, decisions: e.target.value })} />
          <textarea placeholder="Action items — include owner and due date" value={meeting.actionItems} onChange={(e) => setMeeting({ ...meeting, actionItems: e.target.value })} />
          <button className="primary-btn" type="submit">Save meeting notes</button>
        </form>
        {meetings.map((item) => <div className="task-card" key={item.id}>
          <strong>{item.title}</strong>{item.meetingDate && <p className="muted">{formatDate(item.meetingDate)}</p>}
          {item.attendees && <p><strong>Attendees:</strong> {item.attendees}</p>}
          {item.notes && <p><strong>Notes:</strong> {item.notes}</p>}
          {item.decisions && <p><strong>Decisions:</strong> {item.decisions}</p>}
          {item.actionItems && <p><strong>Actions:</strong> {item.actionItems}</p>}
        </div>)}
      </section>

      <section className="panel">
        <h2>Feedback</h2><p><strong>{average}</strong> average rating · {feedback.length} response(s)</p>
        {feedback.map((item) => <div className="task-card" key={item.id}>
          <strong>{item.rating}/5 {item.anonymous ? '· Anonymous' : ''}</strong>
          {item.wentWell && <p><strong>Went well:</strong> {item.wentWell}</p>}
          {item.improve && <p><strong>Improve:</strong> {item.improve}</p>}
          {item.comments && <p>{item.comments}</p>}
        </div>)}
        <label className="field-label">Lessons for next time</label>
        <textarea value={lessons} onChange={(e) => setLessons(e.target.value)} placeholder="Summarize improvements to carry into the next event" />
        <button className="primary-btn" onClick={saveLessons}>Save lessons</button>
      </section>
    </>}

    <section className="panel">
      <h2>Event templates</h2>
      <input type="datetime-local" value={templateDate} onChange={(e) => setTemplateDate(e.target.value)} />
      {templates.map((template) => <div className="task-card" key={template.id}>
        <strong>{template.name}</strong><p className="muted small">{template.tasks.length} task(s)</p>
        <button className="secondary-btn" onClick={() => createFromTemplate(template)}>Create from template</button>
      </div>)}
    </section>
  </div>;
};

export default EventWorkspace;
