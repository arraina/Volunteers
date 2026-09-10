import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  createUserWithEmailAndPassword,
  deleteUser,
  getAuth,
  sendPasswordResetEmail,
  signOut,
} from 'firebase/auth';
import { deleteApp, initializeApp } from 'firebase/app';
import { auth, firebaseConfig } from '../config/firebase';
import { useAuth } from '../helpers/useAuth';
import {
  NotificationChannel,
  EventFeedbackRecord,
  RecurrenceFrequency,
  TaskStatus,
  TempleEvent,
  VolunteerProfile,
  VolunteerTask,
  SentMessage,
  effectiveTaskStatus,
  formatDate,
  openSlots,
} from '../helpers/types';
import {
  assignVolunteerToTask,
  createAnnouncement,
  createInvitedVolunteerProfile,
  createTask,
  subscribeEvents,
  deleteTaskScoped,
  deleteVolunteer,
  getHourLogs,
  getEventFeedbackRecords,
  getPastTasks,
  getSentMessages,
  groupTasksBySeries,
  removeVolunteerFromTask,
  recordInvitationSent,
  SeriesScope,
  subscribeTasks,
  subscribeVolunteers,
  updateTaskStatusScoped,
  updateVolunteer,
  DEFAULT_HORIZON_WEEKS,
} from '../helpers/store';
import { HourLog } from '../helpers/types';
import AICreateTab from './AICreate';
import EventWorkspace from './EventWorkspace';
import './AdminDashboard.css';

type Tab = 'tasks' | 'ai' | 'events' | 'volunteers' | 'announcements' | 'history' | 'reports';

const STATUS_OPTIONS: TaskStatus[] = ['open', 'filled', 'completed', 'cancelled'];

const emptyTaskForm = {
  title: '',
  description: '',
  startDateTime: '',
  endDateTime: '',
  location: '',
  volunteersNeeded: '1',
  openForSignup: true,
  recurrence: 'none' as RecurrenceFrequency,
  reminderHoursBefore: '24',
  horizonWeeks: String(DEFAULT_HORIZON_WEEKS),
  eventId: '',
};

// Preset horizons for recurring tasks (weeks).
const HORIZON_PRESETS: { label: string; weeks: number }[] = [
  { label: '3 months', weeks: 13 },
  { label: '6 months', weeks: 26 },
  { label: '1 year', weeks: 52 },
  { label: '2 years', weeks: 104 },
  { label: '5 years', weeks: 260 },
  { label: '10 years', weeks: 520 },
];

const emptyVolunteerForm = {
  firstName: '',
  lastName: '',
  email: '',
  phoneNumber: '',
  whatsappOptIn: true,
};

const invitationSettings = () => ({
  url: `${window.location.origin}${window.location.pathname.startsWith('/Volunteers') ? '/Volunteers' : ''}/login`,
});

function temporaryPassword(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
}

async function createVolunteerInvitation(input: typeof emptyVolunteerForm): Promise<void> {
  const inviteApp = initializeApp(firebaseConfig, `volunteer-invite-${Date.now()}-${crypto.randomUUID()}`);
  const inviteAuth = getAuth(inviteApp);
  let invitedUser: Awaited<ReturnType<typeof createUserWithEmailAndPassword>>['user'] | null = null;
  let profileCreated = false;
  try {
    const email = input.email.trim().toLowerCase();
    const credential = await createUserWithEmailAndPassword(inviteAuth, email, temporaryPassword());
    invitedUser = credential.user;
    await createInvitedVolunteerProfile(invitedUser.uid, input, true);
    profileCreated = true;
    await sendPasswordResetEmail(auth, email, invitationSettings());
    await recordInvitationSent(invitedUser.uid).catch(() => undefined);
  } catch (error) {
    if (profileCreated && invitedUser) await deleteVolunteer(invitedUser.uid).catch(() => undefined);
    if (invitedUser) await deleteUser(invitedUser).catch(() => undefined);
    throw error;
  } finally {
    await signOut(inviteAuth).catch(() => undefined);
    await deleteApp(inviteApp);
  }
}

