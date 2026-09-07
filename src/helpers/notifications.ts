import { getToken, isSupported, onMessage } from 'firebase/messaging';
import { getMessaging, Messaging } from 'firebase/messaging';
import { app } from '../config/firebase';
import { registerPushToken } from './store';

const VAPID_KEY = process.env.REACT_APP_FIREBASE_VAPID_KEY || '';

let messaging: Messaging | null = null;

async function getMessagingInstance(): Promise<Messaging> {
  if (!(await isSupported())) {
    throw new Error('Web push is not supported in this browser.');
  }
  if (!messaging) {
    messaging = getMessaging(app);
  }
  return messaging;
}

/**
 * Enable Firebase Cloud Messaging web push for the current device and store the
 * token on the volunteer's profile so the reminder sender can target it.
 *
 * Web push (via FCM) is completely free. Requires a Web Push VAPID key from
 * Firebase Console > Project Settings > Cloud Messaging.
 */
export async function enableWebPush(uid: string): Promise<string> {
  if (!VAPID_KEY) {
    throw new Error(
      'Web push is not configured. Set REACT_APP_FIREBASE_VAPID_KEY in your environment.'
    );
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error('Notification permission was not granted.');
  }

  const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
  const instance = await getMessagingInstance();
  const token = await getToken(instance, {
    vapidKey: VAPID_KEY,
    serviceWorkerRegistration: registration,
  });

  if (!token) {
    throw new Error('Could not obtain a push token.');
  }

  await registerPushToken(uid, token);
  return token;
}

/** Subscribe to foreground push messages (optional; shows a toast/alert). */
export async function listenForForegroundMessages(handler: (title: string, body: string) => void) {
  try {
    const instance = await getMessagingInstance();
    onMessage(instance, (payload) => {
      handler(
        payload.notification?.title || 'ISKCON Towaco Volunteer Management System',
        payload.notification?.body || ''
      );
    });
  } catch {
    // Push not supported; ignore.
  }
}
