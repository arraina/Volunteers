import React, { useState } from 'react';
import { sendEmailVerification, signOut } from 'firebase/auth';
import { useLocation, useNavigate } from 'react-router-dom';
import { auth } from '../config/firebase';
import { getUserAdminRole } from '../helpers/types';
import { recordLoginAudit } from '../helpers/store';
import { useAuth } from '../helpers/useAuth';
import './Auth.css';

const verificationSettings = () => ({
  url: `${window.location.origin}${window.location.pathname.startsWith('/Volunteers') ? '/Volunteers' : ''}/verify-email`,
});

const VerifyEmail: React.FC = () => {
  const { user, loading } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const email = user?.email || (location.state as { email?: string } | null)?.email || '';

  const checkVerification = async () => {
    if (!user) {
      navigate('/login');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await user.reload();
      if (!auth.currentUser?.emailVerified) {
        setMessage('Your email is not verified yet. Open the link in your email, then try again.');
        return;
      }
      await auth.currentUser.getIdToken(true);
      const verifiedUser = auth.currentUser;
      const role = await getUserAdminRole(verifiedUser);
      await recordLoginAudit(
        verifiedUser.uid,
        verifiedUser.email || '',
        role || 'volunteer'
      );
      navigate(role ? '/admin' : '/dashboard', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not refresh verification status.');
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    if (!user) {
      navigate('/login');
      return;
    }
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await sendEmailVerification(user, verificationSettings());
      setMessage('A new verification email has been sent.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not resend the verification email.');
    } finally {
      setBusy(false);
    }
  };

  const logOut = async () => {
    await signOut(auth);
    navigate('/login');
  };

  if (loading) return <div className="loading">Loading...</div>;

  return (
    <main className="auth-page verification-page">
      <section className="auth-panel">
        <div className="auth-card verification-card">
          <p className="auth-kicker">ISKCON Towaco Volunteer Management System</p>
          <h1>Verify your email</h1>
          <p className="auth-subtitle">
            We sent a verification link to <strong>{email || 'your email address'}</strong>.
            Open that link before accessing volunteer information.
          </p>
          {error && <div className="error-message">{error}</div>}
          {message && <div className="success-message">{message}</div>}
          <button className="submit-btn" onClick={checkVerification} disabled={busy || !user}>
            {busy ? 'Checking...' : "I've verified my email"}
          </button>
          <div className="verification-actions">
            <button className="text-btn" onClick={resend} disabled={busy || !user}>
              Resend email
            </button>
            <button className="text-btn" onClick={logOut} disabled={busy || !user}>
              Use another account
            </button>
          </div>
          {!user && <p className="auth-subtitle">Sign in again to resend the email.</p>}
        </div>
      </section>
    </main>
  );
};

export default VerifyEmail;
