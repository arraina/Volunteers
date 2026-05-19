import { User } from 'firebase/auth';
import { db } from '../config/firebase';
import { doc, getDoc } from 'firebase/firestore';

export interface VolunteerProfile {
  uid: string;
  name: string;
  email: string;
  phoneNumber: string;
  address?: string;
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

export interface ReminderRule {
  id: string;
  eventId: string;
  hoursBeforeEvent: number;
  message: string;
  createdAt: Date;
}

export interface Reminder {
  id: string;
  eventId: string;
  volunteerId: string;
  phoneNumber: string;
  message: string;
  reminderTime: Date;
  status: 'pending' | 'sent' | 'failed';
  sentAt?: Date;
  createdAt: Date;
}

/**
 * Check if user is an admin
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
export function firestoreTimestampToDate(timestamp: any): Date {
  if (!timestamp) return new Date();
  if (timestamp.toDate) return timestamp.toDate();
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

/**
 * Mask phone number for display
 */
export function maskPhoneNumber(phoneNumber: string): string {
  if (!phoneNumber || phoneNumber.length < 4) return '***';
  const lastFour = phoneNumber.slice(-4);
  return `***-***-${lastFour}`;
}
