import React, { useMemo, useState } from 'react';
import { TempleEvent, VolunteerProfile, VolunteerTask } from '../helpers/types';
import { submitAuthenticatedEventFeedback } from '../helpers/eventFeedback';
import './EventFeedback.css';

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
  const [rating, setRating] = useState(0);
  const [respondentName, setRespondentName] = useState(() => `${profile.firstName || ''} ${profile.lastName || ''}`.trim() || profile.name || '');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!eventId) return setError('Select an event.');
    try {
      await submitAuthenticatedEventFeedback({ eventId, rating, feedbackText: feedbackText.trim(), respondentName, anonymous });
      setMessage('Thank you. Your event feedback was saved.');
      setFeedbackText('');
      setRating(0);
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
        <label className="field-label" htmlFor="feedback-name">Name (optional)</label>
        <input id="feedback-name" maxLength={120} value={respondentName} onChange={(e) => setRespondentName(e.target.value)} placeholder="Your name" disabled={anonymous} />
        <fieldset className="feedback-stars"><legend>Your rating</legend>{[1, 2, 3, 4, 5].map((value) => <button type="button" key={value} className={value <= rating ? 'selected' : ''} aria-label={`${value} star${value === 1 ? '' : 's'}`} onClick={() => setRating(value)}>★</button>)}</fieldset>
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
        <button className="primary-btn" type="submit" disabled={!rating}>Submit feedback</button>
      </form>}
  </section>;
};

export default EventFeedback;
