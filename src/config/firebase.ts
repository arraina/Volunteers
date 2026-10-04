import { initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { getFunctions, type Functions } from 'firebase/functions';
import { getStorage, type FirebaseStorage } from 'firebase/storage';
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check';

// All Firebase web config comes from environment variables (see .env.example).
// The Firebase web API key is not a secret, but keeping config in env keeps the
// repo portable across temple deployments and avoids committing project values.
const firebaseProjectId = process.env.REACT_APP_FIREBASE_PROJECT_ID || '';

export const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY || '',
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN || '',
  projectId: firebaseProjectId,
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET || (firebaseProjectId ? `${firebaseProjectId}.firebasestorage.app` : ''),
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID || '',
  appId: process.env.REACT_APP_FIREBASE_APP_ID || '',
  measurementId: process.env.REACT_APP_FIREBASE_MEASUREMENT_ID || '',
};

export const isFirebaseConfigured = Boolean(
  firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId
);

let appInstance: FirebaseApp | undefined;
let authInstance: Auth | undefined;
let dbInstance: Firestore | undefined;
let functionsInstance: Functions | undefined;
let storageInstance: FirebaseStorage | undefined;

if (isFirebaseConfigured) {
  appInstance = initializeApp(firebaseConfig);
  // reCAPTCHA site keys are public identifiers. The environment override keeps
  // deployments portable; this registered production key keeps GitHub Pages
  // protected even when a repository variable has not yet been configured.
  const appCheckSiteKey = process.env.REACT_APP_FIREBASE_APP_CHECK_SITE_KEY
    || '6Lc_nN4tAAAAANTcJSDLinCKTjQYfss9YvqbRIvW';
  if (appCheckSiteKey && typeof window !== 'undefined') {
    initializeAppCheck(appInstance, {
      provider: new ReCaptchaEnterpriseProvider(appCheckSiteKey),
      isTokenAutoRefreshEnabled: true,
    });
  } else if (typeof window !== 'undefined') {
    // Functions enforce App Check in production; make missing deployment config visible.
    console.warn('Firebase App Check site key is missing. Protected server requests will be rejected.');
  }
  authInstance = getAuth(appInstance);
  dbInstance = getFirestore(appInstance);
  functionsInstance = getFunctions(appInstance, 'us-central1');
  storageInstance = getStorage(appInstance);
} else if (typeof window !== 'undefined') {
  // eslint-disable-next-line no-console
  console.warn(
    'Firebase is not configured. Add the REACT_APP_FIREBASE_* repository variables before using auth and data features.'
  );
}

export const app = appInstance as FirebaseApp;
export const auth = authInstance as Auth;
export const db = dbInstance as Firestore;
export const functions = functionsInstance as Functions;
export const storage = storageInstance as FirebaseStorage;

export default app;
