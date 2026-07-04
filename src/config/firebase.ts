import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getFunctions } from 'firebase/functions';

const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY || 'AIzaSyCseolhm08ajtMdrvl5HxWCOErEj-hl9X4',
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN || 'temple-volunteers-8ff23.firebaseapp.com',
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID || 'temple-volunteers-8ff23',
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET || 'temple-volunteers-8ff23.firebasestorage.app',
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID || '298846932775',
  appId: process.env.REACT_APP_FIREBASE_APP_ID || '1:298846932775:web:4af5ac5bb9e2c263c02302',
  measurementId: process.env.REACT_APP_FIREBASE_MEASUREMENT_ID || 'G-3XXH67RBBF',
};

export const useDemoMode =
  new URLSearchParams(window.location.search).get('demo') === 'true';

export const isFirebaseConfigured =
  !useDemoMode &&
  firebaseConfig.apiKey !== 'YOUR_API_KEY' &&
  firebaseConfig.projectId !== 'YOUR_PROJECT_ID' &&
  firebaseConfig.appId !== 'YOUR_APP_ID';

// Initialize Firebase
export const app = initializeApp(firebaseConfig);

// Initialize Auth
export const auth = getAuth(app);

// Initialize Firestore
export const db = getFirestore(app);

// Initialize Functions
export const functions = getFunctions(app, 'us-central1');

export default app;
