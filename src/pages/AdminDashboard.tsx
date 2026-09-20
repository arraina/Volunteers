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
  createOfflineVolunteer,
  createInvitedVolunteerProfile,
  createTask,
  AdminAccess,
  AuditLog,
  AppValueReport,
  CostCategory,
  CostEntry,
  subscribeEvents,
  subscribeCostEntries,
  permanentlyDeleteTaskBatch,
  deleteVolunteerProfile,
  getHourLogs,
  getEventFeedbackRecords,
  getPastTasks,
  getSentMessages,
  getAuditLogs,
  getAppValueReports,
  getReportingTasks,
  grantAdminAccess,
  groupTasksBySeries,
  removeVolunteerFromTask,
  recordInvitationSent,
  sendPortalInvites,
  setPortalInviteSending,
  subscribePortalInviteSettings,
  PortalInviteSettings,
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
  saveAppValueReport,
  setWhatsAppPaused,
  subscribeWhatsAppNotificationSettings,
  WhatsAppNotificationSettings,
  validateReminderHours,
  DEFAULT_HORIZON_WEEKS,
} from '../helpers/store';
import { HourLog } from '../helpers/types';
import AICreateTab from './AICreate';
import EventWorkspace from './EventWorkspace';
import EventCalendar from './EventCalendar';
import AutoCommitDateInput from '../components/AutoCommitDateInput';
import { assertTaskStartNotPast, fromEasternDateTimeInput, toEasternDateTimeInput } from '../helpers/taskDateTime';
import './AdminDashboard.css';

type Tab = 'tasks' | 'ai' | 'events' | 'calendar' | 'volunteers' | 'announcements' | 'history' | 'reports' | 'costs' | 'trash' | 'admins' | 'audit' | 'value';

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

