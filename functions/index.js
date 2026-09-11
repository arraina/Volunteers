const { randomUUID } = require('crypto');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { onDocumentWrittenWithAuthContext } = require('firebase-functions/v2/firestore');
const admin = require('firebase-admin');

admin.initializeApp();
const db = admin.firestore();

exports.deleteVolunteerAccount = onCall({ region: 'us-central1', maxInstances: 2 }, async (request) => {
  if (!request.auth || request.auth.token.email_verified !== true) {
    throw new HttpsError('unauthenticated', 'A verified administrator account is required.');
  }
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

// Immutable, server-generated activity ledger. Auth context identifies the
// principal that performed each Firestore write, including future UI paths.
const AUDITED_COLLECTIONS = new Set([
  'admins', 'announcements', 'appValueReports', 'eventActionItems',
  'costEntries', 'eventFeedback', 'eventMeetings', 'events', 'eventTemplates', 'hourLogs',
  'reminders', 'sentMessages', 'tasks', 'taskSeries', 'volunteers',
]);

const CATEGORY_BY_COLLECTION = {
  admins: 'Administration', announcements: 'Communications', appValueReports: 'Reporting', costEntries: 'Costs',
  eventActionItems: 'Event planning', eventFeedback: 'Feedback', eventMeetings: 'Event planning',
  events: 'Events', eventTemplates: 'Event planning', hourLogs: 'Service hours',
  reminders: 'Notifications', sentMessages: 'Notifications', tasks: 'Tasks',
  taskSeries: 'Tasks', volunteers: 'Volunteers',
};

const TYPE_BY_COLLECTION = {
  admins: 'administrator', announcements: 'announcement', appValueReports: 'value report', costEntries: 'cost entry',
  eventActionItems: 'action item', eventFeedback: 'feedback', eventMeetings: 'meeting',
  events: 'event', eventTemplates: 'event template', hourLogs: 'hour log',
  reminders: 'reminder', sentMessages: 'message', tasks: 'task',
  taskSeries: 'task series', volunteers: 'volunteer',
};

function changedFields(before, after) {
  const keys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);
  return [...keys].filter((key) => JSON.stringify(before?.[key]) !== JSON.stringify(after?.[key]));
}

function targetLabel(collectionId, documentId, data) {
  if (collectionId === 'volunteers' || collectionId === 'admins') return data.name || data.email || documentId;
  if (collectionId === 'appValueReports') return data.month || documentId;
  if (collectionId === 'sentMessages' || collectionId === 'reminders') return data.channel || TYPE_BY_COLLECTION[collectionId];
  return data.title || data.name || data.eventName || documentId;
}

function describeActivity(collectionId, before, after) {
  const type = TYPE_BY_COLLECTION[collectionId] || collectionId;
  if (!before) return { action: `${type}.created`, verb: 'Created' };
  if (!after) return { action: `${type}.deleted`, verb: 'Permanently deleted' };
  if (before.deleted !== true && after.deleted === true) return { action: `${type}.trashed`, verb: 'Moved to Trash' };
  if (before.deleted === true && after.deleted !== true) return { action: `${type}.restored`, verb: 'Restored' };
  if (collectionId === 'admins' && before.isAdmin === true && after.isAdmin === false) return { action: 'admin.access_removed', verb: 'Removed Admin access from' };
  if (collectionId === 'admins' && before.isAdmin !== true && after.isAdmin === true) return { action: 'admin.access_granted', verb: 'Granted Admin access to' };
  if (collectionId === 'tasks') {
    const oldAssigned = Array.isArray(before.assignedVolunteers) ? before.assignedVolunteers : [];
    const newAssigned = Array.isArray(after.assignedVolunteers) ? after.assignedVolunteers : [];
    if (JSON.stringify(oldAssigned) !== JSON.stringify(newAssigned)) return { action: 'task.assignments_updated', verb: 'Updated volunteer assignments for' };
    if (before.status !== 'cancelled' && after.status === 'cancelled') return { action: 'task.cancelled', verb: 'Cancelled' };
  }
  if (collectionId === 'eventActionItems' && before.status !== after.status) return { action: `action.status_${after.status}`, verb: `Marked action ${after.status}` };
  if (collectionId === 'hourLogs' && !before.checkOut && after.checkOut) return { action: 'hours.checked_out', verb: 'Recorded checkout for' };
  if (collectionId === 'events' && JSON.stringify(before.planningDoc) !== JSON.stringify(after.planningDoc)) return { action: 'event.plan_updated', verb: 'Updated planning document for' };
  if (collectionId === 'sentMessages') return { action: 'notification.status_updated', verb: 'Updated notification delivery for' };
  return { action: `${type}.updated`, verb: 'Updated' };
}

exports.auditApplicationActivity = onDocumentWrittenWithAuthContext(
  { document: '{collectionId}/{documentId}', region: 'us-central1', maxInstances: 2 },
  async (event) => {
    const { collectionId, documentId } = event.params;
    if (!AUDITED_COLLECTIONS.has(collectionId)) return;
    const before = event.data?.before?.exists ? event.data.before.data() : null;
    const after = event.data?.after?.exists ? event.data.after.data() : null;
    if (!before && !after) return;
    const data = after || before;
    const description = describeActivity(collectionId, before, after);
    const actorId = event.authId || data.updatedBy || data.deletedBy || data.createdBy || 'system';
    let email = '';
    let role = event.authType === 'system' ? 'system' : 'volunteer';
    if (actorId && actorId !== 'system') {
      const [userResult, adminResult] = await Promise.allSettled([
        admin.auth().getUser(actorId), db.doc(`admins/${actorId}`).get(),
      ]);
      if (userResult.status === 'fulfilled') email = userResult.value.email || '';
      if (adminResult.status === 'fulfilled' && adminResult.value.exists && adminResult.value.data().isAdmin === true) {
        const adminData = adminResult.value.data();
        role = adminData.role === 'owner' || adminData.bootstrap === true ? 'owner' : 'admin';
      }
    }
    const fields = changedFields(before, after).filter((key) => !['updatedAt', 'createdAt'].includes(key));
    const label = targetLabel(collectionId, documentId, data);
    await db.collection('auditLogs').add({
      event: 'activity', category: CATEGORY_BY_COLLECTION[collectionId] || 'Other',
      action: description.action, summary: `${description.verb} ${TYPE_BY_COLLECTION[collectionId] || collectionId} “${label}”`,
      actorId, email, role, occurredAt: admin.firestore.FieldValue.serverTimestamp(),
      targetType: TYPE_BY_COLLECTION[collectionId] || collectionId, targetId: documentId,
      targetLabel: label, changedFields: fields, source: event.authType || 'unknown',
    });
  }
);
