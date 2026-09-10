// Scheduled reminder + announcement sender.
// Runs in GitHub Actions on a cron. Reads Firestore with a service account,
// computes which task reminders are due, sends them across each volunteer's
// preferred channels, and records what was sent so it never double-sends.

import admin from 'firebase-admin';
import { sendWhatsApp, sendEmail, sendPush } from './channels.js';

function initAdmin() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT env var is required.');
  }
  const serviceAccount = JSON.parse(raw);
  admin.initializeApp({ credential: admin.cert(serviceAccount) });
  return admin.firestore();
}

const toDate = (ts) => (ts?.toDate ? ts.toDate() : ts ? new Date(ts) : null);

// A reminder is "due" when now is within a send window after its computed time.
// We look back this far so a task that came due while the job was idle still fires.
const LOOKBACK_MS = 60 * 60 * 1000; // 1 hour

async function main() {
  const db = initAdmin();
  const messaging = admin.messaging();
  const now = new Date();

  const [tasksSnap, volunteersSnap] = await Promise.all([
    db.collection('tasks').get(),
    db.collection('volunteers').get(),
  ]);

  const volunteers = new Map();
  volunteersSnap.forEach((d) => volunteers.set(d.id, { id: d.id, ...d.data() }));

  let sentCount = 0;
  let failCount = 0;

  for (const taskDoc of tasksSnap.docs) {
    const task = { id: taskDoc.id, ...taskDoc.data() };
    const start = toDate(task.startDateTime);
    if (!start) continue;
    // Cancellation is explicit; completion is derived from the task time.
    if (task.status === 'cancelled') continue;
    const completionTime = toDate(task.endDateTime) || start;
    if (now >= completionTime) continue;

    const reminderHours = Array.isArray(task.reminderHoursBefore)
      ? task.reminderHoursBefore
      : [24];
    const assigned = Array.isArray(task.assignedVolunteers) ? task.assignedVolunteers : [];

    for (const hours of reminderHours) {
      const dueAt = new Date(start.getTime() - hours * 3600 * 1000);
      // Fire when we've passed dueAt but not more than LOOKBACK_MS ago, and the
      // task hasn't already started.
      const inWindow = now >= dueAt && now.getTime() - dueAt.getTime() <= LOOKBACK_MS;
      if (!inWindow || now > start) continue;

      for (const volunteerId of assigned) {
        const volunteer = volunteers.get(volunteerId);
        if (!volunteer) continue;

      const reminderVersion = Number(task.reminderVersion) || 0;
      const markerId = `${task.id}_${volunteerId}_${hours}${reminderVersion ? `_v${reminderVersion}` : ''}`;
        const markerRef = db.collection('remindersSent').doc(markerId);
        const marker = await markerRef.get();
        if (marker.exists) continue; // already sent this reminder

        const prefs = volunteer.notificationPrefs || {
          whatsapp: true,
          email: true,
          push: false,
        };
        const deliveries = [];

        const params = [
          volunteer.firstName || volunteer.name || 'Volunteer',
          task.title,
          start.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }),
          task.location || 'the temple',
        ];
        const plain = `Reminder: "${task.title}" on ${params[2]}${
          task.location ? ` at ${task.location}` : ''
        }.`;

        if (prefs.whatsapp && volunteer.whatsappOptIn === true && volunteer.phoneNumber) {
          deliveries.push(
            sendWhatsApp({ to: volunteer.phoneNumber, templateParams: params })
              .then((result) => ({ channel: 'whatsapp', ...result }))
          );
        }
        if (prefs.email && volunteer.email) {
          deliveries.push(
            sendEmail({
              to: volunteer.email,
              subject: `Reminder: ${task.title}`,
              text: plain,
            }).then((result) => ({ channel: 'email', ...result }))
          );
        }
        if (prefs.push && Array.isArray(volunteer.pushTokens) && volunteer.pushTokens.length) {
          deliveries.push(
            sendPush(messaging, {
              tokens: volunteer.pushTokens,
              title: 'Task reminder',
              body: plain,
            }).then((result) => ({ channel: 'push', ...result }))
          );
        }

        // Start every enabled channel together; each provider reports its own result.
        const results = await Promise.all(deliveries);

        // Record sent messages for the admin audit log.
        for (const r of results) {
          await db.collection('sentMessages').add({
            taskId: task.id,
            volunteerId,
            channel: r.channel,
            status: r.ok ? 'sent' : 'failed',
            providerId: r.id || null,
            failureReason: r.ok ? null : r.error || 'unknown',
            sentAt: admin.firestore.FieldValue.serverTimestamp(),
          });
          if (r.ok) sentCount += 1;
          else failCount += 1;
        }

        // Mark this reminder as processed so we don't send it again, even if
        // some channels failed (avoids spamming; failures are visible in log).
        await markerRef.set({
          taskId: task.id,
          volunteerId,
          hours,
          processedAt: admin.firestore.FieldValue.serverTimestamp(),
          channels: results.map((r) => ({ channel: r.channel, ok: r.ok })),
        });
      }
    }
  }

  await sendPendingAnnouncements(db, messaging, volunteers);
  const created = await topUpSeries(db, tasksSnap, now);

  console.log(
    `Done. Sent ${sentCount}, failed ${failCount}, generated ${created} new occurrence(s).`
  );
}