const AdminDashboard: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>('tasks');
  const [tasks, setTasks] = useState<VolunteerTask[]>([]);
  const [volunteers, setVolunteers] = useState<VolunteerProfile[]>([]);
  const [events, setEvents] = useState<TempleEvent[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    const unsubTasks = subscribeTasks(setTasks);
    const unsubVols = subscribeVolunteers(setVolunteers);
    const unsubEvents = subscribeEvents(setEvents);
    return () => {
      unsubTasks();
      unsubVols();
      unsubEvents();
    };
  }, []);

  const handleLogout = async () => {
    await signOut(auth);
    navigate('/login');
  };

  return (
    <div className="admin-dashboard">
      <header className="dashboard-header">
        <div>
          <h1>ISKCON Towaco Volunteer Management System</h1>
          <p>Admin</p>
        </div>
        <div className="header-actions">
          <span className="user-info">{user?.email}</span>
          <button onClick={handleLogout} className="logout-btn">
            Logout
          </button>
        </div>
      </header>

      <nav className="tab-bar">
        <button className={tab === 'tasks' ? 'active' : ''} onClick={() => setTab('tasks')}>
          Tasks
        </button>
        <button className={tab === 'ai' ? 'active' : ''} onClick={() => setTab('ai')}>
          AI Create
        </button>
        <button className={tab === 'events' ? 'active' : ''} onClick={() => setTab('events')}>
          Event Workspace
        </button>
        <button
          className={tab === 'volunteers' ? 'active' : ''}
          onClick={() => setTab('volunteers')}
        >
          Volunteers
        </button>
        <button
          className={tab === 'announcements' ? 'active' : ''}
          onClick={() => setTab('announcements')}
        >
          Announcements
        </button>
        <button className={tab === 'history' ? 'active' : ''} onClick={() => setTab('history')}>
          History
        </button>
        <button className={tab === 'reports' ? 'active' : ''} onClick={() => setTab('reports')}>
          Analytics
        </button>
      </nav>

      <div className="dashboard-content">
        {error && <div className="error-message">{error}</div>}
        {tab === 'tasks' && (
          <TasksTab
            tasks={tasks}
            volunteers={volunteers}
            events={events}
            setError={setError}
            uid={user?.uid}
          />
        )}
        {tab === 'ai' && (
          <AICreateTab
            uid={user?.uid}
            events={events}
            tasks={tasks}
            volunteers={volunteers}
            setError={setError}
          />
        )}
        {tab === 'events' && <EventWorkspace uid={user?.uid} events={events} tasks={tasks} setError={setError} />}
        {tab === 'volunteers' && <VolunteersTab volunteers={volunteers} setError={setError} />}
        {tab === 'announcements' && (
          <AnnouncementsTab uid={user?.uid} setError={setError} />
        )}
        {tab === 'history' && <HistoryTab volunteers={volunteers} setError={setError} />}
        {tab === 'reports' && <ReportsTab volunteers={volunteers} tasks={tasks} events={events} />}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Tasks tab
// ---------------------------------------------------------------------------

const TasksTab: React.FC<{
  tasks: VolunteerTask[];
  volunteers: VolunteerProfile[];
  events: TempleEvent[];
  setError: (s: string) => void;
  uid?: string;
}> = ({ tasks, volunteers, events, setError, uid }) => {
  const [form, setForm] = useState(emptyTaskForm);
  const [saving, setSaving] = useState(false);
  const [taskSearch, setTaskSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | TaskStatus>('all');
  const [eventFilter, setEventFilter] = useState('all');
  const [taskSort, setTaskSort] = useState<'soonest' | 'latest' | 'title'>('soonest');

  const volunteerById = useMemo(() => {
    const map = new Map<string, VolunteerProfile>();
    volunteers.forEach((v) => map.set(v.uid, v));
    return map;
  }, [volunteers]);

  const filteredTasks = useMemo(() => {
    const q = taskSearch.trim().toLowerCase();
    const result = tasks.filter((task) => {
      const matchesSearch = !q || [task.title, task.description, task.location, task.eventName]
        .some((value) => value?.toLowerCase().includes(q));
      const matchesStatus = statusFilter === 'all' || effectiveTaskStatus(task) === statusFilter;
      const matchesEvent = eventFilter === 'all'
        || (eventFilter === '__none__' ? !task.eventId : task.eventId === eventFilter);
      return matchesSearch && matchesStatus && matchesEvent;
    });
    return result.sort((a, b) => {
      if (taskSort === 'title') return a.title.localeCompare(b.title);
      const delta = a.startDateTime.getTime() - b.startDateTime.getTime();
      return taskSort === 'latest' ? -delta : delta;
    });
  }, [tasks, taskSearch, statusFilter, eventFilter, taskSort]);

  const taskStats = useMemo(() => ({
    total: tasks.length,
    open: tasks.filter((task) => effectiveTaskStatus(task) === 'open').length,
    needsPeople: tasks.filter((task) =>
      !['cancelled', 'completed'].includes(effectiveTaskStatus(task)) && openSlots(task) > 0
    ).length,
    assigned: tasks.reduce((sum, task) => sum + task.assignedVolunteers.length, 0),
  }), [tasks]);

  // Group tasks first by event (standalone tasks fall under "Ungrouped"),
  // then group each event's tasks into recurring series.
  const eventSections = useMemo(() => {
    const byEvent = new Map<string, { name: string; tasks: VolunteerTask[] }>();
    for (const task of filteredTasks) {
      const key = task.eventId || '__none__';
      const name = task.eventId ? task.eventName || 'Event' : 'Ungrouped tasks';
      if (!byEvent.has(key)) byEvent.set(key, { name, tasks: [] });
      byEvent.get(key)!.tasks.push(task);
    }
    const sections = Array.from(byEvent.entries()).map(([key, val]) => {
      const groups = groupTasksBySeries(val.tasks);
      if (taskSort === 'latest') groups.reverse();
      if (taskSort === 'title') groups.sort((a, b) => a.title.localeCompare(b.title));
      return { key, name: val.name, isEvent: key !== '__none__', groups };
    });
    // Events first (by earliest upcoming task), ungrouped last.
    sections.sort((a, b) => {
      if (a.key === '__none__') return 1;
      if (b.key === '__none__') return -1;
      if (taskSort === 'title') return a.name.localeCompare(b.name);
      const at = a.groups[0]?.occurrences[0]?.startDateTime.getTime() || 0;
      const bt = b.groups[0]?.occurrences[0]?.startDateTime.getTime() || 0;
      return taskSort === 'latest' ? bt - at : at - bt;
    });
    return sections;
  }, [filteredTasks, taskSort]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      if (!form.title.trim() || !form.startDateTime) {
        throw new Error('Task title and start date/time are required.');
      }
      const needed = Math.max(1, parseInt(form.volunteersNeeded, 10) || 1);
      const reminderHours = form.reminderHoursBefore
        .split(',')
        .map((s) => parseInt(s.trim(), 10))
        .filter((n) => Number.isFinite(n) && n > 0);

      await createTask({
        title: form.title,
        description: form.description,
        startDateTime: new Date(form.startDateTime),
        endDateTime: form.endDateTime ? new Date(form.endDateTime) : null,
        location: form.location,
        skillsNeeded: [],
        volunteersNeeded: needed,
        openForSignup: form.openForSignup,
        recurrence: form.recurrence,
        reminderHoursBefore: reminderHours.length ? reminderHours : [24],
        horizonWeeks:
          form.recurrence === 'none'
            ? undefined
            : Math.max(1, parseInt(form.horizonWeeks, 10) || DEFAULT_HORIZON_WEEKS),
        eventId: form.eventId || undefined,
        eventName: form.eventId
          ? events.find((ev) => ev.id === form.eventId)?.name
          : undefined,
        createdBy: uid,
      });
      setForm(emptyTaskForm);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create task.');
    } finally {
      setSaving(false);
    }
  };

  const handleAssign = async (task: VolunteerTask, volunteerId: string) => {
    const volunteer = volunteerById.get(volunteerId);
    if (!volunteer) return;
    try {
      await assignVolunteerToTask(task, volunteer);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to assign volunteer.');
      throw err;
    }
  };

  return (
    <div className="two-col">
      <section className="panel">
        <h2>Create Task</h2>
        <form onSubmit={handleCreate} className="stacked-form">
          <input
            type="text"
            placeholder="Task title (e.g. Kitchen prep for Sunday feast)"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            required
          />
          <textarea
            placeholder="Description"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
          <label className="field-label">Event (optional)</label>
          <select
            value={form.eventId}
            onChange={(e) => setForm({ ...form, eventId: e.target.value })}
          >
            <option value="">— none (standalone task) —</option>
            {events.map((ev) => (
              <option key={ev.id} value={ev.id}>
                {ev.name}
              </option>
            ))}
          </select>
          <label className="field-label">Start</label>
          <input
            type="datetime-local"
            value={form.startDateTime}
            onChange={(e) => setForm({ ...form, startDateTime: e.target.value })}
            required
          />
          <label className="field-label">End (optional)</label>
          <input
            type="datetime-local"
            value={form.endDateTime}
            onChange={(e) => setForm({ ...form, endDateTime: e.target.value })}
          />
          <input
            type="text"
            placeholder="Location"
            value={form.location}
            onChange={(e) => setForm({ ...form, location: e.target.value })}
          />
          <div className="row">
            <div>
              <label className="field-label">Volunteers needed</label>
              <input
                type="number"
                min={1}
                value={form.volunteersNeeded}
                onChange={(e) => setForm({ ...form, volunteersNeeded: e.target.value })}
              />
            </div>
            <div>
              <label className="field-label">Repeats</label>
              <select
                value={form.recurrence}
                onChange={(e) =>
                  setForm({ ...form, recurrence: e.target.value as RecurrenceFrequency })
                }
              >
                <option value="none">Does not repeat</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>
          </div>
          {form.recurrence !== 'none' && (
            <div>
              <label className="field-label">Generate occurrences for</label>
              <select
                value={form.horizonWeeks}
                onChange={(e) => setForm({ ...form, horizonWeeks: e.target.value })}
              >
                {HORIZON_PRESETS.map((h) => (
                  <option key={h.weeks} value={h.weeks}>
                    {h.label}
                  </option>
                ))}
              </select>
              <small className="field-hint">
                Dated occurrences are created ahead of time so you can assign different
                volunteers to each date. Daily tasks are capped per batch and topped up
                automatically over time.
              </small>
            </div>
          )}
          <label className="field-label">Reminder hours before (comma separated)</label>
          <input
            type="text"
            placeholder="e.g. 48, 24, 2"
            value={form.reminderHoursBefore}
            onChange={(e) => setForm({ ...form, reminderHoursBefore: e.target.value })}
          />
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={form.openForSignup}
              onChange={(e) => setForm({ ...form, openForSignup: e.target.checked })}
            />
            Let volunteers sign themselves up
          </label>
          <button type="submit" disabled={saving} className="primary-btn">
            {saving ? 'Saving…' : 'Create Task'}
          </button>
        </form>
      </section>

      <section className="panel results-panel">
        <div className="summary-strip" aria-label="Task summary">
          <div><strong>{taskStats.total}</strong><span>Upcoming</span></div>
          <div><strong>{taskStats.open}</strong><span>Open</span></div>
          <div><strong>{taskStats.needsPeople}</strong><span>Need people</span></div>
          <div><strong>{taskStats.assigned}</strong><span>Assignments</span></div>
        </div>
        <div className="panel-head results-heading">
          <div>
            <h2>Tasks</h2>
            <p className="muted small">{filteredTasks.length} of {tasks.length} occurrences shown</p>
          </div>
          {(taskSearch || statusFilter !== 'all' || eventFilter !== 'all') && (
            <button className="link-btn" onClick={() => {
              setTaskSearch('');
              setStatusFilter('all');
              setEventFilter('all');
            }}>Clear filters</button>
          )}
        </div>
        <div className="filter-bar">
          <label className="search-field">
            <span>Search</span>
            <input value={taskSearch} onChange={(e) => setTaskSearch(e.target.value)} placeholder="Task, event, or location" />
          </label>
          <label>
            <span>Status</span>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as 'all' | TaskStatus)}>
              <option value="all">All statuses</option>
              {STATUS_OPTIONS.map((status) => <option key={status} value={status}>{status.replace('_', ' ')}</option>)}
            </select>
          </label>
          <label>
            <span>Event</span>
            <select value={eventFilter} onChange={(e) => setEventFilter(e.target.value)}>
              <option value="all">All events</option>
              <option value="__none__">Standalone</option>
              {events.map((event) => <option key={event.id} value={event.id}>{event.name}</option>)}
            </select>
          </label>
          <label>
            <span>Sort</span>
            <select value={taskSort} onChange={(e) => setTaskSort(e.target.value as typeof taskSort)}>
              <option value="soonest">Soonest first</option>
              <option value="latest">Latest first</option>
              <option value="title">Task name</option>
            </select>
          </label>
        </div>
        <p className="muted small">
          Showing the next several months. Recurring tasks are grouped — expand a series to
          assign different volunteers to each date.
        </p>
        {eventSections.length === 0 && <div className="empty-state"><strong>No matching tasks</strong><span>Adjust the filters or create a new task.</span></div>}
        {eventSections.map((section) => (
          <div key={section.key} className="event-section">
            {section.isEvent && (
              <h3 className="event-heading">
                <span className="event-dot" />
                {section.name}
              </h3>
            )}
            {!section.isEvent && eventSections.some((s) => s.isEvent) && (
              <h3 className="event-heading muted">{section.name}</h3>
            )}
            <div className="task-list">
              {section.groups.map((group) => (
                <SeriesCard
                  key={group.seriesId || group.occurrences[0].id}
                  group={group}
                  volunteers={volunteers}
                  volunteerById={volunteerById}
                  onAssign={handleAssign}
                  onRemove={removeVolunteerFromTask}
                  setError={setError}
                />
              ))}
            </div>
          </div>
        ))}
      </section>
    </div>
  );
};

