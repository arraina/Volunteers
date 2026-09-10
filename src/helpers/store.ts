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
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../config/firebase';
import { normalizePhoneNumber } from './phone';
import {
  Announcement,
  EventFeedbackRecord,
  HourLog,
  NotificationChannel,
  Reminder,
  RecurrenceFrequency,
  SentMessage,
  TaskStatus,
  TempleEvent,
  VolunteerProfile,
  VolunteerTask,
  effectiveTaskStatus,
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
    cb(snap.docs.filter((d) => d.data().deleted !== true).map((d) => normalizeEvent(d.id, d.data())));
  });
}

export async function getEvents(): Promise<TempleEvent[]> {
  const snap = await getDocs(collection(db, 'events'));
  return snap.docs.filter((d) => d.data().deleted !== true).map((d) => normalizeEvent(d.id, d.data()));
}

// ---------------------------------------------------------------------------
// Volunteers
// ---------------------------------------------------------------------------

export async function getVolunteers(): Promise<VolunteerProfile[]> {
  const snap = await getDocs(collection(db, 'volunteers'));
  return snap.docs.filter((d) => d.data().deleted !== true).map((d) => normalizeVolunteer(d.id, d.data()));
}

export function subscribeVolunteers(cb: (v: VolunteerProfile[]) => void) {
  return onSnapshot(collection(db, 'volunteers'), (snap) => {
    cb(snap.docs.filter((d) => d.data().deleted !== true).map((d) => normalizeVolunteer(d.id, d.data())));
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
  whatsappOptIn?: boolean;
  skills?: string[];
  availability?: string[];
}

/** Admin-created volunteer (no auth account; id is auto-generated). */
export async function createVolunteer(input: VolunteerInput): Promise<string> {
  const phoneNumber = normalizePhoneNumber(input.phoneNumber, true);
  const ref = await addDoc(collection(db, 'volunteers'), {
    ...buildVolunteerDoc({ ...input, phoneNumber }),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    joinedDate: serverTimestamp(),
  });
  return ref.id;
}

/** Self-registered volunteer whose doc id equals their auth uid. */
export async function createVolunteerProfile(uid: string, input: VolunteerInput): Promise<void> {
  const whatsappOptIn = input.whatsappOptIn !== false;
  await setDoc(doc(db, 'volunteers', uid), {
    ...buildVolunteerDoc({ ...input, whatsappOptIn }),
    whatsappOptIn,
    whatsappOptInAt: whatsappOptIn ? serverTimestamp() : null,
    whatsappOptOutAt: null,
    whatsappOptInSource: whatsappOptIn ? 'self' : null,
    participationStatus: whatsappOptIn && Boolean(input.phoneNumber) ? 'active' : 'inactive',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    joinedDate: serverTimestamp(),
  });
}

/** Admin-created profile linked to a Firebase Authentication invitation. */
export async function createInvitedVolunteerProfile(
  uid: string,
  input: VolunteerInput,
  whatsappOptIn: boolean
): Promise<void> {
  const phoneNumber = normalizePhoneNumber(input.phoneNumber, true);
  await setDoc(doc(db, 'volunteers', uid), {
    ...buildVolunteerDoc({ ...input, phoneNumber }),
    notificationPrefs: { whatsapp: whatsappOptIn, email: true, push: false },
    whatsappOptIn,
    whatsappOptInAt: whatsappOptIn ? serverTimestamp() : null,
    whatsappOptOutAt: whatsappOptIn ? null : serverTimestamp(),
    whatsappOptInSource: whatsappOptIn ? 'admin-confirmed' : null,
    invitationStatus: 'invited',
    participationStatus: 'active',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    joinedDate: serverTimestamp(),
  });
}

export async function recordInvitationSent(uid: string): Promise<void> {
  await setDoc(
    doc(db, 'volunteers', uid),
    {
      invitationLastSentAt: serverTimestamp(),
      invitationSendCount: increment(1),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

function buildVolunteerDoc(input: VolunteerInput) {
  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  return {
    firstName,
    lastName,
    name: `${firstName} ${lastName}`.trim(),
    email: input.email.trim().toLowerCase(),
    phoneNumber: normalizePhoneNumber(input.phoneNumber),
    skills: input.skills || [],
    availability: input.availability || [],
    notificationPrefs: { whatsapp: input.whatsappOptIn !== false, email: true, push: false },
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
  if (data.email !== undefined) payload.email = data.email.trim().toLowerCase();
  if (data.phoneNumber !== undefined) {
    payload.phoneNumber = normalizePhoneNumber(data.phoneNumber);
  }
  if (data.skills !== undefined) payload.skills = data.skills;
  if (data.availability !== undefined) payload.availability = data.availability;
  if (data.notificationPrefs !== undefined) {
    payload.notificationPrefs = data.notificationPrefs;
    payload.whatsappOptIn = data.notificationPrefs.whatsapp;
    payload.whatsappOptInAt = data.notificationPrefs.whatsapp ? serverTimestamp() : null;
    payload.whatsappOptOutAt = data.notificationPrefs.whatsapp ? null : serverTimestamp();
    payload.whatsappOptInSource = data.notificationPrefs.whatsapp ? 'self' : null;
    payload.participationStatus = data.notificationPrefs.whatsapp ? 'active' : 'inactive';
  }
  if (data.invitationStatus !== undefined) payload.invitationStatus = data.invitationStatus;
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
    if (
      !row.firstName?.trim() ||
      !row.lastName?.trim() ||
      !email ||
      !row.phoneNumber?.trim() ||
      existingEmails.has(email)
    ) {
      skipped += 1;
      continue;
    }
    try {
      await createVolunteer(row);
      existingEmails.add(email);
      added += 1;
    } catch {
      skipped += 1;
    }
  }
  return { added, skipped };
}

export async function deleteVolunteerProfile(uid: string): Promise<void> {
  // Used only to roll back a failed invitation before it becomes user data.
  await deleteDoc(doc(db, 'volunteers', uid));
}

export type TrashCollection =
  | 'volunteers' | 'events' | 'eventMeetings' | 'eventTemplates'
  | 'eventFeedback' | 'hourLogs' | 'announcements' | 'admins';

export interface TrashRecord {
  id: string;
  collection: TrashCollection;
  label: string;
  deletedAt?: Date;
  deletedBy?: string;
}

const trashCollections: TrashCollection[] = [
  'volunteers', 'events', 'eventMeetings', 'eventTemplates',
  'eventFeedback', 'hourLogs', 'announcements', 'admins',
];

function trashLabel(collectionName: TrashCollection, id: string, data: Record<string, any>) {
  if (collectionName === 'volunteers') return data.name || data.email || id;
  if (collectionName === 'admins') return data.email || id;
  if (collectionName === 'eventFeedback') return `Feedback for ${data.eventName || data.eventId || 'event'}`;
  if (collectionName === 'hourLogs') return `${data.volunteerName || 'Volunteer'} hours`;
  return data.title || data.name || id;
}

/** Subscribe to every non-task object moved to Trash. */
export function subscribeDeletedRecords(cb: (records: TrashRecord[]) => void) {
  const byCollection = new Map<TrashCollection, TrashRecord[]>();
  const publish = () => cb(Array.from(byCollection.values()).flat().sort((a, b) =>
    (b.deletedAt?.getTime() || 0) - (a.deletedAt?.getTime() || 0)
  ));
  const unsubs = trashCollections.map((collectionName) => onSnapshot(
    query(collection(db, collectionName), where('deleted', '==', true)),
    (snap) => {
      byCollection.set(collectionName, snap.docs.map((item) => ({
        id: item.id,
        collection: collectionName,
        label: trashLabel(collectionName, item.id, item.data()),
        deletedAt: item.data().deletedAt ? firestoreTimestampToDate(item.data().deletedAt) : undefined,
        deletedBy: item.data().deletedBy || undefined,
      })));
      publish();
    }
  ));
  return () => unsubs.forEach((unsubscribe) => unsubscribe());
}

/** Admin soft-delete. Owner-only rules protect restoring and permanent deletion. */
export async function trashRecord(collectionName: TrashCollection, id: string, deletedBy?: string) {
  const payload: Record<string, any> = {
    deleted: true,
    deletedAt: serverTimestamp(),
    deletedBy: deletedBy || null,
    updatedAt: serverTimestamp(),
  };
  if (collectionName === 'volunteers') payload.participationStatus = 'inactive';
  if (collectionName === 'admins') payload.isAdmin = false;
  await updateDoc(doc(db, collectionName, id), payload);
}

export async function restoreTrashRecord(record: TrashRecord) {
  const payload: Record<string, any> = {
    deleted: false,
    deletedAt: null,
    deletedBy: null,
    updatedAt: serverTimestamp(),
  };
  if (record.collection === 'volunteers') payload.participationStatus = 'active';
  if (record.collection === 'admins') payload.isAdmin = true;
  await updateDoc(doc(db, record.collection, record.id), payload);
}

export async function permanentlyDeleteTrashRecord(record: TrashRecord) {
  await deleteDoc(doc(db, record.collection, record.id));
}

/** Securely delete another user's Auth account and remove/anonymize their data. */
export async function deleteVolunteerAccount(uid: string): Promise<void> {
  const removeAccount = httpsCallable<{ uid: string }, { deleted: boolean }>(functions, 'deleteVolunteerAccount');
  await removeAccount({ uid });
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
    cb(snap.docs.filter((d) => d.data().deleted !== true).map((d) => normalizeTask(d.id, d.data())));
  });
}

export function subscribeDeletedTasks(cb: (tasks: VolunteerTask[]) => void) {
  const q = query(collection(db, 'tasks'), where('deleted', '==', true));
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => normalizeTask(d.id, d.data())).sort((a, b) =>
      (b.deletedAt?.getTime() || 0) - (a.deletedAt?.getTime() || 0)
    ));
  });
}