function advance(date, frequency) {
  const next = new Date(date);
  if (frequency === 'daily') next.setDate(next.getDate() + 1);
  else if (frequency === 'weekly') next.setDate(next.getDate() + 7);
  else if (frequency === 'monthly') next.setMonth(next.getMonth() + 1);
  else return null;
  return next;
}

// Keep each recurring series filled out to this many weeks ahead. Tasks created
// with a longer horizon already have their far-future docs; this only extends
// series whose generated horizon (or per-batch cap) fell short — chiefly daily
// tasks that were capped at creation.
const TOPUP_HORIZON_WEEKS = 60;
const MAX_NEW_PER_RUN = 400;

/**
 * For each recurring series, ensure occurrences exist up to the top-up horizon.
 * New occurrences are added with fresh (empty) assignments. Deterministic ids
 * (`seriesId_<startMillis>`) make this idempotent across overlapping runs.
 */
async function topUpSeries(db, tasksSnap, now) {
  // Find the latest occurrence per series and a template to clone from.
  const latestBySeries = new Map();
  for (const d of tasksSnap.docs) {
    const t = d.data();
    if (!t.recurrence || t.recurrence === 'none' || !t.seriesId) continue;
    const start = toDate(t.startDateTime);
    if (!start) continue;
    const cur = latestBySeries.get(t.seriesId);
    if (!cur || start > cur.start) {
      latestBySeries.set(t.seriesId, { start, data: t });
    }
  }

  const horizonEnd = new Date(now.getTime() + TOPUP_HORIZON_WEEKS * 7 * 86400_000);
  let created = 0;

  for (const [seriesId, { start: latestStart, data: t }] of latestBySeries) {
    if (t.status === 'cancelled') continue;
    let cursor = advance(latestStart, t.recurrence);
    const durationMs = t.endDateTime
      ? toDate(t.endDateTime).getTime() - latestStart.getTime()
      : 0;

    while (cursor && cursor <= horizonEnd && created < MAX_NEW_PER_RUN) {
      const id = `${seriesId}_${cursor.getTime()}`;
      const ref = db.collection('tasks').doc(id);
      const exists = await ref.get();
      if (!exists.exists) {
        await ref.set({
          title: t.title,
          description: t.description || '',
          startDateTime: admin.firestore.Timestamp.fromDate(cursor),
          endDateTime: durationMs
            ? admin.firestore.Timestamp.fromDate(new Date(cursor.getTime() + durationMs))
            : null,
          location: t.location || '',
          skillsNeeded: Array.isArray(t.skillsNeeded) ? t.skillsNeeded : [],
          volunteersNeeded: t.volunteersNeeded || 1,
          assignedVolunteers: [],
          openForSignup: t.openForSignup !== false,
          status: 'open',
          recurrence: t.recurrence,
          seriesId,
          reminderHoursBefore: Array.isArray(t.reminderHoursBefore)
            ? t.reminderHoursBefore
            : [24],
          createdBy: t.createdBy || null,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        created += 1;
      }
      cursor = advance(cursor, t.recurrence);
    }
  }
  return created;
}

async function sendPendingAnnouncements(db, messaging, volunteers) {
  const snap = await db.collection('announcements').where('delivered', '==', null).get().catch(() => null);
  // Announcements without a `delivered` field are treated as pending.
  const pending = [];
  const allSnap = await db.collection('announcements').get();
  allSnap.forEach((d) => {
    const data = d.data();
    if (!data.delivered) pending.push({ id: d.id, ...data });
  });

  for (const ann of pending) {
    const channels = Array.isArray(ann.channels) ? ann.channels : [];
    const audienceSkills = Array.isArray(ann.audienceSkills) ? ann.audienceSkills : [];
    const recipients = Array.from(volunteers.values()).filter((v) => {
      if (audienceSkills.length === 0) return true;
      const skills = Array.isArray(v.skills) ? v.skills : [];
      return audienceSkills.some((s) => skills.includes(s));
    });

    for (const v of recipients) {
      const prefs = v.notificationPrefs || { whatsapp: true, email: true, push: false };
      if (
        channels.includes('whatsapp') &&
        prefs.whatsapp &&
        v.whatsappOptIn === true &&
        v.phoneNumber
      ) {
        await sendWhatsApp({
          to: v.phoneNumber,
          templateParams: [v.firstName || v.name || 'Volunteer', ann.title, ann.body, 'the temple'],
        });
      }
      if (channels.includes('email') && prefs.email && v.email) {
        await sendEmail({ to: v.email, subject: ann.title, text: ann.body });
      }
      if (channels.includes('push') && prefs.push && Array.isArray(v.pushTokens) && v.pushTokens.length) {
        await sendPush(messaging, { tokens: v.pushTokens, title: ann.title, body: ann.body });
      }
    }

    await db.collection('announcements').doc(ann.id).set(
      { delivered: admin.firestore.FieldValue.serverTimestamp() },
      { merge: true }
    );
  }
}

main().catch((err) => {
  console.error('Reminder sender failed:', err);
  process.exit(1);
});