// A group is either a single task or a recurring series with many occurrences.
const SeriesCard: React.FC<{
  group: ReturnType<typeof groupTasksBySeries>[number];
  volunteers: VolunteerProfile[];
  volunteerById: Map<string, VolunteerProfile>;
  onAssign: (task: VolunteerTask, volunteerId: string) => Promise<void>;
  onRemove: (task: VolunteerTask, volunteerId: string) => void;
  setError: (s: string) => void;
}> = ({ group, volunteers, volunteerById, onAssign, onRemove, setError }) => {
  const isSeries = group.recurrence !== 'none' && !!group.seriesId;
  const [expanded, setExpanded] = useState(!isSeries);
  const upcoming = group.occurrences.filter((o) => o.startDateTime >= new Date());
  const next = upcoming[0] || group.occurrences[0];

  const askScope = (verb: string): SeriesScope | null => {
    if (!isSeries) return 'one';
    const all = window.confirm(
      `${verb} — apply to ALL future dates in this series?\n\nOK = this and all future dates\nCancel = just this one date`
    );
    return all ? 'future' : 'one';
  };

  return (
    <div className="task-card">
      <div className="task-card-head">
        <div>
          <h3>
            {group.title}
            {isSeries && <span className="series-tag">repeats {group.recurrence}</span>}
          </h3>
          <p className="muted small">
            {isSeries
              ? `${group.occurrences.length} occurrence(s) loaded · next ${formatDate(
                  next.startDateTime
                )}`
              : formatDate(next.startDateTime)}
          </p>
        </div>
        {isSeries && (
          <button className="link-btn" onClick={() => setExpanded((e) => !e)}>
            {expanded ? 'Collapse' : 'Show dates'}
          </button>
        )}
      </div>

      {expanded && (
        <div className="occurrence-list">
          {group.occurrences.map((task) => (
            <OccurrenceRow
              key={task.id}
              task={task}
              volunteers={volunteers}
              volunteerById={volunteerById}
              onAssign={onAssign}
              onRemove={onRemove}
              askScope={askScope}
              setError={setError}
            />
          ))}
        </div>
      )}
    </div>
  );
};

