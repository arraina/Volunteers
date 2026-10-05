import { addDoc, collection, doc, documentId, DocumentData, getDocs, limit, onSnapshot, orderBy, query, Query, QueryDocumentSnapshot, QuerySnapshot, runTransaction, serverTimestamp, startAfter, updateDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { functions } from '../config/firebase';
import { httpsCallable } from 'firebase/functions';
import { firestoreTimestampToDate } from './types';

export type DonorStatus = 'active' | 'prospect' | 'inactive';
export interface DonorChild { name: string; birthDate: Date | null; }
export interface DonorContactInteraction { id: string; donorId: string; calledAt: Date; notes: string; createdBy: string; createdAt: Date | null; }

export interface FundraisingDonor {
  id: string;
  firstName: string;
  lastName: string;
  title: string;
  middleInitial: string;
  initiatedName: string;
  email: string;
  phone: string;
  officePhone: string;
  organization: string;
  address: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  homePhone: string;
  previousHomePhone: string;
  phoneVerified: boolean;
  phoneAppendDate: Date | null;
  doNotCall: boolean;
  doNotMail: boolean;
  noMailReason: string;
  receiptDelivery: string;
  receiptingPreference: string;
  pictureUrl: string;
  picturePath: string;
  futurePledge: boolean;
  fiveKAmount: number;
  spouseName: string;
  weddingAnniversary: Date | null;
  birthDate: Date | null;
  spouseBirthDate: Date | null;
  children: DonorChild[];
  lastDonationDate: Date | null;
  lastDonationAmount: number;
  biggestDonationDate: Date | null;
  biggestDonationAmount: number;
  autoDeductDonationAmount: number;
  autoDeductBillingAmount: number;
  monthlyDonor: boolean;
  autoDeductPledgeAmount: number;
  autoDeductPledgeStart: Date | null;
  autoDeductPledgeRemaining: number;
  cardLastFour: string;
  cardBillingAddress: string;
  cardBillingZip: string;
  facebookUrl: string;
  linkedinUrl: string;
  twitterHandle: string;
  websiteUrl: string;
  gotra: string;
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
  entries: Array<{ id: string; firstName: string; lastName: string; type: 'pledge' | 'loan' | 'donation'; amount: number; comments: string }>;
}

export interface FundraisingPledge {
  id: string;
  donorId: string;
  eventId: string;
  donorFirstName: string;
  donorLastName: string;
  sourceCampaignEntryId: string;
  purpose: string;
  pledgedAmount: number;
  paidAmount: number;
  openBalanceKnown: boolean;
  openBalanceSource: string;
  pledgeDate: Date | null;
  dueDate: Date | null;
  nextPaymentDate: Date | null;
  frequency: 'one-time' | 'monthly' | 'quarterly' | 'annual' | 'custom';
  status: 'active' | 'fulfilled' | 'on-hold' | 'cancelled';
  cancellationReason: string;
  cancelledAt: Date | null;
  cancelledBy: string;
  notes: string;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export type PledgePaymentMethod = 'zelle' | 'check' | 'cash' | 'card' | 'bank-transfer' | 'other';
export type PledgePaymentStatus = 'received' | 'deposited' | 'cleared';
export interface FundraisingPledgePayment {
  id: string;
  pledgeId: string;
  amount: number;
  receivedAt: Date;
  method: PledgePaymentMethod;
  status: PledgePaymentStatus;
  receivedBy: string;
  depositedAt: Date | null;
  receiptNumber: string;
  designation: string;
  reference: string;
  comments: string;
  createdBy: string;
  createdAt: Date | null;
}

const cleanPhone = (value: string) => value.replace(/\D/g, '');
const cleanEmail = (value: string) => value.trim().toLowerCase();

export function donorDuplicateKeys(donor: Pick<FundraisingDonor, 'email' | 'phone'>): string[] {
  return [cleanEmail(donor.email) ? `email:${cleanEmail(donor.email)}` : '', cleanPhone(donor.phone) ? `phone:${cleanPhone(donor.phone)}` : ''].filter(Boolean);
}

function donorFromSnapshot(item: QueryDocumentSnapshot): FundraisingDonor {
  const data = item.data();
  return {
    id: item.id,
    firstName: String(data.firstName || ''), lastName: String(data.lastName || ''), title: String(data.title || ''), middleInitial: String(data.middleInitial || ''), initiatedName: String(data.initiatedName || ''),
    email: String(data.email || ''), phone: String(data.phone || ''), officePhone: String(data.officePhone || ''), organization: String(data.organization || ''), address: String(data.address || ''),
    city: String(data.city || ''), state: String(data.state || ''), postalCode: String(data.postalCode || ''), country: String(data.country || ''),
    homePhone: String(data.homePhone || ''), previousHomePhone: String(data.previousHomePhone || ''), phoneVerified: data.phoneVerified === true,
    phoneAppendDate: data.phoneAppendDate ? firestoreTimestampToDate(data.phoneAppendDate) : null, doNotCall: data.doNotCall === true, doNotMail: data.doNotMail === true,
    noMailReason: String(data.noMailReason || ''), receiptDelivery: String(data.receiptDelivery || ''), receiptingPreference: String(data.receiptingPreference || ''),
    pictureUrl: String(data.pictureUrl || ''), picturePath: String(data.picturePath || ''), futurePledge: data.futurePledge === true, fiveKAmount: Number(data.fiveKAmount) || 0,
    spouseName: String(data.spouseName || ''), weddingAnniversary: data.weddingAnniversary ? firestoreTimestampToDate(data.weddingAnniversary) : null,
    birthDate: data.birthDate ? firestoreTimestampToDate(data.birthDate) : null,
    spouseBirthDate: data.spouseBirthDate ? firestoreTimestampToDate(data.spouseBirthDate) : null,
    children: Array.from({ length: 5 }, (_, index) => {
      const child = Array.isArray(data.children) ? data.children[index] : null;
      return { name: String(child?.name || ''), birthDate: child?.birthDate ? firestoreTimestampToDate(child.birthDate) : null };
    }),
    lastDonationDate: data.lastDonationDate ? firestoreTimestampToDate(data.lastDonationDate) : null,
    lastDonationAmount: Number(data.lastDonationAmount) || 0,
    biggestDonationDate: data.biggestDonationDate ? firestoreTimestampToDate(data.biggestDonationDate) : null,
    biggestDonationAmount: Number(data.biggestDonationAmount) || 0,
    autoDeductDonationAmount: Number(data.autoDeductDonationAmount) || 0,
    autoDeductBillingAmount: Number(data.autoDeductBillingAmount) || 0,
    monthlyDonor: data.monthlyDonor === true,
    autoDeductPledgeAmount: Number(data.autoDeductPledgeAmount) || 0,
    autoDeductPledgeStart: data.autoDeductPledgeStart ? firestoreTimestampToDate(data.autoDeductPledgeStart) : null,
    autoDeductPledgeRemaining: Number(data.autoDeductPledgeRemaining) || 0,
    cardLastFour: String(data.cardLastFour || ''), cardBillingAddress: String(data.cardBillingAddress || ''), cardBillingZip: String(data.cardBillingZip || ''),
    facebookUrl: String(data.facebookUrl || ''), linkedinUrl: String(data.linkedinUrl || ''), twitterHandle: String(data.twitterHandle || ''), websiteUrl: String(data.websiteUrl || ''), gotra: String(data.gotra || ''),
    status: ['active', 'prospect', 'inactive'].includes(data.status) ? data.status : 'active',
    tags: Array.isArray(data.tags) ? data.tags.map(String) : [], notes: String(data.notes || ''),
    nextFollowUp: data.nextFollowUp ? firestoreTimestampToDate(data.nextFollowUp) : null,
    assignedTo: String(data.assignedTo || ''), archived: data.archived === true,
    createdAt: data.createdAt ? firestoreTimestampToDate(data.createdAt) : null,
    updatedAt: data.updatedAt ? firestoreTimestampToDate(data.updatedAt) : null,
  } as FundraisingDonor;
}

// Load this large collection progressively so the first donor rows render
// quickly instead of waiting for the full directory to arrive in one snapshot.
export function subscribeFundraisingDonors(cb: (donors: FundraisingDonor[], complete: boolean) => void, onError?: (error: Error) => void, collectionName = 'fundraisingCuratedDonors') {
  let cancelled = false;
  let cursor: QueryDocumentSnapshot | null = null;
  const donors: FundraisingDonor[] = [];
  (async () => {
    while (!cancelled) {
      const pageQuery: Query<DocumentData> = cursor
        ? query(collection(db, collectionName), orderBy(documentId()), startAfter(cursor), limit(500))
        : query(collection(db, collectionName), orderBy(documentId()), limit(500));
      const snapshot: QuerySnapshot<DocumentData> = await getDocs(pageQuery);
      donors.push(...snapshot.docs.map(donorFromSnapshot));
      const complete = snapshot.size < 500;
      cb([...donors].sort((a, b) => `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`)), complete);
      if (complete) break;
      cursor = snapshot.docs[snapshot.docs.length - 1];
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  })().catch((error) => { if (!cancelled) onError?.(error instanceof Error ? error : new Error(String(error))); });
  return () => { cancelled = true; };
}

export async function saveFundraisingDonor(donor: Omit<FundraisingDonor, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }, uid?: string, collectionName = 'fundraisingCuratedDonors') {
  const payload = {
    firstName: donor.firstName.trim(), lastName: donor.lastName.trim(), title: donor.title.trim(), middleInitial: donor.middleInitial.trim(), initiatedName: donor.initiatedName.trim(), email: cleanEmail(donor.email), phone: donor.phone.trim(), officePhone: donor.officePhone.trim(),
    normalizedEmail: cleanEmail(donor.email), normalizedPhone: cleanPhone(donor.phone), organization: donor.organization.trim(), address: donor.address.trim(),
    city: donor.city.trim(), state: donor.state.trim(), postalCode: donor.postalCode.trim(), country: donor.country.trim(), homePhone: donor.homePhone.trim(), previousHomePhone: donor.previousHomePhone.trim(),
    phoneVerified: donor.phoneVerified, phoneAppendDate: donor.phoneAppendDate, doNotCall: donor.doNotCall, doNotMail: donor.doNotMail, noMailReason: donor.noMailReason.trim(),
    receiptDelivery: donor.receiptDelivery.trim(), receiptingPreference: donor.receiptingPreference.trim(), pictureUrl: donor.pictureUrl.trim(), picturePath: donor.picturePath.trim(), futurePledge: donor.futurePledge, fiveKAmount: Math.max(0, donor.fiveKAmount),
    spouseName: donor.spouseName.trim(), weddingAnniversary: donor.weddingAnniversary, birthDate: donor.birthDate, spouseBirthDate: donor.spouseBirthDate,
    children: donor.children.slice(0, 5).map((child) => ({ name: child.name.trim(), birthDate: child.birthDate })),
    lastDonationDate: donor.lastDonationDate, lastDonationAmount: Math.max(0, donor.lastDonationAmount),
    biggestDonationDate: donor.biggestDonationDate, biggestDonationAmount: Math.max(0, donor.biggestDonationAmount),
    autoDeductDonationAmount: Math.max(0, donor.autoDeductDonationAmount), autoDeductBillingAmount: Math.max(0, donor.autoDeductBillingAmount),
    monthlyDonor: donor.monthlyDonor, autoDeductPledgeAmount: Math.max(0, donor.autoDeductPledgeAmount),
    autoDeductPledgeStart: donor.autoDeductPledgeStart, autoDeductPledgeRemaining: Math.max(0, donor.autoDeductPledgeRemaining),
    cardLastFour: donor.cardLastFour.replace(/\D/g, '').slice(-4), cardBillingAddress: donor.cardBillingAddress.trim(), cardBillingZip: donor.cardBillingZip.trim(),
    facebookUrl: donor.facebookUrl.trim(), linkedinUrl: donor.linkedinUrl.trim(), twitterHandle: donor.twitterHandle.trim(), websiteUrl: donor.websiteUrl.trim(), gotra: donor.gotra.trim(),
    status: donor.status, tags: donor.tags.map((tag) => tag.trim()).filter(Boolean).slice(0, 20), notes: donor.notes.trim(),
    nextFollowUp: donor.nextFollowUp, assignedTo: donor.assignedTo.trim(), archived: donor.archived,
    updatedAt: serverTimestamp(), updatedBy: uid || null,
  };
  if (donor.id) return updateDoc(doc(db, collectionName, donor.id), payload);
  return addDoc(collection(db, collectionName), { ...payload, createdAt: serverTimestamp(), createdBy: uid || null });
}

export async function uploadFundraisingDonorPicture(dataUrl: string): Promise<{ imageUrl: string; imagePath: string }> {
  return (await httpsCallable<{ dataUrl: string }, { imageUrl: string; imagePath: string }>(functions, 'uploadFundraisingDonorPicture')({ dataUrl })).data;
}

export function subscribeDonorInteractions(cb: (records: DonorContactInteraction[]) => void, onError?: (error: Error) => void) {
  return onSnapshot(collection(db, 'fundraisingDonorInteractions'), (snapshot) => cb(snapshot.docs.map((item) => {
    const data = item.data();
    return { id: item.id, donorId: String(data.donorId || ''), calledAt: firestoreTimestampToDate(data.calledAt), notes: String(data.notes || ''), createdBy: String(data.createdBy || ''), createdAt: data.createdAt ? firestoreTimestampToDate(data.createdAt) : null };
  }).sort((a, b) => Number(b.calledAt) - Number(a.calledAt))), (error) => onError?.(error));
}

export async function addDonorInteraction(donorId: string, calledAt: Date, notes: string, uid?: string) {
  return addDoc(collection(db, 'fundraisingDonorInteractions'), {
    donorId, calledAt, notes: notes.trim(), createdBy: uid || '', createdAt: serverTimestamp(),
  });
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
        id: String(entry.id || ''), firstName: String(entry.firstName || ''), lastName: String(entry.lastName || ''),
        type: ['pledge', 'loan', 'donation'].includes(entry.type) ? entry.type : 'donation', amount: Number(entry.amount) || 0,
        comments: String(entry.comments || ''),
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
        donorFirstName: String(data.donorFirstName || ''), donorLastName: String(data.donorLastName || ''),
        sourceCampaignEntryId: String(data.sourceCampaignEntryId || ''), purpose: String(data.purpose || ''),
        pledgedAmount: Number(data.pledgedAmount) || 0, paidAmount: Number(data.paidAmount) || 0,
        openBalanceKnown: data.openBalanceKnown !== false, openBalanceSource: String(data.openBalanceSource || ''),
        pledgeDate: data.pledgeDate ? firestoreTimestampToDate(data.pledgeDate) : null,
        dueDate: data.dueDate ? firestoreTimestampToDate(data.dueDate) : null,
        nextPaymentDate: data.nextPaymentDate ? firestoreTimestampToDate(data.nextPaymentDate) : null,
        frequency: ['one-time', 'monthly', 'quarterly', 'annual', 'custom'].includes(data.frequency) ? data.frequency : 'one-time',
        status: ['active', 'fulfilled', 'on-hold', 'cancelled'].includes(data.status) ? data.status : ((Number(data.paidAmount) || 0) >= (Number(data.pledgedAmount) || 0) ? 'fulfilled' : 'active'),
        cancellationReason: String(data.cancellationReason || ''), cancelledAt: data.cancelledAt ? firestoreTimestampToDate(data.cancelledAt) : null, cancelledBy: String(data.cancelledBy || ''),
        notes: String(data.notes || ''),
        createdAt: data.createdAt ? firestoreTimestampToDate(data.createdAt) : null,
        updatedAt: data.updatedAt ? firestoreTimestampToDate(data.updatedAt) : null,
      } as FundraisingPledge;
    });
    cb(pledges.sort((a, b) => Number(a.dueDate || new Date(8640000000000000)) - Number(b.dueDate || new Date(8640000000000000))));
  }, (error) => onError?.(error));
}

