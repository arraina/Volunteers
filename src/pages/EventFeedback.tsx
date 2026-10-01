import React, { useMemo, useState } from 'react';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { TempleEvent, VolunteerProfile, VolunteerTask } from '../helpers/types';

const EventFeedback: React.FC<{
  profile: VolunteerProfile;
  tasks: VolunteerTask[];
  events: TempleEvent[];
  setError: (message: string) => void;
  setMessage: (message: string) => void;
}> = ({ profile, tasks, events: calendarEvents, setError, setMessage }) => {
  const feedbackEvents = useMemo(() => {
    const now = new Date();
    const map = new Map<string, { id: string; name: string; date?: Date }>();
    calendarEvents.filter((event) => {
      if (!event.date || event.status === 'cancelled') return false;
      const end = new Date((event.endDate || event.date).getTime());
      if (event.allDay) end.setHours(23, 59, 59, 999);
      return end < now;
    }).forEach((event) => map.set(event.id, { id: event.id, name: event.name, date: event.endDate || event.date }));
    tasks.filter((task) =>
      task.eventId && task.startDateTime < new Date() && task.assignedVolunteers.includes(profile.uid)
    ).forEach((task) => { if (!map.has(task.eventId!)) map.set(task.eventId!, { id: task.eventId!, name: task.eventName || 'Event', date: task.startDateTime }); });
    return Array.from(map.values()).sort((a, b) => (b.date?.getTime() || 0) - (a.date?.getTime() || 0));
  }, [calendarEvents, tasks, profile.uid]);
  const [eventId, setEventId] = useState('');
  const [feedbackText, setFeedbackText] = useState('');
  const [anonymous, setAnonymous] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!eventId) return setError('Select an event.');
    try {
      await setDoc(doc(db, 'eventFeedback', `${eventId}_${profile.uid}`), {
        eventId,
        volunteerId: profile.uid,
        feedbackText: feedbackText.trim(),
        anonymous,
        updatedAt: serverTimestamp(),
      }, { merge: true });
      setMessage('Thank you. Your event feedback was saved.');
      setFeedbackText('');
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not save feedback.');
    }
  };

  return <section className="panel">
    <h2>Event Feedback</h2>
    <p className="muted">Share what worked and what should improve for the next event.</p>
    {feedbackEvents.length === 0 ? <div className="empty-state"><strong>No past events yet</strong><span>Past events will remain available here for feedback.</span></div> :
      <form className="stacked-form" onSubmit={submit}>
        <select value={eventId} onChange={(e) => setEventId(e.target.value)} required>
          <option value="">Select an event</option>
          {feedbackEvents.map((event) => <option key={event.id} value={event.id}>{event.name}{event.date ? ` — ${event.date.toLocaleDateString()}` : ''}</option>)}
        </select>
        <label className="field-label">Your feedback</label>
        <textarea
          className="event-feedback-textarea"
          rows={12}
          placeholder="Share anything that went well, anything that could improve, and ideas for the next event."
          value={feedbackText}
          onChange={(e) => setFeedbackText(e.target.value)}
          required
        />
        <label className="checkbox-row"><input type="checkbox" checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} /> Show this response as anonymous to event coordinators</label>
        <button className="primary-btn" type="submit">Submit feedback</button>
      </form>}
  </section>;
};

export default EventFeedback;
