import { addDoc, collection, doc, getDocs, onSnapshot, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { firestoreTimestampToDate } from './types';

export type DonorStatus = 'active' | 'prospect' | 'inactive';

export interface FundraisingDonor {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  organization: string;
  address: string;
  status: DonorStatus;
  tags: string[];
  notes: string;
  nextFollowUp: Date | null;
  assignedTo: string;
  archived: boolean;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface CampaignSummary {
  eventId: string;
  name: string;
  target: number;
  current: number;
  donations: number;
  pledges: number;
  loans: number;
  donorCount: number;
  locked: boolean;
}

const cleanPhone = (value: string) => value.replace(/\D/g, '');
const cleanEmail = (value: string) => value.trim().toLowerCase();

export function donorDuplicateKeys(donor: Pick<FundraisingDonor, 'email' | 'phone'>): string[] {
  return [cleanEmail(donor.email) ? `email:${cleanEmail(donor.email)}` : '', cleanPhone(donor.phone) ? `phone:${cleanPhone(donor.phone)}` : ''].filter(Boolean);
}

export function subscribeFundraisingDonors(cb: (donors: FundraisingDonor[]) => void, onError?: (error: Error) => void) {
  return onSnapshot(collection(db, 'fundraisingDonors'), (snapshot) => {
    const donors = snapshot.docs.map((item) => {
      const data = item.data();
      return {
        id: item.id,
        firstName: String(data.firstName || ''), lastName: String(data.lastName || ''),
        email: String(data.email || ''), phone: String(data.phone || ''), organization: String(data.organization || ''), address: String(data.address || ''),
        status: ['active', 'prospect', 'inactive'].includes(data.status) ? data.status : 'active',
        tags: Array.isArray(data.tags) ? data.tags.map(String) : [], notes: String(data.notes || ''),
        nextFollowUp: data.nextFollowUp ? firestoreTimestampToDate(data.nextFollowUp) : null,
        assignedTo: String(data.assignedTo || ''), archived: data.archived === true,
        createdAt: data.createdAt ? firestoreTimestampToDate(data.createdAt) : null,
        updatedAt: data.updatedAt ? firestoreTimestampToDate(data.updatedAt) : null,
      } as FundraisingDonor;
    });
    cb(donors.sort((a, b) => `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`)));
  }, (error) => onError?.(error));
}

export async function saveFundraisingDonor(donor: Omit<FundraisingDonor, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }, uid?: string) {
  const payload = {
    firstName: donor.firstName.trim(), lastName: donor.lastName.trim(), email: cleanEmail(donor.email), phone: donor.phone.trim(),
    normalizedEmail: cleanEmail(donor.email), normalizedPhone: cleanPhone(donor.phone), organization: donor.organization.trim(), address: donor.address.trim(),
    status: donor.status, tags: donor.tags.map((tag) => tag.trim()).filter(Boolean).slice(0, 20), notes: donor.notes.trim(),
    nextFollowUp: donor.nextFollowUp, assignedTo: donor.assignedTo.trim(), archived: donor.archived,
    updatedAt: serverTimestamp(), updatedBy: uid || null,
  };
  if (donor.id) return updateDoc(doc(db, 'fundraisingDonors', donor.id), payload);
  return addDoc(collection(db, 'fundraisingDonors'), { ...payload, createdAt: serverTimestamp(), createdBy: uid || null });
}

export async function loadCampaignSummaries(eventNames: Record<string, string>): Promise<CampaignSummary[]> {
  const snapshot = await getDocs(collection(db, 'fundraisingCampaigns'));
  return snapshot.docs.map((item) => {
    const data = item.data();
    const entries = Array.isArray(data.entries) ? data.entries : [];
    const total = (type?: string) => entries.filter((entry: any) => !type || entry.type === type).reduce((sum: number, entry: any) => sum + (Number(entry.amount) || 0), 0);
    return {
      eventId: item.id, name: String(data.dashboardName || eventNames[item.id] || 'Fundraising campaign'),
      target: Number(data.targetAmount) || 0, current: (Number(data.startingCurrentAmount) || 0) + total(),
      donations: total('donation'), pledges: total('pledge'), loans: total('loan'), donorCount: entries.length,
      locked: data.locked === true,
    };
  }).sort((a, b) => b.current - a.current);
}
