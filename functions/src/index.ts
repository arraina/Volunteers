import * as admin from 'firebase-admin';
import { logger } from 'firebase-functions';
import * as functions from 'firebase-functions';
import { defineSecret } from 'firebase-functions/params';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import twilio from 'twilio';

admin.initializeApp();

const db = admin.firestore();
const REGION = 'us-central1';
const TWILIO_ACCOUNT_SID = defineSecret('TWILIO_ACCOUNT_SID');
const TWILIO_AUTH_TOKEN = defineSecret('TWILIO_AUTH_TOKEN');
const TWILIO_PHONE_NUMBER = defineSecret('TWILIO_PHONE_NUMBER');

type Reminder = {
  eventId: string;
  volunteerId: string;
  phoneNumber: string;
  message: string;
  reminderTime: admin.firestore.Timestamp;
  status: 'pending' | 'sent' | 'failed';
  retryCount?: number;
};

function getTwilioConfig() {
  const legacyConfig = functions.config().twilio || {};

  return {
    accountSid: process.env.TWILIO_ACCOUNT_SID || TWILIO_ACCOUNT_SID.value() || legacyConfig.account_sid,
    authToken: process.env.TWILIO_AUTH_TOKEN || TWILIO_AUTH_TOKEN.value() || legacyConfig.auth_token,
    phoneNumber: process.env.TWILIO_PHONE_NUMBER || TWILIO_PHONE_NUMBER.value() || legacyConfig.phone_number,
  };
}

async function assertAdmin(uid?: string) {
  if (!uid) {
    throw new HttpsError('unauthenticated', 'User must be authenticated.');
  }

  const adminDoc = await db.collection('admins').doc(uid).get();
  if (!adminDoc.exists || adminDoc.data()?.isAdmin !== true) {
    throw new HttpsError('permission-denied', 'User is not an admin.');
  }
}

