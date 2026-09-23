import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { auth } from '../config/firebase';
import { useAuth } from '../helpers/useAuth';
import {
  VolunteerProfile,
  VolunteerTask,
  TempleEvent,
  WEEKDAYS,
  effectiveTaskStatus,
  formatDate,
  isTaskFull,
  openSlots,
} from '../helpers/types';
import {
  assignVolunteerToTask,
  assertVolunteerPhoneAvailable,
  createTask,
  checkIn,
  checkOut,
  getPastTasks,
  getVolunteer,
  removeVolunteerFromTask,
  subscribeEvents,
  subscribeTasks,
  updateVolunteer,
  getVolunteerDirectory,
  manageVolunteerTaskAssignment,
  VolunteerDirectoryEntry,
  updateTaskManagementFields,
  trashOwnTask,
} from '../helpers/store';
import { fromEasternDateTimeInput, toEasternDateTimeInput } from '../helpers/taskDateTime';
import { normalizePhoneNumber, validatePhoneNumber } from '../helpers/phone';
import { findTaskScheduleConflicts } from '../helpers/scheduleConflicts';
import { shareTask } from '../helpers/taskShare';
import '../pages/AdminDashboard.css';
import './VolunteerDashboard.css';
import EventFeedback from './EventFeedback';
import EventCalendar from './EventCalendar';
import AutoCommitDateInput from '../components/AutoCommitDateInput';

type Tab = 'open' | 'mine' | 'create' | 'calendar' | 'past' | 'feedback' | 'profile';
const VOLUNTEER_TABS: Tab[] = ['open', 'mine', 'create', 'calendar', 'past', 'feedback', 'profile'];