export async function saveFundraisingPledge(pledge: Omit<FundraisingPledge, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }, uid?: string) {
  const payload = {
    donorId: pledge.donorId, eventId: pledge.eventId,
    donorFirstName: pledge.donorFirstName.trim(), donorLastName: pledge.donorLastName.trim(),
    sourceCampaignEntryId: pledge.sourceCampaignEntryId, purpose: pledge.purpose.trim(),
    pledgedAmount: Math.max(0, pledge.pledgedAmount), paidAmount: Math.max(0, pledge.paidAmount),
    openBalanceKnown: pledge.openBalanceKnown, openBalanceSource: pledge.openBalanceSource.trim(),
    pledgeDate: pledge.pledgeDate, dueDate: pledge.dueDate, nextPaymentDate: pledge.nextPaymentDate,
    frequency: pledge.frequency, status: pledge.status === 'cancelled' ? 'cancelled' : pledge.paidAmount >= pledge.pledgedAmount ? 'fulfilled' : pledge.status,
    cancellationReason: pledge.cancellationReason.trim(), cancelledAt: pledge.cancelledAt, cancelledBy: pledge.cancelledBy,
    notes: pledge.notes.trim(),
    updatedAt: serverTimestamp(), updatedBy: uid || null,
  };
  if (pledge.id) return updateDoc(doc(db, 'fundraisingPledges', pledge.id), payload);
  return addDoc(collection(db, 'fundraisingPledges'), { ...payload, createdAt: serverTimestamp(), createdBy: uid || null });
}

