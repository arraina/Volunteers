import { User } from 'firebase/auth';
import { db } from '../config/firebase';
import { doc, getDoc } from 'firebase/firestore';

export interface VolunteerProfile {
  uid: string;
  firstName?: string;
  lastName?: string;
  name: string;
  email: string;
  phoneNumber: string;
  address?: string;
  assignedEvents?: string[];
  assignedServices?: string[];
  availableHours?: number;
  joinedDate: Date;
}

export interface ServiceEvent {
  id: string;
  topic: string;
  description?: string;
  eventDateTime: Date;
  location?: string;
  assignedVolunteers: string[];
  status: 'scheduled' | 'ongoing' | 'completed' | 'cancelled';
  createdAt: Date;
  updatedAt: Date;
}

export interface EventService {
  id: string;
  eventId: string;
  name: string;
  description?: string;
  startTime: string;
  endTime: string;
  intervalMinutes?: number;
  capacity?: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ServiceTimeSlot {
  key: string;
  startTime: string;
  endTime: string;
  label: string;
}

export interface ServiceAssignment {
  id: string;
  eventId: string;
  serviceId: string;
  slotKey?: string;
  slotStartTime?: string;
  slotEndTime?: string;
  volunteerId: string;
  volunteerName: string;
  volunteerEmail: string;
  createdAt: Date;
}

export type FirestoreTimestampLike = Date | string | number | { toDate: () => Date };

const FIREBASE_ADMIN_EMAIL = 'admin@example.com';

/**
 * Check if user is an admin
 */
export async function isUserAdmin(user: User): Promise<boolean> {
  if (user.email?.toLowerCase() === FIREBASE_ADMIN_EMAIL) {
    return true;
  }

  try {
    const adminDoc = await getDoc(doc(db, 'admins', user.uid));
    return adminDoc.exists() && adminDoc.data()?.isAdmin === true;
  } catch (error) {
    console.error('Error checking admin status:', error);
    return false;
  }
}

/**
 * Get current user's volunteer profile
 */
export async function getUserProfile(userId: string): Promise<VolunteerProfile | null> {
  try {
    const userDoc = await getDoc(doc(db, 'volunteers', userId));
    if (userDoc.exists()) {
      const data = userDoc.data();
      return {
        uid: userDoc.id,
        ...data,
        joinedDate: data.joinedDate?.toDate() || new Date(),
      } as VolunteerProfile;
    }
    return null;
  } catch (error) {
    console.error('Error fetching user profile:', error);
    return null;
  }
}

/**
 * Convert Firestore Timestamp to Date
 */
export function firestoreTimestampToDate(timestamp: FirestoreTimestampLike | null | undefined): Date {
  if (!timestamp) return new Date();
  if (typeof timestamp === 'object' && 'toDate' in timestamp) return timestamp.toDate();
  return new Date(timestamp);
}

/**
 * Format date for display
 */
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

function parseTimeToMinutes(time: string | undefined): number | null {
  if (!time) return null;
  const [hours, minutes] = time.split(':').map(Number);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return null;
  return hours * 60 + minutes;
}

function formatMinutesAsTime(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

export function formatTime(time: string | undefined): string {
  const minutes = parseTimeToMinutes(time);
  if (minutes === null) return 'N/A';
  return new Date(2000, 0, 1, Math.floor(minutes / 60), minutes % 60).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function buildServiceSlots(service: Pick<EventService, 'startTime' | 'endTime' | 'intervalMinutes'>): ServiceTimeSlot[] {
  const startMinutes = parseTimeToMinutes(service.startTime);
  const endMinutes = parseTimeToMinutes(service.endTime);
  const intervalMinutes = service.intervalMinutes || 30;

  if (
    startMinutes === null ||
    endMinutes === null ||
    endMinutes <= startMinutes ||
    intervalMinutes <= 0
  ) {
    return [];
  }

  const slots: ServiceTimeSlot[] = [];
  for (let slotStart = startMinutes; slotStart < endMinutes; slotStart += intervalMinutes) {
    const slotEnd = Math.min(slotStart + intervalMinutes, endMinutes);
    const startTime = formatMinutesAsTime(slotStart);
    const endTime = formatMinutesAsTime(slotEnd);
    slots.push({
      key: `${startTime.replace(':', '')}-${endTime.replace(':', '')}`,
      startTime,
      endTime,
      label: `${formatTime(startTime)} - ${formatTime(endTime)}`,
    });
  }

  return slots;
}

