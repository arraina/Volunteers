import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import AuthPage from './pages/Auth';
import AdminDashboard from './pages/AdminDashboard';
import VolunteerDashboard from './pages/VolunteerDashboard';
import { AuthProvider, useAuth } from './helpers/useAuth';
import './App.css';

const Loading = () => <div className="loading">Loading…</div>;

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
  return (
    <AuthProvider>
      <Router>
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
