import { collection, doc, onSnapshot, query, where, runTransaction, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { firestoreTimestampToDate } from './types';

export interface PledgeFollowUp {
  id: string; pledgeId: string; donorId: string; donorName: string;
  kind: 'task' | 'reminder'; title: string; details: string; dueAt: Date;
  assignedTo: string; status: 'open' | 'completed'; createdBy: string;
}

export function subscribeOpenPledgeFollowUpCount(callback: (count: number) => void, onError: (error: Error) => void) {
  return onSnapshot(query(collection(db, 'fundraisingPledgeFollowUps'), where('status', '==', 'open')),
    snapshot => callback(snapshot.size), onError);
}

export function validateFollowUp(title: string, details: string, dueAt: Date): string {
  if (!title.trim() || title.trim().length > 180) return 'Enter a task title of 1–180 characters.';
  if (details.length > 5000) return 'Keep task details within 5,000 characters.';
  if (!Number.isFinite(dueAt.getTime())) return 'Choose a valid due date and time.';
  return '';
}

export function subscribePledgeFollowUps(pledgeId: string | undefined, callback: (records: PledgeFollowUp[]) => void, onError: (error: Error) => void) {
  const source = collection(db, 'fundraisingPledgeFollowUps');
  return onSnapshot(pledgeId ? query(source, where('pledgeId', '==', pledgeId)) : source, (snapshot) => callback(snapshot.docs.map((item) => {
    const data = item.data();
    return { ...data, id: item.id, dueAt: firestoreTimestampToDate(data.dueAt) } as PledgeFollowUp;
  }).sort((a, b) => Number(a.dueAt) - Number(b.dueAt))), onError);
}

export async function savePledgeFollowUp(input: Omit<PledgeFollowUp, 'createdBy' | 'status'>, uid: string) {
  const validation = validateFollowUp(input.title, input.details, input.dueAt);
  if (validation) throw new Error(validation);
  const ref = input.id ? doc(db, 'fundraisingPledgeFollowUps', input.id) : doc(collection(db, 'fundraisingPledgeFollowUps'));
  await runTransaction(db, async (transaction) => {
    const pledge = await transaction.get(doc(db, 'fundraisingPledges', input.pledgeId));
    const existing = input.id ? await transaction.get(ref) : null;
    if (!pledge.exists() || pledge.data().donorId !== input.donorId) throw new Error('Save the pledge and link its donor before creating follow-ups.');
    if (pledge.data().status === 'cancelled') throw new Error('New or edited follow-ups are not allowed on a cancelled pledge.');
    if (input.id && (!existing?.exists() || existing.data().pledgeId !== input.pledgeId)) throw new Error('The follow-up could not be found for this pledge.');
    const payload = { pledgeId: input.pledgeId, donorId: input.donorId, donorName: input.donorName, kind: input.kind, title: input.title.trim(), details: input.details.trim(), dueAt: input.dueAt, assignedTo: input.assignedTo.trim(), updatedBy: uid, updatedAt: serverTimestamp() };
    if (existing) transaction.update(ref, payload);
    else transaction.set(ref, { ...payload, status: 'open', createdBy: uid, createdAt: serverTimestamp(), completedAt: null });
  });
}

export async function setPledgeFollowUpStatus(record: PledgeFollowUp, completed: boolean, uid: string) {
  await updateDoc(doc(db, 'fundraisingPledgeFollowUps', record.id), { status: completed ? 'completed' : 'open', completedAt: completed ? serverTimestamp() : null, updatedBy: uid, updatedAt: serverTimestamp() });
}
