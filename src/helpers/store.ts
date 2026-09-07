import {
  addDoc,
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import {
  Announcement,
  HourLog,
  NotificationChannel,
  Reminder,
  RecurrenceFrequency,
  TaskStatus,
  TempleEvent,
  VolunteerProfile,
  VolunteerTask,
  normalizeEvent,
  normalizeTask,
  normalizeVolunteer,
  firestoreTimestampToDate,
} from './types';

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

export async function createEvent(input: {
  name: string;
  date?: Date | null;
  description?: string;
  createdBy?: string;
}): Promise<string> {
  const ref = await addDoc(collection(db, 'events'), {
    name: input.name.trim(),
    date: input.date ? Timestamp.fromDate(input.date) : null,
    description: (input.description || '').trim(),
    createdBy: input.createdBy || null,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export function subscribeEvents(cb: (e: TempleEvent[]) => void) {
  const q = query(collection(db, 'events'), orderBy('createdAt', 'desc'));
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => normalizeEvent(d.id, d.data())));
  });
}

export async function getEvents(): Promise<TempleEvent[]> {
  const snap = await getDocs(collection(db, 'events'));
  return snap.docs.map((d) => normalizeEvent(d.id, d.data()));
}

// ---------------------------------------------------------------------------
// Volunteers
// ---------------------------------------------------------------------------

export async function getVolunteers(): Promise<VolunteerProfile[]> {
  const snap = await getDocs(collection(db, 'volunteers'));
  return snap.docs.map((d) => normalizeVolunteer(d.id, d.data()));
}

export function subscribeVolunteers(cb: (v: VolunteerProfile[]) => void) {
  return onSnapshot(collection(db, 'volunteers'), (snap) => {
    cb(snap.docs.map((d) => normalizeVolunteer(d.id, d.data())));
  });
}

export async function getVolunteer(uid: string): Promise<VolunteerProfile | null> {
  const d = await getDoc(doc(db, 'volunteers', uid));
  return d.exists() ? normalizeVolunteer(d.id, d.data()) : null;
}

export interface VolunteerInput {
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber: string;
  skills?: string[];
  availability?: string[];
}

/** Admin-created volunteer (no auth account; id is auto-generated). */
export async function createVolunteer(input: VolunteerInput): Promise<string> {
  const ref = await addDoc(collection(db, 'volunteers'), {
    ...buildVolunteerDoc(input),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    joinedDate: serverTimestamp(),
  });
  return ref.id;
}

/** Self-registered volunteer whose doc id equals their auth uid. */
export async function createVolunteerProfile(uid: string, input: VolunteerInput): Promise<void> {
  await setDoc(doc(db, 'volunteers', uid), {
    ...buildVolunteerDoc(input),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    joinedDate: serverTimestamp(),
  });
}

function buildVolunteerDoc(input: VolunteerInput) {
  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  return {
    firstName,
    lastName,
    name: `${firstName} ${lastName}`.trim(),
    email: input.email.trim().toLowerCase(),
    phoneNumber: input.phoneNumber.trim(),
    skills: input.skills || [],
    availability: input.availability || [],
    notificationPrefs: { whatsapp: true, email: true, push: false },
    pushTokens: [],
    totalHours: 0,
  };
}

export async function updateVolunteer(
  uid: string,
  data: Partial<VolunteerProfile>
): Promise<void> {
  const payload: Record<string, unknown> = { updatedAt: serverTimestamp() };
  if (data.firstName !== undefined) payload.firstName = data.firstName;
  if (data.lastName !== undefined) payload.lastName = data.lastName;
  if (data.phoneNumber !== undefined) payload.phoneNumber = data.phoneNumber;
  if (data.skills !== undefined) payload.skills = data.skills;
  if (data.availability !== undefined) payload.availability = data.availability;
  if (data.notificationPrefs !== undefined) payload.notificationPrefs = data.notificationPrefs;
  if (data.firstName !== undefined || data.lastName !== undefined) {
    payload.name = `${data.firstName ?? ''} ${data.lastName ?? ''}`.trim();
  }
  await setDoc(doc(db, 'volunteers', uid), payload, { merge: true });
}