export function subscribeFundraisingPledgePayments(cb: (payments: FundraisingPledgePayment[]) => void, onError?: (error: Error) => void) {
  return onSnapshot(collection(db, 'fundraisingPledgePayments'), (snapshot) => cb(snapshot.docs.map((item) => {
    const data = item.data();
    return {
      id: item.id, pledgeId: String(data.pledgeId || ''), amount: Number(data.amount) || 0,
      receivedAt: firestoreTimestampToDate(data.receivedAt),
      method: ['zelle', 'check', 'cash', 'card', 'bank-transfer', 'other'].includes(data.method) ? data.method : 'other',
      status: ['received', 'deposited', 'cleared'].includes(data.status) ? data.status : 'received',
      receivedBy: String(data.receivedBy || ''), depositedAt: data.depositedAt ? firestoreTimestampToDate(data.depositedAt) : null,
      receiptNumber: String(data.receiptNumber || ''), designation: String(data.designation || ''),
      reference: String(data.reference || ''), comments: String(data.comments || ''),
      createdBy: String(data.createdBy || ''), createdAt: data.createdAt ? firestoreTimestampToDate(data.createdAt) : null,
    } as FundraisingPledgePayment;
  }).sort((a, b) => Number(b.receivedAt) - Number(a.receivedAt))), (error) => onError?.(error));
}

