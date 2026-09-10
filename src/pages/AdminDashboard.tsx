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
  Announcement,
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
  AdminAccess,
  AuditLog,
  subscribeEvents,
  permanentlyDeleteTaskBatch,
  deleteVolunteerProfile,
  getHourLogs,
  getEventFeedbackRecords,
  getPastTasks,
  getSentMessages,
  getAuditLogs,
  grantAdminAccess,
  groupTasksBySeries,
  removeVolunteerFromTask,
  recordInvitationSent,
  SeriesScope,
  subscribeTasks,
  subscribeDeletedTasks,
  subscribeDeletedRecords,
  TrashRecord,
  trashRecord,
  restoreTrashRecord,
  permanentlyDeleteTrashRecord,
  subscribeAnnouncements,
  subscribeVolunteers,
  updateTaskStatusScoped,
  updateTaskManagementFieldsScoped,
  trashTaskScoped,
  restoreDeletedTaskBatch,
  revokeAdminAccess,
  subscribeAdmins,
  updateVolunteer,
  DEFAULT_HORIZON_WEEKS,
} from '../helpers/store';
import { HourLog } from '../helpers/types';
import AICreateTab from './AICreate';
import EventWorkspace from './EventWorkspace';
import './AdminDashboard.css';

type Tab = 'tasks' | 'ai' | 'events' | 'volunteers' | 'announcements' | 'history' | 'reports' | 'costs' | 'trash' | 'admins' | 'audit';

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

const toDateTimeInput = (date?: Date) => {
  if (!date) return '';
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
};

const taskEditValues = (task: VolunteerTask) => ({
  title: task.title,
  description: task.description || '',
  startDateTime: toDateTimeInput(task.startDateTime),
  endDateTime: toDateTimeInput(task.endDateTime),
  location: task.location || '',
  volunteersNeeded: String(task.volunteersNeeded),
  reminderHoursBefore: task.reminderHoursBefore.join(', '),
  openForSignup: task.openForSignup,
});

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
    if (profileCreated && invitedUser) await deleteVolunteerProfile(invitedUser.uid).catch(() => undefined);
    if (invitedUser) await deleteUser(invitedUser).catch(() => undefined);
    throw error;
  } finally {
    await signOut(inviteAuth).catch(() => undefined);
    await deleteApp(inviteApp);
  }
}

