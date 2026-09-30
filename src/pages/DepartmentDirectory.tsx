import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { getVolunteerDirectory, VolunteerDirectoryEntry } from '../helpers/store';
import {
  DepartmentDirectoryResult,
  DepartmentRole,
  getDepartmentDirectory,
  initializeDepartments,
  setDepartmentMembership,
} from '../helpers/departments';
import './DepartmentDirectory.css';

const emptyDirectory: DepartmentDirectoryResult = { isOwner: false, managedDepartmentIds: [], departments: [], memberships: [] };

const DepartmentDirectory: React.FC<{ isOwner: boolean }> = ({ isOwner }) => {
  const [directory, setDirectory] = useState(emptyDirectory);
  const [volunteers, setVolunteers] = useState<VolunteerDirectoryEntry[]>([]);
  const [selection, setSelection] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      if (isOwner) await initializeDepartments();
      const [departments, people] = await Promise.all([getDepartmentDirectory(), getVolunteerDirectory()]);
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
      <div><p className="eyebrow">COMMUNITY DIRECTORY</p><h2>Departments</h2></div>
      <p className="muted">Explore the teams serving the community. Existing tasks and events remain in their current workspaces.</p>
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
        const selectedUserId = selection[department.id] || '';
        const assignedIds = new Set(memberships.map((item) => item.userId));
        return <article className="panel department-card" key={department.id}>
          <div className="department-card-heading"><h3>{department.name}</h3>{canManage && <span className="access-badge">Manage access</span>}</div>
          <p>{department.description}</p>
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
        </article>;
      })}
    </div>
  </section>;
};

export default DepartmentDirectory;