const OccurrenceRow: React.FC<{
  task: VolunteerTask;
  volunteers: VolunteerProfile[];
  volunteerById: Map<string, VolunteerProfile>;
  onAssign: (task: VolunteerTask, volunteerId: string) => Promise<void>;
  onRemove: (task: VolunteerTask, volunteerId: string) => void;
  askScope: (verb: string) => SeriesScope | null;
  setError: (s: string) => void;
}> = ({ task, volunteers, volunteerById, onAssign, onRemove, askScope, setError }) => {
  const [assigning, setAssigning] = useState(false);
  const [assignmentMessage, setAssignmentMessage] = useState('');
  const status = effectiveTaskStatus(task);
  const assignmentClosed = status === 'filled' || status === 'completed' || status === 'cancelled' || openSlots(task) === 0;
  return (
    <div className="occurrence-row">
      <div className="occurrence-head">
        <span>
          {formatDate(task.startDateTime)}
          {task.location ? ` · ${task.location}` : ''}
        </span>
        <span className={`status-badge status-${status}`}>{status}</span>
      </div>
      <p className="small muted">
        {task.assignedVolunteers.length}/{task.volunteersNeeded} filled · {openSlots(task)} open
      </p>
      {task.assignedVolunteers.length > 0 && (
        <ul className="assigned-list">
          {task.assignedVolunteers.map((vid) => (
            <li key={vid}>
              {volunteerById.get(vid)?.name || vid}
              <button className="link-btn" onClick={() => onRemove(task, vid)}>
                remove
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="task-actions">
        <select
          defaultValue=""
          disabled={assigning || assignmentClosed}
          onChange={async (e) => {
            const volunteerId = e.target.value;
            if (!volunteerId) return;
            setAssigning(true);
            setAssignmentMessage('');
            try {
              await onAssign(task, volunteerId);
              setAssignmentMessage(`${volunteerById.get(volunteerId)?.name || 'Volunteer'} assigned.`);
            } catch {
              // The parent displays the assignment error.
            } finally {
              e.target.value = '';
              setAssigning(false);
            }
          }}
        >
          <option value="">{assignmentClosed ? 'Task filled' : assigning ? 'Assigning…' : 'Assign volunteer…'}</option>
          {volunteers
            .filter((v) => !task.assignedVolunteers.includes(v.uid))
            .map((v) => {
              const assignable = v.whatsappOptIn === true
                && v.participationStatus !== 'inactive'
                && Boolean(v.phoneNumber);
              return (
                <option key={v.uid} value={v.uid} disabled={!assignable}>
                  {v.name}{assignable ? '' : ' — inactive or missing WhatsApp phone'}
                </option>
              );
            })}
        </select>
        {assignmentMessage && <span className="success-text small">{assignmentMessage}</span>}
        {status !== 'completed' && <button className="link-btn danger" onClick={async () => {
          const nextStatus: TaskStatus = status === 'cancelled' ? 'open' : 'cancelled';
          const scope = askScope(status === 'cancelled' ? 'Reopen task' : 'Cancel task');
          if (!scope) return;
          try {
            await updateTaskStatusScoped(task, nextStatus, scope);
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to update task.');
          }
        }}>
          {status === 'cancelled' ? 'Reopen' : 'Cancel task'}
        </button>}
        <button
          className="danger-btn"
          onClick={async () => {
            const scope = askScope('Delete');
            if (!scope) return;
            if (!window.confirm('Confirm delete?')) return;
            try {
              await deleteTaskScoped(task, scope);
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Failed to delete.');
            }
          }}
        >
          Delete
        </button>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Volunteers tab
// ---------------------------------------------------------------------------

const VolunteersTab: React.FC<{
  volunteers: VolunteerProfile[];
  setError: (s: string) => void;
}> = ({ volunteers, setError }) => {
  const [form, setForm] = useState(emptyVolunteerForm);
  const [editing, setEditing] = useState<string | null>(null);
  const [editForm, setEditForm] = useState(emptyVolunteerForm);
  const [search, setSearch] = useState('');
  const [volunteerSort, setVolunteerSort] = useState<'name' | 'hours' | 'newest'>('name');
  const [resendingInvitation, setResendingInvitation] = useState<string | null>(null);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      if (
        !form.firstName.trim() ||
        !form.lastName.trim() ||
        !form.email.trim() ||
        !form.phoneNumber.trim()
      ) {
        throw new Error('First name, last name, email, and phone are required.');
      }
      if (!form.whatsappOptIn) throw new Error('Confirm WhatsApp consent before adding the volunteer.');
      await createVolunteerInvitation(form);
      setForm(emptyVolunteerForm);
      window.alert('Volunteer added. A login invitation was sent by email.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add volunteer.');
    }
  };

  const resendInvitation = async (volunteer: VolunteerProfile) => {
    setError('');
    setResendingInvitation(volunteer.uid);
    try {
      await sendPasswordResetEmail(auth, volunteer.email, invitationSettings());
      await recordInvitationSent(volunteer.uid).catch(() => undefined);
      window.alert(`Invitation resent to ${volunteer.email}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not resend the invitation.');
    } finally {
      setResendingInvitation(null);
    }
  };

  const startEdit = (v: VolunteerProfile) => {
    setEditing(v.uid);
    setEditForm({
      firstName: v.firstName,
      lastName: v.lastName,
      email: v.email,
      phoneNumber: v.phoneNumber,
      whatsappOptIn: v.whatsappOptIn === true,
    });
  };

  const saveEdit = async (uid: string) => {
    try {
      await updateVolunteer(uid, {
        firstName: editForm.firstName,
        lastName: editForm.lastName,
        email: editForm.email,
        phoneNumber: editForm.phoneNumber,
      });
      setEditing(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update volunteer.');
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      const lines = text.split(/\r?\n/).filter((l) => l.trim());
      if (lines.length === 0) return;
      // Detect + skip a header row if the first cell isn't an email-ish value.
      const startIdx = /firstname|first name|name/i.test(lines[0]) ? 1 : 0;
      const rows = lines.slice(startIdx).map((line) => {
        const [firstName = '', lastName = '', email = '', phoneNumber = '', consent = ''] = line
          .split(',')
          .map((c) => c.trim().replace(/^"|"$/g, ''));
        return {
          firstName,
          lastName,
          email,
          phoneNumber,
          whatsappOptIn: !/^(false|no|n|0)$/i.test(consent),
        };
      });
      let added = 0;
      let skipped = 0;
      for (const row of rows) {
        if (
          !row.firstName ||
          !row.lastName ||
          !row.email ||
          !row.phoneNumber ||
          !row.whatsappOptIn
        ) {
          skipped += 1;
          continue;
        }
        try {
          await createVolunteerInvitation(row);
          added += 1;
        } catch {
          skipped += 1;
        }
      }
      setError('');
      window.alert(`Imported ${added} volunteer(s). Skipped ${skipped} (duplicates/invalid).`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to import CSV.');
    }
  };

  const exportCsv = () => {
    const header = 'Name,Email,Phone,Total Hours,Joined\n';
    const rows = volunteers
      .map((v) =>
        [
          v.name,
          v.email,
          v.phoneNumber,
          v.totalHours,
          v.joinedDate.toLocaleDateString(),
        ].join(',')
      )
      .join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'volunteers.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const filtered = volunteers.filter((v) => {
    const q = search.trim().toLowerCase();
    const matchesSearch = !q || [v.name, v.email, v.phoneNumber]
      .some((value) => value.toLowerCase().includes(q));
    return matchesSearch;
  }).sort((a, b) => {
    if (volunteerSort === 'hours') return b.totalHours - a.totalHours;
    if (volunteerSort === 'newest') return b.joinedDate.getTime() - a.joinedDate.getTime();
    return a.name.localeCompare(b.name);
  });

  return (
    <div className="two-col">
      <section className="panel">
        <h2>Add Volunteer</h2>
        <p className="quota-notice">
          This project currently has a limit of 10 verification SMS messages per day. Volunteers
          added here by an admin do not require verification and do not use the SMS quota.
        </p>
        <form onSubmit={handleAdd} className="stacked-form">
          <input
            placeholder="First name"
            value={form.firstName}
            onChange={(e) => setForm({ ...form, firstName: e.target.value })}
            required
          />
          <input
            placeholder="Last name"
            value={form.lastName}
            onChange={(e) => setForm({ ...form, lastName: e.target.value })}
            required
          />
          <input
            type="email"
            placeholder="Email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            required
          />
          <input
            type="tel"
            placeholder="Phone (for reminders)"
            value={form.phoneNumber}
            onChange={(e) => setForm({ ...form, phoneNumber: e.target.value })}
            required
          />
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={form.whatsappOptIn}
              onChange={(e) => setForm({ ...form, whatsappOptIn: e.target.checked })}
              required
            />
            Volunteer has agreed to receive WhatsApp reminders
          </label>
          <button type="submit" className="primary-btn">
            Add Volunteer &amp; Send Invitation
          </button>
        </form>
        <p className="muted small">
          Volunteers can also register themselves from the login page.
        </p>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Volunteers ({volunteers.length})</h2>
          <div className="row">
            <label className="secondary-btn file-label">
              Import CSV
              <input type="file" accept=".csv,text/csv" hidden onChange={handleImport} />
            </label>
            <button className="secondary-btn" onClick={exportCsv}>
              Export CSV
            </button>
          </div>
        </div>
        <p className="muted small">
          CSV columns: first name, last name, email, phone, WhatsApp consent (defaults to yes; use no to skip).
          Each valid row receives a login invitation.
        </p>
        <p className="results-count">{filtered.length} of {volunteers.length} volunteers shown</p>
        <input
          className="search"
          placeholder="Search name or email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="compact-filters">
          <label>
            <span>Sort</span>
            <select value={volunteerSort} onChange={(e) => setVolunteerSort(e.target.value as typeof volunteerSort)}>
              <option value="name">Name</option>
              <option value="hours">Most hours</option>
              <option value="newest">Newest</option>
            </select>
          </label>
        </div>
        {filtered.length === 0 && <div className="empty-state"><strong>No matching volunteers</strong><span>Adjust your search.</span></div>}
        <div className="volunteer-list">
          {filtered.map((v) => (
            <div key={v.uid} className="volunteer-card">
              {editing === v.uid ? (
                <div className="stacked-form">
                  <input
                    value={editForm.firstName}
                    onChange={(e) => setEditForm({ ...editForm, firstName: e.target.value })}
                  />
                  <input
                    value={editForm.lastName}
                    onChange={(e) => setEditForm({ ...editForm, lastName: e.target.value })}
                  />
                  <input
                    type="email"
                    value={editForm.email}
                    onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                    placeholder="Notification email"
                    required
                  />
                  <input
                    value={editForm.phoneNumber}
                    onChange={(e) => setEditForm({ ...editForm, phoneNumber: e.target.value })}
                  />
                  <div className="row">
                    <button className="primary-btn" onClick={() => saveEdit(v.uid)}>
                      Save
                    </button>
                    <button className="secondary-btn" onClick={() => setEditing(null)}>
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div>
                    <strong>{v.name}</strong>
                    {v.isAdmin && <span className="admin-tag">admin</span>}
                    <p className="muted small">
                      {v.email} · {v.phoneNumber || 'no phone'} · {v.totalHours}h
                    </p>
                  </div>
                  <div className="row">
                    {v.invitationStatus === 'invited' && (
                      <button
                        className="link-btn"
                        onClick={() => resendInvitation(v)}
                        disabled={resendingInvitation === v.uid}
                      >
                        {resendingInvitation === v.uid ? 'Sending...' : 'Resend invitation'}
                      </button>
                    )}
                    <button className="link-btn" onClick={() => startEdit(v)}>
                      Edit
                    </button>
                    <button
                      className="link-btn danger"
                      onClick={() => {
                        if (window.confirm(`Remove ${v.name}?`)) deleteVolunteer(v.uid);
                      }}
                    >
                      Remove
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Announcements tab
// ---------------------------------------------------------------------------

const AnnouncementsTab: React.FC<{ uid?: string; setError: (s: string) => void }> = ({
  uid,
  setError,
}) => {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [channels, setChannels] = useState<NotificationChannel[]>(['whatsapp', 'email']);
  const [sent, setSent] = useState(false);

  const toggleChannel = (c: NotificationChannel) =>
    setChannels((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSent(false);
    try {
      if (!title.trim() || !body.trim()) throw new Error('Title and message are required.');
      await createAnnouncement({
        title: title.trim(),
        body: body.trim(),
        channels,
        audienceSkills: [],
        createdBy: uid,
      });
      setTitle('');
      setBody('');
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create announcement.');
    }
  };

  return (
    <section className="panel">
      <h2>New Announcement</h2>
      <p className="muted small">
        Announcements are stored and delivered by the scheduled sender on the channels you pick.
      </p>
      {sent && <div className="success-message">Announcement queued for delivery.</div>}
      <form onSubmit={handleSend} className="stacked-form">
        <input placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
        <textarea
          placeholder="Message to volunteers"
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        <label className="field-label">Send via</label>
        <div className="chip-group">
          {(['whatsapp', 'email', 'push'] as NotificationChannel[]).map((c) => (
            <button
              type="button"
              key={c}
              className={`chip ${channels.includes(c) ? 'chip-on' : ''}`}
              onClick={() => toggleChannel(c)}
            >
              {c}
            </button>
          ))}
        </div>
        <button type="submit" className="primary-btn">
          Send Announcement
        </button>
      </form>
    </section>
  );
};

// ---------------------------------------------------------------------------
// History tab (past events + tasks)
// ---------------------------------------------------------------------------

const HistoryTab: React.FC<{
  volunteers: VolunteerProfile[];
  setError: (s: string) => void;
}> = ({ volunteers, setError }) => {
  const [pastTasks, setPastTasks] = useState<VolunteerTask[] | null>(null);

  const volunteerById = useMemo(() => {
    const map = new Map<string, VolunteerProfile>();
    volunteers.forEach((v) => map.set(v.uid, v));
    return map;
  }, [volunteers]);

  useEffect(() => {
    getPastTasks()
      .then(setPastTasks)
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Failed to load history.');
        setPastTasks([]);
      });
  }, [setError]);

  // Group past tasks by event (eventId), standalone tasks under "Other tasks".
  const eventGroups = useMemo(() => {
    if (!pastTasks) return [];
    const groups = new Map<
      string,
      { key: string; name: string; date?: Date; tasks: VolunteerTask[] }
    >();
    for (const task of pastTasks) {
      const key = task.eventId || `__standalone__`;
      const name = task.eventId ? task.eventName || 'Event' : 'Other tasks';
      if (!groups.has(key)) {
        groups.set(key, { key, name, date: task.startDateTime, tasks: [] });
      }
      const g = groups.get(key)!;
      g.tasks.push(task);
      if (task.startDateTime > (g.date || new Date(0))) g.date = task.startDateTime;
    }
    const arr = Array.from(groups.values());
    arr.forEach((g) =>
      g.tasks.sort((a, b) => b.startDateTime.getTime() - a.startDateTime.getTime())
    );
    arr.sort((a, b) => (b.date?.getTime() || 0) - (a.date?.getTime() || 0));
    return arr;
  }, [pastTasks]);

  if (pastTasks === null) {
    return (
      <section className="panel">
        <h2>History</h2>
        <p className="muted">Loading past events…</p>
      </section>
    );
  }

  return (
    <section className="panel">
      <h2>Past events &amp; tasks</h2>
      <p className="muted small">Events and tasks whose date has already passed.</p>
      {eventGroups.length === 0 && <p className="muted">No past tasks yet.</p>}

      <div className="task-list">
        {eventGroups.map((group) => (
          <div key={group.key} className="task-card">
            <div className="task-card-head">
              <div>
                <h3>{group.name}</h3>
                <p className="muted small">
                  {group.tasks.length} task(s) · most recent {formatDate(group.date)}
                </p>
              </div>
            </div>
            <div className="occurrence-list">
              {group.tasks.map((task) => (
                <div key={task.id} className="occurrence-row">
                  <div className="occurrence-head">
                    <span>
                      {task.title} · {formatDate(task.startDateTime)}
                    </span>
                    <span className={`status-badge status-${effectiveTaskStatus(task)}`}>
                      {effectiveTaskStatus(task)}
                    </span>
                  </div>
                  {task.assignedVolunteers.length > 0 ? (
                    <p className="small muted">
                      Volunteers:{' '}
                      {task.assignedVolunteers
                        .map((vid) => volunteerById.get(vid)?.name || 'Unknown')
                        .join(', ')}
                    </p>
                  ) : (
                    <p className="small muted">No volunteers were assigned.</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};

// ---------------------------------------------------------------------------
// Reports tab
// ---------------------------------------------------------------------------

const ReportsTab: React.FC<{
  volunteers: VolunteerProfile[];
  tasks: VolunteerTask[];
  events: TempleEvent[];
}> = ({ volunteers, tasks, events }) => {
  const [logs, setLogs] = useState<HourLog[]>([]);
  const [messages, setMessages] = useState<SentMessage[]>([]);
  const [feedback, setFeedback] = useState<EventFeedbackRecord[]>([]);
  const [pastTasks, setPastTasks] = useState<VolunteerTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState<'7' | '30' | '90' | 'custom'>('30');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [analyticsEvent, setAnalyticsEvent] = useState('all');
  const [channelFilter, setChannelFilter] = useState<'all' | NotificationChannel>('all');
  const [volunteerSearch, setVolunteerSearch] = useState('');

  useEffect(() => {
    Promise.allSettled([getHourLogs(), getSentMessages(), getEventFeedbackRecords(), getPastTasks()])
      .then(([hourLogs, sent, responses, past]) => {
        if (hourLogs.status === 'fulfilled') setLogs(hourLogs.value);
        if (sent.status === 'fulfilled') setMessages(sent.value);
        if (responses.status === 'fulfilled') setFeedback(responses.value);
        if (past.status === 'fulfilled') setPastTasks(past.value);
      })
      .finally(() => setLoading(false));
  }, []);

  const allTasks = useMemo(() => {
    const byId = new Map<string, VolunteerTask>();
    [...pastTasks, ...tasks].forEach((task) => byId.set(task.id, task));
    return Array.from(byId.values());
  }, [pastTasks, tasks]);
  const now = new Date();
  const periodStart = dateRange === 'custom' && customFrom ? new Date(`${customFrom}T00:00:00`) : now;
  const periodEnd = dateRange === 'custom' && customTo
    ? new Date(`${customTo}T23:59:59.999`)
    : new Date(now.getTime() + Number(dateRange === 'custom' ? 30 : dateRange) * 86400_000);
  const periodTasks = allTasks.filter((task) =>
    task.startDateTime >= periodStart &&
    task.startDateTime <= periodEnd &&
    (analyticsEvent === 'all' || task.eventId === analyticsEvent) &&
    effectiveTaskStatus(task) !== 'cancelled'
  );
  const periodTaskIds = new Set(periodTasks.map((task) => task.id));
  const volunteerNeedle = volunteerSearch.trim().toLowerCase();
  const scopedVolunteers = volunteers.filter((volunteer) =>
    !volunteerNeedle || [volunteer.name, volunteer.email, volunteer.phoneNumber]
      .some((value) => value.toLowerCase().includes(volunteerNeedle))
  );
  const scopedVolunteerIds = new Set(scopedVolunteers.map((volunteer) => volunteer.uid));
  const scopedLogs = logs.filter((log) =>
    periodTaskIds.has(log.taskId) && (!volunteerNeedle || scopedVolunteerIds.has(log.volunteerId))
  );
  const scopedMessages = messages.filter((message) =>
    Boolean(message.taskId && periodTaskIds.has(message.taskId)) &&
    (channelFilter === 'all' || message.channel === channelFilter) &&
    (!volunteerNeedle || scopedVolunteerIds.has(message.volunteerId))
  );
  const upcoming = periodTasks.filter((task) => task.startDateTime > now);
  const required = periodTasks.reduce((sum, task) => sum + task.volunteersNeeded, 0);
  const assigned = periodTasks.reduce((sum, task) => sum + task.assignedVolunteers.length, 0);
  const staffingRate = required ? Math.min(100, Math.round((assigned / required) * 100)) : 0;
  const urgent = upcoming
    .filter((task) => openSlots(task) > 0)
    .sort((a, b) => a.startDateTime.getTime() - b.startDateTime.getTime());
  const contactIssues = scopedVolunteers.filter((volunteer) =>
    !volunteer.phoneNumber || volunteer.whatsappOptIn !== true || volunteer.participationStatus === 'inactive'
  );
  const failedMessages = scopedMessages.filter((message) => message.status === 'failed');
  const activeVolunteers = scopedVolunteers.filter((volunteer) => volunteer.participationStatus !== 'inactive');
  const totalHours = scopedLogs.reduce((sum, log) => sum + (log.hours || 0), 0);

  const channelRows = (['whatsapp', 'email', 'push'] as NotificationChannel[]).map((channel) => {
    const records = scopedMessages.filter((message) => message.channel === channel);
    const sent = records.filter((message) => message.status === 'sent').length;
    return { channel, attempted: records.length, sent, failed: records.length - sent };
  }).filter((row) => channelFilter === 'all' || row.channel === channelFilter);

  const assignmentCount = new Map<string, number>();
  periodTasks.forEach((task) => task.assignedVolunteers.forEach((uid) =>
    assignmentCount.set(uid, (assignmentCount.get(uid) || 0) + 1)
  ));
  const engagementRows = [...scopedVolunteers]
    .sort((a, b) => (assignmentCount.get(b.uid) || 0) - (assignmentCount.get(a.uid) || 0))
    .slice(0, 10);

  const completedTasks = periodTasks.filter((task) => effectiveTaskStatus(task) === 'completed');
  const expectedAttendance = completedTasks.reduce((sum, task) =>
    sum + task.assignedVolunteers.filter((uid) => !volunteerNeedle || scopedVolunteerIds.has(uid)).length, 0
  );
  const attendedKeys = new Set(scopedLogs.map((log) => `${log.taskId}:${log.volunteerId}`));
  const attended = completedTasks.reduce((sum, task) =>
    sum + task.assignedVolunteers.filter((uid) =>
      (!volunteerNeedle || scopedVolunteerIds.has(uid)) && attendedKeys.has(`${task.id}:${uid}`)
    ).length, 0
  );

  const eventRows = events.map((event) => {
    const eventTasks = periodTasks.filter((task) => task.eventId === event.id);
    const taskIds = new Set(eventTasks.map((task) => task.id));
    const eventRequired = eventTasks.reduce((sum, task) => sum + task.volunteersNeeded, 0);
    const eventAssigned = eventTasks.reduce((sum, task) => sum + task.assignedVolunteers.length, 0);
    return {
      event,
      tasks: eventTasks.length,
      staffing: eventRequired ? Math.min(100, Math.round((eventAssigned / eventRequired) * 100)) : 0,
      hours: scopedLogs.filter((log) => taskIds.has(log.taskId)).reduce((sum, log) => sum + (log.hours || 0), 0),
      feedback: feedback.filter((item) =>
        item.eventId === event.id && (!volunteerNeedle || scopedVolunteerIds.has(item.volunteerId))
      ).length,
    };
  }).filter((row) => row.tasks > 0).sort((a, b) =>
    (b.event.date?.getTime() || b.event.createdAt.getTime()) - (a.event.date?.getTime() || a.event.createdAt.getTime())
  ).slice(0, 10);

  return (
    <div className="analytics-dashboard">
      <div className="panel-head analytics-heading">
        <div><h2>Decision dashboard</h2><p className="muted small">Current planning signals and historical performance.</p></div>
        {loading && <span className="muted small">Loading analytics…</span>}
      </div>

      <section className="panel analytics-filters">
        <div className="filter-bar">
          <label><span>Task dates</span><select value={dateRange} onChange={(e) => setDateRange(e.target.value as typeof dateRange)}>
            <option value="7">Next 7 days</option><option value="30">Next 30 days</option><option value="90">Next 90 days</option><option value="custom">Custom dates</option>
          </select></label>
          {dateRange === 'custom' && <><label><span>From</span><input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} /></label><label><span>To</span><input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} /></label></>}
          <label><span>Event</span><select value={analyticsEvent} onChange={(e) => setAnalyticsEvent(e.target.value)}>
            <option value="all">All events</option>{events.map((event) => <option key={event.id} value={event.id}>{event.name}</option>)}
          </select></label>
          <label><span>Reminder channel</span><select value={channelFilter} onChange={(e) => setChannelFilter(e.target.value as typeof channelFilter)}>
            <option value="all">All channels</option><option value="whatsapp">WhatsApp</option><option value="email">Email</option><option value="push">Browser push</option>
          </select></label>
          <label className="search-field"><span>Volunteer</span><input value={volunteerSearch} onChange={(e) => setVolunteerSearch(e.target.value)} placeholder="Name, email, or phone" /></label>
        </div>
        <div className="analytics-scope">
          <span>Scope: {periodStart.toLocaleDateString()}–{periodEnd.toLocaleDateString()}</span>
          <span>{analyticsEvent === 'all' ? 'All events' : events.find((event) => event.id === analyticsEvent)?.name}</span>
          <span>{channelFilter === 'all' ? 'All reminder channels' : channelFilter}</span>
          {volunteerNeedle && <span>{scopedVolunteers.length} matching volunteer(s)</span>}
          {(dateRange !== '30' || analyticsEvent !== 'all' || channelFilter !== 'all' || volunteerSearch) && <button className="link-btn" onClick={() => { setDateRange('30'); setCustomFrom(''); setCustomTo(''); setAnalyticsEvent('all'); setChannelFilter('all'); setVolunteerSearch(''); }}>Clear filters</button>}
        </div>
      </section>

      <div className="stat-grid">
        <div className="stat-card"><span className="stat-num">{staffingRate}%</span><span className="stat-label">Period staffing</span></div>
        <div className="stat-card"><span className="stat-num">{urgent.length}</span><span className="stat-label">Tasks need people</span></div>
        <div className="stat-card"><span className="stat-num">{activeVolunteers.length}</span><span className="stat-label">Active volunteers</span></div>
        <div className="stat-card"><span className="stat-num">{totalHours.toFixed(1)}</span><span className="stat-label">Hours recorded</span></div>
        <div className="stat-card"><span className="stat-num">{failedMessages.length}</span><span className="stat-label">Reminder failures</span></div>
      </div>

      <div className="analytics-grid">
        <section className="panel">
          <h2>Needs attention</h2>
          {urgent.length === 0 && contactIssues.length === 0 && failedMessages.length === 0
            ? <p className="success-text">No current issues detected.</p>
            : <ul className="attention-list">
                {urgent.slice(0, 6).map((task) => <li key={task.id}><strong>{openSlots(task)} open:</strong> {task.title} — {formatDate(task.startDateTime)}</li>)}
                {contactIssues.length > 0 && <li><strong>{contactIssues.length} volunteer(s)</strong> inactive or missing WhatsApp-ready phone details.</li>}
                {failedMessages.length > 0 && <li><strong>{failedMessages.length} reminder delivery failure(s)</strong> in the selected scope.</li>}
              </ul>}
        </section>

        <section className="panel">
          <h2>Staffing in selected period</h2>
          <div className="staffing-meter" aria-label={`${staffingRate}% staffed`}><span style={{ width: `${staffingRate}%` }} /></div>
          <p className="muted small">{assigned} of {required} positions assigned across {periodTasks.length} tasks.</p>
          <table className="report-table"><thead><tr><th>Task</th><th>Date</th><th>Assigned</th><th>Open</th></tr></thead>
            <tbody>{periodTasks.slice(0, 10).map((task) => <tr key={task.id}><td>{task.title}</td><td>{formatDate(task.startDateTime)}</td><td>{task.assignedVolunteers.length}/{task.volunteersNeeded}</td><td>{openSlots(task)}</td></tr>)}</tbody>
          </table>
          {periodTasks.length === 0 && <p className="muted">No tasks in the selected period.</p>}
        </section>

        <section className="panel">
          <h2>Volunteer engagement</h2>
          <p className="muted small">Attendance is based on check-in records: {expectedAttendance ? `${attended}/${expectedAttendance} (${Math.round(attended / expectedAttendance * 100)}%)` : 'not enough completed-task data yet'}.</p>
          <table className="report-table"><thead><tr><th>Volunteer</th><th>Assignments</th><th>Sessions</th><th>Hours</th></tr></thead>
            <tbody>{engagementRows.map((volunteer) => <tr key={volunteer.uid}><td>{volunteer.name}</td><td>{assignmentCount.get(volunteer.uid) || 0}</td><td>{scopedLogs.filter((log) => log.volunteerId === volunteer.uid).length}</td><td>{scopedLogs.filter((log) => log.volunteerId === volunteer.uid).reduce((sum, log) => sum + (log.hours || 0), 0).toFixed(1)}</td></tr>)}</tbody>
          </table>
        </section>

        <section className="panel">
          <h2>Reminder health</h2>
          {scopedMessages.length === 0 && <p className="muted">No reminder delivery records match the selected scope.</p>}
          <table className="report-table"><thead><tr><th>Channel</th><th>Attempted</th><th>Sent</th><th>Failed</th><th>Success</th></tr></thead>
            <tbody>{channelRows.map((row) => <tr key={row.channel}><td>{row.channel}</td><td>{row.attempted}</td><td>{row.sent}</td><td>{row.failed}</td><td>{row.attempted ? `${Math.round(row.sent / row.attempted * 100)}%` : '—'}</td></tr>)}</tbody>
          </table>
          <p className="muted small">Readiness: {scopedVolunteers.filter((v) => v.whatsappOptIn && v.phoneNumber).length} WhatsApp · {scopedVolunteers.filter((v) => v.email).length} email · {scopedVolunteers.filter((v) => v.pushTokens?.length).length} browser push.</p>
        </section>
      </div>

      <section className="panel">
        <h2>Event comparison</h2>
        <table className="report-table"><thead><tr><th>Event</th><th>Tasks</th><th>Staffing</th><th>Hours</th><th>Feedback</th></tr></thead>
          <tbody>{eventRows.map((row) => <tr key={row.event.id}><td>{row.event.name}</td><td>{row.tasks}</td><td>{row.staffing}%</td><td>{row.hours.toFixed(1)}</td><td>{row.feedback}</td></tr>)}</tbody>
        </table>
        {eventRows.length === 0 && <p className="muted">Event comparisons will appear after tasks are linked to events.</p>}
      </section>
    </div>
  );
};

export default AdminDashboard;
