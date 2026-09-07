import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import AuthPage from './pages/Auth';
import AdminDashboard from './pages/AdminDashboard';
import VolunteerDashboard from './pages/VolunteerDashboard';
import { AuthProvider, useAuth } from './helpers/useAuth';
import { isFirebaseConfigured } from './config/firebase';
import './App.css';

const Loading = () => <div className="loading">Loading...</div>;

const routerBasename =
  typeof window !== 'undefined' && window.location.pathname.startsWith('/Volunteers')
    ? '/Volunteers'
    : undefined;

const FirebaseSetupRequired = () => (
  <main className="setup-required">
    <section className="setup-panel">
      <p className="setup-eyebrow">Temple Volunteers</p>
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
  if (loading) return <Loading />;
  if (!user) return <Navigate to="/login" replace />;
  if (admin && !isAdmin) return <Navigate to="/dashboard" replace />;
  return children;
};

// Redirect already-signed-in users away from the auth screens.
const PublicOnly: React.FC<{ children: React.ReactElement }> = ({ children }) => {
  const { user, isAdmin, loading } = useAuth();
  if (loading) return <Loading />;
  if (user) return <Navigate to={isAdmin ? '/admin' : '/dashboard'} replace />;
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
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;