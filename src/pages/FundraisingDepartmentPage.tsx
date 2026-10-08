import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { auth } from '../config/firebase';
import { useAuth } from '../helpers/useAuth';
import { getDepartmentWorkspace } from '../helpers/departments';
import { subscribeEvents } from '../helpers/store';
import { TempleEvent } from '../helpers/types';
import FundraisingDashboard from './FundraisingDashboard';
import FundraisingCrm from './FundraisingCrm';
import DepartmentWorkspacePage from './DepartmentWorkspacePage';
import './AdminDashboard.css';

const FundraisingDepartmentPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, isAdmin, isOwner } = useAuth();
  const [events, setEvents] = useState<TempleEvent[]>([]);
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [accessError, setAccessError] = useState('');
  const [error, setError] = useState('');
  const [section, setSection] = useState<'crm' | 'dashboard'>('crm');

  useEffect(() => {
    setAllowed(null); setCanManage(false);
    setAccessError('');
    getDepartmentWorkspace('fundraising')
      .then((workspace) => { setCanManage(workspace.canManage || isOwner); setAllowed(true); })
      .catch((cause) => {
        const message = cause instanceof Error ? cause.message : 'Fundraising access could not be verified.';
        setAccessError(message);
        setAllowed(false);
      });
  }, [isOwner, user?.uid]);

  useEffect(() => {
    if (!allowed || !canManage) return;
    return subscribeEvents(setEvents);
  }, [allowed, canManage]);

  if (allowed === null) return <div className="loading">Checking Fundraising access…</div>;
  if (!allowed) {
    const needsMfa = accessError.toLowerCase().includes('multi-factor');
    return <main className="auth-page"><section className="panel auth-card"><h1>{needsMfa ? 'Authenticator verification required' : 'Fundraising access required'}</h1><p>{needsMfa ? 'Your Fundraising Admin assignment is active. Set up an authenticator app, or sign out and sign back in with your authenticator code if it is already enrolled.' : 'Only the Owner or an assigned Fundraising Department Admin can manage this dashboard.'}</p>{accessError && <div className="error-message">{accessError}</div>}<div className="row">{needsMfa && <button className="primary-btn" onClick={() => navigate('/security/mfa')}>Set up authenticator</button>}<button className="secondary-btn" onClick={async () => { await signOut(auth); navigate('/login'); }}>Sign out and sign in again</button><button className="secondary-btn" onClick={() => navigate(isAdmin ? '/admin?tab=departments' : '/dashboard?tab=departments')}>Back to departments</button></div></section></main>;
  }

  return <div className="admin-dashboard">
    <header className="dashboard-header"><div><h1>ISKCON Parsippany Community Hub</h1><p>Serve. Connect. Grow. · Fundraising</p></div><div className="header-actions"><button className="logout-btn" onClick={() => navigate(isAdmin ? '/admin?tab=departments' : '/dashboard?tab=departments')}>Community Hub</button><button className="logout-btn" onClick={async () => { await signOut(auth); navigate('/login'); }}>Logout</button></div></header>
    <main className="dashboard-content">
      {error && <div className="error-message">{error}</div>}
      {canManage ? <><nav className="fundraising-space-tabs" aria-label="Fundraising workspace"><button className={section === 'crm' ? 'active' : ''} onClick={() => setSection('crm')}>Fundraising CRM</button><button className={section === 'dashboard' ? 'active' : ''} onClick={() => setSection('dashboard')}>Live dashboard</button></nav>
      {section === 'crm' ? <FundraisingCrm events={events} uid={user?.uid} setError={setError} initialView={searchParams.get('tab') === 'workspace' ? 'workspace' : undefined} /> : <FundraisingDashboard events={events} uid={user?.uid} isOwner={isOwner} canCreateEvent={isAdmin} setError={setError} />}</> : <section className="panel"><h2>Fundraising CRM · Team workspace</h2><p className="muted">Department members can collaborate here. Donor, pledge, and financial records remain restricted to fundraising admins and the Owner.</p><DepartmentWorkspacePage embedded departmentOverride="fundraising" /></section>}
    </main>
  </div>;
};

export default FundraisingDepartmentPage;