export async function recordFundraisingPledgePayment(input: Omit<FundraisingPledgePayment, 'id' | 'createdAt' | 'createdBy'>, uid: string) {
  const pledgeRef = doc(db, 'fundraisingPledges', input.pledgeId);
  const paymentRef = doc(collection(db, 'fundraisingPledgePayments'));
  await runTransaction(db, async (transaction) => {
    const pledgeSnapshot = await transaction.get(pledgeRef);
    if (!pledgeSnapshot.exists()) throw new Error('Save the pledge before recording a payment.');
    const pledge = pledgeSnapshot.data();
    const pledgedAmount = Number(pledge.pledgedAmount) || 0;
    const paidAmount = Number(pledge.paidAmount) || 0;
    if (pledge.status === 'cancelled') throw new Error('Payments cannot be added to a cancelled pledge.');
    if (input.amount <= 0 || paidAmount + input.amount > pledgedAmount) throw new Error('Payment must be greater than zero and cannot exceed the remaining pledge balance.');
    const newPaidAmount = paidAmount + input.amount;
    transaction.set(paymentRef, { ...input, receivedBy: input.receivedBy.trim(), receiptNumber: input.receiptNumber.trim(), designation: input.designation.trim(), reference: input.reference.trim(), comments: input.comments.trim(), createdBy: uid, createdAt: serverTimestamp() });
    transaction.update(pledgeRef, { paidAmount: newPaidAmount, status: newPaidAmount >= pledgedAmount ? 'fulfilled' : 'active', updatedAt: serverTimestamp(), updatedBy: uid });
  });
}