/**
 * Import volunteers from parsed CSV rows. Expected columns:
 * firstName, lastName, email, phone. Skips rows with a duplicate email.
 * Returns { added, skipped }.
 */
export async function bulkImportVolunteers(
  rows: VolunteerInput[]
): Promise<{ added: number; skipped: number }> {
  const existing = await getVolunteers();
  const existingEmails = new Set(existing.map((v) => v.email.toLowerCase()));
  let added = 0;
  let skipped = 0;
  for (const row of rows) {
    const email = (row.email || '').trim().toLowerCase();
    if (!row.firstName?.trim() || !row.lastName?.trim() || !email || existingEmails.has(email)) {
      skipped += 1;
      continue;
    }
    await createVolunteer(row);
    existingEmails.add(email);
    added += 1;
  }
  return { added, skipped };
}

export async function deleteVolunteer(uid: string): Promise<void> {
  // Remove from any tasks first.
  const tasksSnap = await getDocs(
    query(collection(db, 'tasks'), where('assignedVolunteers', 'array-contains', uid))
  );
  await Promise.all(
    tasksSnap.docs.map((t) =>
      updateDoc(t.ref, { assignedVolunteers: arrayRemove(uid), updatedAt: serverTimestamp() })
    )
  );
  await deleteDoc(doc(db, 'volunteers', uid));
}

export async function registerPushToken(uid: string, token: string): Promise<void> {
  await updateDoc(doc(db, 'volunteers', uid), {
    pushTokens: arrayUnion(token),
    updatedAt: serverTimestamp(),
  });
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

/**
 * Subscribe to tasks within a bounded window so a multi-year recurring series
 * never loads thousands of docs into the dashboards. Defaults: from 7 days ago
 * up to `aheadWeeks` in the future. Volunteers/admin browse the near horizon;
 * far-future occurrences still exist and become visible as the window rolls.
 */
export function subscribeTasks(
  cb: (t: VolunteerTask[]) => void,
  aheadWeeks = 26,
  backWeeks = 4
) {
  const from = Timestamp.fromDate(new Date(Date.now() - backWeeks * 7 * 86400_000));
  const to = Timestamp.fromDate(new Date(Date.now() + aheadWeeks * 7 * 86400_000));
  const q = query(
    collection(db, 'tasks'),
    where('startDateTime', '>=', from),
    where('startDateTime', '<=', to),
    orderBy('startDateTime', 'asc')
  );
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => normalizeTask(d.id, d.data())));
  });
}

export async function getTasks(): Promise<VolunteerTask[]> {
  const snap = await getDocs(query(collection(db, 'tasks'), orderBy('startDateTime', 'asc')));
  return snap.docs.map((d) => normalizeTask(d.id, d.data()));
}

/**
 * Fetch past tasks (started before now), most recent first, for the History
 * view. Bounded by `limitCount` to stay light on reads.
 */
export async function getPastTasks(limitCount = 300): Promise<VolunteerTask[]> {
  const now = Timestamp.fromDate(new Date());
  const snap = await getDocs(
    query(
      collection(db, 'tasks'),
      where('startDateTime', '<', now),
      orderBy('startDateTime', 'desc'),
      limit(limitCount)
    )
  );
  return snap.docs.map((d) => normalizeTask(d.id, d.data()));
}

export interface TaskInput {
  title: string;
  description?: string;
  startDateTime: Date;
  endDateTime?: Date | null;
  location?: string;
  skillsNeeded?: string[];
  volunteersNeeded: number;
  openForSignup: boolean;
  recurrence: RecurrenceFrequency;
  reminderHoursBefore: number[];
  /** How many weeks ahead to generate occurrences for a recurring task. */
  horizonWeeks?: number;
  eventId?: string;
  eventName?: string;
  createdBy?: string;
}

// Safety cap: never generate more than this many occurrence docs in one call.
// The scheduled job tops up the rest over time (see reminder-sender).
export const MAX_OCCURRENCES_PER_CREATE = 750;
export const DEFAULT_HORIZON_WEEKS = 52;

