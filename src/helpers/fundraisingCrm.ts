import { addDoc, collection, doc, getDocs, onSnapshot, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { firestoreTimestampToDate } from './types';

export type DonorStatus = 'active' | 'prospect' | 'inactive';

export interface FundraisingDonor {
  id: string;
  firstName: string;
  lastName: string;
  initiatedName: string;
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
  entries: Array<{ firstName: string; lastName: string; type: 'pledge' | 'loan' | 'donation'; amount: number }>;
}

export interface FundraisingPledge {
  id: string;
  donorId: string;
  eventId: string;
  pledgedAmount: number;
  paidAmount: number;
  dueDate: Date | null;
  notes: string;
  createdAt: Date | null;
  updatedAt: Date | null;
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
        firstName: String(data.firstName || ''), lastName: String(data.lastName || ''), initiatedName: String(data.initiatedName || ''),
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
    firstName: donor.firstName.trim(), lastName: donor.lastName.trim(), initiatedName: donor.initiatedName.trim(), email: cleanEmail(donor.email), phone: donor.phone.trim(),
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
      entries: entries.map((entry: any) => ({
        firstName: String(entry.firstName || ''), lastName: String(entry.lastName || ''),
        type: ['pledge', 'loan', 'donation'].includes(entry.type) ? entry.type : 'donation', amount: Number(entry.amount) || 0,
      })),
    };
  }).sort((a, b) => b.current - a.current);
}

export function subscribeFundraisingPledges(cb: (pledges: FundraisingPledge[]) => void, onError?: (error: Error) => void) {
  return onSnapshot(collection(db, 'fundraisingPledges'), (snapshot) => {
    const pledges = snapshot.docs.map((item) => {
      const data = item.data();
      return {
        id: item.id, donorId: String(data.donorId || ''), eventId: String(data.eventId || ''),
        pledgedAmount: Number(data.pledgedAmount) || 0, paidAmount: Number(data.paidAmount) || 0,
        dueDate: data.dueDate ? firestoreTimestampToDate(data.dueDate) : null, notes: String(data.notes || ''),
        createdAt: data.createdAt ? firestoreTimestampToDate(data.createdAt) : null,
        updatedAt: data.updatedAt ? firestoreTimestampToDate(data.updatedAt) : null,
      } as FundraisingPledge;
    });
    cb(pledges.sort((a, b) => Number(a.dueDate || new Date(8640000000000000)) - Number(b.dueDate || new Date(8640000000000000))));
  }, (error) => onError?.(error));
}

export async function saveFundraisingPledge(pledge: Omit<FundraisingPledge, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }, uid?: string) {
  const payload = {
    donorId: pledge.donorId, eventId: pledge.eventId, pledgedAmount: Math.max(0, pledge.pledgedAmount),
    paidAmount: Math.max(0, pledge.paidAmount), dueDate: pledge.dueDate, notes: pledge.notes.trim(),
    updatedAt: serverTimestamp(), updatedBy: uid || null,
  };
  if (pledge.id) return updateDoc(doc(db, 'fundraisingPledges', pledge.id), payload);
  return addDoc(collection(db, 'fundraisingPledges'), { ...payload, createdAt: serverTimestamp(), createdBy: uid || null });
}
