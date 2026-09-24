const { createHash, randomBytes, randomUUID } = require('crypto');
const { onCall, onRequest, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const { onDocumentWrittenWithAuthContext } = require('firebase-functions/v2/firestore');
const admin = require('firebase-admin');

admin.initializeApp();
const db = admin.firestore();
const whatsappWebhookVerifyToken = defineSecret('WHATSAPP_WEBHOOK_VERIFY_TOKEN');
const whatsappAccessToken = defineSecret('WHATSAPP_ACCESS_TOKEN');

const PORTAL_INVITE_TEMPLATE = 'volunteer_portal_invite_v1';
const PORTAL_INVITE_LANGUAGE = 'en';
const WHATSAPP_PHONE_NUMBER_ID = '1279758458557456';
const PORTAL_INVITE_TTL_DAYS = 7;
const PORTAL_URL = 'https://arraina.github.io/Volunteers/claim';

const WHATSAPP_STATUS_RANK = { accepted: 0, sent: 1, delivered: 2, read: 3 };

function normalizePhone(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length < 8 || digits.length > 15 || digits.startsWith('0')) {
    throw new HttpsError('invalid-argument', 'Enter a valid international phone number including country code.');
  }
  return `+${digits}`;
}

function tokenHash(token) {
  return createHash('sha256').update(token).digest('hex');
}

async function requireAdmin(request, ownerOnly = false) {
  if (!request.auth || request.auth.token.email_verified !== true) {
    throw new HttpsError('unauthenticated', 'A verified administrator account is required.');
  }
  const snapshot = await db.doc(`admins/${request.auth.uid}`).get();
  const data = snapshot.data() || {};
  if (!snapshot.exists || data.isAdmin !== true) throw new HttpsError('permission-denied', 'Administrator access is required.');
  if (ownerOnly && data.role !== 'owner' && data.bootstrap !== true) {
    throw new HttpsError('permission-denied', 'Owner access is required.');
  }
}

exports.createOfflineVolunteer = onCall({ region: 'us-central1', maxInstances: 4 }, async (request) => {
  await requireAdmin(request);
  const firstName = String(request.data?.firstName || '').trim();
  const lastName = String(request.data?.lastName || '').trim();
  const email = String(request.data?.email || '').trim().toLowerCase();
  const phoneNumber = normalizePhone(request.data?.phoneNumber);
  if (!firstName || !lastName) throw new HttpsError('invalid-argument', 'First and last name are required.');
  if (email) throw new HttpsError('invalid-argument', 'Use the existing email invitation flow when an email is supplied.');
  const duplicate = await db.collection('volunteers').where('phoneNumber', '==', phoneNumber).limit(1).get();
  if (!duplicate.empty) throw new HttpsError('already-exists', 'A volunteer with this phone number already exists.');
  const ref = db.collection('volunteers').doc();
  await ref.set({
    firstName, lastName, name: `${firstName} ${lastName}`.trim(), email: '', phoneNumber,
    skills: [], availability: [], notificationPrefs: { whatsapp: true, email: false },
    whatsappOptIn: true, whatsappOptInAt: admin.firestore.FieldValue.serverTimestamp(),
    whatsappOptOutAt: null, whatsappOptInSource: 'admin-confirmed', participationStatus: 'active',
    invitationStatus: 'waiting_for_template', portalRegistrationStatus: 'unclaimed',
    invitationSendCount: 0, totalHours: 0, createdBy: request.auth.uid,
    createdAt: admin.firestore.FieldValue.serverTimestamp(), updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    joinedDate: admin.firestore.FieldValue.serverTimestamp(),
  });
  return { volunteerId: ref.id, invitationStatus: 'waiting_for_template' };
});

exports.assertVolunteerPhoneAvailable = onCall({ region: 'us-central1', maxInstances: 4 }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in before checking a volunteer phone number.');
  const phoneNumber = normalizePhone(request.data?.phoneNumber);
  const excludeUid = String(request.data?.excludeUid || '');
  const matches = await db.collection('volunteers').where('phoneNumber', '==', phoneNumber).get();
  const duplicate = matches.docs.find((snapshot) => snapshot.id !== excludeUid && snapshot.data().deleted !== true);
  if (duplicate) {
    throw new HttpsError(
      'already-exists',
      'A volunteer with this phone number already exists. Use the existing profile or ask the Owner to resolve the duplicate.'
    );
  }
  return { available: true, phoneNumber };
});

