/* Firebase Cloud Messaging service worker for web push.
 * Uses the compat SDK loaded from Google's CDN. This file is served at the site
 * root so the browser can register it as a service worker.
 *
 * NOTE: config values here are the PUBLIC Firebase web config (safe to expose).
 * They must be filled in to match your project. Because service workers cannot
 * read the app's env vars at runtime, populate these before deploying, or use a
 * build step to inject them. Placeholders are read from self.FCM_CONFIG if you
 * choose to generate that separately.
 */
importScripts('https://www.gstatic.com/firebasejs/10.13.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.13.1/firebase-messaging-compat.js');

// These are the public Firebase web config values. Replace with your project's
// values (same ones used in the app's REACT_APP_FIREBASE_* variables).
firebase.initializeApp({
  apiKey: 'REPLACE_API_KEY',
  authDomain: 'REPLACE_AUTH_DOMAIN',
  projectId: 'REPLACE_PROJECT_ID',
  messagingSenderId: 'REPLACE_MESSAGING_SENDER_ID',
  appId: 'REPLACE_APP_ID',
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const title = (payload.notification && payload.notification.title) || 'Temple Volunteers';
  const body = (payload.notification && payload.notification.body) || '';
  self.registration.showNotification(title, { body });
});
