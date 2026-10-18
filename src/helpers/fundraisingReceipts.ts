import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../config/firebase';
import { firestoreTimestampToDate } from './types';
export interface LoanRepayment { id: string; amount: number; paidDate: string; method: string; reference: string; paidBy: string; notes: string; updatedBy?: string; updatedAt?: string; }
export interface FundraisingReceipt {
  reconciliationCode?: string;
  status?: 'cancelled'; cancellationReason?: string;
  id: string; kind: 'loan' | 'donation'; donorId: string; donorName: string; eventId: string; sourceCampaignEntryId: string;
  amount: number; receivedDate: string; method: string; reference: string; receivedBy: string; designation: string; receiptNumber: string; notes: string;
  dueDate: string; repaymentMode: 'single' | 'installments'; frequency: string; installmentAmount: number; nextRepaymentDate: string; repaidAmount: number; repayments: LoanRepayment[];
  createdAt: Date | null; updatedAt: Date | null;
}
export const blankReceipt = (kind: FundraisingReceipt['kind']): FundraisingReceipt => ({ id: '', kind, donorId: '', donorName: '', eventId: '', sourceCampaignEntryId: '', amount: 0, receivedDate: '', method: 'zelle', reference: '', receivedBy: '', designation: '', receiptNumber: '', notes: '', dueDate: '', repaymentMode: 'single', frequency: 'monthly', installmentAmount: 0, nextRepaymentDate: '', repaidAmount: 0, repayments: [], createdAt: null, updatedAt: null });
export function subscribeReceipts(kind: FundraisingReceipt['kind'], callback: (records: FundraisingReceipt[]) => void, error: (error: Error) => void) {
  return onSnapshot(query(collection(db, 'fundraisingReceipts'), where('kind', '==', kind)), snapshot => callback(snapshot.docs.map(item => { const data = item.data(); return { ...blankReceipt(kind), ...data, id: item.id, createdAt: data.createdAt ? firestoreTimestampToDate(data.createdAt) : null, updatedAt: data.updatedAt ? firestoreTimestampToDate(data.updatedAt) : null } as FundraisingReceipt; })), error);
}
export async function saveReceipt(record: FundraisingReceipt) { return (await httpsCallable<FundraisingReceipt, { id: string }>(functions, 'saveFundraisingReceipt')(record)).data; }
export async function saveLoanRepayment(id: string, payment: LoanRepayment) { await httpsCallable(functions, 'recordFundraisingLoanRepayment')({ ...payment, id, paymentId: payment.id }); }
export async function cancelLoan(id: string, reason: string) { await httpsCallable(functions, 'saveFundraisingReceipt')({ action: 'cancel', id, reason }); }
