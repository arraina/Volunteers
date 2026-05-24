import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { auth, db, isFirebaseConfigured } from '../config/firebase';
import { doc, setDoc, Timestamp } from 'firebase/firestore';
import { isUserAdmin } from '../helpers/types';
import { ensureDemoVolunteer, setDemoSession } from '../helpers/demoStore';
import './Auth.css';

interface AuthProps {
  type: 'login' | 'signup';
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export const AuthPage: React.FC<AuthProps> = ({ type }) => {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (!isFirebaseConfigured) {
        const session = setDemoSession(email, name);
        ensureDemoVolunteer(session, phoneNumber);
        navigate('/dashboard');
        return;
      }

      // Create user in Firebase Auth
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // Create volunteer profile in Firestore
      await setDoc(doc(db, 'volunteers', user.uid), {
        name,
        email,
        phoneNumber,
        address: '',
        joinedDate: Timestamp.now(),
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });

      navigate('/dashboard');
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to sign up'));
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (!isFirebaseConfigured) {
        const session = setDemoSession(email);
        ensureDemoVolunteer(session);
        navigate(session.isAdmin ? '/admin' : '/dashboard');
        return;
      }

      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // Check if admin
      const isAdmin = await isUserAdmin(user);

      if (isAdmin) {
        navigate('/admin');
      } else {
        navigate('/dashboard');
      }
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to log in'));
    } finally {
      setLoading(false);
    }
  };

  const pageTitle = type === 'login' ? 'Login' : 'Sign Up';
  const handleSubmit = type === 'login' ? handleLogin : handleSignUp;
  const toggleLink = type === 'login' ? '/signup' : '/login';
  const toggleText = type === 'login' ? "Don't have an account? Sign up" : 'Already have an account? Log in';

  return (
    <div className="auth-container">
      <div className="auth-card">
        <h1>{pageTitle}</h1>
        
        {error && <div className="error-message">{error}</div>}

        <form onSubmit={handleSubmit}>
          {type === 'signup' && (
            <>
              <div className="form-group">
                <label htmlFor="name">Full Name</label>
                <input
                  id="name"
                  type="text"
                  placeholder="John Doe"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>

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

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <button type="submit" disabled={loading} className="submit-btn">
            {loading ? 'Loading...' : pageTitle}
          </button>
        </form>

        <p className="toggle-link">
          <a href={toggleLink}>{toggleText}</a>
        </p>
      </div>
    </div>
  );
};

export default AuthPage;
