import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  createUserWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  updateProfile,
} from 'firebase/auth';
import { auth } from '../config/firebase';
import { getUserAdminRole } from '../helpers/types';
import { createVolunteerProfile, getVolunteer, recordLoginAudit, updateVolunteer } from '../helpers/store';
import { normalizePhoneNumber, validatePhoneNumber } from '../helpers/phone';
import './Auth.css';

interface AuthProps {
  type: 'login' | 'signup';
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === 'object' && 'code' in error) {
    const code = (error as { code?: string }).code;
    switch (code) {
      case 'auth/email-already-in-use':
        return 'An account with this email already exists. Try logging in.';
      case 'auth/invalid-email':
        return 'Please enter a valid email address.';
      case 'auth/weak-password':
        return 'Password must be at least 6 characters.';
      case 'auth/invalid-credential':
      case 'auth/wrong-password':
      case 'auth/user-not-found':
        return 'Incorrect email or password.';
      default:
        break;
    }
  }
  return error instanceof Error ? error.message : fallback;
}

const AuthPage: React.FC<AuthProps> = ({ type }) => {
  const navigate = useNavigate();
  const isLogin = type === 'login';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [phoneTouched, setPhoneTouched] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const actionCodeSettings = {
    url: `${window.location.origin}${window.location.pathname.startsWith('/Volunteers') ? '/Volunteers' : ''}/login`,
  };
  const phoneValidation = validatePhoneNumber(phoneNumber);

  async function routeByRole(uid: string) {
    const user = auth.currentUser;
    const role = user ? await getUserAdminRole(user) : null;
    if (user) await recordLoginAudit(uid, user.email || '', role || 'volunteer').catch(() => undefined);
    if (role) {
      navigate('/admin');
    } else {
      navigate('/dashboard');
    }
  }

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const normalizedEmail = email.trim().toLowerCase();
      const fn = firstName.trim();
      const ln = lastName.trim();
      const phone = normalizePhoneNumber(phoneNumber, true);

      if (!fn || !ln) throw new Error('First and last name are required.');
      if (!normalizedEmail) throw new Error('Email is required.');
      if (password.length < 6) throw new Error('Password must be at least 6 characters.');
      const credential = await createUserWithEmailAndPassword(auth, normalizedEmail, password);
      await updateProfile(credential.user, { displayName: `${fn} ${ln}` });
      await createVolunteerProfile(credential.user.uid, {
        firstName: fn,
        lastName: ln,
        email: normalizedEmail,
        phoneNumber: phone,
        whatsappOptIn: true,
      });
      await sendEmailVerification(credential.user, actionCodeSettings);
      navigate('/verify-email', { state: { email: normalizedEmail } });
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to create your account.'));
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const normalizedEmail = email.trim().toLowerCase();
      if (!normalizedEmail) throw new Error('Email is required.');
      if (!password) throw new Error('Password is required.');

      const credential = await signInWithEmailAndPassword(auth, normalizedEmail, password);
      if (!credential.user.emailVerified) {
        navigate('/verify-email', { state: { email: normalizedEmail } });
        return;
      }
      // Ensure a volunteer profile exists (e.g. accounts created before profile).
      const profile = await getVolunteer(credential.user.uid);
      if (!profile) {
        const parts = (credential.user.displayName || '').split(' ');
        await createVolunteerProfile(credential.user.uid, {
          firstName: parts[0] || '',
          lastName: parts.slice(1).join(' ') || '',
          email: normalizedEmail,
          phoneNumber: '',
          whatsappOptIn: true,
        });
      } else if (profile.invitationStatus === 'invited') {
        await updateVolunteer(profile.uid, { invitationStatus: 'active' });
      }
      await routeByRole(credential.user.uid);
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to log in.'));
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    setError('');
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      setError('Enter your email address first.');
      return;
    }
    setLoading(true);
    try {
      await sendPasswordResetEmail(auth, normalizedEmail, actionCodeSettings);
      window.alert('If an account exists for that email, a password reset link has been sent.');
    } catch (err) {
      const code = err && typeof err === 'object' && 'code' in err
        ? (err as { code?: string }).code
        : '';
      if (code === 'auth/invalid-email') setError('Please enter a valid email address.');
      else if (code === 'auth/too-many-requests') setError('Too many attempts. Please try again later.');
      else window.alert('If an account exists for that email, a password reset link has been sent.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <aside className="auth-hero">
        <div className="brand">
          <span className="leaf">🌿</span> ISKCON Towaco Volunteer Management System
        </div>
        <h1>Simple, friendly volunteer signups for your temple.</h1>
        <p className="lede">
          Organize seva, let volunteers sign up for tasks in a tap, and send automatic
          reminders — all in one place.
        </p>
        <div className="hero-features">
          <div className="hero-feature">
            <div className="icon">🗓️</div>
            <strong>Tasks &amp; events</strong>
            <span>Create events and let volunteers pick their slots.</span>
          </div>
          <div className="hero-feature">
            <div className="icon">🔔</div>
            <strong>Auto reminders</strong>
            <span>WhatsApp, email and push before every task.</span>
          </div>
          <div className="hero-feature">
            <div className="icon">✨</div>
            <strong>AI create</strong>
            <span>Describe an event and tasks appear.</span>
          </div>
          <div className="hero-feature">
            <div className="icon">⏱️</div>
            <strong>Hours &amp; history</strong>
            <span>Track service and look back on past events.</span>
          </div>
        </div>
      </aside>

      <div className="auth-panel">
        <div className="auth-card">
          <h1>{isLogin ? 'Welcome back' : 'Join as a volunteer'}</h1>
          <p className="auth-subtitle">
            {isLogin ? 'Sign in to your account' : 'Create your account to get started'}
          </p>
          {error && <div className="error-message">{error}</div>}

        <form onSubmit={isLogin ? handleLogin : handleSignup}>
          {!isLogin && (
            <>
              <div className="form-group">
                <label htmlFor="firstName">First Name</label>
                <input
                  id="firstName"
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="lastName">Last Name</label>
                <input
                  id="lastName"
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  required
                />
              </div>
            </>
          )}

          <div className="form-group">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          {!isLogin && (
            <div className="form-group">
              <label htmlFor="phone">Phone Number</label>
              <input
                id="phone"
                type="tel"
                placeholder="+1 555 123 4567"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                onBlur={() => setPhoneTouched(true)}
                autoComplete="tel"
                required
                aria-invalid={phoneTouched && !phoneValidation.valid}
                aria-describedby="phone-validation"
              />
              <small
                id="phone-validation"
                className="field-hint"
                style={{ color: phoneTouched ? (phoneValidation.valid ? '#15803d' : '#b91c1c') : undefined }}
              >
                {phoneTouched
                  ? phoneValidation.message
                  : 'Enter a valid phone number. Include the country code for non-US numbers.'}
              </small>
            </div>
          )}

          <div className="form-group">
            <label htmlFor="password">
              {isLogin ? 'Volunteer App Password' : 'Create Volunteer App Password'}
            </label>
            <input
              id="password"
              type="password"
              placeholder={isLogin ? 'Enter your app password' : 'Create a new app password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={isLogin ? 'current-password' : 'new-password'}
              required
            />
            {!isLogin && (
              <small className="field-hint">
                Create a new password for this volunteer app. Do not enter your email account password.
              </small>
            )}
          </div>

          {isLogin && (
            <button
              type="button"
              className="forgot-password"
              onClick={handleForgotPassword}
              disabled={loading}
            >
              Forgot password?
            </button>
          )}

          <button type="submit" disabled={loading || (!isLogin && !phoneValidation.valid)} className="submit-btn">
            {loading ? 'Please wait…' : isLogin ? 'Login' : 'Create Account'}
          </button>
        </form>

          <p className="toggle-link">
            <Link to={isLogin ? '/signup' : '/login'}>
              {isLogin ? 'New volunteer? Create an account' : 'Already have an account? Log in'}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default AuthPage;
