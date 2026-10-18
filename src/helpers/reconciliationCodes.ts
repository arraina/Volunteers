import { httpsCallable } from 'firebase/functions';
import { functions } from '../config/firebase';
export async function allocateReconciliationCode(kind: 'pledge' | 'donation' | 'loan', id: string, eventId: string, sourceCampaignEntryId: string): Promise<string> {
  return (await httpsCallable<{ kind: string; id: string; eventId: string; sourceCampaignEntryId: string }, { code: string }>(functions, 'getFundraisingReconciliationCode')({ kind, id, eventId, sourceCampaignEntryId })).data.code;
}
