import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getVolunteerDirectory, VolunteerDirectoryEntry } from '../helpers/store';
import {
  DepartmentDirectoryResult,
  DepartmentItemType,
  DepartmentWorkspaceResult,
  createDepartmentItem,
  DepartmentRole,
  getDepartmentDirectory,
  getDepartmentWorkspace,
  initializeDepartments,
  setDepartmentMembership,
  updateDepartmentItem,
} from '../helpers/departments';
import './DepartmentDirectory.css';

const emptyDirectory: DepartmentDirectoryResult = { isOwner: false, managedDepartmentIds: [], accessibleDepartmentIds: [], departments: [], memberships: [] };

const DepartmentDirectory: React.FC<{ isOwner: boolean }> = ({ isOwner }) => {
  const navigate = useNavigate();
  const [directory, setDirectory] = useState(emptyDirectory);
  const [volunteers, setVolunteers] = useState<VolunteerDirectoryEntry[]>([]);
  const [selection, setSelection] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [openDepartmentId, setOpenDepartmentId] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      if (isOwner) await initializeDepartments();
      const [departments, people] = await Promise.all([getDepartmentDirectory(), getVolunteerDirectory('department')]);
      setDirectory(departments);
      setVolunteers(people.sort((a, b) => a.name.localeCompare(b.name)));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Departments could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [isOwner]);

  useEffect(() => { load(); }, [load]);

  const adminDepartmentIds = useMemo(() => new Set(directory.managedDepartmentIds), [directory.managedDepartmentIds]);

  const changeAccess = async (departmentId: string, userId: string, role: DepartmentRole, active: boolean) => {
    setBusy(`${departmentId}_${userId}_${role}`);
    setError('');
    setMessage('');
    try {
      await setDepartmentMembership(departmentId, userId, role, active);
      setMessage(active ? 'Department access added.' : 'Department access removed.');
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Department access could not be changed.');
    } finally {
      setBusy('');
    }
  };

  if (loading) return <section className="panel"><p>Loading departments…</p></section>;

  return <section className="department-workspace">
    <div className="panel department-intro">
      <div><p className="eyebrow">SERVE · CONNECT · GROW</p><h2>Community Hub</h2></div>
      <p className="muted">Explore temple departments, find your team, and open the private workspaces you are authorized to use. Existing tasks and events remain unchanged.</p>
    </div>
    {error && <div className="error-message" role="alert">{error}</div>}
    {message && <div className="success-message" role="status">{message}</div>}
    {directory.departments.length === 0 && <div className="panel empty-state"><strong>No departments are available yet.</strong><span>The Owner can initialize the department directory.</span></div>}
    <div className="department-grid">
      {directory.departments.map((department) => {
        const memberships = directory.memberships.filter((item) => item.departmentId === department.id);
        const admins = memberships.filter((item) => item.role === 'admin');
        const members = memberships.filter((item) => item.role === 'member');
        const canManage = directory.isOwner || adminDepartmentIds.has(department.id);
        const canOpen = directory.accessibleDepartmentIds.includes(department.id);
        const selectedUserId = selection[department.id] || '';
        const assignedIds = new Set(memberships.map((item) => item.userId));
        return <article className="panel department-card" key={department.id}>
          <div className="department-card-heading"><h3>{department.name}</h3>{canManage && <span className="access-badge">Manage access</span>}</div>
          <p>{department.description}</p>
          {canOpen && <button className="secondary-btn department-open-btn" onClick={() => setOpenDepartmentId(openDepartmentId === department.id ? '' : department.id)}>{openDepartmentId === department.id ? 'Close workspace' : 'Open workspace'}</button>}
          {department.id === 'fundraising' && canManage && <button className="primary-btn department-open-btn" onClick={() => navigate('/department/fundraising')}>Open fundraising dashboard</button>}
          {department.id === 'govindas' && canManage && <button className="primary-btn department-open-btn" onClick={() => navigate('/department/govindas')}>Manage menus and orders</button>}
          {!canOpen && <p className="muted small department-private-note">Private workspace · membership required</p>}
          <div className="department-roster">
            <div><strong>Department Admins</strong>{admins.length ? admins.map((item) => <span className="department-person" key={item.id}>{item.name}{directory.isOwner && <button disabled={Boolean(busy)} onClick={() => changeAccess(department.id, item.userId, 'admin', false)}>Remove</button>}</span>) : <span className="muted small">Not assigned</span>}</div>
            <div><strong>Members</strong>{members.length ? members.map((item) => <span className="department-person" key={item.id}><span>{item.name}</span><span className="department-person-actions">{directory.isOwner && <button disabled={Boolean(busy)} onClick={() => changeAccess(department.id, item.userId, 'admin', true)}>Make Admin</button>}{canManage && <button disabled={Boolean(busy)} onClick={() => changeAccess(department.id, item.userId, 'member', false)}>Remove</button>}</span></span>) : <span className="muted small">No members assigned</span>}</div>
          </div>
          {canManage && <div className="department-access-form">
            <label><span>Add volunteer</span><select value={selectedUserId} onChange={(event) => setSelection((current) => ({ ...current, [department.id]: event.target.value }))}>
              <option value="">Choose volunteer…</option>
              {volunteers.filter((person) => !assignedIds.has(person.uid)).map((person) => <option key={person.uid} value={person.uid}>{person.name}</option>)}
            </select></label>
            <div className="row">
              <button className="primary-btn" disabled={!selectedUserId || Boolean(busy)} onClick={() => changeAccess(department.id, selectedUserId, 'member', true)}>Add member</button>
              {directory.isOwner && <button className="secondary-btn" disabled={!selectedUserId || Boolean(busy)} onClick={() => changeAccess(department.id, selectedUserId, 'admin', true)}>Make Department Admin</button>}
            </div>
          </div>}
          {openDepartmentId === department.id && <DepartmentWorkspace departmentId={department.id} />}
        </article>;
      })}
    </div>
  </section>;
};

