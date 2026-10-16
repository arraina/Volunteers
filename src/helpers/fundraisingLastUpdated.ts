import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../config/firebase';
import { firestoreTimestampToDate } from './types';
export { compareOptionalDates, recordLastUpdated } from './fundraisingLastUpdatedUtils';

export type FundraisingLastUpdatedMap = Record<string, Date>;

export function subscribeFundraisingLastUpdated(
  targetCollection: 'fundraisingPledges' | 'fundraisingReceipts',
  callback: (dates: FundraisingLastUpdatedMap) => void,
  onError?: (error: Error) => void,
) {
  return onSnapshot(query(collection(db, 'fundraisingAuditLogs'), where('targetCollection', '==', targetCollection)), (snapshot) => {
    const dates: FundraisingLastUpdatedMap = {};
    snapshot.docs.forEach((record) => {
      const data = record.data();
      if (!data.targetId || !data.occurredAt) return;
      const occurredAt = firestoreTimestampToDate(data.occurredAt);
      if (!Number.isFinite(occurredAt.getTime())) return;
      const previous = dates[String(data.targetId)];
      if (!previous || occurredAt > previous) dates[String(data.targetId)] = occurredAt;
    });
    callback(dates);
  }, (cause) => onError?.(cause));
}