exports.beginVolunteerSignup = onCall(
  { region: 'us-central1', maxInstances: 2, secrets: [whatsappAccessToken] },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Start signup before checking the phone number.');
    const phoneNumber = normalizePhone(request.data?.phoneNumber);
    const email = String(request.data?.email || '').trim().toLowerCase();
    if (!email || email !== String(request.auth.token.email || '').trim().toLowerCase()) {
      throw new HttpsError('permission-denied', 'Signup email does not match the signed-in account.');
    }

    const matches = await db.collection('volunteers').where('phoneNumber', '==', phoneNumber).get();
    const existing = matches.docs.find((snapshot) => snapshot.id !== request.auth.uid && snapshot.data().deleted !== true);
    if (!existing) return { existingProfile: false };

    const volunteer = existing.data();
    if (volunteer.email) {
      throw new HttpsError('already-exists', 'This phone number is already connected to an activated account. Use login or forgot password.');
    }
    if (volunteer.whatsappOptIn !== true || !volunteer.phoneNumber) {
      throw new HttpsError('failed-precondition', 'This profile cannot receive a secure WhatsApp activation link. Ask the Owner for help.');
    }

    const lastSentAt = volunteer.invitationLastSentAt?.toMillis?.() || 0;
    const recentlySent = Date.now() - lastSentAt < 2 * 60 * 1000;
    if (!recentlySent) {
      const token = randomBytes(32).toString('base64url');
      const hash = tokenHash(token);
      const expiresAt = admin.firestore.Timestamp.fromMillis(Date.now() + PORTAL_INVITE_TTL_DAYS * 86400000);
      const link = `${PORTAL_URL}?invite=${encodeURIComponent(token)}`;
      let providerId;
      try {
        providerId = await sendPortalTemplate(volunteer.phoneNumber, [volunteer.firstName || volunteer.name || 'Volunteer', link]);
      } catch (error) {
        throw new HttpsError('unavailable', `The secure WhatsApp activation link could not be sent. ${String(error.message || error)}`);
      }

      const previousInvites = await db.collection('portalInvites').where('volunteerId', '==', existing.id).get();
      const batch = db.batch();
      previousInvites.docs.forEach((previous) => {
        if (previous.data().status === 'active') {
          batch.update(previous.ref, { status: 'revoked', revokedAt: admin.firestore.FieldValue.serverTimestamp() });
        }
      });
      batch.set(db.doc(`portalInvites/${hash}`), {
        volunteerId: existing.id, tokenHash: hash, status: 'active',
        createdAt: admin.firestore.FieldValue.serverTimestamp(), expiresAt,
        sentBy: request.auth.uid, providerId,
      });
      batch.update(existing.ref, {
        invitationStatus: 'sent', invitationFailureReason: admin.firestore.FieldValue.delete(),
        invitationLastSentAt: admin.firestore.FieldValue.serverTimestamp(), invitationExpiresAt: expiresAt,
        invitationSendCount: admin.firestore.FieldValue.increment(1), updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      batch.set(db.collection('sentMessages').doc(), {
        channel: 'whatsapp', type: 'portal_invitation', volunteerId: existing.id,
        destination: volunteer.phoneNumber, templateName: PORTAL_INVITE_TEMPLATE,
        providerId, status: 'accepted', sentAt: admin.firestore.FieldValue.serverTimestamp(),
        acceptedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      await batch.commit();
    }

    await admin.auth().deleteUser(request.auth.uid).catch(() => undefined);
    return { existingProfile: true, inviteSent: !recentlySent, recentlySent };
  }
);

exports.getVolunteerDirectory = onCall({ region: 'us-central1', maxInstances: 4 }, async (request) => {
  if (!request.auth || request.auth.token.email_verified !== true) {
    throw new HttpsError('unauthenticated', 'A verified portal account is required.');
  }
  const snapshot = await db.collection('volunteers').get();
  return {
    volunteers: snapshot.docs
      .filter((item) => {
        const data = item.data();
        return data.deleted !== true && data.participationStatus !== 'inactive'
          && data.whatsappOptIn === true && Boolean(data.phoneNumber);
      })
      .map((item) => ({ uid: item.id, name: item.data().name || `${item.data().firstName || ''} ${item.data().lastName || ''}`.trim() || 'Volunteer' }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
});

exports.manageVolunteerTaskAssignment = onCall({ region: 'us-central1', maxInstances: 4 }, async (request) => {
  if (!request.auth || request.auth.token.email_verified !== true) {
    throw new HttpsError('unauthenticated', 'A verified portal account is required.');
  }
  const taskId = String(request.data?.taskId || '').trim();
  const volunteerId = String(request.data?.volunteerId || '').trim();
  const action = request.data?.action === 'remove' ? 'remove' : 'add';
  if (!taskId || !volunteerId) throw new HttpsError('invalid-argument', 'Task and volunteer are required.');
  const taskRef = db.doc(`tasks/${taskId}`);
  const volunteerRef = db.doc(`volunteers/${volunteerId}`);
  await db.runTransaction(async (transaction) => {
    const [task, volunteer] = await Promise.all([transaction.get(taskRef), transaction.get(volunteerRef)]);
    if (!task.exists) throw new HttpsError('not-found', 'Task was not found.');
    const taskData = task.data();
    const callerAdmin = await db.doc(`admins/${request.auth.uid}`).get();
    if (taskData.createdBy !== request.auth.uid && callerAdmin.data()?.isAdmin !== true) {
      throw new HttpsError('permission-denied', 'Only the task creator or an administrator can manage assignments.');
    }
    if (!volunteer.exists || volunteer.data().deleted === true || volunteer.data().participationStatus === 'inactive'
      || volunteer.data().whatsappOptIn !== true || !volunteer.data().phoneNumber) {
      throw new HttpsError('failed-precondition', 'This volunteer is not active for task assignments.');
    }
    const assigned = Array.isArray(taskData.assignedVolunteers) ? taskData.assignedVolunteers : [];
    if (action === 'add') {
      if (assigned.includes(volunteerId)) return;
      if (assigned.length >= (taskData.volunteersNeeded || 1)) throw new HttpsError('failed-precondition', 'This task is already full.');
      transaction.update(taskRef, { assignedVolunteers: admin.firestore.FieldValue.arrayUnion(volunteerId), updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    } else {
      transaction.update(taskRef, { assignedVolunteers: admin.firestore.FieldValue.arrayRemove(volunteerId), updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    }
  });
  return { updated: true };
});

exports.setPortalInviteSending = onCall({ region: 'us-central1', maxInstances: 2 }, async (request) => {
  await requireAdmin(request, true);
  const enabled = request.data?.enabled === true;
  await db.doc('notificationSettings/portalInvitations').set({
    enabled, templateName: PORTAL_INVITE_TEMPLATE, language: PORTAL_INVITE_LANGUAGE,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(), updatedBy: request.auth.uid,
  }, { merge: true });
  return { enabled };
});

async function sendPortalTemplate(phoneNumber, params) {
  const response = await fetch(`https://graph.facebook.com/v21.0/${WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${whatsappAccessToken.value()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', to: phoneNumber.replace(/^\+/, ''), type: 'template', template: {
      name: PORTAL_INVITE_TEMPLATE, language: { code: PORTAL_INVITE_LANGUAGE },
      components: [{ type: 'body', parameters: params.map((text) => ({ type: 'text', text })) }],
    }}),
  });
  const body = await response.json();
  if (!response.ok) {
    const message = body?.error?.message || `Meta returned HTTP ${response.status}`;
    const details = body?.error?.error_data?.details;
    throw new Error(details ? `${message}: ${details}` : message);
  }
  return body.messages?.[0]?.id || '';
}

exports.sendPortalInvites = onCall(
  { region: 'us-central1', maxInstances: 1, secrets: [whatsappAccessToken], timeoutSeconds: 120 },
  async (request) => {
    await requireAdmin(request, true);
    const settings = await db.doc('notificationSettings/portalInvitations').get();
    if (settings.data()?.enabled !== true) {
      throw new HttpsError('failed-precondition', `Sending is disabled until ${PORTAL_INVITE_TEMPLATE} is approved and enabled.`);
    }
    const requestedIds = Array.isArray(request.data?.volunteerIds) ? request.data.volunteerIds.slice(0, 50) : [];
    const snapshots = requestedIds.length
      ? await Promise.all(requestedIds.map((id) => db.doc(`volunteers/${String(id)}`).get()))
      : (await db.collection('volunteers').where('invitationStatus', '==', 'waiting_for_template').limit(50).get()).docs;
    const results = [];
    for (const snapshot of snapshots) {
      if (!snapshot.exists) continue;
      const volunteer = snapshot.data();
      if (volunteer.email || volunteer.deleted === true || volunteer.whatsappOptIn !== true || !volunteer.phoneNumber) continue;
      const token = randomBytes(32).toString('base64url');
      const hash = tokenHash(token);
      const expiresAt = admin.firestore.Timestamp.fromMillis(Date.now() + PORTAL_INVITE_TTL_DAYS * 86400000);
      const link = `${PORTAL_URL}?invite=${encodeURIComponent(token)}`;
      try {
        // The approved volunteer_portal_invite_v1 body has two variables: name and secure link.
        const providerId = await sendPortalTemplate(volunteer.phoneNumber, [volunteer.firstName || volunteer.name || 'Volunteer', link]);
        const previousInvites = await db.collection('portalInvites').where('volunteerId', '==', snapshot.id).get();
        const inviteRef = db.doc(`portalInvites/${hash}`);
        const messageRef = db.collection('sentMessages').doc();
        const batch = db.batch();
        previousInvites.docs.forEach((previous) => {
          if (previous.data().status === 'active') {
            batch.update(previous.ref, { status: 'revoked', revokedAt: admin.firestore.FieldValue.serverTimestamp() });
          }
        });
        batch.set(inviteRef, { volunteerId: snapshot.id, tokenHash: hash, status: 'active', createdAt: admin.firestore.FieldValue.serverTimestamp(), expiresAt, sentBy: request.auth.uid, providerId });
        batch.update(snapshot.ref, { invitationStatus: 'sent', invitationFailureReason: admin.firestore.FieldValue.delete(), invitationLastSentAt: admin.firestore.FieldValue.serverTimestamp(), invitationExpiresAt: expiresAt, invitationSendCount: admin.firestore.FieldValue.increment(1), updatedAt: admin.firestore.FieldValue.serverTimestamp() });
        batch.set(messageRef, { channel: 'whatsapp', type: 'portal_invitation', volunteerId: snapshot.id, destination: volunteer.phoneNumber, templateName: PORTAL_INVITE_TEMPLATE, providerId, status: 'accepted', sentAt: admin.firestore.FieldValue.serverTimestamp(), acceptedAt: admin.firestore.FieldValue.serverTimestamp() });
        await batch.commit();
        results.push({ volunteerId: snapshot.id, sent: true });
      } catch (error) {
        await snapshot.ref.update({ invitationStatus: 'failed', invitationFailureReason: String(error.message || error), updatedAt: admin.firestore.FieldValue.serverTimestamp() });
        results.push({ volunteerId: snapshot.id, sent: false, error: String(error.message || error) });
      }
    }
    return { attempted: results.length, sent: results.filter((item) => item.sent).length, failed: results.filter((item) => !item.sent).length };
  }
);

exports.getPortalInvite = onCall({ region: 'us-central1', maxInstances: 4 }, async (request) => {
  const token = String(request.data?.token || '');
  if (token.length < 20) throw new HttpsError('invalid-argument', 'This invitation link is invalid.');
  const invite = await db.doc(`portalInvites/${tokenHash(token)}`).get();
  const data = invite.data();
  if (!invite.exists || data.status !== 'active' || data.expiresAt?.toMillis() <= Date.now()) throw new HttpsError('failed-precondition', 'This invitation link is invalid or expired. Ask the Owner to send a new one.');
  const volunteer = await db.doc(`volunteers/${data.volunteerId}`).get();
  if (!volunteer.exists) throw new HttpsError('not-found', 'Volunteer profile was not found.');
  return { name: volunteer.data().name || volunteer.data().firstName || 'Volunteer', expiresAt: data.expiresAt.toMillis() };
});

exports.claimPortalInvite = onCall({ region: 'us-central1', maxInstances: 2 }, async (request) => {
  const token = String(request.data?.token || '');
  const email = String(request.data?.email || '').trim().toLowerCase();
  const password = String(request.data?.password || '');
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new HttpsError('invalid-argument', 'Enter a valid email address.');
  if (password.length < 6) throw new HttpsError('invalid-argument', 'Password must be at least 6 characters.');
  const inviteRef = db.doc(`portalInvites/${tokenHash(token)}`);
  const invite = await inviteRef.get();
  const data = invite.data();
  if (!invite.exists || data.status !== 'active' || data.expiresAt?.toMillis() <= Date.now()) throw new HttpsError('failed-precondition', 'This invitation link is invalid or expired.');
  const volunteerRef = db.doc(`volunteers/${data.volunteerId}`);
  const volunteer = await volunteerRef.get();
  if (!volunteer.exists || volunteer.data().email) throw new HttpsError('failed-precondition', 'This volunteer profile has already been claimed.');
  try {
    await admin.auth().createUser({ uid: data.volunteerId, email, password, displayName: volunteer.data().name || '' });
  } catch (error) {
    if (error.code === 'auth/email-already-exists') throw new HttpsError('already-exists', 'This email is already used by another account.');
    throw new HttpsError('internal', 'The portal account could not be created.');
  }
  const batch = db.batch();
  batch.update(volunteerRef, { email, 'notificationPrefs.email': true, invitationStatus: 'invited', portalRegistrationStatus: 'email_verification_pending', updatedAt: admin.firestore.FieldValue.serverTimestamp() });
  batch.update(inviteRef, { status: 'used', usedAt: admin.firestore.FieldValue.serverTimestamp(), claimedEmail: email });
  await batch.commit();
  return { volunteerId: data.volunteerId, email };
});

/** Receive Meta's WhatsApp message-status callbacks and update the original record. */
exports.whatsappStatusWebhook = onRequest(
  { region: 'us-central1', maxInstances: 2, secrets: [whatsappWebhookVerifyToken] },
  async (request, response) => {
    if (request.method === 'GET') {
      const verified = request.query['hub.mode'] === 'subscribe'
        && request.query['hub.verify_token'] === whatsappWebhookVerifyToken.value();
      if (verified && request.query['hub.challenge']) response.status(200).send(String(request.query['hub.challenge']));
      else response.sendStatus(403);
      return;
    }
    if (request.method !== 'POST') {
      response.set('Allow', 'GET, POST').sendStatus(405);
      return;
    }
    try {
      const statuses = [];
      for (const entry of request.body?.entry || []) {
        for (const change of entry.changes || []) {
          for (const status of change.value?.statuses || []) statuses.push(status);
        }
      }
      await Promise.all(statuses.map(async (event) => {
        const providerId = typeof event.id === 'string' ? event.id : '';
        const nextStatus = typeof event.status === 'string' ? event.status.toLowerCase() : '';
        if (!providerId || !['sent', 'delivered', 'read', 'failed'].includes(nextStatus)) return;
        const match = await db.collection('sentMessages').where('providerId', '==', providerId).limit(1).get();
        if (match.empty) return;
        const ref = match.docs[0].ref;
        const occurredAt = /^\d+$/.test(String(event.timestamp || ''))
          ? admin.firestore.Timestamp.fromMillis(Number(event.timestamp) * 1000)
          : admin.firestore.Timestamp.now();
        await db.runTransaction(async (transaction) => {
          const snapshot = await transaction.get(ref);
          if (!snapshot.exists || snapshot.data().channel !== 'whatsapp') return;
          const current = snapshot.data().status || 'accepted';
          if (current === 'read' || (current === 'failed' && nextStatus !== 'failed')) return;
          if (nextStatus !== 'failed' && current !== 'failed'
            && (WHATSAPP_STATUS_RANK[nextStatus] || 0) < (WHATSAPP_STATUS_RANK[current] || 0)) return;
          const update = {
            status: nextStatus,
            [`${nextStatus}At`]: occurredAt,
            webhookReceivedAt: admin.firestore.FieldValue.serverTimestamp(),
          };
          if (event.recipient_id) update.recipientId = String(event.recipient_id);
          if (event.conversation?.id) update.conversationId = String(event.conversation.id);
          if (event.pricing?.category) update.billingCategory = String(event.pricing.category);
          if (nextStatus === 'failed') {
            const error = Array.isArray(event.errors) ? event.errors[0] : null;
            update.failureReason = error?.error_data?.details || error?.message || error?.title || 'Meta reported delivery failure';
            if (error?.code !== undefined) update.failureCode = String(error.code);
          }
          transaction.update(ref, update);
        });
      }));
      response.sendStatus(200);
    } catch (error) {
      console.error('WhatsApp status webhook failed', error);
      response.sendStatus(500);
    }
  }
);

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
  'notificationSettings', 'reminders', 'sentMessages', 'tasks', 'taskSeries', 'volunteers',
]);

const CATEGORY_BY_COLLECTION = {
  admins: 'Administration', announcements: 'Communications', appValueReports: 'Reporting', costEntries: 'Costs',
  eventActionItems: 'Event planning', eventFeedback: 'Feedback', eventMeetings: 'Event planning',
  events: 'Events', eventTemplates: 'Event planning', hourLogs: 'Service hours',
  notificationSettings: 'Notifications', reminders: 'Notifications', sentMessages: 'Notifications', tasks: 'Tasks',
  taskSeries: 'Tasks', volunteers: 'Volunteers',
};

const TYPE_BY_COLLECTION = {
  admins: 'administrator', announcements: 'announcement', appValueReports: 'value report', costEntries: 'cost entry',
  eventActionItems: 'action item', eventFeedback: 'feedback', eventMeetings: 'meeting',
  events: 'event', eventTemplates: 'event template', hourLogs: 'hour log',
  notificationSettings: 'notification setting', reminders: 'reminder', sentMessages: 'message', tasks: 'task',
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
  if (collectionId === 'notificationSettings' && before?.paused !== after?.paused) {
    return after.paused
      ? { action: 'whatsapp.paused', verb: 'Paused' }
      : { action: 'whatsapp.resumed', verb: 'Resumed' };
  }
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
