import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { auth } from '../config/firebase';
import { useAuth } from '../helpers/useAuth';
import { assignVolunteerToTask, getTask, getVolunteer } from '../helpers/store';
import { VolunteerProfile, VolunteerTask, effectiveTaskStatus, formatDate, isTaskFull, openSlots } from '../helpers/types';
import { shareTask } from '../helpers/taskShare';
import '../pages/AdminDashboard.css';
import './SharedTask.css';

const SharedTask: React.FC = () => {
  const { taskId = '' } = useParams();
  const { user, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [task, setTask] = useState<VolunteerTask | null>(null);
  const [profile, setProfile] = useState<VolunteerProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!user || !taskId) return;
    Promise.all([getTask(taskId), getVolunteer(user.uid)])
      .then(([nextTask, nextProfile]) => {
        setTask(nextTask);
        setProfile(nextProfile);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load this task.'))
      .finally(() => setLoading(false));
  }, [taskId, user]);

  const status = task ? effectiveTaskStatus(task) : 'open';
  const assigned = Boolean(task && profile && task.assignedVolunteers.includes(profile.uid));
  const signupClosed = useMemo(() => !task || task.deleted === true || !task.openForSignup
    || task.startDateTime <= new Date() || ['completed', 'cancelled'].includes(status) || isTaskFull(task), [task, status]);

  const signup = async () => {
    if (!task || !profile) return;
    setBusy(true);
    setError('');
    try {
      await assignVolunteerToTask(task, profile);
      setTask({ ...task, assignedVolunteers: task.assignedVolunteers.includes(profile.uid)
        ? task.assignedVolunteers
        : [...task.assignedVolunteers, profile.uid] });
      setMessage(`You are signed up for ${task.title}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sign up for this task.');
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <div className="loading">Loading task…</div>;

  return <main className="shared-task-page">
    <section className="shared-task-card">
      <p className="shared-task-kicker">Volunteer opportunity</p>
      {!task ? <>
        <h1>Task not found</h1>
        <p>This task may have been removed or the link may be incorrect.</p>
      </> : <>
        <div className="shared-task-heading">
          <div><h1>{task.title}</h1>{task.eventName && <p className="event-label">{task.eventName}</p>}</div>
          <span className={`status-badge status-${status}`}>{status}</span>
        </div>
        <dl className="shared-task-details">
          <div><dt>Date and time</dt><dd>{formatDate(task.startDateTime)}</dd></div>
          {task.location && <div><dt>Location</dt><dd>{task.location}</dd></div>}
          <div><dt>Availability</dt><dd>{openSlots(task)} of {task.volunteersNeeded} spots open</dd></div>
        </dl>
        {task.description && <p className="shared-task-description">{task.description}</p>}
        {error && <div className="error-message">{error}</div>}
        {message && <div className="success-message">{message}</div>}
        {!profile && <div className="error-message">Your account does not have a volunteer profile. Ask the Owner to add or connect one before signing up.</div>}
        {assigned && <div className="success-message">You are already signed up for this task.</div>}
        {!assigned && signupClosed && <div className="empty-state"><strong>Signup unavailable</strong><span>This task is full, closed, cancelled, completed, or has already started.</span></div>}
        <div className="shared-task-actions">
          {!assigned && !signupClosed && profile && <button className="primary-btn" disabled={busy} onClick={signup}>{busy ? 'Signing up…' : 'Confirm signup'}</button>}
          <button className="secondary-btn" onClick={() => shareTask(task)}>Share task</button>
          <button className="secondary-btn" onClick={() => navigate(isAdmin ? '/admin' : '/dashboard')}>Go to dashboard</button>
        </div>
      </>}
      <button className="text-btn shared-task-logout" onClick={async () => { await signOut(auth); navigate('/login'); }}>Use another account</button>
    </section>
  </main>;
};

export default SharedTask;
