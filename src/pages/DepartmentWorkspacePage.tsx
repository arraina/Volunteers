import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { signOut } from 'firebase/auth';
import { useNavigate, useParams } from 'react-router-dom';
import { auth } from '../config/firebase';
import {
  createDepartmentItem,
  DepartmentItemType,
  DepartmentWorkspaceResult,
  getDepartmentWorkspace,
  updateDepartmentItem,
} from '../helpers/departments';
import { useAuth } from '../helpers/useAuth';
import './AdminDashboard.css';
import './DepartmentDirectory.css';

type WorkspaceAction = 'complete' | 'reopen' | 'archive';

const DepartmentWorkspacePage: React.FC = () => {
  const { departmentId = '' } = useParams();
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const [workspace, setWorkspace] = useState<DepartmentWorkspaceResult | null>(null);
  const [type, setType] = useState<DepartmentItemType>('announcement');
  const [title, setTitle] = useState('');
  const [details, setDetails] = useState('');
  const [dateTime, setDateTime] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const communityHubPath = isAdmin ? '/admin?tab=departments' : '/dashboard?tab=departments';
  const load = useCallback(async () => {
    setError('');
    try { setWorkspace(await getDepartmentWorkspace(departmentId)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'This department workspace could not be loaded.'); }
  }, [departmentId]);

  useEffect(() => { load(); }, [load]);

  const upcomingEvents = useMemo(() => [...(workspace?.events || [])].sort((a, b) => (a.dateMillis || 0) - (b.dateMillis || 0)), [workspace]);
  const openTasks = workspace?.tasks.filter((item) => item.status !== 'completed').length || 0;

  const create = async () => {
    if (!title.trim()) return setError('Enter a title.');
    if (type !== 'announcement' && !dateTime) return setError('Choose a date and time.');
    setBusy(true); setError(''); setMessage('');
    try {
      await createDepartmentItem(departmentId, type, title, details, type === 'announcement' ? null : new Date(dateTime).getTime());
      setTitle(''); setDetails(''); setDateTime(''); setMessage('Workspace item added.'); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'The workspace item could not be created.'); }
    finally { setBusy(false); }
  };

  const act = async (itemType: DepartmentItemType, itemId: string, action: WorkspaceAction) => {
    setBusy(true); setError(''); setMessage('');
    try { await updateDepartmentItem(departmentId, itemType, itemId, action); setMessage(action === 'archive' ? 'Item archived.' : 'Task updated.'); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'The workspace item could not be updated.'); }
    finally { setBusy(false); }
  };

  if (!workspace && !error) return <div className="loading">Opening private department workspace…</div>;
  if (!workspace) return <main className="auth-page"><section className="panel auth-card"><h1>Department access required</h1><p>{error}</p><button className="primary-btn" onClick={() => navigate(communityHubPath)}>Back to Community Hub</button></section></main>;

  return <div className="admin-dashboard department-workspace-page">
    <header className="dashboard-header">
      <div><h1>{workspace.department.name}</h1><p>ISKCON Parsippany Community Hub · Private department workspace</p></div>
      <div className="header-actions">
        <button className="logout-btn" onClick={() => navigate(communityHubPath)}>Community Hub</button>
        <button className="logout-btn" onClick={async () => { await signOut(auth); navigate('/login'); }}>Logout</button>
      </div>
    </header>
    <main className="dashboard-content department-workspace-main">
      {error && <div className="error-message" role="alert">{error}</div>}
      {message && <div className="success-message" role="status">{message}</div>}
      <section className="department-workspace-hero">
        <div><p className="eyebrow">DEPARTMENT WORKSPACE</p><h2>{workspace.department.name}</h2><p>{workspace.department.description}</p></div>
        <span className="access-badge">{workspace.canManage ? 'Department Admin' : 'Department Member'}</span>
      </section>
      <section className="department-stats department-stats-large" aria-label="Workspace summary">
        <span><strong>{openTasks}</strong>Open tasks</span>
        <span><strong>{upcomingEvents.length}</strong>Events</span>
        <span><strong>{workspace.announcements.length}</strong>Announcements</span>
      </section>
      {(departmentId === 'fundraising' || departmentId === 'govindas') && workspace.canManage && <section className="panel department-tools-panel">
        <div><h2>Department tools</h2><p className="muted">Open the specialized management tools for this department.</p></div>
        <button className="primary-btn" onClick={() => navigate(departmentId === 'fundraising' ? '/department/fundraising' : '/department/govindas')}>{departmentId === 'fundraising' ? 'Open fundraising dashboard' : 'Manage menus and orders'}</button>
      </section>}
      <div className="department-workspace-columns">
        <section className="panel department-content-section"><div className="panel-head"><div><p className="eyebrow">TEAM UPDATES</p><h2>Announcements</h2></div><span className="workspace-count">{workspace.announcements.length}</span></div>{workspace.announcements.length ? workspace.announcements.map((item) => <DepartmentItemRow key={item.id} item={item} type="announcement" canManage={workspace.canManage} busy={busy} act={act} />) : <div className="empty-state"><strong>No announcements yet</strong><span>Department updates will appear here.</span></div>}</section>
        <section className="panel department-content-section"><div className="panel-head"><div><p className="eyebrow">ACTION ITEMS</p><h2>Tasks</h2></div><span className="workspace-count">{openTasks} open</span></div>{workspace.tasks.length ? workspace.tasks.map((item) => <DepartmentItemRow key={item.id} item={item} type="task" canManage={workspace.canManage} busy={busy} act={act} />) : <div className="empty-state"><strong>No department tasks yet</strong><span>Department Admins can add the first task.</span></div>}</section>
        <section className="panel department-content-section"><div className="panel-head"><div><p className="eyebrow">SCHEDULE</p><h2>Events</h2></div><span className="workspace-count">{upcomingEvents.length}</span></div>{upcomingEvents.length ? upcomingEvents.map((item) => <DepartmentItemRow key={item.id} item={item} type="event" canManage={workspace.canManage} busy={busy} act={act} />) : <div className="empty-state"><strong>No department events yet</strong><span>Meetings and important dates will appear here.</span></div>}</section>
      </div>
      {workspace.canManage && <section className="panel department-create-form department-create-full"><div><p className="eyebrow">DEPARTMENT ADMIN</p><h2>Add to workspace</h2><p className="muted">Create an announcement, action item, meeting, or department event.</p></div><div className="department-create-grid"><label><span>Type</span><select value={type} onChange={(event) => setType(event.target.value as DepartmentItemType)}><option value="announcement">Announcement</option><option value="task">Task</option><option value="event">Event or meeting</option></select></label><label className="department-title-field"><span>Title</span><input value={title} maxLength={180} onChange={(event) => setTitle(event.target.value)} placeholder="What needs attention?" /></label>{type !== 'announcement' && <label><span>Date and time</span><input type="datetime-local" value={dateTime} onChange={(event) => setDateTime(event.target.value)} /></label>}<label className="department-details-field"><span>Details</span><textarea rows={6} value={details} maxLength={5000} onChange={(event) => setDetails(event.target.value)} placeholder="Add instructions, context, decisions, or useful links." /></label></div><button className="primary-btn" disabled={busy} onClick={create}>{busy ? 'Saving…' : `Add ${type === 'event' ? 'event' : type}`}</button></section>}
    </main>
  </div>;
};

const DepartmentItemRow: React.FC<{ item: DepartmentWorkspaceResult['tasks'][number]; type: DepartmentItemType; canManage: boolean; busy: boolean; act: (type: DepartmentItemType, id: string, action: WorkspaceAction) => void }> = ({ item, type, canManage, busy, act }) => <article className={`department-item ${item.status === 'completed' ? 'completed' : ''}`}><div><strong>{item.title}</strong>{item.dateMillis && <span>{new Date(item.dateMillis).toLocaleString()}</span>}{item.details && <p>{item.details}</p>}</div>{canManage && <div className="department-item-actions">{type === 'task' && <button disabled={busy} onClick={() => act(type, item.id, item.status === 'completed' ? 'reopen' : 'complete')}>{item.status === 'completed' ? 'Reopen' : 'Complete'}</button>}<button disabled={busy} onClick={() => act(type, item.id, 'archive')}>Archive</button></div>}</article>;

export default DepartmentWorkspacePage;
