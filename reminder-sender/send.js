// Scheduled reminder + announcement sender.
// Runs as a Firebase scheduled function. Reads Firestore with Admin credentials,
// computes which task reminders are due, sends them across each volunteer's
// preferred channels, and records what was sent so it never double-sends.

const admin = require('firebase-admin');
const { sendWhatsApp, sendEmail } = require('./channels');

const toDate = (ts) => (ts?.toDate ? ts.toDate() : ts ? new Date(ts) : null);

// A reminder is "due" when now is within a send window after its computed time.
// We look back this far so a task that came due while the job was idle still fires.
// Recover a reminder if the hourly Google Cloud schedule is moderately delayed.
// The remindersSent marker still guarantees each reminder is processed once.
const LOOKBACK_MS = 2 * 60 * 60 * 1000; // 2 hours
const DAILY_WHATSAPP_LIMIT = 100;
const DAILY_WHATSAPP_ALERT_THRESHOLD = 50;
const DAILY_WHATSAPP_ALERT_RECIPIENT = '15184959439';
const DAILY_WHATSAPP_ALERT_TEMPLATE = 'daily_whatsapp_limit_alert';
const MIN_REMINDER_SPACING_HOURS = 24;

function easternDayKey(date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const part = (type) => parts.find((item) => item.type === type)?.value || '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

async function sendDailyLimitAlertIfNeeded(db, count, now, whatsappPaused) {
  if (whatsappPaused || count < DAILY_WHATSAPP_ALERT_THRESHOLD || count >= DAILY_WHATSAPP_LIMIT) {
    return { count, sent: 0, failed: 0 };
  }
  const markerRef = db.collection('notificationAlerts').doc(`whatsapp-daily-limit-${easternDayKey(now)}`);
  if ((await markerRef.get()).exists) return { count, sent: 0, failed: 0 };

  const result = await sendWhatsApp({
    to: DAILY_WHATSAPP_ALERT_RECIPIENT,
    templateName: DAILY_WHATSAPP_ALERT_TEMPLATE,
    templateParams: [String(count), String(DAILY_WHATSAPP_LIMIT)],
  });
  await db.collection('sentMessages').add({
    channel: 'whatsapp',
    notificationType: 'daily_limit_alert',
    volunteerId: 'owner-alert',
    destination: DAILY_WHATSAPP_ALERT_RECIPIENT,
    status: result.ok ? 'accepted' : 'failed',
    providerId: result.id || null,
    failureReason: result.ok ? null : result.error || 'unknown',
    billingCategory: 'utility',
    estimatedCostUsd: result.ok ? 0.0034 : 0,
    ...(result.ok ? { acceptedAt: admin.firestore.FieldValue.serverTimestamp() } : {}),
    sentAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  await markerRef.set({
    attemptedAt: admin.firestore.FieldValue.serverTimestamp(),
    usageAtAlert: count,
    dailyLimit: DAILY_WHATSAPP_LIMIT,
    status: result.ok ? 'accepted' : 'failed',
    providerId: result.id || null,
    failureReason: result.ok ? null : result.error || 'unknown',
  });
  if (!result.ok) {
    console.error(`Daily WhatsApp limit alert failed: ${result.error || 'unknown'}`);
    return { count, sent: 0, failed: 1 };
  }
  console.log(`Daily WhatsApp limit alert sent at ${count}/${DAILY_WHATSAPP_LIMIT}.`);
  return { count: count + 1, sent: 1, failed: 0 };
}

function easternDayStart(date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(date);
  const part = (type) => Number(parts.find((item) => item.type === type)?.value);
  const midnightWallClock = Date.UTC(part('year'), part('month') - 1, part('day'));
  const represented = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(midnightWallClock));
  const representedPart = (type) => Number(represented.find((item) => item.type === type)?.value);
  const representedUtc = Date.UTC(representedPart('year'), representedPart('month') - 1,
    representedPart('day'), representedPart('hour'), representedPart('minute'), representedPart('second'));
  return new Date(midnightWallClock - (representedUtc - midnightWallClock));
}

function limitedReminderHours(values) {
  const sorted = Array.from(new Set((Array.isArray(values) ? values : [24])
    .filter((value) => Number.isFinite(value) && value > 0))).sort((a, b) => b - a);
  const selected = [];
  for (const value of sorted) {
    if (selected.every((existing) => Math.abs(existing - value) >= MIN_REMINDER_SPACING_HOURS)) selected.push(value);
    if (selected.length === 2) break;
  }
  return selected;
}

async function runReminderSender() {
  const db = admin.firestore();
  const now = new Date();
  const emailConfigured = Boolean(process.env.EMAIL_API_KEY && process.env.EMAIL_FROM);
  if (!emailConfigured) {
    console.log('Email reminder channel is disabled because EMAIL_API_KEY and EMAIL_FROM are not configured.');
  }

  const [tasksSnap, volunteersSnap, stoppedSeriesSnap, whatsappSettingsSnap] = await Promise.all([
    db.collection('tasks').get(),
    db.collection('volunteers').get(),
    db.collection('taskSeries').get(),
    db.collection('notificationSettings').doc('whatsapp').get(),
  ]);
  const whatsappPaused = whatsappSettingsSnap.exists && whatsappSettingsSnap.data().paused === true;
  if (whatsappPaused) console.log('WhatsApp sending is globally paused by an Owner.');
  const todayMessagesSnap = await db.collection('sentMessages')
    .where('sentAt', '>=', admin.firestore.Timestamp.fromDate(easternDayStart(now))).get();
  let whatsappSentToday = todayMessagesSnap.docs.filter((item) => {
    const data = item.data();
    return data.channel === 'whatsapp' && !['failed', 'skipped'].includes(data.status);
  }).length;
  console.log(`WhatsApp daily usage: ${whatsappSentToday}/${DAILY_WHATSAPP_LIMIT}.`);
  const stoppedSeries = new Set(stoppedSeriesSnap.docs.map((d) => d.id));

  const volunteers = new Map();
  volunteersSnap.forEach((d) => volunteers.set(d.id, { id: d.id, ...d.data() }));

  let sentCount = 0;
  let failCount = 0;
  let skippedCount = 0;
  const initialAlert = await sendDailyLimitAlertIfNeeded(db, whatsappSentToday, now, whatsappPaused);
  whatsappSentToday = initialAlert.count;
  sentCount += initialAlert.sent;
  failCount += initialAlert.failed;

  for (const taskDoc of tasksSnap.docs) {
    const task = { id: taskDoc.id, ...taskDoc.data() };
    if (task.deleted === true) continue;
    const start = toDate(task.startDateTime);
    if (!start) continue;
    // Cancellation is explicit; completion is derived from the task time.
    if (task.status === 'cancelled') continue;
    const completionTime = toDate(task.endDateTime) || start;
    if (now >= completionTime) continue;

    const reminderHours = limitedReminderHours(task.reminderHoursBefore);
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
        };
        const deliveries = [];

        const params = [
          volunteer.firstName || volunteer.name || 'Volunteer',
          task.title,
          `${start.toLocaleString('en-US', {
            timeZone: 'America/New_York',
            dateStyle: 'medium',
            timeStyle: 'short',
          })} ET`,
          task.location || 'the temple',
        ];
        const plain = `Reminder: "${task.title}" on ${params[2]}${
          task.location ? ` at ${task.location}` : ''
        }.`;

        const whatsappEnabled = !volunteer.whatsappOptOutAt;
        if (whatsappEnabled && volunteer.phoneNumber) {
          const skipReason = whatsappPaused
            ? 'WhatsApp globally paused by Owner'
            : whatsappSentToday >= DAILY_WHATSAPP_LIMIT
              ? `Daily WhatsApp limit of ${DAILY_WHATSAPP_LIMIT} reached`
              : '';
          deliveries.push(skipReason
            ? Promise.resolve({ channel: 'whatsapp', ok: false, skipped: true, skipReason })
            : sendWhatsApp({ to: volunteer.phoneNumber, templateParams: params })
                .then((result) => ({ channel: 'whatsapp', ...result }))
          );
        }
        if (emailConfigured && prefs.email && volunteer.email) {
          deliveries.push(
            sendEmail({
              to: volunteer.email,
              subject: `Reminder: ${task.title}`,
              text: plain,
            }).then((result) => ({ channel: 'email', ...result }))
          );
        }

        // Start every enabled channel together; each provider reports its own result.
        const results = await Promise.all(deliveries);

        // Record sent messages for the admin audit log.
        for (const r of results) {
          const providerAccepted = r.ok && r.channel === 'whatsapp';
          const skipped = r.skipped === true;
          await db.collection('sentMessages').add({
            taskId: task.id,
            volunteerId,
            channel: r.channel,
            status: skipped ? 'skipped' : r.ok ? (providerAccepted ? 'accepted' : 'sent') : 'failed',
            providerId: r.id || null,
            failureReason: r.ok || skipped ? null : r.error || 'unknown',
            skipReason: skipped ? r.skipReason : null,
            // Current direct-Meta North America utility estimate. Storing the
            // applied rate keeps historical monthly totals stable if rates change.
            billingCategory: r.channel === 'whatsapp' ? 'utility' : null,
            estimatedCostUsd: r.ok && r.channel === 'whatsapp' ? 0.0034 : 0,
            ...(providerAccepted ? { acceptedAt: admin.firestore.FieldValue.serverTimestamp() } : {}),
            sentAt: admin.firestore.FieldValue.serverTimestamp(),
          });
          if (r.ok) {
            sentCount += 1;
            if (r.channel === 'whatsapp') {
              whatsappSentToday += 1;
              const alert = await sendDailyLimitAlertIfNeeded(db, whatsappSentToday, now, whatsappPaused);
              whatsappSentToday = alert.count;
              sentCount += alert.sent;
              failCount += alert.failed;
            }
          }
          else if (skipped) skippedCount += 1;
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

  const announcementResults = await sendPendingAnnouncements(db, volunteers, emailConfigured, whatsappPaused, whatsappSentToday);
  sentCount += announcementResults.sent;
  failCount += announcementResults.failed;
  skippedCount += announcementResults.skipped;
  const created = await topUpSeries(db, tasksSnap, now, stoppedSeries);
  const purged = await purgeExpiredTrash(db, tasksSnap, now);

  console.log(
    `Done. Sent ${sentCount}, skipped ${skippedCount}, failed ${failCount}, generated ${created} new occurrence(s), purged ${purged} expired trash item(s).`
  );
  return { sent: sentCount, skipped: skippedCount, failed: failCount, generated: created, purged };
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
async function topUpSeries(db, tasksSnap, now, stoppedSeries) {
  // Find the latest occurrence per series and a template to clone from.
  const latestBySeries = new Map();
  for (const d of tasksSnap.docs) {
    const t = d.data();
    if (t.deleted === true) continue;
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
    if (t.status === 'cancelled' || stoppedSeries.has(seriesId)) continue;
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
          openForSignup: true,
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

async function purgeExpiredTrash(db, tasksSnap, now) {
  const cutoff = now.getTime() - 30 * 86400_000;
  const expired = tasksSnap.docs.filter((item) => {
    const data = item.data();
    const deletedAt = toDate(data.deletedAt);
    return data.deleted === true && deletedAt && deletedAt.getTime() <= cutoff;
  });
  for (let i = 0; i < expired.length; i += 400) {
    const batch = db.batch();
    expired.slice(i, i + 400).forEach((item) => batch.delete(item.ref));
    await batch.commit();
  }
  return expired.length;
}

async function sendPendingAnnouncements(db, volunteers, emailConfigured, whatsappPaused, whatsappSentToday) {
  const snap = await db.collection('announcements').where('delivered', '==', null).get().catch(() => null);
  // Announcements without a `delivered` field are treated as pending.
  const pending = [];
  const counts = { sent: 0, failed: 0, skipped: 0 };
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
      const prefs = v.notificationPrefs || { whatsapp: true, email: true };
      if (channels.includes('whatsapp') && !v.whatsappOptOutAt && v.phoneNumber) {
        const skipReason = whatsappPaused
          ? 'WhatsApp globally paused by Owner'
          : whatsappSentToday >= DAILY_WHATSAPP_LIMIT
            ? `Daily WhatsApp limit of ${DAILY_WHATSAPP_LIMIT} reached`
            : '';
        const result = skipReason
          ? { ok: false, skipped: true, skipReason }
          : await sendWhatsApp({
              to: v.phoneNumber,
              templateParams: [v.firstName || v.name || 'Volunteer', ann.title, ann.body, 'the temple'],
            });
        await db.collection('sentMessages').add({
          announcementId: ann.id, volunteerId: v.id, channel: 'whatsapp',
          status: result.skipped ? 'skipped' : result.ok ? 'accepted' : 'failed',
          providerId: result.id || null, failureReason: result.ok || result.skipped ? null : result.error || 'unknown',
          skipReason: result.skipped ? result.skipReason : null, billingCategory: 'utility',
          estimatedCostUsd: result.ok ? 0.0034 : 0,
          ...(result.ok ? { acceptedAt: admin.firestore.FieldValue.serverTimestamp() } : {}),
          sentAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        if (result.ok) {
          whatsappSentToday += 1;
          counts.sent += 1;
          const alert = await sendDailyLimitAlertIfNeeded(db, whatsappSentToday, new Date(), whatsappPaused);
          whatsappSentToday = alert.count;
          counts.sent += alert.sent;
          counts.failed += alert.failed;
        }
        else if (result.skipped) counts.skipped += 1;
        else counts.failed += 1;
      }
      if (emailConfigured && channels.includes('email') && prefs.email && v.email) {
        await sendEmail({ to: v.email, subject: ann.title, text: ann.body });
      }
    }

    await db.collection('announcements').doc(ann.id).set(
      { delivered: admin.firestore.FieldValue.serverTimestamp() },
      { merge: true }
    );
  }
  return counts;
}

module.exports = { runReminderSender };