export const sendSMSReminders = onSchedule(
  {
    schedule: 'every 1 minutes',
    timeZone: 'America/New_York',
    region: REGION,
    secrets: [TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER],
  },
  async () => {
    const twilioConfig = getTwilioConfig();

    if (!twilioConfig.accountSid || !twilioConfig.authToken || !twilioConfig.phoneNumber) {
      logger.error('Twilio credentials are not configured.');
      return;
    }

    const client = twilio(twilioConfig.accountSid, twilioConfig.authToken);
    const now = admin.firestore.Timestamp.now();

    const snapshot = await db
      .collection('reminders')
      .where('status', '==', 'pending')
      .where('reminderTime', '<=', now)
      .limit(100)
      .get();

    logger.info(`Found ${snapshot.size} pending reminders.`);

    for (const reminderDoc of snapshot.docs) {
      const reminder = reminderDoc.data() as Reminder;
      const reminderId = reminderDoc.id;

      try {
        const sms = await client.messages.create({
          body: reminder.message,
          from: twilioConfig.phoneNumber,
          to: reminder.phoneNumber,
        });

        await db.runTransaction(async (transaction) => {
          transaction.update(reminderDoc.ref, {
            status: 'sent',
            sentAt: admin.firestore.FieldValue.serverTimestamp(),
            twilioSid: sms.sid,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });

          transaction.set(db.collection('sentMessages').doc(), {
            reminderId,
            eventId: reminder.eventId,
            volunteerId: reminder.volunteerId,
            phoneNumber: reminder.phoneNumber,
            message: reminder.message,
            status: 'sent',
            twilioSid: sms.sid,
            sentAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        });

        logger.info('SMS reminder sent.', {
          reminderId,
          eventId: reminder.eventId,
          volunteerId: reminder.volunteerId,
          twilioSid: sms.sid,
        });
      } catch (error) {
        const failureReason = error instanceof Error ? error.message : String(error);

        await db.runTransaction(async (transaction) => {
          transaction.update(reminderDoc.ref, {
            status: 'failed',
            failureReason,
            failedAt: admin.firestore.FieldValue.serverTimestamp(),
            retryCount: (reminder.retryCount || 0) + 1,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });

          transaction.set(db.collection('sentMessages').doc(), {
            reminderId,
            eventId: reminder.eventId,
            volunteerId: reminder.volunteerId,
            phoneNumber: reminder.phoneNumber,
            message: reminder.message,
            status: 'failed',
            failureReason,
            failedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        });

        logger.error('SMS reminder failed.', { reminderId, failureReason });
      }
    }
  }
);

export const createRemindersForEvent = onCall({ region: REGION }, async (request) => {
  await assertAdmin(request.auth?.uid);

  const { eventId, hoursBeforeEvent, message } = request.data || {};
  const hours = Number(hoursBeforeEvent);

  if (!eventId || !Number.isFinite(hours) || hours <= 0 || !message) {
    throw new HttpsError(
      'invalid-argument',
      'eventId, positive hoursBeforeEvent, and message are required.'
    );
  }

  const eventDoc = await db.collection('serviceEvents').doc(eventId).get();
  if (!eventDoc.exists) {
    throw new HttpsError('not-found', 'Event not found.');
  }

  const event = eventDoc.data() || {};
  const eventDateTime = event.eventDateTime as admin.firestore.Timestamp | undefined;
  const assignedVolunteers = Array.isArray(event.assignedVolunteers)
    ? event.assignedVolunteers
    : [];

  if (!eventDateTime) {
    throw new HttpsError('failed-precondition', 'Event is missing eventDateTime.');
  }

  const reminderTime = admin.firestore.Timestamp.fromMillis(
    eventDateTime.toMillis() - hours * 60 * 60 * 1000
  );
  const batch = db.batch();
  let remindersCreated = 0;

  batch.set(db.collection('reminderRules').doc(), {
    eventId,
    hoursBeforeEvent: hours,
    message,
    createdBy: request.auth?.uid,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  for (const volunteerId of assignedVolunteers) {
    const volunteerDoc = await db.collection('volunteers').doc(volunteerId).get();
    const volunteer = volunteerDoc.data();

    if (!volunteer?.phoneNumber) {
      continue;
    }

    batch.set(db.collection('reminders').doc(), {
      eventId,
      volunteerId,
      phoneNumber: volunteer.phoneNumber,
      message,
      reminderTime,
      status: 'pending',
      hoursBeforeEvent: hours,
      createdBy: request.auth?.uid,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    remindersCreated += 1;
  }

  await batch.commit();

  return { success: true, remindersCreated };
});

export const createVolunteer = onCall({ region: REGION }, async (request) => {
  await assertAdmin(request.auth?.uid);

  const { email, password, name, phoneNumber, address } = request.data || {};
  if (!email || !password || !name || !phoneNumber) {
    throw new HttpsError('invalid-argument', 'email, password, name, and phoneNumber are required.');
  }

  const userRecord = await admin.auth().createUser({
    email,
    password,
    displayName: name,
  });

  await db.collection('volunteers').doc(userRecord.uid).set({
    name,
    email,
    phoneNumber,
    address: address || '',
    joinedDate: admin.firestore.FieldValue.serverTimestamp(),
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  return { success: true, uid: userRecord.uid };
});

export const deleteServiceEvent = onCall({ region: REGION }, async (request) => {
  await assertAdmin(request.auth?.uid);

  const { eventId } = request.data || {};
  if (!eventId) {
    throw new HttpsError('invalid-argument', 'eventId is required.');
  }

  const eventRef = db.collection('serviceEvents').doc(eventId);
  const eventDoc = await eventRef.get();
  if (!eventDoc.exists) {
    throw new HttpsError('not-found', 'Event not found.');
  }

  const batch = db.batch();
  batch.delete(eventRef);

  const remindersSnapshot = await db
    .collection('reminders')
    .where('eventId', '==', eventId)
    .get();
  remindersSnapshot.docs.forEach((doc) => batch.delete(doc.ref));

  const rulesSnapshot = await db
    .collection('reminderRules')
    .where('eventId', '==', eventId)
    .get();
  rulesSnapshot.docs.forEach((doc) => batch.delete(doc.ref));

  await batch.commit();

  return {
    success: true,
    deletedReminders: remindersSnapshot.size,
    deletedReminderRules: rulesSnapshot.size,
  };
});

export const deleteVolunteer = onCall({ region: REGION }, async (request) => {
  await assertAdmin(request.auth?.uid);

  const { volunteerId } = request.data || {};
  if (!volunteerId) {
    throw new HttpsError('invalid-argument', 'volunteerId is required.');
  }

  if (volunteerId === request.auth?.uid) {
    throw new HttpsError('failed-precondition', 'Admins cannot delete their own account here.');
  }

  const volunteerRef = db.collection('volunteers').doc(volunteerId);
  const batch = db.batch();
  batch.delete(volunteerRef);

  const eventsSnapshot = await db
    .collection('serviceEvents')
    .where('assignedVolunteers', 'array-contains', volunteerId)
    .get();
  eventsSnapshot.docs.forEach((eventDoc) => {
    batch.update(eventDoc.ref, {
      assignedVolunteers: admin.firestore.FieldValue.arrayRemove(volunteerId),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  });

  const remindersSnapshot = await db
    .collection('reminders')
    .where('volunteerId', '==', volunteerId)
    .get();
  remindersSnapshot.docs.forEach((doc) => batch.delete(doc.ref));

  await batch.commit();

  try {
    await admin.auth().deleteUser(volunteerId);
  } catch (error) {
    const failureReason = error instanceof Error ? error.message : String(error);
    logger.warn('Volunteer Firestore data was deleted, but Auth user deletion failed.', {
      volunteerId,
      failureReason,
    });
    return {
      success: true,
      authDeleted: false,
      authDeletionError: failureReason,
      updatedEvents: eventsSnapshot.size,
      deletedReminders: remindersSnapshot.size,
    };
  }

  return {
    success: true,
    authDeleted: true,
    updatedEvents: eventsSnapshot.size,
    deletedReminders: remindersSnapshot.size,
  };
});