const AdminDashboard: React.FC = () => {
  const navigate = useNavigate();
  const { user, isOwner } = useAuth();
  const [tab, setTab] = useState<Tab>('tasks');
  const [tasks, setTasks] = useState<VolunteerTask[]>([]);
  const [volunteers, setVolunteers] = useState<VolunteerProfile[]>([]);
  const [events, setEvents] = useState<TempleEvent[]>([]);
  const [deletedTasks, setDeletedTasks] = useState<VolunteerTask[]>([]);
  const [deletedRecords, setDeletedRecords] = useState<TrashRecord[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    const unsubTasks = subscribeTasks(setTasks);
    const unsubVols = subscribeVolunteers(setVolunteers);
    const unsubEvents = subscribeEvents(setEvents);
    const unsubTrash = subscribeDeletedTasks(setDeletedTasks);
    const unsubRecordTrash = subscribeDeletedRecords(setDeletedRecords);
    return () => {
      unsubTasks();
      unsubVols();
      unsubEvents();
      unsubTrash();
      unsubRecordTrash();
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
          <p>{isOwner ? 'Owner' : 'Admin'}</p>
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
        <button className={tab === 'costs' ? 'active' : ''} onClick={() => setTab('costs')}>
          Message Costs
        </button>
        <button className={tab === 'trash' ? 'active' : ''} onClick={() => setTab('trash')}>
          Trash ({deletedTasks.length + deletedRecords.length})
        </button>
        {isOwner && <button className={tab === 'admins' ? 'active' : ''} onClick={() => setTab('admins')}>
          Admin Management
        </button>}
        {isOwner && <button className={tab === 'audit' ? 'active' : ''} onClick={() => setTab('audit')}>
          Audit
        </button>}
        <button onClick={() => navigate('/help')}>Help</button>
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
            isOwner={isOwner}
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
        {tab === 'volunteers' && <VolunteersTab volunteers={volunteers} uid={user?.uid} setError={setError} />}
        {tab === 'announcements' && (
          <AnnouncementsTab uid={user?.uid} setError={setError} />
        )}
        {tab === 'history' && <HistoryTab volunteers={volunteers} setError={setError} />}
        {tab === 'reports' && <ReportsTab volunteers={volunteers} tasks={tasks} events={events} />}
        {tab === 'costs' && <CostTab />}
        {tab === 'trash' && <TrashTab tasks={deletedTasks} records={deletedRecords} isOwner={isOwner} setError={setError} />}
        {tab === 'admins' && isOwner && <AdminManagementTab ownerUid={user?.uid || ''} volunteers={volunteers} setError={setError} />}
        {tab === 'audit' && isOwner && <AuditTab />}
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
  isOwner: boolean;
}> = ({ tasks, volunteers, events, setError, uid, isOwner }) => {
  const [form, setForm] = useState(emptyTaskForm);
  const [saving, setSaving] = useState(false);
  const [taskSearch, setTaskSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | TaskStatus>('all');
  const [eventFilter, setEventFilter] = useState('all');
  const [taskSort, setTaskSort] = useState<'soonest' | 'latest' | 'title'>('soonest');
  const [undoBatchId, setUndoBatchId] = useState('');

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

  const handleTrash = async (task: VolunteerTask, scope: SeriesScope) => {
    const batchId = await trashTaskScoped(task, scope, uid);
    setUndoBatchId(batchId);
  };

  return (
    <div className="two-col">
      <section className="panel">
        <h2>Create Task</h2>
        <form onSubmit={handleCreate} className="stacked-form">
          <input
            type="text"
            aria-label="Task title"
            placeholder="Task title (e.g. Kitchen prep for Sunday feast)"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            required
          />
          <textarea
            aria-label="Task description"
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
            aria-label="Task location"
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
        {undoBatchId && (
          <div className="undo-banner" role="status">
            <span>Task moved to Trash. It can be restored for 30 days.</span>
            <div>
              {isOwner && <button className="link-btn" onClick={async () => {
                try {
                  await restoreDeletedTaskBatch(undoBatchId);
                  setUndoBatchId('');
                } catch (err) {
                  setError(err instanceof Error ? err.message : 'Failed to restore task.');
                }
              }}>Undo</button>}
              <button className="link-btn" onClick={() => setUndoBatchId('')}>Dismiss</button>
            </div>
          </div>
        )}
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
                  onTrash={handleTrash}
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
  onTrash: (task: VolunteerTask, scope: SeriesScope) => Promise<void>;
  setError: (s: string) => void;
}> = ({ group, volunteers, volunteerById, onAssign, onRemove, onTrash, setError }) => {
  const isSeries = group.recurrence !== 'none' && !!group.seriesId;
  const [expanded, setExpanded] = useState(!isSeries);
  const [scopeRequest, setScopeRequest] = useState<{
    verb: string;
    resolve: (scope: SeriesScope | null) => void;
  } | null>(null);
  const upcoming = group.occurrences.filter((o) => o.startDateTime >= new Date());
  const next = upcoming[0] || group.occurrences[0];

  const askScope = (verb: string): Promise<SeriesScope | null> => {
    if (!isSeries) return Promise.resolve('one');
    return new Promise((resolve) => setScopeRequest({ verb, resolve }));
  };

  const chooseScope = (scope: SeriesScope | null) => {
    scopeRequest?.resolve(scope);
    setScopeRequest(null);
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
              onTrash={onTrash}
              askScope={askScope}
              setError={setError}
            />
          ))}
        </div>
      )}
      {scopeRequest && <div className="scope-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) chooseScope(null); }}>
        <section className="scope-dialog" role="dialog" aria-modal="true" aria-labelledby={`scope-title-${group.seriesId}`}>
          <h3 id={`scope-title-${group.seriesId}`}>{scopeRequest.verb}</h3>
          <p>This task repeats. Which dates should be changed?</p>
          <div className="scope-dialog-actions">
            <button className="primary-btn" onClick={() => chooseScope('one')}>Only this date</button>
            <button className="secondary-btn" onClick={() => chooseScope('future')}>This and future dates</button>
            <button className="link-btn" onClick={() => chooseScope(null)}>Cancel</button>
          </div>
        </section>
      </div>}
    </div>
  );
};