const VolunteerDashboard: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const requestedTab = searchParams.get('tab') as Tab | null;
  const tab: Tab = requestedTab && VOLUNTEER_TABS.includes(requestedTab) ? requestedTab : 'open';
  const chooseTab = (nextTab: Tab) => setSearchParams({ tab: nextTab });
  const [profile, setProfile] = useState<VolunteerProfile | null>(null);
  const [tasks, setTasks] = useState<VolunteerTask[]>([]);
  const [events, setEvents] = useState<TempleEvent[]>([]);
  const [directory, setDirectory] = useState<VolunteerDirectoryEntry[]>([]);
  const [historicalTasks, setHistoricalTasks] = useState<VolunteerTask[]>([]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [taskSearch, setTaskSearch] = useState('');
  const [taskSort, setTaskSort] = useState<'soonest' | 'latest' | 'title'>('soonest');
  const [openTaskFilter, setOpenTaskFilter] = useState<'all' | 'available' | 'full'>('available');
  // Active check-in sessions: taskId -> { logId, checkInAt }
  const [activeCheckins, setActiveCheckins] = useState<
    Record<string, { logId: string; at: Date }>
  >({});

  useEffect(() => {
    if (!user) return;
    getVolunteer(user.uid).then(setProfile);
    getPastTasks().then(setHistoricalTasks).catch(() => setHistoricalTasks([]));
    const unsub = subscribeTasks(setTasks);
    const unsubEvents = subscribeEvents(setEvents);
    getVolunteerDirectory().then(setDirectory).catch(() => setDirectory([]));
    return () => { unsub(); unsubEvents(); };
  }, [user]);

  const reload = async () => {
    if (user) setProfile(await getVolunteer(user.uid));
  };

  const handleLogout = async () => {
    await signOut(auth);
    navigate('/login');
  };

  const myTasks = useMemo(
    () => (profile ? tasks.filter((t) =>
      t.assignedVolunteers.includes(profile.uid) &&
      effectiveTaskStatus(t) !== 'completed' &&
      effectiveTaskStatus(t) !== 'cancelled' &&
      t.startDateTime > new Date()
    ) : []),
    [tasks, profile]
  );

  const pastTasks = useMemo(() => {
    if (!profile) return [];
    const byId = new Map<string, VolunteerTask>();
    [...historicalTasks, ...tasks].forEach((task) => byId.set(task.id, task));
    return Array.from(byId.values()).filter((task) =>
      task.assignedVolunteers.includes(profile.uid) &&
      (task.startDateTime <= new Date() || ['completed', 'cancelled'].includes(effectiveTaskStatus(task)))
    );
  }, [historicalTasks, tasks, profile]);

  const scheduleConflicts = useMemo(() => findTaskScheduleConflicts(myTasks), [myTasks]);
  const conflictsByTask = useMemo(() => {
    const result = new Map<string, VolunteerTask[]>();
    scheduleConflicts.forEach(({ first, second }) => {
      result.set(first.id, [...(result.get(first.id) || []), second]);
      result.set(second.id, [...(result.get(second.id) || []), first]);
    });
    return result;
  }, [scheduleConflicts]);

  const openTasks = useMemo(
    () =>
      profile
        ? tasks.filter(
            (t) =>
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
    () => filterAndSortTasks(openTasks.filter((task) =>
      openTaskFilter === 'all' ||
      (openTaskFilter === 'available' ? !isTaskFull(task) : isTaskFull(task))
    )),
    [openTasks, openTaskFilter, filterAndSortTasks]
  );
  const visibleMyTasks = useMemo(
    () => filterAndSortTasks(myTasks),
    [myTasks, filterAndSortTasks]
  );
  const visiblePastTasks = useMemo(
    () => filterAndSortTasks(pastTasks),
    [pastTasks, filterAndSortTasks]
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

  if (profile.deleted) {
    return <div className="auth-page"><section className="panel auth-card">
      <h1>Profile inactive</h1>
      <p>Your volunteer profile is currently in Trash. You cannot accept tasks or receive new assignments while it is inactive. Please contact an Owner if it should be restored.</p>
      <button className="primary-btn" onClick={handleLogout}>Log out</button>
    </section></div>;
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

      <nav className="tab-bar volunteer-nav" aria-label="Volunteer navigation">
        <button className={tab === 'open' ? 'active' : ''} onClick={() => chooseTab('open')}>
          Open Tasks
        </button>
        <button className={tab === 'mine' ? 'active' : ''} onClick={() => chooseTab('mine')}>
          My Upcoming Tasks ({myTasks.length})
        </button>
        <button className={tab === 'create' ? 'active' : ''} onClick={() => chooseTab('create')}>
          Create &amp; Manage Tasks
        </button>
        <button className={tab === 'calendar' ? 'active' : ''} onClick={() => chooseTab('calendar')}>
          Event Calendar
        </button>
        <button className={tab === 'past' ? 'active' : ''} onClick={() => chooseTab('past')}>
          Past Tasks ({pastTasks.length})
        </button>
        <button className={tab === 'feedback' ? 'active' : ''} onClick={() => chooseTab('feedback')}>
          Event Feedback
        </button>
        <button className={tab === 'profile' ? 'active' : ''} onClick={() => chooseTab('profile')}>
          My Profile
        </button>
        <button onClick={() => navigate('/help')}>Help</button>
      </nav>

      <div className="dashboard-content">
        {error && <div className="error-message">{error}</div>}
        {message && <div className="success-message">{message}</div>}
        {scheduleConflicts.length > 0 && (
          <div className="schedule-conflict-banner" role="alert">
            <strong>Schedule warning: {scheduleConflicts.length} overlapping task {scheduleConflicts.length === 1 ? 'pair' : 'pairs'}.</strong>
            <span>You are still assigned. Open My Upcoming Tasks to review the times and withdraw or contact an Admin if needed.</span>
          </div>
        )}

        {tab === 'open' && (
          <section className="panel">
            <div className="panel-head results-heading">
              <div><h2>Tasks you can sign up for</h2><p className="muted small">{visibleOpenTasks.length} opportunities shown</p></div>
            </div>
            <VolunteerTaskFilters search={taskSearch} setSearch={setTaskSearch} sort={taskSort} setSort={setTaskSort}>
              <label><span>Availability</span><select value={openTaskFilter} onChange={(e) => setOpenTaskFilter(e.target.value as typeof openTaskFilter)}>
                <option value="available">Available to sign up</option>
                <option value="full">Full tasks</option>
                <option value="all">All upcoming tasks</option>
              </select></label>
            </VolunteerTaskFilters>
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
                const conflictingTasks = conflictsByTask.get(task.id) || [];
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
                    {conflictingTasks.length > 0 && (
                      <p className="task-conflict-warning" role="status">
                        <strong>Schedule overlap:</strong>{' '}
                        {conflictingTasks.map((item) => `${item.title} (${formatDate(item.startDateTime)})`).join('; ')}
                      </p>
                    )}
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
                      {status !== 'completed' && status !== 'cancelled' && (
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

        {tab === 'create' && (
          <VolunteerTaskManagement
            profile={profile}
            tasks={tasks}
            events={events}
            directory={directory}
            setError={setError}
            setMessage={setMessage}
          />
        )}

        {tab === 'calendar' && (
          <EventCalendar
            events={events}
            tasks={tasks}
            volunteers={[profile]}
            ownerNames={Object.fromEntries(directory.map((item) => [item.uid, item.name]))}
            uid={profile.uid}
            setError={setError}
            canManage={false}
          />
        )}

        {tab === 'past' && (
          <section className="panel">
            <div className="panel-head results-heading">
              <div><h2>Your past tasks</h2><p className="muted small">{visiblePastTasks.length} previous assignments shown</p></div>
            </div>
            <VolunteerTaskFilters search={taskSearch} setSearch={setTaskSearch} sort={taskSort} setSort={setTaskSort} />
            {visiblePastTasks.length === 0 && <div className="empty-state"><strong>No matching past tasks</strong><span>Completed and cancelled assignments will appear here.</span></div>}
            <div className="task-list">
              {visiblePastTasks.map((task) => {
                const status = effectiveTaskStatus(task);
                return <div key={task.id} className="task-card">
                  <div className="task-card-head">
                    <div><h3>{task.title}</h3>{task.eventName && <p className="event-label">{task.eventName}</p>}<p className="muted">{formatDate(task.startDateTime)}{task.location ? ` · ${task.location}` : ''}</p></div>
                    <span className={`status-badge status-${status}`}>{status}</span>
                  </div>
                  {task.description && <p>{task.description}</p>}
                  <p className="muted small">You were assigned to this task.</p>
                </div>;
              })}
            </div>
          </section>
        )}
        {tab === 'feedback' && (
          <EventFeedback profile={profile} tasks={tasks} setError={setError} setMessage={setMessage} />
        )}
      </div>
    </div>
  );
};

const emptyCreatorForm = {
  title: '', description: '', startDateTime: '', endDateTime: '', location: '',
  volunteersNeeded: '1', reminderHoursBefore: '24',
};

const VolunteerTaskManagement: React.FC<{
  profile: VolunteerProfile;
  tasks: VolunteerTask[];
  events: TempleEvent[];
  directory: VolunteerDirectoryEntry[];
  setError: (value: string) => void;
  setMessage: (value: string) => void;
}> = ({ profile, tasks, events, directory, setError, setMessage }) => {
  const [form, setForm] = useState(emptyCreatorForm);
  const [saving, setSaving] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState('');
  const [assignmentChoice, setAssignmentChoice] = useState<Record<string, string>>({});
  const [assignmentBusy, setAssignmentBusy] = useState('');
  const createdTasks = useMemo(() => tasks.filter((task) => task.createdBy === profile.uid && task.startDateTime > new Date()), [tasks, profile.uid]);
  const directoryById = useMemo(() => new Map(directory.map((item) => [item.uid, item.name])), [directory]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(''); setMessage(''); setSaving(true);
    try {
      const start = fromEasternDateTimeInput(form.startDateTime);
      const end = form.endDateTime ? fromEasternDateTimeInput(form.endDateTime) : null;
      if (!form.title.trim()) throw new Error('Task title is required.');
      if (!Number.isFinite(start.getTime())) throw new Error('Enter a valid start date and time.');
      if (end && end <= start) throw new Error('End time must be after the start time.');
      const reminder = Number(form.reminderHoursBefore);
      if (!Number.isFinite(reminder) || reminder <= 0) throw new Error('Enter one reminder time greater than zero.');
      if (editingTaskId) {
        await updateTaskManagementFields(editingTaskId, {
          title: form.title, description: form.description, startDateTime: start, endDateTime: end,
          location: form.location, volunteersNeeded: Math.max(1, Number(form.volunteersNeeded) || 1),
          reminderHoursBefore: [reminder], openForSignup: true,
        });
      } else {
        await createTask({
          title: form.title, description: form.description, startDateTime: start, endDateTime: end,
          location: form.location, volunteersNeeded: Math.max(1, Number(form.volunteersNeeded) || 1),
          openForSignup: true, recurrence: 'none', reminderHoursBefore: [reminder], createdBy: profile.uid,
        });
      }
      setForm(emptyCreatorForm);
      setEditingTaskId('');
      setMessage(editingTaskId ? 'Task updated.' : 'Task published. Other volunteers, Admins, and the Owner can sign up immediately.');
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not create the task.'); }
    finally { setSaving(false); }
  };

  const editTask = (task: VolunteerTask) => {
    const easternValue = (date?: Date) => date ? new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).format(date).replace(' ', 'T') : '';
    setEditingTaskId(task.id);
    setForm({
      title: task.title, description: task.description || '',
      startDateTime: easternValue(task.startDateTime), endDateTime: easternValue(task.endDateTime),
      location: task.location || '', volunteersNeeded: String(task.volunteersNeeded),
      reminderHoursBefore: String(task.reminderHoursBefore[0] || 24),
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const changeAssignment = async (task: VolunteerTask, volunteerId: string, action: 'add' | 'remove') => {
    setAssignmentBusy(`${task.id}:${volunteerId}`); setError('');
    try {
      await manageVolunteerTaskAssignment(task.id, volunteerId, action);
      setMessage(action === 'add' ? 'Volunteer assigned.' : 'Volunteer removed from the task.');
      if (action === 'add') setAssignmentChoice((current) => ({ ...current, [task.id]: '' }));
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not update the assignment.'); }
    finally { setAssignmentBusy(''); }
  };

  return <div className="two-col volunteer-create-layout">
    <section className="panel">
      <h2>{editingTaskId ? 'Edit Task' : 'Create Task'}</h2>
      <p className="muted small">Create standalone, one-time tasks. They publish immediately and support one WhatsApp reminder for each assigned or signed-up person.</p>
      <form className="stacked-form" onSubmit={submit}>
        <input placeholder="Task title" required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        <textarea placeholder="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        <label><span>Start (Eastern Time — ET)</span><AutoCommitDateInput type="datetime-local" required value={form.startDateTime} min={toEasternDateTimeInput(new Date())} onValueChange={(value) => setForm({ ...form, startDateTime: value })} /></label>
        <label><span>End (optional, Eastern Time — ET)</span><AutoCommitDateInput type="datetime-local" value={form.endDateTime} onValueChange={(value) => setForm({ ...form, endDateTime: value })} /></label>
        <input placeholder="Location" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
        <label><span>Volunteers needed</span><input type="number" min="1" required value={form.volunteersNeeded} onChange={(e) => setForm({ ...form, volunteersNeeded: e.target.value })} /></label>
        <label><span>One reminder (hours before task)</span><input type="number" min="1" step="1" required value={form.reminderHoursBefore} onChange={(e) => setForm({ ...form, reminderHoursBefore: e.target.value })} /></label>
        <button className="primary-btn" disabled={saving}>{saving ? 'Saving…' : editingTaskId ? 'Save Changes' : 'Publish Task'}</button>
        {editingTaskId && <button type="button" className="secondary-btn" onClick={() => { setEditingTaskId(''); setForm(emptyCreatorForm); }}>Cancel editing</button>}
      </form>
    </section>
    <section className="panel">
      <h2>Tasks Created by Me ({createdTasks.length})</h2>
      {createdTasks.length === 0 && <div className="empty-state"><strong>No upcoming tasks created</strong><span>Create a task using the form.</span></div>}
      <div className="task-list">{createdTasks.map((task) => <div className="task-card" key={task.id}>
        <div className="task-card-head"><div><h3>{task.title}</h3><p className="muted">{formatDate(task.startDateTime)}{task.location ? ` · ${task.location}` : ''}</p></div><span>{task.assignedVolunteers.length}/{task.volunteersNeeded}</span></div>
        <p className="muted small">Reminder: {task.reminderHoursBefore[0]} hour(s) before</p>
        <label><span>Assign a volunteer</span><select value={assignmentChoice[task.id] || ''} onChange={(e) => setAssignmentChoice({ ...assignmentChoice, [task.id]: e.target.value })}>
          <option value="">Choose volunteer…</option>{directory.filter((item) => !task.assignedVolunteers.includes(item.uid)).map((item) => <option key={item.uid} value={item.uid}>{item.name}</option>)}
        </select></label>
        <button className="secondary-btn" disabled={!assignmentChoice[task.id] || Boolean(assignmentBusy)} onClick={() => changeAssignment(task, assignmentChoice[task.id], 'add')}>Assign</button>
        <div className="task-actions"><button className="secondary-btn" onClick={() => shareTask(task)}>Share task</button><button className="link-btn" onClick={() => editTask(task)}>Edit task</button><button className="link-btn danger" onClick={async () => {
          if (!window.confirm(`Delete “${task.title}”? It will be moved to Trash and removed from volunteer task lists.`)) return;
          try { await trashOwnTask(task.id, profile.uid); setMessage('Task moved to Trash.'); }
          catch (err) { setError(err instanceof Error ? err.message : 'Could not delete the task.'); }
        }}>Delete task</button></div>
        {task.assignedVolunteers.length > 0 && <div className="assigned-volunteer-list">{task.assignedVolunteers.map((id) => <div className="row" key={id}><span>{directoryById.get(id) || 'Assigned volunteer'}</span><button className="link-btn danger" disabled={Boolean(assignmentBusy)} onClick={() => changeAssignment(task, id, 'remove')}>Remove</button></div>)}</div>}
      </div>)}</div>
    </section>
  </div>;
};

const VolunteerTaskFilters: React.FC<{
  search: string;
  setSearch: (value: string) => void;
  sort: 'soonest' | 'latest' | 'title';
  setSort: (value: 'soonest' | 'latest' | 'title') => void;
  children?: React.ReactNode;
}> = ({ search, setSearch, sort, setSort, children }) => (
  <div className="filter-bar volunteer-task-filters">
    <label className="search-field"><span>Search</span><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Task, event, or location" /></label>
    <label><span>Sort</span><select value={sort} onChange={(e) => setSort(e.target.value as 'soonest' | 'latest' | 'title')}><option value="soonest">Soonest first</option><option value="latest">Latest first</option><option value="title">Task name</option></select></label>
    {children}
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
  const [prefs, setPrefs] = useState({ ...profile.notificationPrefs, email: true });
  const phoneValidation = validatePhoneNumber(phoneNumber);
  const toggle = (list: string[], value: string, setter: (v: string[]) => void) =>
    setter(list.includes(value) ? list.filter((x) => x !== value) : [...list, value]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      if (!firstName.trim() || !lastName.trim()) throw new Error('Name is required.');
      const normalizedPhone = normalizePhoneNumber(phoneNumber, true);
      await assertVolunteerPhoneAvailable(normalizedPhone, profile.uid);
      await updateVolunteer(profile.uid, {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phoneNumber: normalizedPhone,
        availability,
        notificationPrefs: { ...prefs, email: true },
      });
      sessionStorage.removeItem(`pendingPhone:${profile.uid}`);
      setMessage('Profile updated.');
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save profile.');
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
        <p className="reminder-number-notice">
          Automatic WhatsApp reminders are sent from the temple phone number{' '}
          <a href="tel:+19732990970">+1 (973) 299-0970</a>. Please add this number to your
          contacts so you recognize temple reminders.
        </p>
        <div className="pref-rows">
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={prefs.whatsapp}
              onChange={(e) => {
                const enabled = e.target.checked;
                if (
                  !enabled &&
                  !window.confirm(
                    'Turning off WhatsApp will deactivate your volunteer profile. You will no longer receive task or service notifications. Do you want to continue?'
                  )
                ) {
                  return;
                }
                setPrefs({ ...prefs, whatsapp: enabled });
              }}
            />
            WhatsApp (required while active)
          </label>
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

    </section>
  );
};

export default VolunteerDashboard;
