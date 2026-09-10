import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { auth } from '../config/firebase';
import { useAuth } from '../helpers/useAuth';
import {
  NotificationChannel,
  VolunteerProfile,
  VolunteerTask,
  WEEKDAYS,
  effectiveTaskStatus,
  formatDate,
  isTaskFull,
  openSlots,
} from '../helpers/types';
import {
  assignVolunteerToTask,
  checkIn,
  checkOut,
  getVolunteer,
  removeVolunteerFromTask,
  subscribeTasks,
  updateVolunteer,
} from '../helpers/store';
import { enableWebPush } from '../helpers/notifications';
import { normalizePhoneNumber, validatePhoneNumber } from '../helpers/phone';
import '../pages/AdminDashboard.css';
import './VolunteerDashboard.css';
import EventFeedback from './EventFeedback';

type Tab = 'open' | 'mine' | 'feedback' | 'profile';

const VolunteerDashboard: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>('open');
  const [profile, setProfile] = useState<VolunteerProfile | null>(null);
  const [tasks, setTasks] = useState<VolunteerTask[]>([]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [taskSearch, setTaskSearch] = useState('');
  const [taskSort, setTaskSort] = useState<'soonest' | 'latest' | 'title'>('soonest');
  // Active check-in sessions: taskId -> { logId, checkInAt }
  const [activeCheckins, setActiveCheckins] = useState<
    Record<string, { logId: string; at: Date }>
  >({});

  useEffect(() => {
    if (!user) return;
    getVolunteer(user.uid).then(setProfile);
    const unsub = subscribeTasks(setTasks);
    return unsub;
  }, [user]);

  const reload = async () => {
    if (user) setProfile(await getVolunteer(user.uid));
  };

  const handleLogout = async () => {
    await signOut(auth);
    navigate('/login');
  };

  const myTasks = useMemo(
    () => (profile ? tasks.filter((t) => t.assignedVolunteers.includes(profile.uid)) : []),
    [tasks, profile]
  );

  const openTasks = useMemo(
    () =>
      profile
        ? tasks.filter(
            (t) =>
              t.openForSignup &&
              !t.assignedVolunteers.includes(profile.uid) &&
              effectiveTaskStatus(t) !== 'cancelled' &&
              effectiveTaskStatus(t) !== 'completed' &&
              t.startDateTime > new Date()
          )
        : [],
    [tasks, profile]
  );

  const filterAndSortTasks = useCallback((items: VolunteerTask[]) => {
    const q = taskSearch.trim().toLowerCase();
    return items.filter((task) => {
      const matchesSearch = !q || [task.title, task.description, task.location, task.eventName]
        .some((value) => value?.toLowerCase().includes(q));
      return matchesSearch;
    }).sort((a, b) => {
      if (taskSort === 'title') return a.title.localeCompare(b.title);
      const delta = a.startDateTime.getTime() - b.startDateTime.getTime();
      return taskSort === 'latest' ? -delta : delta;
    });
  }, [taskSearch, taskSort]);

  const visibleOpenTasks = useMemo(
    () => filterAndSortTasks(openTasks),
    [openTasks, filterAndSortTasks]
  );
  const visibleMyTasks = useMemo(
    () => filterAndSortTasks(myTasks),
    [myTasks, filterAndSortTasks]
  );

  const signUp = async (task: VolunteerTask) => {
    if (!profile) return;
    setError('');
    try {
      await assignVolunteerToTask(task, profile);
      setMessage(`You signed up for "${task.title}".`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sign up.');
    }
  };

  const withdraw = async (task: VolunteerTask) => {
    if (!profile) return;
    if (!window.confirm(`Withdraw from "${task.title}"?`)) return;
    await removeVolunteerFromTask(task, profile.uid);
    setMessage(`You withdrew from "${task.title}".`);
  };

  const doCheckIn = async (task: VolunteerTask) => {
    if (!profile) return;
    const logId = await checkIn(task, profile);
    setActiveCheckins((prev) => ({ ...prev, [task.id]: { logId, at: new Date() } }));
    setMessage(`Checked in to "${task.title}".`);
  };

  const doCheckOut = async (task: VolunteerTask) => {
    const active = activeCheckins[task.id];
    if (!active) return;
    const hours = await checkOut(active.logId, active.at);
    setActiveCheckins((prev) => {
      const next = { ...prev };
      delete next[task.id];
      return next;
    });
    await reload();
    setMessage(`Checked out. Logged ${hours}h for "${task.title}".`);
  };

  if (!profile) {
    return <div className="loading">Loading…</div>;
  }

  return (
    <div className="admin-dashboard">
      <header className="dashboard-header">
        <div>
          <h1>ISKCON Towaco Volunteer Management System</h1>
          <p>Welcome, {profile.firstName || profile.name}</p>
        </div>
        <div className="header-actions">
          <span className="user-info">{profile.totalHours}h served</span>
          <button onClick={handleLogout} className="logout-btn">
            Logout
          </button>
        </div>
      </header>

      <nav className="tab-bar">
        <button className={tab === 'open' ? 'active' : ''} onClick={() => setTab('open')}>
          Open Tasks
        </button>
        <button className={tab === 'mine' ? 'active' : ''} onClick={() => setTab('mine')}>
          My Tasks ({myTasks.length})
        </button>
        <button className={tab === 'feedback' ? 'active' : ''} onClick={() => setTab('feedback')}>
          Event Feedback
        </button>
        <button className={tab === 'profile' ? 'active' : ''} onClick={() => setTab('profile')}>
          My Profile
        </button>
        <button onClick={() => navigate('/help')}>Help</button>
      </nav>

      <div className="dashboard-content">
        {error && <div className="error-message">{error}</div>}
        {message && <div className="success-message">{message}</div>}

        {tab === 'open' && (
          <section className="panel">
            <div className="panel-head results-heading">
              <div><h2>Tasks you can sign up for</h2><p className="muted small">{visibleOpenTasks.length} opportunities shown</p></div>
            </div>
            <VolunteerTaskFilters search={taskSearch} setSearch={setTaskSearch} sort={taskSort} setSort={setTaskSort} />
            {visibleOpenTasks.length === 0 && <div className="empty-state"><strong>No matching open tasks</strong><span>Try another search.</span></div>}
            <div className="task-list">
              {visibleOpenTasks.map((task) => {
                const full = isTaskFull(task);
                return (
                  <div key={task.id} className="task-card">
                    <div className="task-card-head">
                      <div>
                        <h3>
                          {task.title}
                        </h3>
                        {task.eventName && <p className="event-label">{task.eventName}</p>}
                        <p className="muted">
                          {formatDate(task.startDateTime)}
                          {task.location ? ` · ${task.location}` : ''}
                        </p>
                      </div>
                    </div>
                    {task.description && <p>{task.description}</p>}
                    <p className="small">{openSlots(task)} of {task.volunteersNeeded} slots open</p>
                    <button
                      className="primary-btn"
                      disabled={full}
                      onClick={() => signUp(task)}
                    >
                      {full ? 'Full' : 'Sign up'}
                    </button>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {tab === 'mine' && (
          <section className="panel">
            <div className="panel-head results-heading">
              <div><h2>Your tasks</h2><p className="muted small">{visibleMyTasks.length} assignments shown</p></div>
            </div>
            <VolunteerTaskFilters search={taskSearch} setSearch={setTaskSearch} sort={taskSort} setSort={setTaskSort} />
            {visibleMyTasks.length === 0 && <div className="empty-state"><strong>No matching assignments</strong><span>Your assigned tasks will appear here.</span></div>}
            <div className="task-list">
              {visibleMyTasks.map((task) => {
                const checkedIn = Boolean(activeCheckins[task.id]);
                const status = effectiveTaskStatus(task);
                const isToday =
                  Math.abs(task.startDateTime.getTime() - Date.now()) < 24 * 3600 * 1000;
                return (
                  <div key={task.id} className="task-card">
                    <div className="task-card-head">
                      <div>
                        <h3>{task.title}</h3>
                        {task.eventName && <p className="event-label">{task.eventName}</p>}
                        <p className="muted">
                          {formatDate(task.startDateTime)}
                          {task.location ? ` · ${task.location}` : ''}
                        </p>
                      </div>
                      <span className={`status-badge status-${status}`}>{status}</span>
                    </div>
                    {task.description && <p>{task.description}</p>}
                    <div className="task-actions">
                      {isToday && !checkedIn && (
                        <button className="secondary-btn" onClick={() => doCheckIn(task)}>
                          Check in
                        </button>
                      )}
                      {checkedIn && (
                        <button className="primary-btn" onClick={() => doCheckOut(task)}>
                          Check out
                        </button>
                      )}
                      {task.openForSignup && status !== 'completed' && status !== 'cancelled' && (
                        <button className="link-btn danger" onClick={() => withdraw(task)}>
                          Withdraw
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {tab === 'profile' && (
          <ProfileTab profile={profile} onSaved={reload} setError={setError} setMessage={setMessage} />
        )}
        {tab === 'feedback' && (
          <EventFeedback profile={profile} tasks={tasks} setError={setError} setMessage={setMessage} />
        )}
      </div>
    </div>
  );
};

const VolunteerTaskFilters: React.FC<{
  search: string;
  setSearch: (value: string) => void;
  sort: 'soonest' | 'latest' | 'title';
  setSort: (value: 'soonest' | 'latest' | 'title') => void;
}> = ({ search, setSearch, sort, setSort }) => (
  <div className="filter-bar volunteer-task-filters">
    <label className="search-field"><span>Search</span><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Task, event, or location" /></label>
    <label><span>Sort</span><select value={sort} onChange={(e) => setSort(e.target.value as 'soonest' | 'latest' | 'title')}><option value="soonest">Soonest first</option><option value="latest">Latest first</option><option value="title">Task name</option></select></label>
  </div>
);

// ---------------------------------------------------------------------------
// Profile tab
// ---------------------------------------------------------------------------

const ProfileTab: React.FC<{
  profile: VolunteerProfile;
  onSaved: () => void;
  setError: (s: string) => void;
  setMessage: (s: string) => void;
}> = ({ profile, onSaved, setError, setMessage }) => {
  const [firstName, setFirstName] = useState(profile.firstName);
  const [lastName, setLastName] = useState(profile.lastName);
  const [phoneNumber, setPhoneNumber] = useState(
    profile.phoneNumber || sessionStorage.getItem(`pendingPhone:${profile.uid}`) || ''
  );
  const [phoneTouched, setPhoneTouched] = useState(false);
  const [availability, setAvailability] = useState<string[]>(profile.availability);
  const [prefs, setPrefs] = useState(profile.notificationPrefs);
  const [pushBusy, setPushBusy] = useState(false);
  const phoneValidation = validatePhoneNumber(phoneNumber);
  const toggle = (list: string[], value: string, setter: (v: string[]) => void) =>
    setter(list.includes(value) ? list.filter((x) => x !== value) : [...list, value]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      if (!firstName.trim() || !lastName.trim()) throw new Error('Name is required.');
      const normalizedPhone = normalizePhoneNumber(phoneNumber, true);
      await updateVolunteer(profile.uid, {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phoneNumber: normalizedPhone,
        availability,
        notificationPrefs: prefs,
      });
      sessionStorage.removeItem(`pendingPhone:${profile.uid}`);
      setMessage('Profile updated.');
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save profile.');
    }
  };

  const setupPush = async () => {
    setPushBusy(true);
    setError('');
    try {
      await enableWebPush(profile.uid);
      setPrefs((p) => ({ ...p, push: true }));
      setMessage('Web push notifications enabled on this device.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not enable push notifications.');
    } finally {
      setPushBusy(false);
    }
  };

  return (
    <section className="panel">
      <h2>My Profile</h2>
      <form onSubmit={save} className="stacked-form">
        <div className="row">
          <input aria-label="First name" value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="First name" />
          <input aria-label="Last name" value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Last name" />
        </div>
        <input value={profile.email} disabled />
        <input
          type="tel"
          value={phoneNumber}
          onChange={(e) => setPhoneNumber(e.target.value)}
          onBlur={() => setPhoneTouched(true)}
          placeholder="Phone (for WhatsApp reminders)"
          autoComplete="tel"
          required
          aria-invalid={phoneTouched && !phoneValidation.valid}
          aria-describedby="profile-phone-validation"
        />
        <small
          id="profile-phone-validation"
          className="field-hint"
          style={{ color: phoneValidation.valid ? '#15803d' : phoneTouched ? '#b91c1c' : undefined }}
        >
          {phoneValidation.valid
            ? phoneValidation.message
            : phoneTouched ? phoneValidation.message : 'Include the country code for non-US numbers.'}
        </small>

        <label className="field-label">Days you're usually available</label>
        <div className="chip-group">
          {WEEKDAYS.map((d) => (
            <button
              type="button"
              key={d}
              className={`chip ${availability.includes(d) ? 'chip-on' : ''}`}
              onClick={() => toggle(availability, d, setAvailability)}
            >
              {d.slice(0, 3)}
            </button>
          ))}
        </div>

        <label className="field-label">Reminder preferences</label>
        <div className="pref-rows">
          {(['whatsapp', 'email', 'push'] as NotificationChannel[]).map((c) => (
            <label key={c} className="checkbox-row">
              <input
                type="checkbox"
                checked={prefs[c]}
                onChange={(e) => {
                  const enabled = e.target.checked;
                  if (
                    c === 'whatsapp' &&
                    !enabled &&
                    !window.confirm(
                      'Turning off WhatsApp will deactivate your volunteer profile. You will no longer receive task or service notifications. Do you want to continue?'
                    )
                  ) {
                    return;
                  }
                  setPrefs({ ...prefs, [c]: enabled });
                }}
              />
              {c === 'whatsapp' ? 'WhatsApp (required while active)' : c === 'email' ? 'Email' : 'Browser push'}
            </label>
          ))}
        </div>
        <p className="muted small">
          Optional and informational only. If no days are selected, you can still sign up or be assigned to any task.
        </p>
        <p className="muted small">
          Turning off WhatsApp deactivates your profile, prevents new task assignments, and stops
          task and service notifications. Your service history is preserved.
        </p>

        <button type="submit" className="primary-btn" disabled={!phoneValidation.valid}>
          Save Profile
        </button>
      </form>

      <div className="push-setup">
        <button className="secondary-btn" onClick={setupPush} disabled={pushBusy}>
          {pushBusy ? 'Enabling…' : 'Enable browser push on this device'}
        </button>
        <p className="muted small">
          Web push works after you allow notifications in your browser. WhatsApp and email
          reminders don't require this.
        </p>
      </div>
    </section>
  );
};

export default VolunteerDashboard;
