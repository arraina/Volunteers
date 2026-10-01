import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getPublicEventFeedbackForm, submitPublicEventFeedback } from '../helpers/eventFeedback';
import './EventFeedback.css';

const PublicEventFeedback: React.FC = () => {
  const [params] = useSearchParams(); const token = params.get('token') || '';
  const [event, setEvent] = useState<{ id: string; name: string; dateMillis: number | null } | null>(null);
  const [rating, setRating] = useState(0); const [feedbackText, setFeedbackText] = useState(''); const [respondentName, setRespondentName] = useState('');
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const [saved, setSaved] = useState(false);
  useEffect(() => { getPublicEventFeedbackForm(token).then((result) => setEvent(result.event)).catch((cause) => setError(cause instanceof Error ? cause.message : 'Feedback form could not be loaded.')); }, [token]);
  const submit = async (e: React.FormEvent) => { e.preventDefault(); setBusy(true); setError(''); try { await submitPublicEventFeedback({ token, rating, feedbackText, respondentName }); setSaved(true); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Feedback could not be submitted.'); } finally { setBusy(false); } };
  return <main className="public-feedback-page"><section className="public-feedback-card"><p className="eyebrow">ISKCON PARSIPPANY COMMUNITY HUB</p>{error && !event ? <><h1>Event feedback</h1><div className="error-message">{error}</div></> : !event ? <p>Loading feedback form…</p> : saved ? <><h1>Thank you</h1><p>Your feedback for <strong>{event.name}</strong> was received.</p></> : <><h1>{event.name}</h1>{event.dateMillis && <p className="muted">{new Date(event.dateMillis).toLocaleDateString()}</p>}<p>Choose a rating and share your comments. You may leave your name blank.</p><form className="stacked-form" onSubmit={submit}><label className="field-label" htmlFor="public-feedback-name">Name (optional)</label><input id="public-feedback-name" maxLength={120} value={respondentName} onChange={(e) => setRespondentName(e.target.value)} placeholder="Your name" /><fieldset className="feedback-stars"><legend>Overall rating</legend>{[1, 2, 3, 4, 5].map((value) => <button type="button" key={value} className={value <= rating ? 'selected' : ''} aria-label={`${value} star${value === 1 ? '' : 's'}`} onClick={() => setRating(value)}>★</button>)}</fieldset><label className="field-label">Your feedback</label><textarea className="event-feedback-textarea" rows={12} maxLength={5000} value={feedbackText} onChange={(e) => setFeedbackText(e.target.value)} placeholder="What went well? What could improve?" required />{error && <div className="error-message">{error}</div>}<button className="primary-btn" disabled={busy || !rating || !feedbackText.trim()}>{busy ? 'Submitting…' : 'Submit feedback'}</button></form></>}</section></main>;
};

export default PublicEventFeedback;
