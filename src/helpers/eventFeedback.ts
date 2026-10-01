import { httpsCallable } from 'firebase/functions';
import { functions } from '../config/firebase';

export async function submitAuthenticatedEventFeedback(input: { eventId: string; rating: number; feedbackText: string; anonymous: boolean }): Promise<void> {
  await httpsCallable<typeof input, { saved: boolean }>(functions, 'submitAuthenticatedEventFeedback')(input);
}
export async function createEventFeedbackShareLink(eventId: string): Promise<{ token: string; expiresAtMillis: number }> {
  return (await httpsCallable<{ eventId: string }, { token: string; expiresAtMillis: number }>(functions, 'createEventFeedbackShareLink')({ eventId })).data;
}
export async function getPublicEventFeedbackForm(token: string): Promise<{ event: { id: string; name: string; dateMillis: number | null }; expiresAtMillis: number }> {
  return (await httpsCallable<{ token: string }, { event: { id: string; name: string; dateMillis: number | null }; expiresAtMillis: number }>(functions, 'getPublicEventFeedbackForm')({ token })).data;
}
export async function submitPublicEventFeedback(input: { token: string; rating: number; feedbackText: string }): Promise<void> {
  await httpsCallable<typeof input, { saved: boolean }>(functions, 'submitPublicEventFeedback')(input);
}
