import React, { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { multiFactor, signOut, TotpMultiFactorGenerator } from 'firebase/auth';
import { QRCodeSVG } from 'qrcode.react';
import { auth } from '../config/firebase';
import { useAuth } from '../helpers/useAuth';
import './Auth.css';

const PrivilegedMfaSetup: React.FC = () => {
  const { user, isAdmin, loading } = useAuth();
  const navigate = useNavigate();
  const [secretKey, setSecretKey] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [secret, setSecret] = useState<Awaited<ReturnType<typeof TotpMultiFactorGenerator.generateSecret>> | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (loading) return <div className="loading">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (!user.emailVerified) return <Navigate to="/login" replace />;
  if (multiFactor(user).enrolledFactors.length > 0) return <Navigate to={isAdmin ? '/admin' : '/dashboard?tab=departments'} replace />;

  const begin = async () => {
    setBusy(true); setError('');
    try {
      const session = await multiFactor(user).getSession();
      const generated = await TotpMultiFactorGenerator.generateSecret(session);
      setSecret(generated); setSecretKey(generated.secretKey);
    } catch (cause) {
      if (cause && typeof cause === 'object' && 'code' in cause
        && (cause as { code?: string }).code === 'auth/requires-recent-login') {
        await signOut(auth);
        navigate('/login?returnTo=%2Fsecurity%2Fmfa&reauthForMfa=1', { replace: true });
        return;
      }
      setError(cause instanceof Error ? cause.message : 'MFA enrollment could not start.');
    } finally { setBusy(false); }
  };

  const finish = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!secret) return;
    setBusy(true); setError('');
    try {
      const assertion = TotpMultiFactorGenerator.assertionForEnrollment(secret, verificationCode.trim());
      await multiFactor(user).enroll(assertion, 'Authenticator app');
      // The enrollment session itself was authenticated with password only.
      // Sign out so the next session proves possession of the new second factor.
      await signOut(auth);
      navigate('/login?mfaEnrolled=1', { replace: true });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The verification code was not accepted.');
    } finally { setBusy(false); }
  };

  return <main className="auth-page"><section className="auth-card" style={{ maxWidth: 620, margin: '3rem auto' }}>
    <h1>Protect your privileged account</h1>
    <p>Owners and Hub Admins must use an authenticator app. Department Admins may also enable it for additional protection.</p>
    {error && <div className="error-message">{error}</div>}
    {!secret ? <button className="submit-btn" disabled={busy} onClick={begin}>{busy ? 'Preparing…' : 'Set up authenticator app'}</button> :
      <form onSubmit={finish}>
        <p>Open Google Authenticator, Microsoft Authenticator, or another authenticator app and scan this QR code:</p>
        <div style={{ display: 'flex', justifyContent: 'center', margin: '1.25rem 0' }}>
          <div style={{ background: '#fff', border: '1px solid #d9e5da', borderRadius: 16, padding: 16 }}>
            <QRCodeSVG
              value={secret.generateQrCodeUrl(user.email || 'owner', 'ISKCON Parsippany Community Hub')}
              size={220}
              level="M"
              marginSize={1}
              title="Authenticator app setup QR code"
            />
          </div>
        </div>
        <p style={{ textAlign: 'center' }}>Cannot scan it? Enter this setup key manually:</p>
        <div className="info-message" style={{ overflowWrap: 'anywhere', fontFamily: 'monospace' }}>{secretKey}</div>
        <div className="form-group"><label htmlFor="mfa-code">6-digit verification code</label><input id="mfa-code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={verificationCode} onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, ''))} required /></div>
        <button className="submit-btn" disabled={busy || verificationCode.length !== 6}>{busy ? 'Verifying…' : 'Enable MFA'}</button>
      </form>}
  </section></main>;
};

export default PrivilegedMfaSetup;
