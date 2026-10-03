import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import AuthPage from './pages/Auth';
import AdminDashboard from './pages/AdminDashboard';
import VolunteerDashboard from './pages/VolunteerDashboard';
import VerifyEmail from './pages/VerifyEmail';
import HelpCenter from './pages/HelpCenter';
import PrivacyPolicy from './pages/PrivacyPolicy';
import ClaimPortalInvite from './pages/ClaimPortalInvite';
import ClaimLinkSent from './pages/ClaimLinkSent';
import SharedTask from './pages/SharedTask';
import SharedFundraisingDashboard from './pages/SharedFundraisingDashboard';
import FundraisingDepartmentPage from './pages/FundraisingDepartmentPage';
import GovindasAdminPage from './pages/GovindasAdminPage';
import GovindasOrderPage from './pages/GovindasOrderPage';
import GovindasOrderStatusPage from './pages/GovindasOrderStatusPage';
import PublicEventFeedback from './pages/PublicEventFeedback';
import DepartmentWorkspacePage from './pages/DepartmentWorkspacePage';
import { AuthProvider, useAuth } from './helpers/useAuth';
import { isFirebaseConfigured } from './config/firebase';
import './App.css';

const Loading = () => <div className="loading">Loading...</div>;

const RootRoute = () => {
  const location = useLocation();
  const fundraisingToken = new URLSearchParams(location.search).get('fundraisingToken');
  if (fundraisingToken) {
    return <Navigate to={`/fundraising/shared?token=${encodeURIComponent(fundraisingToken)}`} replace />;
  }
  return <Navigate to="/login" replace />;
};

const routerBasename =
  typeof window !== 'undefined' && window.location.pathname.startsWith('/Volunteers')
    ? '/Volunteers'
    : undefined;

const FirebaseSetupRequired = () => (
  <main className="setup-required">
    <section className="setup-panel">
      <p className="setup-eyebrow">ISKCON Parsippany Community Hub</p>
      <h1>Firebase setup is needed before public testing.</h1>
      <p>
        The app deployed successfully, but GitHub Actions did not receive the
        REACT_APP_FIREBASE_* repository variables required for login, signup, and data.
      </p>
      <p className="setup-note">
        Add the Firebase web config under GitHub repository Settings, Secrets and variables,
        Actions, Variables, then rerun the Pages workflow.
      </p>
    </section>
  </main>
);

// Requires a signed-in user; optionally requires admin.
const Protected: React.FC<{ admin?: boolean; children: React.ReactElement }> = ({
  admin,
  children,
}) => {
  const { user, isAdmin, loading } = useAuth();
  const location = useLocation();
  if (loading) return <Loading />;
  const returnTo = `${location.pathname}${location.search}`;
  if (!user) return <Navigate to={`/login?returnTo=${encodeURIComponent(returnTo)}`} replace />;
  if (!user.emailVerified) return <Navigate to={`/verify-email?returnTo=${encodeURIComponent(returnTo)}`} replace />;
  if (admin && !isAdmin) return <Navigate to="/dashboard" replace />;
  return children;
};

// Redirect already-signed-in users away from the auth screens.
const PublicOnly: React.FC<{ children: React.ReactElement }> = ({ children }) => {
  const { user, isAdmin, loading } = useAuth();
  const location = useLocation();
  if (loading) return <Loading />;
  if (user) {
    const requested = new URLSearchParams(location.search).get('returnTo') || '';
    const returnTo = requested.startsWith('/') && !requested.startsWith('//') ? requested : '';
    return <Navigate to={user.emailVerified ? (returnTo || (isAdmin ? '/admin' : '/dashboard')) : `/verify-email${returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ''}`} replace />;
  }
  return children;
};

function App() {
  if (!isFirebaseConfigured) {
    return <FirebaseSetupRequired />;
  }

  return (
    <AuthProvider>
      <Router basename={routerBasename}>
        <Routes>
          <Route path="/privacy" element={<PrivacyPolicy />} />
          <Route path="/claim" element={<ClaimPortalInvite />} />
          <Route path="/claim-link-sent" element={<ClaimLinkSent />} />
          <Route
            path="/login"
            element={
              <PublicOnly>
                <AuthPage type="login" />
              </PublicOnly>
            }
          />
          <Route
            path="/signup"
            element={
              <PublicOnly>
                <AuthPage type="signup" />
              </PublicOnly>
            }
          />
          <Route path="/verify-email" element={<VerifyEmail />} />
          <Route
            path="/admin"
            element={
              <Protected admin>
                <AdminDashboard />
              </Protected>
            }
          />
          <Route
            path="/dashboard"
            element={
              <Protected>
                <VolunteerDashboard />
              </Protected>
            }
          />
          <Route path="/help" element={<Protected><HelpCenter /></Protected>} />
          <Route path="/task/:taskId" element={<Protected><SharedTask /></Protected>} />
          <Route path="/fundraising/shared" element={<Protected><SharedFundraisingDashboard /></Protected>} />
          <Route path="/department/fundraising" element={<Protected><FundraisingDepartmentPage /></Protected>} />
          <Route path="/department/govindas" element={<Protected><GovindasAdminPage /></Protected>} />
          <Route path="/department/:departmentId/workspace" element={<Protected><DepartmentWorkspacePage /></Protected>} />
          <Route path="/govindas/order" element={<GovindasOrderPage />} />
          <Route path="/govindas/order-status" element={<GovindasOrderStatusPage />} />
          <Route path="/event-feedback/shared" element={<PublicEventFeedback />} />
          <Route path="/" element={<RootRoute />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;