const OccurrenceRow: React.FC<{
  task: VolunteerTask;
  volunteers: VolunteerProfile[];
  volunteerById: Map<string, VolunteerProfile>;
  onAssign: (task: VolunteerTask, volunteerId: string) => Promise<void>;
  onRemove: (task: VolunteerTask, volunteerId: string) => void;
  onTrash: (task: VolunteerTask, scope: SeriesScope) => Promise<void>;
  askScope: (verb: string) => Promise<SeriesScope | null>;
  setError: (s: string) => void;
}> = ({ task, volunteers, volunteerById, onAssign, onRemove, onTrash, askScope, setError }) => {
  const [assigning, setAssigning] = useState(false);
  const [assignmentMessage, setAssignmentMessage] = useState('');
  const [editing, setEditing] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editForm, setEditForm] = useState(() => taskEditValues(task));
  const status = effectiveTaskStatus(task);
  const assignmentClosed = status === 'filled' || status === 'completed' || status === 'cancelled' || openSlots(task) === 0;

  const saveTaskEdit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    const start = new Date(editForm.startDateTime);
    const end = editForm.endDateTime ? new Date(editForm.endDateTime) : null;
    const needed = Number.parseInt(editForm.volunteersNeeded, 10);
    const reminders = editForm.reminderHoursBefore.split(',')
      .map((value) => Number.parseInt(value.trim(), 10))
      .filter((value) => Number.isFinite(value) && value > 0);
    if (!editForm.title.trim() || Number.isNaN(start.getTime())) {
      setError('Task title and a valid start date/time are required.');
      return;
    }
    if (end && (Number.isNaN(end.getTime()) || end <= start)) {
      setError('End date/time must be after the start date/time.');
      return;
    }
    if (!Number.isFinite(needed) || needed < task.assignedVolunteers.length || needed < 1) {
      setError(`Volunteers needed must be at least ${Math.max(1, task.assignedVolunteers.length)}.`);
      return;
    }
    const scope = await askScope('Edit task');
    if (!scope) return;
    const startChanged = editForm.startDateTime !== toDateTimeInput(task.startDateTime);
    const endChanged = editForm.endDateTime !== toDateTimeInput(task.endDateTime);
    const normalizedCurrentReminders = task.reminderHoursBefore.filter((value) => value > 0).join(',');
    const normalizedNewReminders = reminders.join(',');
    setSavingEdit(true);
    try {
      await updateTaskManagementFieldsScoped(task, {
        title: editForm.title,
        description: editForm.description,
        ...(startChanged ? { startDateTime: start } : {}),
        ...(startChanged || endChanged ? { endDateTime: end } : {}),
        location: editForm.location,
        volunteersNeeded: needed,
        ...(normalizedNewReminders !== normalizedCurrentReminders ? { reminderHoursBefore: reminders } : {}),
        openForSignup: editForm.openForSignup,
      }, scope);
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update task.');
    } finally {
      setSavingEdit(false);
    }
  };

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
              {volunteerById.get(vid)?.name || (vid.startsWith('former_') ? 'Former volunteer' : vid)}
              <button className="link-btn" onClick={() => onRemove(task, vid)}>
                remove
              </button>
            </li>
          ))}
        </ul>
      )}
      {editing && <form className="task-edit-form" onSubmit={saveTaskEdit}>
        <label><span>Task title</span><input value={editForm.title} onChange={(e) => setEditForm({ ...editForm, title: e.target.value })} required /></label>
        <label className="task-edit-wide"><span>Description</span><textarea value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} /></label>
        <label><span>Start</span><input type="datetime-local" value={editForm.startDateTime} onChange={(e) => setEditForm({ ...editForm, startDateTime: e.target.value })} required /></label>
        <label><span>End (optional)</span><input type="datetime-local" value={editForm.endDateTime} onChange={(e) => setEditForm({ ...editForm, endDateTime: e.target.value })} /></label>
        <label><span>Location</span><input value={editForm.location} onChange={(e) => setEditForm({ ...editForm, location: e.target.value })} /></label>
        <label><span>Volunteers needed</span><input type="number" min={Math.max(1, task.assignedVolunteers.length)} value={editForm.volunteersNeeded} onChange={(e) => setEditForm({ ...editForm, volunteersNeeded: e.target.value })} required /></label>
        <label className="task-edit-wide"><span>Reminder hours before (comma separated)</span><input value={editForm.reminderHoursBefore} onChange={(e) => setEditForm({ ...editForm, reminderHoursBefore: e.target.value })} placeholder="48, 24, 2" /></label>
        <label className="checkbox-row task-edit-wide"><input type="checkbox" checked={editForm.openForSignup} onChange={(e) => setEditForm({ ...editForm, openForSignup: e.target.checked })} /> Allow volunteers to sign themselves up</label>
        <div className="task-edit-actions task-edit-wide"><button className="primary-btn" disabled={savingEdit}>{savingEdit ? 'Saving…' : 'Save changes'}</button><button type="button" className="secondary-btn" onClick={() => { setEditForm(taskEditValues(task)); setEditing(false); }}>Cancel edit</button></div>
      </form>}
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
        <button className="secondary-btn" onClick={() => { setEditForm(taskEditValues(task)); setEditing((value) => !value); }}>{editing ? 'Close editor' : 'Edit Task'}</button>
        {status !== 'completed' && <button className="link-btn danger" onClick={async () => {
          const nextStatus: TaskStatus = status === 'cancelled' ? 'open' : 'cancelled';
          const scope = await askScope(status === 'cancelled' ? 'Reopen task' : 'Cancel task');
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
            const scope = await askScope('Move task to Trash');
            if (!scope) return;
            if (!window.confirm('Move this task to Trash? It can be restored for 30 days.')) return;
            try {
              await onTrash(task, scope);
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Failed to delete.');
            }
          }}
        >
          Move to Trash
        </button>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Owner-only admin management
// ---------------------------------------------------------------------------

const AdminManagementTab: React.FC<{
  ownerUid: string;
  volunteers: VolunteerProfile[];
  setError: (s: string) => void;
}> = ({ ownerUid, volunteers, setError }) => {
  const [admins, setAdmins] = useState<AdminAccess[]>([]);
  const [selectedUid, setSelectedUid] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => subscribeAdmins(setAdmins), []);

  const adminIds = useMemo(() => new Set(admins.map((admin) => admin.uid)), [admins]);
  const eligible = volunteers
    .filter((volunteer) => !adminIds.has(volunteer.uid) && volunteer.email)
    .sort((a, b) => a.name.localeCompare(b.name));

  const promote = async () => {
    const volunteer = volunteers.find((item) => item.uid === selectedUid);
    if (!volunteer) return;
    if (!window.confirm(`Give Admin access to ${volunteer.name} (${volunteer.email})?`)) return;
    setBusy(true);
    setError('');
    try {
      await grantAdminAccess(volunteer, ownerUid);
      setSelectedUid('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to grant Admin access.');
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (admin: AdminAccess) => {
    if (!window.confirm(`Remove Admin access from ${admin.email}? Their volunteer profile and history will remain.`)) return;
    setBusy(true);
    setError('');
    try {
      await revokeAdminAccess(admin.uid, ownerUid);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove Admin access.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="two-col admin-management">
      <section className="panel">
        <h2>Add an Admin</h2>
        <p className="muted small">Choose an existing registered volunteer. Admin access does not remove their volunteer profile or assignments.</p>
        <div className="stacked-form">
          <select value={selectedUid} onChange={(event) => setSelectedUid(event.target.value)}>
            <option value="">Select a volunteer…</option>
            {eligible.map((volunteer) => <option key={volunteer.uid} value={volunteer.uid}>{volunteer.name} — {volunteer.email}</option>)}
          </select>
          <button className="primary-btn" disabled={!selectedUid || busy} onClick={promote}>Give Admin Access</button>
        </div>
      </section>
      <section className="panel">
        <h2>Administrators</h2>
        <div className="trash-list">
          {admins.map((admin) => (
            <div className="trash-card" key={admin.uid}>
              <div><strong>{admin.email || admin.uid}</strong><p className="muted small">{admin.role === 'owner' ? 'Owner · protected account' : 'Admin'}</p></div>
              {admin.role === 'admin' && <button className="danger-btn" disabled={busy} onClick={() => revoke(admin)}>Remove Admin Access</button>}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Trash tab
// ---------------------------------------------------------------------------

const TrashTab: React.FC<{
  tasks: VolunteerTask[];
  records: TrashRecord[];
  isOwner: boolean;
  setError: (s: string) => void;
}> = ({ tasks, records, isOwner, setError }) => {
  const [busyBatch, setBusyBatch] = useState('');
  const batches = useMemo(() => {
    const grouped = new Map<string, VolunteerTask[]>();
    tasks.forEach((task) => {
      const key = task.deletedBatchId || task.id;
      grouped.set(key, [...(grouped.get(key) || []), task]);
    });
    return Array.from(grouped.entries());
  }, [tasks]);

  const run = async (batchId: string, action: 'restore' | 'delete') => {
    if (action === 'delete' && !window.confirm('Delete permanently? This cannot be undone.')) return;
    setBusyBatch(batchId);
    setError('');
    try {
      if (action === 'restore') await restoreDeletedTaskBatch(batchId);
      else await permanentlyDeleteTaskBatch(batchId);
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to ${action} task.`);
    } finally {
      setBusyBatch('');
    }
  };

  const runRecord = async (record: TrashRecord, action: 'restore' | 'delete') => {
    if (action === 'delete' && !window.confirm(`Permanently delete ${record.label}? This cannot be undone.`)) return;
    const key = `${record.collection}/${record.id}`;
    setBusyBatch(key);
    setError('');
    try {
      if (action === 'restore') await restoreTrashRecord(record);
      else await permanentlyDeleteTrashRecord(record);
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to ${action} item.`);
    } finally {
      setBusyBatch('');
    }
  };

  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h2>Trash</h2>
          <p className="muted small">Deleted records remain recoverable for 30 days. Only the Owner can restore or permanently delete them.</p>
        </div>
      </div>
      {batches.length === 0 && records.length === 0 && (
        <div className="empty-state"><strong>Trash is empty</strong><span>Items moved here will remain recoverable for 30 days.</span></div>
      )}
      <div className="trash-list">
        {batches.map(([batchId, batch]) => {
          const task = batch[0];
          const deletedLabel = task.deletedAt ? task.deletedAt.toLocaleString() : 'Recently';
          return (
            <div className="trash-card" key={batchId}>
              <div>
                <strong>{task.title}</strong>
                <p className="muted small">
                  {batch.length > 1 ? `${batch.length} future occurrences` : formatDate(task.startDateTime)} · Deleted {deletedLabel}
                </p>
              </div>
              <div className="task-actions">
                {isOwner ? <>
                  <button disabled={busyBatch === batchId} className="primary-btn compact-btn" onClick={() => run(batchId, 'restore')}>Restore</button>
                  <button disabled={busyBatch === batchId} className="danger-btn" onClick={() => run(batchId, 'delete')}>Delete permanently</button>
                </> : <span className="muted small">Owner approval required to restore or delete permanently.</span>}
              </div>
            </div>
          );
        })}
      </div>
      <div className="trash-list">
        {records.map((record) => {
          const key = `${record.collection}/${record.id}`;
          return <div className="trash-card" key={key}>
            <div><strong>{record.label}</strong><p className="muted small">{record.collection} · Deleted {record.deletedAt?.toLocaleString() || 'recently'}</p></div>
            <div className="task-actions">{isOwner ? <>
              <button disabled={busyBatch === key} className="primary-btn compact-btn" onClick={() => runRecord(record, 'restore')}>Restore</button>
              <button disabled={busyBatch === key} className="danger-btn" onClick={() => runRecord(record, 'delete')}>Delete permanently</button>
            </> : <span className="muted small">Owner approval required.</span>}</div>
          </div>;
        })}
      </div>
    </section>
  );
};

// ---------------------------------------------------------------------------
// Volunteers tab
// ---------------------------------------------------------------------------

const VolunteersTab: React.FC<{
  volunteers: VolunteerProfile[];
  uid?: string;
  setError: (s: string) => void;
}> = ({ volunteers, uid, setError }) => {
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
            aria-label="Volunteer first name"
            placeholder="First name"
            value={form.firstName}
            onChange={(e) => setForm({ ...form, firstName: e.target.value })}
            required
          />
          <input
            aria-label="Volunteer last name"
            placeholder="Last name"
            value={form.lastName}
            onChange={(e) => setForm({ ...form, lastName: e.target.value })}
            required
          />
          <input
            type="email"
            aria-label="Volunteer email"
            placeholder="Email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            required
          />
          <input
            type="tel"
            aria-label="Volunteer phone number"
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
          aria-label="Search volunteers"
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
                    aria-label="Volunteer first name"
                    value={editForm.firstName}
                    onChange={(e) => setEditForm({ ...editForm, firstName: e.target.value })}
                  />
                  <input
                    aria-label="Volunteer last name"
                    value={editForm.lastName}
                    onChange={(e) => setEditForm({ ...editForm, lastName: e.target.value })}
                  />
                  <input
                    type="email"
                    aria-label="Login email"
                    value={editForm.email}
                    disabled
                  />
                  <small className="field-hint">Login email cannot be changed here. The volunteer must continue using this email to sign in.</small>
                  <input
                    aria-label="Volunteer phone number"
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
                    <button className="link-btn danger" onClick={async () => {
                      if (!window.confirm(`Move ${v.name}'s profile to Trash? They will become inactive and unavailable for new assignments. The Owner can restore it.`)) return;
                      try { await trashRecord('volunteers', v.uid, uid); }
                      catch (err) { setError(err instanceof Error ? err.message : 'Failed to move volunteer to Trash.'); }
                    }}>Move to Trash</button>
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
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);

  useEffect(() => subscribeAnnouncements(setAnnouncements), []);

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
        <input aria-label="Announcement title" placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
        <textarea
          aria-label="Announcement message"
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
      <div className="trash-list">
        {announcements.map((announcement) => <div className="trash-card" key={announcement.id}>
          <div><strong>{announcement.title}</strong><p className="muted small">{announcement.body}</p></div>
          <button className="link-btn danger" onClick={async () => {
            if (!window.confirm(`Move announcement “${announcement.title}” to Trash?`)) return;
            try { await trashRecord('announcements', announcement.id, uid); }
            catch (err) { setError(err instanceof Error ? err.message : 'Failed to move announcement to Trash.'); }
          }}>Move to Trash</button>
        </div>)}
      </div>
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
                        .map((vid) => volunteerById.get(vid)?.name || (vid.startsWith('former_') ? 'Former volunteer' : 'Unknown'))
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
// Owner-only login audit tab
// ---------------------------------------------------------------------------

const AuditTab: React.FC = () => {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [role, setRole] = useState<'all' | AuditLog['role']>('all');
  const [period, setPeriod] = useState<'7' | '30' | '90' | 'all'>('30');

  useEffect(() => {
    getAuditLogs()
      .then(setLogs)
      .catch((error) => setLoadError(error instanceof Error ? error.message : 'Could not load the audit log.'))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const cutoff = period === 'all' ? null : Date.now() - Number(period) * 86400_000;
    return logs.filter((log) =>
      (role === 'all' || log.role === role)
      && (!cutoff || log.occurredAt.getTime() >= cutoff)
      && (!needle || [log.email, log.actorId, log.role, log.event, log.userAgent, log.platform, log.timezone]
        .some((value) => value?.toLowerCase().includes(needle)))
    );
  }, [logs, period, role, search]);

  const uniqueUsers = new Set(filtered.map((log) => log.actorId)).size;
  const adminLogins = filtered.filter((log) => log.role === 'admin' || log.role === 'owner').length;
  const volunteerLogins = filtered.filter((log) => log.role === 'volunteer').length;

  const exportCsv = () => {
    const clean = (value: string) => `"${value.replace(/"/g, '""')}"`;
    const rows = ['Date and time,Role,Email,Event,User ID,Platform,Timezone,Device/browser', ...filtered.map((log) => [
      log.occurredAt.toISOString(), log.role, log.email, log.event, log.actorId,
      log.platform || '', log.timezone || '', log.userAgent || '',
    ].map(clean).join(','))];
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([rows.join('\n')], { type: 'text/csv' }));
    link.download = 'login-audit.csv';
    link.click();
    URL.revokeObjectURL(link.href);
  };

  return <div className="analytics-dashboard">
    <div className="panel-head analytics-heading">
      <div><h2>Login audit</h2><p className="muted small">Owner-only, read-only history of successful verified logins. Tracking begins with this feature’s deployment.</p></div>
      <button className="secondary-btn" disabled={filtered.length === 0} onClick={exportCsv}>Export filtered CSV</button>
    </div>
    {loadError && <div className="error-message">{loadError}</div>}
    <section className="panel analytics-filters">
      <div className="filter-bar audit-filters">
        <label className="search-field"><span>Search</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Email, user ID, browser, or timezone" /></label>
        <label><span>Role</span><select value={role} onChange={(event) => setRole(event.target.value as typeof role)}><option value="all">All roles</option><option value="owner">Owner</option><option value="admin">Admin</option><option value="volunteer">Volunteer</option></select></label>
        <label><span>Date range</span><select value={period} onChange={(event) => setPeriod(event.target.value as typeof period)}><option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option><option value="all">All history</option></select></label>
      </div>
    </section>
    <div className="stat-grid">
      <div className="stat-card"><span className="stat-num">{filtered.length}</span><span className="stat-label">Successful logins</span></div>
      <div className="stat-card"><span className="stat-num">{uniqueUsers}</span><span className="stat-label">Unique users</span></div>
      <div className="stat-card"><span className="stat-num">{adminLogins}</span><span className="stat-label">Owner/Admin logins</span></div>
      <div className="stat-card"><span className="stat-num">{volunteerLogins}</span><span className="stat-label">Volunteer logins</span></div>
    </div>
    <section className="panel">
      <div className="panel-head"><h2>Login records</h2>{loading && <span className="muted small">Loading audit history…</span>}</div>
      {!loading && filtered.length === 0 && <div className="empty-state"><strong>No matching login records</strong><span>New successful logins will appear here.</span></div>}
      {filtered.length > 0 && <div className="table-scroll"><table className="report-table"><thead><tr><th>Date and time</th><th>Role</th><th>Email</th><th>Platform</th><th>Timezone</th><th>Device/browser</th></tr></thead>
        <tbody>{filtered.map((log) => <tr key={log.id}><td>{log.occurredAt.toLocaleString()}</td><td><span className="admin-tag">{log.role}</span></td><td>{log.email}</td><td>{log.platform || 'Unknown'}</td><td>{log.timezone || 'Unknown'}</td><td className="audit-device" title={log.userAgent}>{log.userAgent || 'Unknown'}</td></tr>)}</tbody>
      </table></div>}
    </section>
  </div>;
};

// ---------------------------------------------------------------------------
// Message cost tab
// ---------------------------------------------------------------------------

const NORTH_AMERICA_UTILITY_RATE_USD = 0.0034;

const CostTab: React.FC = () => {
  const [messages, setMessages] = useState<SentMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    getSentMessages(10_000)
      .then(setMessages)
      .catch((error) => setLoadError(error instanceof Error ? error.message : 'Could not load message costs.'))
      .finally(() => setLoading(false));
  }, []);

  const monthly = useMemo(() => {
    const groups = new Map<string, { month: string; attempted: number; delivered: number; failed: number; cost: number }>();
    messages.filter((message) => message.channel === 'whatsapp').forEach((message) => {
      const key = `${message.sentAt.getFullYear()}-${String(message.sentAt.getMonth() + 1).padStart(2, '0')}`;
      const row = groups.get(key) || { month: key, attempted: 0, delivered: 0, failed: 0, cost: 0 };
      row.attempted += 1;
      if (message.status === 'sent') {
        row.delivered += 1;
        row.cost += message.estimatedCostUsd ?? NORTH_AMERICA_UTILITY_RATE_USD;
      } else {
        row.failed += 1;
      }
      groups.set(key, row);
    });
    return Array.from(groups.values()).sort((a, b) => b.month.localeCompare(a.month));
  }, [messages]);

  const now = new Date();
  const currentKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const current = monthly.find((row) => row.month === currentKey)
    || { month: currentKey, attempted: 0, delivered: 0, failed: 0, cost: 0 };
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const projectedCost = current.cost * daysInMonth / Math.max(1, now.getDate());
  const money = (value: number) => value < 0.01 && value > 0
    ? `$${value.toFixed(4)}`
    : value.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
  const monthLabel = (key: string) => {
    const [year, month] = key.split('-').map(Number);
    return new Date(year, month - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  };
  const exportCsv = () => {
    const lines = ['Month,Attempted,Delivered,Failed,Estimated cost USD', ...monthly.map((row) =>
      `${row.month},${row.attempted},${row.delivered},${row.failed},${row.cost.toFixed(4)}`
    )];
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv' }));
    link.download = 'whatsapp-message-cost-history.csv';
    link.click();
    URL.revokeObjectURL(link.href);
  };

  return <div className="analytics-dashboard">
    <div className="panel-head analytics-heading">
      <div><h2>WhatsApp reminder costs</h2><p className="muted small">Monthly estimates based on successfully delivered reminder messages.</p></div>
      <button className="secondary-btn" disabled={monthly.length === 0} onClick={exportCsv}>Export cost history</button>
    </div>
    {loadError && <div className="error-message">{loadError}</div>}
    <div className="stat-grid">
      <div className="stat-card"><span className="stat-num">{money(current.cost)}</span><span className="stat-label">Cost this month</span></div>
      <div className="stat-card"><span className="stat-num">{current.delivered}</span><span className="stat-label">Delivered this month</span></div>
      <div className="stat-card"><span className="stat-num">{current.failed}</span><span className="stat-label">Failed (not charged)</span></div>
      <div className="stat-card"><span className="stat-num">{money(projectedCost)}</span><span className="stat-label">Projected month total</span></div>
    </div>
    <section className="panel">
      <h2>How this estimate works</h2>
      <p className="muted small">The current North America utility rate is estimated at ${NORTH_AMERICA_UTILITY_RATE_USD.toFixed(4)} per delivered WhatsApp reminder. Failed messages, email, and browser push are not included. Each month is calculated separately, so the current total automatically starts at zero on the first day of a new month. Future sender records preserve the rate applied at send time.</p>
    </section>
    <section className="panel">
      <div className="panel-head"><h2>Monthly history</h2>{loading && <span className="muted small">Loading costs…</span>}</div>
      {!loading && monthly.length === 0 && <div className="empty-state"><strong>No WhatsApp delivery costs yet</strong><span>Monthly totals will appear after reminders are delivered.</span></div>}
      {monthly.length > 0 && <table className="report-table"><thead><tr><th>Month</th><th>Attempted</th><th>Delivered</th><th>Failed</th><th>Estimated cost</th></tr></thead>
        <tbody>{monthly.map((row) => <tr key={row.month}><td>{monthLabel(row.month)}{row.month === currentKey ? ' (current)' : ''}</td><td>{row.attempted}</td><td>{row.delivered}</td><td>{row.failed}</td><td>{money(row.cost)}</td></tr>)}</tbody>
      </table>}
    </section>
  </div>;
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
