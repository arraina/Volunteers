import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import * as twilio from 'twilio';

// Initialize Firebase Admin SDK
admin.initializeApp();

const db = admin.firestore();

// Twilio SMS Sender Function - Scheduled to run every minute
export const sendSMSReminders = functions.pubsub
  .schedule('every 1 minutes')
  .timeZone('America/New_York') // Adjust to your timezone
  .onRun(async (context) => {
    try {
      functions.logger.info('Starting SMS reminder check...', {structuredData: true});
      
      // Get Twilio credentials from environment
      const twilioAccountSid = process.env.TWILIO_ACCOUNT_SID;
      const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN;
      const twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER;
      
      if (!twilioAccountSid || !twilioAuthToken || !twilioPhoneNumber) {
        functions.logger.error('Twilio credentials not configured');
        return;
      }
      
      // Initialize Twilio client
      const twilioClient = twilio(twilioAccountSid, twilioAuthToken);
      
      // Query all pending reminders that are ready to send
      const now = admin.firestore.Timestamp.now();
      const pendingRemindersSnapshot = await db
        .collection('reminders')
        .where('status', '==', 'pending')
        .where('reminderTime', '<=', now)
        .limit(100) // Batch limit to avoid timeout
        .get();
      
      functions.logger.info(`Found ${pendingRemindersSnapshot.size} reminders to send`);
      
      if (pendingRemindersSnapshot.empty) {
        functions.logger.info('No pending reminders to send');
        return;
      }
      
      // Process each reminder
      const batch = db.batch();
      const sentMessagesRef = db.collection('sentMessages');
      
      for (const reminderDoc of pendingRemindersSnapshot.docs) {
        const reminder = reminderDoc.data() as any;
        const reminderId = reminderDoc.id;
        
        try {
          // Send SMS via Twilio
          const message = await twilioClient.messages.create({
            body: reminder.message,
            from: twilioPhoneNumber,
            to: reminder.phoneNumber,
          });
          
          functions.logger.info(`SMS sent successfully: ${message.sid}`, {
            reminderId,
            volunteerId: reminder.volunteerId,
            eventId: reminder.eventId,
          });
          
          // Update reminder status to "sent"
          batch.update(reminderDoc.ref, {
            status: 'sent',
            sentAt: admin.firestore.FieldValue.serverTimestamp(),
            twilioSid: message.sid,
          });
          
          // Log in sentMessages collection
          const sentMessageRef = sentMessagesRef.doc();
          batch.set(sentMessageRef, {
            reminderId,
            volunteerId: reminder.volunteerId,
            eventId: reminder.eventId,
            phoneNumber: reminder.phoneNumber,
            message: reminder.message,
            twilioSid: message.sid,
            status: 'success',
            sentAt: admin.firestore.FieldValue.serverTimestamp(),
          });
          
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          functions.logger.error(`Failed to send SMS for reminder ${reminderId}: ${errorMessage}`);
          
          // Update reminder status to "failed"
          batch.update(reminderDoc.ref, {
            status: 'failed',
            failureReason: errorMessage,
            failedAt: admin.firestore.FieldValue.serverTimestamp(),
            retryCount: (reminder.retryCount || 0) + 1,
          });
          
          // Log in sentMessages collection
          const failedMessageRef = sentMessagesRef.doc();
          batch.set(failedMessageRef, {
            reminderId,
            volunteerId: reminder.volunteerId,
            eventId: reminder.eventId,
            phoneNumber: reminder.phoneNumber,
            message: reminder.message,
            status: 'failed',
            failureReason: errorMessage,
            failedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        }
      }
      
      // Commit all changes
      await batch.commit();
      functions.logger.info('Batch committed successfully');
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      functions.logger.error(`Error in sendSMSReminders: ${errorMessage}`);
      throw error;
    }
  });

// HTTP function to manually create reminders for an event
export const createRemindersForEvent = functions.https.onCall(
  async (data: any, context: functions.https.CallableContext) => {
    // Verify user is authenticated
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }
    
    // Verify user is admin
    const userDoc = await db.collection('admins').doc(context.auth.uid).get();
    if (!userDoc.exists || !userDoc.data()?.isAdmin) {
      throw new functions.https.HttpsError('permission-denied', 'User is not an admin');
    }
    
    const { eventId, hoursBeforeEvent, message } = data;
    
    if (!eventId || hoursBeforeEvent === undefined || !message) {
      throw new functions.https.HttpsError('invalid-argument', 'Missing required fields');
    }
    
    try {
      // Get event details
      const eventDoc = await db.collection('serviceEvents').doc(eventId).get();
      if (!eventDoc.exists) {
        throw new functions.https.HttpsError('not-found', 'Event not found');
      }
      
      const event = eventDoc.data() as any;
      const eventTime = event.eventDateTime as admin.firestore.Timestamp;
      
      // Calculate reminder time
      const reminderTime = new admin.firestore.Timestamp(
        eventTime.seconds - (hoursBeforeEvent * 3600),
        eventTime.nanoseconds
      );
      
      // Get all assigned volunteers
      const assignedVolunteers = event.assignedVolunteers || [];
      const remindersCreated: string[] = [];
      
      // Create a reminder for each assigned volunteer
      for (const volunteerId of assignedVolunteers) {
        const volunteerDoc = await db.collection('volunteers').doc(volunteerId).get();
        if (!volunteerDoc.exists) continue;
        
        const volunteer = volunteerDoc.data() as any;
        if (!volunteer.phoneNumber) continue;
        
        const reminderRef = await db.collection('reminders').add({
          eventId,
          volunteerId,
          phoneNumber: volunteer.phoneNumber,
          message,
          reminderTime,
          status: 'pending',
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          hoursBeforeEvent,
        });
        
        remindersCreated.push(reminderRef.id);
      }
      
      return {
        success: true,
        remindersCreated: remindersCreated.length,
        reminders: remindersCreated,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new functions.https.HttpsError('internal', `Failed to create reminders: ${errorMessage}`);
    }
  }
);

// HTTP function to trigger reminder check manually (for testing)
export const triggerReminderCheck = functions.https.onCall(
  async (data: any, context: functions.https.CallableContext) => {
    // Verify user is authenticated
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }
    
    // Verify user is admin
    const userDoc = await db.collection('admins').doc(context.auth.uid).get();
    if (!userDoc.exists || !userDoc.data()?.isAdmin) {
      throw new functions.https.HttpsError('permission-denied', 'User is not an admin');
    }
    
    try {
      // This just logs that it was called - the actual work is done by sendSMSReminders
      functions.logger.info('Manual reminder check triggered by admin: ' + context.auth.uid);
      return { success: true, message: 'Reminder check triggered' };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new functions.https.HttpsError('internal', `Error: ${errorMessage}`);
    }
  }
);