/** Advance a date by one recurrence step. */
export function advanceDate(date: Date, frequency: RecurrenceFrequency): Date | null {
  const next = new Date(date);
  if (frequency === 'daily') next.setDate(next.getDate() + 1);
  else if (frequency === 'weekly') next.setDate(next.getDate() + 7);
  else if (frequency === 'monthly') next.setMonth(next.getMonth() + 1);
  else return null;
  return next;
}

/**
 * Build the base document for one occurrence. Occurrence docs use a
 * deterministic id (`seriesId_<startMillis>`) so top-up runs never duplicate.
 */
function occurrenceDoc(input: TaskInput, seriesId: string, start: Date, index: number) {
  const durationMs = input.endDateTime
    ? input.endDateTime.getTime() - input.startDateTime.getTime()
    : 0;
  return {
    title: input.title.trim(),
    description: (input.description || '').trim(),
    eventId: input.eventId || null,
    eventName: input.eventName || null,
    startDateTime: Timestamp.fromDate(start),
    endDateTime: durationMs ? Timestamp.fromDate(new Date(start.getTime() + durationMs)) : null,
    location: (input.location || '').trim(),
    skillsNeeded: input.skillsNeeded || [],
    volunteersNeeded: input.volunteersNeeded,
    assignedVolunteers: [],
    openForSignup: input.openForSignup,
    status: 'open' as TaskStatus,
    recurrence: input.recurrence,
    seriesId,
    occurrenceIndex: index,
    reminderHoursBefore: input.reminderHoursBefore,
    createdBy: input.createdBy || null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
}

/**
 * Create a task. For a one-off (recurrence 'none') it's a single doc. For a
 * recurring task it generates dated occurrences up to the horizon (capped), each
 * independently assignable. Returns the seriesId (or single task id).
 */
export async function createTask(input: TaskInput): Promise<string> {
  if (input.recurrence === 'none') {
    const ref = await addDoc(collection(db, 'tasks'), {
      ...occurrenceDoc(input, '', input.startDateTime, 0),
      seriesId: null,
    });
    return ref.id;
  }

  // Recurring: seriesId is the id of the first occurrence.
  const seriesId = doc(collection(db, 'tasks')).id;
  const horizonWeeks = Math.max(1, input.horizonWeeks || DEFAULT_HORIZON_WEEKS);
  const horizonEnd = new Date(input.startDateTime.getTime() + horizonWeeks * 7 * 86400_000);

  const dates: Date[] = [];
  let cursor: Date | null = new Date(input.startDateTime);
  while (cursor && cursor <= horizonEnd && dates.length < MAX_OCCURRENCES_PER_CREATE) {
    dates.push(cursor);
    cursor = advanceDate(cursor, input.recurrence);
  }

  // Firestore batches are limited to 500 writes; chunk accordingly.
  for (let i = 0; i < dates.length; i += 450) {
    const batch = writeBatch(db);
    const slice = dates.slice(i, i + 450);
    slice.forEach((start, j) => {
      const index = i + j;
      const id = index === 0 ? seriesId : `${seriesId}_${start.getTime()}`;
      batch.set(doc(db, 'tasks', id), occurrenceDoc(input, seriesId, start, index));
    });
    await batch.commit();
  }

  return seriesId;
}

export async function updateTaskStatus(taskId: string, status: TaskStatus): Promise<void> {
  await updateDoc(doc(db, 'tasks', taskId), { status, updatedAt: serverTimestamp() });
}

export async function deleteTask(taskId: string): Promise<void> {
  await deleteDoc(doc(db, 'tasks', taskId));
}

export type SeriesScope = 'one' | 'future';

/** All occurrences in a series (by seriesId), fetched fresh. */
async function seriesOccurrences(seriesId: string) {
  const snap = await getDocs(query(collection(db, 'tasks'), where('seriesId', '==', seriesId)));
  return snap.docs;
}

/**
 * Delete a recurring occurrence. scope 'one' deletes just this date; 'future'
 * deletes this date and all later occurrences in the series.
 */
export async function deleteTaskScoped(
  task: VolunteerTask,
  scope: SeriesScope
): Promise<void> {
  if (!task.seriesId || scope === 'one') {
    await deleteDoc(doc(db, 'tasks', task.id));
    return;
  }
  const docs = await seriesOccurrences(task.seriesId);
  const cutoff = task.startDateTime.getTime();
  const targets = docs.filter((d) => {
    const start = d.data().startDateTime?.toDate?.()?.getTime?.() ?? 0;
    return start >= cutoff;
  });
  for (let i = 0; i < targets.length; i += 450) {
    const batch = writeBatch(db);
    targets.slice(i, i + 450).forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
}

/** Change status on one occurrence or this-and-future occurrences. */
export async function updateTaskStatusScoped(
  task: VolunteerTask,
  status: TaskStatus,
  scope: SeriesScope
): Promise<void> {
  if (!task.seriesId || scope === 'one') {
    await updateTaskStatus(task.id, status);
    return;
  }
  const docs = await seriesOccurrences(task.seriesId);
  const cutoff = task.startDateTime.getTime();
  const targets = docs.filter((d) => {
    const start = d.data().startDateTime?.toDate?.()?.getTime?.() ?? 0;
    return start >= cutoff;
  });
  for (let i = 0; i < targets.length; i += 450) {
    const batch = writeBatch(db);
    targets.slice(i, i + 450).forEach((d) =>
      batch.update(d.ref, { status, updatedAt: serverTimestamp() })
    );
    await batch.commit();
  }
}

export interface TaskEditableFields {
  title: string;
  description?: string;
  location?: string;
  volunteersNeeded: number;
  skillsNeeded: string[];
  openForSignup: boolean;
  reminderHoursBefore: number[];
}

/** Edit fields on one occurrence or this-and-future occurrences (times unchanged). */
export async function updateTaskDetailsScoped(
  task: VolunteerTask,
  fields: TaskEditableFields,
  scope: SeriesScope
): Promise<void> {
  const payload = {
    title: fields.title.trim(),
    description: (fields.description || '').trim(),
    location: (fields.location || '').trim(),
    volunteersNeeded: fields.volunteersNeeded,
    skillsNeeded: fields.skillsNeeded,
    openForSignup: fields.openForSignup,
    reminderHoursBefore: fields.reminderHoursBefore,
    updatedAt: serverTimestamp(),
  };
  if (!task.seriesId || scope === 'one') {
    await updateDoc(doc(db, 'tasks', task.id), payload);
    return;
  }
  const docs = await seriesOccurrences(task.seriesId);
  const cutoff = task.startDateTime.getTime();
  const targets = docs.filter((d) => {
    const start = d.data().startDateTime?.toDate?.()?.getTime?.() ?? 0;
    return start >= cutoff;
  });
  for (let i = 0; i < targets.length; i += 450) {
    const batch = writeBatch(db);
    targets.slice(i, i + 450).forEach((d) => batch.update(d.ref, payload));
    await batch.commit();
  }
}

export interface TaskSeriesGroup {
  seriesId: string | null;
  title: string;
  recurrence: RecurrenceFrequency;
  occurrences: VolunteerTask[];
}

/** Group tasks into series (single tasks become their own one-item group). */
export function groupTasksBySeries(tasks: VolunteerTask[]): TaskSeriesGroup[] {
  const groups = new Map<string, TaskSeriesGroup>();
  for (const task of tasks) {
    const key = task.recurrence !== 'none' && task.seriesId ? task.seriesId : `single:${task.id}`;
    if (!groups.has(key)) {
      groups.set(key, {
        seriesId: task.seriesId || null,
        title: task.title,
        recurrence: task.recurrence,
        occurrences: [],
      });
    }
    groups.get(key)!.occurrences.push(task);
  }
  const result = Array.from(groups.values());
  result.forEach((g) =>
    g.occurrences.sort((a, b) => a.startDateTime.getTime() - b.startDateTime.getTime())
  );
  // Sort groups by their earliest upcoming occurrence.
  result.sort(
    (a, b) => a.occurrences[0].startDateTime.getTime() - b.occurrences[0].startDateTime.getTime()
  );
  return result;
}

/**
 * Add a volunteer to a task, enforcing capacity in a transaction. Also queues
 * reminders for that volunteer. Used by both admin-assign and self-signup.
 */
export async function assignVolunteerToTask(
  task: VolunteerTask,
  volunteer: VolunteerProfile
): Promise<void> {
  const taskRef = doc(db, 'tasks', task.id);

  await runTransaction(db, async (tx) => {
    const fresh = await tx.get(taskRef);
    if (!fresh.exists()) throw new Error('Task no longer exists.');
    const data = fresh.data();
    const assigned: string[] = Array.isArray(data.assignedVolunteers)
      ? data.assignedVolunteers
      : [];
    if (assigned.includes(volunteer.uid)) return; // already signed up
    if (assigned.length >= (data.volunteersNeeded || 1)) {
      throw new Error('This task is already full.');
    }
    const nextAssigned = [...assigned, volunteer.uid];
    const nextStatus: TaskStatus =
      nextAssigned.length >= (data.volunteersNeeded || 1) ? 'filled' : (data.status as TaskStatus);
    tx.update(taskRef, {
      assignedVolunteers: arrayUnion(volunteer.uid),
      status: nextStatus === 'cancelled' ? 'cancelled' : nextStatus,
      updatedAt: serverTimestamp(),
    });
  });

  await queueRemindersForAssignment(task, volunteer);
}

export async function removeVolunteerFromTask(
  task: VolunteerTask,
  volunteerId: string
): Promise<void> {
  const taskRef = doc(db, 'tasks', task.id);
  await runTransaction(db, async (tx) => {
    const fresh = await tx.get(taskRef);
    if (!fresh.exists()) return;
    const data = fresh.data();
    const assigned: string[] = Array.isArray(data.assignedVolunteers)
      ? data.assignedVolunteers
      : [];
    const nextAssigned = assigned.filter((id) => id !== volunteerId);
    const wasFilled = data.status === 'filled';
    tx.update(taskRef, {
      assignedVolunteers: arrayRemove(volunteerId),
      status: wasFilled && nextAssigned.length < (data.volunteersNeeded || 1) ? 'open' : data.status,
      updatedAt: serverTimestamp(),
    });
  });
}

// ---------------------------------------------------------------------------
// Reminders (write-only from client; consumed by the scheduled sender)
// ---------------------------------------------------------------------------

/**
 * NOTE: Firestore rules make `reminders` server-only, so the client cannot write
 * them directly. Reminders are generated by the GitHub Actions sender, which
 * scans tasks + assignments and computes due reminders. This function is kept
 * as the single definition of "which reminders a given assignment implies" so
 * the sender and any future Cloud Function share the same logic.
 */
export function computeRemindersForAssignment(
  task: VolunteerTask,
  volunteer: VolunteerProfile
): Omit<Reminder, 'id' | 'createdAt' | 'status'>[] {
  const reminders: Omit<Reminder, 'id' | 'createdAt' | 'status'>[] = [];
  const channels: NotificationChannel[] = [];
  if (volunteer.notificationPrefs.whatsapp && volunteer.phoneNumber) channels.push('whatsapp');
  if (volunteer.notificationPrefs.email && volunteer.email) channels.push('email');
  if (volunteer.notificationPrefs.push && (volunteer.pushTokens?.length || 0) > 0)
    channels.push('push');

  const hoursList = task.reminderHoursBefore.length ? task.reminderHoursBefore : [];
  for (const hours of hoursList) {
    const sendAt = new Date(task.startDateTime.getTime() - hours * 3600 * 1000);
    for (const channel of channels) {
      reminders.push({
        taskId: task.id,
        volunteerId: volunteer.uid,
        channel,
        destination:
          channel === 'whatsapp'
            ? volunteer.phoneNumber
            : channel === 'email'
              ? volunteer.email
              : (volunteer.pushTokens || []).join(','),
        message: `Reminder: "${task.title}" on ${task.startDateTime.toLocaleString()}${
          task.location ? ` at ${task.location}` : ''
        }.`,
        templateParams: [
          volunteer.firstName || volunteer.name,
          task.title,
          task.startDateTime.toLocaleString(),
          task.location || 'the temple',
        ],
        sendAt,
      });
    }
  }
  return reminders;
}

/**
 * The client cannot write reminders (server-only). This is a no-op placeholder
 * kept so callers read clearly; the actual queueing is done server-side by the
 * GitHub Actions sender which recomputes from tasks + assignments each run.
 */
async function queueRemindersForAssignment(
  _task: VolunteerTask,
  _volunteer: VolunteerProfile
): Promise<void> {
  // Intentionally empty: reminders are generated server-side. See
  // reminder-sender/ and computeRemindersForAssignment above.
}

// ---------------------------------------------------------------------------
// Announcements
// ---------------------------------------------------------------------------

export async function createAnnouncement(
  input: Omit<Announcement, 'id' | 'createdAt'>
): Promise<string> {
  const ref = await addDoc(collection(db, 'announcements'), {
    ...input,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export function subscribeAnnouncements(cb: (a: Announcement[]) => void) {
  const q = query(collection(db, 'announcements'), orderBy('createdAt', 'desc'));
  return onSnapshot(q, (snap) => {
    cb(
      snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<Announcement, 'id' | 'createdAt'>),
        createdAt: firestoreTimestampToDate(d.data().createdAt),
      }))
    );
  });
}

// ---------------------------------------------------------------------------
// Hour tracking (check-in / check-out)
// ---------------------------------------------------------------------------

export async function checkIn(task: VolunteerTask, volunteer: VolunteerProfile): Promise<string> {
  const ref = await addDoc(collection(db, 'hourLogs'), {
    taskId: task.id,
    volunteerId: volunteer.uid,
    volunteerName: volunteer.name,
    checkIn: serverTimestamp(),
    checkOut: null,
    hours: null,
  });
  return ref.id;
}

export async function checkOut(logId: string, checkInTime: Date): Promise<number> {
  const now = new Date();
  const hours = Math.round(((now.getTime() - checkInTime.getTime()) / 3600000) * 100) / 100;
  const logSnap = await getDoc(doc(db, 'hourLogs', logId));
  await updateDoc(doc(db, 'hourLogs', logId), {
    checkOut: serverTimestamp(),
    hours,
  });
  const volunteerId = logSnap.data()?.volunteerId;
  if (volunteerId) {
    await updateDoc(doc(db, 'volunteers', volunteerId), { totalHours: increment(hours) });
  }
  return hours;
}

export async function getHourLogs(): Promise<HourLog[]> {
  const snap = await getDocs(collection(db, 'hourLogs'));
  return snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      taskId: data.taskId,
      volunteerId: data.volunteerId,
      volunteerName: data.volunteerName,
      checkIn: firestoreTimestampToDate(data.checkIn),
      checkOut: data.checkOut ? firestoreTimestampToDate(data.checkOut) : undefined,
      hours: typeof data.hours === 'number' ? data.hours : undefined,
    };
  });
}

// ---------------------------------------------------------------------------
// Admin bootstrap
// ---------------------------------------------------------------------------

/** True if no admin exists yet (allows first user to claim admin). */
export async function noAdminsYet(): Promise<boolean> {
  const meta = await getDoc(doc(db, 'adminsMeta', 'count'));
  if (!meta.exists()) return true;
  return (meta.data().total || 0) === 0;
}

/** Claim admin for the given uid. Only succeeds while no admin exists (rules-enforced). */
export async function claimFirstAdmin(uid: string, email: string): Promise<void> {
  await setDoc(doc(db, 'admins', uid), {
    isAdmin: true,
    email,
    bootstrap: true,
    createdAt: serverTimestamp(),
  });
  await setDoc(doc(db, 'adminsMeta', 'count'), { total: increment(1) }, { merge: true });
}
