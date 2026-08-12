import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  updateProfile,
} from 'firebase/auth';
import { collection, doc, getDocs, query, setDoc, Timestamp, updateDoc, where } from 'firebase/firestore';
import { auth, db, isFirebaseConfigured, useDemoMode } from '../config/firebase';
import { isUserAdmin } from '../helpers/types';
import { ensureDemoVolunteer, getDemoVolunteers, saveDemoVolunteers, setDemoSession } from '../helpers/demoStore';
import './Auth.css';

interface AuthProps {
  type: 'login' | 'signup';
}

const DEFAULT_ADMIN_USERNAME = 'admin';
const DEFAULT_ADMIN_PASSWORD = 'admin';
const FIREBASE_ADMIN_EMAIL = 'admin@example.com';
const FIREBASE_ADMIN_PASSWORD = 'admin123';

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function splitDisplayName(displayName = '') {
  const parts = displayName.trim().split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] || '',
    lastName: parts.slice(1).join(' ') || '',
  };
}

export const AuthPage: React.FC<AuthProps> = ({ type }) => {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleCreateVolunteer = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const normalizedFirstName = firstName.trim();
      const normalizedLastName = lastName.trim();
      const normalizedEmail = email.trim().toLowerCase();

      if (!normalizedFirstName || !normalizedLastName || !normalizedEmail) {
        throw new Error('First name, last name, phone, and email are required.');
      }

      if (!phoneNumber.trim()) {
        throw new Error('First name, last name, phone, and email are required.');
      }

      if (password.length < 6) {
        throw new Error('Password must be at least 6 characters.');
      }

      const name = `${normalizedFirstName} ${normalizedLastName}`;
      const profile = {
        firstName: normalizedFirstName,
        lastName: normalizedLastName,
        name,
        email: normalizedEmail,
        phoneNumber: phoneNumber.trim(),
      };

      const shouldUseLocalStore =
        !isFirebaseConfigured ||
        useDemoMode;

      if (shouldUseLocalStore) {
        const id = `volunteer-${Date.now()}`;
        const session = setDemoSession(normalizedEmail, name, false);
        saveDemoVolunteers([
          ...getDemoVolunteers(),
          {
            ...profile,
            address: '',
            assignedEvents: [],
            assignedServices: [],
            id,
            uid: session.uid,
            availableHours: 0,
            joinedDate: new Date(),
          },
        ]);
        alert('Your account has been saved.');
        navigate('/dashboard');
        return;
      }

      const credential = await createUserWithEmailAndPassword(auth, normalizedEmail, password);
      await updateProfile(credential.user, { displayName: name });

      const matchingProfiles = await getDocs(
        query(collection(db, 'volunteers'), where('email', '==', normalizedEmail))
      );
      const existingProfile = matchingProfiles.docs[0];

      if (existingProfile) {
        await updateDoc(existingProfile.ref, {
          firstName: profile.firstName,
          lastName: profile.lastName,
          name: profile.name,
          phoneNumber: profile.phoneNumber,
          updatedAt: Timestamp.now(),
        });
      } else {
        await setDoc(doc(db, 'volunteers', credential.user.uid), {
          ...profile,
          address: '',
          assignedEvents: [],
          assignedServices: [],
          joinedDate: Timestamp.now(),
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
        });
      }
      alert('Your account has been saved.');
      navigate('/dashboard');
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to create volunteer account'));
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
      const isDefaultAdminLogin =
        normalizedEmail === DEFAULT_ADMIN_USERNAME && password === DEFAULT_ADMIN_PASSWORD;

      if (!isFirebaseConfigured) {
        const session = setDemoSession(normalizedEmail);
        ensureDemoVolunteer(session);
        navigate(session.isAdmin ? '/admin' : '/dashboard');
        return;
      }

      if (isDefaultAdminLogin) {
        const isLocalDemo =
          useDemoMode ||
          !isFirebaseConfigured;

        if (isLocalDemo) {
          setDemoSession(DEFAULT_ADMIN_USERNAME, 'Default Admin', true);
          window.location.assign('/admin?demo=true');
          return;
        }

        try {
          const adminCredential = await signInWithEmailAndPassword(
            auth,
            FIREBASE_ADMIN_EMAIL,
            FIREBASE_ADMIN_PASSWORD,
          );
          await updateProfile(adminCredential.user, { displayName: 'Default Admin' });
          navigate('/admin');
          return;
        } catch (adminSignInError: unknown) {
          const code = (adminSignInError as { code?: string }).code;
          const shouldCreateDefaultAdmin =
            code === 'auth/user-not-found' ||
            code === 'auth/invalid-credential' ||
            code === 'auth/wrong-password';

          if (!shouldCreateDefaultAdmin) {
            throw adminSignInError;
          }

          const adminCredential = await createUserWithEmailAndPassword(
            auth,
            FIREBASE_ADMIN_EMAIL,
            FIREBASE_ADMIN_PASSWORD,
          );
          await updateProfile(adminCredential.user, { displayName: 'Default Admin' });
          navigate('/admin');
          return;
        }
      }

      if (!normalizedEmail) {
        throw new Error('Username is required.');
      }

      if (!password) {
        throw new Error('Password is required.');
      }

      const userCredential = await signInWithEmailAndPassword(auth, normalizedEmail, password);
      const user = userCredential.user;
      navigate((await isUserAdmin(user)) ? '/admin' : '/dashboard');
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to log in'));
    } finally {
      setLoading(false);
    }
  };

  const handleGmailAuth = async () => {
    setError('');
    setLoading(true);

    try {
      if (!isFirebaseConfigured || useDemoMode) {
        throw new Error('Gmail login requires Firebase.');
      }

      const credential = await signInWithPopup(auth, new GoogleAuthProvider());
      const gmailUser = credential.user;
      const normalizedEmail = (gmailUser.email || '').trim().toLowerCase();

      if (!normalizedEmail) {
        throw new Error('Gmail did not return an email address.');
      }

      const fallbackName = normalizedEmail.split('@')[0];
      const nameParts = splitDisplayName(gmailUser.displayName || fallbackName);
      const normalizedFirstName = nameParts.firstName || fallbackName;
      const normalizedLastName = nameParts.lastName || 'User';
      const name = `${normalizedFirstName} ${normalizedLastName}`;

      const matchingProfiles = await getDocs(
        query(collection(db, 'volunteers'), where('email', '==', normalizedEmail))
      );
      const existingProfile = matchingProfiles.docs[0];

      if (existingProfile) {
        await updateDoc(existingProfile.ref, {
          firstName: existingProfile.data().firstName || normalizedFirstName,
          lastName: existingProfile.data().lastName || normalizedLastName,
          name: existingProfile.data().name || name,
          updatedAt: Timestamp.now(),
        });
      } else {
        await setDoc(doc(db, 'volunteers', gmailUser.uid), {
          firstName: normalizedFirstName,
          lastName: normalizedLastName,
          name,
          email: normalizedEmail,
          phoneNumber: '',
          address: '',
          assignedEvents: [],
          assignedServices: [],
          joinedDate: Timestamp.now(),
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
        });
      }

      alert(isLogin ? 'Gmail login has been saved.' : 'Your Gmail account has been saved.');
      navigate((await isUserAdmin(gmailUser)) ? '/admin' : '/dashboard');
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to continue with Gmail'));
    } finally {
      setLoading(false);
    }
  };

  const isLogin = type === 'login';

  return (
    <div className="auth-container">
      <div className="auth-card">
        <h1>ISKCON TOWACO VOLUNTEER MANAGEMENT</h1>
        {error && <div className="error-message">{error}</div>}

        <form onSubmit={isLogin ? handleLogin : handleCreateVolunteer}>
          {!isLogin && (
            <>
              <div className="form-group">
                <label htmlFor="firstName">First Name</label>
                <input
                  id="firstName"
                  type="text"
                  placeholder="John"
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
                  placeholder="Doe"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  required
                />
              </div>
            </>
          )}

          <div className="form-group">
            <label htmlFor="email">{isLogin ? 'Email or Username' : 'Email'}</label>
            <input
              id="email"
              type="text"
              placeholder={isLogin ? 'Email or admin' : 'you@example.com'}
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
                placeholder="+1 (555) 123-4567"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                required
              />
            </div>
          )}

          <div className="form-group">
            <label htmlFor="password">{isLogin ? 'Password' : 'Create Password'}</label>
            <input
              id="password"
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <button type="submit" disabled={loading} className="submit-btn">
            {loading
              ? 'Loading...'
              : isLogin && email.trim().toLowerCase() === DEFAULT_ADMIN_USERNAME
                ? 'Admin Login'
                : isLogin
                  ? 'Login'
                  : 'Create Account'}
          </button>
        </form>

        <button
          type="button"
          disabled={loading}
          className="gmail-create-btn"
          onClick={handleGmailAuth}
        >
          {isLogin ? 'Login with Gmail' : 'Create Account with Gmail'}
        </button>

        <p className="toggle-link">
          <a href={isLogin ? '/signup' : '/login'}>
            {isLogin ? 'Create account' : 'Already have an account? Log in'}
          </a>
        </p>
      </div>
    </div>
  );
};

export default AuthPage;