const taskEditValues = (task: VolunteerTask) => ({
  title: task.title,
  description: task.description || '',
  startDateTime: toEasternDateTimeInput(task.startDateTime),
  endDateTime: toEasternDateTimeInput(task.endDateTime),
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
  const [whatsappSettings, setWhatsappSettings] = useState<WhatsAppNotificationSettings>({ paused: false });
  const [error, setError] = useState('');
  const trashCount = useMemo(
    () => new Set(deletedTasks.map((task) => task.deletedBatchId || task.id)).size + deletedRecords.length,
    [deletedTasks, deletedRecords]
  );

  useEffect(() => {
    if (!isOwner && (tab === 'announcements' || tab === 'history' || tab === 'reports')) {
      setTab('tasks');
    }
  }, [isOwner, tab]);

  useEffect(() => {
    const unsubTasks = subscribeTasks(setTasks);
    const unsubVols = subscribeVolunteers(setVolunteers);
    const unsubEvents = subscribeEvents(setEvents);
    const unsubTrash = subscribeDeletedTasks(setDeletedTasks);
    const unsubRecordTrash = subscribeDeletedRecords(setDeletedRecords);
    const unsubWhatsappSettings = subscribeWhatsAppNotificationSettings(setWhatsappSettings);
    return () => {
      unsubTasks();
      unsubVols();
      unsubEvents();
      unsubTrash();
      unsubRecordTrash();
      unsubWhatsappSettings();
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
        <button className={tab === 'calendar' ? 'active' : ''} onClick={() => setTab('calendar')}>
          Event Calendar
        </button>
        <button
          className={tab === 'volunteers' ? 'active' : ''}
          onClick={() => setTab('volunteers')}
        >
          Volunteers
        </button>
        {isOwner && <button
          className={tab === 'announcements' ? 'active' : ''}
          onClick={() => setTab('announcements')}
        >
          Announcements
        </button>}
        {isOwner && <button className={tab === 'history' ? 'active' : ''} onClick={() => setTab('history')}>
          History
        </button>}
        {isOwner && <button className={tab === 'reports' ? 'active' : ''} onClick={() => setTab('reports')}>
          Analytics
        </button>}
        <button className={tab === 'costs' ? 'active' : ''} onClick={() => setTab('costs')}>
          Costs
        </button>
        <button className={tab === 'trash' ? 'active' : ''} onClick={() => setTab('trash')}>
          Trash ({trashCount})
        </button>
        {isOwner && <button className={tab === 'admins' ? 'active' : ''} onClick={() => setTab('admins')}>
          Admin Management
        </button>}
        {isOwner && <button className={tab === 'audit' ? 'active' : ''} onClick={() => setTab('audit')}>
          Audit
        </button>}
        {isOwner && <button className={tab === 'value' ? 'active' : ''} onClick={() => setTab('value')}>
          App Value
        </button>}
        <button onClick={() => navigate('/help')}>Help</button>
      </nav>

      <div className="dashboard-content">
        {whatsappSettings.paused && <div className="whatsapp-paused-banner" role="alert">
          <strong>WhatsApp sending is paused.</strong> Scheduled reminders and WhatsApp announcements will not be sent.
          {whatsappSettings.pauseReason && <> Reason: {whatsappSettings.pauseReason}.</>}
        </div>}
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
        {tab === 'calendar' && <EventCalendar uid={user?.uid} events={events} tasks={tasks} volunteers={volunteers} setError={setError} canManage={isOwner} />}
        {tab === 'volunteers' && <VolunteersTab volunteers={volunteers} uid={user?.uid} isOwner={isOwner} setError={setError} />}
        {tab === 'announcements' && isOwner && (
          <AnnouncementsTab uid={user?.uid} setError={setError} />
        )}
        {tab === 'history' && isOwner && <HistoryTab volunteers={volunteers} events={events} setError={setError} />}
        {tab === 'reports' && isOwner && <ReportsTab volunteers={volunteers} tasks={tasks} events={events} />}
        {tab === 'costs' && <CostTab events={events} uid={user?.uid} isOwner={isOwner} whatsappSettings={whatsappSettings} />}
        {tab === 'trash' && <TrashTab tasks={deletedTasks} records={deletedRecords} isOwner={isOwner} setError={setError} />}
        {tab === 'admins' && isOwner && <AdminManagementTab ownerUid={user?.uid || ''} volunteers={volunteers} setError={setError} />}
        {tab === 'audit' && isOwner && <AuditTab />}
        {tab === 'value' && isOwner && <AppValueTab volunteers={volunteers} />}
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
  const [creatorFilter, setCreatorFilter] = useState<'all' | 'mine' | 'assigned'>('mine');
  const [taskSort, setTaskSort] = useState<'soonest' | 'latest' | 'title'>('soonest');
  const [undoBatchId, setUndoBatchId] = useState('');

  const volunteerById = useMemo(() => {
    const map = new Map<string, VolunteerProfile>();
    volunteers.forEach((v) => map.set(v.uid, v));
    return map;
  }, [volunteers]);

  const activeTasks = useMemo(() => {
    const now = new Date();
    return tasks.filter((task) => (task.endDateTime || task.startDateTime) >= now);
  }, [tasks]);
  const activeEvents = useMemo(() => {
    const now = new Date();
    return events.filter((event) => {
      if (!event.date) return false;
      if (event.allDay) {
        const lastDate = event.endDate || event.date;
        return new Date(lastDate.getFullYear(), lastDate.getMonth(), lastDate.getDate() + 1) > now;
      }
      return (event.endDate || event.date) >= now;
    });
  }, [events]);

  const filteredTasks = useMemo(() => {
    const q = taskSearch.trim().toLowerCase();
    const result = activeTasks.filter((task) => {
      const matchesSearch = !q || [task.title, task.description, task.location, task.eventName]
        .some((value) => value?.toLowerCase().includes(q));
      const matchesStatus = statusFilter === 'all' || effectiveTaskStatus(task) === statusFilter;
      const matchesEvent = eventFilter === 'all'
        || (eventFilter === '__none__' ? !task.eventId : task.eventId === eventFilter);
      const matchesCreator = creatorFilter === 'all'
        || Boolean(uid && (creatorFilter === 'mine'
          ? task.createdBy === uid
          : task.assignedVolunteers.includes(uid)));
      return matchesSearch && matchesStatus && matchesEvent && matchesCreator;
    });
    return result.sort((a, b) => {
      if (taskSort === 'title') return a.title.localeCompare(b.title);
      const delta = a.startDateTime.getTime() - b.startDateTime.getTime();
      return taskSort === 'latest' ? -delta : delta;
    });
  }, [activeTasks, taskSearch, statusFilter, eventFilter, creatorFilter, taskSort, uid]);

  const taskStats = useMemo(() => ({
    total: activeTasks.length,
    open: activeTasks.filter((task) => effectiveTaskStatus(task) === 'open').length,
    needsPeople: activeTasks.filter((task) =>
      !['cancelled', 'completed'].includes(effectiveTaskStatus(task)) && openSlots(task) > 0
    ).length,
    assigned: activeTasks.reduce((sum, task) => sum + task.assignedVolunteers.length, 0),
  }), [activeTasks]);

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
      const reminderHours = validateReminderHours(Array.from(new Set(form.reminderHoursBefore
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .map(Number)
        .filter(Number.isFinite)))
        .sort((a, b) => b - a));

      const startDateTime = fromEasternDateTimeInput(form.startDateTime);
      assertTaskStartNotPast(startDateTime);
      await createTask({
        title: form.title,
        description: form.description,
        startDateTime,
        endDateTime: form.endDateTime ? fromEasternDateTimeInput(form.endDateTime) : null,
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
            {activeEvents.map((ev) => (
              <option key={ev.id} value={ev.id}>
                {ev.name}
              </option>
            ))}
          </select>
          <label className="field-label">Start (Eastern Time — ET)</label>
          <AutoCommitDateInput
            type="datetime-local"
            value={form.startDateTime}
            onValueChange={(value) => setForm({ ...form, startDateTime: value })}
            min={toEasternDateTimeInput(new Date())}
            required
          />
          <label className="field-label">End (optional, Eastern Time — ET)</label>
          <AutoCommitDateInput
            type="datetime-local"
            value={form.endDateTime}
            onValueChange={(value) => setForm({ ...form, endDateTime: value })}
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
          <label className="field-label">Reminder times (hours before the task)</label>
          <input
            type="text"
            placeholder="e.g. 72, 24"
            value={form.reminderHoursBefore}
            onChange={(e) => setForm({ ...form, reminderHoursBefore: e.target.value })}
          />
          <small className="field-hint">One reminder may be any positive number of hours before the task. If you set two reminders, they must be at least 24 hours apart. Sample formats: 2 or 48, 24.</small>
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
            <p className="muted small">{filteredTasks.length} of {activeTasks.length} current or upcoming occurrences shown</p>
          </div>
          {(taskSearch || statusFilter !== 'all' || eventFilter !== 'all' || creatorFilter !== 'all') && (
            <button className="link-btn" onClick={() => {
              setTaskSearch('');
              setStatusFilter('all');
              setEventFilter('all');
              setCreatorFilter('mine');
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
              {activeEvents.map((event) => <option key={event.id} value={event.id}>{event.name}</option>)}
            </select>
          </label>
          <label>
            <span>Task view</span>
            <select value={creatorFilter} onChange={(e) => setCreatorFilter(e.target.value as typeof creatorFilter)}>
              <option value="mine">Created by me</option>
              <option value="assigned">Assigned to me</option>
              <option value="all">All tasks</option>
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
  const isHistoricalTask = task.startDateTime < new Date();
  const assignmentClosed = status === 'filled' || status === 'completed' || status === 'cancelled' || openSlots(task) === 0;

  const saveTaskEdit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    const start = fromEasternDateTimeInput(editForm.startDateTime);
    const end = editForm.endDateTime ? fromEasternDateTimeInput(editForm.endDateTime) : null;
    const needed = Number.parseInt(editForm.volunteersNeeded, 10);
    let reminders: number[];
    try { reminders = validateReminderHours(Array.from(new Set(editForm.reminderHoursBefore.split(',')
      .map((value) => value.trim())
      .filter(Boolean)
      .map(Number)
      .filter(Number.isFinite)))
      .sort((a, b) => b - a)); }
    catch (error) { setError(error instanceof Error ? error.message : 'Invalid reminder schedule.'); return; }
    if (!editForm.title.trim() || Number.isNaN(start.getTime())) {
      setError('Task title and a valid start date/time are required.');
      return;
    }
    const startChanged = editForm.startDateTime !== toEasternDateTimeInput(task.startDateTime);
    if (startChanged) {
      try { assertTaskStartNotPast(start); }
      catch (error) { setError(error instanceof Error ? error.message : 'Task start date and time cannot be in the past.'); return; }
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
    const endChanged = editForm.endDateTime !== toEasternDateTimeInput(task.endDateTime);
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
        openForSignup: true,
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
        <label><span>Start (Eastern Time — ET)</span><AutoCommitDateInput type="datetime-local" value={editForm.startDateTime} onValueChange={(value) => setEditForm({ ...editForm, startDateTime: value })} min={toEasternDateTimeInput(new Date())} disabled={isHistoricalTask} required />{isHistoricalTask && <small className="field-hint">Historical task times are locked. Other task details can still be edited.</small>}</label>
        <label><span>End (optional, Eastern Time — ET)</span><AutoCommitDateInput type="datetime-local" value={editForm.endDateTime} onValueChange={(value) => setEditForm({ ...editForm, endDateTime: value })} disabled={isHistoricalTask} /></label>
        <label><span>Location</span><input value={editForm.location} onChange={(e) => setEditForm({ ...editForm, location: e.target.value })} /></label>
        <label><span>Volunteers needed</span><input type="number" min={Math.max(1, task.assignedVolunteers.length)} value={editForm.volunteersNeeded} onChange={(e) => setEditForm({ ...editForm, volunteersNeeded: e.target.value })} required /></label>
        <label className="task-edit-wide"><span>Reminder times (hours before the task)</span><input value={editForm.reminderHoursBefore} onChange={(e) => setEditForm({ ...editForm, reminderHoursBefore: e.target.value })} placeholder="48, 24" /><small className="field-hint">One reminder may be any positive number of hours before the task. If you set two reminders, they must be at least 24 hours apart. Sample formats: 2 or 48, 24.</small></label>
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
  isOwner: boolean;
  setError: (s: string) => void;
}> = ({ volunteers, uid, isOwner, setError }) => {
  const [form, setForm] = useState(emptyVolunteerForm);
  const [editing, setEditing] = useState<string | null>(null);
  const [editForm, setEditForm] = useState(emptyVolunteerForm);
  const [search, setSearch] = useState('');
  const [volunteerSort, setVolunteerSort] = useState<'name' | 'hours' | 'newest'>('name');
  const [resendingInvitation, setResendingInvitation] = useState<string | null>(null);
  const [inviteSettings, setInviteSettings] = useState<PortalInviteSettings>({ enabled: false, templateName: 'volunteer_portal_invite_v1', language: 'en' });
  const [inviteBusy, setInviteBusy] = useState(false);

  useEffect(() => subscribePortalInviteSettings(setInviteSettings), []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      if (
        !form.firstName.trim() ||
        !form.lastName.trim() ||
        !form.phoneNumber.trim()
      ) {
        throw new Error('First name, last name, and phone are required.');
      }
      if (form.email.trim()) await createVolunteerInvitation({ ...form, whatsappOptIn: true });
      else await createOfflineVolunteer({ ...form, whatsappOptIn: true });
      setForm(emptyVolunteerForm);
      window.alert(form.email.trim()
        ? 'Volunteer added. A login invitation was sent by email.'
        : 'Volunteer added and queued for a WhatsApp portal invitation. They can be assigned to tasks now.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add volunteer.');
    }
  };

  const pendingInvites = volunteers.filter((v) => !v.email && (
    ['waiting_for_template', 'failed'].includes(v.invitationStatus || '')
    || (v.invitationStatus === 'sent' && Boolean(v.invitationExpiresAt && v.invitationExpiresAt.getTime() <= Date.now()))
  ));

  const toggleInviteSending = async () => {
    if (!isOwner) return;
    if (!inviteSettings.enabled && !window.confirm('Enable portal invitations only after Meta shows volunteer_portal_invite_v1 as Approved. Continue?')) return;
    setInviteBusy(true);
    try { await setPortalInviteSending(!inviteSettings.enabled); }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not change invitation settings.'); }
    finally { setInviteBusy(false); }
  };

  const sendPendingInvites = async () => {
    if (!window.confirm(`Send WhatsApp portal invitations to ${pendingInvites.length} queued volunteer(s)?`)) return;
    setInviteBusy(true);
    setError('');
    try {
      const result = await sendPortalInvites(pendingInvites.map((v) => v.uid));
      window.alert(`Sent ${result.sent} invitation(s).${result.failed ? ` ${result.failed} failed.` : ''}`);
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not send invitations.'); }
    finally { setInviteBusy(false); }
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
            placeholder="Email (optional)"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
          <input
            type="tel"
            aria-label="Volunteer phone number"
            placeholder="Phone (for reminders)"
            value={form.phoneNumber}
            onChange={(e) => setForm({ ...form, phoneNumber: e.target.value })}
            required
          />
          <button type="submit" className="primary-btn">
            {form.email.trim() ? 'Add Volunteer & Send Email Invitation' : 'Add Volunteer & Queue Portal Invite'}
          </button>
        </form>
        <p className="muted small">
          Without an email, the volunteer can be assigned immediately. Their WhatsApp portal invite stays queued until the Owner enables the approved template.
        </p>
        {isOwner && <div className="portal-invite-panel">
          <h3>Portal invitation queue</h3>
          <p><strong>{pendingInvites.length}</strong> waiting · Template <code>{inviteSettings.templateName}</code></p>
          <p className={`invite-state ${inviteSettings.enabled ? 'enabled' : ''}`}>
            Sending is {inviteSettings.enabled ? 'enabled' : 'disabled'}
          </p>
          <div className="row">
            <button type="button" className="secondary-btn" disabled={inviteBusy} onClick={toggleInviteSending}>
              {inviteSettings.enabled ? 'Disable sending' : 'Mark approved & enable'}
            </button>
            <button type="button" className="primary-btn" disabled={inviteBusy || !inviteSettings.enabled || pendingInvites.length === 0} onClick={sendPendingInvites}>
              {inviteBusy ? 'Working...' : 'Send all pending'}
            </button>
          </div>
          <small>Links expire 7 days after sending. Failed invitations stay visible and can be retried.</small>
        </div>}
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
          CSV columns: first name, last name, email (optional), phone, WhatsApp consent. Email-less rows are queued for the portal invite.
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
                  <small className="field-hint">{v.email ? 'Login email cannot be changed here.' : 'Email will be added by the volunteer through their secure portal invitation.'}</small>
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
                      {v.email || 'Email not added'} · {v.phoneNumber || 'no phone'} · {v.totalHours}h
                      {v.invitationStatus && v.invitationStatus !== 'active' ? ` · Invite: ${v.invitationStatus.replaceAll('_', ' ')}` : ''}
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
          {(['whatsapp', 'email'] as NotificationChannel[]).map((c) => (
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
  events: TempleEvent[];
  setError: (s: string) => void;
}> = ({ volunteers, events, setError }) => {
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
    const now = new Date();
    for (const event of events) {
      if (!event.date) continue;
      const lastDate = event.endDate || event.date;
      const isPast = event.allDay
        ? new Date(lastDate.getFullYear(), lastDate.getMonth(), lastDate.getDate() + 1) <= now
        : lastDate < now;
      if (isPast) groups.set(event.id, { key: event.id, name: event.name, date: lastDate, tasks: [] });
    }
    for (const task of pastTasks) {
      if ((task.endDateTime || task.startDateTime) >= now) continue;
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
  }, [pastTasks, events]);

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
      {eventGroups.length === 0 && <p className="muted">No past events or tasks yet.</p>}

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
// Owner-only application value reports
// ---------------------------------------------------------------------------

const AppValueTab: React.FC<{ volunteers: VolunteerProfile[] }> = ({ volunteers }) => {
  const [allTasks, setAllTasks] = useState<VolunteerTask[]>([]);
  const [logs, setLogs] = useState<HourLog[]>([]);
  const [messages, setMessages] = useState<SentMessage[]>([]);
  const [reports, setReports] = useState<AppValueReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setLocalError] = useState('');
  const [notice, setNotice] = useState('');
  const [volunteerRate, setVolunteerRate] = useState(30);
  const [adminRate, setAdminRate] = useState(25);
  const [minutesPerReminder, setMinutesPerReminder] = useState(2);

  useEffect(() => {
    Promise.all([getReportingTasks(), getHourLogs(), getSentMessages(10_000), getAppValueReports()])
      .then(([taskRows, hourRows, messageRows, reportRows]) => {
        setAllTasks(taskRows); setLogs(hourRows); setMessages(messageRows); setReports(reportRows);
        if (reportRows[0]) {
          setVolunteerRate(reportRows[0].volunteerHourlyValue);
          setAdminRate(reportRows[0].adminHourlyValue);
          setMinutesPerReminder(reportRows[0].manualMinutesPerReminder);
        }
      })
      .catch((reason) => setLocalError(reason instanceof Error ? reason.message : 'Could not load application-value data.'))
      .finally(() => setLoading(false));
  }, []);

  const monthKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  const currentMonth = monthKey(new Date());
  const availableMonths = useMemo(() => {
    const keys = new Set<string>([currentMonth]);
    allTasks.forEach((task) => keys.add(monthKey(task.startDateTime)));
    logs.forEach((log) => keys.add(monthKey(log.checkIn)));
    messages.forEach((message) => keys.add(monthKey(message.sentAt)));
    volunteers.forEach((volunteer) => keys.add(monthKey(volunteer.joinedDate)));
    reports.forEach((report) => keys.add(report.month));
    return Array.from(keys).sort((a, b) => b.localeCompare(a));
  }, [allTasks, logs, messages, reports, volunteers, currentMonth]);

  const buildReport = (month: string): Omit<AppValueReport, 'id' | 'generatedAt'> => {
    const monthTasks = allTasks.filter((task) => monthKey(task.startDateTime) === month);
    const monthLogs = logs.filter((log) => monthKey(log.checkIn) === month);
    const monthMessages = messages.filter((message) => monthKey(message.sentAt) === month);
    const completed = monthTasks.filter((task) => (task.endDateTime || task.startDateTime) < new Date() && effectiveTaskStatus(task) !== 'cancelled');
    const requiredPositions = monthTasks.filter((task) => effectiveTaskStatus(task) !== 'cancelled').reduce((sum, task) => sum + task.volunteersNeeded, 0);
    const assignedPositions = monthTasks.filter((task) => effectiveTaskStatus(task) !== 'cancelled').reduce((sum, task) => sum + task.assignedVolunteers.length, 0);
    const expectedAttendance = completed.reduce((sum, task) => sum + task.assignedVolunteers.length, 0);
    const completedIds = new Set(completed.map((task) => task.id));
    const attendedSessions = new Set(monthLogs.filter((log) => completedIds.has(log.taskId)).map((log) => `${log.taskId}:${log.volunteerId}`)).size;
    const delivered = monthMessages.filter((message) => message.channel === 'whatsapp'
      ? ['delivered', 'read'].includes(message.status)
      : message.status === 'sent').length;
    const failed = monthMessages.filter((message) => message.status === 'failed').length;
    const whatsappCost = monthMessages.filter((message) => message.channel === 'whatsapp' && !['failed', 'skipped'].includes(message.status))
      .reduce((sum, message) => sum + (message.estimatedCostUsd ?? NORTH_AMERICA_UTILITY_RATE_USD), 0);
    const volunteerHours = monthLogs.reduce((sum, log) => sum + (log.hours || 0), 0);
    const adminHoursSaved = delivered * minutesPerReminder / 60;
    const volunteerServiceValue = volunteerHours * volunteerRate;
    const adminTimeValue = adminHoursSaved * adminRate;
    const totalValue = volunteerServiceValue + adminTimeValue;
    return {
      month,
      volunteerHourlyValue: volunteerRate,
      adminHourlyValue: adminRate,
      manualMinutesPerReminder: minutesPerReminder,
      eventsSupported: new Set(monthTasks.map((task) => task.eventId).filter(Boolean)).size,
      tasksScheduled: monthTasks.length,
      completedTasks: completed.length,
      requiredPositions,
      assignedPositions,
      staffingRate: requiredPositions ? Math.min(100, Math.round(assignedPositions / requiredPositions * 100)) : 0,
      volunteerHours,
      attendedSessions,
      expectedAttendance,
      attendanceRate: expectedAttendance ? Math.min(100, Math.round(attendedSessions / expectedAttendance * 100)) : 0,
      newVolunteers: volunteers.filter((volunteer) => monthKey(volunteer.joinedDate) === month).length,
      remindersDelivered: delivered,
      reminderFailures: failed,
      whatsappCost,
      adminHoursSaved,
      volunteerServiceValue,
      adminTimeValue,
      totalValue,
      netValue: totalValue - whatsappCost,
    };
  };

  const saveReports = async (includeMissingHistory: boolean) => {
    setSaving(true); setLocalError(''); setNotice('');
    try {
      const existing = new Set(reports.map((report) => report.month));
      const months = includeMissingHistory
        ? availableMonths.filter((month) => month === currentMonth || !existing.has(month))
        : [currentMonth];
      await Promise.all(months.map((month) => saveAppValueReport(buildReport(month))));
      setReports(await getAppValueReports());
      setNotice(includeMissingHistory ? `${months.length} monthly report(s) generated or refreshed.` : 'Current month report refreshed and saved.');
    } catch (reason) {
      setLocalError(reason instanceof Error ? reason.message : 'Could not save monthly reports.');
    } finally { setSaving(false); }
  };

  const current = reports.find((report) => report.month === currentMonth) || { id: currentMonth, ...buildReport(currentMonth) };
  const money = (value: number) => value.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
  const label = (month: string) => {
    const [year, value] = month.split('-').map(Number);
    return new Date(year, value - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  };
  const exportCsv = () => {
    const rows = ['Month,Net value,Volunteer value,Admin time value,WhatsApp cost,Volunteer hours,Staffing rate,Attendance rate,Events,Tasks,Reminders delivered', ...reports.map((report) =>
      [report.month, report.netValue.toFixed(2), report.volunteerServiceValue.toFixed(2), report.adminTimeValue.toFixed(2), report.whatsappCost.toFixed(4), report.volunteerHours.toFixed(2), report.staffingRate, report.attendanceRate, report.eventsSupported, report.tasksScheduled, report.remindersDelivered].join(',')
    )];
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([rows.join('\n')], { type: 'text/csv' }));
    link.download = 'temple-app-value-reports.csv'; link.click(); URL.revokeObjectURL(link.href);
  };

  return <div className="analytics-dashboard">
    <div className="panel-head analytics-heading"><div><h2>Application value</h2><p className="muted small">Owner-only monthly evidence of operational and financial value delivered to the temple.</p></div><button className="secondary-btn" disabled={!reports.length} onClick={exportCsv}>Export reports</button></div>
    {error && <div className="error-message">{error}</div>}{notice && <div className="success-message">{notice}</div>}
    <section className="panel analytics-filters"><h2>Value assumptions</h2><div className="filter-bar value-filters">
      <label><span>Volunteer hour value ($)</span><input type="number" min="0" step="0.01" value={volunteerRate} onChange={(event) => setVolunteerRate(Number(event.target.value))} /></label>
      <label><span>Admin hourly cost ($)</span><input type="number" min="0" step="0.01" value={adminRate} onChange={(event) => setAdminRate(Number(event.target.value))} /></label>
      <label><span>Minutes saved/reminder</span><input type="number" min="0" step="0.5" value={minutesPerReminder} onChange={(event) => setMinutesPerReminder(Number(event.target.value))} /></label>
    </div><p className="muted small">Change these assumptions before saving. Saved reports retain the rates used for that month.</p><div className="row"><button className="primary-btn" disabled={saving || loading} onClick={() => saveReports(false)}>Refresh &amp; save current month</button><button className="secondary-btn" disabled={saving || loading} onClick={() => saveReports(true)}>Generate missing monthly history</button></div></section>
    <div className="stat-grid">
      <div className="stat-card"><span className="stat-num">{money(current.netValue)}</span><span className="stat-label">Estimated net value this month</span></div>
      <div className="stat-card"><span className="stat-num">{current.volunteerHours.toFixed(1)}</span><span className="stat-label">Volunteer hours</span></div>
      <div className="stat-card"><span className="stat-num">{current.staffingRate}%</span><span className="stat-label">Task staffing</span></div>
      <div className="stat-card"><span className="stat-num">{current.attendanceRate}%</span><span className="stat-label">Recorded attendance</span></div>
      <div className="stat-card"><span className="stat-num">{current.adminHoursSaved.toFixed(1)}h</span><span className="stat-label">Estimated admin time saved</span></div>
    </div>
    <section className="panel"><h2>{label(currentMonth)} impact</h2><div className="summary-strip value-summary"><div><strong>{current.eventsSupported}</strong><span>Events supported</span></div><div><strong>{current.tasksScheduled}</strong><span>Tasks coordinated</span></div><div><strong>{current.remindersDelivered}</strong><span>Reminders delivered</span></div><div><strong>{current.newVolunteers}</strong><span>New volunteers</span></div></div><p className="muted small">Estimated value: {money(current.volunteerServiceValue)} in volunteer service plus {money(current.adminTimeValue)} in saved administrative time, less {money(current.whatsappCost)} in tracked WhatsApp cost. Attendance depends on check-in records; assignments without check-ins are treated as not recorded.</p></section>
    <section className="panel"><div className="panel-head"><h2>Saved monthly reports</h2>{loading && <span className="muted small">Loading value history…</span>}</div>{!loading && !reports.length && <div className="empty-state"><strong>No saved reports yet</strong><span>Generate the current month or backfill available history.</span></div>}{reports.length > 0 && <div className="table-scroll"><table className="report-table"><thead><tr><th>Month</th><th>Net value</th><th>Hours</th><th>Staffing</th><th>Attendance</th><th>Events</th><th>Tasks</th><th>Reminders</th><th>Saved</th></tr></thead><tbody>{reports.map((report) => <tr key={report.id}><td>{label(report.month)}</td><td>{money(report.netValue)}</td><td>{report.volunteerHours.toFixed(1)}</td><td>{report.staffingRate}%</td><td>{report.attendanceRate}%</td><td>{report.eventsSupported}</td><td>{report.tasksScheduled}</td><td>{report.remindersDelivered}</td><td>{report.generatedAt?.toLocaleString() || '—'}</td></tr>)}</tbody></table></div>}</section>
  </div>;
};

// ---------------------------------------------------------------------------
// Owner-only application activity audit tab
// ---------------------------------------------------------------------------

const AuditTab: React.FC = () => {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [role, setRole] = useState<'all' | AuditLog['role']>('all');
  const [category, setCategory] = useState('all');
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
      && (category === 'all' || log.category === category)
      && (!cutoff || log.occurredAt.getTime() >= cutoff)
      && (!needle || [log.email, log.actorId, log.role, log.event, log.category, log.action,
        log.summary, log.targetType, log.targetId, log.targetLabel, log.userAgent, log.platform,
        log.timezone, ...(log.changedFields || [])]
        .some((value) => value?.toLowerCase().includes(needle)))
    );
  }, [category, logs, period, role, search]);

  const categories = useMemo(() => Array.from(new Set(logs.map((log) => log.category || 'Other'))).sort(), [logs]);
  const uniqueUsers = new Set(filtered.map((log) => log.actorId)).size;
  const loginCount = filtered.filter((log) => log.event === 'login').length;
  const changeCount = filtered.filter((log) => log.event === 'activity').length;
  const destructiveCount = filtered.filter((log) => log.action?.includes('trashed') || log.action?.includes('deleted') || log.action === 'admin.access_removed').length;

  const exportCsv = () => {
    const clean = (value: string) => `"${value.replace(/"/g, '""')}"`;
    const rows = ['Date and time,Category,Action,Summary,Role,Actor email,Actor ID,Target type,Target ID,Target label,Changed fields,Source,Platform,Timezone,Device/browser', ...filtered.map((log) => [
      log.occurredAt.toISOString(), log.category || '', log.action || '', log.summary || '', log.role,
      log.email, log.actorId, log.targetType || '', log.targetId || '', log.targetLabel || '',
      (log.changedFields || []).join('; '), log.source || '', log.platform || '', log.timezone || '', log.userAgent || '',
    ].map(clean).join(','))];
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([rows.join('\n')], { type: 'text/csv' }));
    link.download = 'application-activity-audit.csv';
    link.click();
    URL.revokeObjectURL(link.href);
  };

  return <div className="analytics-dashboard">
    <div className="panel-head analytics-heading">
      <div><h2>Application audit</h2><p className="muted small">Owner-only, read-only history of logins and changes across the application. Activity tracking begins with this deployment.</p></div>
      <button className="secondary-btn" disabled={filtered.length === 0} onClick={exportCsv}>Export filtered CSV</button>
    </div>
    {loadError && <div className="error-message">{loadError}</div>}
    <section className="panel analytics-filters">
      <div className="filter-bar audit-filters activity-audit-filters">
        <label className="search-field"><span>Search everything</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Person, action, task, event, record ID, field…" /></label>
        <label><span>Category</span><select value={category} onChange={(event) => setCategory(event.target.value)}><option value="all">All categories</option>{categories.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
        <label><span>Role</span><select value={role} onChange={(event) => setRole(event.target.value as typeof role)}><option value="all">All roles</option><option value="owner">Owner</option><option value="admin">Admin</option><option value="volunteer">Volunteer</option><option value="system">System</option></select></label>
        <label><span>Date range</span><select value={period} onChange={(event) => setPeriod(event.target.value as typeof period)}><option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option><option value="all">All history</option></select></label>
      </div>
    </section>
    <div className="stat-grid">
      <div className="stat-card"><span className="stat-num">{filtered.length}</span><span className="stat-label">Recorded activities</span></div>
      <div className="stat-card"><span className="stat-num">{uniqueUsers}</span><span className="stat-label">Unique users</span></div>
      <div className="stat-card"><span className="stat-num">{loginCount}</span><span className="stat-label">Successful logins</span></div>
      <div className="stat-card"><span className="stat-num">{changeCount}</span><span className="stat-label">Data changes</span></div>
      <div className="stat-card"><span className="stat-num">{destructiveCount}</span><span className="stat-label">Remove/delete actions</span></div>
    </div>
    <section className="panel">
      <div className="panel-head"><h2>Activity records</h2>{loading && <span className="muted small">Loading audit history…</span>}</div>
      {!loading && filtered.length === 0 && <div className="empty-state"><strong>No matching activity</strong><span>Adjust the filters or perform a new action.</span></div>}
      {filtered.length > 0 && <div className="table-scroll"><table className="report-table audit-table"><thead><tr><th>Date and time</th><th>Category</th><th>Activity</th><th>Performed by</th><th>Role</th><th>Target</th><th>Details</th></tr></thead>
        <tbody>{filtered.map((log) => <tr key={log.id}>
          <td>{log.occurredAt.toLocaleString()}</td><td>{log.category || 'Other'}</td>
          <td><strong>{log.summary || log.action || log.event}</strong><div className="muted small">{log.action}</div></td>
          <td>{log.email || (log.role === 'system' ? 'Automated system' : log.actorId)}</td>
          <td><span className="admin-tag">{log.role}</span></td>
          <td>{log.targetLabel || '—'}{log.targetType && <div className="muted small">{log.targetType} · {log.targetId}</div>}</td>
          <td>{log.changedFields?.length ? `Changed: ${log.changedFields.join(', ')}` : log.event === 'login' ? [log.platform, log.timezone].filter(Boolean).join(' · ') : '—'}</td>
        </tr>)}</tbody>
      </table></div>}
    </section>
  </div>;
};

// ---------------------------------------------------------------------------
// Operating cost tab
// ---------------------------------------------------------------------------

const NORTH_AMERICA_UTILITY_RATE_USD = 0.0034;
const COST_CATEGORIES: { value: CostCategory; label: string }[] = [
  { value: 'whatsapp', label: 'WhatsApp' }, { value: 'sms', label: 'SMS / verification' },
  { value: 'firebase', label: 'Firebase / Google Cloud' }, { value: 'email', label: 'Email service' },
  { value: 'ai_api', label: 'AI / API' }, { value: 'software', label: 'Software subscription' },
  { value: 'food_supplies', label: 'Food / supplies' }, { value: 'rental_printing', label: 'Rental / printing' },
  { value: 'transport_reimbursement', label: 'Transportation / reimbursement' }, { value: 'other', label: 'Other' },
];
const categoryLabel = (value: string) => COST_CATEGORIES.find((item) => item.value === value)?.label || value;
type DisplayCost = CostEntry & { automatic?: boolean };

const CostTab: React.FC<{ events: TempleEvent[]; uid?: string; isOwner: boolean; whatsappSettings: WhatsAppNotificationSettings }> = ({ events, uid, isOwner, whatsappSettings }) => {
  const [messages, setMessages] = useState<SentMessage[]>([]);
  const [entries, setEntries] = useState<CostEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [updatingWhatsapp, setUpdatingWhatsapp] = useState(false);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<'all' | CostCategory>('all');
  const [period, setPeriod] = useState<'today' | '7' | '30' | 'month' | 'all'>('month');
  const [costStatus, setCostStatus] = useState<'all' | 'estimated' | 'confirmed'>('all');

  useEffect(() => {
    const unsubscribe = subscribeCostEntries(setEntries);
    getSentMessages(10_000)
      .then(setMessages)
      .catch((error) => setLoadError(error instanceof Error ? error.message : 'Could not load costs.'))
      .finally(() => setLoading(false));
    return unsubscribe;
  }, []);

  const costs = useMemo<DisplayCost[]>(() => [...entries, ...messages
    .filter((message) => message.channel === 'whatsapp' && !['failed', 'skipped'].includes(message.status))
    .map((message) => ({ id: `message-${message.id}`, category: 'whatsapp' as CostCategory,
      description: 'WhatsApp reminder', amountUsd: message.estimatedCostUsd ?? NORTH_AMERICA_UTILITY_RATE_USD,
      incurredAt: message.sentAt, vendor: 'Meta', status: 'estimated' as const, recurring: false,
      source: 'imported' as const, automatic: true }))]
    .sort((a, b) => b.incurredAt.getTime() - a.incurredAt.getTime()), [entries, messages]);

  const filtered = useMemo(() => {
    const start = new Date();
    if (period === 'today') start.setHours(0, 0, 0, 0);
    else if (period === '7' || period === '30') start.setDate(start.getDate() - Number(period));
    else if (period === 'month') { start.setDate(1); start.setHours(0, 0, 0, 0); }
    const term = search.trim().toLowerCase();
    return costs.filter((item) => (period === 'all' || item.incurredAt >= start)
      && (category === 'all' || item.category === category)
      && (costStatus === 'all' || item.status === costStatus)
      && (!term || [item.description, item.vendor, item.notes, categoryLabel(item.category), events.find((event) => event.id === item.eventId)?.name]
        .some((value) => value?.toLowerCase().includes(term))));
  }, [costs, period, category, costStatus, search, events]);

  const monthly = useMemo(() => {
    const groups = new Map<string, { month: string; total: number; confirmed: number; estimated: number; count: number }>();
    costs.forEach((item) => {
      const key = `${item.incurredAt.getFullYear()}-${String(item.incurredAt.getMonth() + 1).padStart(2, '0')}`;
      const row = groups.get(key) || { month: key, total: 0, confirmed: 0, estimated: 0, count: 0 };
      row.total += item.amountUsd; row[item.status] += item.amountUsd; row.count += 1; groups.set(key, row);
    });
    return Array.from(groups.values()).sort((a, b) => b.month.localeCompare(a.month));
  }, [costs]);

  const now = new Date();
  const currentKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const current = monthly.find((row) => row.month === currentKey) || { month: currentKey, total: 0, confirmed: 0, estimated: 0, count: 0 };
  const todayTotal = costs.filter((item) => item.incurredAt.toDateString() === now.toDateString()).reduce((sum, item) => sum + item.amountUsd, 0);
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const projectedCost = current.total * daysInMonth / Math.max(1, now.getDate());
  const money = (value: number) => value < 0.01 && value > 0
    ? `$${value.toFixed(4)}`
    : value.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
  const monthLabel = (key: string) => {
    const [year, month] = key.split('-').map(Number);
    return new Date(year, month - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  };
  const exportCsv = () => {
    const quote = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const lines = ['Date/time,Category,Description,Vendor,Event,Status,Source,Amount USD', ...filtered.map((item) =>
      [item.incurredAt.toISOString(), categoryLabel(item.category), item.description, item.vendor,
        events.find((event) => event.id === item.eventId)?.name || '', item.status, item.source, item.amountUsd.toFixed(4)].map(quote).join(','))];
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv' }));
    link.download = 'operating-costs.csv';
    link.click();
    URL.revokeObjectURL(link.href);
  };
  const toggleWhatsAppSending = async () => {
    if (!uid || !isOwner) return;
    if (whatsappSettings.paused) {
      if (!window.confirm('Resume all scheduled WhatsApp reminders and announcements?')) return;
      setUpdatingWhatsapp(true); setLoadError('');
      try { await setWhatsAppPaused(false, uid); }
      catch (error) { setLoadError(error instanceof Error ? error.message : 'Could not resume WhatsApp sending.'); }
      finally { setUpdatingWhatsapp(false); }
      return;
    }
    if (!window.confirm('Pause ALL WhatsApp reminders and announcements? Due reminders will be recorded as skipped and will not be sent later.')) return;
    const reason = window.prompt('Optional: enter the reason for pausing WhatsApp sending.', 'Emergency stop by Owner');
    if (reason === null) return;
    setUpdatingWhatsapp(true); setLoadError('');
    try { await setWhatsAppPaused(true, uid, reason); }
    catch (error) { setLoadError(error instanceof Error ? error.message : 'Could not pause WhatsApp sending.'); }
    finally { setUpdatingWhatsapp(false); }
  };

  return <div className="analytics-dashboard">
    <div className="panel-head analytics-heading">
      <div><h2>Operating costs</h2><p className="muted small">Read-only view of costs captured automatically as services are used.</p></div>
      <button className="secondary-btn" disabled={filtered.length === 0} onClick={exportCsv}>Export filtered CSV</button>
    </div>
    {loadError && <div className="error-message">{loadError}</div>}
    <section className={`panel whatsapp-control ${whatsappSettings.paused ? 'is-paused' : ''}`}>
      <div><h2>WhatsApp sending control</h2>
        <p className="muted small">Status: <strong>{whatsappSettings.paused ? 'PAUSED' : 'ACTIVE'}</strong>. Applies to scheduled reminders and WhatsApp announcements. Hard limit: 100 successfully accepted WhatsApp messages per Eastern Time day.</p>
        {whatsappSettings.pausedAt && <p className="muted small">Paused {whatsappSettings.pausedAt.toLocaleString()}{whatsappSettings.pauseReason ? ` — ${whatsappSettings.pauseReason}` : ''}</p>}
      </div>
      {isOwner
        ? <button className={whatsappSettings.paused ? 'primary-btn' : 'danger-btn'} disabled={updatingWhatsapp} onClick={toggleWhatsAppSending}>{updatingWhatsapp ? 'Updating…' : whatsappSettings.paused ? 'Resume WhatsApp sending' : 'Pause WhatsApp sending'}</button>
        : <span className="muted small">Only an Owner can change this setting.</span>}
    </section>
    <div className="stat-grid">
      <div className="stat-card"><span className="stat-num">{money(todayTotal)}</span><span className="stat-label">Cost today</span></div>
      <div className="stat-card"><span className="stat-num">{money(current.total)}</span><span className="stat-label">Month to date</span></div>
      <div className="stat-card"><span className="stat-num">{money(current.confirmed)}</span><span className="stat-label">Confirmed this month</span></div>
      <div className="stat-card"><span className="stat-num">{money(projectedCost)}</span><span className="stat-label">Projected month total</span></div>
    </div>
    <section className="panel">
      <div className="filter-bar cost-filters">
        <label><span>Search</span><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Description, vendor, event, notes" /></label>
        <label><span>Period</span><select value={period} onChange={(e) => setPeriod(e.target.value as typeof period)}><option value="today">Today</option><option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="month">This month</option><option value="all">All history</option></select></label>
        <label><span>Category</span><select value={category} onChange={(e) => setCategory(e.target.value as typeof category)}><option value="all">All categories</option>{COST_CATEGORIES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
        <label><span>Status</span><select value={costStatus} onChange={(e) => setCostStatus(e.target.value as typeof costStatus)}><option value="all">All statuses</option><option value="confirmed">Confirmed</option><option value="estimated">Estimated</option></select></label>
      </div>
      <div className="panel-head"><h2>Transactions ({filtered.length})</h2>{loading && <span className="muted small">Loading costs…</span>}</div>
      {!loading && filtered.length === 0 && <div className="empty-state"><strong>No matching costs</strong><span>Captured service costs will appear here automatically.</span></div>}
      {filtered.length > 0 && <div className="table-scroll"><table className="report-table"><thead><tr><th>Date/time</th><th>Category</th><th>Description</th><th>Event/vendor</th><th>Status</th><th>Amount</th></tr></thead><tbody>{filtered.map((item) => <tr key={item.id}><td>{item.incurredAt.toLocaleString()}</td><td>{categoryLabel(item.category)}</td><td><strong>{item.description}</strong>{item.recurring && <div className="muted small">Recurring</div>}{item.notes && <div className="muted small">{item.notes}</div>}</td><td>{events.find((event) => event.id === item.eventId)?.name || 'Organization-wide'}<div className="muted small">{item.vendor || '—'}</div></td><td><span className="admin-tag">{item.status}</span><div className="muted small">{item.automatic ? 'Automatic' : 'Previously recorded'}</div></td><td>{money(item.amountUsd)}</td></tr>)}</tbody></table></div>}
    </section>
    <section className="panel">
      <h2>Monthly history</h2>
      {monthly.length > 0 && <div className="table-scroll"><table className="report-table"><thead><tr><th>Month</th><th>Transactions</th><th>Confirmed</th><th>Estimated</th><th>Total</th></tr></thead><tbody>{monthly.map((row) => <tr key={row.month}><td>{monthLabel(row.month)}{row.month === currentKey ? ' (current)' : ''}</td><td>{row.count}</td><td>{money(row.confirmed)}</td><td>{money(row.estimated)}</td><td><strong>{money(row.total)}</strong></td></tr>)}</tbody></table></div>}
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
  const whatsappOptOutVolunteers = [...volunteers]
    .filter((volunteer) => volunteer.whatsappOptIn === false || Boolean(volunteer.whatsappOptOutAt))
    .sort((a, b) =>
      (b.whatsappOptOutAt?.getTime() || 0) - (a.whatsappOptOutAt?.getTime() || 0) ||
      a.name.localeCompare(b.name)
    );
  const totalHours = scopedLogs.reduce((sum, log) => sum + (log.hours || 0), 0);

  const whatsappDeliveryIssues = useMemo(() => {
    const byVolunteer = new Map<string, SentMessage[]>();
    messages
      .filter((message) => message.channel === 'whatsapp')
      .sort((a, b) => b.sentAt.getTime() - a.sentAt.getTime())
      .forEach((message) => {
        const records = byVolunteer.get(message.volunteerId) || [];
        records.push(message);
        byVolunteer.set(message.volunteerId, records);
      });

    return Array.from(byVolunteer.entries()).flatMap(([volunteerId, records]) => {
      const latest = records[0];
      const ageHours = (Date.now() - latest.sentAt.getTime()) / 3_600_000;
      const failureText = `${latest.failureCode || ''} ${latest.failureReason || ''}`.toLowerCase();
      const possiblyUnreachable = latest.status === 'failed' && (
        latest.failureCode === '131026' ||
        failureText.includes('undeliverable') ||
        failureText.includes('not a valid whatsapp')
      );
      const stalled = ['accepted', 'sent'].includes(latest.status) && ageHours >= 24;
      if (latest.status !== 'failed' && !stalled) return [];

      let consecutiveFailures = 0;
      for (const record of records) {
        if (record.status !== 'failed') break;
        consecutiveFailures += 1;
      }
      const lastDelivered = records.find((record) => ['delivered', 'read'].includes(record.status));
      const volunteer = volunteers.find((item) => item.uid === volunteerId);
      return [{
        volunteerId,
        volunteerName: volunteer?.name || volunteerId,
        phoneNumber: volunteer?.phoneNumber || '—',
        assessment: possiblyUnreachable
          ? 'Possibly blocked or unreachable'
          : stalled
            ? 'No delivery confirmation after 24 hours'
            : 'Delivery failed',
        lastDeliveredAt: lastDelivered?.deliveredAt || lastDelivered?.sentAt,
        consecutiveFailures,
        detail: latest.failureReason || (stalled ? `Last status: ${latest.status}` : 'No provider detail'),
        failureCode: latest.failureCode,
        action: possiblyUnreachable || stalled
          ? 'Verify the number and contact the volunteer by email or phone.'
          : 'Review the provider error, correct the profile if needed, then use a future reminder.',
      }];
    });
  }, [messages, volunteers]);

  const channelRows = (['whatsapp', 'email'] as NotificationChannel[]).map((channel) => {
    const records = scopedMessages.filter((message) => message.channel === channel);
    const accepted = records.filter((message) => !['failed', 'skipped'].includes(message.status)).length;
    const sent = records.filter((message) => ['sent', 'delivered', 'read'].includes(message.status)).length;
    const delivered = channel === 'whatsapp'
      ? records.filter((message) => ['delivered', 'read'].includes(message.status)).length
      : sent;
    const read = records.filter((message) => message.status === 'read').length;
    const failed = records.filter((message) => message.status === 'failed').length;
    const skipped = records.filter((message) => message.status === 'skipped').length;
    return { channel, attempted: records.length - skipped, accepted, sent, delivered, read, failed, skipped };
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

  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const emailThisMonth = messages.filter((message) => message.channel === 'email' && message.sentAt >= monthStart).length;
  const emailToday = messages.filter((message) => message.channel === 'email' && message.sentAt >= dayStart).length;
  const estimatedDocuments = volunteers.length + allTasks.length + events.length + logs.length + messages.length + feedback.length;
  const estimatedStorageMib = estimatedDocuments * 2 / 1024;
  const newProfilesLast30Days = volunteers.filter((volunteer) =>
    (volunteer.createdAt || volunteer.joinedDate) >= new Date(now.getTime() - 30 * 86400_000)
  ).length;
  const authEta = newProfilesLast30Days > 0
    ? new Date(now.getFullYear(), now.getMonth() + Math.ceil((50_000 - volunteers.length) / newProfilesLast30Days), 1).toLocaleDateString()
    : 'No limit date at current growth';
  const projectedEmailMonth = emailThisMonth * daysInMonth / Math.max(1, now.getDate());
  const emailEta = projectedEmailMonth >= 3_000 && emailThisMonth > 0
    ? `Around day ${Math.ceil(3_000 / (emailThisMonth / Math.max(1, now.getDate())))} of this month`
    : 'Not expected this month';
  const capacityRows: Array<{
    service: string; usage: string; limit: string; percent?: number; forecast: string; basis: string; href: string;
  }> = [
    { service: 'Firebase Authentication', usage: `${volunteers.length.toLocaleString()} volunteer profiles`, limit: '50,000 MAU no-cost tier (Blaze)', percent: volunteers.length / 50_000 * 100, forecast: authEta, basis: 'Profile count is a conservative proxy; actual monthly active users are provider-only.', href: 'https://firebase.google.com/docs/auth/' },
    { service: 'Cloud Firestore storage', usage: `≈ ${estimatedStorageMib.toFixed(2)} MiB from ${estimatedDocuments.toLocaleString()} loaded records`, limit: '1 GiB stored data', percent: estimatedStorageMib / 1024 * 100, forecast: 'Not enough storage-growth history', basis: 'Estimate assumes 2 KiB per loaded document and does not include indexes or records outside query windows.', href: 'https://firebase.google.com/docs/firestore/pricing' },
    { service: 'Cloud Firestore reads', usage: 'Provider dashboard required', limit: '50,000 document reads/day', forecast: 'Cannot project without Google usage telemetry', basis: 'The browser cannot safely read project-wide billing metrics.', href: 'https://console.cloud.google.com/firestore/databases/-default-/usage?project=temple-volunteers-8ff23' },
    { service: 'Cloud Firestore writes', usage: 'Provider dashboard required', limit: '20,000 document writes/day', forecast: 'Cannot project without Google usage telemetry', basis: 'The browser cannot safely read project-wide billing metrics.', href: 'https://console.cloud.google.com/firestore/databases/-default-/usage?project=temple-volunteers-8ff23' },
    { service: 'Firebase Cloud Functions', usage: 'Provider dashboard required', limit: '2,000,000 invocations/month no-cost quota', forecast: 'Cannot project without Google usage telemetry', basis: 'Used for secure account operations and WhatsApp lifecycle webhooks.', href: 'https://console.cloud.google.com/functions/list?project=temple-volunteers-8ff23' },
    { service: 'Google Cloud Scheduler', usage: '1 hourly reminder job in this project', limit: '3 jobs free per billing account', forecast: 'Within the free job allowance if the billing account has no more than 3 jobs total', basis: 'The free allowance is account-wide; jobs in other Google Cloud projects are not visible to this app.', href: 'https://console.cloud.google.com/cloudscheduler?project=temple-volunteers-8ff23' },
    { service: 'GitHub Pages hosting', usage: 'Bandwidth is not exposed to the app', limit: '1 GiB site; 100 GiB/month soft bandwidth limit', forecast: 'Cannot project without GitHub traffic telemetry', basis: 'The public app is deployed through GitHub Pages.', href: 'https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits' },
    { service: 'Cloudflare AI proxy', usage: 'Provider dashboard required', limit: '100,000 Worker requests/day (Free)', forecast: 'Cannot project without Cloudflare analytics', basis: 'Only AI Create requests pass through this Worker.', href: 'https://dash.cloudflare.com/' },
    { service: 'Gemini API', usage: 'Provider dashboard required', limit: 'Varies by model, project, and usage tier', forecast: 'Check active limits in Google AI Studio', basis: 'Google does not provide one fixed free quota for every Gemini model.', href: 'https://ai.google.dev/gemini-api/docs/rate-limits' },
    { service: 'Resend email', usage: `${emailThisMonth.toLocaleString()} tracked this month; ${emailToday} today`, limit: '3,000/month and 100/day (Free)', percent: emailThisMonth / 3_000 * 100, forecast: emailEta, basis: 'Based on message records retained by this app; confirm totals in Resend.', href: 'https://resend.com/docs/knowledge-base/account-quotas-and-limits' },
  ];

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
          {dateRange === 'custom' && <><label><span>From</span><AutoCommitDateInput type="date" value={customFrom} onValueChange={setCustomFrom} /></label><label><span>To</span><AutoCommitDateInput type="date" value={customTo} onValueChange={setCustomTo} /></label></>}
          <label><span>Event</span><select value={analyticsEvent} onChange={(e) => setAnalyticsEvent(e.target.value)}>
            <option value="all">All events</option>{events.map((event) => <option key={event.id} value={event.id}>{event.name}</option>)}
          </select></label>
          <label><span>Reminder channel</span><select value={channelFilter} onChange={(e) => setChannelFilter(e.target.value as typeof channelFilter)}>
            <option value="all">All channels</option><option value="whatsapp">WhatsApp</option><option value="email">Email</option>
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
        <div className="stat-card"><span className="stat-num">{whatsappOptOutVolunteers.length}</span><span className="stat-label">WhatsApp turned off</span></div>
      </div>

      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>WhatsApp reminders turned off</h2>
            <p className="muted small">All volunteers who opted out of WhatsApp reminders. This list is not limited by the task-date filters above.</p>
          </div>
          <span className="admin-tag">{whatsappOptOutVolunteers.length} volunteer{whatsappOptOutVolunteers.length === 1 ? '' : 's'}</span>
        </div>
        {whatsappOptOutVolunteers.length === 0
          ? <p className="success-text">No volunteers have turned off WhatsApp reminders.</p>
          : <div className="table-scroll"><table className="report-table">
              <thead><tr><th>Volunteer</th><th>Email</th><th>Phone</th><th>Turned off</th><th>Status</th></tr></thead>
              <tbody>{whatsappOptOutVolunteers.map((volunteer) => <tr key={volunteer.uid}>
                <td><strong>{volunteer.name || 'Unnamed volunteer'}</strong></td>
                <td>{volunteer.email || '—'}</td>
                <td>{volunteer.phoneNumber || '—'}</td>
                <td>{volunteer.whatsappOptOutAt?.toLocaleString() || 'Date not recorded'}</td>
                <td><span className="admin-tag">{volunteer.participationStatus || 'inactive'}</span></td>
              </tr>)}</tbody>
            </table></div>}
      </section>

      <section className="panel service-capacity">
        <div className="panel-head"><div><h2>Free-service capacity</h2><p className="muted small">Current no-cost limits and the best usage signal available inside this application.</p></div></div>
        <div className="capacity-note"><strong>Important:</strong> Only rows marked as estimates or tracked records are calculated here. Provider-dashboard rows are intentionally not guessed. WhatsApp and phone-verification SMS are paid services and remain under Costs.</div>
        <div className="table-scroll"><table className="report-table"><thead><tr><th>Service</th><th>Current usage</th><th>Free limit</th><th>Used</th><th>Expected limit time</th><th>Measurement</th></tr></thead>
          <tbody>{capacityRows.map((row) => <tr key={row.service}>
            <td><a href={row.href} target="_blank" rel="noreferrer"><strong>{row.service}</strong></a></td>
            <td>{row.usage}</td><td>{row.limit}</td>
            <td>{row.percent === undefined ? '—' : <div className="capacity-meter-cell"><div className="capacity-meter" aria-label={`${row.percent.toFixed(2)}% used`}><span style={{ width: `${Math.min(100, row.percent)}%` }} /></div><span>{row.percent < 0.01 ? '<0.01' : row.percent.toFixed(2)}%</span></div>}</td>
            <td>{row.forecast}</td><td className="muted small">{row.basis}</td>
          </tr>)}</tbody>
        </table></div>
        <p className="muted small">Limits were reviewed September 14, 2026. Select a service name to verify its current provider limit and detailed usage.</p>
      </section>

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
          <table className="report-table"><thead><tr><th>Channel</th><th>Attempted</th><th>Accepted</th><th>Sent</th><th>Delivered</th><th>Read</th><th>Failed</th><th>Skipped</th><th>Delivery</th><th>Read rate</th></tr></thead>
            <tbody>{channelRows.map((row) => <tr key={row.channel}><td>{row.channel}</td><td>{row.attempted}</td><td>{row.accepted}</td><td>{row.sent}</td><td>{row.delivered}</td><td>{row.read}</td><td>{row.failed}</td><td>{row.skipped}</td><td>{row.sent ? `${Math.round(row.delivered / row.sent * 100)}%` : '—'}</td><td>{row.delivered ? `${Math.round(row.read / row.delivered * 100)}%` : '—'}</td></tr>)}</tbody>
          </table>
          {scopedMessages.some((message) => message.channel === 'whatsapp') && <>
            <h3>Recent WhatsApp lifecycle</h3>
            <div className="table-scroll"><table className="report-table"><thead><tr><th>Volunteer</th><th>Task</th><th>Current status</th><th>Accepted</th><th>Sent</th><th>Delivered</th><th>Read</th><th>Failure</th></tr></thead>
              <tbody>{scopedMessages.filter((message) => message.channel === 'whatsapp').slice(0, 25).map((message) => <tr key={message.id}>
                <td>{volunteers.find((volunteer) => volunteer.uid === message.volunteerId)?.name || message.volunteerId}</td>
                <td>{allTasks.find((task) => task.id === message.taskId)?.title || '—'}</td>
                <td><span className="admin-tag">{message.status}</span></td>
                <td>{message.acceptedAt?.toLocaleString() || message.sentAt.toLocaleString()}</td>
                <td>{['sent', 'delivered', 'read'].includes(message.status) ? 'Confirmed' : '—'}</td>
                <td>{message.deliveredAt?.toLocaleString() || '—'}</td>
                <td>{message.readAt?.toLocaleString() || '—'}</td>
                <td>{message.skipReason || (message.failureReason ? `${message.failureCode ? `${message.failureCode}: ` : ''}${message.failureReason}` : '—')}</td>
              </tr>)}</tbody>
            </table></div>
          </>}
          {whatsappDeliveryIssues.length > 0 && <>
            <h3>WhatsApp delivery issues</h3>
            <p className="muted small">WhatsApp does not confirm when a recipient blocks a business. “Possibly blocked” can also mean an invalid, inactive, offline, or otherwise unreachable number.</p>
            <div className="table-scroll"><table className="report-table"><thead><tr><th>Volunteer</th><th>Assessment</th><th>Last delivered</th><th>Consecutive failures</th><th>Provider detail</th><th>Recommended action</th></tr></thead>
              <tbody>{whatsappDeliveryIssues.map((issue) => <tr key={issue.volunteerId}>
                <td>{issue.volunteerName}<br /><span className="muted small">{issue.phoneNumber}</span></td>
                <td><span className="admin-tag">{issue.assessment}</span></td>
                <td>{issue.lastDeliveredAt?.toLocaleString() || 'Never recorded'}</td>
                <td>{issue.consecutiveFailures}</td>
                <td>{issue.failureCode ? `${issue.failureCode}: ` : ''}{issue.detail}</td>
                <td>{issue.action}</td>
              </tr>)}</tbody>
            </table></div>
          </>}
          <p className="muted small">Readiness: {scopedVolunteers.filter((v) => v.whatsappOptIn && v.phoneNumber).length} WhatsApp · {scopedVolunteers.filter((v) => v.email).length} email.</p>
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
