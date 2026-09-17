const { onSchedule } = require('firebase-functions/v2/scheduler');
const { defineSecret } = require('firebase-functions/params');
const admin = require('firebase-admin');
const { runReminderSender } = require('./send');

admin.initializeApp();

const whatsappAccessToken = defineSecret('WHATSAPP_ACCESS_TOKEN');

exports.sendVolunteerReminders = onSchedule(
  {
    schedule: '7 * * * *',
    timeZone: 'UTC',
    region: 'us-central1',
    maxInstances: 1,
    timeoutSeconds: 540,
    secrets: [whatsappAccessToken],
  },
    async () => {
      process.env.WHATSAPP_ACCESS_TOKEN = whatsappAccessToken.value();
      process.env.WHATSAPP_PHONE_NUMBER_ID = '1279758458557456';
      process.env.WHATSAPP_TEMPLATE_NAME = 'task_reminder_hk_v4';
      process.env.WHATSAPP_TEMPLATE_LANG = 'en';
      return runReminderSender();
  }
);
