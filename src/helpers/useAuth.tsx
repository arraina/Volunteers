import React, { createContext, useContext, useEffect, useState } from 'react';
import { onIdTokenChanged, User } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../config/firebase';
import { AdminRole } from './types';

interface AuthState {
  user: User | null;
  isAdmin: boolean;
  adminRole: AdminRole | null;
  isOwner: boolean;
  loading: boolean;
}

const AuthContext = createContext<AuthState>({ user: null, isAdmin: false, adminRole: null, isOwner: false, loading: true });

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<AuthState>({ user: null, isAdmin: false, adminRole: null, isOwner: false, loading: true });

  useEffect(() => {
    let unsubscribeRole: (() => void) | undefined;
    const unsubscribeAuth = onIdTokenChanged(auth, (user) => {
      unsubscribeRole?.();
      unsubscribeRole = undefined;
      if (!user) {
        setState({ user: null, isAdmin: false, adminRole: null, isOwner: false, loading: false });
        return;
      }
      if (!user.emailVerified) {
        setState({ user, isAdmin: false, adminRole: null, isOwner: false, loading: false });
        return;
      }
      unsubscribeRole = onSnapshot(doc(db, 'admins', user.uid), (adminDoc) => {
        const data = adminDoc.data();
        const adminRole: AdminRole | null = adminDoc.exists() && data?.isAdmin === true
          ? data.role === 'owner' || data.bootstrap === true ? 'owner' : 'admin'
          : null;
        setState({ user, isAdmin: adminRole !== null, adminRole, isOwner: adminRole === 'owner', loading: false });
      }, () => setState({ user, isAdmin: false, adminRole: null, isOwner: false, loading: false }));
    });
    return () => {
      unsubscribeRole?.();
      unsubscribeAuth();
    };
  }, []);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
};

export function useAuth() {
  return useContext(AuthContext);
}
