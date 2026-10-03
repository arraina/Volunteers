import { httpsCallable } from 'firebase/functions';
import { functions } from '../config/firebase';

export type QuickBooksReportType = 'ProfitAndLoss' | 'BalanceSheet' | 'TransactionList';
export interface QuickBooksStatus { connected: boolean; companyId: string; environment: 'sandbox'; connectedAtMillis: number | null; }

export async function getQuickBooksStatus(): Promise<QuickBooksStatus> {
  const call = httpsCallable<void, QuickBooksStatus>(functions, 'getQuickBooksStatus');
  return (await call()).data;
}

export async function connectQuickBooks(): Promise<void> {
  const call = httpsCallable<void, { authorizationUrl: string }>(functions, 'startQuickBooksOAuth');
  const result = await call(); window.location.assign(result.data.authorizationUrl);
}

export async function getQuickBooksReport(report: QuickBooksReportType, startDate: string, endDate: string): Promise<any> {
  const call = httpsCallable<{ report: QuickBooksReportType; startDate: string; endDate: string }, { report: any; fetchedAtMillis: number }>(functions, 'getQuickBooksReport');
  return (await call({ report, startDate, endDate })).data;
}

export async function disconnectQuickBooks(): Promise<void> {
  const call = httpsCallable<void, { disconnected: boolean }>(functions, 'disconnectQuickBooks'); await call();
}
