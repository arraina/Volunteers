const { randomUUID } = require('crypto');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');

admin.initializeApp();

exports.deleteVolunteerAccount = onCall({ region: 'us-central1' }, async (request) => {
  if (!request.auth || request.auth.token.email_verified !== true) {
    throw new HttpsError('unauthenticated', 'A verified administrator account is required.');
  }
  const db = admin.firestore();
  const caller = await db.doc(`admins/${request.auth.uid}`).get();
  if (!caller.exists || caller.data().isAdmin !== true) {
    throw new HttpsError('permission-denied', 'Administrator access is required.');
  }
  const uid = typeof request.data?.uid === 'string' ? request.data.uid.trim() : '';
  if (!uid || uid === request.auth.uid) throw new HttpsError('invalid-argument', 'Choose another volunteer account.');
  const targetAdmin = await db.doc(`admins/${uid}`).get();
  if (targetAdmin.exists && targetAdmin.data().isAdmin === true) {
    throw new HttpsError('failed-precondition', 'Remove Admin access before deleting this volunteer account.');
  }

  const volunteerRef = db.doc(`volunteers/${uid}`);
  const volunteer = await volunteerRef.get();
  if (!volunteer.exists) throw new HttpsError('not-found', 'Volunteer profile was not found.');
  const anonymousId = `former_${randomUUID()}`;
  const now = admin.firestore.Timestamp.now();
  const tasks = await db.collection('tasks').where('assignedVolunteers', 'array-contains', uid).get();
  const hourLogs = await db.collection('hourLogs').where('volunteerId', '==', uid).get();
  const feedback = await db.collection('eventFeedback').where('volunteerId', '==', uid).get();
  const writes = [];

  tasks.docs.forEach((item) => {
    const data = item.data();
    const assigned = Array.isArray(data.assignedVolunteers) ? data.assignedVolunteers : [];
    const isPast = data.startDateTime?.toMillis?.() < now.toMillis();
    writes.push({ ref: item.ref, data: {
      assignedVolunteers: assigned.map((id) => id === uid ? (isPast ? anonymousId : null) : id).filter(Boolean),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }});
  });
  hourLogs.docs.forEach((item) => writes.push({ ref: item.ref, data: {
    volunteerId: anonymousId,
    volunteerName: 'Former volunteer',
    volunteerEmail: admin.firestore.FieldValue.delete(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }}));
  feedback.docs.forEach((item) => writes.push({ ref: item.ref, data: {
    volunteerId: anonymousId,
    anonymous: true,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }}));
  writes.push({ ref: volunteerRef, delete: true });

  // Delete authentication first. If later data cleanup fails, the operation is
  // safe to retry because a missing Auth user is accepted on the next attempt.
  try {
    await admin.auth().deleteUser(uid);
  } catch (error) {
    if (error.code !== 'auth/user-not-found') throw new HttpsError('internal', 'The login account could not be deleted. No profile data was changed.');
  }
  for (let i = 0; i < writes.length; i += 400) {
    const batch = db.batch();
    writes.slice(i, i + 400).forEach((write) => write.delete ? batch.delete(write.ref) : batch.update(write.ref, write.data));
    await batch.commit();
  }
  return { deleted: true };
});
