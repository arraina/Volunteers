const admin = require('firebase-admin');
const { runReminderSender } = require('./send');

const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!raw) {
  throw new Error('FIREBASE_SERVICE_ACCOUNT env var is required.');
}

admin.initializeApp({ credential: admin.credential.cert(JSON.parse(raw)) });

runReminderSender().catch((error) => {
  console.error('Reminder sender failed:', error);
  process.exitCode = 1;
});