export async function getTasks(): Promise<VolunteerTask[]> {
  const snap = await getDocs(query(collection(db, 'tasks'), orderBy('startDateTime', 'asc')));
  return snap.docs.filter((d) => d.data().deleted !== true).map((d) => normalizeTask(d.id, d.data()));
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
  return snap.docs.filter((d) => d.data().deleted !== true).map((d) => normalizeTask(d.id, d.data()));
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

export interface TaskManagementFields {
  title?: string;
  description?: string;
  startDateTime?: Date;
  endDateTime?: Date | null;
  location?: string;
  volunteersNeeded?: number;
  openForSignup?: boolean;
  reminderHoursBefore?: number[];
}

/** Update the allow-listed fields proposed by the AI management preview. */
export async function updateTaskManagementFields(
  taskId: string,
  fields: TaskManagementFields
): Promise<void> {
  const patch: Record<string, any> = { updatedAt: serverTimestamp() };
  if (typeof fields.title === 'string' && fields.title.trim()) patch.title = fields.title.trim();
  if (typeof fields.description === 'string') patch.description = fields.description.trim();
  if (fields.startDateTime instanceof Date && !Number.isNaN(fields.startDateTime.getTime())) {
    patch.startDateTime = Timestamp.fromDate(fields.startDateTime);
  }
  if (fields.endDateTime === null) patch.endDateTime = null;
  else if (fields.endDateTime instanceof Date && !Number.isNaN(fields.endDateTime.getTime())) {
    patch.endDateTime = Timestamp.fromDate(fields.endDateTime);
  }
  if (typeof fields.location === 'string') patch.location = fields.location.trim();
  if (typeof fields.volunteersNeeded === 'number' && Number.isFinite(fields.volunteersNeeded)) {
    patch.volunteersNeeded = Math.max(1, Math.floor(fields.volunteersNeeded));
  }
  if (typeof fields.openForSignup === 'boolean') patch.openForSignup = fields.openForSignup;
  if (Array.isArray(fields.reminderHoursBefore)) {
    patch.reminderHoursBefore = fields.reminderHoursBefore.filter((n) => Number.isFinite(n) && n > 0);
  }
  if (fields.startDateTime !== undefined || fields.reminderHoursBefore !== undefined) {
    patch.reminderVersion = increment(1);
  }
  await updateDoc(doc(db, 'tasks', taskId), patch);
}

/** Apply manual edits to one task or to this and all future occurrences. */
export async function updateTaskManagementFieldsScoped(
  task: VolunteerTask,
  fields: TaskManagementFields,
  scope: SeriesScope
): Promise<void> {
  if (!task.seriesId || scope === 'one') {
    if (fields.volunteersNeeded !== undefined && fields.volunteersNeeded < task.assignedVolunteers.length) {
      throw new Error(`Volunteers needed cannot be below the ${task.assignedVolunteers.length} already assigned.`);
    }
    await updateTaskManagementFields(task.id, fields);
    return;
  }

  const occurrences = await seriesOccurrences(task.seriesId);
  const cutoff = task.startDateTime.getTime();
  const targets = occurrences.filter((item) => {
    const data = item.data();
    const start = data.startDateTime?.toDate?.()?.getTime?.() ?? 0;
    return data.deleted !== true && start >= cutoff;
  });
  if (fields.volunteersNeeded !== undefined) {
    const overCapacity = targets.find((item) => (item.data().assignedVolunteers || []).length > fields.volunteersNeeded!);
    if (overCapacity) throw new Error('The new volunteer count is below the number already assigned on one or more future dates.');
  }

  const newSelectedStart = fields.startDateTime || task.startDateTime;
  const startDelta = fields.startDateTime ? fields.startDateTime.getTime() - task.startDateTime.getTime() : 0;
  const newDuration = fields.endDateTime instanceof Date
    ? fields.endDateTime.getTime() - newSelectedStart.getTime()
    : null;

  for (let i = 0; i < targets.length; i += 400) {
    const batch = writeBatch(db);
    targets.slice(i, i + 400).forEach((item) => {
      const data = item.data();
      const originalStart: Date = data.startDateTime.toDate();
      const shiftedStart = new Date(originalStart.getTime() + startDelta);
      const patch: Record<string, any> = { updatedAt: serverTimestamp() };
      if (typeof fields.title === 'string' && fields.title.trim()) patch.title = fields.title.trim();
      if (typeof fields.description === 'string') patch.description = fields.description.trim();
      if (typeof fields.location === 'string') patch.location = fields.location.trim();
      if (typeof fields.volunteersNeeded === 'number') patch.volunteersNeeded = Math.max(1, Math.floor(fields.volunteersNeeded));
      if (typeof fields.openForSignup === 'boolean') patch.openForSignup = fields.openForSignup;
      if (Array.isArray(fields.reminderHoursBefore)) patch.reminderHoursBefore = fields.reminderHoursBefore.filter((n) => Number.isFinite(n) && n > 0);
      if (fields.startDateTime) patch.startDateTime = Timestamp.fromDate(shiftedStart);
      if (fields.endDateTime === null) patch.endDateTime = null;
      else if (newDuration !== null) patch.endDateTime = Timestamp.fromDate(new Date(shiftedStart.getTime() + newDuration));
      if (fields.startDateTime !== undefined || fields.reminderHoursBefore !== undefined) patch.reminderVersion = increment(1);
      batch.update(item.ref, patch);
    });
    await batch.commit();
  }
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
export async function trashTaskScoped(
  task: VolunteerTask,
  scope: SeriesScope,
  deletedBy?: string
): Promise<string> {
  const batchId = `${Date.now()}_${task.id}`;
  const deletedFields = {
    deleted: true,
    deletedAt: serverTimestamp(),
    deletedBy: deletedBy || null,
    deletedBatchId: batchId,
    deletedScope: scope,
    updatedAt: serverTimestamp(),
  };
  if (!task.seriesId || scope === 'one') {
    await updateDoc(doc(db, 'tasks', task.id), deletedFields);
    return batchId;
  }
  const docs = await seriesOccurrences(task.seriesId);
  const cutoff = task.startDateTime.getTime();
  const targets = docs.filter((d) => {
    const start = d.data().startDateTime?.toDate?.()?.getTime?.() ?? 0;
    return start >= cutoff;
  });
  await setDoc(doc(db, 'taskSeries', task.seriesId), {
    stoppedAt: serverTimestamp(),
    deletedBatchId: batchId,
    cutoff: Timestamp.fromDate(task.startDateTime),
  });
  for (let i = 0; i < targets.length; i += 450) {
    const batch = writeBatch(db);
    targets.slice(i, i + 450).forEach((d) => batch.update(d.ref, deletedFields));
    await batch.commit();
  }
  return batchId;
}

export async function restoreDeletedTaskBatch(batchId: string): Promise<void> {
  const snap = await getDocs(query(collection(db, 'tasks'), where('deletedBatchId', '==', batchId)));
  const seriesIds = new Set<string>();
  snap.docs.forEach((item) => { if (item.data().seriesId) seriesIds.add(item.data().seriesId); });
  for (let i = 0; i < snap.docs.length; i += 450) {
    const batch = writeBatch(db);
    snap.docs.slice(i, i + 450).forEach((item) => batch.update(item.ref, {
      deleted: false, deletedAt: null, deletedBy: null, deletedBatchId: null, deletedScope: null,
      updatedAt: serverTimestamp(),
    }));
    await batch.commit();
  }
  for (const seriesId of Array.from(seriesIds)) {
    const marker = doc(db, 'taskSeries', seriesId);
    const markerSnap = await getDoc(marker);
    if (markerSnap.data()?.deletedBatchId === batchId) await deleteDoc(marker);
  }
}

export async function permanentlyDeleteTaskBatch(batchId: string): Promise<void> {
  const snap = await getDocs(query(collection(db, 'tasks'), where('deletedBatchId', '==', batchId)));
  for (let i = 0; i < snap.docs.length; i += 450) {
    const batch = writeBatch(db);
    snap.docs.slice(i, i + 450).forEach((item) => batch.delete(item.ref));
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
  const taskStatus = effectiveTaskStatus(task);
  if (taskStatus === 'cancelled' || taskStatus === 'completed') {
    throw new Error(`Volunteers cannot be assigned to a ${taskStatus} task.`);
  }
  if (
    volunteer.whatsappOptIn !== true ||
    volunteer.participationStatus === 'inactive' ||
    !volunteer.phoneNumber
  ) {
    throw new Error('This volunteer is inactive until WhatsApp reminders and a phone number are enabled.');
  }
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
    tx.update(taskRef, {
      assignedVolunteers: arrayUnion(volunteer.uid),
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
    tx.update(taskRef, {
      assignedVolunteers: arrayRemove(volunteerId),
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
      snap.docs.filter((d) => d.data().deleted !== true).map((d) => ({
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
  return snap.docs.filter((d) => d.data().deleted !== true).map((d) => {
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

/** Recent reminder delivery outcomes for the admin analytics dashboard. */
export async function getSentMessages(limitCount = 1000): Promise<SentMessage[]> {
  const snap = await getDocs(
    query(collection(db, 'sentMessages'), orderBy('sentAt', 'desc'), limit(limitCount))
  );
  return snap.docs.filter((d) => d.data().deleted !== true).map((d) => {
    const data = d.data();
    return {
      id: d.id,
      reminderId: data.reminderId || undefined,
      taskId: data.taskId || undefined,
      volunteerId: data.volunteerId,
      channel: data.channel,
      destination: data.destination || '',
      status: data.status,
      providerId: data.providerId || undefined,
      failureReason: data.failureReason || undefined,
      billingCategory: data.billingCategory || undefined,
      estimatedCostUsd: typeof data.estimatedCostUsd === 'number' ? data.estimatedCostUsd : undefined,
      sentAt: firestoreTimestampToDate(data.sentAt),
    } as SentMessage;
  });
}

export interface AuditLog {
  id: string;
  event: 'login';
  actorId: string;
  email: string;
  role: 'owner' | 'admin' | 'volunteer';
  occurredAt: Date;
  userAgent?: string;
  platform?: string;
  timezone?: string;
}

/** Record a verified successful login. Audit writes are append-only. */
export async function recordLoginAudit(
  actorId: string,
  email: string,
  role: AuditLog['role']
): Promise<void> {
  await addDoc(collection(db, 'auditLogs'), {
    event: 'login',
    actorId,
    email: email.trim().toLowerCase(),
    role,
    occurredAt: serverTimestamp(),
    userAgent: navigator.userAgent.slice(0, 500),
    platform: navigator.platform || '',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || '',
  });
}

/** Owner-only login audit history. */
export async function getAuditLogs(limitCount = 5000): Promise<AuditLog[]> {
  const snap = await getDocs(query(collection(db, 'auditLogs'), orderBy('occurredAt', 'desc'), limit(limitCount)));
  return snap.docs.map((item) => {
    const data = item.data();
    return {
      id: item.id,
      event: 'login',
      actorId: data.actorId || '',
      email: data.email || '',
      role: data.role === 'owner' ? 'owner' : data.role === 'admin' ? 'admin' : 'volunteer',
      occurredAt: firestoreTimestampToDate(data.occurredAt),
      userAgent: data.userAgent || undefined,
      platform: data.platform || undefined,
      timezone: data.timezone || undefined,
    };
  });
}

/** Event feedback counts/text metadata used for aggregate comparisons. */
export async function getEventFeedbackRecords(): Promise<EventFeedbackRecord[]> {
  const snap = await getDocs(collection(db, 'eventFeedback'));
  return snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      eventId: data.eventId || '',
      volunteerId: data.volunteerId || '',
      feedbackText: data.feedbackText || data.comments || '',
      anonymous: data.anonymous === true,
      submittedAt: data.submittedAt ? firestoreTimestampToDate(data.submittedAt) : undefined,
    };
  });
}

// ---------------------------------------------------------------------------
// Admin bootstrap
// ---------------------------------------------------------------------------

export interface AdminAccess {
  uid: string;
  email: string;
  role: 'owner' | 'admin';
  createdAt?: Date;
}

export function subscribeAdmins(cb: (admins: AdminAccess[]) => void) {
  return onSnapshot(collection(db, 'admins'), (snap) => {
    cb(snap.docs
      .filter((item) => item.data().isAdmin === true && item.data().deleted !== true)
      .map((item) => ({
        uid: item.id,
        email: item.data().email || '',
        role: (item.data().role === 'owner' || item.data().bootstrap === true ? 'owner' : 'admin') as AdminAccess['role'],
        createdAt: item.data().createdAt ? firestoreTimestampToDate(item.data().createdAt) : undefined,
      }))
      .sort((a, b) => a.role === b.role ? a.email.localeCompare(b.email) : a.role === 'owner' ? -1 : 1));
  });
}

export async function grantAdminAccess(volunteer: VolunteerProfile, grantedBy: string): Promise<void> {
  await setDoc(doc(db, 'admins', volunteer.uid), {
    isAdmin: true,
    role: 'admin',
    email: volunteer.email.trim().toLowerCase(),
    createdAt: serverTimestamp(),
    grantedBy,
  });
}

export async function revokeAdminAccess(uid: string, removedBy?: string): Promise<void> {
  await trashRecord('admins', uid, removedBy);
}

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
    role: 'owner',
    email,
    bootstrap: true,
    createdAt: serverTimestamp(),
  });
  await setDoc(doc(db, 'adminsMeta', 'count'), { total: increment(1) }, { merge: true });
}
