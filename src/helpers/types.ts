import { User } from 'firebase/auth';
import { db } from '../config/firebase';
import { doc, getDoc } from 'firebase/firestore';

// ---------------------------------------------------------------------------
// Shared enums / small types
// ---------------------------------------------------------------------------

export type TaskStatus = 'open' | 'filled' | 'completed' | 'cancelled';

export type NotificationChannel = 'whatsapp' | 'email' | 'push';

export type RecurrenceFrequency = 'none' | 'daily' | 'weekly' | 'monthly';

// Common temple service categories used as skill/interest tags.
export const SKILL_OPTIONS = [
  'Kitchen / Prasadam',
  'Cleaning',
  'Decoration / Flowers',
  'Sound / AV',
  'Setup / Teardown',
  'Greeting / Hospitality',
  'Teaching / Childcare',
  'Parking / Security',
  'Fundraising',
  'General',
] as const;

export const WEEKDAYS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

// ---------------------------------------------------------------------------
// Core entities
// ---------------------------------------------------------------------------

export interface NotificationPreferences {
  whatsapp: boolean;
  email: boolean;
  push: boolean;
}

export interface VolunteerProfile {
  uid: string;
  firstName: string;
  lastName: string;
  name: string;
  email: string;
  phoneNumber: string;
  skills: string[];
  /** General weekly availability, e.g. ['Sunday', 'Saturday']. */
  availability: string[];
  notificationPrefs: NotificationPreferences;
  /** Whether this person explicitly agreed to receive WhatsApp messages. */
  whatsappOptIn?: boolean;
  whatsappOptInAt?: Date;
  whatsappOptInSource?: 'self' | 'admin-confirmed';
  /** Invitations do not restrict assignment or reminder delivery. */
  invitationStatus?: 'invited' | 'active';
  invitationLastSentAt?: Date;
  invitationSendCount?: number;
  participationStatus?: 'active' | 'inactive';
  /** FCM web-push tokens for this volunteer's devices. */
  pushTokens?: string[];
  /** Total volunteered hours (rolled up from hour logs). */
  totalHours: number;
  isAdmin?: boolean;
  joinedDate: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface TempleEvent {
  id: string;
  name: string;
  /** Optional overall event date (individual tasks carry their own times). */
  date?: Date;
  description?: string;
  lessonsLearned?: string;
  createdBy?: string;
  createdAt: Date;
}

export interface VolunteerTask {
  id: string;
  title: string;
  description?: string;
  /** Optional parent event this task belongs to (e.g. Janmashtami). */
  eventId?: string;
  eventName?: string;
  /** When the task takes place. */
  startDateTime: Date;
  endDateTime?: Date;
  location?: string;
  skillsNeeded: string[];
  /** How many volunteers are needed in total. */
  volunteersNeeded: number;
  /** UIDs of volunteers signed up / assigned. */
  assignedVolunteers: string[];
  /** Whether volunteers may sign themselves up (vs admin-assign only). */
  openForSignup: boolean;
  status: TaskStatus;
  recurrence: RecurrenceFrequency;
  /** For recurring series: id shared by all occurrences (the first occurrence's id). */
  seriesId?: string;
  /** 0-based position of this occurrence within its series. */
  occurrenceIndex?: number;
  /** Hours before start to send reminders. Empty = no reminder. */
  reminderHoursBefore: number[];
  createdBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * A reminder queued for one volunteer + one task + one channel. Written by the
 * app (or a Cloud/GitHub job) and consumed by the scheduled sender. Never
 * readable/writable by regular clients (see Firestore rules).
 */
export interface Reminder {
  id: string;
  taskId: string;
  volunteerId: string;
  channel: NotificationChannel;
  /** Destination for the chosen channel (phone / email / token). */
  destination: string;
  message: string;
  /** Template variables for WhatsApp, in order. */
  templateParams?: string[];
  sendAt: Date;
  status: 'pending' | 'sent' | 'failed' | 'cancelled';
  attempts?: number;
  createdAt: Date;
}

export interface SentMessage {
  id: string;
  reminderId?: string;
  taskId?: string;
  volunteerId: string;
  channel: NotificationChannel;
  destination: string;
  status: 'sent' | 'failed';
  providerId?: string;
  failureReason?: string;
  sentAt: Date;
}

export interface Announcement {
  id: string;
  title: string;
  body: string;
  channels: NotificationChannel[];
  /** Optional skill filter; empty = everyone. */
  audienceSkills: string[];
  createdBy?: string;
  createdAt: Date;
}

export interface HourLog {
  id: string;
  taskId: string;
  volunteerId: string;
  volunteerName: string;
  checkIn: Date;
  checkOut?: Date;
  /** Computed hours once checked out. */
  hours?: number;
}

export type FirestoreTimestampLike = Date | string | number | { toDate: () => Date };

// ---------------------------------------------------------------------------
// Auth / role helpers
// ---------------------------------------------------------------------------

/**
 * Check if a user is an admin. Admin status is granted ONLY by an
 * `admins/{uid}` document with `isAdmin: true` — there are no hardcoded admins.
 */
export async function isUserAdmin(user: User): Promise<boolean> {
  try {
    const adminDoc = await getDoc(doc(db, 'admins', user.uid));
    return adminDoc.exists() && adminDoc.data()?.isAdmin === true;
  } catch (error) {
    console.error('Error checking admin status:', error);
    return false;
  }
}

/** Check if the admins collection has any admin yet (for first-admin bootstrap). */
export async function getUserProfile(userId: string): Promise<VolunteerProfile | null> {
  try {
    const userDoc = await getDoc(doc(db, 'volunteers', userId));
    if (userDoc.exists()) {
      const data = userDoc.data();
      return normalizeVolunteer(userDoc.id, data);
    }
    return null;
  } catch (error) {
    console.error('Error fetching user profile:', error);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Normalizers (Firestore doc -> typed entity)
// ---------------------------------------------------------------------------

export const defaultNotificationPrefs = (): NotificationPreferences => ({
  whatsapp: true,
  email: true,
  push: false,
});

export function normalizeVolunteer(uid: string, data: Record<string, any>): VolunteerProfile {
  const firstName = data.firstName || '';
  const lastName = data.lastName || '';
  return {
    uid,
    firstName,
    lastName,
    name: data.name || `${firstName} ${lastName}`.trim(),
    email: data.email || '',
    phoneNumber: data.phoneNumber || '',
    skills: Array.isArray(data.skills) ? data.skills : [],
    availability: Array.isArray(data.availability) ? data.availability : [],
    notificationPrefs: { ...defaultNotificationPrefs(), ...(data.notificationPrefs || {}) },
    whatsappOptIn: data.whatsappOptIn === true,
    whatsappOptInAt: data.whatsappOptInAt?.toDate?.(),
    whatsappOptInSource: data.whatsappOptInSource,
    invitationStatus: data.invitationStatus,
    invitationLastSentAt: data.invitationLastSentAt?.toDate?.(),
    invitationSendCount:
      typeof data.invitationSendCount === 'number' ? data.invitationSendCount : 0,
    participationStatus:
      data.participationStatus === 'inactive' || data.whatsappOptIn !== true ? 'inactive' : 'active',
    pushTokens: Array.isArray(data.pushTokens) ? data.pushTokens : [],
    totalHours: typeof data.totalHours === 'number' ? data.totalHours : 0,
    isAdmin: data.isAdmin === true,
    joinedDate: firestoreTimestampToDate(data.joinedDate),
    createdAt: data.createdAt ? firestoreTimestampToDate(data.createdAt) : undefined,
    updatedAt: data.updatedAt ? firestoreTimestampToDate(data.updatedAt) : undefined,
  };
}

export function normalizeEvent(id: string, data: Record<string, any>): TempleEvent {
  return {
    id,
    name: data.name || '',
    date: data.date ? firestoreTimestampToDate(data.date) : undefined,
    description: data.description || '',
    lessonsLearned: data.lessonsLearned || '',
    createdBy: data.createdBy || undefined,
    createdAt: firestoreTimestampToDate(data.createdAt),
  };
}

export function normalizeTask(id: string, data: Record<string, any>): VolunteerTask {
  const task: VolunteerTask = {
    id,
    title: data.title || '',
    description: data.description || '',
    eventId: data.eventId || undefined,
    eventName: data.eventName || undefined,
    startDateTime: firestoreTimestampToDate(data.startDateTime),
    endDateTime: data.endDateTime ? firestoreTimestampToDate(data.endDateTime) : undefined,
    location: data.location || '',
    skillsNeeded: Array.isArray(data.skillsNeeded) ? data.skillsNeeded : [],
    volunteersNeeded: typeof data.volunteersNeeded === 'number' ? data.volunteersNeeded : 1,
    assignedVolunteers: Array.isArray(data.assignedVolunteers) ? data.assignedVolunteers : [],
    openForSignup: data.openForSignup !== false,
    status: data.status === 'cancelled' ? 'cancelled' : 'open',
    recurrence: (data.recurrence as RecurrenceFrequency) || 'none',
    seriesId: data.seriesId || undefined,
    occurrenceIndex: typeof data.occurrenceIndex === 'number' ? data.occurrenceIndex : undefined,
    reminderHoursBefore: Array.isArray(data.reminderHoursBefore) ? data.reminderHoursBefore : [24],
    createdBy: data.createdBy || undefined,
    createdAt: firestoreTimestampToDate(data.createdAt),
    updatedAt: firestoreTimestampToDate(data.updatedAt),
  };
  task.status = effectiveTaskStatus(task);
  return task;
}

// ---------------------------------------------------------------------------
// Formatting utilities
// ---------------------------------------------------------------------------

export function firestoreTimestampToDate(
  timestamp: FirestoreTimestampLike | null | undefined
): Date {
  if (!timestamp) return new Date();
  if (typeof timestamp === 'object' && 'toDate' in timestamp) return timestamp.toDate();
  return new Date(timestamp as string | number | Date);
}

export function formatDate(date: Date | undefined): string {
  if (!date) return 'N/A';
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatDateShort(date: Date | undefined): string {
  if (!date) return 'N/A';
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

/** True when the task has no remaining open slots. */
export function isTaskFull(task: VolunteerTask): boolean {
  return task.assignedVolunteers.length >= task.volunteersNeeded;
}

/** Remaining open slots on a task (never negative). */
export function openSlots(task: VolunteerTask): number {
  return Math.max(0, task.volunteersNeeded - task.assignedVolunteers.length);
}

/** Derive status from cancellation, timing, and capacity. */
export function effectiveTaskStatus(task: VolunteerTask, now = new Date()): TaskStatus {
  if (task.status === 'cancelled') return 'cancelled';
  const completionTime = task.endDateTime || task.startDateTime;
  if (completionTime.getTime() <= now.getTime()) return 'completed';
  return isTaskFull(task) ? 'filled' : 'open';
}
