import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { sendEmailVerification, signInWithEmailAndPassword } from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import { auth, functions } from '../config/firebase';
import './Auth.css';

type InvitePreview = { name: string; expiresAt: number };

const ClaimPortalInvite: React.FC = () => {
  const [params] = useSearchParams();
  const token = params.get('invite') || '';
  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [complete, setComplete] = useState(false);

  useEffect(() => {
    const getInvite = httpsCallable<{ token: string }, InvitePreview>(functions, 'getPortalInvite');
    getInvite({ token }).then((result) => setPreview(result.data)).catch((err) => setError(err instanceof Error ? err.message : 'This invitation is invalid.')).finally(() => setLoading(false));
  }, [token]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    if (password.length < 6) return setError('Password must be at least 6 characters.');
    if (password !== confirmPassword) return setError('Passwords do not match.');
    setLoading(true);
    try {
      const normalizedEmail = email.trim().toLowerCase();
      const claim = httpsCallable<{ token: string; email: string; password: string }, { email: string }>(functions, 'claimPortalInvite');
      await claim({ token, email: normalizedEmail, password });
      const credential = await signInWithEmailAndPassword(auth, normalizedEmail, password);
      await sendEmailVerification(credential.user, { url: `${window.location.origin}${window.location.pathname.startsWith('/Volunteers') ? '/Volunteers' : ''}/login` });
      setComplete(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Your account could not be activated.');
    } finally { setLoading(false); }
  };

  return <div className="auth-page">
    <main className="auth-card">
      <div className="auth-card-inner">
        <h1>Activate volunteer portal access</h1>
        {loading && !preview && <p>Checking your secure invitation…</p>}
        {error && <div className="error-message">{error}</div>}
        {complete ? <>
          <div className="success-message">Account created. Check your email and verify it before signing in.</div>
          <Link className="primary-btn" to="/login">Go to login</Link>
        </> : preview && <>
          <p>Welcome, <strong>{preview.name}</strong>. Add your email and choose a password. Your existing task assignments will stay attached to this profile.</p>
          <p className="muted small">This link expires {new Date(preview.expiresAt).toLocaleString()} and can be used once.</p>
          <form className="auth-form" onSubmit={submit}>
            <label>Email<input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
            <label>Password<input type="password" autoComplete="new-password" minLength={6} required value={password} onChange={(e) => setPassword(e.target.value)} /></label>
            <label>Confirm password<input type="password" autoComplete="new-password" minLength={6} required value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} /></label>
            <button className="primary-btn" disabled={loading}>{loading ? 'Activating…' : 'Activate my account'}</button>
          </form>
        </>}
      </div>
    </main>
  </div>;
};

export default ClaimPortalInvite;