const DepartmentWorkspace: React.FC<{ departmentId: string }> = ({ departmentId }) => {
  const [workspace, setWorkspace] = useState<DepartmentWorkspaceResult | null>(null);
  const [type, setType] = useState<DepartmentItemType>('announcement');
  const [title, setTitle] = useState('');
  const [details, setDetails] = useState('');
  const [dateTime, setDateTime] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try { setWorkspace(await getDepartmentWorkspace(departmentId)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Workspace could not be loaded.'); }
  }, [departmentId]);
  useEffect(() => { load(); }, [load]);

  const create = async () => {
    if (!title.trim()) return setError('Enter a title.');
    if (type !== 'announcement' && !dateTime) return setError('Choose a date and time.');
    setBusy(true); setError('');
    try {
      await createDepartmentItem(departmentId, type, title, details, type === 'announcement' ? null : new Date(dateTime).getTime());
      setTitle(''); setDetails(''); setDateTime(''); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Item could not be created.'); }
    finally { setBusy(false); }
  };
  const act = async (itemType: DepartmentItemType, itemId: string, action: 'complete' | 'reopen' | 'archive') => {
    setBusy(true); setError('');
    try { await updateDepartmentItem(departmentId, itemType, itemId, action); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Item could not be updated.'); }
    finally { setBusy(false); }
  };
  if (!workspace) return <div className="department-workspace-inner">{error || 'Loading private workspace…'}</div>;
  const upcomingEvents = [...workspace.events].sort((a, b) => (a.dateMillis || 0) - (b.dateMillis || 0));
  const openTasks = workspace.tasks.filter((item) => item.status !== 'completed').length;
  return <div className="department-workspace-inner">
    {error && <div className="error-message">{error}</div>}
    <div className="department-stats"><span><strong>{openTasks}</strong> open tasks</span><span><strong>{upcomingEvents.length}</strong> events</span><span><strong>{workspace.announcements.length}</strong> announcements</span></div>
    <div className="department-content-section"><h4>Announcements</h4>{workspace.announcements.length ? workspace.announcements.map((item) => <DepartmentItemRow key={item.id} item={item} type="announcement" canManage={workspace.canManage} busy={busy} act={act} />) : <p className="muted small">No announcements yet.</p>}</div>
    <div className="department-content-section"><h4>Tasks</h4>{workspace.tasks.length ? workspace.tasks.map((item) => <DepartmentItemRow key={item.id} item={item} type="task" canManage={workspace.canManage} busy={busy} act={act} />) : <p className="muted small">No department tasks yet.</p>}</div>
    <div className="department-content-section"><h4>Events</h4>{upcomingEvents.length ? upcomingEvents.map((item) => <DepartmentItemRow key={item.id} item={item} type="event" canManage={workspace.canManage} busy={busy} act={act} />) : <p className="muted small">No department events yet.</p>}</div>
    {workspace.canManage && <div className="department-create-form"><h4>Add to workspace</h4><label><span>Type</span><select value={type} onChange={(event) => setType(event.target.value as DepartmentItemType)}><option value="announcement">Announcement</option><option value="task">Task</option><option value="event">Event</option></select></label><label><span>Title</span><input value={title} maxLength={180} onChange={(event) => setTitle(event.target.value)} /></label><label><span>Details</span><textarea value={details} maxLength={5000} onChange={(event) => setDetails(event.target.value)} /></label>{type !== 'announcement' && <label><span>Date and time</span><input type="datetime-local" value={dateTime} onChange={(event) => setDateTime(event.target.value)} /></label>}<button className="primary-btn" disabled={busy} onClick={create}>{busy ? 'Saving…' : 'Add item'}</button></div>}
  </div>;
};

const DepartmentItemRow: React.FC<{ item: DepartmentWorkspaceResult['tasks'][number]; type: DepartmentItemType; canManage: boolean; busy: boolean; act: (type: DepartmentItemType, id: string, action: 'complete' | 'reopen' | 'archive') => void }> = ({ item, type, canManage, busy, act }) => <div className={`department-item ${item.status === 'completed' ? 'completed' : ''}`}><div><strong>{item.title}</strong>{item.dateMillis && <span>{new Date(item.dateMillis).toLocaleString()}</span>}{item.details && <p>{item.details}</p>}</div>{canManage && <div className="department-item-actions">{type === 'task' && <button disabled={busy} onClick={() => act(type, item.id, item.status === 'completed' ? 'reopen' : 'complete')}>{item.status === 'completed' ? 'Reopen' : 'Complete'}</button>}<button disabled={busy} onClick={() => act(type, item.id, 'archive')}>Archive</button></div>}</div>;

export default DepartmentDirectory;
