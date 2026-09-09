import React, { useMemo, useState } from 'react';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { VolunteerProfile, VolunteerTask } from '../helpers/types';

const EventFeedback: React.FC<{
  profile: VolunteerProfile;
  tasks: VolunteerTask[];
  setError: (message: string) => void;
  setMessage: (message: string) => void;
}> = ({ profile, tasks, setError, setMessage }) => {
  const events = useMemo(() => {
    const map = new Map<string, string>();
    tasks.filter((task) =>
      task.eventId && task.startDateTime < new Date() && task.assignedVolunteers.includes(profile.uid)
    ).forEach((task) => map.set(task.eventId!, task.eventName || 'Event'));
    return Array.from(map, ([id, name]) => ({ id, name }));
  }, [tasks, profile.uid]);
  const [eventId, setEventId] = useState('');
  const [rating, setRating] = useState(5);
  const [wentWell, setWentWell] = useState('');
  const [improve, setImprove] = useState('');
  const [comments, setComments] = useState('');
  const [anonymous, setAnonymous] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!eventId) return setError('Select an event.');
    try {
      await setDoc(doc(db, 'eventFeedback', `${eventId}_${profile.uid}`), {
        eventId,
        volunteerId: profile.uid,
        rating,
        wentWell: wentWell.trim(),
        improve: improve.trim(),
        comments: comments.trim(),
        anonymous,
        updatedAt: serverTimestamp(),
      }, { merge: true });
      setMessage('Thank you. Your event feedback was saved.');
      setWentWell(''); setImprove(''); setComments('');
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not save feedback.');
    }
  };

  return <section className="panel">
    <h2>Event Feedback</h2>
    <p className="muted">Share what worked and what should improve for the next event.</p>
    {events.length === 0 ? <div className="empty-state"><strong>No completed events yet</strong><span>Events you participated in will appear here.</span></div> :
      <form className="stacked-form" onSubmit={submit}>
        <select value={eventId} onChange={(e) => setEventId(e.target.value)} required>
          <option value="">Select an event</option>
          {events.map((event) => <option key={event.id} value={event.id}>{event.name}</option>)}
        </select>
        <label className="field-label">Overall rating</label>
        <select value={rating} onChange={(e) => setRating(Number(e.target.value))}>
          {[5, 4, 3, 2, 1].map((value) => <option key={value} value={value}>{value} / 5</option>)}
        </select>
        <textarea placeholder="What went well?" value={wentWell} onChange={(e) => setWentWell(e.target.value)} />
        <textarea placeholder="What could be improved?" value={improve} onChange={(e) => setImprove(e.target.value)} />
        <textarea placeholder="Additional comments" value={comments} onChange={(e) => setComments(e.target.value)} />
        <label className="checkbox-row"><input type="checkbox" checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} /> Show this response as anonymous to event coordinators</label>
        <button className="primary-btn" type="submit">Submit feedback</button>
      </form>}
  </section>;
};

export default EventFeedback;
