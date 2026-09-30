import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { auth } from '../config/firebase';
import { useAuth } from '../helpers/useAuth';
import { getDepartmentWorkspace } from '../helpers/departments';
import { subscribeEvents } from '../helpers/store';
import { TempleEvent } from '../helpers/types';
import FundraisingDashboard from './FundraisingDashboard';
import './AdminDashboard.css';

const FundraisingDepartmentPage: React.FC = () => {
  const navigate = useNavigate();
  const { user, isAdmin, isOwner } = useAuth();
  const [events, setEvents] = useState<TempleEvent[]>([]);
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    getDepartmentWorkspace('fundraising')
      .then((workspace) => setAllowed(workspace.canManage || isOwner))
      .catch(() => setAllowed(false));
  }, [isOwner]);

  useEffect(() => {
    if (!allowed) return;
    return subscribeEvents(setEvents);
  }, [allowed]);

  if (allowed === null) return <div className="loading">Checking Fundraising access…</div>;
  if (!allowed) return <main className="auth-page"><section className="panel auth-card"><h1>Fundraising access required</h1><p>Only the Owner or an assigned Fundraising Department Admin can manage this dashboard.</p><button className="primary-btn" onClick={() => navigate(isAdmin ? '/admin?tab=departments' : '/dashboard?tab=departments')}>Back to departments</button></section></main>;

  return <div className="admin-dashboard">
    <header className="dashboard-header"><div><h1>ISKCON Parsippany Community Hub</h1><p>Serve. Connect. Grow. · Fundraising</p></div><div className="header-actions"><button className="logout-btn" onClick={() => navigate(isAdmin ? '/admin?tab=departments' : '/dashboard?tab=departments')}>Community Hub</button><button className="logout-btn" onClick={async () => { await signOut(auth); navigate('/login'); }}>Logout</button></div></header>
    <main className="dashboard-content">{error && <div className="error-message">{error}</div>}<FundraisingDashboard events={events} uid={user?.uid} isOwner={isOwner} canCreateEvent={isAdmin} setError={setError} /></main>
  </div>;
};

export default FundraisingDepartmentPage;
